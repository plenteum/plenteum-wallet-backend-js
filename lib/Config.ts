// Copyright (C) 2018, Zpalmtree
//
// Please see the included LICENSE file for more information.

import { MixinLimit, MixinLimits } from './MixinLimits';

/**
 * Configuration for the wallet backend.
 *
 * Everything is optional.
 */
export interface IConfig {
    /**
     * The amount of decimal places your coin has, e.g. Plenteum has eight
     * decimals
     */
    decimalPlaces?: number;

    /**
     * The address prefix your coin uses - you can find this in CryptoNoteConfig.h.
     * In Plenteum, this converts to PLe
     */
    addressPrefix?: number;

    /**
     * Request timeout for daemon operations in milliseconds
     */
    requestTimeout?: number;

    /**
     * The block time of your coin, in seconds
     */
    blockTargetTime?: number;

    /**
     * How often to process blocks, in millseconds
     */
    syncThreadInterval?: number;

    /**
     * How often to update the daemon info
     */
    daemonUpdateInterval?: number;

    /**
     * How often to check on locked transactions
     */
    lockedTransactionsCheckInterval?: number;

    /**
     * The amount of blocks to process per 'tick' of the mainloop. Note: too
     * high a value will cause the event loop to be blocked, and your interaction
     * to be laggy.
     */
    blocksPerTick?: number;

    /**
     * Your coins 'ticker', generally used to refer to the coin, i.e. 123 PLE
     */
    ticker?: string;

    /**
     * Most people haven't mined any blocks, so lets not waste time scanning
     * them
     */
    scanCoinbaseTransactions?: boolean;

    /**
     * The minimum fee allowed for transactions, in ATOMIC units
     */
    minimumFee?: number;

    /**
     * Mapping of height to mixin maximum and mixin minimum
     */
    mixinLimits?: MixinLimits;

    /**
     * The length of a standard address for your coin
     */
    standardAddressLength?: number;

    /**
     * The length of an integrated address for your coin - It's the same as
     * a normal address, but there is a paymentID included in there - since
     * payment ID's are 64 chars, and base58 encoding is done by encoding
     * chunks of 8 chars at once into blocks of 11 chars, we can calculate
     * this automatically
     */
    integratedAddressLength?: number;

    /**
     * A replacement function for the JS/C++ underivePublicKey.
     */
    underivePublicKey?: (derivation: string,
                         outputIndex: number,
                         outputKey: string) => string;

    /**
     * A replacement function for the JS/C++ derivePublicKey.
     */
    derivePublicKey?: (derivation: string,
                       outputIndex: number,
                       publicKey: string) => string;

    /**
     * A replacement function for the JS/C++ deriveSecretKey.
     */
    deriveSecretKey?: (derivation: string,
                       outputIndex: number,
                       privateKey: string) => string;

    /**
     * A replacement function for the JS/C++ generateKeyImage.
     */
    generateKeyImage?: (publicKey: string,
                        privateKey: string) => string;

    /**
     * A replacement function for the JS/C++ secretKeyToPublicKey.
     */
    secretKeyToPublicKey?: (privateKey: string) => string;

    /**
     * A replacement function for the JS/C++ cnFastHash.
     */
    cnFastHash?: (input: string) => string;

    /**
     * A replacement function for the JS/C++ generateRingSignatures.
     */
    generateRingSignatures?: (transactionPrefixHash: string,
                              keyImage: string,
                              inputKeys: string[],
                              privateKey: string,
                              realIndex: number) => string[];

    /**
     * A replacement function for the JS/C++ generateKeyDerivation.
     */
    generateKeyDerivation?: (transactionPublicKey: string,
                             privateViewKey: string) => string;

    /**
     * The max amount of memory to use, storing downloaded blocks to be processed.
     */
    blockStoreMemoryLimit?: number;

    /**
     * The amount of blocks to take from the daemon per request. Cannot take
     * more than 100.
     */
    blocksPerDaemonRequest?: number;

    [key: string]: any;
}

/**
 * Configuration for the wallet backend
 *
 * @hidden
 */
export class Config implements IConfig {
    /**
     * The amount of decimal places your coin has, e.g. Plenteum has eight
     * decimals
     */
    public decimalPlaces: number = 8;

    /**
     * The address prefix your coin uses - you can find this in CryptoNoteConfig.h.
     * In Plenteum, this converts to PLe
     */
    public addressPrefix: number = 18181;

    /**
     * Request timeout for daemon operations in milliseconds
     */
    public requestTimeout: number = 10 * 1000;

    /**
     * The block time of your coin, in seconds
     */
    public blockTargetTime: number = 120;

    /**
     * How often to process blocks, in millseconds
     */
    public syncThreadInterval: number = 10;

    /**
     * How often to update the daemon info
     */
    public daemonUpdateInterval: number = 10 * 1000;

    /**
     * How often to check on locked transactions
     */
    public lockedTransactionsCheckInterval: number = 30 * 1000;

    /**
     * The amount of blocks to process per 'tick' of the mainloop. Note: too
     * high a value will cause the event loop to be blocked, and your interaction
     * to be laggy.
     */
    public blocksPerTick: number = 1;

    /**
     * Your coins 'ticker', generally used to refer to the coin, i.e. 123 PLE
     */
    public ticker: string = 'PLE';

    /**
     * Most people haven't mined any blocks, so lets not waste time scanning
     * them
     */
    public scanCoinbaseTransactions: boolean = true;

    /**
     * The minimum fee allowed for transactions, in ATOMIC units
     */
    public minimumFee: number = 0;

    /**
     * Mapping of height to mixin maximum and mixin minimum
     */
    public mixinLimits: MixinLimits = new MixinLimits([
        /* Height: 440,000, minMixin: 0, maxMixin: 100, defaultMixin: 3 */
        new MixinLimit(400000, 3, 7, 3),
    ], 0 /* Default mixin of 0 before block 400,000 */);

    /**
     * The length of a standard address for your coin
     */
    public standardAddressLength: number = 98;

    /* The length of an integrated address for your coin - It's the same as
       a normal address, but there is a paymentID included in there - since
       payment ID's are 64 chars, and base58 encoding is done by encoding
       chunks of 8 chars at once into blocks of 11 chars, we can calculate
       this automatically */
    public integratedAddressLength: number = 98 + ((64 * 11) / 8);

    /**
     * A replacement function for the JS/C++ underivePublicKey.
     */
    public underivePublicKey?: (derivation: string,
                                outputIndex: number,
                                outputKey: string) => string = undefined;

    /**
     * A replacement function for the JS/C++ derivePublicKey.
     */
    public derivePublicKey?: (derivation: string,
                              outputIndex: number,
                              publicKey: string) => string = undefined;

    /**
     * A replacement function for the JS/C++ deriveSecretKey.
     */
    public deriveSecretKey?: (derivation: string,
                              outputIndex: number,
                              privateKey: string) => string = undefined;

    /**
     * A replacement function for the JS/C++ generateKeyImage.
     */
    public generateKeyImage?: (publicKey: string,
                               privateKey: string) => string = undefined;

    /**
     * A replacement function for the JS/C++ secretKeyToPublicKey.
     */
    public secretKeyToPublicKey?: (privateKey: string) => string = undefined;

    /**
     * A replacement function for the JS/C++ cnFastHash.
     */
    public cnFastHash?: (input: string) => string = undefined;

    /**
     * A replacement function for the JS/C++ generateRingSignatures.
     */
    public generateRingSignatures?: (transactionPrefixHash: string,
                                     keyImage: string,
                                     inputKeys: string[],
                                     privateKey: string,
                                     realIndex: number) => string[] = undefined;

    /**
     * A replacement function for the JS/C++ generateKeyDerivation.
     */
    public generateKeyDerivation?: (transactionPublicKey: string,
                                    privateViewKey: string) => string = undefined;

    /**
     * The amount of memory to use storing downloaded blocks - 50MB
     */
    public blockStoreMemoryLimit: number = 1024 * 1024 * 50;

    /**
     * The amount of blocks to take from the daemon per request. Cannot take
     * more than 100.
     */
    public blocksPerDaemonRequest: number = 100;

    [key: string]: any;
}

/**
 * Merge the default config with the provided config
 *
 * @hidden
 */
export function MergeConfig(config?: IConfig, currentConfig = new Config()): Config {
    /* Clone the given config so we don't alter it */
    const finalConfig = Object.create(
        Object.getPrototypeOf(currentConfig),
        Object.getOwnPropertyDescriptors(currentConfig),
    );

    if (!config) {
        return finalConfig;
    }

    for (const [key, value] of Object.entries(config)) {
        finalConfig[key] = value;
    }

    return finalConfig;
}
