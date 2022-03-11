/* eslint consistent-return: 0 */

import Notify from 'bnc-notify';
import ERC20Contract from '@elasticswap/elasticswap/artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';

import { ethers } from 'ethers';

import ERC20Class from './tokens/ERC20.mjs';
import ErrorHandlingClass from './ErrorHandling.mjs';
import ExchangeClass from './exchange/Exchange.mjs';
import ExchangeFactoryClass from './exchange/ExchangeFactory.mjs';
import LocalStorageAdapter from './adapters/LocalStorageAdapter.mjs';
import StakingPoolsClass from './staking/StakingPools.mjs';
import Subscribable from './Subscribable.mjs';

import {
  amountFormatter,
  round,
  shortenAddress,
  swapBigNumber,
  toBigNumber,
  toEthersBigNumber,
  toHex,
  toKey,
  toNumber,
  truncate,
  upTo,
  validateIsAddress,
} from './utils/utils.mjs';

export const utils = {
  amountFormatter,
  round,
  shortenAddress,
  swapBigNumber,
  toBigNumber,
  toEthersBigNumber,
  toHex,
  toKey,
  toNumber,
  truncate,
  upTo,
  validateIsAddress,
};

export const ExchangeFactory = ExchangeFactoryClass;
export const Exchange = ExchangeClass;
export const ERC20 = ERC20Class;
export const ErrorHandling = ErrorHandlingClass;
export const StakingPools = StakingPoolsClass;

export class SDK extends Subscribable {
  constructor({ customFetch, env, provider, signer, storageAdapter }) {
    super();
    if (provider) {
      this._provider = provider;
      this.env = env;
    } else {
      this._provider = ethers.getDefaultProvider();
      this.env = { ...env };
    }

    this._loadNetwork();

    this._contract = ({ address, abi }) => new ethers.Contract(address, abi);
    this._storageAdapter = storageAdapter || new LocalStorageAdapter();

    this._balances = {};
    this._balancesToTrack = [];

    this.provider.getBlockNumber().then((blockNumber) => {
      this._blockNumber = blockNumber;
    });

    this.provider.on('block', (blockNumber) => {
      this._blockNumber = blockNumber;
      this.updateBalances().catch((e) => {
        console.warn('Failed to update balances', e.message);
      });
      this.touch();
    });

    if (customFetch) {
      this._fetch = customFetch;
    } else if (typeof window !== 'undefined' && window && window.fetch) {
      this._fetch = window.fetch.bind(window);
    } else {
      throw new Error(
        '@elasticswap/sdk: SDK constructor unable to find fetch. ' +
          "Please provide a compatible implementation via the 'customFetch' parameter.",
      );
    }

    if (this.env.blocknative) {
      this._notify = Notify(this.env.blocknative);
      this._notify.config({
        darkMode: true,
      });
    }

    if (signer) {
      this.changeSigner(signer);
    }
  }

  get account() {
    return this._account;
  }

  get accountName() {
    return this._accountName;
  }

  get balances() {
    return this._balances;
  }

  get blockNumber() {
    return this._blockNumber;
  }

  get exchangeFactory() {
    if (this._exchangeFactory) {
      return this._exchangeFactory;
    }

    try {
      this._exchangeFactory = new ExchangeFactory(
        this,
        this.env.contracts[this.networkHex].ExchangeFactory.address,
      );
    } catch (e) {
      console.error('Unable to load exchangeFactory:', e);
    }

    return this._exchangeFactory;
  }

  get fetch() {
    return this._fetch;
  }

  get name() {
    console.warn(
      'WARNING: sdk.name is deprecated and will be removed in a future version. Please use sdk.accountName.',
    );
    return this.accountName;
  }

  get networkHex() {
    return toHex(this.networkId);
  }

  get networkId() {
    return this._networkId || this.env.networkId;
  }

  get networkName() {
    return this._networkName || this.env.networkName;
  }

  get provider() {
    return this.signer ? this.signer.provider : this._provider;
  }

  get signer() {
    return this._signer;
  }

  get stakingPools() {
    if (this._stakingPools) {
      return this._stakingPools;
    }

    try {
      this._stakingPools = new StakingPools(
        this,
        this.env.contracts[this.networkHex].StakingPools.address,
      );
    } catch (e) {
      console.error('Unable to load stakingPools:', e);
    }

    return this._stakingPools;
  }

  get storageAdapter() {
    return this._storageAdapter;
  }

  async balanceOf(address) {
    validateIsAddress(address);
    const key = address.toLowerCase();

    if (this._balances[key]) {
      return this._balances[key];
    }
    this._balances[key] = toBigNumber(await this.provider.getBalance(key), 18);
    this.touch();
    if (!this._balancesToTrack.includes(key)) {
      this._balancesToTrack.push(key);
    }
  }

  async changeSigner(signer) {
    const [newAccount, network] = await Promise.all([
      signer.getAddress(),
      signer.provider.getNetwork(),
    ]);

    this._account = newAccount;
    this._signer = signer;
    this._networkId = network.chainId;
    this._networkName = network.name;

    delete this._exchangeFactory;
    delete this._stakingPools;

    this.balanceOf(this.account);
    await this.setName();
    this.touch();
  }

  contract({ abi, address, readonly = false }) {
    const { provider, signer } = this;

    const connection = readonly ? provider : signer || provider;
    const contract = this._contract({
      abi: abi || ERC20Contract.abi,
      address,
    }).connect(connection);

    return contract;
  }

  async disconnectSigner() {
    delete this._account;
    delete this._accountName;
    delete this._exchangeFactory;
    delete this._signer;
    delete this._stakingPools;
    this.touch();
  }

  /**
   * Hash - transaction hash
   * Object - look at block native  notify -https://docs.blocknative.com/notify#notification
   */
  notify({ hash, obj }) {
    if (!this._notify) {
      return;
    }

    if (hash) {
      return this._notify.hash(hash);
    }

    if (obj) {
      return this._notify.notification(obj);
    }
  }

  async sendETH(recipient, value) {
    let to = recipient;
    if (!ethers.utils.isAddress(to)) {
      // attempt to to resolve address from ENS
      to = await this.provider.resolveName(to);
      if (!to) {
        // resolving address failed.
        console.error('invalid to address / ENS');
        return;
      }
    }
    const tx = this.signer.sendTransaction({
      to,
      value: toEthersBigNumber(value, 18),
    });
    this.notify(tx);
    return tx;
  }

  async isValidETHAddress(address) {
    if (!address) {
      return false;
    }

    if (ethers.utils.isAddress(address)) {
      return true;
    }

    // attempt to to resolve address from ENS
    try {
      const ensResolvedAddress = await this.provider.resolveName(address);
      if (!ensResolvedAddress) {
        // resolving address failed.
        return false;
      }
    } catch (error) {
      return false;
    }
    return true;
  }

  async setName() {
    if (this.account) {
      this._accountName = shortenAddress(this.account);
      try {
        const ensName = await this.provider.lookupAddress(this.account);
        if (ensName) {
          this._accountName = ensName;
        }
      } catch (e) {
        console.error('unable to look up ens name', e.message);
      }
    }
  }

  async updateBalances() {
    const balances = await Promise.all(
      this._balancesToTrack.map((address) => this.provider.getBalance(address)),
    );
    for (let i = 0; i < balances.length; i += 1) {
      this._balances[this._balancesToTrack[i]] = toBigNumber(balances[i], 18);
    }
    this.touch();
  }

  async _loadNetwork() {
    const { chainId, name } = this.provider.getNetwork();
    this._networkId = chainId;
    this._networkName = name;
  }
}

export default SDK;
