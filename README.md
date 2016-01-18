# Interactive Console Experiments

`ick` is an interactive console for Jupyter written in node.js.

This was put together to explore how to use `enchannel-zmq-backend` in an
interactive terminal.

## Development

* Clone this repository
* `npm install`
* Install jupyter-console `pip install jupyter-console`
* Launch `jupyter console`
* Type `%connect_info` into your jupyter console, grab the path to the kernel-XXXX.json
* Run `node index.js /path/to/your/kernel-XXXX.json`
