'use strict';

const Repl = require('repl');
const Toys = require('toys');

const internals = {};

module.exports = async (server, args, root, ctx) => {

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

    await Toys.event(repl, 'exit');
};

internals.defineReadOnly = (obj, prop, value) => {

    Object.defineProperty(obj, prop, {
        configurable: false,
        enumerable: true,
        value
    });
};
