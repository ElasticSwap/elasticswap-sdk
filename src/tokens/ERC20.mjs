import ERC20Contract from '@elasticswap/elasticswap/artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json' assert { type: 'json' };
import Base from '../Base.mjs';
import { isPOJO } from '../utils/typeChecks.mjs';
import { validateIsAddress, validateIsBigNumber } from '../utils/validations.mjs';

const SUPPLY_EVENTS = ['AddLiquidity', 'Rebase', 'RemoveLiquidity', 'Swap', 'Transfer'];

// We track these outside of the instance so that multiple instances don't create cascading
// subscriptions problems.
const balancesByContract = {};
const cachedContracts = {};
const contractSubscriptions = {};

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
    validateIsAddress(address);
    this._address = address.toLowerCase();

    if (!balancesByContract[this._address]) {
      balancesByContract[this._address] = {};
    }

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
   * Returns all of the tracked balances
   *
   * @readonly
   * @memberof ERC20
   */
  get balances() {
    return balancesByContract[this.address];
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
    if (isPOJO(overrides)) {
      return this.toNumber(
        await this.readonlyContract.decimals(this.sanitizeOverrides(overrides, true)),
      );
    }

    if (this._decimals) {
      return this._decimals;
    }

    this._decimals = this.toNumber(await this.readonlyContract.decimals());
    this.touch();
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
    if (isPOJO(overrides)) {
      return this.readonlyContract.name(this.sanitizeOverrides(overrides, true));
    }

    if (this._name) {
      return this._name;
    }

    this._name = await this.readonlyContract.name();
    this.touch();
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
    if (isPOJO(overrides)) {
      return this.readonlyContract.symbol(this.sanitizeOverrides(overrides, true));
    }

    if (this._symbol) {
      return this._symbol;
    }

    this._symbol = await this.readonlyContract.symbol();
    this.touch();
    return this._symbol;
  }

  /**
   * Returns the totalSupply of the token. This method returns a cached version of totalSupply.
   * Any supply change events cause this cached value to be updated. If overrides are
   * present, the cache will be ignored and the value obtained from the network.
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {BigNumber}
   * @memberof ERC20
   */
  async totalSupply(overrides) {
    if (isPOJO(overrides)) {
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

    this._totalSupply = this.toBigNumber(totalSupply, decimals);
    this.touch();
    return this._totalSupply;
  }

  /**
   * Returns the balance for a specific address. This method returns a cached version when possible.
   * Any supply chain events cause this cached value to be updated. If overrides are
   * present, the cache will be ignored and the value obtained from the network.
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {BigNumber}
   * @memberof ERC20
   */
  async balanceOf(address, overrides) {
    validateIsAddress(address);
    this.sdk.trackAddress(address);

    const addressLower = address.toLowerCase();

    if (isPOJO(overrides)) {
      const [decimals, balance] = await Promise.all([
        this.decimals(this.sanitizeOverrides(overrides, true)),
        this.readonlyContract.balanceOf(addressLower, this.sanitizeOverrides(overrides, true)),
      ]);

      return this.toBigNumber(balance, decimals);
    }

    if (balancesByContract[this.address][addressLower]) {
      return balancesByContract[this.address][addressLower];
    }

    const [decimals, balance] = await Promise.all([
      this.decimals(),
      this.readonlyContract.balanceOf(addressLower),
    ]);

    balancesByContract[this.address][addressLower] = this.toBigNumber(balance, decimals);
    this.touch();
    return balancesByContract[this.address][addressLower];
  }

  /**
   * Returns the amount of the token that spender is allowed to transfer from owner
   *
   * @param {string} ownerAddress - the owner of the token
   * @param {string} spenderAddress - the spender of the token
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {BigNumber}
   * @memberof ERC20
   */
  async allowance(ownerAddress, spenderAddress, overrides) {
    validateIsAddress(ownerAddress);
    validateIsAddress(spenderAddress);

    this.sdk.trackAddress(ownerAddress);
    this.sdk.trackAddress(spenderAddress);

    const [allowance, decimals] = await Promise.all([
      this.readonlyContract.allowance(
        ownerAddress,
        spenderAddress,
        this.sanitizeOverrides(overrides || {}, true),
      ),
      this.decimals(overrides),
    ]);

    return this.toBigNumber(allowance, decimals);
  }

  /**
   * Allows spender to spender the callers tokens up to the amount defined.
   *
   * @param {string} spenderAddress - the spender's address
   * @param {BigNumber} amount - the maximum amount that can be spent
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {TransactionReceipt}
   * @memberof ERC20
   */
  async approve(spenderAddress, amount, overrides = {}) {
    validateIsAddress(spenderAddress);
    validateIsBigNumber(amount);

    this.sdk.trackAddress(spenderAddress);

    return this._handleTransaction(
      await this.contract.approve(
        spenderAddress,
        this.toEthersBigNumber(amount, await this.decimals()),
        this.sanitizeOverrides(overrides),
      ),
    );
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
    validateIsAddress(recipient);
    validateIsBigNumber(amount);

    this.sdk.trackAddress(recipient);

    return this._handleTransaction(
      await this.contract.transfer(
        recipient,
        this.toEthersBigNumber(amount, await this.decimals()),
        this.sanitizeOverrides(overrides),
      ),
    );
  }

  // TODO: really should use multicall for efficiency
  async _handleSupplyEvent({ args, event }) {
    // update total supply
    this.totalSupply({});

    // Rebases require an update of all balances we care about
    if (event === 'Rebase') {
      this.sdk.trackedAddresses.forEach((address) => {
        this._updateBalance(address);
      });

      return;
    }

    // update user balances for all tracked addresses and involved
    args.forEach((arg) => {
      if (this.sdk.isTrackedAddress(arg)) {
        this._updateBalance(arg);
      }
    });
  }

  // Takes the transaction hash and triggers a notification, waits to the transaction to be mined
  // and the returns the TransactionReceipt.
  async _handleTransaction(tx) {
    this.sdk.notify(tx);
    const receipt = await tx.wait(1);
    return receipt;
  }

  // monitors for events that change total supply or account balance
  async _monitorForEvents() {
    // we're already monitoring
    if (contractSubscriptions[this.address]) {
      return;
    }

    contractSubscriptions[this.address] = this.sdk.subscribe(({ provider }) => {
      // We're using that same provider so we don't need to create new listeners
      if (cachedContracts[this.address] && provider === cachedContracts[this.address].provider) {
        return;
      }

      // We're not using the same provider, so we need to clear listeners on the old contract
      if (cachedContracts[this.address]) {
        cachedContracts[this.address].removeAllListeners();
      }

      // grab a new readonly contract instance to add listeners to
      cachedContracts[this.address] = this.readonlyContract;

      const handler = (event) => this._handleSupplyEvent(event);

      SUPPLY_EVENTS.forEach((event) => {
        // if the contract supports this event
        if (cachedContracts[this.address].filters[event]) {
          // listen for the event to take place
          cachedContracts[this.address].on(cachedContracts[this.address].filters[event], handler);
        }
      });
    });
  }

  async _updateBalance(address) {
    // force update with blank overrides
    balancesByContract[this.address][address.toLowerCase()] = this.balanceOf(address, {});
    this.touch();
  }
}
