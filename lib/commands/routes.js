'use strict';

const CliTable = require('cli-table');

const internals = {};

module.exports = (server, args, root, ctx) => {

    const routes = server.table();
    const colWidths = [];
    const width = ctx.options.out.columns;

    const getMethod = (r) => r.method;
    const getPath = (r) => r.path;
    const getId = (r) => r.settings.id || '';
    const getPlugin = (r) => r.public.realm.plugin || 'root';
    const getDescription = (r) => r.settings.description || '';

    const sum = (vals) => vals.reduce((total, val) => total + val, 0);

    colWidths.push(internals.colWidth('method', routes, getMethod));
    colWidths.push(internals.colWidth('path', routes, getPath));
    colWidths.push(internals.colWidth('id', routes, getId));
    colWidths.push(internals.colWidth('plugin', routes, getPlugin));
    colWidths.push(Math.max('description'.length + 2, width - sum(colWidths) - 6)); // 2 for cell padding, 6 for column dividers

    const header = (str) => ctx.colors.bold(ctx.colors.yellow(str));
    const table = new CliTable({
        head: ['method', 'path', 'id', 'plugin', 'description'].map(header),
        colWidths,
        style: {
            head: []
        }
    });

    table.push(...routes.map((r) => ([
        getMethod(r),
        getPath(r),
        getId(r),
        getPlugin(r),
        getDescription(r)
    ])));

    ctx.output(table.toString());
};

internals.colWidth = (name, routes, getValue) => {

    const valueLengths = routes.map(getValue).map((val) => val.length);

    return Math.max(name.length, ...valueLengths) + 2;  // 2 for cell padding
};
