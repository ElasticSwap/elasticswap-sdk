/* eslint class-methods-use-this: 0 */

import ERC20Contract from '../abi/ERC20.json' assert { type: 'json' };
import Base from '../Base.mjs';
import { isPOJO } from '../utils/typeChecks.mjs';
import { toKey } from '../utils/utils.mjs';
import { validateIsAddress, validateIsBigNumber } from '../utils/validations.mjs';

const APPROVAL_EVENT = 'Approval';
const SUPPLY_EVENTS = ['AddLiquidity', 'Rebase', 'RemoveLiquidity', 'Swap', 'Transfer'];

// We track these outside of the instance so that multiple instances don't create cascading
// subscriptions problems.
const allowancesByContract = {};
const balancesByContract = {};
const cachedContracts = {};
const contractSubscriptions = {};

const prefix = 'ERC20';

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
    validateIsAddress(address, { prefix });
    this._address = address.toLowerCase();

    if (!allowancesByContract[this._address]) {
      allowancesByContract[this._address] = {};
    }

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
   * Returns the abi for the underlying contract
   *
   * @readonly
   * @memberof ERC20
   */
  get abi() {
    return ERC20Contract.abi;
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
    // if there are overrides and this is not a multicall request, fetch directly from the network
    if (isPOJO(overrides) && !overrides.multicall) {
      return this.toNumber(
        await this.readonlyContract.decimals(this.sanitizeOverrides(overrides, true)),
      );
    }

    // if the value is cached and this is not a multicall request, return it
    if (this._decimals && !overrides?.multicall) {
      return this._decimals;
    }

    // fetch the value from the network using multicall
    this._decimals = this.toNumber(
      await this.sdk.multicall.enqueue(this.abi, this.address, 'decimals'),
    );

    // update subscribers
    this.sdk.erc20(this.address).touch();

    // return the cached value
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
    // if there are overrides and this is not a multicall request, fetch directly from the network
    if (isPOJO(overrides) && !overrides.multicall) {
      return this.readonlyContract.name(this.sanitizeOverrides(overrides, true));
    }

    // if the value is cached and this is not a multicall request, return it
    if (this._name && !overrides?.multicall) {
      return this._name;
    }

    // fetch the value from the network using multicall and cache it
    this._name = await this.sdk.multicall.enqueue(this.abi, this.address, 'name');

    // update subscribers
    this.sdk.erc20(this.address).touch();

    // return the cached value
    return this._name;
  }

  /**
   * Returns the percentage of the total supply held by the address
   *
   * @param {string} address
   * @return {Promise<BigNumber>}
   * @memberof ERC20
   */
  async percentageOfTotalSupply(address) {
    validateIsAddress(address, { prefix });
    const [balance, totalSupply] = await Promise.all([this.balance(address), this.totalSupply()]);
    return balance.dividedBy(totalSupply).multipliedBy(100);
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
    // if there are overrides and this is not a multicall request, fetch directly from the network
    if (isPOJO(overrides) && !overrides.multicall) {
      return this.readonlyContract.symbol(this.sanitizeOverrides(overrides, true));
    }

    // if the value is cached and this is not a multicall request, return it
    if (this._symbol && !overrides?.multicall) {
      return this._symbol;
    }

    // fetch the value from the network using multicall and cache it
    this._symbol = await this.sdk.multicall.enqueue(this.abi, this.address, 'symbol');

    // update subscribers
    this.sdk.erc20(this.address).touch();

    // return the cached value
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
    // if there are overrides and this is not a multicall request, fetch directly from the network
    if (isPOJO(overrides) && !overrides.multicall) {
      const [decimals, totalSupply] = await Promise.all([
        this.decimals(this.sanitizeOverrides(overrides, true)),
        this.readonlyContract.totalSupply(this.sanitizeOverrides(overrides, true)),
      ]);

      return this.toBigNumber(totalSupply, decimals);
    }

    // if the value is cached and this is not a multicall request, return it
    if (this._totalSupply && !overrides?.multicall) {
      return this._totalSupply;
    }

    // fetch the value from the network using multicall
    const [decimals, totalSupply] = await Promise.all([
      this.decimals(),
      this.sdk.multicall.enqueue(this.abi, this.address, 'totalSupply'),
    ]);

    // update the local cache
    this._totalSupply = this.toBigNumber(totalSupply, decimals);

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
   * @memberof ERC20
   */
  async balanceOf(address, overrides) {
    validateIsAddress(address, { prefix });
    // track the address so we get eager loaded balance updates
    this.sdk.trackAddress(address);

    const addressLower = address.toLowerCase();

    // if we have overrides and it is not a multicall request, request the value from the network
    if (isPOJO(overrides) && !overrides.multicall) {
      const [decimals, balance] = await Promise.all([
        this.decimals(this.sanitizeOverrides(overrides, true)),
        this.readonlyContract.balanceOf(addressLower, this.sanitizeOverrides(overrides, true)),
      ]);

      return this.toBigNumber(balance, decimals);
    }

    // return the cached value unless this is a multicall request
    if (balancesByContract[this.address][addressLower] && !overrides?.multicall) {
      return balancesByContract[this.address][addressLower];
    }

    // get decimals and balance using multicall
    const [decimals, balance] = await Promise.all([
      this.decimals(),
      this.sdk.multicall.enqueue(this.abi, this.address, 'balanceOf', [addressLower]),
    ]);

    // save balance
    balancesByContract[this.address][addressLower] = this.toBigNumber(balance, decimals);

    // update subscribers
    this.sdk.erc20(this.address).touch();

    // return balance
    return balancesByContract[this.address][addressLower];
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
   * @memberof ERC20
   */
  async allowance(ownerAddress, spenderAddress, overrides) {
    validateIsAddress(ownerAddress, { prefix });
    validateIsAddress(spenderAddress, { prefix });

    // track both addresses for eager balance loading
    this.sdk.trackAddress(ownerAddress);
    this.sdk.trackAddress(spenderAddress);

    // overrides exist and not a multicall request, fetch directly from network
    if (isPOJO(overrides) && !overrides.multicall) {
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

    const key = toKey(ownerAddress, spenderAddress);

    // return the cached value unless this is a multicall request
    if (allowancesByContract[this.address][key] && !overrides?.multicall) {
      return allowancesByContract[this.address][key];
    }

    // get decimals and balance using multicall
    const [allowance, decimals] = await Promise.all([
      this.sdk.multicall.enqueue(this.abi, this.address, 'allowance', [
        ownerAddress,
        spenderAddress,
      ]),
      this.decimals(),
    ]);

    // save balance
    allowancesByContract[this.address][key] = this.toBigNumber(allowance, decimals);

    // update subscribers
    this.sdk.erc20(this.address).touch();

    // retrun balance
    return allowancesByContract[this.address][key];
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
    validateIsAddress(spenderAddress, { prefix });
    validateIsBigNumber(this.toBigNumber(amount), { prefix });

    this.sdk.trackAddress(spenderAddress);

    const result = this._handleTransaction(
      await this.contract.approve(
        spenderAddress,
        this.toEthersBigNumber(amount, await this.decimals()),
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
        this.toEthersBigNumber(amount, await this.decimals()),
        this.sanitizeOverrides(overrides),
      ),
    );
  }

  // update the approval cache if we care about the owner or spender
  async _handleApprovalEvent(log) {
    if (log.event !== APPROVAL_EVENT) {
      return; // ignore
    }

    // console.log('APPROVAL', log.event, log);

    const { args } = log;
    const { owner, spender } = args;

    if (this.sdk.isTrackedAddress(owner) || this.sdk.isTrackedAddress(spender)) {
      console.log('APPROVAL', log.event, owner, spender, log);
      // updated the cached value
      this.allowance(owner, spender, { multicall: true });
    }
  }

  // uses multicall to update all tracked address balances related to the event
  async _handleSupplyEvent(log) {
    const { args, event } = log;

    if (!SUPPLY_EVENTS.includes(event)) {
      return; // ignore
    }

    // console.log('SUPPLY', event, log);

    // update total supply
    this.totalSupply({ multicall: true });

    // Rebases require an update of all balances we care about
    if (event === 'Rebase') {
      console.log('SUPPLY', event, log);

      // take a local copy for efficiency
      const trackedAddress = [...this.sdk.trackedAddresses];

      // trigger an update for each tracked address
      for (let i = 0; i < trackedAddress.length; i += 1) {
        this.balanceOf(trackedAddress[i], { multicall: true });
      }

      // no need to further process because all tracked addresses are queued for update
      return;
    }

    // with non-rebase events any argument may be an address
    const potentialAddresses = args || [];

    // update user balances for all tracked addresses and involved
    for (let i = 0; i < potentialAddresses.length; i += 1) {
      // isTrackedAddress filters out non-address values
      if (this.sdk.isTrackedAddress(potentialAddresses[i])) {
        console.log('SUPPLY', event, 'triggered balance update for', potentialAddresses[i]);
        this.balanceOf(potentialAddresses[i], { multicall: true });
      }
    }
  }

  // Takes the transaction hash and triggers a notification, waits to the transaction to be mined
  // and the returns the TransactionReceipt.
  async _handleTransaction(tx) {
    this.sdk.notify(tx);
    const receipt = await tx.wait(2);
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

      const supplyHandler = (event) => this._handleSupplyEvent(event);

      for (let i = 0; i < SUPPLY_EVENTS.length; i += 1) {
        const event = SUPPLY_EVENTS[i];
        // if the contract supports this event
        if (cachedContracts[this.address].filters[event]) {
          // listen for the event to take place
          const filter = cachedContracts[this.address].filters[event];
          cachedContracts[this.address].on(filter, supplyHandler);
        }
      }

      const approvalHandler = (event) => this._handleApprovalEvent(event);

      if (cachedContracts[this.address].filters[APPROVAL_EVENT]) {
        // listen for the event to take place
        const filter = cachedContracts[this.address].filters[APPROVAL_EVENT];
        cachedContracts[this.address].on(filter, approvalHandler);
      }
    });
  }
}
