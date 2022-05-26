/* eslint class-methods-use-this: 0 */

import Base from '../Base.mjs';
import MerklePool from './MerklePool.mjs';

// 365.25 * 24 * 60 * 60
const SECONDS_PER_YEAR = 31557600;

/**
 * Provides a wrapping class for the MerklePools contract.
 *
 * @export
 * @class MerklePools
 * @extends {Base}
 */
export default class MerklePools extends Base {
  /**
   * Creates an instance of MerklePools.
   *
   * @param {SDK} sdk - An instance of {@link SDK}
   * @param {string} address - An EVM compatible address of the contract.
   * @see {@link SDK#stakingPools}
   * @memberof MerklePools
   */
  constructor(sdk, address) {
    super(sdk);
    this._address = address;
  }

  /**
   * Provides an ethers contract object via the sdk.
   *
   * @param {SDK} sdk - An instance of the SDK class
   * @param {string} address - An EVM compatible contract address
   * @param {boolean} [readonly=false] - Readonly contracts use the provider even if a signer exists
   * @returns {ether.Contract}
   * @see {@link SDK#contract}
   * @memberof MerklePools
   */
  static contract(sdk, address, readonly = false) {
    const abi = sdk.contractAbi('MerklePools') || sdk.contractAbi('MerklePoolsForeign');
    return sdk.contract({ abi, address, readonly });
  }

  /**
   * Returns the abi for the underlying contract
   *
   * @readonly
   * @memberof MerklePools
   */
  get abi() {
    return this.sdk.contractAbi('MerklePools') || this.sdk.contractAbi('MerklePoolsForeign');
  }

  /**
   * @readonly
   * @returns {string} address - The EVM address of the MerklePools contract this instance calls
   * @memberof MerklePools
   */
  get address() {
    return this._address;
  }

  /**
   * @readonly
   * @see {@link SDK#contract}
   * @see {@link https://docs.ethers.io/v5/api/contract/contract/}
   * @returns {ethers.Contract} contract - An ethers.js Contract instance
   * @memberof MerklePools
   */
  get contract() {
    return this.constructor.contract(this.sdk, this.address);
  }

  /**
   * @readonly
   * @see {@link SDK#contract}
   * @see {@link https://docs.ethers.io/v5/api/contract/contract/}
   * @returns {ethers.Contract} contract - A readonly ethers.js Contract instance
   * @memberof MerklePools
   */
  get readonlyContract() {
    return this.constructor.contract(this.sdk, this.address, true);
  }

  /**
   * Claims outstanding rewards from the specified pool. Temporarily Disabled.
   *
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<ethers.TransactionResponse>}
   * @see {@link https://docs.ethers.io/v5/api/providers/types/#providers-TransactionResponse}
   * @memberof MerklePools
   */
  async claim(poolId) {
    // , overrides = {}
    throw new Error(`MerklePools: claim is not yet enabled for pool ${poolId}.`);
    /*
    return this._handleTransaction(
      await this.contract.claim(this.toNumber(poolId), this.sanitizeOverrides(overrides)),
    );
    */
  }

  /**
   * Deposits tokens into the specified pool.
   *
   * @param {number} poolId - The id of the pool
   * @param {BigNumber} depositAmount - The amount to deposit
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<ethers.TransactionResponse>}
   * @see {@link https://docs.ethers.io/v5/api/providers/types/#providers-TransactionResponse}
   * @memberof MerklePools
   */
  async deposit(poolId, depositAmount, overrides = {}) {
    return this._handleTransaction(
      await this.contract.deposit(
        this.toNumber(poolId),
        this.toEthersBigNumber(depositAmount, 18),
        this.sanitizeOverrides(overrides),
      ),
    );
  }

  /**
   * Withdraws all staked tokens from the pool, forfeiting any unrealized rewards.
   *
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<ethers.TransactionResponse>}
   * @see {@link https://docs.ethers.io/v5/api/providers/types/#providers-TransactionResponse}
   * @memberof MerklePools
   */
  async exit(poolId, overrides = {}) {
    return this._handleTransaction(
      await this.contract.exit(this.toNumber(poolId), this.sanitizeOverrides(overrides)),
    );
  }

  /**
   * Calculates and returns the current APR of the pool.
   *
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<BigNumber>}
   * @memberof MerklePools
   */
  async getAPR(poolId, overrides = {}) {
    const [poolRate, totalDeposited, poolToken] = await Promise.all([
      this.getPoolRewardRate(poolId, overrides),
      this.getPoolTotalDeposited(poolId, overrides),
      this.getPoolToken(poolId, overrides),
    ]);

    if (poolRate.isZero()) {
      return this.toBigNumber(0);
    }

    // strategies for getting apr
    // token = tic, 1 to 1
    // doubled because of paired fees
    if (poolToken === this.sdk.contractAddress('TicToken')) {
      return poolRate.multipliedBy(SECONDS_PER_YEAR).dividedBy(totalDeposited).multipliedBy(2);
    }

    // time token Team
    // 16% because the Team doesn't really have an APR / APY
    if (poolToken === this.sdk.contractAddress('TimeTokenTeam')) {
      return this.toBigNumber('0.16');
    }

    // time token Pre-seed
    // 16% because the Team doesn't really have an APR / APY
    if (poolToken === this.sdk.contractAddress('TimeTokenPreSeed')) {
      return this.toBigNumber('0.1');
    }

    // token = tic pair, 1 to 2
    // Every other rewarded pool is assumed to be half TIC and half something else of equal value
    // Ergo each token deposited represents 2x TIC
    // Any non-TIC pool token should be adjusted (div 2*TIC price, mul actual price)

    // 0xean's comments - totalDeposited is the LP token which is not being rewarded,
    // so we need to turn this into TIC deposited in order to get an accurate APR.

    const lpToken = this.sdk.erc20(poolToken);
    const ticToken = this.sdk.erc20(this.sdk.contractAddress('TicToken'));
    const usdcToken = this.sdk.erc20(this.sdk.contractAddress('USDC'));
    const ticUSDCExchange = await this.sdk.exchangeFactory.exchange(
      usdcToken.address,
      ticToken.address,
    );

    // TODO: Switch this to use the ELP pool
    const [lpTokenTotalSupply, lpTokenInStaking, lpTicBalance, lpUSDCBalance] = await Promise.all([
      lpToken.totalSupply(),
      lpToken.balanceOf(this._address),
      ticToken.balanceOf(poolToken),
      usdcToken.balanceOf(poolToken),
    ]);

    if (lpTicBalance.isZero() && lpToken.address === this.sdk.contractAddress('FOXy/FOX')) {
      // the LP is FOXy/FOX
      // APR is calculated by looking at the TIC / USDC exchange, getting the price of TIC in
      // USDC and using that to derive the price of the LP pair
      // FOX = $0.20
      const ticPrice = ticUSDCExchange.quoteTokenBalance.dividedBy(
        ticUSDCExchange.baseTokenBalance,
      );

      const exchange = await this.sdk.exchangeFactory.exchangeByAddress(poolToken);
      const percentOfLPStaked = lpTokenInStaking.div(lpTokenTotalSupply);
      const ticStaked = exchange.quoteTokenBalance
        .multipliedBy(0.2)
        .multipliedBy(percentOfLPStaked)
        .dividedBy(ticPrice);
      console.log('FOXyFOX TIC Staked', ticStaked.toFixed());
      const valueStaked = ticStaked.multipliedBy(2); // 1/2 tic and 1/2 USDC

      // doubled because of paired fees
      return poolRate.multipliedBy(SECONDS_PER_YEAR).dividedBy(valueStaked).multipliedBy(2);
    }

    if (lpTicBalance.isZero()) {
      // the LP does not have any TIC
      // APR is calculated by looking at the TIC / USDC exchange, getting the price of TIC in
      // USDC and using that to derive the price of the LP pair
      const ticPrice = ticUSDCExchange.quoteTokenBalance.dividedBy(
        ticUSDCExchange.baseTokenBalance,
      );

      const percentOfLPStaked = lpTokenInStaking.div(lpTokenTotalSupply);
      const ticStaked = lpUSDCBalance.multipliedBy(percentOfLPStaked).dividedBy(ticPrice);
      const valueStaked = ticStaked.multipliedBy(2); // 1/2 tic and 1/2 USDC

      // doubled because of paired fees
      return poolRate.multipliedBy(SECONDS_PER_YEAR).dividedBy(valueStaked).multipliedBy(2);
    }

    const percentOfLPStaked = lpTokenInStaking.div(lpTokenTotalSupply);
    const ticStaked = lpTicBalance.multipliedBy(percentOfLPStaked);
    const valueStaked = ticStaked.multipliedBy(2); // 1/2 tic and 1/2 USDC

    // doubled because of paired fees
    return poolRate.multipliedBy(SECONDS_PER_YEAR).dividedBy(valueStaked).multipliedBy(2);
  }

  /**
   * Gets the amount of tokens per second being distributed to all stakers in the pool.
   *
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<BigNumber>}
   * @memberof MerklePools
   */
  async getPoolRewardRate(poolId, overrides = {}) {
    const rate = await this.contract.getPoolRewardRate(
      this.toNumber(poolId),
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(rate, 18);
  }

  /**
   * Gets the reward weight of a pool.
   *
   * pool reward weight / total reward rate = percentage of reward emissions allocated to the pool
   *
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<BigNumber>}
   * @memberof MerklePools
   */
  async getPoolRewardWeight(poolId, overrides = {}) {
    const rate = await this.contract.getPoolRewardWeight(
      this.toNumber(poolId),
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(rate);
  }

  /**
   * Gets the EVM contract address of the token that can be staked in the pool.
   *
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {Promise<string>} - The EVM address of the token in lower case.
   * @memberof MerklePools
   */
  async getPoolToken(poolId, overrides = {}) {
    const tokenAddress = await this.contract.getPoolToken(
      this.toNumber(poolId),
      this.sanitizeOverrides(overrides, true),
    );

    return tokenAddress.toLowerCase();
  }

  /**
   * Gets the total amount of all deposits in the pool.
   *
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<BigNumber>}
   * @memberof MerklePools
   */
  async getPoolTotalDeposited(poolId, overrides = {}) {
    const amount = await this.contract.getPoolTotalDeposited(
      this.toNumber(poolId),
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(amount, 18);
  }

  /**
   * Gets the total amount of all unclaimed reward tokens in the pool. Includes tokens that are
   * unrealized and tokens that are realized but unclaimed in LP form.
   *
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<BigNumber>}
   * @memberof MerklePools
   */
  async getPoolTotalUnclaimed(poolId, overrides = {}) {
    const amount = await this.contract.getPoolTotalUnclaimed(
      this.toNumber(poolId),
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(amount, 18);
  }

  /**
   * Gets the total amount of all unclaimed reward tokens in the pool that are unrealized.
   *
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<BigNumber>}
   * @memberof MerklePools
   */
  async getPoolTotalUnclaimedNotInLP(poolId, overrides = {}) {
    const amount = await this.contract.getPoolTotalUnclaimed(
      this.toNumber(poolId),
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(amount, 18);
  }

  /**
   * Gets the total amount of tokens deposited by a specific address into the pool.
   *
   * @param {string} account - An EVM address of the account to get the deposited token balance for
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<BigNumber>}
   * @memberof MerklePools
   */
  async getStakeTotalDeposited(account, poolId, overrides = {}) {
    const amount = await this.contract.getStakeTotalDeposited(
      account,
      this.toNumber(poolId),
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(amount, 18);
  }

  /**
   * Gets the number of unrealized and realized reward tokens to which a specific account is
   * entitled. NOTE: For claimable tokens, the merkle tree should be consulted.
   *
   * @param {string} account - An EVM address of the account to get the reward token balance for
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<BigNumber>}
   * @memberof MerklePools
   */
  async getStakeTotalUnclaimed(account, poolId, overrides = {}) {
    const amount = await this.contract.getStakeTotalUnclaimed(
      account,
      this.toNumber(poolId),
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(amount, 18);
  }

  /**
   * Calculates and returns the total value of all tokens in the staking contract.
   *
   * @param {number} poolId - The id of the pool
   * @param {BigNumber} valuePerToken - The value per token
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<BigNumber>}
   * @memberof MerklePools
   */
  async getTVL(poolId, valuePerToken, overrides = {}) {
    const totalDeposited = await this.getPoolTotalDeposited(poolId, overrides);
    return totalDeposited.multipliedBy(valuePerToken);
  }

  /**
   * Returns the total number of token emissions for all staking pools every second.
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<BigNumber>}
   * @memberof MerklePools
   */
  async rewardRate(overrides = {}) {
    const rate = await this.contract.rewardRate(this.sanitizeOverrides(overrides, true));

    return this.toBigNumber(rate, 18);
  }

  /**
   * Gets the number of pools that exist.
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<number>}
   * @memberof MerklePools
   */
  async poolCount(overrides = {}) {
    const count = await this.contract.poolCount(this.sanitizeOverrides(overrides, true));

    return this.toNumber(count);
  }

  /**
   * returns an instance of the MerklePool class with all data loaded
   *
   * @param {number} poolId - The id of the pool
   * @return {Promise<MerklePool>}
   * @memberof MerklePools
   */
  async merklePool(poolId) {
    const stakingPool = new MerklePool(this.sdk, poolId);
    await stakingPool.awaitInitialized;
    return stakingPool;
  }

  /**
   * Gets the total reward weight of all the pools.
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<number>}
   * @memberof MerklePools
   */
  async totalRewardWeight(overrides = {}) {
    const rate = await this.contract.totalRewardWeight(this.sanitizeOverrides(overrides, true));

    return this.toBigNumber(rate);
  }

  // Takes the transaction hash and triggers a notification, waits to the transaction to be mined
  // and the returns the TransactionReceipt.
  async _handleTransaction(tx) {
    this.sdk.notify(tx);
    const receipt = await tx.wait(2);
    return receipt;
  }
}
