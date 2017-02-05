/**
 * @class DHTNode
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const mkdirp = require('mkdirp');
const merge = require('merge');
const async = require('async');
const dnode = require('dnode');

const kad = require('kad');
const encrypt = require('kad-encrypt');

const DefaultConfig = {
  address: '127.0.0.1',
  port: 52398,
  logger: 4,
  ipc: path.join(os.tmpdir(), 'dhtnode.sock'),
  logLabel: 'DHTNode'
};

/**
 * DHT Node implementation
 * @constructor
 * @param {String} config datadir OR
 */
function DHTNode(config) {
  if (!(this instanceof DHTNode)) {
    return new DHTNode(config);
  }

  if (config && (typeof(config)==='object')) {
    this._options = merge(Object.create(DefaultConfig),config)
    this._keypair = new encrypt.KeyPair(config.privateKey);
    this.storage = kad.storage.MemStore()
  } else {
    let datadir = config || path.join(process.env.HOME, '.dhtnode');
    console.log('connecting to dir %s',datadir);
    this._options = this._getConfig(datadir);
    this._keypair = new encrypt.KeyPair(
      fs.readFileSync(path.join(datadir, 'id_ecdsa')).toString()
    );
    this.storage = new kad.storage.FS(path.join(datadir, 'data'));
  }

  this.logger = new kad.Logger(this._options.logger, this._options.logLabel);

  this.contact = new DHTNode.Contact({
    address: this._options.address,
    port: this._options.port,
    privateKey: this._keypair.getPrivateKey()
  });

  this.transport = new DHTNode.Transport(this.contact, {
    logger: this.logger
  });

  this.logger.debug('my public key: %s',this._keypair.getPublicKey())

  this.router = new DHTNode.Router({
    transport: this.transport,
    logger: this.logger,
    validator: DHTNode.Validator
  });

  this.node = new kad.Node({
    transport: this.transport,
    storage: this.storage,
    router: this.router,
    logger: this.logger,
    validator: DHTNode.Validator
  });

  this.ipc = this._startIpcServer();

  let that=this;
  function logMessage(a,next) {
    that.logger.info("message: "+JSON.stringify(a))
    next();
  }

  this.transport.on('ready', this._enterNetwork.bind(this));
  this.transport.before('send', encrypt.hooks.verify);

  // handle errors from RPC
  this.transport.on('error', function(err) {
    logger.warn('RPC error raised, reason: %s', err.message);
  });
}

DHTNode.Transport = encrypt.transports.UDP

DHTNode.Contact = encrypt.ContactDecorator(
  kad.contacts.AddressPortContact
);

DHTNode.Router = kad.Router;

DHTNode.Validator = function(key, value, callback) {
  //always valid right now
  console.log('validate: %s',value);
  callback(true);
};

/**
 * Returns status information
 * #getInfo
 * @param {Function} callback
 */
DHTNode.prototype.getInfo = function(callback) {
  return callback(null, {
    version: pkginfo.version
  });
};


/**
 * Returns peers close to the given key
 * #getPeers
 * @param {String} key
 * @param {Number} limit
 * @param {Function} callback
 */
DHTNode.prototype.getPeers = function(key, limit, callback) {
  var peers = [];

  try {
    peers = this.router.getNearestContacts(key, limit, this.contact.nodeID);
  } catch (err) {
    return callback(err);
  }

  callback(null, peers);
};

/**
 * Fetch an item from the DHT
 * #getItem
 * @param {String} key
 * @param {Function} callback
 */
DHTNode.prototype.getItem = function(key, callback) {
  return this.node.get(key, callback);
};

/**
 * Store an item in the DHT
 * #putItem
 * @param {Buffer} key
 * @param {Buffer} value
 * @param {Function} callback
 */
DHTNode.prototype.putItem = function(key, value, callback) {
  return this.node.put(
    key,
    value,
    callback
  );
};

/**
 * Takes the datadir and returns config; creates dir and config if needed
 * #_getConfig
 * @param {String} datadir
 */
DHTNode.prototype._getConfig = function(datadir) {
  let configPath = path.join(datadir, 'config.json');
  let keyPath = path.join(datadir, 'id_ecdsa');
  let dataPath = path.join(datadir, 'data');

  if (!fs.existsSync(datadir)) {
    mkdirp.sync(datadir);
  }

  if (!fs.existsSync(dataPath)) {
    mkdirp.sync(dataPath);
  }

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DefaultConfig, null, 2));
  }

  if (!fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, encrypt.KeyPair().getPrivateKey());
  }

  return merge(Object.create(DefaultConfig), require(configPath));
};

/**
 * Exposes the API over a Dnode-based Unix socket
 * #_startIpcServer
 */
DHTNode.prototype._startIpcServer = function() {
  var server = dnode({
    getinfo:   this.getInfo.bind(this),
    getpeers:  this.getPeers.bind(this),
    getitem:   this.getItem.bind(this),
    putitem:   this.putItem.bind(this),
  }, {
    weak: false
  });

  if (fs.existsSync(this._options.ipc)) {
    fs.unlinkSync(this._options.ipc);
  }

  this.logger.info('ipc interface exposed at %s', this._options.ipc);

  return server.listen(this._options.ipc);
};

/**
 * Connects to the supplied seeds
 * #_enterNetwork
 */
DHTNode.prototype._enterNetwork = function() {
  var self = this;
  console.log("entering network")

  async.each(this._options.seeds, function(contact, done) {
    self.node.connect(contact, done);
  }, function(err) {
    if (err) {
      self.logger.error(err.message);
    }
  });
};

module.exports = DHTNode;
