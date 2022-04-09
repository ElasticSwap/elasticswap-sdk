import Base from '../Base.mjs';

/**
 * This class provides a simple way to access all tokens currently loaded in tokenlists by address.
 *
 * @export
 * @class TokensByAddress
 * @extends {Base}
 */
export default class TokensByAddress extends Base {
  constructor(sdk) {
    super(sdk);
    this._tokenListCount = this.sdk.tokenLists.length;
    this._tokenListSubscribers = {};
    this._tokensByAddress = this._allTokensByAddress();

    // every time the sdk updates, reprocess the token list
    this.sdk.subscribe(() => {
      // if the number of token lists has changed, reprocess
      if (this._tokenListCount !== this.sdk.tokenLists.length) {
        this._tokenListCount = this.sdk.tokenLists.length;
        this._tokensByAddress = this._allTokensByAddress();

        // make sure we're subscribed to all the token lists
        for (let i = 0; i < this._tokenListCount; i += 1) {
          const tokenList = this.sdk.tokenLists[i];

          // if we're not subscribed to one, subscribe
          if (!this._tokenListSubscribers[tokenList.id]) {
            this._tokenListSubscribers[tokenList.id] = tokenList.subscribe(() => {
              // subscriptions of course just update the list
              this._tokensByAddress = this._allTokensByAddress();
              this.touch();
            });
          }
        }
      }
    });
  }

  /**
   * All token addresses currently being tracked
   *
   * @readonly
   * @memberof TokensByAddress
   */
  get tokenAddresses() {
    return Object.keys(this.tokensByAddress);
  }

  /**
   * All the tokens currently being tracked
   *
   * @readonly
   * @memberof TokensByAddress
   */
  get tokens() {
    return Object.values(this.tokensByAddress);
  }

  /**
   * All of the tokens by address
   *
   * @readonly
   * @memberof TokensByAddress
   */
  get tokensByAddress() {
    return this._tokensByAddress;
  }

  /**
   * The number of token lists
   *
   * @readonly
   * @memberof TokensByAddress
   */
  get tokenListCount() {
    return this._tokenListCount;
  }

  /**
   * Get a token by its address
   *
   * @param {*} address
   * @return {*}
   * @memberof TokensByAddress
   */
  tokenByAddress(address) {
    return this.tokensByAddress[address.toLowerCase()];
  }

  // load all the tokens from all the lists
  _allTokensByAddress() {
    return Object.values(this.sdk._tokenLists).reduce(
      (byAddress, { _tokens }) => ({ ...byAddress, ..._tokens }),
      {},
    );
  }
}
