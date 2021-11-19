/* eslint import/extensions: 0 */
import chai from 'chai';
import fetch from 'node-fetch';
import hardhat from 'hardhat';
import elasticSwap from '../../dist/index.js';

const { toBigNumber } = elasticSwap.utils;
const { ethers, deployments } = hardhat;
const { assert } = chai;

describe('ERC20', () => {
  let sdk;

  before(async () => {
    const env = {
      networkId: 99999,
      exchangeFactoryAddress: '0x8C2251e028043e38f58Ac64c00E1F940D305Aa62',
    };
    const accounts = await ethers.getSigners();
    sdk = new elasticSwap.SDK({
      env,
      customFetch: fetch,
      provider: hardhat.ethers.provider,
      signer: accounts[0],
    });
  });

  describe('Constructor', () => {
    it('can be created via constructor', async () => {
      await deployments.fixture();
      const quoteToken = await deployments.get('QuoteToken');
      const erc20 = new elasticSwap.ERC20(sdk, quoteToken.address);
      assert.equal(quoteToken.address, erc20.address);
      assert.isNotNull(erc20.contract);
    });
  });

  describe('balanceOf', () => {
    it('Gets correct balance of address when balance is not zero', async () => {
      const accounts = await ethers.getSigners();

      await deployments.fixture();
      const quoteToken = await deployments.get('QuoteToken');

      const quoteTokenContract = sdk.contract({
        address: quoteToken.address,
        abi: quoteToken.abi,
      });
      const erc20Contract = new elasticSwap.ERC20(sdk, quoteToken.address);

      let expectedBalance = await quoteTokenContract.balanceOf(accounts[0].address);
      expectedBalance = toBigNumber(expectedBalance.toString());
      let balance = await erc20Contract.balanceOf(accounts[0].address);
      balance = toBigNumber(balance.toString());
      assert.isTrue(expectedBalance.eq(balance));
    });

    it('Gets zero balance of address when balance is zero', async () => {
      const accounts = await ethers.getSigners();

      await deployments.fixture();
      const quoteToken = await deployments.get('QuoteToken');

      const quoteTokenContract = sdk.contract({
        address: quoteToken.address,
        abi: quoteToken.abi,
      });
      const erc20Contract = new elasticSwap.ERC20(sdk, quoteToken.address);
      let expectedBalance = await quoteTokenContract.balanceOf(accounts[1].address);
      expectedBalance = toBigNumber(expectedBalance.toString());
      let balance = await erc20Contract.balanceOf(accounts[1].address);
      balance = toBigNumber(balance.toString());
      assert.isTrue(expectedBalance.eq(balance));
    });
  });

  describe('approve', () => {
    it('Should increment balance for QuoteToken Allowance', async () => {
      const accounts = await ethers.getSigners();

      await deployments.fixture();
      const quoteTokenMock = await deployments.get('QuoteToken');
      const quoteTokenContract = new ethers.Contract(
        quoteTokenMock.address,
        quoteTokenMock.abi,
        accounts[0],
      );

      const spenderAddress = accounts[1].address;
      const erc20 = new elasticSwap.ERC20(sdk, quoteTokenMock.address);

      // checking initial approvals
      const startingApproval = await quoteTokenContract
        .allowance(
          accounts[0].address,
          spenderAddress,
        );

      const approvalAmount = 50000;
      await erc20.approve(spenderAddress, approvalAmount);

      const endingApproval = await quoteTokenContract
        .allowance(
          accounts[0].address,
          spenderAddress,
        );

      assert.isTrue(startingApproval.eq(0));
      assert.isTrue(endingApproval.eq(approvalAmount));
      assert.isTrue(endingApproval.gt(startingApproval));
    });
  });
});
