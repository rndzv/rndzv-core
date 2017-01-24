'use strict';

const path = require('path');
const forever = require('forever');
const Monitor = require('forever-monitor').Monitor;
const config = process.argv[2] || path.join(process.env.HOME, '.dhtnode');

const dhtnode = new Monitor(path.join(__dirname, '_dhtnode.js'), {
  pidFile: path.join(config, 'dhtnode.pid'),
  uid: 'dhtnode',
  args: [config],
  logFile: path.join(config, 'dhtnode.log'),
});

forever.startServer(dhtnode);
dhtnode.start();
