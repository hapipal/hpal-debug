'use strict';

const Path = require('path');
const Stream = require('stream');
const Hpal = require('hpal');
const DisplayError = require('hpal/lib/display-error');

exports.cli = (argv, cwd, { colors, columns } = {}) => {

    argv = ['x', 'x'].concat(argv); // [node, script, ...args]
    cwd = cwd ? (Path.isAbsolute(cwd) ? cwd : `${__dirname}/closet/${cwd}`) : __dirname;

    const stdin = new Stream.PassThrough();
    const stdout = new Stream.PassThrough();
    const stderr = new Stream.PassThrough();

    let output = '';

    stdout.columns = columns;
    stdout.on('data', (data) => {

        output += data;
    });

    let errorOutput = '';

    stderr.on('data', (data) => {

        errorOutput += data;
    });

    const options = {
        argv,
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
