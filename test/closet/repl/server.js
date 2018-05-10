'use strict';

const Hapi = require('hapi');
const HpalDebug = require('../../..');

exports.deployment = async () => {

    const server = Hapi.server({
        app: {
            configItem: 'config-item'
        }
    });

    await server.register(HpalDebug);

    server.decorate('server', 'myDecoration', () => 'my-decoration');

    server.route({
        method: 'get',
        path: '/my-route',
        options: {
            id: 'my-route',
            handler: () => 'my-route'
        }
    });

    return server;
};
