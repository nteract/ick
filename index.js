#! /usr/bin/env node
/* eslint camelcase: 0 */ // <-- Per Jupyter message spec
/* eslint spaced-comment: 0 */

/*****************************************************************************
 * Ick is an interactive console for tinkering with the Jupyter message spec *
 * and a backing kernel.                                                     *
 *****************************************************************************/

const Rx = require('@reactivex/rxjs');

const readline = require('readline');

const enchannel = require('enchannel-zmq-backend');
const uuid = require('uuid');
const chalk = require('chalk');

const marked = require('marked');
const TerminalRenderer = require('marked-terminal');

const temp = require('temp').track();
const imageToAscii = require('image-to-ascii');

const fs = require('fs');
const spawnteract = require('spawnteract');

function main(c) {
  const identity = uuid.v4();
  const shell = enchannel.createShellSubject(identity, c.config);
  const stdin = enchannel.createStdinSubject(identity, c.config);

  const session = uuid.v4();

  function createMessage(msg_type) {
    const username = process.env.LOGNAME || process.env.USER ||
                     process.env.LNAME || process.env.USERNAME;
    return {
      header: {
        username,
        session,
        msg_type,
        msg_id: uuid.v4(),
        date: new Date(),
        version: '5.0',
      },
      metadata: {},
      parent_header: {},
      content: {},
    };
  }

  function isChildMessage(msg) {
    return this.header.msg_id === msg.parent_header.msg_id;
  }

  function startREPL(langInfo) {
    const rl = readline.createInterface(process.stdin, process.stdout, (line, callback) => {
      const completeRequest = createMessage('complete_request');
      completeRequest.content = {
        code: line,
        cursor_pos: line.length,
      };

      const childMessages = shell.filter(isChildMessage.bind(completeRequest));

      const completeReply = childMessages
                              .filter(msg => msg.header.msg_type === 'complete_reply')
                              .map(msg => msg.content);

      completeReply.subscribe(content => {
        callback(null, [content.matches, line]);
      });

      shell.next(completeRequest);
    });

    const iopub = enchannel.createIOPubSubject(identity, c.config);

    marked.setOptions({
      renderer: new TerminalRenderer(),
    });

    var counter = 1;

    rl.setPrompt(chalk.blue(`ick${langInfo.file_extension}:${counter}> `));
    rl.prompt();

    // Instantiate a string buffer for accumulating incomplete code strings
    var buffer = "";

    rl.on('line', (line) => {
      const isCompleteRequest = createMessage('is_complete_request');
      isCompleteRequest.content = {
        code: buffer || line
      };
      const isCompleteReply = shell.filter(isChildMessage.bind(isCompleteRequest))
                              .filter(msg => msg.header.msg_type === 'is_complete_reply')
                              .map(msg => msg.content);

      isCompleteReply.subscribe(content => {
        if (content.status === 'complete' || content.status === 'invalid') {
          const executeRequest = createMessage('execute_request');
          executeRequest.content = {
            code: buffer || line,
            silent: false,
            store_history: true,
            user_expressions: {},
            allow_stdin: true,
            stop_on_error: false,
          };

          const childMessages = iopub.filter(isChildMessage.bind(executeRequest))
                                     .publish()
                                     .refCount();

          const displayData = childMessages
                                  .filter(msg => msg.header.msg_type === 'execute_result' ||
                                                 msg.header.msg_type === 'display_data')
                                  .filter(msg => msg.content)
                                  .map(msg => msg.content.data);

          const executeResult = childMessages.filter(msg => msg.header.msg_type === 'execute_result')
                                  .map(msg => msg.content);

          const executeInput = childMessages
                                 .filter(msg => msg.header.msg_type === 'execute_input')
                                 .map(msg => msg.content);

          const executeReply = childMessages
                                 .filter(msg => msg.header.msg_type === 'execute_reply')
                                 .map(msg => msg.content);

          const status = childMessages.filter(msg => msg.header.msg_type === 'status')
                              .map(msg => msg.content.execution_state);

          const streamReply = childMessages
                                 .filter(msg => msg.header.msg_type === 'stream')
                                 .map(msg => msg.content);

          const errorReplies = childMessages
                                .filter(msg => msg.header.msg_type === 'error')
                                .map(msg => msg.content);

          const errorStream = Rx.Observable
            .merge(errorReplies, executeReply.filter(x => x.status === 'error'));

          errorStream.subscribe(err => {
            process.stdout.write(`${err.ename}: ${err.evalue}\n`);
            process.stdout.write(err.traceback.join('\n'));
          });

          streamReply.subscribe(content => {
            switch(content.name) {
              case 'stdout':
                process.stdout.write(content.text);
                break;
              case 'stderr':
                process.stderr.write(content.text);
                break;
            }
          });

          displayData.subscribe(data => {
            if(data['image/png']) {
              temp.open('ick-image', (err, info) => {
                if (err) {
                  console.error(err);
                  return;
                }
                const decodedData = new Buffer(data['image/png'], 'base64');
                const writer = fs.createWriteStream(info.path);
                writer.end(decodedData);
                writer.on('finish', () => {
                  imageToAscii(info.path, (imErr, converted) => {
                    console.log(imErr || converted);
                  });
                });
              });
            }
            else if(data['text/markdown']) {
              console.log(marked(data['text/markdown']));
            }
            else if(data['text/plain']) {
              console.log(data['text/plain']);
            }
          });

          Rx.Observable.merge(executeResult, executeReply, executeInput)
                       .map(content => content.execution_count)
                       .take(1)
                       .subscribe(ct => {
                         counter = ct + 1;
                       });

          status.filter(x => x === 'idle')
            .subscribe(() => {
              rl.setPrompt(chalk.blue(`ick${langInfo.file_extension}:${counter}> `));
              rl.prompt();
            }, console.error);

          const stdinResponseMsgs = stdin
                                       .filter(isChildMessage.bind(executeRequest))
                                       .publish()
                                       .refCount();

          const inputRequests = stdinResponseMsgs
                                   .filter(msg => msg.header.msg_type === 'input_request')
                                   .map(msg => msg.content);

          inputRequests.subscribe(msg => {
            rl.question(chalk.green(msg.prompt), response => {
              const inputReply = createMessage('input_reply');
              inputReply.content = {
                value: response,
              };
              stdin.next(inputReply);
            });
          });

          // Clear the buffer
          buffer = "";
          shell.next(executeRequest);
        } else {
          buffer += line;
        }
      });

      shell.next(isCompleteRequest);
    }).on('close', () => {
      console.log('Have a great day!');
      c.spawn.kill();
      shell.complete();
      iopub.complete();
      stdin.complete();
      process.stdin.destroy();
      fs.unlink(c.connectionFile);
    });
  }

  const kernelInfoRequest = createMessage('kernel_info_request');
  const kernelReply = shell.filter(msg => msg.parent_header.msg_id === kernelInfoRequest.header.msg_id)
                           .map(msg => msg.content);

  kernelReply.subscribe(content => {
    process.stdout.write(chalk.gray(content.banner));
    startREPL(content.language_info);
  });
  shell.next(kernelInfoRequest);
}

const kernelName = process.argv[2];

spawnteract.launch(kernelName)
           .then(main)
           .catch(e => {
             console.error(e);
           });
