/* eslint class-methods-use-this: 0 */

import { ethers } from 'ethers';
import ExchangeFactoryContract from '@elasticswap/elasticswap/artifacts/src/contracts/ExchangeFactory.sol/ExchangeFactory.json';
import ErrorHandling from '../ErrorHandling.mjs';
import Exchange from './Exchange.mjs';
import QueryFilterable from '../QueryFilterable.mjs';
import { validateIsAddress } from '../utils/validations.mjs';

/**
 * Provides a wrapping interface for the ExchangeFactory contract.
 *
 * @export
 * @class ExchangeFactory
 * @extends {QueryFilterable}
 */
export default class ExchangeFactory extends QueryFilterable {
  constructor(sdk, address) {
    super(sdk);
    this._address = address;

    this._errorHandling = new ErrorHandling('exchangeFactory');
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
    return sdk.contract({
      abi: ExchangeFactoryContract.abi,
      address,
      readonly,
    });
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
    validateIsAddress(baseTokenAddress);
    validateIsAddress(quoteTokenAddress);

    if (baseTokenAddress.toLowerCase() === ethers.constants.AddressZero) {
      throw this._errorHandling.error('BASE_TOKEN_IS_ZERO_ADDRESS');
    }

    if (quoteTokenAddress.toLowerCase() === ethers.constants.AddressZero) {
      throw this._errorHandling.error('QUOTE_TOKEN_IS_ZERO_ADDRESS');
    }

    if (baseTokenAddress.toLowerCase() === quoteTokenAddress.toLowerCase()) {
      throw this._errorHandling.error('BASE_TOKEN_SAME_AS_QUOTE');
    }

    return this._handleTransaction(
      await this.contract.createNewExchange(
        baseTokenAddress,
        quoteTokenAddress,
        this.sanitizeOverrides(overrides),
      ),
    );
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
  async exchange(baseTokenAddress, quoteTokenAddress, overrides = {}) {
    validateIsAddress(baseTokenAddress);
    validateIsAddress(baseTokenAddress);

    const exchangeAddress = await this.exchangeAddressByTokenAddress(
      baseTokenAddress,
      quoteTokenAddress,
      overrides,
    );

    if (!exchangeAddress) {
      return;
    }

    /* eslint-disable-next-line consistent-return */
    return new Exchange(this.sdk, exchangeAddress, baseTokenAddress, quoteTokenAddress);
  }

  /**
   * Gets the address of the exchange for a token pair. Returns nil if no exchange is available for
   * the requested pair.
   *
   * @param {string} baseTokenAddress - Address of the base token
   * @param {string} quoteTokenAddress - Address of the quote token
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<string>}
   * @memberof ExchangeFactory
   */
  async exchangeAddressByTokenAddress(baseTokenAddress, quoteTokenAddress, overrides = {}) {
    const exchangeAddress = (
      await this.contract.exchangeAddressByTokenAddress(
        baseTokenAddress,
        quoteTokenAddress,
        this.sanitizeOverrides(overrides, true),
      )
    ).toLowerCase();

    if (exchangeAddress === ethers.constants.AddressZero) {
      return undefined;
    }

    return exchangeAddress;
  }

  /**
   * Gets the address of the current fee receiver
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<string>}
   * @memberof ExchangeFactory
   */
  async feeAddress(overrides = {}) {
    return (
      await this.readonlyContract.feeAddress(this.sanitizeOverrides(overrides, true))
    ).toLowerCase();
  }

  // wraps the transaction in a notification popup and resolves when it has been mined
  async _handleTransaction(tx) {
    this.sdk.notify(tx);
    const receipt = await tx.wait(1);
    return receipt;
  }
}
