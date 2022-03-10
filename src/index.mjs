/* eslint consistent-return: 0 */

import { ethers } from 'ethers';
import Notify from 'bnc-notify';
import ERC20Contract from '@elasticswap/elasticswap/artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';
import Subscribable from './Subscribable.mjs';
import ExchangeFactoryClass from './exchange/ExchangeFactory.mjs';
import ExchangeClass from './exchange/Exchange.mjs';
import ERC20Class from './tokens/ERC20.mjs';
import ErrorHandlingClass from './ErrorHandling.mjs';
import LocalStorageAdapter from './adapters/LocalStorageAdapter.mjs';

import {
  amountFormatter,
  swapBigNumber,
  toBigNumber,
  toEthersBigNumber,
  toKey,
  toNumber,
  upTo,
  shortenAddress,
  truncate,
  validateIsAddress,
  round,
} from './utils/utils.mjs';

export const utils = {
  amountFormatter,
  swapBigNumber,
  toBigNumber,
  toEthersBigNumber,
  toKey,
  toNumber,
  upTo,
  truncate,
  round,
};

const prefix = '@elasticswap/sdk';

export const ExchangeFactory = ExchangeFactoryClass;
export const Exchange = ExchangeClass;
export const ERC20 = ERC20Class;
export const ErrorHandling = ErrorHandlingClass;

export class SDK extends Subscribable {
  constructor({ account, customFetch, env, provider, signer, storageAdapter }) {
    super();
    this._provider = provider || ethers.getDefaultProvider();
    this._contract = ({ address, abi }) => new ethers.Contract(address, abi);
    this._storageAdapter = storageAdapter || new LocalStorageAdapter();
    this.signer = signer;
    this.account = account;
    this.env = env;
    this.setName();

    this._balances = {};
    this._balancesToTrack = [];

    if (this.account) {
      this.balanceOf(this.account);
    }

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

    validateIsAddress(this.env.exchangeFactoryAddress, { prefix });

    this._exchangeFactory = new ExchangeFactory(
      this,
      this.env.exchangeFactoryAddress,
    );
  }

  get balances() {
    return this._balances;
  }

  get blockNumber() {
    return this._blockNumber;
  }

  get exchangeFactory() {
    return this._exchangeFactory;
  }

  get fetch() {
    return this._fetch;
  }

  get provider() {
    return this.signer ? this.signer.provider : this._provider;
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
    let newAccount = signer.address;
    if (!newAccount && signer.getAddress) {
      newAccount = await signer.getAddress();
    }
    this.account = newAccount;
    this.signer = signer;
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
    this.account = undefined;
    this.signer = undefined;
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
      this.name = shortenAddress(this.account);
      try {
        const ensName = await this.provider.lookupAddress(this.account);
        if (ensName) {
          this.name = ensName;
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
}

export default SDK;
