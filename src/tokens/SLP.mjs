/* eslint class-methods-use-this: 0 */

import ERC20 from './ERC20.mjs';
import SLPContract from '../abi/SLP.json' assert { type: 'json' };

/**
 * Provides a simple wrapper around SLP tokens to provide token and pricing info.
 *
 * @export
 * @class SLP
 * @extends {ERC20}
 */
export default class SLP extends ERC20 {
  /**
   * Provides an ethers contract object via the sdk.
   *
   * @param {SDK} sdk - An instance of the SDK class
   * @param {string} address - An EVM compatible contract address
   * @param {boolean} [readonly=false] - Readonly contracts use the provider even if a signer exists
   * @returns {ether.Contract}
   * @see {@link SDK#contract}
   * @memberof SLP
   */
  static contract(sdk, address, readonly = false) {
    return sdk.contract({
      abi: SLPContract.abi,
      address,
      readonly,
    });
  }

  /**
   * Returns the abi for the underlying contract
   *
   * @readonly
   * @memberof SLP
   */
  get abi() {
    return SLPContract.abi;
  }

  /**
   * Returns the price of one SLP represented as a token0 balance.
   *
   * @return {Promise<BigNumber>}
   * @memberof SLP
   */
  async priceOfSLPInToken0() {
    const [token0Balance, totalSupply] = await Promise.all([
      this.token0().then((token) => token.balanceOf(this.address)),
      this.totalSupply(),
    ]);

    return token0Balance.dividedBy(totalSupply).multipliedBy(2);
  }

  /**
   * Returns the price of one SLP represented as a token1 balance.
   *
   * @return {Promise<BigNumber>}
   * @memberof SLP
   */
  async priceOfSLPInToken1() {
    const [token1Balance, totalSupply] = await Promise.all([
      this.token1().then((token) => token.balanceOf(this.address)),
      this.totalSupply(),
    ]);

    return token1Balance.dividedBy(totalSupply).multipliedBy(2);
  }

  /**
   * @returns the ERC20 instance of token0
   */
  async token0() {
    if (this._token0) {
      return this._token0;
    }

    this._token0 = this.sdk.erc20(
      await this.sdk.multicall.enqueue(this.abi, this.address, 'token0'),
    );
    return this._token0;
  }

  /**
   * @returns the ERC20 instance of token1
   */
  async token1() {
    if (this._token1) {
      return this._token1;
    }

    this._token1 = this.sdk.erc20(
      await this.sdk.multicall.enqueue(this.abi, this.address, 'token1'),
    );
    return this._token1;
  }
}
