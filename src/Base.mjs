/* eslint class-methods-use-this: 0 */

import { sanitizeOverrides, toBigNumber, toEthersBigNumber, toNumber } from './utils/utils.mjs';
import Subscribable from './Subscribable.mjs';

export default class Base extends Subscribable {
  constructor(sdk) {
    super();
    this._sdk = sdk;
  }

  get fetch() {
    return this.sdk.fetch;
  }

  get sdk() {
    return this._sdk;
  }

  async cachedValue(key, lookup) {
    const promiseKey = `${key}Promise`;
    const deletePromise = () => {
      delete this[promiseKey];
    };

    if (this[promiseKey]) {
      await this[promiseKey].catch(deletePromise);
    }

    if (this[key]) {
      return this[key];
    }

    this[promiseKey] = lookup();
    await this[promiseKey].then(deletePromise, deletePromise);

    return this[key];
  }

  sanitizeOverrides(requested = {}, readonlyMethod = false) {
    return sanitizeOverrides(requested, readonlyMethod);
  }

  toBigNumber(value, decimalShift = 0) {
    return toBigNumber(value, decimalShift);
  }

  toEthersBigNumber(value, decimalShift = 0) {
    return toEthersBigNumber(value, decimalShift);
  }

  toNumber(value, decimalShift = 0) {
    return toNumber(value, decimalShift);
  }

  /**
   * Checks to ensure that we have the same signer attached to our contract as the
   * sdk signer that is registered.  If not this will return a new contract object
   * with the signer connected.  If there is no change the original contract is returned.
   * @param contract ethers contract object
   * @returns
   */
  confirmSigner(contract) {
    if (!contract.signer) {
      return contract.connect(this.sdk.signer);
    }

    if (this.sdk.signer && contract.signer.address !== this.sdk.signer.address) {
      return contract.connect(this.sdk.signer);
    }

    return contract;
  }
}
