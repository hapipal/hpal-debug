'use strict';

const Hapi = require('hapi');
const Joi = require('joi');
const HpalDebug = require('../../..');

exports.deployment = async () => {

    const server = Hapi.server({
        host: 'hapipal'
    });

    await server.register(HpalDebug);

    server.route([
        {
            method: 'get',
            path: '/basic',
            options: {
                id: 'get-basic',
                handler: () => 'get-basic-result'
            }
        },
        {
            method: 'post',
            path: '/basic',
            options: {
                id: 'post-basic',
                handler: () => 'post-basic-result'
            }
        },
        {
            method: 'get',
            path: '/by-id',
            options: {
                id: 'get-by-id',
                handler: () => 'get-by-id-result'
            }
        },
        {
            method: 'get',
            path: '/first/{one}/second/{two*2}/third/{three?}',
            options: {
                id: 'use-params',
                validate: {
                    params: {
                        one: Joi.number(),
                        two: Joi.string(),
                        three: Joi.string()
                    }
                },
                handler: ({ params }) => params
            }
        },
        {
            method: 'get',
            path: '/query',
            options: {
                id: 'use-query',
                validate: {
                    query: {
                        isOne: Joi.boolean().truthy('true'),
                        two: Joi.number(),
                        three: Joi.string()
                    }
                },
                handler: ({ query }) => query
            }
        },
        {
            method: 'post',
            path: '/payload',
            options: {
                id: 'use-payload',
                validate: {
                    payload: {
                        isOne: Joi.boolean().truthy('true'),
                        two: Joi.number()
                    }
                },
                handler: ({ payload }) => payload
            }
        },
        {
            method: 'post',
            path: '/no-joi-validation/{param?}',
            options: {
                id: 'use-no-joi-validation',
                validate: {
                    params: (value) => value,
                    payload: (value) => value,
                    query: (value) => value
                },
                handler: () => 'use-no-joi-validation-result'
            }
        },
        {
            method: 'post',
            path: '/non-obj-joi-validation/{param?}',
            options: {
                id: 'use-non-obj-joi-validation',
                validate: {
                    params: Joi.any(),
                    payload: Joi.any(),
                    query: Joi.any()
                },
                handler: () => 'use-non-obj-joi-validation-result'
            }
        },
        {
            method: 'post',
            path: '/use-joi-array-validation',
            options: {
                id: 'use-joi-array-validation',
                validate: {
                    payload: {
                        single: Joi.array().items(Joi.number()),
                        mixed: Joi.array().items(Joi.number(), Joi.string())
                    }
                },
                handler: ({ payload }) => payload
            }
        },
        {
            method: 'post',
            path: '/usage/{one?}',
            options: {
                id: 'usage',
                validate: {
                    params: {
                        one: Joi.any()
                    },
                    query: {
                        two: Joi.any().description('Two things to know')
                    },
                    payload: {
                        three: Joi.any()
                    }
                },
                handler: () => 'usage-result'
            }
        },
        {
            method: 'get',
            path: '/headers',
            options: {
                id: 'use-headers',
                handler: ({ headers }) => headers
            }
        },
        {
            method: 'post',
            path: '/non-obj-payload',
            options: {
                id: 'use-non-obj-payload',
                handler: ({ payload }) => payload
            }
        },
        {
            method: 'get',
            path: '/unknown-status-code',
            options: {
                id: 'unknown-status-code',
                handler: (request, h) => h.response({ unknown: 'code' }).code(420)
            }
        }
    ]);

    return server;
};
