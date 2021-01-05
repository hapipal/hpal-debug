'use strict';

const Bossy = require('@hapi/bossy');
const CliTable = require('cli-table');
const Helpers = require('../helpers');

const internals = {};

module.exports = (server, argv, root, ctx) => {

    const { options, output, colors, DisplayError } = ctx;
    const width = options.out.columns;
    const parameters = internals.parameters(argv, ctx);

    if (parameters === null) {
        return;
    }

    const { route, matchOn, id, method, path } = Helpers.getRouteInfo(server, ...parameters._);

    if (!route && matchOn.length !== 0) {

        if (matchOn[0] === 'id') {
            throw new DisplayError(colors.yellow(`Route "${id}" not found`));
        }

        throw new DisplayError(colors.yellow(`Route "${method} ${path}" not found`));
    }

    const hide = (name) => parameters.hide.includes(name);
    const show = (name) => parameters.show.includes(name);
    const shouldDisplay = ({ name, display }) => (display && !hide(name)) || show(name);
    const displayColumns = internals.columns.filter(shouldDisplay);
    const routes = server.table().filter((r) => !route || r.public === route);

    const head = (col) => colors.bold(colors.yellow(col.name));
    const colWidth = (col) => internals.colWidth(col.name, routes, (r) => col.get(r, server, parameters));
    const adjustLastColumn = (widths) => {

        const dividerWidths = widths.length + 1;
        const sum = (vals) => vals.reduce((total, val) => total + val, 0);

        if (sum(widths) + dividerWidths < width) {
            return widths;
        }

        const lastCol = displayColumns[displayColumns.length - 1];
        const allButLastColWidths = widths.slice(0, -1);
        const lastColWidth = Math.max(lastCol.name.length + 2, width - (sum(allButLastColWidths) + dividerWidths)); // 2 for cell padding

        return allButLastColWidths.concat(lastColWidth);
    };

    const pluginOrder = Object.keys(server.registrations)
        .reduce((collect, name, index) => ({
            ...collect,
            [name]: index
        }), {});

    const rows = routes
        .sort((r1, r2) => { // Group routes by plugin

            const plugin1 = r1.public.realm.plugin;
            const plugin2 = r2.public.realm.plugin;

            const order1 = plugin1 ? pluginOrder[plugin1] : -Infinity;
            const order2 = plugin2 ? pluginOrder[plugin2] : -Infinity;

            return order1 - order2;
        })
        .map((r) => displayColumns.map((col) => col.get(r, server, parameters)));

    const tableDisplay = {
        head: displayColumns.map(head),
        style: {
            head: [],
            border: options.colors ? ['grey'] : []
        }
    };

    const table = parameters.raw ?
        new Helpers.InvisibleTable({
            ...tableDisplay,
            chars: {
                middle: '\t' // Delimeter allows cell content to contain spaces
            }
        }) :
        new CliTable({
            ...tableDisplay,
            colWidths: adjustLastColumn(displayColumns.map(colWidth))
        });

    table.push(...rows);

    output(''); // Make a little room
    output(table.toString());
};

internals.parameters = (argv, ctx) => {

    const { options, output, colors, DisplayError } = ctx;
    const colNames = internals.columns.map((col) => col.name);

    const definition = {
        help: {
            type: 'boolean',
            alias: 'h',
            description: 'Show usage options.'
        },
        hide: {
            type: 'string',
            alias: 'H',
            multiple: true,
            description: 'Hide specific columns. May be listed multiple times.',
            valid: colNames
        },
        show: {
            type: 'string',
            alias: 's',
            multiple: true,
            description: 'Show specific columns. May be listed multiple times.',
            valid: colNames
        },
        raw: {
            type: 'boolean',
            alias: 'r',
            description: 'Output unformatted route table.',
            default: !ctx.options.out.isTTY || null
        }
    };

    const parameters = Bossy.parse(definition, { argv });
    const getUsage = () => {

        const usage = [
            'hpal run debug:routes [options]',
            'hpal run debug:routes <route-id> [options]',
            'hpal run debug:routes [<method>] <path> [options]'
        ].join('\n       ');

        return Bossy.usage(definition, usage, { colors: options.colors });
    };

    if (parameters instanceof Error) {
        throw new DisplayError(getUsage() + '\n\n' + colors.red(parameters.message));
    }

    if (parameters.help) {
        output(getUsage());
        return null;
    }

    const {
        _ = [],
        show = [],
        hide = []
    } = parameters;

    return { ...parameters, _, show, hide };
};

internals.colWidth = (name, routes, getValue) => {

    const valueLengths = routes.map(getValue)                   // ['dogs\nkitties']
        .map((val) => val.split('\n'))                          // [['dogs', 'kitties']]
        .reduce((collect, items) => collect.concat(items), [])  // Flatten to ['dogs', 'kitties']
        .map((val) => val.length);                              // [4, 7]

    return Math.max(name.length, ...valueLengths) + 2;          // 2 for cell padding
};

internals.columns = [
    {
        name: 'method',
        display: true,
        get: (r) => r.method
    },
    {
        name: 'path',
        display: true,
        get: (r) => r.path
    },
    {
        name: 'id',
        display: true,
        get: (r) => r.settings.id || ''
    },
    {
        name: 'plugin',
        display: true,
        get: (r) => r.public.realm.plugin || '(root)'
    },
    {
        name: 'vhost',
        display: false,
        get: (r) => r.settings.vhost || ''
    },
    {
        name: 'auth',
        display: false,
        get: (r, srv, params) => {

            const auth = srv.auth.lookup(r);

            if (!auth) {
                return '(none)';
            }

            const mode = (auth.mode === 'required') ? '' : `(${auth.mode})`;

            if (mode) {
                return mode + (params.raw ? ' ' : '\n') + internals.listToString(auth.strategies, params);
            }

            return internals.listToString(auth.strategies, params);
        }
    },
    {
        name: 'cors',
        display: false,
        get: (r, _, params) => {

            if (!r.settings.cors) {
                return '(off)';
            }

            if (r.settings.cors.origin === 'ignore') {
                return '(ignore)';
            }

            return internals.listToString(r.settings.cors.origin, params);
        }
    },
    {
        name: 'tags',
        display: false,
        get: (r, _, params) => internals.listToString(r.settings.tags, params)
    },
    {
        name: 'description',
        display: true,
        get: (r) => r.settings.description || ''
    }
];

internals.listToString = (list, { raw }) => {

    const delimeter = raw ? ', ' : '\n';

    return [].concat(list || []).join(delimeter);
};
