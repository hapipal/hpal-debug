'use strict';

const Util = require('util');
const Http = require('http');
const Querystring = require('querystring');
const Bossy = require('@hapi/bossy');
const WordWrap = require('word-wrap');
const Helpers = require('../helpers');

const internals = {};

module.exports = async (server, args, root, ctx) => {

    const { options, output, colors, DisplayError } = ctx;
    const { route, id, method, path, query: baseQuery, matchOn } = Helpers.getRouteInfo(server, args[0], args[1]);
    const { params, query, payload } = route ? route.settings.validate : {};
    const paramsInfo = (matchOn[0] === 'id') && internals.getValidationDescription(params);
    const queryInfo = internals.getValidationDescription(query);
    const payloadInfo = internals.getValidationDescription(payload);

    const parameters = internals.parameters({ route, matchOn, paramsInfo, queryInfo, payloadInfo }, args, ctx);

    if (parameters === null) {
        return;
    }

    if (!route) { // Case that matchOn.length === 0 handled in internals.parameters()

        if (matchOn[0] === 'id') {
            throw new DisplayError(colors.yellow(`Route "${id}" not found`));
        }

        throw new DisplayError(colors.yellow(`Route "${method} ${path}" not found`));
    }

    // Collect raw payload if we'll want to display it

    if (parameters.raw && parameters.verbose) {
        server.ext('onRequest', (request, h) => {

            request.plugins['hpal-debug'].rawPayload = '';

            request.events.on('peek', (chunk) => {

                request.plugins['hpal-debug'].rawPayload += chunk.toString();
            });

            return h.continue;
        });
    }

    // Make request and time it

    const paramValues = internals.pick(parameters, paramsInfo);
    const queryValues = Object.assign(
        Querystring.parse(baseQuery),
        internals.pick(parameters, queryInfo)
    );
    const payloadValues = parameters.data || internals.pick(parameters, payloadInfo);
    const headerValues = internals.headersFromArray(parameters.header || []);
    const pathname = internals.setParams(path, paramValues);
    const querystring = Querystring.stringify(queryValues);
    const url = pathname + (querystring && '?') + querystring;

    const timingStart = Date.now();

    const { request, result, rawPayload } = await server.inject({
        method,
        url,
        payload: payloadValues,
        headers: headerValues,
        allowInternals: true,
        plugins: { 'hpal-debug': {} }
    });

    const timingEnd = Date.now();

    // Output below

    // Handle "null prototype" output from inspect()
    const normalizedResult = (result && typeof result === 'object') ? Object.assign({}, result) : result;

    if (!parameters.verbose) {

        if (parameters.raw) {
            return options.out.write(rawPayload);
        }

        output(''); // Make a little room

        return output(Util.inspect(normalizedResult, {
            depth: null,
            compact: false,
            colors: options.colors,
            breakLength: options.out.columns
        }));
    }

    // Verbose

    const display = new internals.Display(ctx, parameters.raw);

    output(''); // Make a little room
    output(display.title(`${method} ${url}`) + ' ' + display.subheader(`(${timingEnd - timingStart}ms)`));

    if (request.payload || request.payload === '') {

        // Payload was set as a string or object.  When an object, is never empty because a key must have been set.

        output('');
        output(display.header('payload'));
        output(display.hr());
        if (display.raw) {
            output(request.plugins['hpal-debug'].rawPayload);
        }
        else {
            if (typeof request.payload === 'object') {
                output(display.twoColumn(request.payload));
            }
            else {
                output(display.inspect(request.payload, {
                    depth: null,
                    compact: false
                }));
            }
        }
    }

    output('');
    output(display.header('request headers'));
    output(display.hr());
    output(display.twoColumn(request.headers));

    output('');
    output(display.header('response headers'));
    output(display.hr());
    output(display.twoColumn(request.response.headers));

    output('');
    const { statusCode } = request.response;
    const statusText = (Http.STATUS_CODES[statusCode] || 'Unknown').toLowerCase();
    output(display.header('result') + ' ' + display.subheader(`(${statusCode} ${statusText})`));
    output(display.hr());
    if (display.raw) {
        output(rawPayload);
    }
    else {
        output(display.inspect(normalizedResult, {
            depth: null,
            compact: false,
            breakLength: options.out.columns
        }));
    }
};

internals.parameters = (info, argv, ctx) => {

    const { options, output, colors, DisplayError } = ctx;
    const { route, matchOn, paramsInfo, queryInfo, payloadInfo } = info;

    const definition = Object.assign(
        internals.makeDefinition(paramsInfo, 'params'),
        internals.makeDefinition(queryInfo, 'query'),
        internals.makeDefinition(payloadInfo, 'payload'),
        {
            help: {
                type: 'boolean',
                alias: 'h',
                description: 'Show usage options.'
            },
            header: {
                type: 'string',
                alias: 'H',
                multiple: true,
                description: 'Request headers. Should be specified once per header, e.g -H "content-type: text/plain" -H "user-agent: hpal-cli".'
            },
            data: {
                type: 'string',
                alias: 'd',
                description: 'Raw payload data. Should not be used in conjunction with route-specific payload options. Note that the default content-type remains "application/json".',
                default: null
            },
            verbose: {
                type: 'boolean',
                alias: 'v',
                description: 'Show timing and headers in addition to response.',
                default: null
            },
            raw: {
                type: 'boolean',
                alias: 'r',
                description: 'Output only the unformatted response payload.',
                default: !ctx.options.out.isTTY || null
            }
        }
    );

    const getUsage = () => {

        let usage = [
            'hpal run debug:curl <route-id> [options]',
            'hpal run debug:curl [<method>] <path> [options]'
        ].join('\n       ');

        const actualArgs = argv.slice(0, matchOn.length).join(' ');

        // Ensuring a route avoids a case like "hpal run debug:curl -h" displaying here,
        // registering the help flag as a potential route id.  And other bad/odd cases
        // where the user is asking for help about a specific route, and the route didn't exist.

        if (route) {
            // If there's a route, then there must have been actualArgs that specified it
            usage += '\n\n' + colors.bold(`hpal run debug:curl ${actualArgs} [options]`);
        }

        return Bossy.usage(definition, usage, { colors: options.colors });
    };

    const parameters = Bossy.parse(definition, { argv });

    if (parameters instanceof Error) {
        throw new DisplayError(getUsage() + '\n\n' + colors.red(parameters.message));
    }

    if (parameters.help) {
        output(getUsage());
        return null;
    }

    if (matchOn.length === 0) {
        throw new DisplayError(getUsage() + '\n\n' + colors.red('No route specified'));
    }

    // Bossy gives false specifically for missing boolean
    // params— we'll choose to just omit those instead.
    // Setting to undefined for parity with the other params.

    Object.keys(parameters).forEach((key) => {

        if (parameters[key] === false) {
            parameters[key] = undefined;
        }
    });

    return parameters;
};

internals.makeDefinition = (info, input) => {

    const getBossyType = (type) => {

        if (type === 'boolean') {
            return 'boolean';
        }

        return 'string';
    };

    const transformItem = ({ flags: { description } = {}, type, items }) => ({
        description: ((input === 'params') ? 'Route path param' : `Route ${input} param`) + (description ? `: ${description}` : ''),
        multiple: type === 'array',
        type: (items && items.length === 1) ? getBossyType(items[0].type) : getBossyType(type)
    });

    const makeDefinition = (subinfo, path) => {

        return Object.keys(subinfo).reduce((collect, key) => {

            const { keys } = subinfo[key];
            const fullPath = path.concat(key);
            const fullKey = path.concat(key).join('-');

            return {
                ...collect,
                ...(keys && makeDefinition(keys, fullPath)),
                [fullKey]: transformItem(subinfo[key], input)
            };
        }, {});
    };

    return makeDefinition(info, []);
};

internals.pick = (parameters, info) => {

    const pick = (subinfo, path) => {

        const picked = Object.keys(subinfo).reduce((collect, key) => {

            const { keys } = subinfo[key];
            const value = parameters[path.concat(key).join('-')];

            if (value !== undefined) {
                return {
                    ...collect,
                    [key]: value
                };
            }

            if (keys) {
                const subpicked = pick(keys, path.concat(key));
                if (subpicked !== undefined) {
                    return {
                        ...collect,
                        [key]: subpicked
                    };
                }
            }

            return collect;
        }, {});

        return Object.keys(picked).length > 0 ? picked : undefined;
    };

    return pick(info, []);
};

internals.setParams = (path, params = {}) => {

    return path.replace(/(\/)?\{(.+?)(\?|\*[\d]*)?\}/g, (...args) => {

        const [, slash, name, mod] = args;
        const param = params.hasOwnProperty(name) ? params[name] : '';

        if (mod === '?' && param === '') {  // Avoid trailing slash
            return '';
        }

        return `${slash}${param}`;
    });
};

internals.headersFromArray = (headerLines) => {

    return headerLines.reduce((headers, headerLine) => {

        headerLine = headerLine.trim();

        const separator = headerLine.match(/:\s*/);
        const name = separator ? headerLine.slice(0, separator.index).toLowerCase() : headerLine.toLowerCase();
        const value = separator ? headerLine.slice(separator.index + separator[0].length) : '';

        return {
            ...headers,
            [name]: headers[name] ? [].concat(headers[name], value) : value
        };
    }, {});
};

internals.Display = class Display {

    constructor(ctx, raw) {

        this.width = ctx.options.out.columns;
        this.ctx = ctx;
        this.raw = raw;
    }

    title(str) {

        return this.ctx.colors.bold(this.ctx.colors.green(str));
    }

    header(str) {

        return this.ctx.colors.bold(this.ctx.colors.yellow(str));
    }

    subheader(str) {

        return this.ctx.colors.grey(str);
    }

    hr() {

        const len = Math.round((this.width || 16) * (2 / 3));

        return ('─').repeat(len);
    }

    twoColumn(dict) {

        const rows = Object.keys(dict).reduce((collect, key) => {

            const values = [].concat(dict[key]);

            return collect.concat(
                values.map((value) => ([key, this.inspect(value)]))
            );
        }, []);

        if (this.raw) {
            return rows
                .map(([header, value]) => this.ctx.colors.bold(`${header}:`) + ' ' + value)
                .join('\n');
        }

        const leftColWidth = Math.max(...rows.map(([header]) => header.length)) + 2;
        const rightColWidth = this.width - leftColWidth;

        const table = new Helpers.InvisibleTable({
            truncate: false,
            colWidths: [leftColWidth, rightColWidth]
        });

        const wordWrap = (str) => WordWrap(str, { width: rightColWidth - 4, cut: true, trim: true });

        table.push(
            ...rows.map(([header, value]) => ([
                this.ctx.colors.bold(header),
                wordWrap(value)
            ]))
        );

        return table.toString();
    }

    inspect(value, options = {}) {

        return (typeof value === 'string') ? value : Util.inspect(value, {
            colors: this.ctx.options.colors,
            ...options
        });
    }
};

internals.getValidationDescription = (value) => {

    return (value && typeof value.describe === 'function' && value.describe().keys) || {};
};
