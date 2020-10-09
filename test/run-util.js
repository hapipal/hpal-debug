'use strict';

const Path = require('path');
const Stream = require('stream');
const Somever = require('@hapi/somever');
const Hpal = require('hpal');
const DisplayError = require('hpal/lib/display-error');

exports.Hapi = require('@hapi/hapi');

exports.Joi = Somever.match(process.version, '>=12') ? require('joi-17') : require('@hapi/joi');

if (Somever.match(process.version, '>=12')) {
    // Restore string -> object coercion used in test
    exports.Joi = exports.Joi.extend({
        type: 'object',
        base: exports.Joi.object(),
        coerce: {
            from: 'string',
            method(value) {

                if (value[0] !== '{' &&
                    !/^\s*\{/.test(value)) {
                    return;
                }

                try {
                    return { value: JSON.parse(value) };
                }
                catch (ignoreErr) { }
            }
        }
    });
}

exports.cli = (argv, cwd, { colors, columns, isTTY = false, env = {} } = {}) => {

    argv = ['x', 'x'].concat(argv); // [node, script, ...args]
    cwd = cwd ? (Path.isAbsolute(cwd) ? cwd : `${__dirname}/closet/${cwd}`) : __dirname;

    const stdin = new Stream.PassThrough();
    const stdout = new Stream.PassThrough();
    const stderr = new Stream.PassThrough();

    let output = '';

    stdout.columns = columns;
    stdout.isTTY = isTTY;
    stdout.on('data', (data) => {

        output += data;
    });

    let errorOutput = '';

    stderr.on('data', (data) => {

        errorOutput += data;
    });

    const options = {
        argv,
        env,
        cwd,
        in: stdin,
        out: stdout,
        err: stderr,
        colors: !!colors
    };

    const cli = Promise.resolve()
        .then(() => Hpal.start(options))
        .then(() => ({ err: null, output, errorOutput, options }))
        .catch((err) => {

            if (!(err instanceof DisplayError)) {
                err.output = output;
                err.options = options;
                throw err;
            }

            return { err, output, errorOutput: err.message, options };
        });

    return Object.assign(cli, { options });
};
