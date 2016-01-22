# Interactive Console Experiments

`ick` is an interactive console for Jupyter written in node.js.

This was put together to explore how to use `enchannel-zmq-backend` in an
interactive terminal.

## Installation

Make sure you have zmq headers for your platform, build tools, yada yada.
(Editor's Note: Surely there's a more substantive way to express this.)

```
npm install -g ick
```

:warning: This is full of bugs! Files aren't cleaned up yet! :warning:

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
