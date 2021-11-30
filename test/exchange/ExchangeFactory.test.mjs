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
    const env = {
      networkId: 99999,
      exchangeFactoryAddress: '0x8C2251e028043e38f58Ac64c00E1F940D305Aa62',
    };
    sdk = new elasticSwapSDK.SDK({
      env,
      customFetch: fetch,
      provider: hardhat.ethers.provider,
      storageAdapter,
    });

    await deployments.fixture();
    accounts = await ethers.getSigners();

    const BaseToken = await deployments.get('BaseToken');
    baseToken = new ethers.Contract(
      BaseToken.address,
      BaseToken.abi,
      accounts[0],
    );

    const QuoteToken = await deployments.get('QuoteToken');
    quoteToken = new ethers.Contract(
      QuoteToken.address,
      QuoteToken.abi,
      accounts[0],
    );
  });

  beforeEach(async () => {
    await deployments.fixture();
    ExchangeFactory = await deployments.get('ExchangeFactory');
  });

  describe('Constructor', () => {
    it('can be created via constructor', async () => {
      await deployments.fixture();
      const exchangeFactory = new elasticSwapSDK.ExchangeFactory(
        sdk,
        ExchangeFactory.address,
      );
      assert.isNotNull(exchangeFactory);
      assert.equal(ExchangeFactory.address, exchangeFactory.address);
    });
  });

  describe('getFeeAddress', () => {
    it('returns expected fee address', async () => {
      const exchangeFactory = new elasticSwapSDK.ExchangeFactory(
        sdk,
        ExchangeFactory.address,
      );

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

      const exchangeFactory = new elasticSwapSDK.ExchangeFactory(
        sdk,
        ExchangeFactory.address,
      );

      const exchangeFactoryContract = new ethers.Contract(
        ExchangeFactory.address,
        ExchangeFactory.abi,
        accounts[0],
      );
      const zeroAddress =
        await exchangeFactoryContract.exchangeAddressByTokenAddress(
          baseToken.address,
          quoteToken.address,
        );
      assert.equal(zeroAddress, ethers.constants.AddressZero);

      await exchangeFactory.createNewExchange(
        'TestPair',
        'ELP',
        baseToken.address,
        quoteToken.address,
      );
      const exchangeAddress =
        await exchangeFactoryContract.exchangeAddressByTokenAddress(
          baseToken.address,
          quoteToken.address,
        );
      assert.notEqual(exchangeAddress, ethers.constants.AddressZero);
    });

    it('Will fail to create a duplicate exchange', async () => {
      const randomAccount = accounts[5];
      await sdk.changeSigner(randomAccount);
      const exchangeFactory = new elasticSwapSDK.ExchangeFactory(
        sdk,
        ExchangeFactory.address,
      );

      await exchangeFactory.createNewExchange(
        'TestPair',
        'ELP',
        baseToken.address,
        quoteToken.address,
      );

      await expectThrowsAsync(
        exchangeFactory.createNewExchange.bind(
          exchangeFactory,
          'TestPair',
          'ELP',
          baseToken.address,
          quoteToken.address,
        ),
        'Origin: exchangeFactory, Code: 20, Message: PAIR_ALREADY_EXISTS, Path: unknown.',
      );
    });
  });
});
