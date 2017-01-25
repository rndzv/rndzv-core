/**
 * @module kad/simulation
 */

'use strict';

var DHTNode = require('..');
var faker = require('faker');
const path = require('path');
const fs = require('fs');
const os = require('os');
const spartacus = require('kad-spartacus');

var NUM_NODES = 6;

// Let simulation runners specify the number of nodes they would like to
// create for the simulation.
if (!Number.isNaN(Number(process.argv[2]))) {
  NUM_NODES = Number(process.argv[2]);
}

// Try to set the interval at which the simulation sends STORE messages
// to a value somewhat consistent with the number of node in the simulation
// to throttle the messages (since we are running in a single thread).
var STORE_INTERVAL = NUM_NODES * 10;

// Start at the highest available port and count down for the number of nodes
// in the simulation.
var created = 0;
var nodes = [];
var port = 65535;
var seed = [];

// Create the number of nodes specified for the simulation and stick them into
// and array so we can connect them to one another.
while (created < NUM_NODES) {
  let keypair = new spartacus.KeyPair();
  var node = new DHTNode({
    address: '127.0.0.1',
    port: port-created,
    privateKey: keypair.getPrivateKey(),
    ipc: path.join(os.tmpdir(), `dhtnode${created}.sock`),
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
