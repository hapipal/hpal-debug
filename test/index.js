'use strict';

// Load modules

const Lab = require('lab');
const Code = require('code');
const StripAnsi = require('strip-ansi');
const RunUtil = require('./run-util');

// Test shortcuts

const { describe, it } = exports.lab = Lab.script();
const { expect } = Code;

const internals = {};

describe('hpal-debug', () => {

    describe('repl command', () => {

        const waitForPrompt = (cli) => {

            return new Promise((resolve) => {

                let last;

                const onData = (data) => {

                    data = data.toString();

                    if (data === 'hpal> ') {
                        cli.options.out.removeListener('data', onData);
                        return resolve(last.trim());
                    }

                    last = data;
                };

                cli.options.out.on('data', onData);
            });
        };

        const evaluate = async (cli, expression) => {

            const output = waitForPrompt(cli);

            cli.options.in.write(`${expression}\n`);

            return await output;
        };

        const exit = async (cli) => {

            cli.options.in.write(`.exit\n`);

            await cli;
        };

        it('has server in context.', async () => {

            const cli = RunUtil.cli(['run', 'debug:repl'], 'repl');

            await waitForPrompt(cli);

            const output1 = await evaluate(cli, 'server.settings.app.configItem');
            expect(output1).to.equal('\'config-item\'');

            const output2 = await evaluate(cli, 'server.registrations');
            expect(output2).to.contain('name: \'hpal-debug\'');

            const output3 = await evaluate(cli, 'server.myDecoration()');
            expect(output3).to.equal('\'my-decoration\'');

            await exit(cli);
        });

        it('has server\'s own properties in context.', async () => {

            const cli = RunUtil.cli(['run', 'debug:repl'], 'repl');

            await waitForPrompt(cli);

            const output1 = await evaluate(cli, 'settings.app.configItem');
            expect(output1).to.equal('\'config-item\'');

            const output2 = await evaluate(cli, 'registrations');
            expect(output2).to.contain('name: \'hpal-debug\'');

            const output3 = await evaluate(cli, 'myDecoration()');
            expect(output3).to.equal('\'my-decoration\'');

            await exit(cli);
        });

        it('has server\'s prototype chain\'s properties in context.', async () => {

            const cli = RunUtil.cli(['run', 'debug:repl'], 'repl');

            await waitForPrompt(cli);

            const output = await evaluate(cli, 'lookup(\'my-route\').path');
            expect(output).to.equal('\'/my-route\'');

            await exit(cli);
        });

        it('does not have private server properties in context.', async () => {

            const cli = RunUtil.cli(['run', 'debug:repl'], 'repl');

            await waitForPrompt(cli);

            const output = await evaluate(cli, '_core');
            expect(output).to.contain('_core is not defined');

            await exit(cli);
        });

        it('does not clobber props on standard REPL context.', async () => {

            const cli = RunUtil.cli(['run', 'debug:repl'], 'repl');

            await waitForPrompt(cli);

            const output1 = await evaluate(cli, 'server.events === require(\'events\')');
            expect(output1).to.equal('false');

            const output2 = await evaluate(cli, 'events === require(\'events\')');
            expect(output2).to.equal('true');

            await exit(cli);
        });

        it('server prop is defined as read-only.', async () => {

            const cli = RunUtil.cli(['run', 'debug:repl'], 'repl');

            await waitForPrompt(cli);

            const output1 = await evaluate(cli, 'server = null, server === null');
            expect(output1).to.equal('false');

            const output2 = await evaluate(cli, 'lookup = null, lookup === null');
            expect(output2).to.equal('true');

            await exit(cli);
        });

        it('is the default debug command.', async () => {

            const cli = RunUtil.cli(['run', 'debug'], 'repl');

            await waitForPrompt(cli);

            const output = await evaluate(cli, 'server.settings.app.configItem');
            expect(output).to.equal('\'config-item\'');

            await exit(cli);
        });
    });

    describe('curl command', () => {

        const normalize = (str) => {

            return str
                .replace('\nRunning debug:curl...\n\n', '')
                .replace('\n\nComplete!\n', '')
                .replace('\nComplete!\n', '');  // Raw output doesn't have extra newline
        };

        const curl = (args, opts) => RunUtil.cli(['run', 'debug:curl', ...args], 'curl', opts);

        it('outputs help [-h, --help].', async () => {

            const { output: output1, err: err1, errorOutput: errorOutput1 } = await curl(['-h']);

            expect(err1).to.not.exist();
            expect(errorOutput1).to.equal('');
            expect(normalize(output1)).to.contain('Usage: hpal run debug:curl <route-id> [options]');

            const { output: output2, err: err2, errorOutput: errorOutput2 } = await curl(['--help']);

            expect(err2).to.not.exist();
            expect(errorOutput2).to.equal('');
            expect(normalize(output2)).to.contain('Usage: hpal run debug:curl <route-id> [options]');
        });

        it('hits route from its method and path.', async () => {

            const { output, err, errorOutput } = await curl(['post', '/basic']);

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal('\'post-basic-result\'');
        });

        it('hits route from its path, defaulting method to get.', async () => {

            const { output, err, errorOutput } = await curl(['/basic']);

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal('\'get-basic-result\'');
        });

        it('errors when route is not found by method and path.', async () => {

            const { output, err, errorOutput } = await curl(['post', '/does-not-exist']);

            expect(err).to.exist();
            expect(errorOutput).to.equal('Route "post /does-not-exist" not found');
            expect(normalize(output)).to.equal('');
        });

        it('hits route from its id.', async () => {

            const { output, err, errorOutput } = await curl(['get-by-id']);

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal('\'get-by-id-result\'');
        });

        it('errors when route is not found by id.', async () => {

            const { output, err, errorOutput } = await curl(['does-not-exist']);

            expect(err).to.exist();
            expect(errorOutput).to.equal('Route "does-not-exist" not found');
            expect(normalize(output)).to.equal('');
        });

        it('errors when no path or id are specified.', async () => {

            const { output, err, errorOutput } = await curl([]);

            expect(err).to.exist();
            expect(errorOutput).to.endWith('No route specified');
            expect(normalize(output)).to.equal('');
        });

        it('can specify path params as flags (with optional param).', async () => {

            const { output, err, errorOutput } = await curl(['use-params', '--one', '1', '--two', '2/2', '--three', '3']);

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal('{ one: 1,\n  two: \'2/2\',\n  three: \'3\' }');
        });

        it('can specify path params as flags (without optional param).', async () => {

            const { output, err, errorOutput } = await curl(['use-params', '--one', '1', '--two', '2/2']);

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal('{ one: 1,\n  two: \'2/2\' }');
        });

        it('can specify query params as flags.', async () => {

            const { output, err, errorOutput } = await curl(['use-query', '--isOne', '--two', '2']);

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal('{ isOne: true,\n  two: 2 }');
        });

        it('can specify query params in the path and as flags.', async () => {

            const { output, err, errorOutput } = await curl(['/query?three=3', '--two', '2']);

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal('{ three: \'3\',\n  two: 2 }');
        });

        it('can specify payload params as flags.', async () => {

            const { output, err, errorOutput } = await curl(['use-payload', '--isOne', '--two', '2']);

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal('{ isOne: true,\n  two: 2 }');
        });

        it('ignores validation when exists but is not a Joi schema.', async () => {

            const { output, err, errorOutput } = await curl(['use-no-joi-validation']);

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal('\'use-no-joi-validation-result\'');
        });

        it('ignores validation when exists but is not a Joi schema.', async () => {

            const { output, err, errorOutput } = await curl(['use-non-obj-joi-validation']);

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal('\'use-non-obj-joi-validation-result\'');
        });

        it('supports multiple CLI args for Joi arrays.', async () => {

            const { output, err, errorOutput } = await curl(['use-joi-array-validation', '--single', '1', '--single', '2', '--mixed', 'one', '--mixed', '2']);

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal('{ single: \n   [ 1,\n     2 ],\n  mixed: \n   [ \'one\',\n     2 ] }');
        });

        it('fails when specifying an invalid flag, shows params and descriptions in usage.', async () => {

            const { output, err, errorOutput } = await curl(['usage', '--badParam']);

            expect(err).to.exist();
            expect(normalize(output)).to.equal('');

            const matches = [];
            const regex = /--(\w+)\s+(.*)/g;

            let match;
            while ((match = regex.exec(errorOutput)) !== null) {
                const [, name, description] = match;
                matches.push({ name, description });
            }

            const [one, two, three, help, header, data, verbose, raw, ...others] = matches;

            expect(others).to.have.length(0);
            expect(one).to.equal({ name: 'one', description: 'Route path param' });
            expect(two).to.equal({ name: 'two', description: 'Route query param: Two things to know' });
            expect(three).to.equal({ name: 'three', description: 'Route payload param' });
            expect(help).to.contain({ name: 'help' });
            expect(header).to.contain({ name: 'header' });
            expect(data).to.contain({ name: 'data' });
            expect(verbose).to.contain({ name: 'verbose' });
            expect(raw).to.contain({ name: 'raw' });
        });

        it('can specify headers with -H, --header flag.', async () => {

            const { output, err, errorOutput } = await curl(['/headers', '-H', 'my-header: one', '-H', 'my-header: two', '--header', 'my-other-header:three', '--header', 'my-last-header']);

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.contain('\'my-header\': \n   [ \'one\',\n     \'two\' ]');
            expect(normalize(output)).to.contain('\'my-other-header\': \'three\'');
            expect(normalize(output)).to.contain('\'my-last-header\': \'\'');
        });

        it('can specify payload with -d, --data flag.', async () => {

            const {
                output: output1,
                err: err1,
                errorOutput: errorOutput1
            } = await curl(['use-payload', '-d', '{"isOne":true,"two":2}']);

            expect(err1).to.not.exist();
            expect(errorOutput1).to.equal('');
            expect(normalize(output1)).to.equal('{ isOne: true,\n  two: 2 }');

            const {
                output: output2,
                err: err2,
                errorOutput: errorOutput2
            } = await curl(['use-payload', '--data', '{"isOne":true,"two":2}']);

            expect(err2).to.not.exist();
            expect(errorOutput2).to.equal('');
            expect(normalize(output2)).to.equal('{ isOne: true,\n  two: 2 }');
        });

        it('can specify raw mode with -r, --raw flag.', async () => {

            const {
                output: output1,
                err: err1,
                errorOutput: errorOutput1
            } = await curl(['use-payload', '-r', '--isOne', '--two', '2']);

            expect(err1).to.not.exist();
            expect(errorOutput1).to.equal('');
            expect(normalize(output1)).to.equal('{"isOne":true,"two":2}');

            const {
                output: output2,
                err: err2,
                errorOutput: errorOutput2
            } = await curl(['use-payload', '--raw', '--isOne', '--two', '2']);

            expect(err2).to.not.exist();
            expect(errorOutput2).to.equal('');
            expect(normalize(output2)).to.equal('{"isOne":true,"two":2}');
        });

        const validateVerboseOutput = (actual, expected) => {

            actual = actual.replace(/\(\d+ms\)/g, '(?ms)');                               // unknown timing
            actual = actual.replace(/^(\s*host:?\s+).+/m, (full, match) => `${match}?`);  // unknown host header
            actual = actual.replace(/[^\S\r\n]+$/gm, '');                                 // remove trailing spaces

            // unknown indentation in test

            const expectedLines = expected.split('\n');
            const [indent] = expectedLines[1].match(/^\s*/);
            const indentRegex = new RegExp(`^${indent}`);

            expected = expectedLines.map((line) => line.replace(indentRegex, '')).join('\n');
            expected = expected.trim();

            expect(actual).to.equal(expected);
        };

        it('can specify verbose mode with -v, --verbose flag (without payload).', async () => {

            const {
                output: output1,
                err: err1,
                errorOutput: errorOutput1
            } = await curl(['use-query', '-v', '--isOne', '--two', '2'], { columns: 60 });

            expect(err1).to.not.exist();
            expect(errorOutput1).to.equal('');
            validateVerboseOutput(normalize(output1), `
                get /query?isOne=true&two=2 (?ms)

                request headers
                ────────────────────────────────────────
                 user-agent        shot
                 host              ?
                 content-type      application/json
                 content-length    2

                response headers
                ────────────────────────────────────────
                 content-type      application/json; charset=utf-8
                 cache-control     no-cache
                 content-length    22
                 accept-ranges     bytes
                 connection        close

                result (200 ok)
                ────────────────────────────────────────
                { isOne: true, two: 2 }
            `);

            const {
                output: output2,
                err: err2,
                errorOutput: errorOutput2
            } = await curl(['use-query', '--verbose', '--isOne', '--two', '2'], { columns: 60 });

            expect(err2).to.not.exist();
            expect(errorOutput2).to.equal('');
            validateVerboseOutput(normalize(output2), `
                get /query?isOne=true&two=2 (?ms)

                request headers
                ────────────────────────────────────────
                 user-agent        shot
                 host              ?
                 content-type      application/json
                 content-length    2

                response headers
                ────────────────────────────────────────
                 content-type      application/json; charset=utf-8
                 cache-control     no-cache
                 content-length    22
                 accept-ranges     bytes
                 connection        close

                result (200 ok)
                ────────────────────────────────────────
                { isOne: true, two: 2 }
            `);
        });

        it('can specify verbose mode with -v (with payload object).', async () => {

            const { output, err, errorOutput } = await curl(['use-payload', '-v', '-d', '{"isOne":true,"two":2}'], { columns: 60 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            validateVerboseOutput(normalize(output), `
                post /payload (?ms)

                payload
                ────────────────────────────────────────
                 isOne    true
                 two      2

                request headers
                ────────────────────────────────────────
                 user-agent        shot
                 host              ?
                 content-length    22

                response headers
                ────────────────────────────────────────
                 content-type      application/json; charset=utf-8
                 cache-control     no-cache
                 content-length    22

                result (200 ok)
                ────────────────────────────────────────
                { isOne: true, two: 2 }
            `);
        });

        it('can specify verbose mode with -v (with payload empty object).', async () => {

            const { output, err, errorOutput } = await curl(['use-payload', '-v'], { columns: 60 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            validateVerboseOutput(normalize(output), `
                post /payload (?ms)

                request headers
                ────────────────────────────────────────
                 user-agent        shot
                 host              ?
                 content-type      application/json
                 content-length    2

                response headers
                ────────────────────────────────────────
                 content-type      application/json; charset=utf-8
                 cache-control     no-cache
                 content-length    2

                result (200 ok)
                ────────────────────────────────────────
                {}
            `);
        });

        it('can specify verbose mode with -v (with payload non-object).', async () => {

            const { output, err, errorOutput } = await curl(['use-non-obj-payload', '-v', '-d', 'some text', '-H', 'content-type: text/plain'], { columns: 60 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            validateVerboseOutput(normalize(output), `
                post /non-obj-payload (?ms)

                payload
                ────────────────────────────────────────
                some text

                request headers
                ────────────────────────────────────────
                 content-type      text/plain
                 user-agent        shot
                 host              ?
                 content-length    9

                response headers
                ────────────────────────────────────────
                 content-type      text/html; charset=utf-8
                 cache-control     no-cache
                 content-length    9

                result (200 ok)
                ────────────────────────────────────────
                some text
            `);
        });

        it('can specify raw, verbose mode with -rv (without payload).', async () => {

            const { output, err, errorOutput } = await curl(['use-query', '-v', '-r', '--isOne', '--two', '2'], { columns: 60 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            validateVerboseOutput(normalize(output), `
                get /query?isOne=true&two=2 (?ms)

                request headers
                ────────────────────────────────────────
                user-agent: shot
                host: ?
                content-type: application/json
                content-length: 2

                response headers
                ────────────────────────────────────────
                content-type: application/json; charset=utf-8
                cache-control: no-cache
                content-length: 22
                accept-ranges: bytes
                connection: close

                result (200 ok)
                ────────────────────────────────────────
                {"isOne":true,"two":2}
            `);
        });

        it('can specify raw, verbose mode with -rv (with payload).', async () => {

            const { output, err, errorOutput } = await curl(['use-payload', '-v', '-r', '-d', '{"isOne":true,"two":2}'], { columns: 60 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            validateVerboseOutput(normalize(output), `
                post /payload (?ms)

                payload
                ────────────────────────────────────────
                {"isOne":true,"two":2}

                request headers
                ────────────────────────────────────────
                user-agent: shot
                host: ?
                content-length: 22

                response headers
                ────────────────────────────────────────
                content-type: application/json; charset=utf-8
                cache-control: no-cache
                content-length: 22

                result (200 ok)
                ────────────────────────────────────────
                {"isOne":true,"two":2}
            `);
        });

        it('handles unknown status code in verbose mode.', async () => {

            const { output, err, errorOutput } = await curl(['unknown-status-code', '-v'], { columns: 60 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            validateVerboseOutput(normalize(output), `
                get /unknown-status-code (?ms)

                request headers
                ────────────────────────────────────────
                 user-agent        shot
                 host              ?
                 content-type      application/json
                 content-length    2

                response headers
                ────────────────────────────────────────
                 content-type      application/json; charset=utf-8
                 cache-control     no-cache
                 content-length    18
                 connection        close

                result (420 unknown)
                ────────────────────────────────────────
                { unknown: 'code' }
            `);
        });
    });

    describe('routes command', () => {

        const normalize = (str) => {

            return str
                .replace('\nRunning debug:routes...\n\n', '')
                .replace('\n\nComplete!\n', '');
        };

        const unindent = (str) => {

            const lines = str.split('\n');
            const [indent] = lines[1].match(/^\s*/);
            const indentRegex = new RegExp(`^${indent}`);

            str = lines.map((line) => line.replace(indentRegex, '')).join('\n');
            str = str.trim();

            return str;
        };

        const routes = (args, dir, opts) => RunUtil.cli(['run', 'debug:routes', ...args], `routes/${dir}`, opts);

        it('outputs help [-h, --help].', async () => {

            const { output: output1, err: err1, errorOutput: errorOutput1 } = await routes(['-h'], 'main');

            expect(err1).to.not.exist();
            expect(errorOutput1).to.equal('');
            expect(normalize(output1)).to.contain('Usage: hpal run debug:routes [options]');

            const { output: output2, err: err2, errorOutput: errorOutput2 } = await routes(['--help'], 'main');

            expect(err2).to.not.exist();
            expect(errorOutput2).to.equal('');
            expect(normalize(output2)).to.contain('Usage: hpal run debug:routes [options]');
        });

        it('fails when specifying an invalid flag.', async () => {

            const { output, err, errorOutput } = await routes(['--badFlag'], 'main');

            expect(err).to.exist();
            expect(errorOutput).to.contain('Usage: hpal run debug:routes [options]');
            expect(errorOutput).to.contain('Unknown option: badFlag');
            expect(normalize(output)).to.equal('');
        });

        it('errors when route is not found by id.', async () => {

            const { output, err, errorOutput } = await routes(['does-not-exist'], 'main');

            expect(err).to.exist();
            expect(errorOutput).to.equal('Route "does-not-exist" not found');
            expect(normalize(output)).to.equal('');
        });

        it('errors when route is not found by method and path.', async () => {

            const { output, err, errorOutput } = await routes(['post', '/does-not-exist'], 'main');

            expect(err).to.exist();
            expect(errorOutput).to.equal('Route "post /does-not-exist" not found');
            expect(normalize(output)).to.equal('');
        });

        it('outputs default display columns, with less content than space.', async () => {

            const { output, err, errorOutput } = await routes([], 'main', { columns: 100 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal(unindent(`
                ┌────────┬────────────┬───────────┬───────────┬────────────────────────────┐
                │ method │ path       │ id        │ plugin    │ description                │
                ├────────┼────────────┼───────────┼───────────┼────────────────────────────┤
                │ get    │ /empty     │           │ (root)    │                            │
                ├────────┼────────────┼───────────┼───────────┼────────────────────────────┤
                │ patch  │ /longhand  │ longhand  │ my-plugin │ Instead, a longhand config │
                ├────────┼────────────┼───────────┼───────────┼────────────────────────────┤
                │ put    │ /shorthand │ shorthand │ my-plugin │ Shorthand config           │
                └────────┴────────────┴───────────┴───────────┴────────────────────────────┘
            `));
        });

        it('outputs default display columns, with more content than space.', async () => {

            const { output, err, errorOutput } = await routes([], 'main', { columns: 60 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal(unindent(`
                ┌────────┬────────────┬───────────┬───────────┬─────────────┐
                │ method │ path       │ id        │ plugin    │ description │
                ├────────┼────────────┼───────────┼───────────┼─────────────┤
                │ get    │ /empty     │           │ (root)    │             │
                ├────────┼────────────┼───────────┼───────────┼─────────────┤
                │ patch  │ /longhand  │ longhand  │ my-plugin │ Instead, a… │
                ├────────┼────────────┼───────────┼───────────┼─────────────┤
                │ put    │ /shorthand │ shorthand │ my-plugin │ Shorthand … │
                └────────┴────────────┴───────────┴───────────┴─────────────┘
            `));
        });

        it('outputs info for a single route by its id.', async () => {

            const { output, err, errorOutput } = await routes(['shorthand'], 'main', { columns: 100 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal(unindent(`
                ┌────────┬────────────┬───────────┬───────────┬──────────────────┐
                │ method │ path       │ id        │ plugin    │ description      │
                ├────────┼────────────┼───────────┼───────────┼──────────────────┤
                │ put    │ /shorthand │ shorthand │ my-plugin │ Shorthand config │
                └────────┴────────────┴───────────┴───────────┴──────────────────┘
            `));
        });

        it('outputs info for a single route by its method and path.', async () => {

            const { output, err, errorOutput } = await routes(['put', '/shorthand'], 'main', { columns: 100 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal(unindent(`
                ┌────────┬────────────┬───────────┬───────────┬──────────────────┐
                │ method │ path       │ id        │ plugin    │ description      │
                ├────────┼────────────┼───────────┼───────────┼──────────────────┤
                │ put    │ /shorthand │ shorthand │ my-plugin │ Shorthand config │
                └────────┴────────────┴───────────┴───────────┴──────────────────┘
            `));
        });

        it('outputs info for a single route by its path, defaulting method to "get".', async () => {

            const { output, err, errorOutput } = await routes(['/empty'], 'main', { columns: 100 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal(unindent(`
                ┌────────┬────────┬────┬────────┬─────────────┐
                │ method │ path   │ id │ plugin │ description │
                ├────────┼────────┼────┼────────┼─────────────┤
                │ get    │ /empty │    │ (root) │             │
                └────────┴────────┴────┴────────┴─────────────┘
            `));
        });

        it('can show and hide columns with [-s, --show] and [-H, --hide].', async () => {

            const args = [
                '-H', 'method',
                '-H', 'path',
                '--hide', 'plugin',
                '--hide', 'description',
                '-s', 'vhost',
                '-s', 'auth',
                '--show', 'cors',
                '--show', 'tags'
            ];

            const { output, err, errorOutput } = await routes(args, 'main', { columns: 100 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal(unindent(`
                ┌───────────┬─────────────┬─────────────────┬─────────────────┬──────────────┐
                │ id        │ vhost       │ auth            │ cors            │ tags         │
                ├───────────┼─────────────┼─────────────────┼─────────────────┼──────────────┤
                │           │             │ (none)          │ (off)           │              │
                ├───────────┼─────────────┼─────────────────┼─────────────────┼──────────────┤
                │ longhand  │ hapipal.com │ (try)           │ hapipal.com     │ my-tag       │
                │           │             │ first-strategy  │ www.hapipal.com │ my-other-tag │
                │           │             │ second-strategy │                 │              │
                ├───────────┼─────────────┼─────────────────┼─────────────────┼──────────────┤
                │ shorthand │             │ first-strategy  │ *               │ my-tag       │
                └───────────┴─────────────┴─────────────────┴─────────────────┴──────────────┘
            `));
        });

        it('displays cors "ignore" setting correctly.', async () => {

            const { output, err, errorOutput } = await routes(['-s', 'cors', '-H', 'description'], 'cors-ignore', { columns: 60 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal(unindent(`
                ┌────────┬──────────────┬────┬────────┬──────────┐
                │ method │ path         │ id │ plugin │ cors     │
                ├────────┼──────────────┼────┼────────┼──────────┤
                │ post   │ /cors-ignore │    │ (root) │ (ignore) │
                └────────┴──────────────┴────┴────────┴──────────┘
            `));
        });

        it('displays routes grouped by plugin.', async () => {

            const { output, err, errorOutput } = await routes([], 'plugin-groups', { columns: 100 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.equal(unindent(`
                ┌────────┬────────┬────┬─────────────┬─────────────┐
                │ method │ path   │ id │ plugin      │ description │
                ├────────┼────────┼────┼─────────────┼─────────────┤
                │ get    │ /one   │    │ (root)      │             │
                ├────────┼────────┼────┼─────────────┼─────────────┤
                │ post   │ /two   │    │ (root)      │             │
                ├────────┼────────┼────┼─────────────┼─────────────┤
                │ get    │ /one-a │    │ my-plugin-a │             │
                ├────────┼────────┼────┼─────────────┼─────────────┤
                │ post   │ /two-a │    │ my-plugin-a │             │
                ├────────┼────────┼────┼─────────────┼─────────────┤
                │ get    │ /one-b │    │ my-plugin-b │             │
                ├────────┼────────┼────┼─────────────┼─────────────┤
                │ post   │ /two-b │    │ my-plugin-b │             │
                └────────┴────────┴────┴─────────────┴─────────────┘
            `));
        });

        it('displays table in color when supported.', async () => {

            const { output, err, errorOutput } = await routes(['get', '/empty'], 'main', { colors: true, columns: 100 });

            expect(err).to.not.exist();
            expect(errorOutput).to.equal('');
            expect(normalize(output)).to.not.equal(unindent(`
                ┌────────┬────────┬────┬────────┬─────────────┐
                │ method │ path   │ id │ plugin │ description │
                ├────────┼────────┼────┼────────┼─────────────┤
                │ get    │ /empty │    │ (root) │             │
                └────────┴────────┴────┴────────┴─────────────┘
            `));
            expect(normalize(StripAnsi(output))).to.equal(unindent(`
                ┌────────┬────────┬────┬────────┬─────────────┐
                │ method │ path   │ id │ plugin │ description │
                ├────────┼────────┼────┼────────┼─────────────┤
                │ get    │ /empty │    │ (root) │             │
                └────────┴────────┴────┴────────┴─────────────┘
            `));
        });
    });
});
