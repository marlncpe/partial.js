var framework = require('partial.js');
var http = require('http');

var port = 8004;

// static cache works in release mode
var debug = false;

framework.run(http, debug, port);
console.log("http://127.0.0.1:{0}/".format(port));