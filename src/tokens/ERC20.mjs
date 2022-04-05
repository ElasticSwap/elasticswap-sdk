import ERC20Contract from '@elasticswap/elasticswap/artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json' assert { type: 'json' };
import Base from '../Base.mjs';
import { validateIsAddress } from '../utils/validations.mjs';

/**
 * An ERC20 wrapper class that tracks any data requested and returns the cached version.
 *
 * @export
 * @class ERC20
 * @extends {Base}
 */
export default class ERC20 extends Base {
  constructor(sdk, address) {
    super(sdk);
    this._address = address;
    this._balances = {};
    this._monitorForEvents();
  }

  /**
   * Provides an ethers contract object via the sdk.
   *
   * @param {SDK} sdk - An instance of the SDK class
   * @param {string} address - An EVM compatible contract address
   * @param {boolean} [readonly=false] - Readonly contracts use the provider even if a signer exists
   * @returns {ether.Contract}
   * @see {@link SDK#contract}
   * @memberof ERC20
   */
  static contract(sdk, address, readonly = false) {
    return sdk.contract({
      abi: ERC20Contract.abi,
      address,
      readonly,
    });
  }

  /**
   * Returns the address of the contract
   *
   * @readonly
   * @memberof ERC20
   */
  get address() {
    return this._address;
  }

  /**
   * @readonly
   * @see {@link SDK#contract}
   * @see {@link https://docs.ethers.io/v5/api/contract/contract/}
   * @returns {ethers.Contract} contract - An ethers.js Contract instance
   * @memberof ERC20
   */
  get contract() {
    return this.constructor.contract(this.sdk, this.address);
  }

  /**
   * @alias address
   * @readonly
   * @memberof ERC20
   */
  get id() {
    return this.address;
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
   * Returns the decimals of the token. Only looks this up once for performance reasons unless
   * overrides exist.
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {number}
   * @memberof ERC20
   */
  async decimals(overrides) {
    if (Object.isObject(overrides)) {
      return this.toNumber(
        await this.readonlyContract.decimals(this.sanitizeOverrides(overrides, true)),
      );
    }

    if (this._decimals) {
      return this._decimals;
    }

    this._decimals = this.toNumber(await this.readonlyContract.decimals());
    return this._decimals;
  }

  /**
   * Returns the name of the token. Only looks this up once for performance reasons unless
   * overrides exist.
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {string}
   * @memberof ERC20
   */
  async name(overrides) {
    if (Object.isObject(overrides)) {
      return this.readonlyContract.name(this.sanitizeOverrides(overrides, true));
    }

    if (this._name) {
      return this._name;
    }

    this._name = await this.readonlyContract.name();
    return this._name;
  }

  /**
   * Returns the symbol of the token. Only looks this up once for performance reasons unless
   * overrides exist.
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {string}
   * @memberof ERC20
   */
  async symbol(overrides) {
    if (Object.isObject(overrides)) {
      return this.readonlyContract.symbol(this.sanitizeOverrides(overrides, true));
    }

    if (this._symbol) {
      return this._symbol;
    }

    this._symbol = await this.readonlyContract.symbol();
    return this._symbol;
  }

  /**
   * Returns the totalSupply of the token. This method returns a cached version of totalSupply.
   * Any transfer, mint, or burn events cause this cached value to be updated. If overrides are
   * present, the cache will be ignored and the value obtained from the network.
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {BigNumber}
   * @memberof ERC20
   */
  async totalSupply(overrides) {
    if (Object.isObject(overrides)) {
      const [decimals, totalSupply] = await Promise.all([
        this.decimals(this.sanitizeOverrides(overrides, true)),
        this.readonlyContract.totalSupply(this.sanitizeOverrides(overrides, true)),
      ]);

      return this.toBigNumber(totalSupply, decimals);
    }

    if (this._totalSupply) {
      return this._totalSupply;
    }

    const [decimals, totalSupply] = await Promise.all([
      this.decimals(),
      this.readonlyContract.totalSupply(),
    ]);

    return this.toBigNumber(totalSupply, decimals);
  }

  async balanceOf(address, overrides) {
    validateIsAddress(address);

    if (Object.isObject(overrides)) {
      const [decimals, totalSupply] = await Promise.all([
        this.decimals(this.sanitizeOverrides(overrides, true)),
        this.readonlyContract.balanceOf(address, this.sanitizeOverrides(overrides, true)),
      ]);

      return this.toBigNumber(totalSupply, decimals);
    }

    if (this._totalSupply) {
      return this._totalSupply;
    }

    const [decimals, totalSupply] = await Promise.all([
      this.decimals(),
      this.readonlyContract.totalSupply(),
    ]);

    return this.toBigNumber(totalSupply, decimals);
  }

  // TODO: really should use multicall for efficiency
  async _handleTransfer({ args }) {
    // update total supply
    this.totalSupply({});

    // update user balances
    const { from, to } = args;
    this._updateBalance(from);
    this._updateBalance(to);
  }

  async _monitorForEvents() {
    this.sdk.subscribe(({ provider }) => {
      if (provider === this._cachedContract.provider) {
        return;
      }

      this._cachedContract = this.readonlyContract;

      this._cachedContract.on(this._cachedContract.filters.TRANSFER, (event) =>
        this._handleTransfer.bind(this),
      );
    });
  }

  async _updateBalance(address) {
    // force update with blank overrides
    this._balances[address.toLowerCase()] = this.balanceOf(address, {});
  }

  async approve(spenderAddress, amount, overrides = {}) {
    this._contract = this.confirmSigner(this.contract);
    const txStatus = await this.contract.approve(
      spenderAddress,
      this.toEthersBigNumber(amount),
      this.sanitizeOverrides(overrides),
    );
    return txStatus;
  }

  async transfer(recipient, amount, overrides = {}) {
    const txStatus = await this.contract.transfer(
      recipient,
      this.toEthersBigNumber(amount),
      this.sanitizeOverrides(overrides),
    );
    return txStatus;
  }

  async balanceOf(accountAddress, overrides = {}) {
    const balance = await this.contract.balanceOf(
      accountAddress,
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(balance.toString());
  }

  async allowance(ownerAddress, spenderAddress, overrides = {}) {
    const ERC20Token = await this.readonlyContract;
    const allowance = await ERC20Token.allowance(
      ownerAddress,
      spenderAddress,
      this.sanitizeOverrides(overrides, true),
    );

    return allowance;
  }
}
