'use strict';

const Util = require('util');
const Querystring = require('querystring');
const Bossy = require('@hapi/bossy');
const CliTable = require('cli-table');
const WordWrap = require('word-wrap');
const Helpers = require('../helpers');
const Enquirer = require('enquirer');

const internals = {};

module.exports = async (server, args, root, ctx) => {

    let parameters = internals.parameters({ assertRoute: false }, args, ctx);

    if (parameters === null) {
        return;
    }

    if (parameters.config) {
        return await internals.runconfig({ config: parameters.config, server, ctx, parameters });
    }

    const { colors, DisplayError } = ctx;
    const { route, id, method, path, matchOn, query: baseQuery } = Helpers.getRouteInfo(server, args[0], args[1]);
    const { params, query, payload } = route ? route.settings.validate : {};
    const paramsInfo = (matchOn[0] === 'id') && internals.getValidationDescription(params);
    const queryInfo = internals.getValidationDescription(query);
    const payloadInfo = internals.getValidationDescription(payload);

    // Set it w/ route info this time
    parameters = internals.parameters({ route, matchOn, paramsInfo, queryInfo, payloadInfo }, args, ctx);

    if (!route) { // Case that matchOn.length === 0 handled in internals.parameters()

        if (matchOn[0] === 'id') {
            throw new DisplayError(colors.yellow(`Route "${id}" not found`));
        }

        throw new DisplayError(colors.yellow(`Route "${method} ${path}" not found`));
    }

    await internals.hitRoute({ server, ctx, parameters, method, path, query: baseQuery, queryInfo, payloadInfo, paramsInfo });
};

internals.hitRoute = async ({ server, ctx, parameters, method, path, query: baseQuery, queryInfo = {}, payloadInfo = {}, paramsInfo = {} }) => {

    const { options, output } = ctx;

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
    const pathname = !paramValues ? path : internals.setParams(path, paramValues);
    const querystring = Querystring.stringify(queryValues);
    const pathToHit = path ? path : pathname + (querystring && '?') + querystring;

    const timingStart = Date.now();

    const { request, result, rawPayload } = await server.inject({
        method,
        url: pathToHit,
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
    const statusText = (internals.codes.get(statusCode) || 'Unknown').toLowerCase();
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
    const { route, matchOn = [], paramsInfo, queryInfo, payloadInfo, assertRoute = true } = info;

    const generatedDefinitions = !paramsInfo ? [] : [
        internals.makeDefinition(paramsInfo, 'params'),
        internals.makeDefinition(queryInfo, 'query'),
        internals.makeDefinition(payloadInfo, 'payload')
    ];

    const definition = Object.assign(
        ...generatedDefinitions,
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
                default: null
            },
            config: {
                type: 'string',
                alias: 'c',
                description: 'Parses a config file and provides options to run requests',
                default: null
            }
        }
    );

    const getUsage = () => {

        let usage = [
            'hpal run debug:curl <route-id> [options]',
            'hpal run debug:curl [<method>] <path> [options]',
            'hpal run debug:curl --config <path-to-config>',
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

    if (assertRoute && !parameters.config && matchOn.length === 0) {
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

    const transformItem = ({ description, type, items }) => ({
        description: ((input === 'params') ? 'Route path param' : `Route ${input} param`) + (description ? `: ${description}` : ''),
        multiple: type === 'array',
        type: (items && items.length === 1) ? getBossyType(items[0].type) : getBossyType(type)
    });

    const makeDefinition = (subinfo, path) => {

        return Object.keys(subinfo).reduce((collect, key) => {

            const { children } = subinfo[key];
            const fullPath = path.concat(key);
            const fullKey = path.concat(key).join('-');

            return {
                ...collect,
                ...(children ? makeDefinition(children, fullPath) : {}),
                [fullKey]: transformItem(subinfo[key], input)
            };
        }, {});
    };

    return makeDefinition(info, []);
};

internals.pick = (parameters, info) => {

    const pick = (subinfo, path) => {

        const picked = Object.keys(subinfo).reduce((collect, key) => {

            const { children } = subinfo[key];
            const value = parameters[path.concat(key).join('-')];

            if (typeof value !== 'undefined') {
                return {
                    ...collect,
                    [key]: value
                };
            }

            if (children) {
                const subpicked = pick(children, path.concat(key));
                if (typeof subpicked !== 'undefined') {
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

        const len = Math.round(this.width * (2 / 3));

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

        const table = new internals.InvisibleTable({
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

internals.InvisibleTable = class InvisibleTable extends CliTable {
    constructor(options) {

        super({
            chars: {
                top: '',
                'top-mid': '',
                'top-left': '',
                'top-right': '',
                bottom: '',
                'bottom-mid': '',
                'bottom-left': '',
                'bottom-right': '',
                left: '',
                'left-mid': '',
                mid: '',
                'mid-mid': '',
                right: '',
                'right-mid': '',
                middle: ''
            },
            ...options
        });
    }
};

internals.codes = new Map([
    [100, 'Continue'],
    [101, 'Switching Protocols'],
    [102, 'Processing'],
    [200, 'OK'],
    [201, 'Created'],
    [202, 'Accepted'],
    [203, 'Non-Authoritative Information'],
    [204, 'No Content'],
    [205, 'Reset Content'],
    [206, 'Partial Content'],
    [207, 'Multi-Status'],
    [300, 'Multiple Choices'],
    [301, 'Moved Permanently'],
    [302, 'Moved Temporarily'],
    [303, 'See Other'],
    [304, 'Not Modified'],
    [305, 'Use Proxy'],
    [307, 'Temporary Redirect'],
    [400, 'Bad Request'],
    [401, 'Unauthorized'],
    [402, 'Payment Required'],
    [403, 'Forbidden'],
    [404, 'Not Found'],
    [405, 'Method Not Allowed'],
    [406, 'Not Acceptable'],
    [407, 'Proxy Authentication Required'],
    [408, 'Request Time-out'],
    [409, 'Conflict'],
    [410, 'Gone'],
    [411, 'Length Required'],
    [412, 'Precondition Failed'],
    [413, 'Request Entity Too Large'],
    [414, 'Request-URI Too Large'],
    [415, 'Unsupported Media Type'],
    [416, 'Requested Range Not Satisfiable'],
    [417, 'Expectation Failed'],
    [418, 'I\'m a teapot'],
    [422, 'Unprocessable Entity'],
    [423, 'Locked'],
    [424, 'Failed Dependency'],
    [425, 'Unordered Collection'],
    [426, 'Upgrade Required'],
    [428, 'Precondition Required'],
    [429, 'Too Many Requests'],
    [431, 'Request Header Fields Too Large'],
    [451, 'Unavailable For Legal Reasons'],
    [500, 'Internal Server Error'],
    [501, 'Not Implemented'],
    [502, 'Bad Gateway'],
    [503, 'Service Unavailable'],
    [504, 'Gateway Time-out'],
    [505, 'HTTP Version Not Supported'],
    [506, 'Variant Also Negotiates'],
    [507, 'Insufficient Storage'],
    [509, 'Bandwidth Limit Exceeded'],
    [510, 'Not Extended'],
    [511, 'Network Authentication Required']
]);

internals.getValidationDescription = (value) => {

    return (value && typeof value.describe === 'function' && internals.normalizeDescription(value.describe()).children) || {};
};

// For now we support both joi v15 and joi v16+
internals.normalizeDescription = ({ keys, flags, ...others }) => {

    const result = {
        children: keys,
        ...flags,
        ...others
    };

    result.children = result.children &&
        Object.entries(result.children).reduce((collect, [key, value]) => ({
            ...collect,
            [key]: internals.normalizeDescription(value)
        }), {});

    return result;
};

internals.runconfig = async ({ config: path, server, ctx, parameters }) => {

    const config = require(path);

    if (!config.collection && !config.environment) {
        throw new Error('Invalid hpal debug:curl config');
    }

    const postmanEnvironment = require(config.environment);

    if (!internals.detectPostmanEnvironment(postmanEnvironment)) {
        throw new Error('Currently only Postman-export-formatted environments are supported.');
    }

    const environment = internals.parsePostmanEnvironment(postmanEnvironment);

    const postmanCollection = require(config.collection);

    if (!internals.detectPostmanCollection(postmanCollection)) {
        throw new Error('Currently only Postman-export-formatted collections are supported.');
    }

    const collection = internals.parsePostmanCollection({
        parsedEnvironment: environment,
        collection: postmanCollection
    });

    const { choice } = await Enquirer.prompt({
        type: 'select',
        name: 'choice',
        message: 'Which route would you like to run?',
        choices: collection.routes.map(({ name }) => name)
    });

    const route = collection.routes.find(({ name }) => name === choice);

    await internals.hitRoute({ server, ctx, parameters: { ...parameters, ...route }, ...route });
};

internals.detectPostmanEnvironment = (env) => {

    return env && env._postman_exported_using && env._postman_exported_using.toLowerCase().startsWith('postman');
};

internals.detectPostmanCollection = (collection) => {

    return collection && collection.info && collection.info._postman_id;
};

internals.parsePostmanEnvironment = (env) => {

    return {
        name: env.name,
        variables: env.values
            .filter(({ enabled }) => enabled)
            .reduce((collect, { key, value }) => {

                collect[key] = value;

                return collect;
            }, {})
    };
};

internals.parsePostmanCollection = ({ parsedEnvironment, collection }) => {

    // We've got our own internal structure for stored routes in collections

    return {
        name: collection.info.name,
        routes: collection.item
            .filter(({ request }) => {
                // We currently only support raw JSON for bodies
                return request.method.toLowerCase() !== 'post' ? true : request.body.mode === 'raw';
            })
            .map(({ name, request }) => {

                const headers = request.header || [];

                if (request.auth && request.auth.type === 'bearer') {
                    const [{ key, value }] = request.auth.bearer;
                    headers.push({ key: key === 'token' ? 'Authorization' : key, value });
                }

                return {
                    name,
                    path: decodeURI(new URL(internals.replacePostmanVars(request.url.raw, parsedEnvironment.variables))),
                    method: request.method,
                    header: headers.map(({ key, value }) => {
                        // Let's give some special attention to the 'value' since it could be a {{token}} variable
                        console.log('key', key);
                        return `${key}: ${internals.replacePostmanVars(value, parsedEnvironment.variables)}`;
                    }),
                    data: request.body && request.body.raw
                };
            })
    };
};

internals.replacePostmanVars = (str, vars) => {

    // Uses double-bracket syntax like handlebars
    const matchedVars = str.match(/({{.+?}})/g);

    if (!matchedVars) {
        return str;
    }

    const varsSansBrackets = matchedVars.map((str) => str.replace('{{', '').replace('}}', ''));

    const values = varsSansBrackets.map((v) => {

        if (!vars[v]) {
            throw new Error('Postman var not found in environment');
        }

        return vars[v];
    });

    return values.reduce((finalStr, val, i) => finalStr.replace(matchedVars[i], val), str);
};
