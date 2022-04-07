import Cachable from '../Cachable.mjs';
import ERC20 from './ERC20.mjs';
import { toBigNumber, toHex } from '../utils/utils.mjs';
import { validateIsAddress } from '../utils/validations.mjs';

const UPDATE_INTERVAL = 300000; // 5 minutes

const versionCompilation = ({ major = 0, minor = 0, patch = 0 } = {}) =>
  toBigNumber(`${major}${minor.toString().padStart(6, '0')}${patch.toString().padStart(6, '0')}`);

/**
 * Provides a wrapped for the ERC20 class that returns everything expected to be in a tokenlist
 * token record while also providing ERC20 contract functionality.
 *
 * @class Token
 * @extends {ERC20}
 */
class Token extends ERC20 {
  constructor(sdk, data) {
    super(sdk, data.address);
    this._data = data;

    // replicate touches between this and the standard ERC20 instance from the sdk
    this.sdk.erc20(this.address).subscribe(() => this.touch());
  }

  /**
   * The chainId as provided by the tokenlist
   *
   * @readonly
   * @memberof Token
   */
  get chainId() {
    return this._data.chainId;
  }

  /**
   * The chainHex derived from the chainId
   *
   * @readonly
   * @memberof Token
   */
  get chainHex() {
    return toHex(this.chainId);
  }

  /**
   * The URL of the token's logo as provided by the tokenlist
   *
   * @readonly
   * @memberof Token
   */
  get logoURI() {
    return this._data.logoURI;
  }

  /**
   * The name of the token as provided by the tokenlist
   *
   * @readonly
   * @memberof Token
   */
  get name() {
    return this._data.name;
  }

  /**
   * The symbol of the token as provided by the tokenlist
   *
   * @readonly
   * @memberof Token
   */
  get symbol() {
    return this._data.symbol;
  }
}

/**
 * A wrapper class for token lists that links into the ERC20 contract class
 *
 * @export
 * @class TokenList
 * @extends {Base}
 */
export default class TokenList extends Cachable {
  constructor(sdk, url) {
    super(sdk);

    this._account = this.sdk.account;
    this._data = {};
    this._netorkId = this.sdk.networkId;
    this._tokens = {}; // updated by _processData
    this._url = url;

    this._promise = new Promise((resolve) => {
      this._load(resolve);
    });

    this.sdk.subscribe(({ account, networkId }) => {
      if (networkId !== this._networkId || account !== this._account) {
        this._account = this.sdk.account;
        this._netorkId = this.sdk.networkId;
        this._processData(); // reprocess data to use the new chain / account
      }
    });
  }

  /**
   * returns the promise which indicates if the initial load of the tokenlist has completed
   *
   * @readonly
   * @memberof TokenList
   */
  get awaitInitialized() {
    return this._promise;
  }

  /**
   * The id of the tokenlist, which is a base64 encoded version of its URL
   *
   * @readonly
   * @memberof TokenList
   */
  get id() {
    return btoa(this._url.toLowerCase());
  }

  /**
   * Any array of keywords as provided by the tokenlist
   *
   * @readonly
   * @memberof TokenList
   */
  get keywords() {
    return this._data.keywords;
  }

  /**
   * A javascript Date object showing when the tokenlist reports that it was updated
   *
   * @readonly
   * @memberof TokenList
   */
  get lastUpdated() {
    return new Date(this.timestamp);
  }

  /**
   * The URL of the logo for the tokenlist
   *
   * @readonly
   * @memberof TokenList
   */
  get logoURI() {
    return this.data._logoURI;
  }

  /**
   * The name of the tokenlist
   *
   * @readonly
   * @memberof TokenList
   */
  get name() {
    return this._data.name;
  }

  /**
   * The network that the tokenlist is tracking. Only tokens from this network will be returned
   * event if other tokens exist in the list.
   *
   * @readonly
   * @memberof TokenList
   */
  get networkId() {
    return this._networkId;
  }

  /**
   * The timestamp reported by the tokenlist. Confusingly, this is not a timestamp, but a datetime
   * string.
   *
   * @readonly
   * @memberof TokenList
   */
  get timestamp() {
    return this.data._timestamp;
  }

  /**
   * An Array of tokens for this network. Each token is an instance of the Token class above
   *
   * @readonly
   * @memberof TokenList
   */
  get tokens() {
    return Object.values(this._tokens);
  }

  /**
   * A String representation of the tokenlist's version for display purposes
   *
   * @readonly
   * @memberof TokenList
   */
  get version() {
    const zero = { major: 0, minor: 0, patch: 0 };
    const { major, minor, patch } = this._data ? this._data.version : zero;
    return `${major}.${minor}.${patch}`;
  }

  /**
   * Returns the Token object for the specified address if it exists
   *
   * @param {string} address - address of the token to return
   * @return {Token}
   * @memberof TokenList
   */
  token(address) {
    validateIsAddress(address);
    return this._tokens[address.toLowerCase()];
  }

  // loads data from the cache if it exists and then fetches the most up to date version
  _load(resolve) {
    // look at cache
    this.cache.promise.then(() => {
      // if a cahced version exists, use that first
      if (this.cache.has(this.id)) {
        this._data = this.cache.get(this.id);
        this._processData();
        resolve();
      }
    });

    // trigger the first update
    this._update(resolve);
  }

  // iterates through the tokenlist data and creates the Token objects as appropriate
  _processData() {
    const tokens = {};

    const data = this._data.tokens || [];

    for (let i = 0; i < data.length; i += 1) {
      const token = new Token(this.sdk, data[i]);

      // we're only interested in tokens on the current network
      if (token.chainId === this.sdk.networkId) {
        tokens[token.address] = token;
        if (this.sdk.account) {
          // as the token for the balance of the current account to queue eager loading
          token.balanceOf(this.sdk.account);
        }
      }
    }

    this._tokens = tokens;
    this.touch();
  }

  // gets a fresh version of the tokenlist and triggers a data update if the version has changed
  _update(resolve) {
    // load from url
    return new Promise((res) => {
      const blankResolve = () => res();
      const toJson = (response) => response.json();

      // grab a new version without the cache
      this.sdk
        .fetch(this._url, { cache: 'no-cache' })
        .then(toJson, blankResolve)
        .then(res, blankResolve);
    })
      .then((data) => {
        if (data) {
          if (!this._data) {
            this._data = data;
            // process the updated data
            this._processData();
            // resolve the initialization promise
            resolve();
            // store the data in cache for next load
            this.cache.set(this.id, this._data);
            // move on to the next step
            return Promise.resolve();
          }

          // compare versions
          const existingVersion = versionCompilation(this._data.version);
          const newVersion = versionCompilation(data.version);

          // update as needed
          if (newVersion > existingVersion) {
            this._data = data;
            // process the updated data
            this._processData();
            // resolve the initialization promise
            resolve();
            // store the data in cache for next load
            this.cache.set(this.id, this._data);
          }
        }

        // move on to the next step
        return Promise.resolve();
      })
      .then(() => {
        // requeue updates
        this._updatePid = setTimeout(() => this._update(() => {}), UPDATE_INTERVAL);
      })
      .catch((e) => {
        console.error('ERROR UPDATING TOKEN LIST', this._url, e);
        // resolve anyway
        resolve();
      });
  }
}
