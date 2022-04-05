/* eslint consistent-return: 0 */

import Notify from 'bnc-notify';
import ERC20Contract from '@elasticswap/elasticswap/artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';

import { ethers } from 'ethers';

import ERC20Class from './tokens/ERC20.mjs';
import ErrorHandlingClass from './ErrorHandling.mjs';
import ExchangeClass from './exchange/Exchange.mjs';
import ExchangeFactoryClass from './exchange/ExchangeFactory.mjs';
import LocalStorageAdapterClass from './adapters/LocalStorageAdapter.mjs';
import StakingPoolsClass from './staking/StakingPools.mjs';
import StorageAdapterClass from './adapters/StorageAdapter.mjs';
import SubscribableClass from './Subscribable.mjs';

import {
  amountFormatter,
  round,
  shortenAddress,
  shortenHash,
  swapBigNumber,
  toBigNumber,
  toEthersBigNumber,
  toHex,
  toKey,
  toNumber,
  truncate,
  upTo,
} from './utils/utils.mjs';

import {
  isAddress,
  isArray,
  isBigNumber,
  isDate,
  isFunction,
  isNumber,
  isPOJO,
  isSet,
  isString,
  isTransactionHash,
} from './utils/typeChecks.mjs';

import {
  validate,
  validateIsAddress,
  validateIsArray,
  validateIsBigNumber,
  validateIsDate,
  validateIsFunction,
  validateIsNumber,
  validateIsPOJO,
  validateIsSet,
  validateIsString,
} from './utils/validations.mjs';

const FEE_DATA_INTERVAL = 1000;

export const utils = {
  amountFormatter,
  isAddress,
  isArray,
  isBigNumber,
  isDate,
  isFunction,
  isNumber,
  isPOJO,
  isSet,
  isString,
  isTransactionHash,
  round,
  shortenAddress,
  shortenHash,
  swapBigNumber,
  toBigNumber,
  toEthersBigNumber,
  toHex,
  toKey,
  toNumber,
  truncate,
  upTo,
  validate,
  validateIsAddress,
  validateIsArray,
  validateIsBigNumber,
  validateIsDate,
  validateIsFunction,
  validateIsNumber,
  validateIsPOJO,
  validateIsSet,
  validateIsString,
};

export const ERC20 = ERC20Class;
export const ErrorHandling = ErrorHandlingClass;
export const Exchange = ExchangeClass;
export const ExchangeFactory = ExchangeFactoryClass;
export const LocalStorageAdapter = LocalStorageAdapterClass;
export const StakingPools = StakingPoolsClass;
export const StorageAdapter = StorageAdapterClass;
export const Subscribable = SubscribableClass;

/**
 * Primary class. All things extend from here. SDK proxies ethers.js to provide an interface for
 * all ElasticSwap EVM contracts.
 *
 * @export
 * @class SDK
 * @extends {Subscribable}
 */
export class SDK extends Subscribable {
  /**
   * Creates an instance of SDK.
   *
   * @param {Object} config - { customFetch, env, provider, signer, storageAdapter }
   * @param {function} config.customFetch - should implement the Fetch API (optional)
   * @param {Object} config.env - environment configuration
   * @param {Object} config.env.blocknative - bnc-notify initialization options
   * @param {Object} config.env.contracts - deployed contract configuration by network
   * @param {hardhat-deploy.Export} config.env.contracts[chainIdHex]
   * @param {hardhat-deploy.MultiExport} config.env.deployments - deployed contract configuration
   * @param {ethers.providers.Provider} config.provider - default provider (optional)
   * @param {ethers.Signer} config.signer - initial ethers signer (optional)
   * @param {StorageProvider} config.storageProvider - (optional)
   * @memberof SDK
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API}
   * @see {@link https://docs.blocknative.com/notify#initialization}
   * @see {@link https://www.npmjs.com/package/hardhat-deploy/v/0.10.4#exporting-deployments}
   * @see {@link https://docs.ethers.io/v5/api/providers/provider/}
   * @see {@link https://docs.ethers.io/v5/api/signer/}
   * @see {@link StorageAdapter}
   */
  constructor({ customFetch, env, provider, signer, storageAdapter }) {
    super();

    this._initialized = false;

    this.env = env;

    this._contract = ({ address, abi }) => new ethers.Contract(address, abi);
    this._storageAdapter = storageAdapter || new LocalStorageAdapter();

    this._balances = {};
    this._balancesToTrack = [];

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

    this.changeProvider(provider || ethers.getDefaultProvider()).then(() => {
      if (signer) {
        this.changeSigner(signer).then(() => {
          this._initialized = true;
        });
      } else {
        this._initialized = true;
      }
    });
  }

  /**
   * @readonly
   * @returns {string|undefined} - The EVM address of the current signer, lowercase
   * @memberof SDK
   */
  get account() {
    return this._account ? this._account.toLowerCase() : undefined;
  }

  /**
   * @returns {string} - The shortened account name
   * @see {@link SDK#_setName}
   * @memberof SDK
   */
  get accountName() {
    return this._accountName;
  }

  /**
   * @readonly
   * @returns {Object} - An object where wallet addresses are keys and BigNumber are values
   * @see {@link SDK#balanceOf}
   * @see {@link SDK#_updateBalances}
   * @memberof SDK
   */
  get balances() {
    return this._balances;
  }

  /**
   * @readonly
   * @returns {number} - The current blockNumber of the EVM chain provided by {@link SDK#provider}
   * @see {@link https://docs.ethers.io/v5/api/providers/provider/#Provider-getBlockNumber}
   * @memberof SDK
   */
  get blockNumber() {
    return this._blockNumber;
  }

  /**
   * @readonly
   * @returns {ExchangeFactory} - An instance of {@link ExchangeFactory} for the current EVM chain
   * @memberof SDK
   */
  get exchangeFactory() {
    if (this._exchangeFactory) {
      return this._exchangeFactory;
    }

    try {
      this._exchangeFactory = new ExchangeFactory(this, this.contractAddress('ExchangeFactory'));
    } catch (e) {
      console.error('Unable to load exchangeFactory:', e);
    }

    return this._exchangeFactory;
  }

  /**
   * @readonly
   * @returns {fetch} - An implementation of the Fetch API
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API}
   * @memberof SDK
   */
  get fetch() {
    return this._fetch;
  }

  /**
   * @readonly
   * @returns {BigNumber} - The current estimated gas price
   * @see {@link https://docs.ethers.io/v5/api/providers/provider/#Provider-getFeeData}
   * @memberof SDK
   */
  get gasPrice() {
    return this._gasPrice || toBigNumber(0);
  }

  /**
   * @readonly
   * @returns {boolean} - true after the provider and (if applicable) signer have been loaded
   * @memberof SDK
   */
  get initialized() {
    return this._initialized;
  }

  /**
   * @readonly
   * @returns {BigNumber} - The current estimated max fee per gas
   * @see {@link https://docs.ethers.io/v5/api/providers/provider/#Provider-getFeeData}
   * @memberof SDK
   */
  get maxFeePerGas() {
    return this._maxFeePerGas || toBigNumber(0);
  }

  /**
   * @readonly
   * @returns {BigNumber} - The current estimated max priority fee per gas
   * @see {@link https://docs.ethers.io/v5/api/providers/provider/#Provider-getFeeData}
   * @memberof SDK
   */
  get maxPriorityFeePerGas() {
    return this._maxPriorityFeePerGas || toBigNumber(0);
  }

  /**
   * @deprecated since version 0.0.8 in favor of {@link SDK#accountName}
   * @memberof SDK
   */
  get name() {
    console.warn(
      'WARNING: sdk.name is deprecated and will be removed in a future version.' +
        'Please use sdk.accountName.',
    );
    return this.accountName;
  }

  /**
   * @readonly
   * @returns {string} - A hex string representation of the current network id
   * @memberof SDK
   */
  get networkHex() {
    return toHex(this.networkId);
  }

  /**
   * @readonly
   * @returns {number} - Returns the network id connected EVM chain
   * @see {@link https://docs.ethers.io/v5/api/providers/provider/#Provider-getNetwork}
   * @memberof SDK
   */
  get networkId() {
    return this._networkId || this.env.networkId;
  }

  /**
   * @readonly
   * @returns {number} - Returns the current network name of the connected EVM chain
   * @see {@link https://docs.ethers.io/v5/api/providers/provider/#Provider-getNetwork}
   * @memberof SDK
   */
  get networkName() {
    return this._networkName || this.env.networkName;
  }

  /**
   * @readonly
   * @returns {ethers.providers.Provider} - Returns the current ethers provider
   * @see {@link https://docs.ethers.io/v5/api/providers/provider/}
   * @memberof SDK
   */
  get provider() {
    return this.signer ? this.signer.provider : this._provider;
  }

  /**
   * @readonly
   * @returns {ethers.Signer} - Returns the current ethers signer
   * @see {@link https://docs.ethers.io/v5/api/signer/}
   * @memberof SDK
   */
  get signer() {
    return this._signer;
  }

  /**
   * @readonly
   * @returns {StakingPools} - An instance of {@link StakingPools} for the current EVM chain
   * @memberof SDK
   */
  get stakingPools() {
    if (this._stakingPools) {
      return this._stakingPools;
    }

    try {
      this._stakingPools = new StakingPools(this, this.contractAddress('StakingPools'));
    } catch (e) {
      console.error('Unable to load stakingPools:', e);
    }

    return this._stakingPools;
  }

  /**
   * @readonly
   * @returns {StorageAdapter} - The configured {@link StorageAdapter},
   * @default An instance of {@link LocalStorageAdapter}
   * @memberof SDK
   */
  get storageAdapter() {
    return this._storageAdapter;
  }

  /**
   * Fetches the ETH / AVAX / primary token balance of the requested EVM address and keeps it up to
   * date on a block by block basis.
   *
   * @returns {Promise<boolean>} - true once initialized
   * @see {@link SDK#initialized}
   * @memberof SDK
   */
  awaitInitialized() {
    return new Promise((resolve, reject) => {
      if (!this.initialized) {
        // wait 50 ms and check again
        setTimeout(() => this.awaitInitialized().then(resolve, reject), 50);
        return;
      }

      resolve(this.initialized);
    });
  }

  /**
   * Fetches the ETH / AVAX / primary token balance of the requested EVM address and keeps it up to
   * date on a block by block basis.
   *
   * @param {string} address - The EVM address of the account whose balance is being tracked
   * @returns {BigNumber} - The current balance of the account
   * @see {@link https://docs.ethers.io/v5/api/providers/provider/#Provider-getBalance}
   * @memberof SDK
   */
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

  /**
   * Changes the default / readonly provider and begins to listen for block updates.
   *
   * @param {ethers.providers.Provider} provider
   * @see {@link https://docs.ethers.io/v5/api/providers/provider/}
   * @memberof SDK
   */
  async changeProvider(provider) {
    this._stopListeningToChain();

    const network = await provider.getNetwork();

    this._provider = provider;
    this._networkId = network.chainId;
    this._networkName = network.name;

    delete this._exchangeFactory;
    delete this._stakingPools;

    await this._listenToChain().catch((errors) => {
      console.error('@elasticswap/sdk: error switching networks', errors);
    });

    this._updateFeeData();
    this._configureNotify();

    this.touch();
  }

  /**
   * Changes the signer and begins to listen for block updates. Also triggers {@link SDK#balanceOf}
   * for the signer's address.
   *
   * @param {ethers.Signer} signer
   * @see {@link https://docs.ethers.io/v5/api/signer/}
   * @memberof SDK
   */
  async changeSigner(signer) {
    this._stopListeningToChain();

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

    await Promise.all([this._listenToChain(), this._setName()]).catch((errors) => {
      console.error('@elasticswap/sdk: error switching networks', errors);
    });

    this._configureNotify();

    this.touch();
  }

  /**
   * Generates a contract object using the provider or signer. {@link SDK#provider} will be used if
   * the contract is readonly or if a signer is not available.
   *
   * @param {Object} config - The configuration of the contract
   * @param {Object[]} abi - The contract ABI
   * @param {string} config.address - The EVM address of the contract
   * @param {boolean} [config.readonly=false] - Whether the contract is readonly (optional)
   * @returns {ethers.Contract}
   * @see {@link https://docs.ethers.io/v5/api/contract/contract/}
   * @memberof SDK
   */
  contract({ abi, address, readonly = false }) {
    const { provider, signer } = this;

    const connection = readonly ? provider : signer || provider;
    const contract = this._contract({
      abi: abi || ERC20Contract.abi,
      address,
    }).connect(connection);

    return contract;
  }

  /**
   * Looks up the address of the named contract on the current chain. Addresses are derived from the
   * options.env.contracts object passed when the SDK was created.
   *
   * @param {string} contractName
   * @returns {string|undefined} - The deployed address (lowercase) of the contract
   */
  contractAddress(contractName) {
    const deployedContract = this.env.contracts[this.networkHex][contractName];

    if (deployedContract) {
      return deployedContract.address.toLowerCase();
    }
  }

  /**
   * Removes the signer and updates the listeners to use the default {@link SDK#provider}
   * @memberof SDK
   */
  async disconnectSigner() {
    delete this._account;
    delete this._accountName;
    delete this._exchangeFactory;
    delete this._signer;
    delete this._stakingPools;

    this.changeProvider(this.provider); // in case the provider and signer are on different networks
  }

  /**
   * Uses bnc-notify to provide clean UI notifcations. Only possible in a browser environment.
   *
   * @todo Mimic {@link https://docs.blocknative.com/notify#transaction} for non-Ethereum chains.
   *
   * @param {Object} config - The configuration for the notification
   * @param {string} config.hash - The EVM transaction hash to monitor (optional)
   * @param {Object} config.obj - A notification configuration object
   * @see {@link https://docs.blocknative.com/notify#transaction}
   * @see {@link https://docs.blocknative.com/notify#notification}
   * @memberof SDK
   */
  notify({ hash, obj, wait }) {
    console.log('hash', hash, this._notify);

    if (!this._notify) {
      return;
    }

    if (hash) {
      if (this.networkId !== 1) {
        const { update, dismiss } = this._notify.notification({
          autoDismiss: 0,
          eventCode: 'TransactionSubmitted',
          type: 'pending',
          message: `Transaction ${shortenHash(hash)} is processing...`,
          onclick: () => dismiss(),
        });

        const txSuccess = (finalHash) => {
          update({
            autoDismiss: 2000,
            type: 'success',
            message: `Transaction ${shortenHash(finalHash)} succeeded.`,
          });
        };

        const handleError = ({ reason, replacement }) => {
          if (reason && replacement && replacement.hash) {
            update({
              message: `Transaction ${shortenHash(replacement.hash)} is processing...`,
            });

            wait(1)
              .then(() => txSuccess(replacement.hash))
              .catch((err) => handleError(err));
          } else {
            update({
              autoDismiss: 2000,
              type: 'error',
              message: `Transaction ${shortenHash(replacement.hash)} failed.`,
            });
          }
        };

        wait(1)
          .then(() => txSuccess(hash))
          .catch((err) => handleError(err));

        return { update, dismiss };
      }
      return this._notify.hash(hash);
    }

    if (obj) {
      return this._notify.notification(obj);
    }
  }

  /**
   * Sends ETH / AVAX / whatever the primary token is of the current chain.
   *
   * @param {string} recipient - The EVM address or ENS name of the recipient
   * @param {BigNumber} value - The amount of ETH / AVAX / primary token to send.
   * @returns {ethers.TransactionResponse}
   * @see {@link https://docs.ethers.io/v5/api/providers/types/#providers-TransactionResponse}
   * @memberof SDK
   */
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

  /**
   * Checks if the address or ENS name is valid.
   *
   * @param {string} address - The address or ENS name to check
   * @returns {boolean} true if the address is valid, false otherwise
   * @memberof SDK
   */
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

  // sets up blocknative notify
  _configureNotify() {
    const { env, networkId } = this;
    const { blocknative } = env;

    if (blocknative) {
      delete this._notify;

      this._notify = Notify({ ...blocknative, networkId });
      this._notify.config({
        darkMode: true,
      });
    }
  }

  // subscribes to block updates and queues balance checks for the current provider
  async _listenToChain() {
    this._updateBalances(false).catch((e) => {
      console.warn('Failed to update balances', e.message);
    });

    this._blockNumber = await this.provider.getBlockNumber();

    this.provider.on('block', (blockNumber) => {
      this._blockNumber = blockNumber;
      this._updateBalances().catch((e) => {
        console.warn('Failed to update balances', e.message);
      });
      this.touch();
    });
  }

  // gets and sets the network information for the current provider
  async _loadNetwork() {
    const { chainId, name } = this.provider.getNetwork();
    this._networkId = chainId;
    this._networkName = name;
  }

  // looks up the ENS name of the current signer's account, defaulting to a truncated version of
  // their address.
  async _setName() {
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

  // Removes all listeners from the current provider. Used when changing providers or signers to
  // prevent O(n) query issues.
  _stopListeningToChain() {
    if (this.provider) {
      this.provider.removeAllListeners();
    }
  }

  // Gets the current balance for all tracked accounts from the chain and updates the local cache.
  // If touch is false, a subscriber update will not be triggered.
  async _updateBalances(touch = true) {
    const balances = await Promise.all(
      this._balancesToTrack.map((address) => this.provider.getBalance(address)),
    );

    for (let i = 0; i < balances.length; i += 1) {
      this._balances[this._balancesToTrack[i]] = toBigNumber(balances[i], 18);
    }

    if (touch) {
      this.touch();
    }

    return this.balances;
  }

  // updates fetches the latest gas price from the provider
  async _updateFeeData() {
    clearTimeout(this._feeDataUpdatePid);
    const { gasPrice, maxFeePerGas, maxPriorityFeePerGas } = await this.provider.getFeeData();
    this._gasPrice = toBigNumber(gasPrice, 9); // GWEI
    this._maxFeePerGas = toBigNumber(maxFeePerGas, 9); // GWEI
    this._maxPriorityFeePerGas = toBigNumber(maxPriorityFeePerGas, 9); // GWEI
    this.touch();
    this._feeDataUpdatePid = setTimeout(() => this._updateFeeData, FEE_DATA_INTERVAL);
  }
}

export default SDK;
