#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const logger = require('kad').Logger(4, 'dhtnode');
const pkginfo = require('../package');
const forever = require('forever');
const program = require('commander');

function checkRunning(callback) {
  forever.list(false, function(err, list) {
    if (!list) {
      return callback(null, null);
    }

    for (let p = 0; p < list.length; p++) {
      if (list[p].uid === 'dhtnodemon') {
        return callback(list[p], p);
      }
    }

    callback(null, null);
  });
}

program.version(pkginfo.version);
program.option(
  '-c, --config [path]',
  'specify the dhtnode data directory',
  path.join(process.env.HOME, '.dhtnode')
);

program.command('start')
.description('connect the dhtnode service to the network')
.action(function start() {
  console.log('config: '+program.config)
  if (!fs.existsSync(program.config)) {
    mkdirp.sync(program.config);
  }

  checkRunning(function(proc) {
    if (!proc) {
      logger.info('starting dhtnode service...');
      forever.startDaemon(path.join(__dirname, '_monitor.js'), {
        pidFile: path.join(program.config, 'dhtnodemon.pid'),
        uid: 'dhtnodemon',
        args: [program.config],
        logFile: path.join(program.config, 'dhtnodemon.log'),
      });
    } else {
      logger.error('dhtnode service is already running');
    }
  });
});

program.command('restart')
.description('restart the dhtnode service')
.action(function restart() {
  checkRunning(function(proc, i) {
    if (proc) {
      logger.info('stopping dhtnode service...');
      forever.stop(i).on('stop', function() {
        logger.info('starting dhtnode service...');
        forever.startDaemon(path.join(__dirname, '_monitor.js'), {
          pidFile: path.join(program.config, 'dhtnodemon.pid'),
          uid: 'dhtnodemon',
          args: [program.config],
          logFile: path.join(program.config, 'dhtnodemon.log'),
        });
      });
    } else {
      logger.error('dhtnode service is not running');
    }
  });
});

program.command('stop')
.description('close the dhtnode service and disconnect')
.action(function stop() {
  checkRunning(function(proc, i) {
    if (proc) {
      logger.info('stopping dhtnode service...');
      forever.stop(i);
    } else {
      logger.error('dhtnode service is not running');
    }
  });
});

program.command('status')
.description('print info about the dhtnode service')
.action(function status() {
  checkRunning(function(proc) {
    if (proc) {
      logger.info('dhtnode is running, pid: %s', proc.pid);
    } else {
      logger.error('dhtnode is not running');
    }
  });
});

program.command('logs')
.description('tail the logs for the running dhtnode service')
.action(function logs() {
  checkRunning(function(proc, i) {
    if (proc) {
      forever.tail(i, { length: 50 }, function(err, log) {
        if (err) {
          logger.error(err.message);
        } else {
          var parts = log.line.split('} ');
          var message = parts[1] ? parts[1] : log.line;
          var type = parts[0].split('{')[1];

          logger[logger[type] ? type : 'info'](message);
        }
      });
    } else {
      logger.error('dhtnode is not running');
    }
  });
});

program.command('*').action(function help() { program.help(); });
program.parse(process.argv);

if (process.argv.length < 3) {
  return program.help();
}
