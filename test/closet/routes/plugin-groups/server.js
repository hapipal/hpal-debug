'use strict';

const Hapi = require('@hapi/hapi');
const HpalDebug = require('../../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(HpalDebug);

    server.route([
        {
            method: 'get',
            path: '/one',
            options: {
                handler: () => 'one'
            }
        },
        {
            method: 'post',
            path: '/two',
            options: {
                handler: () => 'two'
            }
        }
    ]);

    await server.register({
        name: 'my-plugin-a',
        register(srv) {

            srv.route([
                {
                    method: 'get',
                    path: '/one-a',
                    options: {
                        handler: () => 'one-a'
                    }
                },
                {
                    method: 'post',
                    path: '/two-a',
                    options: {
                        handler: () => 'two-a'
                    }
                }
            ]);
        }
    });

    await server.register({
        name: 'my-plugin-b',
        register(srv) {

            srv.route([
                {
                    method: 'get',
                    path: '/one-b',
                    options: {
                        handler: () => 'one-b'
                    }
                },
                {
                    method: 'post',
                    path: '/two-b',
                    options: {
                        handler: () => 'two-b'
                    }
                }
            ]);
        }
    });

    return server;
};
