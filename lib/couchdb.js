var urlParser = require('url');
var utils = require('./utils');
var http = require('http');
var fs = require('fs');
var path = require('path');
var querystring = require('querystring');

exports.version = "1.0.1";

function CouchDB(connectionString) {
	if (connectionString[connectionString.length - 1] != '/')
		connectionString += '/';

	this.uri = urlParser.parse(connectionString);
};

// ======================================================
// FUNCTIONS
// ======================================================

function parseJSON(value) {
	var c = value[0];
	if (c === '{' || c === '[' || c === '"')
		return JSON.parse(value);
	return {};
};

function toParams(obj) {

	if (typeof(obj) === 'undefined' || obj === null)
		return '';

	var buffer = [];
	var arr = Object.keys(obj);
	
	arr.forEach(function(o) {

		var value = obj[o];
		var name = o.toLowerCase();

		switch (name) {
			case 'skip':
			case 'limit':
			case 'descending':
			case 'reduce':
			case 'group':
			case 'stale':
				buffer.push(name + '=' + value.toString().toLowerCase());
				break;
			case 'group_level':
			case 'grouplevel':
				buffer.push('group_level=' + value);
				break;
			case 'update_seq':
			case 'updateseq':
				buffer.push('update_seq=' + value.toString().toLowerCase());
				break;
			case 'include_docs':
			case 'includedocs':
				buffer.push('include_docs=' + value.toString().toLowerCase());
				break;
			case 'inclusive_end':
			case 'inclusiveend':
				buffer.push('inclusive_end=' + value.toString().toLowerCase());
				break;
			case 'key':
			case 'keys':
			case 'startkey':
			case 'endkey':
				buffer.push(name + '=' + encodeURIComponent(JSON.stringify(value)));
				break;
			default:
				buffer.push(name + '=' + encodeURIComponent(value));
				break;
		};
	});

	return '?' + buffer.join('&');
};

// ======================================================
// PROTOTYPES
// ======================================================

CouchDB.prototype.connect = function(path, method, data, params, callback) {

	var self = this;

	if (path[0] === '/')
		path = path.substring(1);

	var uri = self.uri;
	var type = typeof(data);
	var isObject = type === 'object' || type === 'array';

	var headers = {};

	headers['Content-Type'] = isObject ? 'application/json' : 'text/plain';

	var location = '';

	if (path[0] === '#')
		location = path.substring(1);
	else
		location = uri.pathname + path;

	var options = { protocol: uri.protocol, auth: uri.auth, method: method || 'GET', hostname: uri.hostname, port: uri.port, path: location + toParams(params), agent:false, headers: headers };

	var response = function (res) {
		var buffer = [];

		res.on('data', function(chunk) {
			buffer.push(chunk.toString('utf8'));
		})

		res.on('end', function() {
			callback(parseJSON(buffer.join('')));
		});
	};

	var req = callback ? http.request(options, response) : http.request(options);

	if (isObject)
		req.end(JSON.stringify(data));
	else
		req.end();
};

CouchDB.prototype.compactDatabase = function(cb) {
	this.connect('_compact', 'POST', null, null, cb);
};

CouchDB.prototype.compactViews = function(cb) {
	this.connect('_compact/views', 'POST', null, null, cb);
};

CouchDB.prototype.cleanupViews = function(cb) {
	this.connect('_view_cleanup', 'POST', null, null, cb);
};	

CouchDB.prototype.view = function(namespace, name, params, cb) {
	this.connect('_design/' + namespace + '/_view/' + name, 'GET', null, params, cb);
};

CouchDB.prototype.list = function(namespace, name, params, cb) {
	this.connect('_design/' + namespace + '/_list/' + name, 'GET', null, params, cb);
};

CouchDB.prototype.show = function(namespace, name, params, cb) {
	this.connect('_design/' + namespace + '/_show/' + name, 'GET', null, params, cb);
};

CouchDB.prototype.find = function(id, revs, cb) {

	if (typeof(revs) === 'function') {
		cb = revs;
		revs = false;
	}

	this.connect(id, 'GET', null, { revs_info: revs }, cb);
};

CouchDB.prototype.all = function(params, cb) {
	this.connect('_all_docs', 'GET', null, params, cb);
};

CouchDB.prototype.changes = function(params, cb) {
	this.connect('_changes', 'GET', null, params, cb);
};

CouchDB.prototype.query = function(funcMap, funcReduce, params, cb) {

	var obj = {
		language: 'javascript',
		map: funcMap.toString()
	};

	if (arguments.length === 2) {
		cb = params;
		params = funcReduce;
		funcReduce = null;
	};

	if (arguments.length === 1) {
		cb = funcReduce;
		funcReduce = null;
	}

	if (funcReduce != null)
		obj.reduce = funcReduce.toString();

	this.connect('_temp_view', 'POST', obj, params, cb);
};

CouchDB.prototype.insert = function(doc, cb) {
	this.connect('', 'POST', doc, null, cb);
};

CouchDB.prototype.update = function(doc, cb) {

	if (!doc._id && cb) {
		cb(doc);
		return;
	}

	this.connect(doc._id, 'PUT', doc, null, cb)
};

CouchDB.prototype.request = function(path, method, obj, params, cb) {
	if (path[0] === '/')
		path = path.substring(1);
	
	this.connect(path, method, obj, params, cb);
};

CouchDB.prototype.delete = function(doc, cb) {

	if (!doc._id && cb) {
		cb(doc);
		return;
	}

	this.connect(doc._id, 'DELETE', doc, null, cb)
};

CouchDB.prototype.deleteAttachment = function(doc, fileName, cb) {

	if (!doc._id || !doc._rev) {
		cb && cb({});
		return;
	}

	this.connect(doc._id + '/' + fileName, 'DELETE', null, { rev: doc._rev }, cb);
};

CouchDB.prototype.bulk = function(arr, cb) {
	this.connect('_bulk_docs', 'POST', { docs: arr }, null, cb);
};

CouchDB.prototype.attachment = function(docOrId, fileName, response) {

	var self = this;
	var uri = self.uri;
	var id = typeof(docOrId) === 'object' ? docOrId._id : docOrId;
	var options = { protocol: uri.protocol, auth: uri.auth, hostname: uri.hostname, port: uri.port, path: location = uri.pathname + id + '/' + fileName, agent:false };

    http.get(options, function(res) {
		res.setEncoding('binary');
        var data = '';

        res.on('data', function(chunk){
            data += chunk.toString();
        });
        
        res.on('end', function() {
        	if (typeof(response) === 'function') {
        		response(new Buffer(data, 'binary'));
        	} else {
    	    	response.isFlush = true;
				response.writeHead(200, { 'Content-Type': res.headers['content-type'] });
				response.end(data, 'binary');
			}
        });
    });
};

CouchDB.prototype.upload = function(docOrId, fileName, fileSave, cb) {

	var self = this;
	var uri = self.uri;
	var id = typeof(docOrId) === 'object' ? docOrId._id : docOrId;
	var name = path.basename(fileSave)
	var extension = path.extname(fileName);
	var headers = {};

	headers['Cache-Control'] = 'max-age=0';
	headers['Content-Type'] = utils.getContentType(extension);
	headers['Host'] = uri.host;
	headers['Referer'] = uri.protocol + '//' + uri.host + uri.pathname + id;

	var options = { protocol: uri.protocol, auth: uri.auth, method: 'PUT', hostname: uri.hostname, port: uri.port, path: location = uri.pathname + id + '/' + name, agent:false, headers: headers };

	var response = function (res) {
		var buffer = [];

		res.on('data', function(chunk) {
			buffer.push(chunk.toString('utf8'));
		})

		res.on('end', function() {
			cb(parseJSON(buffer.join('')));
		});
	};

	var req = cb ? http.request(options, response) : http.request(options);
	fs.createReadStream(fileName).pipe(req);
};	

CouchDB.prototype.uuids = function(max, cb) {
	
	if (typeof(max) === 'function') {
		cb = max;
		max = 10;
	}

	this.connect('#/_uuids?count=' + (max || 10), 'GET', null, null, cb);
};

// ======================================================
// EXPORTS
// ======================================================

exports.init = function(connectionString) {
	return new CouchDB(connectionString);
};