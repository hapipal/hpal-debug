'use strict';

const Commands = require('./commands');
const Package = require('../package.json');

module.exports = {
    pkg: Package,
    once: true,
    requirements: {
        hapi: '>=19'
    },
    register(server) {

        server.expose('commands', {
            default: {
                command: Commands.repl,
                description: 'Alias for `hpal run debug:repl`',
                noDefaultOutput: true
            },
            repl: {
                command: Commands.repl,
                description: 'Run your server interactively as a read-eval-print loop (REPL)',
                noDefaultOutput: true
            },
            curl: {
                command: Commands.curl,
                description: 'Make requests to the routes on your server',
                noDefaultOutput: true
            },
            routes: {
                command: Commands.routes,
                description: 'List the routes on your server',
                noDefaultOutput: true
            }
        });
    }
};
