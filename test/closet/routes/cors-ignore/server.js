'use strict';

const Hapi = require('hapi');
const HpalDebug = require('../../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(HpalDebug);

    server.route([
        {
            method: 'post',
            path: '/cors-ignore',
            options: {
                cors: { origin: 'ignore' },
                handler: () => 'cors-ignore'
            }
        }
    ]);

    return server;
};
