/* eslint class-methods-use-this: 0 */
/* eslint no-unused-vars: 0 */

/**
 * An abstract base class for storage adapters. These adapters are used by the Cache class to
 * store loaded blockchain data. The only reason to build one of these is to persist cached data to
 * some store type other than localStorage. By default the LocalStorageAdapter class is used.
 *
 * @export
 * @class StorageAdapter
 */
export default class StorageAdapter {
  constructor() {
    if (new.target === StorageAdapter) {
      throw new TypeError('Abstract Class Warning: Cannot construct StorageAdapter directly');
    }
  }

  /**
   * @readonly
   * @returns {boolean} - true if the adapter is currently available, false otherwise
   * @memberof StorageAdapter
   */
  get available() {
    throw new Error(`${this.constructor.name}.available is not implemented`);
  }

  /**
   * Resolves true if the adapter is currently available.
   * Rejects with an error if the adapter is not available.
   *
   * @returns {Promise}
   * @memberof StorageAdapter
   */
  awaitAvailable() {
    throw new Error(`${this.constructor.name}.awaitAvailable is not implemented`);
  }

  /**
   * Throws an error if the adapter is not available.
   *
   * @memberof StorageAdapter
   */
  ensureAvailable() {
    if (!this.available) {
      throw new Error(`@elasticswap/sdk - ${this.constructor.name}'s adapter is not available`);
    }
  }

  /**
   * Loads data from the storage adapter and returns it
   *
   * @param {string} key - the location of the data to load
   * @return {Promise<any>}
   * @memberof StorageAdapter
   */
  async load(key) {
    throw new Error(`${this.constructor.name}.load is not implemented`);
  }

  /**
   * Stores data in the storage adapter
   *
   * @param {string} key - the location of the data to store
   * @param {*} data - data to store
   * @return {Promise<boolean>} - returns true if no error occurs
   * @memberof StorageAdapter
   */
  async persist(key, data) {
    throw new Error(`${this.constructor.name}.perist is not implemented`);
  }

  /**
   * Removes / deletes stored data
   *
   * @param {string} key - the location of the data to remove
   * @memberof StorageAdapter
   */
  async remove(key) {
    throw new Error(`${this.constructor.name}.remove is not implemented`);
  }
}
