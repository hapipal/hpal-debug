'use strict';

const Hapi = require('hapi');
const Schwifty = require('schwifty');
const Schmervice = require('schmervice');
const HpalDebug = require('../../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register([HpalDebug, Schwifty, Schmervice]);

    server.schwifty(class MyModel extends Schwifty.Model {
        static get exists() {

            return 'indeedy';
        }
    });

    // Clobberer
    server.schwifty(class Buffer extends Schwifty.Model {
        static get exists() {

            return 'indeedy';
        }
    });

    server.registerService(class MyService extends Schmervice.Service {
        get exists() {

            return 'indeedy';
        }
    });

    // Clobberer
    server.registerService(class Events extends Schmervice.Service {
        get exists() {

            return 'indeedy';
        }
    });

    return server;
};
