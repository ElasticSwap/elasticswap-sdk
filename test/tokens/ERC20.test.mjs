/* eslint import/extensions: 0 */
import chai from 'chai';
import hardhat from 'hardhat';
import { buildCoreObjects } from '../testHelpers.mjs';

const { ethers, deployments } = hardhat;
const { assert } = chai;

describe('ERC20', () => {
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
      const { QuoteToken, elasticSwapSDK, sdk } = coreObjects;

      const { ERC20 } = elasticSwapSDK;

      const erc20 = new ERC20(sdk, QuoteToken.address);

      assert.equal(QuoteToken.address.toLowerCase(), erc20.address);
    });
  });

  describe('balanceOf', () => {
    it('Gets correct balance of address when balance is not zero', async () => {
      const { quoteToken, quoteTokenContract, quoteTokenDecimals, toBigNumber } = coreObjects;

      // get the balance from the contract directly
      const rawBalance = await quoteTokenContract.balanceOf(accounts[0].address);

      // convert it to decimal format
      const expectedBalance = toBigNumber(rawBalance, quoteTokenDecimals);

      assert.isTrue(!expectedBalance.isZero());

      // get the balance from the erc20 class instance
      const balance = await quoteToken.balanceOf(accounts[0].address);

      assert.isTrue(expectedBalance.eq(balance));
    });

    it('Gets zero balance of address when balance is zero', async () => {
      const { quoteToken, quoteTokenContract, quoteTokenDecimals, toBigNumber } = coreObjects;

      // get the balance from the contract directly
      const rawBalance = await quoteTokenContract.balanceOf(accounts[3].address);

      // convert it to decimal format
      const expectedBalance = toBigNumber(rawBalance, quoteTokenDecimals);

      assert.isTrue(expectedBalance.isZero());

      // get the balance from the erc20 class instance
      const balance = await quoteToken.balanceOf(accounts[3].address);

      assert.isTrue(expectedBalance.eq(balance));
    });
  });

  describe('approve', () => {
    it('Should increment balance for QuoteToken Allowance', async () => {
      const { quoteToken, quoteTokenContract, quoteTokenDecimals, sdk, toBigNumber } = coreObjects;

      const approvalAmount = 50000;
      const ownerAddress = accounts[0].address;
      const spenderAddress = accounts[1].address;

      await sdk.changeSigner(accounts[0]);

      // get the initial allowance from the contract directly
      const rawStartingAllowance = await quoteTokenContract.allowance(ownerAddress, spenderAddress);

      // convert it to decimal format
      const startingAllowance = toBigNumber(rawStartingAllowance, quoteTokenDecimals);

      // it should be zero
      assert.isTrue(startingAllowance.eq(0));

      // approve the amount via the ERC20 class instance
      await quoteToken.approve(spenderAddress, approvalAmount);

      // get the new allowance from the contract directly
      const rawEndingAllowance = await quoteTokenContract.allowance(ownerAddress, spenderAddress);

      // convert it to decimal format
      const endingAllowance = toBigNumber(rawEndingAllowance, quoteTokenDecimals);

      // it should be updated
      assert.isTrue(endingAllowance.eq(approvalAmount));
    });
  });

  describe('totalSupply', () => {
    it('Gets correct total supply', async () => {
      const { quoteToken, quoteTokenContract, quoteTokenDecimals, toBigNumber } = coreObjects;

      // get the total supply directly from the contract
      const rawTotalSupply = await quoteTokenContract.totalSupply();

      // convert it to decimal format
      const expectedTotalSupply = await toBigNumber(rawTotalSupply, quoteTokenDecimals);

      // get the total supply from the ERC20 class instance
      const totalSupply = await quoteToken.totalSupply();

      assert.isTrue(totalSupply.eq(expectedTotalSupply));
    });
  });
});
