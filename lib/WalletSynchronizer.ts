// Copyright (c) 2018, Zpalmtree
//
// Please see the included LICENSE file for more information.

import * as _ from 'lodash';
const sizeof = require('object-sizeof');

import { EventEmitter } from 'events';

import { Config } from './Config';
import { IDaemon } from './IDaemon';
import { SubWallets } from './SubWallets';
import { delay, prettyPrintBytes } from './Utilities';
import { LAST_KNOWN_BLOCK_HASHES_SIZE } from './Constants';
import { SynchronizationStatus } from './SynchronizationStatus';
import { WalletSynchronizerJSON } from './JsonSerialization';
import { LogCategory, logger, LogLevel } from './Logger';
import { underivePublicKey, generateKeyDerivation } from './CryptoWrapper';

import {
    Block, KeyInput, RawCoinbaseTransaction, RawTransaction, Transaction,
    TransactionData, TransactionInput, TopBlock,
} from './Types';

/**
 * Decrypts blocks for our transactions and inputs
 */
export class WalletSynchronizer extends EventEmitter {

    public static fromJSON(json: WalletSynchronizerJSON): WalletSynchronizer {
        const walletSynchronizer = Object.create(WalletSynchronizer.prototype);

        return Object.assign(walletSynchronizer, {
            privateViewKey: json.privateViewKey,
            startHeight: json.startHeight,
            startTimestamp: json.startTimestamp,
            synchronizationStatus: SynchronizationStatus.fromJSON(json.transactionSynchronizerStatus),
        });
    }

    /**
     * The daemon instance to retrieve blocks from
     */
    private daemon: IDaemon;

    /**
     * The timestamp to start taking blocks from
     */
    private startTimestamp: number;

    /**
     * The height to start taking blocks from
     */
    private startHeight: number;

    /**
     * The shared private view key of this wallet
     */
    private readonly privateViewKey: string;

    /**
     * Stores the progress of our synchronization
     */
    private synchronizationStatus: SynchronizationStatus = new SynchronizationStatus();

    /**
     * Used to find spend keys, inspect key images, etc
     */
    private subWallets: SubWallets;

    /**
     * Whether we are already downloading a chunk of blocks
     */
    private fetchingBlocks: boolean = false;

    /**
     * Stored blocks for later processing
     */
    private storedBlocks: Block[] = [];

    /**
     * Transactions that have disappeared from the pool and not appeared in a
     * block, and the amount of times they have failed this check.
     */
    private cancelledTransactionsFailCount: Map<string, number> = new Map();

    /**
     * Function to run on block download completion to ensure reset() works
     * correctly without blocks being stored after wiping them.
     */
    private finishedFunc: (() => void) | undefined = undefined;

    private config: Config = new Config();

    constructor(
        daemon: IDaemon,
        subWallets: SubWallets,
        startTimestamp: number,
        startHeight: number,
        privateViewKey: string,
        config: Config) {

        super();

        this.daemon = daemon;
        this.startTimestamp = startTimestamp;
        this.startHeight = startHeight;
        this.privateViewKey = privateViewKey;
        this.subWallets = subWallets;
        this.config = config;
    }

    public swapNode(newDaemon: IDaemon): void {
        this.daemon = newDaemon;
    }

    public getScanHeights(): [number, number] {
        return [this.startHeight, this.startTimestamp];
    }

    /**
     * Initialize things we can't initialize from the JSON
     */
    public initAfterLoad(subWallets: SubWallets, daemon: IDaemon, config: Config): void {
        this.subWallets = subWallets;
        this.daemon = daemon;
        this.storedBlocks = [];
        this.config = config;
        this.cancelledTransactionsFailCount = new Map();
    }

    /**
     * Convert from class to stringable type
     */
    public toJSON(): WalletSynchronizerJSON {
        return {
            privateViewKey: this.privateViewKey,
            startHeight: this.startHeight,
            startTimestamp: this.startTimestamp,
            transactionSynchronizerStatus: this.synchronizationStatus.toJSON(),
        };
    }

    public processBlock(
        block: Block,
        ourInputs: Array<[string, TransactionInput]>) {

        const txData: TransactionData = new TransactionData();

        if (this.config.scanCoinbaseTransactions) {
            const tx: Transaction | undefined = this.processCoinbaseTransaction(
                block, ourInputs,
            );

            if (tx !== undefined) {
                txData.transactionsToAdd.push(tx);
            }
        }

        for (const rawTX of block.transactions) {
            const [tx, keyImagesToMarkSpent] = this.processTransaction(
                block, ourInputs, rawTX,
            );

            if (tx !== undefined) {
                txData.transactionsToAdd.push(tx);
                txData.keyImagesToMarkSpent = txData.keyImagesToMarkSpent.concat(
                    keyImagesToMarkSpent,
                );
            }
        }

        txData.inputsToAdd = ourInputs;

        return txData;
    }

    /**
     * Process transaction outputs of the given block. No external dependencies,
     * lets us easily swap out with a C++ replacement for SPEEEED
     *
     * @param keys Array of spend keys in the format [publicKey, privateKey]
     */
    public async processBlockOutputs(
        block: Block,
        privateViewKey: string,
        spendKeys: Array<[string, string]>,
        isViewWallet: boolean,
        processCoinbaseTransactions: boolean): Promise<Array<[string, TransactionInput]>> {

        let inputs: Array<[string, TransactionInput]> = [];

        /* Process the coinbase tx if we're not skipping them for speed */
        if (processCoinbaseTransactions && block.coinbaseTransaction) {
            inputs = inputs.concat(await this.processTransactionOutputs(
                block.coinbaseTransaction, block.blockHeight,
            ));
        }

        /* Process the normal txs */
        for (const tx of block.transactions) {
            inputs = inputs.concat(await this.processTransactionOutputs(
                tx, block.blockHeight,
            ));
        }

        return inputs;
    }

    /**
     * Get the height of the sync process
     */
    public getHeight(): number {
        return this.synchronizationStatus.getHeight();
    }

    public reset(scanHeight: number, scanTimestamp: number): Promise<void> {
        return new Promise((resolve) => {
            const f = () => {
                this.startHeight = scanHeight;
                this.startTimestamp = scanTimestamp;
                /* Discard sync status */
                this.synchronizationStatus = new SynchronizationStatus(scanHeight - 1);
                this.storedBlocks = [];
            };

            if (this.fetchingBlocks) {
                this.finishedFunc = () => {
                    f();
                    resolve();
                    this.finishedFunc = undefined;
                };
            } else {
                f();
                resolve();
            }
        });
    }

    public rewind(scanHeight: number): Promise<void> {
        return new Promise((resolve) => {
            const f = () => {
                this.startHeight = scanHeight;
                this.startTimestamp = 0;
                /* Discard sync status */
                this.synchronizationStatus = new SynchronizationStatus(scanHeight - 1);
                this.storedBlocks = [];
            };

            if (this.fetchingBlocks) {
                this.finishedFunc = () => {
                    f();
                    resolve();
                    this.finishedFunc = undefined;
                };
            } else {
                f();
                resolve();
            }
        });
    }

    /**
     * Takes in hashes that we have previously sent. Returns transactions which
     * are no longer in the pool, and not in a block, and therefore have
     * returned to our wallet
     */
    public async findCancelledTransactions(transactionHashes: string[]): Promise<string[]> {
        /* This is the common case - don't waste time making a useless request
           to the daemon */
        if (_.isEmpty(transactionHashes)) {
            return [];
        }

        const cancelled: string[] = await this.daemon.getCancelledTransactions(transactionHashes);

        const toRemove: string[] = [];

        for (const [hash, failCount] of this.cancelledTransactionsFailCount) {
            /* Hash still not found, increment fail count */
            if (cancelled.includes(hash)) {
                /* Failed too many times, cancel transaction, return funds to wallet */
                if (failCount === 10) {
                    toRemove.push(hash);
                    this.cancelledTransactionsFailCount.delete(hash);
                } else {
                    this.cancelledTransactionsFailCount.set(hash, failCount + 1);
                }
            /* Hash has since been found, remove from fail count array */
            } else {
                this.cancelledTransactionsFailCount.delete(hash);
            }
        }

        for (const hash of cancelled) {
            /* Transaction with no history, first fail, add to map. */
            if (!this.cancelledTransactionsFailCount.has(hash)) {
                this.cancelledTransactionsFailCount.set(hash, 1);
            }
        }

        return toRemove;
    }

    /**
     * Retrieve blockCount blocks from the internal store. Does not remove
     * them.
     */
    public async fetchBlocks(blockCount: number): Promise<Block[]> {
        /* Fetch more blocks if we haven't got any downloaded yet */
        if (this.storedBlocks.length === 0) {
            logger.log(
                'No blocks stored, fetching more.',
                LogLevel.DEBUG,
                LogCategory.SYNC,
            );

            await this.downloadBlocks();
        }

        return _.take(this.storedBlocks, blockCount);
    }

    public dropBlock(blockHeight: number, blockHash: string): void {
        /* it's possible for this function to get ran twice.
           Need to make sure we don't remove more than the block we just
           processed. */
        if (this.storedBlocks.length >= 1 &&
            this.storedBlocks[0].blockHeight === blockHeight &&
            this.storedBlocks[0].blockHash === blockHash) {

            this.storedBlocks = _.drop(this.storedBlocks);

            this.synchronizationStatus.storeBlockHash(blockHeight, blockHash);
        }

        /* sizeof() gets a tad expensive... */
        if (blockHeight % 10 === 0 && this.shouldFetchMoreBlocks()) {
            /* Note - not awaiting here */
            this.downloadBlocks();
        }
    }

    private getStoredBlockCheckpoints(): string[] {
        const hashes = [];

        for (const block of this.storedBlocks) {
            /* Add to start of array - we want hashes in descending block height order */
            hashes.unshift(block.blockHash);
        }

        return _.take(hashes, LAST_KNOWN_BLOCK_HASHES_SIZE);
    }

    /**
     * Only retrieve more blocks if we're not getting close to the memory limit
     */
    private shouldFetchMoreBlocks(): boolean {
        /* Don't fetch more if we're already doing so */
        if (this.fetchingBlocks) {
            return false;
        }

        const ramUsage = sizeof(this.storedBlocks);

        if (ramUsage < this.config.blockStoreMemoryLimit) {
            logger.log(
                `Approximate ram usage of stored blocks: ${prettyPrintBytes(ramUsage)}, fetching more.`,
                LogLevel.DEBUG,
                LogCategory.SYNC,
            );

            return true;
        }

        return false;
    }

    private getBlockCheckpoints(): string[] {
        const unprocessedBlockHashes: string[] = this.getStoredBlockCheckpoints();

        const recentProcessedBlockHashes: string[] = this.synchronizationStatus.getRecentBlockHashes();

        const blockHashCheckpoints: string[] = this.synchronizationStatus.getBlockCheckpoints();

        const combined = unprocessedBlockHashes.concat(recentProcessedBlockHashes);

        /* Take the 50 most recent block hashes, along with the infrequent
           checkpoints, to handle deep forks. */
        return _.take(combined, LAST_KNOWN_BLOCK_HASHES_SIZE)
                .concat(blockHashCheckpoints);
    }

    private async downloadBlocks(): Promise<void> {
        /* Don't make more than one fetch request at once */
        if (this.fetchingBlocks) {
            return;
        }

        this.fetchingBlocks = true;

        const localDaemonBlockCount: number = this.daemon.getLocalDaemonBlockCount();
        const walletBlockCount: number = this.getHeight();

        if (localDaemonBlockCount < walletBlockCount) {
            this.fetchingBlocks = false;
            return;
        }

        /* Get the checkpoints of the blocks we've got stored, so we can fetch
           later ones. Also use the checkpoints of the previously processed
           ones, in case we don't have any blocks yet. */
        const blockCheckpoints: string[] = this.getBlockCheckpoints();

        let blocks: Block[] = [];
        let topBlock: TopBlock | undefined;

        try {
            [blocks, topBlock] = await this.daemon.getWalletSyncData(
                blockCheckpoints, this.startHeight, this.startTimestamp,
                this.config.blocksPerDaemonRequest,
            );
        } catch (err) {
            logger.log(
                'Failed to get blocks from daemon',
                LogLevel.DEBUG,
                LogCategory.SYNC,
            );

            if (this.finishedFunc) {
                this.finishedFunc();
            }

            this.fetchingBlocks = false;

            return;
        }

        if (topBlock && blocks.length === 0) {
            if (this.finishedFunc) {
                this.finishedFunc();
            }

            this.synchronizationStatus.storeBlockHash(topBlock.height, topBlock.hash);

            /* Synced, store the top block so sync status displays correctly if
               we are not scanning coinbase tx only blocks. */
            if (this.storedBlocks.length === 0) {
                this.emit('heightchange', topBlock.height);
            }

            logger.log(
                'Zero blocks received from daemon, fully synced',
                LogLevel.DEBUG,
                LogCategory.SYNC,
            );

            if (this.finishedFunc) {
                this.finishedFunc();
            }

            this.fetchingBlocks = false;

            return;
        }

        if (blocks.length === 0) {
            logger.log(
                'Zero blocks received from daemon, possibly fully synced',
                LogLevel.DEBUG,
                LogCategory.SYNC,
            );

            if (this.finishedFunc) {
                this.finishedFunc();
            }

            this.fetchingBlocks = false;

            return;
        }

        /* Timestamp is transient and can change - block height is constant. */
        if (this.startTimestamp !== 0) {
            this.startTimestamp = 0;
            this.startHeight = blocks[0].blockHeight;

            this.subWallets.convertSyncTimestampToHeight(
                this.startTimestamp, this.startHeight,
            );
        }

        /* Add the new blocks to the store */
        this.storedBlocks = this.storedBlocks.concat(blocks);

        if (this.finishedFunc) {
            this.finishedFunc();
        }

        this.fetchingBlocks = false;
    }

    /**
     * Process the outputs of a transaction, and create inputs that are ours
     */
    private async processTransactionOutputs(
        rawTX: RawCoinbaseTransaction,
        blockHeight: number): Promise<Array<[string, TransactionInput]>> {

        const inputs: Array<[string, TransactionInput]> = [];

        const derivation: string = await generateKeyDerivation(
            rawTX.transactionPublicKey, this.privateViewKey, this.config,
        );

        const spendKeys: string[] = this.subWallets.getPublicSpendKeys();

        for (const [outputIndex, output] of rawTX.keyOutputs.entries()) {
            /* Derive the spend key from the transaction, using the previous
               derivation */
            const derivedSpendKey = await underivePublicKey(
                derivation, outputIndex, output.key, this.config,
            );

            /* See if the derived spend key matches any of our spend keys */
            if (!_.includes(spendKeys, derivedSpendKey)) {
                continue;
            }

            /* The public spend key of the subwallet that owns this input */
            const ownerSpendKey = derivedSpendKey;

            /* Not spent yet! */
            const spendHeight: number = 0;

            const keyImage = await this.subWallets.getTxInputKeyImage(
                ownerSpendKey, derivation, outputIndex,
            );

            const txInput: TransactionInput = new TransactionInput(
                keyImage, output.amount, blockHeight,
                rawTX.transactionPublicKey, outputIndex, output.globalIndex,
                output.key, spendHeight, rawTX.unlockTime, rawTX.hash,
            );

            inputs.push([ownerSpendKey, txInput]);
        }

        return inputs;
    }

    private processCoinbaseTransaction(
        block: Block,
        ourInputs: Array<[string, TransactionInput]>): Transaction | undefined {

        /* Should be guaranteed to be defined here */
        const rawTX: RawCoinbaseTransaction = block.coinbaseTransaction as RawCoinbaseTransaction;

        const transfers: Map<string, number> = new Map();

        const relevantInputs: Array<[string, TransactionInput]>
            = _.filter(ourInputs, ([key, input]) => {
            return input.parentTransactionHash === rawTX.hash;
        });

        for (const [publicSpendKey, input] of relevantInputs) {
            transfers.set(
                publicSpendKey,
                input.amount + (transfers.get(publicSpendKey) || 0),
            );
        }

        if (!_.isEmpty(transfers)) {
            /* Coinbase transaction have no fee */
            const fee: number = 0;

            const isCoinbaseTransaction: boolean = true;

            /* Coinbase transactions can't have payment ID's */
            const paymentID: string = '';

            return new Transaction(
                transfers, rawTX.hash, fee, block.blockHeight, block.blockTimestamp,
                paymentID, rawTX.unlockTime, isCoinbaseTransaction,
            );
        }

        return undefined;
    }

    private processTransaction(
        block: Block,
        ourInputs: Array<[string, TransactionInput]>,
        rawTX: RawTransaction): [Transaction | undefined, Array<[string, string]>] {

        const transfers: Map<string, number> = new Map();

        const relevantInputs: Array<[string, TransactionInput]>
            = _.filter(ourInputs, ([key, input]) => {
            return input.parentTransactionHash === rawTX.hash;
        });

        for (const [publicSpendKey, input] of relevantInputs) {
            transfers.set(
                publicSpendKey,
                input.amount + (transfers.get(publicSpendKey) || 0),
            );
        }

        const spentKeyImages: Array<[string, string]> = [];

        for (const input of rawTX.keyInputs) {
            const [found, publicSpendKey] = this.subWallets.getKeyImageOwner(
                input.keyImage,
            );

            if (found) {
                transfers.set(
                    publicSpendKey,
                    -input.amount + (transfers.get(publicSpendKey) || 0),
                );

                spentKeyImages.push([publicSpendKey, input.keyImage]);
            }
        }

        if (!_.isEmpty(transfers)) {
            const fee: number = _.sumBy(rawTX.keyInputs,  'amount') -
                                _.sumBy(rawTX.keyOutputs, 'amount');

            const isCoinbaseTransaction: boolean = false;

            return [new Transaction(
                transfers, rawTX.hash, fee, block.blockHeight,
                block.blockTimestamp, rawTX.paymentID, rawTX.unlockTime,
                isCoinbaseTransaction,
            ), spentKeyImages];
        }

        return [undefined, []];
    }
}
