'use strict';

const Repl = require('repl');
const Toys = require('toys');

const internals = {};

module.exports = async (server, args, root, ctx) => {

    const repl = Repl.start({
        prompt: 'hpal> ',
        input: ctx.options.in,
        output: ctx.options.out
    });

    internals.defineReadOnly(repl.context, 'server', server);

    let prototype = server;

    while (prototype) {

        Object.getOwnPropertyNames(prototype).forEach((prop) => {

            const value = prototype[prop];

            if (prop.charAt(0) === '_' || (typeof repl.context[prop] !== 'undefined')) {
                return;
            }

            internals.defineReadOnly(
                repl.context,
                prop,
                (typeof value === 'function') ? value.bind(server) : value
            );
        });

        prototype = Object.getPrototypeOf(prototype);
    }

    await Toys.event(repl, 'exit');
};

internals.defineReadOnly = (obj, prop, value) => {

    Object.defineProperty(obj, prop, {
        configurable: false,
        enumerable: true,
        value
    });
};
