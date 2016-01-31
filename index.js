#! /usr/bin/env node
/* eslint camelcase: 0 */ // <-- Per Jupyter message spec
/* eslint spaced-comment: 0 */

/*****************************************************************************
 * Ick is an interactive console for tinkering with the Jupyter message spec *
 * and a backing kernel.                                                     *
 *****************************************************************************/

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
  // const iopub = enchannel.createIOPubSubject(identity, kernel);
  const shell = enchannel.createShellSubject(identity, c.config);
  // const control = enchannel.createControlSubject(identity, kernel);
  // const stdinChannel = enchannel.createStdinSubject(identity, kernel);

  function createMessage(session, msg_type) {
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

  const sessionID = uuid.v4();

  function isChildMessage(msg) {
    return this.header.msg_id === msg.parent_header.msg_id;
  }

  function startREPL(langInfo) {
    const rl = readline.createInterface(process.stdin, process.stdout);
    const iopub = enchannel.createIOPubSubject(identity, c.config);

    marked.setOptions({
      renderer: new TerminalRenderer(),
    });

    rl.setPrompt(`ick${langInfo.file_extension}> `);
    rl.prompt();

    rl.on('line', (line) => {
      const executeRequest = createMessage(sessionID, 'execute_request');
      executeRequest.content = {
        code: line,
        silent: false,
        store_history: true,
        user_expressions: {},
        allow_stdin: false,
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

      const executeReply = childMessages
                             .filter(msg => msg.header.msg_type === 'execute_reply')
                             .map(msg => msg.content);

      const streamReply = childMessages
                             .filter(msg => msg.header.msg_type === 'stream')
                             .map(msg => msg.content);

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

      executeReply.subscribe(content => {
        rl.setPrompt(`ick${langInfo.file_extension}:${content.execution_count}> `);
        rl.prompt();
      });

      shell.send(executeRequest);

    }).on('close', () => {
      console.log('Have a great day!');
      shell.close();
      iopub.close();
      process.stdin.destroy();
    });
  }

  const kernelInfoRequest = createMessage(sessionID, 'kernel_info_request');
  const kernelReply = shell.filter(msg => msg.parent_header.msg_id === kernelInfoRequest.header.msg_id)
                           .map(msg => msg.content);

  kernelReply.subscribe(content => {
    process.stdout.write(chalk.green(content.banner));
    startREPL(content.language_info);
  });
  shell.send(kernelInfoRequest);
}

const kernelName = process.argv[2];

spawnteract.launch(kernelName).then(main);
