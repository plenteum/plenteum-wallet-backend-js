![logo_small_flat](https://user-images.githubusercontent.com/38456463/43392866-43c69cf4-93f5-11e8-81e2-3e3f81b6ca1d.png)

#### Master Build Status
[![Build Status](https://travis-ci.com/plenteum/plenteum-wallet-backend-js.svg?branch=master)](https://travis-ci.com/plenteum/plenteum-wallet-backend-js)

#### NPM
[![NPM](https://nodei.co/npm/plenteum-wallet-backend.png?compact=true)](https://npmjs.org/package/plenteum-wallet-backend)

#### Github

https://github.com/plenteum/plenteum-wallet-backend-js

# plenteum-wallet-backend

Provides an interface to the Plenteum network, allowing wallet applications to be built.

* Downloads blocks from the network, either through a traditional daemon, or a blockchain cache for increased speed
* Processes blocks, decrypting transactions that belong to the user
* Sends and receives transactions

## Installation

NPM:

`npm install plenteum-wallet-backend --save`

Yarn:

`yarn add plenteum-wallet-backend`

## Installation from GitHub

If you need features which have not yet made it into a release yet, you can install from GitHub.

NPM:

`npm install https://github.com/plenteum/plenteum-wallet-backend-js --save`

Yarn:

`yarn add https://github.com/plenteum/plenteum-wallet-backend-js`

## Documentation

[You can view the documentation here](https://plenteum.github.io/plenteum-wallet-backend-js/classes/_walletbackend_.walletbackend.html)

You can see a list of all the other classes on the right side of the screen.
Note that you will need to prefix them all with `WB.` to access them, if you are not using typescript style imports, assuming you imported with `const WB = require('plenteum-wallet-backend')`.

## Quick Start

You can find an [example project in the examples](https://github.com/plenteum/plenteum-wallet-backend-js/tree/master/examples/example1) folder.

### Javascript

```javascript
const WB = require('plenteum-wallet-backend');

(async () => {
    const daemon = new WB.Daemon('127.0.0.1', 44016);
    /* OR
    const daemon = new WB.Daemon('cache.pleapps.plenteum.com', 443);
    */
    
    const wallet = WB.WalletBackend.createWallet(daemon);

    console.log('Created wallet');

    await wallet.start();

    console.log('Started wallet');

    wallet.saveWalletToFile('mywallet.wallet', 'password');

    /* Make sure to call stop to let the node process exit */
    wallet.stop();
})().catch(err => {
    console.log('Caught promise rejection: ' + err);
});
```

### Typescript

```typescript
import { WalletBackend, Daemon, IDaemon } from 'plenteum-wallet-backend';

(async () => {
    const daemon: IDaemon = new Daemon('127.0.0.1', 44016);

    /* OR
    const daemon: IDaemon = new Daemon('cache.pleapps.plenteum.com', 443);
    */

    const wallet: WalletBackend = WalletBackend.createWallet(daemon);

    console.log('Created wallet');

    await wallet.start();

    console.log('Started wallet');

    wallet.saveWalletToFile('mywallet.wallet', 'password');

    /* Make sure to call stop to let the node process exit */
    wallet.stop();
})().catch(err => {
    console.log('Caught promise rejection: ' + err);
});
```

## Configuration

There are a few features which you may wish to configure that are worth mentioning.

### Auto Optimize

Auto optimization is enabled by default. This makes the wallet automatically send fusion transactions when needed to keep the wallet permanently optimized.

To enable/disable this feature, use the following code:

```javascript
wallet.enableAutoOptimization(false); // disables auto optimization
```

### Coinbase Transaction Scanning

By default, coinbase transactions are not scanned.
This is due to the majority of people not having solo mined any blocks.

If you wish to enable coinbase transaction scanning, run this line of code:

```javascript
wallet.scanCoinbaseTransactions(true)
```

### Logging

By default, the logger is disabled. You can enable it like so:

```javascript
wallet.setLogLevel(WB.LogLevel.DEBUG);
```

and in typescript:

```typescript
wallet.setLogLevel(LogLevel.DEBUG);
```

The logger uses console.log, i.e. it outputs to stdout.

If you want to change this, or want more control over what messages are logged,
you can provide a callback for the logger to call.

```javascript
wallet.setLoggerCallback((prettyMessage, message, level, categories) => {
    if (categories.includes(WB.LogCategory.SYNC)) {
        console.log(prettyMessage);
    }
});
```

and in typescript:

```typescript
wallet.setLoggerCallback((prettyMessage, message, level, categories) => {
    if (categories.includes(LogCategory.SYNC)) {
        console.log(prettyMessage);
    }
});
```

In this example, we only print messages that fall into the SYNC category.

You can view available categories and log levels in the documentation.

## Changelog

### v3.5.0

* Update dependency version for plenteum-utils

### v3.4.9

* Fix heightchange being emitted on topblock when there are still blocks remaining to be processed

### v3.4.8

* `on('heightchange')` is now emitted when `reset()`, `rewind()`, or `rescan()` is used.
* `on('heightchange')` is now emitted when a top block is stored, fixing wallet height lagging behind network height.

### v3.4.7

* Fix issue with removeForkedTransactions, which also effected `rewind()`

### v3.4.6

* Add `rewind()`
* Add `on('heightchange')` event
* More improvements to keep-alive, max sockets, etc

### v3.4.5

* Fix bug causing balance from sent transaction to appear in both locked + unlocked balance

### v3.4.4

* Fix bug with how forked transactions were handled
* Increase max sockets to use with request to fix timeouts in some environments
* Fix bug where transactions to yourself had an incorrect amount when locked

### v3.4.3

* Add `on('disconnect')` and `on('connect')` events for daemon

### v3.4.2
* Update `plenteum-utils` dependency
Start of changelog.

## Contributing

### Building (For Developers)

`git clone https://github.com/plenteum/plenteum-wallet-backend-js.git`

`cd plenteum-wallet-backend`

`npm install -g yarn` (Skip this if you already have yarn installed)

`yarn build`

Generated javascript files will be written to the dist/lib/ folder.

### Running tests

`yarn test` - This will run the basic tests

`yarn test-all` - This will run all tests, including performance tests.

### Before making a PR

* Ensure you are editing the TypeScript code, and not the JavaScript code (You should be in the `lib/` folder)
* Ensure you have built the JavaScript code from the TypeScript code: `yarn build`
* Ensure you have updated the documentation if necessary - Documentation is generated from inline comments, jsdoc style.
* Ensure you have rebuilt the documentation, if you have changed it: `yarn docs`
* Ensure the tests all still pass: `yarn test`, or `yarn test-all` if you have a local daemon running.
* Ensure your code adheres to the style requirements: `yarn style`

You can try running `yarn style --fix` to automatically fix issues.
