'use strict';

const { Hapi } = require('../../../run-util');
const Toys = require('toys');
const HpalDebug = require('../../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(HpalDebug);

    server.route([
        {
            method: 'get',
            path: '/empty',
            options: {
                handler: () => 'empty'
            }
        }
    ]);

    await server.register({
        name: 'my-plugin',
        register(srv) {

            Toys.auth.strategy(srv, 'first-strategy', (request, h) => h.authenticated({ credentials: {} }));
            Toys.auth.strategy(srv, 'second-strategy', (request, h) => h.authenticated({ credentials: {} }));

            srv.route([
                {
                    method: 'put',
                    path: '/shorthand',
                    options: {
                        id: 'shorthand',
                        tags: 'my-tag',
                        description: 'Shorthand config',
                        cors: true,
                        auth: { strategy: 'first-strategy' },
                        handler: () => 'shorthand'
                    }
                },
                {
                    method: 'patch',
                    path: '/longhand',
                    vhost: 'hapipal.com',
                    options: {
                        id: 'longhand',
                        tags: ['my-tag', 'my-other-tag'],
                        description: 'Instead, a longhand config',
                        cors: {
                            origin: [
                                'hapipal.com',
                                'www.hapipal.com'
                            ]
                        },
                        auth: {
                            mode: 'try',
                            strategies: [
                                'first-strategy',
                                'second-strategy'
                            ]
                        },
                        handler: () => 'longhand'
                    }
                }
            ]);
        }
    });

    return server;
};
