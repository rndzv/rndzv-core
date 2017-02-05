/**
 * @module kad/simulation
 */

'use strict';

var DHTNode = require('..');
var faker = require('faker');
const path = require('path');
const fs = require('fs');
const os = require('os');
const encrypt = require('kad-encrypt');

var NUM_NODES = 2;

// Let simulation runners specify the number of nodes they would like to
// create for the simulation.
if (!Number.isNaN(Number(process.argv[2]))) {
  NUM_NODES = Number(process.argv[2]);
}

// Try to set the interval at which the simulation sends STORE messages
// to a value somewhat consistent with the number of node in the simulation
// to throttle the messages (since we are running in a single thread).
var STORE_INTERVAL = NUM_NODES * 1000;

// Start at the highest available port and count down for the number of nodes
// in the simulation.
var created = 0;
var nodes = [];
var port = 65535;
var seed = [];

// Create the number of nodes specified for the simulation and stick them into
// an array so we can connect them to one another.
while (created < NUM_NODES) {
  let keypair = new encrypt.KeyPair();
  var node = new DHTNode({
    address: '127.0.0.1',
    port: port-created,
    privateKey: keypair.getPrivateKey(),
    ipc: path.join(os.tmpdir(), `dhtnode${created}.sock`),
    logger:3,
    logLabel: `DHTNode${created}`,
    seeds:seed
  });
  seed=[{
    address: '127.0.0.1',
    port: port-created,
    pubkey: keypair.getPublicKey()
  }]
  nodes.push(node);
  created++;
}

setInterval(function() {
  let node=nodes[0];
  let key = faker.random.uuid();
  let value = faker.hacker.phrase();
  node.putItem(key, value, function() {
    node.getItem(key, function(error, value) {
      console.log('got phrase: %s',value);
    });
  });
}, STORE_INTERVAL);
