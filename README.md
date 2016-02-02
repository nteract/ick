# Interactive Console Experiments

![ick inline](https://cloud.githubusercontent.com/assets/836375/12740688/2ddc457e-c93b-11e5-811a-cf965490daac.png)

`ick` is an interactive console for Jupyter written in node.js.

## Installation

Make sure you have [zmq headers for your platform, following the instructions from enchannel-zmq-backend.](https://github.com/nteract/enchannel-zmq-backend#zeromq-dependency).

```
npm install -g ick
```

## Running

```
ick <kernelName>
```

### Example

```
$ ick python3
Python 3.5.1 (default, Dec  7 2015, 21:59:08)
Type "copyright", "credits" or "license" for more information.

IPython 4.0.0 -- An enhanced Interactive Python.
?         -> Introduction and overview of IPython's features.
%quickref -> Quick reference.
help      -> Python's own help system.
object?   -> Details about 'object', use 'object??' for extra details.
%guiref   -> A brief reference about the graphical user interface.
ick.py> 243
243
ick.py> 
```
