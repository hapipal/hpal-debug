'use strict';

const Hapi = require('@hapi/hapi');
const Schwifty = require('@hapipal/schwifty');
const Schmervice = require('@hapipal/schmervice');
const HpalDebug = require('../../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register([HpalDebug, Schwifty, Schmervice]);

    server.registerModel(class MyModel extends Schwifty.Model {
        static get exists() {

            return 'indeedy';
        }
    });

    // Clobberer
    server.registerModel(class Buffer extends Schwifty.Model {
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
