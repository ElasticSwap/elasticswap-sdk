/* eslint import/extensions: 0 */
import chai from 'chai';
import fetch from 'node-fetch';
import hardhat from 'hardhat';
import * as elasticSwapSDK from '../../src/index.mjs';
import LocalStorageAdapterMock from '../adapters/LocalStorageAdapterMock.mjs';
import { expectThrowsAsync } from '../testHelpers.mjs';

const { ethers, deployments } = hardhat;
const { assert } = chai;

const storageAdapter = new LocalStorageAdapterMock();

describe('ExchangeFactory', () => {
  let sdk;
  let baseToken;
  let quoteToken;
  let ExchangeFactory;
  let accounts;

  before(async () => {
    await deployments.fixture();
    ExchangeFactory = await deployments.get('ExchangeFactory');
    const { chainId } = await hardhat.ethers.provider.getNetwork();
    const env = {
      networkId: chainId,
      exchangeFactoryAddress: ExchangeFactory.address,
    };

    accounts = await ethers.getSigners();

    sdk = new elasticSwapSDK.SDK({
      env,
      customFetch: fetch,
      provider: hardhat.ethers.provider,
      signer: accounts[0],
      storageAdapter,
    });

    await sdk.awaitInitialized();

    const BaseToken = await deployments.get('BaseToken');
    baseToken = new ethers.Contract(BaseToken.address, BaseToken.abi, accounts[0]);

    const QuoteToken = await deployments.get('QuoteToken');
    quoteToken = new ethers.Contract(QuoteToken.address, QuoteToken.abi, accounts[0]);
  });

  beforeEach(async () => {
    await deployments.fixture();
    ExchangeFactory = await deployments.get('ExchangeFactory');
  });

  describe('Constructor', () => {
    it('can be created via constructor', async () => {
      await deployments.fixture();
      const exchangeFactory = new elasticSwapSDK.ExchangeFactory(sdk, ExchangeFactory.address);
      assert.isNotNull(exchangeFactory);
      assert.equal(ExchangeFactory.address, exchangeFactory.address);
    });
  });

  describe('getFeeAddress', () => {
    it('returns expected fee address', async () => {
      const exchangeFactory = new elasticSwapSDK.ExchangeFactory(sdk, ExchangeFactory.address);

      const exchangeFactoryContract = new ethers.Contract(
        ExchangeFactory.address,
        ExchangeFactory.abi,
        accounts[0],
      );
      assert.equal(
        await exchangeFactoryContract.feeAddress(),
        await exchangeFactory.getFeeAddress(),
      );
    });
  });

  describe('createNewExchange', () => {
    it('Can create a new exchange', async () => {
      const randomAccount = accounts[5];
      await sdk.changeSigner(randomAccount);

      const exchangeFactory = new elasticSwapSDK.ExchangeFactory(sdk, ExchangeFactory.address);

      const exchangeFactoryContract = new ethers.Contract(
        ExchangeFactory.address,
        ExchangeFactory.abi,
        accounts[0],
      );
      const zeroAddress = await exchangeFactoryContract.exchangeAddressByTokenAddress(
        baseToken.address,
        quoteToken.address,
      );
      assert.equal(zeroAddress, ethers.constants.AddressZero);

      await exchangeFactory.createNewExchange(baseToken.address, quoteToken.address);

      const exchangeAddress = await exchangeFactoryContract.exchangeAddressByTokenAddress(
        baseToken.address,
        quoteToken.address,
      );
      assert.notEqual(exchangeAddress, ethers.constants.AddressZero);
      const exchange = await exchangeFactory.getExchange(baseToken.address, quoteToken.address);
      assert.equal(exchangeAddress, exchange.address);
    });

    it('Will fail to create a duplicate exchange', async () => {
      const randomAccount = accounts[5];
      await sdk.changeSigner(randomAccount);
      const exchangeFactory = new elasticSwapSDK.ExchangeFactory(sdk, ExchangeFactory.address);

      await exchangeFactory.createNewExchange(baseToken.address, quoteToken.address);

      await expectThrowsAsync(
        exchangeFactory.createNewExchange.bind(
          exchangeFactory,
          baseToken.address,
          quoteToken.address,
        ),
        'Origin: exchangeFactory, Code: 20, Message: PAIR_ALREADY_EXISTS, Path: unknown.',
      );
    });

    it('Will fail to create exchange with bad addresses', async () => {
      const randomAccount = accounts[5];
      await sdk.changeSigner(randomAccount);
      const exchangeFactory = new elasticSwapSDK.ExchangeFactory(sdk, ExchangeFactory.address);

      await expectThrowsAsync(
        exchangeFactory.createNewExchange.bind(
          exchangeFactory,
          baseToken.address,
          baseToken.address,
        ),
        'Origin: exchangeFactory, Code: 19, Message: BASE_TOKEN_SAME_AS_QUOTE, Path: unknown.',
      );

      await expectThrowsAsync(
        exchangeFactory.createNewExchange.bind(
          exchangeFactory,
          baseToken.address,
          'not an address',
        ),
        '@elasticswap/sdk - validations: not an Ethereum address',
      );

      await expectThrowsAsync(
        exchangeFactory.createNewExchange.bind(
          exchangeFactory,
          'not an address',
          baseToken.address,
        ),
        '@elasticswap/sdk - validations: not an Ethereum address',
      );

      await expectThrowsAsync(
        exchangeFactory.createNewExchange.bind(
          exchangeFactory,
          baseToken.address,
          ethers.constants.AddressZero,
        ),
        'Origin: exchangeFactory, Code: 18, Message: QUOTE_TOKEN_IS_ZERO_ADDRESS, Path: unknown.',
      );

      await expectThrowsAsync(
        exchangeFactory.createNewExchange.bind(
          exchangeFactory,
          ethers.constants.AddressZero,
          baseToken.address,
        ),
        'Origin: exchangeFactory, Code: 17, Message: BASE_TOKEN_IS_ZERO_ADDRESS, Path: unknown.',
      );
    });
  });
});
