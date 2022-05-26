import ERC20 from './ERC20.mjs';
import { isPOJO } from '../utils/typeChecks.mjs';
import { toHex, toKey } from '../utils/utils.mjs';
import { validateIsAddress, validateIsBigNumber } from '../utils/validations.mjs';

const prefix = 'Token';

/**
 * Provides a wrapped for the ERC20 class that returns everything expected to be in a tokenlist
 * token record while also providing ERC20 contract functionality.
 *
 * NOTE: decimals, name, & symbol are all provided by getters in this class
 *
 * @class Token
 * @extends {ERC20}
 */
export default class Token extends ERC20 {
  constructor(sdk, data, isElastic = false) {
    super(sdk, data.address);
    this._data = data;
    this._isElastic = isElastic;

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
   * The decimals of the token
   *
   * @readonly
   * @memberof Token
   */
  get decimals() {
    return this._data.decimals;
  }

  /**
   * true if the token came from the elastic list
   *
   * @readonly
   * @memberof Token
   */
  get isElastic() {
    return this._isElastic;
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

  /**
   * Returns the totalSupply of the token. This method returns a cached version of totalSupply.
   * Any supply change events cause this cached value to be updated. If overrides are
   * present, the cache will be ignored and the value obtained from the network.
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {BigNumber}
   * @memberof Token
   */
  async totalSupply(overrides) {
    // if there are overrides and this is not a multicall request, fetch directly from the network
    if (isPOJO(overrides) && !overrides.multicall) {
      const totalSupply = await this.readonlyContract.totalSupply(
        this.sanitizeOverrides(overrides, true),
      );

      return this.toBigNumber(totalSupply, this.decimals);
    }

    // if the value is cached and this is not a multicall request, return it
    if (this._totalSupply && !overrides?.multicall) {
      return this._totalSupply;
    }

    // fetch the value from the network using multicall
    const totalSupply = await this.sdk.multicall.enqueue(this.abi, this.address, 'totalSupply');

    // update the local cache
    this._totalSupply = this.toBigNumber(totalSupply, this.decimals);

    // update subscribers
    this.sdk.erc20(this.address).touch();

    // return the cached value
    return this._totalSupply;
  }

  /**
   * Returns the balance for a specific address. This method returns a cached version when possible.
   * Any supply chain events cause this cached value to be updated. If overrides are
   * present, the cache will be ignored and the value obtained from the network.
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {BigNumber}
   * @memberof Token
   */
  async balanceOf(address, overrides) {
    validateIsAddress(address, { prefix });
    // track the address so we get eager loaded balance updates
    this.sdk.trackAddress(address);

    const addressLower = address.toLowerCase();

    // if we have overrides and it is not a multicall request, request the value from the network
    if (isPOJO(overrides) && !overrides.multicall) {
      const balance = await this.readonlyContract.balanceOf(
        addressLower,
        this.sanitizeOverrides(overrides, true),
      );
      return this.toBigNumber(balance, this.decimals);
    }

    // return the cached value unless this is a multicall request
    if (this.balances[addressLower] && !overrides?.multicall) {
      return this.balances[addressLower];
    }

    // get decimals and balance using multicall
    const balance = await this.sdk.multicall.enqueue(this.abi, this.address, 'balanceOf', [
      addressLower,
    ]);

    // save balance
    this._updateCachedBalance(addressLower, this.toBigNumber(balance, this.decimals));

    // update subscribers
    this.sdk.erc20(this.address).touch();

    // return balance
    return this.balances[addressLower];
  }

  /**
   * Returns the amount of the token that spender is allowed to transfer from owner. This method
   * returns a cached version when possible. Any supply chain events cause this cached value to be
   * updated. If overrides are present, the cache will be ignored and the value obtained from the
   * network.
   *
   * @param {string} ownerAddress - the owner of the token
   * @param {string} spenderAddress - the spender of the token
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {BigNumber}
   * @memberof Token
   */
  async allowance(ownerAddress, spenderAddress, overrides) {
    validateIsAddress(ownerAddress, { prefix });
    validateIsAddress(spenderAddress, { prefix });

    // track both addresses for eager balance loading
    this.sdk.trackAddress(ownerAddress);
    this.sdk.trackAddress(spenderAddress);

    // overrides exist and not a multicall request, fetch directly from network
    if (isPOJO(overrides) && !overrides.multicall) {
      const allowance = await this.readonlyContract.allowance(
        ownerAddress,
        spenderAddress,
        this.sanitizeOverrides(overrides || {}, true),
      );

      return this.toBigNumber(allowance, this.decimals);
    }

    const key = toKey(ownerAddress, spenderAddress);

    // return the cached value unless this is a multicall request
    if (this.allowances[key] && !overrides?.multicall) {
      return this.allowances[key];
    }

    // get decimals and balance using multicall
    const allowance = await this.sdk.multicall.enqueue(this.abi, this.address, 'allowance', [
      ownerAddress,
      spenderAddress,
    ]);

    // save allowance
    this._updateCachedAllowance(
      ownerAddress,
      spenderAddress,
      this.toBigNumber(allowance, this.decimals),
    );

    // update subscribers
    this.sdk.erc20(this.address).touch();

    // retrun balance
    return this.allowances[key];
  }

  /**
   * Allows spender to spender the callers tokens up to the amount defined.
   *
   * @param {string} spenderAddress - the spender's address
   * @param {BigNumber} amount - the maximum amount that can be spent
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {TransactionReceipt}
   * @memberof Token
   */
  async approve(spenderAddress, amount, overrides = {}) {
    validateIsAddress(spenderAddress, { prefix });
    validateIsBigNumber(this.toBigNumber(amount), { prefix });

    this.sdk.trackAddress(spenderAddress);

    const result = this._handleTransaction(
      await this.contract.approve(
        spenderAddress,
        this.toEthersBigNumber(amount, this.decimals),
        this.sanitizeOverrides(overrides),
      ),
    );

    // update the allowance before returning
    await this.allowance(this.sdk.account, spenderAddress, { multicall: true });

    return result;
  }

  /**
   * Transfers tokens to the recipient address
   *
   * @param {string} recipient - the recipient's address
   * @param {BigNumber} amount - the amount to send
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {TransactionReceipt}
   * @memberof ERC20
   */
  async transfer(recipient, amount, overrides = {}) {
    validateIsAddress(recipient, { prefix });
    validateIsBigNumber(this.toBigNumber(amount), { prefix });

    this.sdk.trackAddress(recipient);

    return this._handleTransaction(
      await this.contract.transfer(
        recipient,
        this.toEthersBigNumber(amount, this.decimals),
        this.sanitizeOverrides(overrides),
      ),
    );
  }
}
