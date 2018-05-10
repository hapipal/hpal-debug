'use strict';

// Load modules

const Lab = require('lab');
const Code = require('code');
const Hapi = require('hapi');
const Toys = require('toys');
const RunUtil = require('./run-util');
const HpalDebug = require('..');

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

            cli.options.in.write(`${expression}\n`)

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

        it('is the default debug command.', async () => {

            const cli = RunUtil.cli(['run', 'debug'], 'repl');

            await waitForPrompt(cli);

            const output = await evaluate(cli, 'server.settings.app.configItem');
            expect(output).to.equal('\'config-item\'');

            await exit(cli);
        });
    });
});
