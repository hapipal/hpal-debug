'use strict';

const Repl = require('repl');
const Toys = require('toys');

module.exports = async (server, args, root, ctx) => {

    const repl = Repl.start({
        prompt: 'hpal> ',
        input: ctx.options.in,
        output: ctx.options.out
    });

    repl.context.server = server;

    await Toys.event(repl, 'exit');
};
