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
            get: (r) => {

                const auth = server.auth.lookup(r);

                if (!auth) {
                    return '(none)';
                }

                const mode = (auth.mode === 'required') ? '' : `(${auth.mode})\n`;

                return mode + listToString(auth.strategies);
            }
        },
        {
            name: 'cors',
            display: false,
            get: (r) => {

                return r.settings.cors ? listToString(r.settings.cors.origin) : '(off)';
            }
        },
        {
            name: 'tags',
            display: false,
            get: (r) => listToString(r.settings.tags)
        },
        {
            name: 'description',
            display: true,
            get: (r) => r.settings.description || ''
        }
    ];

    const parameters = internals.parameters(columns, argv, ctx);

    if (parameters === null) {
        return;
    }

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
        help: {
            type: 'boolean',
            alias: 'h',
            description: 'Show usage options.',
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
        }
    };

    const parameters = Bossy.parse(definition, { argv });
    const usage = 'hpal run debug:routes -H <hide-col> -s <show-col>';

    if (parameters instanceof Error) {
        throw new ctx.DisplayError(Bossy.usage(definition, usage, { colors: ctx.options.colors }) + '\n\n' + ctx.colors.red(parameters.message));
    }

    if (parameters.help) {
        ctx.output(Bossy.usage(definition, usage, { colors: ctx.options.colors }));
        return null;
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
