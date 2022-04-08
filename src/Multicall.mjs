import { Contract, Provider } from 'ethers-multicall';

import Base from './Base.mjs';

const TIME_TO_CALL = 50; // time until the requests are auto-called
const MAX_REQUESTS_PER_CALL = 10;

/**
 * A lightweight wrapper for ethers-multicall which allows for collection of many requests
 * TODO: Fork ethers-multicall and have it support multicall2
 *
 * @export
 * @class Multicall
 * @extends {Base}
 */
export default class Multicall extends Base {
  constructor(sdk) {
    super(sdk);
    this._queue = [];
  }

  get queue() {
    return this._queue || [];
  }

  /**
   * Multicall provider built using the current sdk provider.
   *
   * @readonly
   * @memberof Multicall
   */
  get provider() {
    return new Provider(this.sdk.provider, this.sdk.networkId);
  }

  /**
   * Processes all currently queued requests.
   *
   * @return {number} - The number of queued requests processed.
   * @memberof Multicall
   */
  async call() {
    let counter = 0;

    // reset the auto-update timer
    clearTimeout(this._autoCallPid);

    // nothing to ask for
    if (this.queue.length === 0) {
      return counter;
    }

    const handler = async (calls) => {
      // build up requests
      const requests = calls.map((call) => {
        const { abi, address, args, funcName } = call;
        const contract = new Contract(address, abi);
        return contract[funcName](...args);
      });

      // fetch results from the blockchain
      this.provider.all(requests)
        .then((results) => {
          // resolve each request's promise with its result
          for (let i = 0; i < results.length; i += 1) {
            calls[i].resolve(results[i]);
          }
        })
        .catch((error) => {
          // if we error, process the requests individually so only the one with an error fails
          console.error('MULTICALL ERROR', error.message);
          console.warn('MULTICALL FULL ERROR', error);

          for (let i = 0; i < calls.length; i += 1) {
            const { abi, address, args, funcName, resolve, reject } = calls[i];
            this.sdk.contract({ abi, address, readonly: true })[funcName](...args).then(resolve, reject);
          }
        });
    }

    // copy and clear queue
    let nextItem = this._queue.shift();
    let stack = [];

    do {
      stack.push(nextItem);
      counter += 1;

      if (stack.length === MAX_REQUESTS_PER_CALL) {
        handler([...stack]);
        stack = [];
      }
    } while ((nextItem = this._queue.shift()) && !!nextItem);

    handler(stack);
    
    return counter;
  }

  /**
   * Enqueues a request for future processing. Requests are auto-processed after TIME_TO_CALL ms.
   *
   * @param {Array<Object>} abi - The abi for the contract
   * @param {string} address - The address of the contract
   * @param {string} funcName - The name of the function to call
   * @param {Array<*>} [args=[]] - The arguments to pass to the function
   * @return {Promise<*>} - The promise which will be resolved or rejected when the request is made
   * @memberof Multicall
   */
  enqueue(abi, address, funcName, args = []) {
    // reset the auto-update timer
    clearTimeout(this._autoCallPid);

    // auto-update after TIME_TO_CALL ms
    this._autoCallPid = setTimeout(() => this.call(), TIME_TO_CALL);

    return new Promise((resolve, reject) => {
      this._queue.push({ abi, address, args, funcName, resolve, reject });
    });
  }
}
