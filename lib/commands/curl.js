'use strict';

const Os = require('os');
const Url = require('url');
const Util = require('util');
const Querystring = require('querystring');
const Bossy = require('bossy');
const Toys = require('toys');
const CliTable = require('cli-table');
const WordWrap = require('word-wrap');

const internals = {};

module.exports = async (server, args, root, ctx) => {

    const { options, colors, output, DisplayError } = ctx;

    let route;
    let baseQuery;
    let [method, path, ...argv] = args;

    if (args.length && !internals.isMethod(method)) {
        argv = (typeof path === 'undefined' ? [] : [path]).concat(argv);
        path = method;
        method = null;
    }

    const id = (path && path[0] !== '/') && path;

    if (id) {
        route = server.lookup(path);
        if (!route) {
            throw new DisplayError(colors.yellow(`Route "${id}" not found`));
        }
        path = route.path;
        method = route.method;
    }
    else if (path) {
        const parsedPath = Url.parse(path);
        baseQuery = parsedPath.query;
        path = parsedPath.pathname;
        method = (method || 'get').toLowerCase();
        route = server.match(method, path);
        if (!route) {
            throw new DisplayError(colors.yellow(`Route "${method} ${path}" not found`));
        }
    }

    const { params, query, payload } = route ? route.settings.validate : {};
    const paramsInfo = params && params.isJoi && params.describe().children || {};
    const queryInfo = query && query.isJoi && query.describe().children || {};
    const payloadInfo = payload && payload.isJoi && payload.describe().children || {};

    const definition = Object.assign(
        internals.makeDefinition(id ? paramsInfo : {}, 'params'),
        internals.makeDefinition(queryInfo, 'query'),
        internals.makeDefinition(payloadInfo, 'payload'),
        {
            H: {
                type: 'string',
                alias: 'header',
                multiple: true,
                description: 'Request headers. Should be specified once per header, e.g -H "content-type: text/plain" -H "user-agent: hpal-cli".'
            },
            d: {
                type: 'string',
                alias: 'data',
                description: 'Raw payload data. Should not be used in conjunction with route-specific payload options. Note that the default content-type remains "application/json".',
                default: null
            },
            v: {
                type: 'boolean',
                alias: 'verbose',
                description: 'Show timing and headers in addition to response.',
                default: null
            },
            r: {
                type: 'boolean',
                alias: 'raw',
                description: 'Output only the unformatted response payload.',
                default: null
            }
        }
    );

    if (!path) {
        throw new DisplayError(Bossy.usage(definition, { colors: ctx.options.colors }) + '\n\n' + colors.red('No route specified'));
    }

    const parameters = Bossy.parse(definition, { argv });

    if (parameters instanceof Error) {
        throw new DisplayError(Bossy.usage(definition, { colors: ctx.options.colors }) + '\n\n' + colors.red(parameters.message));
    }

    // Bossy gives false specifically for missing boolean
    // params— we'll choose to just omit those instead.
    // Setting to undefined for parity with the other params.

    Object.keys(parameters).forEach((key) => {

        if (parameters[key] === false) {
            parameters[key] = undefined;
        }
    });

    const paramValues = internals.pick(parameters, Object.keys(paramsInfo));
    const queryValues = Object.assign(
        Querystring.parse(baseQuery),
        internals.pick(parameters, Object.keys(queryInfo)),
    );
    const payloadValues = parameters.data || internals.pick(parameters, Object.keys(payloadInfo));
    const headerValues = internals.headersFromArray(parameters.header || []);

    const pathname = internals.setParams(path, paramValues);
    const querystring = Querystring.stringify(queryValues);
    const url = pathname + (querystring && '?') + querystring;

    // Collect raw payload

    if (parameters.raw) {
        server.ext('onRequest', (request, h) => {

            request.plugins['hpal-debug'].rawPayload = '';

            request.events.on('peek', (chunk) => {

                request.plugins['hpal-debug'].rawPayload += chunk.toString();
            });

            return h.continue;
        });
    }

    // Make request and time it

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

    if (!parameters.verbose) {

        if (parameters.raw) {
            return options.out.write(rawPayload);
        }

        return output(Util.inspect(result, {
            depth: null,
            compact: false,
            colors: options.colors,
            breakLength: options.out.columns
        }));
    }

    // Verbose

    const display = new internals.Display(ctx, parameters.raw);

    output(display.title(`${method} ${url}`) + ' ' + display.subheader(`(${timingEnd - timingStart}ms)`));

    if (request.payload) {
        output('');
        output(display.header('payload'));
        output(display.hr());
        if (display.raw) {
            output(request.plugins['hpal-debug'].rawPayload);
        } else {
            if (typeof request.payload === 'object' && request.payload) {
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
        output(display.inspect(result, {
            depth: null,
            compact: false,
            breakLength: options.out.columns
        }));
    }
};

internals.isMethod = (val) => {

    return ['get', 'post', 'patch', 'delete', 'options', 'head'].includes(val.toLowerCase());
};

internals.makeDefinition = (info, input) => {

    const getBossyType = (type) => {

        if (type === 'boolean') {
            return 'boolean';
        }

        return 'string';
    };

    const transformItem = ({ description, type, items }, input) => ({
        description: ((input === 'params') ? 'Route path param' : `Route ${input} param`) + (description ? `: ${description}` : ''),
        multiple: type === 'array',
        type: (items && items.length === 1) ? getBossyType(items[0].type) : getBossyType(type)
    });

    return Object.keys(info).reduce((collect, key) => ({
        ...collect,
        [key]: transformItem(info[key], input)
    }), {});
};

internals.pick = (obj, keys) => {

    return keys
        .filter((key) => typeof obj[key] !== 'undefined')
        .reduce((collect, key) => ({ ...collect, [key]: obj[key] }), {});
};

internals.setParams = (path, params) => {

    return path.replace(/(\/)?\{(.+?)(\?|\*[\d]+)?\}/g, (...args) => {

        const [, slash, name, mod] = args;
        const param = params.hasOwnProperty(name) ? params[name] : '';

        if (mod === '?') {
            return `${param}`;
        }

        return `${slash}${param}`
    });
};

internals.headersFromArray = (headerLines) => {

    return headerLines.reduce((headers, headerLine) => {

        headerLine = headerLine.trim();

        const separator = headerLine.match(/:\s*/);

        if (!separator) {
            return headers;
        }

        const name = headerLine.slice(0, separator.index).toLowerCase();
        const value = headerLine.slice(separator.index + separator[0].length);

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
                .join(Os.EOL);
        }

        if (!rows.length) {
            return '(empty)';
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
                middle: '',
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