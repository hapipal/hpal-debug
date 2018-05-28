# hpal-debug

hapijs debugging tools for the [hpal CLI](https://github.com/hapipal/hpal)

[![Build Status](https://travis-ci.org/hapipal/hpal-debug.svg?branch=master)](https://travis-ci.org/hapipal/hpal-debug) [![Coverage Status](https://coveralls.io/repos/hapipal/hpal-debug/badge.svg?branch=master&service=github)](https://coveralls.io/github/hapipal/hpal-debug?branch=master)

Lead Maintainer - [Devin Ivy](https://github.com/devinivy)

`hpal-debug` was designed to help you,
  - :ant: display information about your routes in a neat, customizable table.
    > `hpal run debug:routes --show cors`
  - :beetle: use your hapi server, [models](https://github.com/hapipal/schwifty), [services](https://github.com/hapipal/schmervice), etc. interactively through a REPL.
    > `hpal run debug:repl`
  - :bug: hit your routes from the command line without having to restart your server.
    > `hpal run debug:curl post /user --name Pal -v`

## Installation
> **Note**
> If you're getting started with [the pal boilerplate](https://github.com/hapipal/boilerplate), then your project is already setup with hpal-debug!

1. Install the hpal-debug package from npm as a dev dependency.
  > ```sh
  > npm install --save-dev hpal-debug
  > ```

2. Register hpal-debug on your server as a hapi plugin.
  > ```js
  > await server.register(require('hpal-debug'));
  > ```

3. Ensure `server.js` or `server/index.js` exports a function named `deployment` that returns your configured hapi server.
  > Below is a very simple example of boilerplate code to configure a hapi server server, and is not necessarily "production-ready."  For a more complete setup, consider using [the pal boilerplate](https://github.com/hapipal/boilerplate), or check-out its approach as seen [here](https://github.com/hapipal/boilerplate/blob/pal/server/index.js).
  >
  > ```js
  > // server.js
  >
  > 'use strict';
  >
  > const Hapi = require('hapi');
  > const AppPlugin = require('./app');
  >
  > exports.deployment = async (start) => {
  >
  >     const server = Hapi.server();
  >
  >     // Assuming your application (its routes, etc.) live in a plugin
  >     await server.register(AppPlugin);
  >    
  >     if (process.env.NODE_ENV !== 'production') {
  >         await server.register(require('hpal-debug'));
  >     }
  >    
  >     if (start) {
  >         await server.start();
  >         console.log(`Server started at ${server.info.uri}`);
  >     }
  >
  >     return server;
  > };
  >
  > // Start the server only when this file is
  > // run directly from the CLI, i.e. "node ./server"
  >
  > if (!module.parent) {
  >     exports.deployment(true);
  > }
  > ```

And that's it!  Now the hpal-debug commands should be available through the [hpal CLI](https://github.com/hapipal/hpal).  A simple way to check that hpal-debug is setup correctly is to output a pretty display of your route table,

```sh
npx hpal run debug:routes
```

## Usage
### Commands
#### `hpal run debug:routes`
> ```
> hpal run debug:routes <opts>
>   e.g. hpal run debug:routes
> ```

#### `hpal run debug:repl`
> ```
> hpal run debug:repl <opts>
>   e.g. hpal run debug:repl
> ```

#### `hpal run debug:curl`
> ```
> hpal run debug:curl <opts>
>   e.g. hpal run debug:curl
> ```
