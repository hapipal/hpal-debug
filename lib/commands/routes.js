'use strict';

const Bossy = require('bossy');
const CliTable = require('cli-table');

const internals = {};

module.exports = (server, argv, root, ctx) => {

    const routes = server.table();
    const width = ctx.options.out.columns;
    const listToString = (list) => [].concat(list || []).join('\n');
    const columns = [
        {
            name: 'method',
            get: (r) => r.method,
            display: true
        },
        {
            name: 'path',
            get: (r) => r.path,
            display: true
        },
        {
            name: 'id',
            get: (r) => r.settings.id || '',
            display: true
        },
        {
            name: 'plugin',
            get: (r) => r.public.realm.plugin || '(root)',
            display: true
        },
        {
            name: 'vhost',
            get: (r) => r.settings.vhost || '',
            display: false
        },
        {
            name: 'auth',
            get: (r) => {

                const auth = server.auth.lookup(r);

                if (!auth) {
                    return '(none)';
                }

                const mode = (auth.mode === 'required') ? '' : `(${auth.mode})\n`;

                return mode + listToString(auth.strategies);
            },
            display: false
        },
        {
            name: 'cors',
            get: (r) => {

                return r.settings.cors ? listToString(r.settings.cors.origin) : '(off)';
            },
            display: false
        },
        {
            name: 'tags',
            get: (r) => listToString(r.settings.tags),
            display: false
        },
        {
            name: 'description',
            get: (r) => r.settings.description || '',
            display: true
        }
    ];

    const parameters = internals.parameters(columns, argv, ctx);
    const hide = (name) => parameters.hide.includes(name);
    const show = (name) => parameters.show.includes(name);
    const display = ({ name, display }) => (display && !hide(name)) || show(name);
    const displayColumns = columns.filter(display);

    const head = (col) => ctx.colors.bold(ctx.colors.yellow(col.name));
    const colWidth = (col) => internals.colWidth(col.name, routes, col.get);
    const adjustLastColumn = (widths) => {

        const dividerWidths = widths.length + 1;
        const sum = (vals) => vals.reduce((total, val) => total + val, 0);

        if (sum(widths) + dividerWidths < width) {
            return widths;
        }

        const lastCol = displayColumns[displayColumns.length - 1];
        const allButLastColWidths = widths.slice(0, -1);
        const lastColWidth = Math.max(lastCol.name.length + 2, width - (sum(allButLastColWidths) + dividerWidths)) // 2 for cell padding

        return allButLastColWidths.concat(lastColWidth);
    };

    const table = new CliTable({
        head: displayColumns.map(head),
        colWidths: adjustLastColumn(displayColumns.map(colWidth)),
        style: {
            head: []
        }
    });

    table.push(...routes.map((r) => {

        return displayColumns.map((col) => col.get(r));
    }));

    ctx.output(table.toString());
};

internals.parameters = (cols, argv, ctx) => {

    const colNames = cols.map((col) => col.name);

    const definition = {
        H: {
            type: 'string',
            alias: 'hide',
            multiple: true,
            description: 'Hide specific columns.',
            valid: colNames
        },
        s: {
            type: 'string',
            alias: 'show',
            multiple: true,
            description: 'Show specific columns.',
            valid: colNames
        }
    };

    const parameters = Bossy.parse(definition, { argv });

    if (parameters instanceof Error) {
        throw new ctx.DisplayError(Bossy.usage(definition, { colors: ctx.options.colors }) + '\n\n' + ctx.colors.red(parameters.message));
    }

    return {
        ...parameters,
        show: parameters.show || [],
        hide: parameters.hide || []
    };
};

internals.colWidth = (name, routes, getValue) => {

    const valueLengths = routes.map(getValue)                   // ['dogs\nkitties']
        .map((val) => val.split('\n'))                          // [['dogs', 'kitties']]
        .reduce((collect, items) => collect.concat(items), [])  // Flatten to ['dogs', 'kitties']
        .map((val) => val.length);                              // [4, 7]

    return Math.max(name.length, ...valueLengths) + 2;          // 2 for cell padding
};
