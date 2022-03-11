/* eslint class-methods-use-this: 0 */

import { ethers } from 'ethers';
import ExchangeFactorySolidity from '@elasticswap/elasticswap/artifacts/src/contracts/ExchangeFactory.sol/ExchangeFactory.json';
import BaseEvents from '../BaseEvents.mjs';
import ErrorHandling from '../ErrorHandling.mjs';
import Exchange from './Exchange.mjs';
import QueryFilterable from '../QueryFilterable.mjs';
import { validateIsString, validateIsAddress, toKey } from '../utils/utils.mjs';

class Events extends BaseEvents {
  async NewExchange() {
    return this.observeEvent({
      eventName: 'NewExchange',
      keyBase: this.target.address,
      subjectBase: toKey('ExchangeFactory', this.target.address),
    });
  }
}

export default class ExchangeFactory extends QueryFilterable {
  constructor(sdk, address) {
    super(sdk);
    this._address = address;
    this._contract = sdk.contract({
      abi: ExchangeFactorySolidity.abi,
      address,
    });

    this._errorHandling = new ErrorHandling('exchangeFactory');
    this._exchangesByAddress = {}; // mapping indexed by base token and then quote token

    // this.getNewExchangeEvents();
    // start listening to events emitted from the contract for the `NewExchange` event.
    // create a callback function that responds to the event.
    // callback function would create the Exchange class (from the SDK) and store it
    // in a mapping here.
    // this._exchangesByAddress[baseTokenAddress][quoteTokenAddress] = new exchange();

    // this.events.NewExchange().then((obj) => {
    //   console.log('EVENT:', obj);
    // });
  }

  get readonlyContract() {
    return this._contract;
  }

  get address() {
    return this._address;
  }

  get id() {
    return this._address;
  }

  get contract() {
    return this._contract;
  }

  async getFeeAddress() {
    return this._contract.feeAddress();
  }

  // getExchanges() {
  //   // return all exchanges
  // }

  // getExchangeAddress(baseTokenAddress) {
  //   // return this._exchangesByAddress[baseTokenAddress];
  // }

  async getExchange(baseTokenAddress, quoteTokenAddress) {
    // TODO: this should really used a cached mapping that we build from the events.
    // return this._exchangesByAddress[baseTokenAddress][quoteTokenAddress];
    validateIsAddress(baseTokenAddress);
    validateIsAddress(quoteTokenAddress);

    if (
      baseTokenAddress.toLowerCase() ===
      ethers.constants.AddressZero.toLowerCase()
    ) {
      throw this._errorHandling.error('BASE_TOKEN_IS_ZERO_ADDRESS');
    }

    if (
      quoteTokenAddress.toLowerCase() ===
      ethers.constants.AddressZero.toLowerCase()
    ) {
      throw this._errorHandling.error('QUOTE_TOKEN_IS_ZERO_ADDRESS');
    }

    if (baseTokenAddress.toLowerCase() === quoteTokenAddress.toLowerCase()) {
      throw this._errorHandling.error('BASE_TOKEN_SAME_AS_QUOTE');
    }

    // check if we already have this exchange object
    if (this._exchangesByAddress[baseTokenAddress]) {
      if (this._exchangesByAddress[baseTokenAddress][quoteTokenAddress]) {
        return this._exchangesByAddress[baseTokenAddress][quoteTokenAddress];
      }
    } else {
      // we need to create the mapping for this base token
      this._exchangesByAddress[baseTokenAddress] = {};
    }

    // create the new exchange, save it to our mapping and return to user.
    const exchangeAddress = await this.contract.exchangeAddressByTokenAddress(
      baseTokenAddress,
      quoteTokenAddress,
    );
    const exchange = new Exchange(
      this.sdk,
      exchangeAddress,
      baseTokenAddress,
      quoteTokenAddress,
    );
    this._exchangesByAddress[baseTokenAddress][quoteTokenAddress] = exchange;
    return exchange;
  }

  async createNewExchange(
    name,
    symbol,
    baseTokenAddress,
    quoteTokenAddress,
    overrides = {},
  ) {
    validateIsString(name);
    validateIsString(symbol);
    validateIsAddress(baseTokenAddress);
    validateIsAddress(quoteTokenAddress);

    if (
      baseTokenAddress.toLowerCase() ===
      ethers.constants.AddressZero.toLowerCase()
    ) {
      throw this._errorHandling.error('BASE_TOKEN_IS_ZERO_ADDRESS');
    }

    if (
      quoteTokenAddress.toLowerCase() ===
      ethers.constants.AddressZero.toLowerCase()
    ) {
      throw this._errorHandling.error('QUOTE_TOKEN_IS_ZERO_ADDRESS');
    }

    if (baseTokenAddress.toLowerCase() === quoteTokenAddress.toLowerCase()) {
      throw this._errorHandling.error('BASE_TOKEN_SAME_AS_QUOTE');
    }

    // confirm this exchange pair does not exist yet.
    const exchangeAddress = await this.contract.exchangeAddressByTokenAddress(
      baseTokenAddress,
      quoteTokenAddress,
    );

    if (exchangeAddress !== ethers.constants.AddressZero) {
      throw this._errorHandling.error('PAIR_ALREADY_EXISTS');
    }

    this._contract = this.confirmSigner(this.contract);
    const txStatus = await this.contract.createNewExchange(
      name,
      symbol,
      baseTokenAddress,
      quoteTokenAddress,
      this.sanitizeOverrides(overrides),
    );
    return txStatus;
  }

  async getNewExchangeEvents(overrides = {}) {
    let endingBlock = overrides.blockTag;
    if (!endingBlock) {
      endingBlock = await this.sdk.provider.getBlockNumber();
    }

    const results = await this.queryFilter(
      'NewExchange',
      1, // TODO: FIX ME
      endingBlock,
    );

    // results.forEach((event) => createExchangeFromEvent(event));
    return results;
  }

  createExchangeFromEvent(event) {
    console.log(event);
    console.log('Events topics', event.topics);
  }

  get events() {
    const key = toKey(this.id, 'Events');
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    this.cache.set(key, new Events(this), { persist: false });
    return this.cache.get(key);
  }

  _handleTransaction(tx) {
    this.sdk.notify(tx);
    return tx;
  }
}

// Questions for Dan
// 1. Readonly contracts?
// 2. event call backs?
// 3. caching
// 4. handling tx returns (refreshing dao)
// 5. changing wallet signers and recreating contracts?
// IE if we cache the exchanges and then the users changes signers
