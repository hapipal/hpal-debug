'use strict';

const Repl = require('repl');
const Util = require('util');
const Toys = require('toys');

const internals = {};

module.exports = async (server, args, root, ctx) => {

    ctx.output(''); // Make a little room

    const repl = Repl.start({
        prompt: 'hpal> ',
        input: ctx.options.in,
        output: ctx.options.out,
        useColors: ctx.options.colors
    });

    internals.defineReadOnly(repl.context, 'server', server);

    let prototype = server;

    while (prototype) {

        const props = Object.getOwnPropertyNames(prototype);

        for (let i = 0; i < props.length; ++i) {

            const prop = props[i];
            const value = prototype[prop];

            if (prop.charAt(0) === '_' || (typeof repl.context[prop] !== 'undefined')) {
                continue;
            }

            repl.context[prop] = (typeof value === 'function') ? value.bind(server) : value;
        }

        prototype = Object.getPrototypeOf(prototype);
    }

    if (typeof server.models === 'function') {
        for (const [name, Model] of Object.entries(server.models())) {

            if (typeof repl.context[name] !== 'undefined') {
                continue;
            }

            repl.context[name] = Model;
        }
    }

    if (typeof server.services === 'function') {
        for (const [name, service] of Object.entries(server.services())) {

            if (typeof repl.context[name] !== 'undefined') {
                continue;
            }

            repl.context[name] = service;
        }
    }

    // There is no way to cover this before node v11.10.0
    /* $lab:coverage:off$ */
    if (typeof repl.setupHistory === 'function') {
        const { env = {} } = ctx.options;
        const setupHistory = Util.promisify(repl.setupHistory.bind(repl));
        await setupHistory(env.NODE_REPL_HISTORY);
    }
    /* $lab:coverage:on$ */

    await Toys.event(repl, 'exit');
};

internals.defineReadOnly = (obj, prop, value) => {

    Object.defineProperty(obj, prop, {
        configurable: false,
        enumerable: true,
        value
    });
};
