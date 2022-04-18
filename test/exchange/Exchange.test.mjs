/* eslint import/extensions: 0 */
/* eslint max-len: 0 */
// import BigNumber from 'bignumber.js';
import chai from 'chai';
import hardhat from 'hardhat';
import { buildCoreObjects, expectThrowsAsync } from '../testHelpers.mjs';

const { ethers, deployments } = hardhat;
const { expect, assert } = chai;
// const { ROUND_UP, ROUND_DOWN } = BigNumber;

describe('Exchange', () => {
  let coreObjects;
  let accounts;
  let exchange;
  let snapshotId;

  before(async () => {
    coreObjects = await buildCoreObjects(deployments, ethers.provider);
    accounts = await ethers.getSigners();
  });

  beforeEach(async () => {
    const { baseToken, quoteToken, sdk } = coreObjects;

    // save the state of the blockchain before the test
    snapshotId = await sdk.provider.send('evm_snapshot');

    // set the signer to the moneybags account
    await sdk.changeSigner(accounts[0]);

    // deploy a new exchange
    await sdk.exchangeFactory.createNewExchange(baseToken.address, quoteToken.address);
    exchange = await sdk.exchangeFactory.exchange(baseToken.address, quoteToken.address);
  });

  afterEach(async () => {
    const { sdk } = coreObjects;
    // rollback to the state before the test to prevent pollution
    await sdk.provider.send('evm_revert', [snapshotId]);
  });

  describe('constructor', () => {
    it('Can be created via constructor', async () => {
      const { baseToken, quoteToken, elasticSwapSDK, sdk } = coreObjects;

      const newExchange = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      assert.equal(exchange.address.toLowerCase(), newExchange.address);
    });
  });

  describe('getBaseTokenQtyFromQuoteTokenQty', async () => {
    it('calculates expected output for current state of exchange', async () => {
      const { baseToken, quoteToken, elasticSwapSDK, sdk } = coreObjects;
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 500000;
      const quoteTokenQtyToAdd = 100000;

      const exchangeInstance = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await exchangeInstance.quoteToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.baseToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      expect((await exchange.getBaseTokenQtyFromQuoteTokenQty(5)).toString()).to.be.equal(
        '24.873762530314116872',
      );
      expect((await exchange.getBaseTokenQtyFromQuoteTokenQty(50)).toString()).to.be.equal(
        '248.626308411565246289',
      );
      expect((await exchange.getBaseTokenQtyFromQuoteTokenQty(1.25)).toString()).to.be.equal(
        '6.218672655258850218',
      );
    });
  });

  describe('getQuoteTokenQtyFromBaseTokenQty', async () => {
    it('calculates expected output for current state of exchange', async () => {
      const { baseToken, quoteToken, elasticSwapSDK, sdk } = coreObjects;
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 500000;
      const quoteTokenQtyToAdd = 100000;

      const exchangeInstance = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await exchangeInstance.quoteToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.baseToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      expect((await exchange.getQuoteTokenQtyFromBaseTokenQty(5)).toString()).to.be.equal(
        '0.994990099848506507',
      );
      expect((await exchange.getQuoteTokenQtyFromBaseTokenQty(50)).toString()).to.be.equal(
        '9.94901007349768698',
      );
      expect((await exchange.getQuoteTokenQtyFromBaseTokenQty(1.25)).toString()).to.be.equal(
        '0.248749381235914175',
      );
    });
  });

  describe('swapBaseTokenForQuoteToken', () => {
    it('Fails when user balance is less than swap amount', async () => {
      const { baseToken, quoteToken, elasticSwapSDK, sdk } = coreObjects;
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 500000;
      const quoteTokenQtyToAdd = 100000;
      const exchangeInstance = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await exchangeInstance.quoteToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.baseToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      // send trader base tokens
      const trader = accounts[4];
      const amountToAdd = 50000;
      await baseToken.transfer(trader.address, amountToAdd);

      // add approvals for exchange to trade their quote tokens
      await sdk.changeSigner(trader);
      const swapAmount = 10000000;
      await exchangeInstance.baseToken.approve(exchangeInstance.address, swapAmount);
      // confirm no balance before trade.
      expect((await quoteToken.balanceOf(trader.address)).toNumber()).to.equal(0);
      expect((await baseToken.balanceOf(trader.address)).toNumber()).to.equal(amountToAdd);

      // swap tokens
      const testMethod = exchangeInstance.swapBaseTokenForQuoteToken.bind(
        exchangeInstance,
        swapAmount,
        1,
        expiration,
      );

      await expectThrowsAsync(testMethod, "Exchange: You don't have enough ETM token");
    });

    it('Fails when user approval is not sufficient', async () => {
      const { baseToken, quoteToken, elasticSwapSDK, sdk } = coreObjects;
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 500000;
      const quoteTokenQtyToAdd = 100000;
      const exchangeInstance = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await exchangeInstance.quoteToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.baseToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      // send trader base tokens
      const trader = accounts[4];
      const amountToAdd = 50000;
      await baseToken.transfer(trader.address, amountToAdd);

      // add approvals for exchange to trade their quote tokens
      await sdk.changeSigner(trader);
      const swapAmount = 10000000;

      // confirm no balance before trade.
      expect((await quoteToken.balanceOf(trader.address)).toNumber()).to.equal(0);
      expect((await baseToken.balanceOf(trader.address)).toNumber()).to.equal(amountToAdd);

      // swap tokens
      const testMethod = exchangeInstance.swapBaseTokenForQuoteToken.bind(
        exchangeInstance,
        swapAmount,
        1,
        expiration,
      );

      await expectThrowsAsync(testMethod, 'Exchange: Not allowed to spend that much ETM token');
    });

    it('Fails if timestamp is expired', async () => {
      const { baseToken, quoteToken, elasticSwapSDK, sdk } = coreObjects;
      // create expiration 50 minutes before now.
      const expirationInvalid = Math.round(new Date().getTime() / 1000 - 60 * 50);
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);

      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 500000;
      const quoteTokenQtyToAdd = 100000;
      const exchangeInstance = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await exchangeInstance.quoteToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.baseToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      // send trader base tokens
      const trader = accounts[4];
      const amountToAdd = 50000;
      await baseToken.transfer(trader.address, amountToAdd);

      // add approvals for exchange to trade their quote tokens
      await sdk.changeSigner(trader);
      const swapAmount = 500;
      await exchangeInstance.baseToken.approve(exchangeInstance.address, swapAmount);
      // confirm no balance before trade.
      expect((await quoteToken.balanceOf(trader.address)).toNumber()).to.equal(0);
      expect((await baseToken.balanceOf(trader.address)).toNumber()).to.equal(amountToAdd);

      // swap tokens
      const testMethod = exchangeInstance.swapBaseTokenForQuoteToken.bind(
        exchangeInstance,
        swapAmount,
        1,
        expirationInvalid,
      );

      await expectThrowsAsync(testMethod, 'Exchange: Requested expiration is in the past');
    });

    it('Should price trades correctly', async () => {
      const { baseToken, quoteToken, elasticSwapSDK, sdk } = coreObjects;
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);

      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 500000;
      const quoteTokenQtyToAdd = 100000;
      const exchangeInstance = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await exchangeInstance.quoteToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.baseToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );
      // send trader quote tokens
      const trader = accounts[4];
      const amountToAdd = 500000;
      await baseToken.transfer(trader.address, amountToAdd);
      await sdk.changeSigner(trader);
      // add approvals for exchange to trade their quote tokens
      await exchangeInstance.baseToken.approve(exchangeInstance.address, amountToAdd);
      // confirm no balance before trade.
      expect((await quoteToken.balanceOf(trader.address, { multicall: true })).toNumber()).to.equal(
        0,
      );
      expect((await baseToken.balanceOf(trader.address, { multicall: true })).toNumber()).to.equal(
        amountToAdd,
      );

      // trader executes the first trade
      const swapAmount = 100000;
      const liquidityFee = 0.005;
      const expectedFee = swapAmount * liquidityFee;

      const baseTokenReserveBalance = await baseToken.balanceOf(exchangeInstance.address);
      const pricingConstantK =
        (await exchangeInstance.baseToken.balanceOf(exchangeInstance.address)) *
        (await exchangeInstance.quoteToken.balanceOf(exchangeInstance.address));
      const quoteTokenQtyReserveBeforeTrade = pricingConstantK / baseTokenReserveBalance.toNumber();
      const quoteTokenQtyReserveAfterTrade =
        pricingConstantK / (baseTokenReserveBalance.toNumber() + swapAmount - expectedFee);
      const quoteTokenQtyExpected =
        quoteTokenQtyReserveBeforeTrade - quoteTokenQtyReserveAfterTrade;

      const quoteTokenQtyCalculated = await exchangeInstance.getQuoteTokenQtyFromBaseTokenQty(
        swapAmount,
      );

      await exchangeInstance.swapBaseTokenForQuoteToken(swapAmount, 1, expiration);

      expect(Math.floor(quoteTokenQtyCalculated.toNumber())).to.be.equal(
        Math.floor(quoteTokenQtyExpected),
      );
      expect(Math.floor((await quoteToken.balanceOf(trader.address)).toNumber())).to.equal(
        Math.floor(quoteTokenQtyExpected),
      );
      expect(Math.floor((await baseToken.balanceOf(trader.address)).toNumber())).to.equal(
        Math.floor(amountToAdd - swapAmount),
      );
    });
  });

  describe('swapQuoteTokenForBaseToken', () => {
    it('Fails when user balance is less than swap amount', async () => {
      const { baseToken, quoteToken, elasticSwapSDK, sdk } = coreObjects;
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const trader = accounts[2];
      const liquidityProviderInitialBalances = 1000000;
      const amountToAdd = 50000;
      const baseTokenQtyToAdd = 100000;
      const quoteTokenQtyToAdd = 500000;
      const exchangeInstance = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await exchangeInstance.quoteToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.baseToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      // send trader quote tokens
      await quoteToken.transfer(trader.address, amountToAdd);

      // add approvals for exchange to trade their quote tokens
      await sdk.changeSigner(trader);
      const swapAmount = 10000000;
      await exchangeInstance.quoteToken.approve(exchangeInstance.address, swapAmount);
      // confirm no balance before trade.
      expect((await baseToken.balanceOf(trader.address)).toNumber()).to.equal(0);
      expect((await quoteToken.balanceOf(trader.address)).toNumber()).to.equal(amountToAdd);

      // swap tokens
      const testMethod = exchangeInstance.swapQuoteTokenForBaseToken.bind(
        exchangeInstance,
        swapAmount,
        1,
        expiration,
      );

      await expectThrowsAsync(testMethod, "Exchange: You don't have enough FUSD token");
    });

    it('Fails when user approval is not sufficient', async () => {
      const { baseToken, quoteToken, elasticSwapSDK, sdk } = coreObjects;
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const trader = accounts[2];
      const liquidityProviderInitialBalances = 1000000;
      const amountToAdd = 50000;
      const baseTokenQtyToAdd = 100000;
      const quoteTokenQtyToAdd = 500000;
      const exchangeInstance = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await exchangeInstance.quoteToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.baseToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      // send trader quote tokens
      await quoteToken.transfer(trader.address, amountToAdd);

      // add approvals for exchange to trade their quote tokens
      await sdk.changeSigner(trader);
      const swapAmount = 100;

      // confirm no balance before trade.
      expect((await baseToken.balanceOf(trader.address)).toNumber()).to.equal(0);
      expect((await quoteToken.balanceOf(trader.address)).toNumber()).to.equal(amountToAdd);

      // swap tokens
      const testMethod = exchangeInstance.swapQuoteTokenForBaseToken.bind(
        exchangeInstance,
        swapAmount,
        1,
        expiration,
      );

      await expectThrowsAsync(testMethod, 'Exchange: Not allowed to spend that much FUSD token');
    });

    it('Should timestamp be expired', async () => {
      const { baseToken, quoteToken, elasticSwapSDK, sdk } = coreObjects;
      // create expiration 50 minutes from now.
      const expirationValid = Math.round(new Date().getTime() / 1000 + 60 * 50);
      // create expiration 50 minutes before now.
      const expirationInvalid = Math.round(new Date().getTime() / 1000 - 60 * 50);
      const liquidityProvider = accounts[1];
      const trader = accounts[2];
      const liquidityProviderInitialBalances = 1000000;
      const amountToAdd = 50000;
      const baseTokenQtyToAdd = 100000;
      const quoteTokenQtyToAdd = 500000;
      const exchangeInstance = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await exchangeInstance.quoteToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.baseToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expirationValid,
      );

      // send trader quote tokens
      await quoteToken.transfer(trader.address, amountToAdd);

      // add approvals for exchange to trade their quote tokens
      await sdk.changeSigner(trader);
      const swapAmount = 100;
      await exchangeInstance.quoteToken.approve(exchangeInstance.address, amountToAdd);
      // confirm no balance before trade.
      expect((await baseToken.balanceOf(trader.address)).toNumber()).to.equal(0);
      expect((await quoteToken.balanceOf(trader.address)).toNumber()).to.equal(amountToAdd);

      // swap tokens
      const testMethod = exchangeInstance.swapQuoteTokenForBaseToken.bind(
        exchangeInstance,
        swapAmount,
        1,
        expirationInvalid,
      );

      await expectThrowsAsync(testMethod, 'Exchange: Requested expiration is in the past');
    });

    it('Should price trades correctly', async () => {
      const { baseToken, quoteToken, elasticSwapSDK, sdk } = coreObjects;
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const trader = accounts[2];
      const liquidityProviderInitialBalances = 1000000;
      const amountToAdd = 500000;
      const baseTokenQtyToAdd = 100000;
      const quoteTokenQtyToAdd = 500000;
      const exchangeInstance = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await exchangeInstance.quoteToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.baseToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      // send trader quote tokens
      await quoteToken.transfer(trader.address, amountToAdd);

      // add approvals for exchange to trade their quote tokens
      await sdk.changeSigner(trader);
      await exchangeInstance.quoteToken.approve(exchangeInstance.address, amountToAdd);
      // confirm no balance before trade.
      expect((await baseToken.balanceOf(trader.address, { multicall: true })).toNumber()).to.equal(
        0,
      );
      expect((await quoteToken.balanceOf(trader.address, { multicall: true })).toNumber()).to.equal(
        amountToAdd,
      );

      // trader executes the first trade, our pricing should be ~1:1 currently minus fees
      const swapAmount = 100000;
      const expectedFee = swapAmount * 0.005;

      const quoteTokenReserveBalance = await quoteToken.balanceOf(exchangeInstance.address);
      const pricingConstantK =
        (await exchangeInstance.baseToken.balanceOf(exchangeInstance.address)) *
        (await exchangeInstance.quoteToken.balanceOf(exchangeInstance.address));
      const baseTokenQtyReserveBeforeTrade = pricingConstantK / quoteTokenReserveBalance.toNumber();
      const baseTokenQtyReserveAfterTrade =
        pricingConstantK / (quoteTokenReserveBalance.toNumber() + swapAmount - expectedFee);
      const baseTokenQtyExpected = baseTokenQtyReserveBeforeTrade - baseTokenQtyReserveAfterTrade;
      const baseTokenQtyCalculated = await exchangeInstance.getBaseTokenQtyFromQuoteTokenQty(
        swapAmount,
      );
      expect(Math.floor(baseTokenQtyCalculated.toNumber())).to.be.equal(
        Math.floor(baseTokenQtyExpected),
      );

      await exchangeInstance.swapQuoteTokenForBaseToken(swapAmount, 1, expiration);
      // confirm trade occurred at expected
      expect(Math.floor((await baseToken.balanceOf(trader.address)).toNumber())).to.equal(
        Math.floor(baseTokenQtyExpected),
      );
      expect(Math.floor((await quoteToken.balanceOf(trader.address)).toNumber())).to.equal(
        Math.floor(amountToAdd - swapAmount),
      );
    });
  });

  describe('addLiquidity', () => {
    it('Should quoteToken and baseToken qty to be swapped be less than quoteToken and baseToken minimum qty', async () => {
      const { baseToken, sdk, quoteToken } = coreObjects;

      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 10000;
      const quoteTokenQtyToAdd = 50000;

      // set the signer to the moneybags account
      await sdk.changeSigner(accounts[0]);

      // send users (liquidity provider) base and quote tokens for easy accounting.

      await Promise.all([
        baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances),
        quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances),
      ]);

      // set the signer to the LP
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await Promise.all([
        baseToken.approve(exchange.address, baseTokenQtyToAdd),
        quoteToken.approve(exchange.address, quoteTokenQtyToAdd),
      ]);

      const testMethod = await exchange.addLiquidity.bind(
        exchange,
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        baseTokenQtyToAdd + 1,
        baseTokenQtyToAdd + 1,
        liquidityProvider.address,
        expiration,
      );

      await expectThrowsAsync(
        testMethod,
        'Exchange: Minimum amount of ETM requested is greater than the maximum.',
      );

      // confirm the exchange has 0 balance for base and quote token
      expect(
        (await baseToken.balanceOf(exchange.address, { multicall: true })).toNumber(),
      ).to.equal(0);
      expect(
        (await quoteToken.balanceOf(exchange.address, { multicall: true })).toNumber(),
      ).to.equal(0);
    });

    it('Should baseToken balance be less than baseToken to be swapped', async () => {
      const { baseToken, sdk, quoteToken } = coreObjects;

      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderBaseTokenInitialBalance = 1;
      const liquidityProviderQuoteTokenInitialBalance = 10000000;
      const baseTokenQtyToAdd = 10000;
      const quoteTokenQtyToAdd = 50000;

      // set the signer to the moneybags account
      await sdk.changeSigner(accounts[0]);

      // send users (liquidity provider) base and quote tokens for easy accounting.

      await Promise.all([
        baseToken.transfer(liquidityProvider.address, liquidityProviderBaseTokenInitialBalance),
        quoteToken.transfer(liquidityProvider.address, liquidityProviderQuoteTokenInitialBalance),
      ]);

      // set the signer to the LP
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await Promise.all([
        baseToken.approve(exchange.address, baseTokenQtyToAdd),
        quoteToken.approve(exchange.address, quoteTokenQtyToAdd),
      ]);

      const testMethod = exchange.addLiquidity.bind(
        exchange,
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      await expectThrowsAsync(testMethod, "Exchange: You don't have enough ETM");

      // confirm the exchange has 0 balance for base and quote token
      expect(
        (await baseToken.balanceOf(exchange.address, { multicall: true })).toNumber(),
      ).to.equal(0);
      expect(
        (await quoteToken.balanceOf(exchange.address, { multicall: true })).toNumber(),
      ).to.equal(0);
    });

    it('Should quoteToken balance be less than quoteToken to be swapped', async () => {
      const { baseToken, sdk, quoteToken } = coreObjects;

      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderBaseTokenInitialBalance = 10000000;
      const liquidityProviderQuoteTokenInitialBalance = 1;
      const baseTokenQtyToAdd = 10000;
      const quoteTokenQtyToAdd = 50000;

      // set the signer to the moneybags account
      await sdk.changeSigner(accounts[0]);

      // send users (liquidity provider) base and quote tokens for easy accounting.

      await Promise.all([
        baseToken.transfer(liquidityProvider.address, liquidityProviderBaseTokenInitialBalance),
        quoteToken.transfer(liquidityProvider.address, liquidityProviderQuoteTokenInitialBalance),
      ]);

      // set the signer to the LP
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await Promise.all([
        baseToken.approve(exchange.address, baseTokenQtyToAdd),
        quoteToken.approve(exchange.address, quoteTokenQtyToAdd),
      ]);

      const testMethod = exchange.addLiquidity.bind(
        exchange,
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      await expectThrowsAsync(testMethod, "Exchange: You don't have enough FUSD");

      // confirm the exchange has 0 balance for base and quote token
      expect(
        (await baseToken.balanceOf(exchange.address, { multicall: true })).toNumber(),
      ).to.equal(0);
      expect(
        (await quoteToken.balanceOf(exchange.address, { multicall: true })).toNumber(),
      ).to.equal(0);
    });

    it('Should timestamp be expired', async () => {
      const { baseToken, sdk, quoteToken } = coreObjects;

      // create expiration 50 minutes before now.
      const expiration = Math.round(new Date().getTime() / 1000 - 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 10000;
      const quoteTokenQtyToAdd = 50000;

      // set the signer to the moneybags account
      await sdk.changeSigner(accounts[0]);

      // send users (liquidity provider) base and quote tokens for easy accounting.

      await Promise.all([
        baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances),
        quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances),
      ]);

      // set the signer to the LP
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await Promise.all([
        baseToken.approve(exchange.address, baseTokenQtyToAdd),
        quoteToken.approve(exchange.address, quoteTokenQtyToAdd),
      ]);

      const testMethod = exchange.addLiquidity.bind(
        exchange,
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      await expectThrowsAsync(testMethod, 'Exchange: Requested expiration is in the past');

      // confirm the exchange has 0 balance for base and quote token
      expect(
        (await baseToken.balanceOf(exchange.address, { multicall: true })).toNumber(),
      ).to.equal(0);
      expect(
        (await quoteToken.balanceOf(exchange.address, { multicall: true })).toNumber(),
      ).to.equal(0);
    });

    it('Should ADD quote and base token liquidity', async () => {
      const { baseToken, sdk, quoteToken } = coreObjects;

      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 10000;
      const quoteTokenQtyToAdd = 50000;

      // set the signer to the moneybags account
      await sdk.changeSigner(accounts[0]);

      // send users (liquidity provider) base and quote tokens for easy accounting.

      await Promise.all([
        baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances),
        quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances),
      ]);

      // set the signer to the LP
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await Promise.all([
        baseToken.approve(exchange.address, baseTokenQtyToAdd),
        quoteToken.approve(exchange.address, quoteTokenQtyToAdd),
      ]);

      await exchange.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      // confirm the exchange now has the expected balance
      expect((await baseToken.balanceOf(exchange.address)).toNumber()).to.equal(baseTokenQtyToAdd);
      expect((await quoteToken.balanceOf(exchange.address)).toNumber()).to.equal(
        quoteTokenQtyToAdd,
      );
    });
  });

  describe('getTokenQtysFromLPTokenQty', async () => {
    it('calculates return values correctly', async () => {
      const { baseToken, quoteToken, elasticSwapSDK, sdk } = coreObjects;
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 100000;
      const quoteTokenQtyToAdd = 500000;
      const exchangeInstance = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await exchangeInstance.quoteToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.baseToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      const lpTokenQty = (await exchangeInstance.balanceOf(liquidityProvider.address)).div(3);
      const tokenQtysToReturn = await exchangeInstance.getTokenQtysFromLPTokenQty(lpTokenQty);
      const totalSupplyOfLP = await exchangeInstance.totalSupply();
      const totalBaseTokens = await exchangeInstance.baseToken.balanceOf(exchangeInstance.address);
      const totalQuoteTokens = await exchangeInstance.quoteToken.balanceOf(
        exchangeInstance.address,
      );

      const expectedBaseTokensToReturn = lpTokenQty
        .multipliedBy(totalBaseTokens)
        .dividedBy(totalSupplyOfLP);
      const expectedQuoteTokensToReturn = lpTokenQty
        .multipliedBy(totalQuoteTokens)
        .dividedBy(totalSupplyOfLP);

      expect(Math.floor(expectedBaseTokensToReturn.toNumber())).to.be.equal(
        Math.floor(tokenQtysToReturn.baseTokenQty.toNumber()),
      );
      expect(Math.floor(expectedQuoteTokensToReturn.toNumber())).to.be.equal(
        Math.floor(tokenQtysToReturn.quoteTokenQty.toNumber()),
      );
    });
  });

  describe('getLPTokenQtyFromTokenQtys', async () => {
    it('calculates return values correctly', async () => {
      const { baseToken, quoteToken, elasticSwapSDK, sdk } = coreObjects;
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 100000;
      const quoteTokenQtyToAdd = 500000;
      const exchangeInstance = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);
      await sdk.changeSigner(liquidityProvider);

      // add approvals
      await exchangeInstance.quoteToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.baseToken.approve(
        exchangeInstance.address,
        liquidityProviderInitialBalances,
      );

      await exchangeInstance.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      const lpTokenQty = (await exchangeInstance.balanceOf(liquidityProvider.address)).div(3);
      const tokenQtysToReturn = await exchangeInstance.getTokenQtysFromLPTokenQty(lpTokenQty);

      // using these values, we can see what would happen if we add this amount
      // of tokens back to the exchange
      const calculatedLpTokensBack = await exchangeInstance.getLPTokenQtyFromTokenQtys(
        tokenQtysToReturn.baseTokenQty,
        tokenQtysToReturn.quoteTokenQty,
      );
      expect(Math.floor(lpTokenQty.toNumber())).to.equal(
        Math.floor(calculatedLpTokensBack.toNumber()),
      );
    });
  });

  /*
  // TODO: Reenable this when the functionality is reintroduced
  describe.skip('removeLiquidity', () => {
    it('Should LP Token allowance balance be less than LP Token to be swapped', async () => {
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 10000;
      const quoteTokenQtyToAdd = 50000;

      await sdk.changeSigner(liquidityProvider);
      exchangeClass = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.

      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      // add approvals

      await exchangeClass.quoteToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.baseToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      // confirm the exchange now has the expected balance
      expect((await baseToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(
        baseTokenQtyToAdd,
      );

      expect((await quoteToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(
        quoteTokenQtyToAdd,
      );

      const lpTokenQtyToRemove = (await exchangeClass.lpTokenBalance).toNumber();

      expect(lpTokenQtyToRemove).to.greaterThan(0);

      await exchangeClass.lpToken.approve(exchangeClass.address, 1);

      const testMethod = exchangeClass.removeLiquidity.bind(
        exchangeClass,
        lpTokenQtyToRemove,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      await expectThrowsAsync(
        testMethod,
        'Origin: exchange, Code: 13, Message: TRANSFER_NOT_APPROVED_BY_USER, Path: unknown.',
      );

      expect((await baseToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(
        baseTokenQtyToAdd,
      );

      expect((await quoteToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(
        quoteTokenQtyToAdd,
      );

      expect((await exchangeClass.lpTokenBalance).toNumber()).to.equal(lpTokenQtyToRemove);
    });

    it('Should LP Token balance be less than LP Token to be removed', async () => {
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 10000;
      const quoteTokenQtyToAdd = 50000;

      await sdk.changeSigner(liquidityProvider);
      exchangeClass = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.

      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      // add approvals

      await exchangeClass.quoteToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.baseToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      // confirm the exchange now has the expected balance
      expect((await baseToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(
        baseTokenQtyToAdd,
      );

      expect((await quoteToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(
        quoteTokenQtyToAdd,
      );

      const lpTokenQtyToRemove = (await exchangeClass.lpTokenBalance).toNumber() + 1;

      expect(lpTokenQtyToRemove).to.greaterThan(0);

      await exchangeClass.lpToken.approve(exchangeClass.address, 1000000000000000);

      const testMethod = exchangeClass.removeLiquidity.bind(
        exchangeClass,
        lpTokenQtyToRemove,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      await expectThrowsAsync(
        testMethod,
        'Origin: exchange, Code: 16, Message: NOT_ENOUGH_LP_TOKEN_BALANCE, Path: unknown.',
      );

      expect((await baseToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(
        baseTokenQtyToAdd,
      );

      expect((await quoteToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(
        quoteTokenQtyToAdd,
      );

      expect((await exchangeClass.lpTokenBalance).toNumber()).to.equal(lpTokenQtyToRemove - 1);
    });

    it('Should timestamp be expired', async () => {
      // create expiration 50 minutes from now.
      const expirationValid = Math.round(new Date().getTime() / 1000 + 60 * 50);
      // create expiration 50 minutes before now.
      const expirationInvalid = Math.round(new Date().getTime() / 1000 - 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 10000;
      const quoteTokenQtyToAdd = 50000;

      await sdk.changeSigner(liquidityProvider);
      exchangeClass = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.

      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      // add approvals

      await exchangeClass.quoteToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.baseToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expirationValid,
      );

      // confirm the exchange now has the expected balance
      expect((await baseToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(
        baseTokenQtyToAdd,
      );

      expect((await quoteToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(
        quoteTokenQtyToAdd,
      );

      const lpTokenQtyToRemove = (await exchangeClass.lpTokenBalance).toNumber();

      expect(lpTokenQtyToRemove).to.greaterThan(0);

      await exchangeClass.lpToken.approve(exchangeClass.address, 1000000000000000);

      const testMethod = exchangeClass.removeLiquidity.bind(
        exchangeClass,
        lpTokenQtyToRemove,
        1,
        1,
        liquidityProvider.address,
        expirationInvalid,
      );

      await expectThrowsAsync(
        testMethod,
        'Origin: exchange, Code: 14, Message: TIMESTAMP_EXPIRED, Path: unknown.',
      );

      expect((await baseToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(
        baseTokenQtyToAdd,
      );

      expect((await quoteToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(
        quoteTokenQtyToAdd,
      );

      expect((await exchangeClass.lpTokenBalance).toNumber()).to.equal(lpTokenQtyToRemove);
    });

    it('Should allow for REMOVE quote and base token liquidity', async () => {
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const liquidityProviderInitialBalances = 1000000;
      const baseTokenQtyToAdd = 10000;
      const quoteTokenQtyToAdd = 50000;

      await sdk.changeSigner(liquidityProvider);
      exchangeClass = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.

      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      // add approvals

      await exchangeClass.quoteToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.baseToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      // confirm the exchange now has the expected balance
      expect((await baseToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(
        baseTokenQtyToAdd,
      );

      expect((await quoteToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(
        quoteTokenQtyToAdd,
      );

      const lpTokenQtyToRemove = (await exchangeClass.lpTokenBalance).toNumber();

      expect(lpTokenQtyToRemove).to.greaterThan(0);

      await exchangeClass.lpToken.approve(exchangeClass.address, 1000000000000000);

      await exchangeClass.removeLiquidity(
        lpTokenQtyToRemove,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      // should remove all but some min_liquidity that is locked.
      expect((await baseToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(448);

      expect((await quoteToken.balanceOf(exchangeClass.address)).toNumber()).to.equal(2237);

      expect((await exchangeClass.lpTokenBalance).toNumber()).to.equal(0);
    });
  });

  // TODO: Reenable this when the functionality is reintroduced
  describe.skip('calculatePriceImpact', () => {
    it('should calculate the price impact, accounting for fees and 0 slippage', async () => {
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const trader = accounts[2];
      const liquidityProviderInitialBalances = 1000000;
      const amountToAdd = 1000000;
      const baseTokenQtyToAdd = 10000;
      const quoteTokenQtyToAdd = 50000;

      await sdk.changeSigner(liquidityProvider);
      exchangeClass = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      // add approvals
      await exchangeClass.quoteToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.baseToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      await sdk.changeSigner(trader);
      exchangeClass = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send trader quote tokens - 1000000
      await quoteToken.transfer(trader.address, amountToAdd);

      // add approvals for exchange to trade their quote tokens
      await exchangeClass.quoteToken.approve(exchangeClass.address, amountToAdd);
      // confirm no balance before trade.
      expect((await baseToken.balanceOf(trader.address)).toNumber()).to.equal(0);
      expect((await quoteToken.balanceOf(trader.address)).toNumber()).to.equal(amountToAdd);

      // trader executes the first trade, our pricing should be ~1:1 currently minus fees
      const swapAmount = 10000;
      const swapAmountBN = toBigNumber(swapAmount);
      const expectedFeeBN = await exchangeClass.calculateFees(swapAmount);
      const quoteTokenReserveBalance = await quoteToken.balanceOf(exchangeClass.address);
      const quoteTokenReserveBalanceBN = toBigNumber(quoteTokenReserveBalance);
      const pricingConstantK = (
        await exchangeClass.baseToken.balanceOf(exchangeClass.address)
      ).multipliedBy(await exchangeClass.quoteToken.balanceOf(exchangeClass.address));

      const pricingConstantKBN = toBigNumber(pricingConstantK);
      const baseTokenQtyReserveBeforeTradeBN = pricingConstantKBN.dividedBy(
        quoteTokenReserveBalanceBN,
      );
      const initialPriceBN = quoteTokenReserveBalanceBN.dividedBy(baseTokenQtyReserveBeforeTradeBN);
      const quoteTokenReserveQtyAfterTradeBN = quoteTokenReserveBalanceBN
        .plus(swapAmountBN)
        .minus(expectedFeeBN);
      const baseTokenQtyReserveAfterTradeBN = pricingConstantKBN
        .dividedBy(quoteTokenReserveQtyAfterTradeBN)
        .dp(0, ROUND_UP);
      const outputTokenAmountLessFeesBN = baseTokenQtyReserveBeforeTradeBN.minus(
        baseTokenQtyReserveAfterTradeBN,
      );

      const slippagePercent = 0;
      const slippagePercentBN = toBigNumber(slippagePercent);
      const slippageMultiplierBN = toBigNumber(1).minus(
        slippagePercentBN.dividedBy(toBigNumber(100)),
      );
      const outputTokenAmountLessFeesLessSlippageBN =
        outputTokenAmountLessFeesBN.multipliedBy(slippageMultiplierBN);

      const initialOutpUtAmount = swapAmountBN.dividedBy(initialPriceBN);
      const ratioMultiplier = outputTokenAmountLessFeesLessSlippageBN
        .dividedBy(initialOutpUtAmount)
        .multipliedBy(BigNumber(100));
      const calculatedPriceImpactBN = toBigNumber(100).minus(ratioMultiplier);

      const expectedPriceImpact = await exchangeClass.calculatePriceImpact(
        swapAmount,
        quoteToken.address,
        slippagePercent,
      );

      expect(expectedPriceImpact.toString()).to.equal(calculatedPriceImpactBN.toString());
    });

    it('should calculate the alternative price impact, accounting for fees and slippage', async () => {
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const trader = accounts[2];
      const liquidityProviderInitialBalances = 1000000;
      const amountToAdd = 1000000;
      const baseTokenQtyToAdd = 10000;
      const quoteTokenQtyToAdd = 50000;

      await sdk.changeSigner(liquidityProvider);
      exchangeClass = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      // add approvals
      await exchangeClass.quoteToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.baseToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      await sdk.changeSigner(trader);
      exchangeClass = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send trader quote tokens - 1000000
      await quoteToken.transfer(trader.address, amountToAdd);

      // add approvals for exchange to trade their quote tokens
      await exchangeClass.quoteToken.approve(exchangeClass.address, amountToAdd);
      // confirm no balance before trade.
      expect((await baseToken.balanceOf(trader.address)).toNumber()).to.equal(0);
      expect((await quoteToken.balanceOf(trader.address)).toNumber()).to.equal(amountToAdd);

      // trader executes the first trade, our pricing should be ~1:1 currently minus fees
      const swapAmount = 10000;
      const swapAmountBN = toBigNumber(swapAmount);
      const expectedFeeBN = await exchangeClass.calculateFees(swapAmount);
      const quoteTokenReserveBalance = await quoteToken.balanceOf(exchangeClass.address);
      const quoteTokenReserveBalanceBN = toBigNumber(quoteTokenReserveBalance);
      const pricingConstantK = (
        await exchangeClass.baseToken.balanceOf(exchangeClass.address)
      ).multipliedBy(await exchangeClass.quoteToken.balanceOf(exchangeClass.address));

      const pricingConstantKBN = toBigNumber(pricingConstantK);
      const baseTokenQtyReserveBeforeTradeBN = pricingConstantKBN.dividedBy(
        quoteTokenReserveBalanceBN,
      );
      const initialPriceBN = quoteTokenReserveBalanceBN.dividedBy(baseTokenQtyReserveBeforeTradeBN);
      const quoteTokenReserveQtyAfterTradeBN = quoteTokenReserveBalanceBN
        .plus(swapAmountBN)
        .minus(expectedFeeBN);
      const baseTokenQtyReserveAfterTradeBN = pricingConstantKBN
        .dividedBy(quoteTokenReserveQtyAfterTradeBN)
        .dp(0, ROUND_UP);
      const outputTokenAmountLessFeesBN = baseTokenQtyReserveBeforeTradeBN.minus(
        baseTokenQtyReserveAfterTradeBN,
      );

      const slippagePercent = 5;
      const slippagePercentBN = toBigNumber(slippagePercent);
      const slippageMultiplierBN = toBigNumber(1).minus(
        slippagePercentBN.dividedBy(toBigNumber(100)),
      );
      const outputTokenAmountLessFeesLessSlippageBN =
        outputTokenAmountLessFeesBN.multipliedBy(slippageMultiplierBN);

      const initialOutpUtAmount = swapAmountBN.dividedBy(initialPriceBN);
      const ratioMultiplier = outputTokenAmountLessFeesLessSlippageBN
        .dividedBy(initialOutpUtAmount)
        .multipliedBy(BigNumber(100));
      const calculatedPriceImpactBN = toBigNumber(100).minus(ratioMultiplier);

      const expectedPriceImpact = await exchangeClass.calculatePriceImpact(
        swapAmount,
        quoteToken.address,
        slippagePercent,
      );

      expect(expectedPriceImpact.toString()).to.equal(calculatedPriceImpactBN.toString());
    });
  });

  // TODO: Reenable this when the functionality is reintroduced
  describe.skip('calculateInputAmountFromOutputAmount', () => {
    it('should calculate the input amount from output amount correctly, accounting for fees and 0 slippage', async () => {
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const trader = accounts[2];
      const liquidityProviderInitialBalances = 1000000;
      const amountToAdd = 1000000;
      const baseTokenQtyToAdd = 10000;
      const quoteTokenQtyToAdd = 50000;

      await sdk.changeSigner(liquidityProvider);
      exchangeClass = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      // add approvals
      await exchangeClass.quoteToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.baseToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      await sdk.changeSigner(trader);
      exchangeClass = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send trader quote tokens - 1000000
      await quoteToken.transfer(trader.address, amountToAdd);

      // add approvals for exchange to trade their quote tokens
      await exchangeClass.quoteToken.approve(exchangeClass.address, amountToAdd);
      // confirm no balance before trade.
      expect((await baseToken.balanceOf(trader.address)).toNumber()).to.equal(0);
      expect((await quoteToken.balanceOf(trader.address)).toNumber()).to.equal(amountToAdd);

      const outputAmount = 10000;
      const outputAmountBN = toBigNumber(outputAmount);

      const liquidityFeeInBasisPointsBN = toBigNumber(liquidityFeeInBasisPoints);

      const quoteTokenReserveBalance = await quoteToken.balanceOf(exchangeClass.address);
      const quoteTokenReserveBalanceBN = toBigNumber(quoteTokenReserveBalance);

      const pricingConstantK = (
        await exchangeClass.baseToken.balanceOf(exchangeClass.address)
      ).multipliedBy(await exchangeClass.quoteToken.balanceOf(exchangeClass.address));
      const pricingConstantKBN = toBigNumber(pricingConstantK);

      const baseTokenQtyReserveBN = pricingConstantKBN.dividedBy(quoteTokenReserveBalanceBN);

      const slippagePercentBN = toBigNumber(0);
      const BASIS_POINTS = toBigNumber(10000);

      const numerator = outputAmountBN
        .multipliedBy(quoteTokenReserveBalanceBN)
        .multipliedBy(BASIS_POINTS)
        .dp(18, ROUND_DOWN);

      const basisPointDifference = BASIS_POINTS.minus(liquidityFeeInBasisPointsBN);

      const outputSlippageMultiplier = baseTokenQtyReserveBN
        .multipliedBy(slippagePercentBN.dividedBy(BigNumber(100)))
        .dp(18, ROUND_DOWN);

      const outputSlippageTerm = outputAmountBN
        .plus(outputSlippageMultiplier)
        .minus(baseTokenQtyReserveBN)
        .dp(18, ROUND_DOWN);

      const denominator = outputSlippageTerm.multipliedBy(basisPointDifference);

      const calculatedInputAmount = numerator.dividedBy(denominator).abs();

      const expectedInputAmount = await exchangeClass.calculateInputAmountFromOutputAmount(
        outputAmountBN,
        baseToken.address,
        slippagePercentBN,
      );

      expect(expectedInputAmount.toNumber()).to.equal(calculatedInputAmount.toNumber());
    });

    it('should calculate the input amount from output amount correctly, accounting for fees and slippage', async () => {
      // create expiration 50 minutes from now.
      const expiration = Math.round(new Date().getTime() / 1000 + 60 * 50);
      const liquidityProvider = accounts[1];
      const trader = accounts[2];
      const liquidityProviderInitialBalances = 1000000;
      const amountToAdd = 1000000;
      const baseTokenQtyToAdd = 10000;
      const quoteTokenQtyToAdd = 50000;

      await sdk.changeSigner(liquidityProvider);
      exchangeClass = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send users (liquidity provider) base and quote tokens for easy accounting.
      await baseToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      await quoteToken.transfer(liquidityProvider.address, liquidityProviderInitialBalances);

      // add approvals
      await exchangeClass.quoteToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.baseToken.approve(
        exchangeClass.address,
        liquidityProviderInitialBalances,
      );

      await exchangeClass.addLiquidity(
        baseTokenQtyToAdd,
        quoteTokenQtyToAdd,
        1,
        1,
        liquidityProvider.address,
        expiration,
      );

      await sdk.changeSigner(trader);
      exchangeClass = new elasticSwapSDK.Exchange(
        sdk,
        exchange.address,
        baseToken.address,
        quoteToken.address,
      );

      // send trader quote tokens - 1000000
      await quoteToken.transfer(trader.address, amountToAdd);

      // add approvals for exchange to trade their quote tokens
      await exchangeClass.quoteToken.approve(exchangeClass.address, amountToAdd);
      // confirm no balance before trade.
      expect((await baseToken.balanceOf(trader.address)).toNumber()).to.equal(0);
      expect((await quoteToken.balanceOf(trader.address)).toNumber()).to.equal(amountToAdd);

      const outputAmount = 10000;
      const outputAmountBN = toBigNumber(outputAmount);

      const liquidityFeeInBasisPointsBN = toBigNumber(liquidityFeeInBasisPoints);

      const quoteTokenReserveBalance = await quoteToken.balanceOf(exchangeClass.address);
      const quoteTokenReserveBalanceBN = toBigNumber(quoteTokenReserveBalance);

      const pricingConstantK = (
        await exchangeClass.baseToken.balanceOf(exchangeClass.address)
      ).multipliedBy(await exchangeClass.quoteToken.balanceOf(exchangeClass.address));
      const pricingConstantKBN = toBigNumber(pricingConstantK);

      const baseTokenQtyReserveBN = pricingConstantKBN.dividedBy(quoteTokenReserveBalanceBN);

      const slippagePercentBN = toBigNumber(5);
      const BASIS_POINTS = toBigNumber(10000);

      const numerator = outputAmountBN
        .multipliedBy(quoteTokenReserveBalanceBN)
        .multipliedBy(BASIS_POINTS)
        .dp(18, ROUND_DOWN);

      const basisPointDifference = BASIS_POINTS.minus(liquidityFeeInBasisPointsBN);

      const outputSlippageMultiplier = baseTokenQtyReserveBN
        .multipliedBy(slippagePercentBN.dividedBy(BigNumber(100)))
        .dp(18, ROUND_DOWN);

      const outputSlippageTerm = outputAmountBN
        .plus(outputSlippageMultiplier)
        .minus(baseTokenQtyReserveBN)
        .dp(18, ROUND_DOWN);

      const denominator = outputSlippageTerm.multipliedBy(basisPointDifference);

      const calculatedInputAmount = numerator.dividedBy(denominator).abs();

      const expectedInputAmount = await exchangeClass.calculateInputAmountFromOutputAmount(
        outputAmountBN,
        baseToken.address,
        slippagePercentBN,
      );

      expect(expectedInputAmount.toNumber()).to.equal(calculatedInputAmount.toNumber());
    });
  });
  */
});
