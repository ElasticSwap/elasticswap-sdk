/* eslint import/extensions: 0 */
import chai from 'chai';
import hardhat from 'hardhat';
import { buildCoreObjects, expectThrowsAsync } from '../testHelpers.mjs';

const { ethers, deployments } = hardhat;
const { assert } = chai;

describe('ExchangeFactory', () => {
  let coreObjects;
  let accounts;
  let snapshotId;

  before(async () => {
    coreObjects = await buildCoreObjects(deployments, ethers.provider);
    accounts = await ethers.getSigners();
  });

  beforeEach(async () => {
    const { sdk } = coreObjects;
    // save the state of the blockchain before the test
    snapshotId = await sdk.provider.send('evm_snapshot');
  });

  afterEach(async () => {
    const { sdk } = coreObjects;
    // rollback to the state before the test to prevent polution
    await sdk.provider.send('evm_revert', [snapshotId]);
  });

  describe('Constructor', () => {
    it('can be created via constructor', async () => {
      const { elasticSwapSDK, ExchangeFactory, sdk } = coreObjects;

      const exchangeFactory = new elasticSwapSDK.ExchangeFactory(sdk, ExchangeFactory.address);

      assert.isNotNull(exchangeFactory);
      assert.equal(ExchangeFactory.address.toLowerCase(), exchangeFactory.address);
    });
  });

  describe('feeAddress', () => {
    it('returns expected fee address', async () => {
      const { exchangeFactoryContract, sdk } = coreObjects;

      const { exchangeFactory } = sdk;

      assert.equal(
        (await exchangeFactoryContract.feeAddress()).toLowerCase(),
        await exchangeFactory.feeAddress(),
      );
    });
  });

  describe('createNewExchange', () => {
    it('Can create a new exchange', async () => {
      const { baseToken, exchangeFactoryContract, quoteToken, sdk } = coreObjects;

      // set a signer
      await sdk.changeSigner(accounts[5]);

      const { exchangeFactory } = sdk;

      // Start by making sure the exchange doesn't exist
      const zeroAddress = await exchangeFactoryContract.exchangeAddressByTokenAddress(
        baseToken.address,
        quoteToken.address,
      );
      assert.equal(zeroAddress, ethers.constants.AddressZero);

      // Create a new exchange
      await exchangeFactory.createNewExchange(baseToken.address, quoteToken.address);

      // Make sure the exchange now does exist
      const exchangeAddress = await exchangeFactoryContract.exchangeAddressByTokenAddress(
        baseToken.address,
        quoteToken.address,
      );
      assert.notEqual(exchangeAddress, ethers.constants.AddressZero);

      // Make sure we can fetch the exchange from the class itself
      const exchange = await exchangeFactory.exchange(baseToken.address, quoteToken.address);
      assert.equal(exchangeAddress.toLowerCase(), exchange.address);
    });

    it('Will fail to create a duplicate exchange', async () => {
      const { baseToken, quoteToken, sdk } = coreObjects;

      // set a signer
      await sdk.changeSigner(accounts[5]);

      const { exchangeFactory } = sdk;

      // create the exchange the first time
      await exchangeFactory.createNewExchange(baseToken.address, quoteToken.address);

      await expectThrowsAsync(
        exchangeFactory.createNewExchange.bind(
          exchangeFactory,
          baseToken.address,
          quoteToken.address,
        ),
        'ExchangeFactory: An exchange already exists for that pair!',
      );
    });

    it('Will fail to create exchange with bad addresses', async () => {
      const { baseToken, sdk } = coreObjects;

      // set a signer
      await sdk.changeSigner(accounts[5]);

      const { exchangeFactory } = sdk;

      await expectThrowsAsync(
        exchangeFactory.createNewExchange.bind(
          exchangeFactory,
          baseToken.address,
          baseToken.address,
        ),
        'ExchangeFactory: Cannot create an exchange when Quote and Base tokens are the same',
      );

      await expectThrowsAsync(
        exchangeFactory.createNewExchange.bind(
          exchangeFactory,
          baseToken.address,
          'not an address',
        ),
        'ExchangeFactory: not an Ethereum address (not an address)',
      );

      await expectThrowsAsync(
        exchangeFactory.createNewExchange.bind(
          exchangeFactory,
          'not an address',
          baseToken.address,
        ),
        'ExchangeFactory: not an Ethereum address (not an address)',
      );

      await expectThrowsAsync(
        exchangeFactory.createNewExchange.bind(
          exchangeFactory,
          baseToken.address,
          ethers.constants.AddressZero,
        ),
        'ExchangeFactory: Quote and Base tokens must both be ERC20 tokens',
      );

      await expectThrowsAsync(
        exchangeFactory.createNewExchange.bind(
          exchangeFactory,
          ethers.constants.AddressZero,
          baseToken.address,
        ),
        'ExchangeFactory: Quote and Base tokens must both be ERC20 tokens',
      );
    });
  });
});
