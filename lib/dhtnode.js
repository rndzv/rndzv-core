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
const spartacus = require('kad-spartacus');
const telemetry = require('kad-telemetry');
const traverse = require('kad-traverse');

/**
 * My Node implementation
 * @constructor
 * @param {String} datadir
 */
function DHTNode(datadir) {
  if (!(this instanceof DHTNode)) {
    return new DHTNode(datadir);
  }

  this._datadir = path.join(process.env.HOME, '.dhtnode') || datadir;
  this._options = this._getConfig(this._datadir);
  this._keypair = new spartacus.KeyPair(
    fs.readFileSync(path.join(this._datadir, 'id_ecdsa')).toString()
  );

  this.logger = new kad.Logger(this._options.logger, 'DHTNode');

  this.storage = new kad.storage.FS(path.join(this._datadir, 'data'));

  this.contact = new DHTNode.Contact({
    address: this._options.address,
    port: this._options.port,
    pubkey: this._keypair.getPublicKey()
  });

  this.transport = new DHTNode.Transport(this.contact, {
    telemetry: {
      filename: path.join(this._datadir, 'telemetry.dat')
    },
    traverse: {
      upnp: { forward: this._options.port, ttl: 0 }
    },
    logger: this.logger
  });

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

  this.transport.on('ready', this._enterNetwork.bind(this));
  this.transport.before('serialize', spartacus.hooks.sign(this._keypair));
  this.transport.before('receive', spartacus.hooks.verify(this._keypair));
}

DHTNode.DEFAULTS = {
  address: '127.0.0.1',
  port: 52398,
  logger: 4,
  ipc: path.join(os.tmpdir(), 'dhtnode.sock'),
  seeds: [{
    address: '159.203.84.67',
    port: 52398,
    pubkey: '031eb255e9dd9d41419d96b155b8124d6fcb9fc8dc527d9f8376c938810b4e6a67'
  }]
};

DHTNode.Transport = telemetry.TransportDecorator(
  traverse.TransportDecorator(kad.transports.UDP)
);

DHTNode.Contact = spartacus.ContactDecorator(
  kad.contacts.AddressPortContact
);

DHTNode.Router = telemetry.RouterDecorator(kad.Router);

DHTNode.Validator = function(key, value, callback) {
  //always valid right now
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
  let keyPath = path.join(this._datadir, 'id_ecdsa');
  let dataPath = path.join(datadir, 'data');

  if (!fs.existsSync(datadir)) {
    mkdirp.sync(datadir);
  }

  if (!fs.existsSync(dataPath)) {
    mkdirp.sync(dataPath);
  }

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DHTNode.DEFAULTS, null, 2));
  }

  if (!fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, spartacus.KeyPair().getPrivateKey());
  }

  return merge(Object.create(DHTNode.DEFAULTS), require(configPath));
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

  async.each(this._options.seeds, function(contact, done) {
    self.node.connect(contact, done);
  }, function(err) {
    if (err) {
      self.logger.error(err.message);
    }
  });
};

module.exports = DHTNode;
