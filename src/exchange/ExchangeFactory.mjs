/* eslint class-methods-use-this: 0 */

import { ethers } from 'ethers';
import Exchange from './Exchange.mjs';
import Cachable from '../Cachable.mjs';
import { isPOJO } from '../utils/typeChecks.mjs';
import { toKey } from '../utils/utils.mjs';
import { validate, validateIsAddress } from '../utils/validations.mjs';

// We don't need this data to persist across loads but we would like it to persist across network
// changes.
const exchanges = {};

// prefix for errors
const prefix = 'ExchangeFactory';

/**
 * Provides a wrapping interface for the ExchangeFactory contract.
 *
 * @export
 * @class ExchangeFactory
 * @extends {Cachable}
 */
export default class ExchangeFactory extends Cachable {
  constructor(sdk, address) {
    super(sdk);
    this._address = address.toLowerCase();
    if (!exchanges[this.address]) {
      exchanges[this.address] = {};
    }
  }

  /**
   * Provides an ethers contract object via the sdk.
   *
   * @param {SDK} sdk - An instance of the SDK class
   * @param {string} address - An EVM compatible contract address
   * @param {boolean} [readonly=false] - Readonly contracts use the provider even if a signer exists
   * @returns {ether.Contract}
   * @see {@link SDK#contract}
   * @memberof ExchangeFactory
   */
  static contract(sdk, address, readonly = false) {
    const abi = sdk.contractAbi('ExchangeFactory');
    return sdk.contract({ abi, address, readonly });
  }

  /**
   * @readonly
   * @see {@link SDK#contract}
   * @see {@link https://docs.ethers.io/v5/api/contract/contract/}
   * @returns {ethers.Contract} contract - An ethers.js Contract instance
   * @memberof ExchangeFactory
   */
  get contract() {
    return this.constructor.contract(this.sdk, this.address);
  }

  /**
   * @readonly
   * @see {@link SDK#contract}
   * @see {@link https://docs.ethers.io/v5/api/contract/contract/}
   * @returns {ethers.Contract} contract - A readonly ethers.js Contract instance
   * @memberof ExchangeFactory
   */
  get readonlyContract() {
    return this.constructor.contract(this.sdk, this.address, true);
  }

  /**
   * Returns the abi for the underlying contract
   *
   * @readonly
   * @memberof ExchangeFactory
   */
  get abi() {
    return this.sdk.contractAbi('ExchangeFactory');
  }

  /**
   * Returns the address of the contract
   *
   * @readonly
   * @memberof ExchangeFactory
   */
  get address() {
    return this._address;
  }

  /**
   * @alias address
   * @readonly
   * @memberof ExchangeFactory
   */
  get id() {
    return this.address;
  }

  /**
   * Returns the currently loaded exchange objects
   *
   * @readonly
   * @memberof ExchangeFactory
   */
  get exchanges() {
    return Object.values(exchanges[this.address] || {});
  }

  /**
   * Creates a new exchange for a token pair
   *
   * emit NewExchange(msg.sender, address(exchange));
   *
   * @param {string} baseTokenAddress - Address of the base token
   * @param {string} quoteTokenAddress - Address of the quote token
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<ethers.TransactionResponse>}
   * @memberof ExchangeFactory
   */
  async createNewExchange(baseTokenAddress, quoteTokenAddress, overrides = {}) {
    validateIsAddress(baseTokenAddress, { prefix });
    validateIsAddress(quoteTokenAddress, { prefix });

    validate(baseTokenAddress.toLowerCase() !== quoteTokenAddress.toLowerCase(), {
      message: 'Cannot create an exchange when Quote and Base tokens are the same',
      prefix,
    });

    validate(
      quoteTokenAddress !== ethers.constants.AddressZero &&
        baseTokenAddress.toLowerCase() !== ethers.constants.AddressZero,
      {
        message: 'Quote and Base tokens must both be ERC20 tokens',
        prefix,
      },
    );

    const existingAddress = await this.exchangeAddressByTokenAddress(
      baseTokenAddress,
      quoteTokenAddress,
      { multicall: true },
    );

    validate(!existingAddress, {
      message: 'An exchange already exists for that pair!',
      prefix,
    });

    // create the exchange
    const receipt = this._handleTransaction(
      await this.contract.createNewExchange(
        baseTokenAddress,
        quoteTokenAddress,
        this.sanitizeOverrides(overrides),
      ),
    );

    // load the exchange object into the local cache
    await this.exchange(baseTokenAddress, quoteTokenAddress);

    // return the receipt
    return receipt;
  }

  /**
   * Initializes an instance of the Exchange class.
   *
   * @param {*} baseTokenAddress
   * @param {*} quoteTokenAddress
   * @param {*} [overrides={}]
   * @return {*}
   * @memberof ExchangeFactory
   */
  async exchange(baseTokenAddress, quoteTokenAddress, overrides) {
    validateIsAddress(baseTokenAddress, { prefix });
    validateIsAddress(quoteTokenAddress, { prefix });

    // find the address of the exchange
    const exchangeAddress = await this.exchangeAddressByTokenAddress(
      baseTokenAddress,
      quoteTokenAddress,
      overrides,
    );

    // there is no exchange yet
    if (!exchangeAddress) {
      return;
    }

    // look for the locally cached existing exchange
    if (exchanges[this.address][exchangeAddress]) {
      /* eslint-disable-next-line consistent-return */
      return exchanges[this.address][exchangeAddress];
    }

    // instantiate a new exchange instance
    exchanges[this.address][exchangeAddress] = new Exchange(
      this.sdk,
      exchangeAddress,
      baseTokenAddress,
      quoteTokenAddress,
    );

    // update subscribers
    this.touch();

    // return the new instance
    /* eslint-disable-next-line consistent-return */
    return exchanges[this.address][exchangeAddress];
  }

  /**
   * Returns the cached version of an exchange if it exists. This may not be 100% accurate. For
   * "the truth", {@see {@link ExchangeFactory#isValidExchange}}.
   *
   * @param {string} address
   * @memberof ExchangeFactory
   */
  exchangeByAddress(address) {
    return exchanges[this.address][address?.toLowerCase()];
  }

  /**
   * Gets the address of the exchange for a token pair. Returns nil if no exchange is available for
   * the requested pair. Stores addresses in the cache to speed up future loads. Uses multicall
   * to look up missing exchange addresses. This is a bit different than the direct method on chain
   * in that it will look for pairs in both configurations, b <> q or q <> b.
   *
   * @param {string} baseTokenAddress - Address of the base token
   * @param {string} quoteTokenAddress - Address of the quote token
   * @param {Object} [overrides] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<string>}
   * @memberof ExchangeFactory
   */
  async exchangeAddressByTokenAddress(baseTokenAddress, quoteTokenAddress, overrides) {
    // if there are overrides and this is not a multicall request, fetch directly from the network
    if (isPOJO(overrides) && !overrides.multicall) {
      return this.readonlyContract.exchangeAddressByTokenAddress(
        baseTokenAddress,
        quoteTokenAddress,
        this.sanitizeOverrides(overrides, true),
      );
    }

    // cache key
    const key = toKey(
      ...[baseTokenAddress, quoteTokenAddress].map((addy) => addy.toLowerCase()).sort(),
      this.sdk.networkHex,
    );

    // if the value is cached and this is not a multicall request, return it
    if (this.cache.has(key) && !overrides?.multicall) {
      return this.cache.get(key);
    }

    // fetch the value from the network using multicall and cache it
    const addresses = await Promise.all([
      this.sdk.multicall.enqueue(this.abi, this.address, 'exchangeAddressByTokenAddress', [
        baseTokenAddress,
        quoteTokenAddress,
      ]),
      this.sdk.multicall.enqueue(this.abi, this.address, 'exchangeAddressByTokenAddress', [
        quoteTokenAddress,
        baseTokenAddress,
      ]),
    ]);

    const exchangeAddress = addresses.find((addy) => addy !== ethers.constants.AddressZero);

    // we don't have an exchange for that address
    if (!exchangeAddress) {
      return undefined;
    }

    // cache the address
    this.cache.set(key, exchangeAddress.toLowerCase());

    // retrun the address
    return this.cache.get(key);
  }

  /**
   * Gets the address of the current fee receiver
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<string>}
   * @memberof ExchangeFactory
   */
  async feeAddress(overrides) {
    // if there are overrides and this is not a multicall request, fetch directly from the network
    if (isPOJO(overrides) && !overrides.multicall) {
      return (
        await this.readonlyContract.feeAddress(this.sanitizeOverrides(overrides, true))
      ).toLowerCase();
    }

    // if the value is cached and this is not a multicall request, return it
    if (this._feeAddress && !overrides?.multicall) {
      return this._feeAddress;
    }

    // fetch the value from the network using multicall and cache it
    this._feeAddress = (
      await this.sdk.multicall.enqueue(this.abi, this.address, 'feeAddress')
    ).toLowerCase();

    // update subscribers
    this.touch();

    // return the cached value
    return this._feeAddress;
  }

  /**
   * Returns true if the address is an exchange deployed by this factory
   *
   * @param {string} address
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {Promise<bool>}
   * @memberof ExchangeFactory
   */
  async isValidExchange(address, overrides) {
    validateIsAddress(address, { prefix });

    const exchangeAddress = address.toLowerCase();

    // if there are overrides, ask the chain directly
    if (isPOJO(overrides)) {
      return this.readonlyContract.isValidExchange(exchangeAddress);
    }

    // if there's a cached exchange object, the address is a valid exchange
    if (exchanges[this.address][exchangeAddress]) {
      return true;
    }

    // fetch from the network using multicall
    const isValidExchange = await this.sdk.multicall.enqueue(
      this.abi,
      this.address,
      'isValidExchange',
      [exchangeAddress],
    );

    // if the address is a valid exchange, load it into the cache
    if (isValidExchange) {
      const exchangeContract = Exchange.contract(this.sdk, exchangeAddress, true);

      // get the tokens
      const [baseTokenAddress, quoteTokenAddress] = await Promise.all([
        exchangeContract.baseTokenAddress(),
        exchangeContract.quoteTokenAddress(),
      ]);

      // initialize the exchange
      exchanges[this.address][exchangeAddress] = new Exchange(
        this.sdk,
        exchangeAddress,
        baseTokenAddress,
        quoteTokenAddress,
      );
    }

    // return the result
    return isValidExchange;
  }

  // wraps the transaction in a notification popup and resolves when it has been mined
  async _handleTransaction(tx) {
    this.sdk.notify(tx);
    const receipt = await tx.wait(2);
    return receipt;
  }
}
