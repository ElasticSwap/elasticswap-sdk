/* eslint class-methods-use-this: 0 */
import StorageAdapter from './StorageAdapter.mjs';

/**
 * Provides a StorageAdapter implementation that uses the browser's local storage.
 *
 * @export
 * @class LocalStorageAdapter
 * @extends {StorageAdapter}
 */
export default class LocalStorageAdapter extends StorageAdapter {
  /**
   * @readonly
   * @returns {boolean} - true if localStorage is currently available, false otherwise
   * @memberof LocalStorageAdapter
   */
  get available() {
    try {
      const x = '__storage_test__';
      localStorage.setItem(x, x);
      localStorage.removeItem(x);
      return true;
    } catch (e) {
      console.error('@elasticswap/sdk - LocalStorageAdapter: localStorage not available', e);
    }

    return false;
  }

  /**
   * Resolves true if localStorage is currently available.
   * Rejects with an error if localStorage is not available.
   *
   * @return {*}
   * @memberof LocalStorageAdapter
   */
  awaitAvailable() {
    return new Promise((resolve, reject) => {
      if (this.available) {
        resolve(true);
      } else {
        reject(new Error('@elasticswap/sdk - LocalStorageAdapter: localStorage not available'));
      }
    });
  }

  /**
   * Loads data from localStorage, parses it, and returns it
   *
   * @param {string} key - the location of the data to load
   * @return {Promise<any>}
   * @memberof StorageAdapter
   */
  async load(key) {
    await this.awaitAvailable();
    this.ensureAvailable();
    return JSON.parse(localStorage.getItem(key));
  }

  /**
   * Stores data in localStorage as a JSONified string.
   *
   * @param {string} key
   * @param {*} data - Must be something that can be stringified
   * @return {Promise<boolean>} - true if successful
   * @memberof LocalStorageAdapter
   */
  async persist(key, data) {
    await this.awaitAvailable();
    this.ensureAvailable();
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  }

  /**
   * Removes / deletes stored data
   *
   * @param {string} key - the location of the data to remove
   * @memberof LocalStorageAdapter
   */
  async remove(key) {
    await this.awaitAvailable();
    this.ensureAvailable();
    localStorage.removeItem(key);
    return true;
  }
}
