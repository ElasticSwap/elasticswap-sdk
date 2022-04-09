import Base from '../Base.mjs';

// 365.25 * 24 * 60 * 60
const SECONDS_PER_YEAR = 31557600;

/**
 * Provides a wrapping class for the StakingPools contract.
 *
 * @export
 * @class StakingPools
 * @extends {Base}
 */
export default class StakingPools extends Base {
  /**
   * Creates an instance of StakingPools.
   *
   * @param {SDK} sdk - An instance of {@link SDK}
   * @param {string} address - An EVM compatible address of the contract.
   * @see {@link SDK#stakingPools}
   * @memberof StakingPools
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
   * @memberof StakingPools
   */
  static contract(sdk, address, readonly = false) {
    const abi = sdk.contractAbi('StakingPools');
    return sdk.contract({ abi, address, readonly });
  }

  /**
   * Returns the abi for the underlying contract
   *
   * @readonly
   * @memberof StakingPools
   */
  get abi() {
    return this.sdk.contractAbi('StakingPools');
  }

  /**
   * @readonly
   * @returns {string} address - The EVM address of the StakingPools contract this instance calls
   * @memberof StakingPools
   */
  get address() {
    return this._address;
  }

  /**
   * @readonly
   * @see {@link SDK#contract}
   * @see {@link https://docs.ethers.io/v5/api/contract/contract/}
   * @returns {ethers.Contract} contract - An ethers.js Contract instance
   * @memberof StakingPools
   */
  get contract() {
    return this.constructor.contract(this.sdk, this.address);
  }

  /**
   * @readonly
   * @see {@link SDK#contract}
   * @see {@link https://docs.ethers.io/v5/api/contract/contract/}
   * @returns {ethers.Contract} contract - A readonly ethers.js Contract instance
   * @memberof StakingPools
   */
  get readonlyContract() {
    return this.constructor.contract(this.sdk, this.address, true);
  }

  /**
   * Claims outstanding rewards from the specified pool.
   *
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<ethers.TransactionResponse>}
   * @see {@link https://docs.ethers.io/v5/api/providers/types/#providers-TransactionResponse}
   * @memberof StakingPools
   */
  async claim(poolId, overrides = {}) {
    return this._handleTransaction(
      await this.contract.claim(this.toNumber(poolId), this.sanitizeOverrides(overrides)),
    );
  }

  /**
   * Deposits tokens into the specified pool.
   *
   * @param {number} poolId - The id of the pool
   * @param {BigNumber} depositAmount - The amount to deposit
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<ethers.TransactionResponse>}
   * @see {@link https://docs.ethers.io/v5/api/providers/types/#providers-TransactionResponse}
   * @memberof StakingPools
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
   * Claims all rewards and withdraws all staked tokens from the pool.
   *
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<ethers.TransactionResponse>}
   * @see {@link https://docs.ethers.io/v5/api/providers/types/#providers-TransactionResponse}
   * @memberof StakingPools
   */
  async exit(poolId, overrides = {}) {
    return this._handleTransaction(
      await this.contract.exit(this.toNumber(poolId), this.sanitizeOverrides(overrides)),
    );
  }

  /**
   * Calculates and returns the current APY of the pool.
   *
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<BigNumber>}
   * @memberof StakingPools
   */
  async getAPY(poolId, overrides = {}) {
    const [apr, poolToken] = await Promise.all([
      this.getAPR(poolId, overrides),
      this.getPoolToken(poolId, overrides),
    ]);

    // if APR is zero, so is APY
    if (apr.isZero()) {
      return apr;
    }

    // Since gas is cheap on AVAX, we assume users will compound their rewards daily. If this is not
    // TIC token single staking pool, the APY is the APR.
    // Credit: https://www.aprtoapy.com/
    if (poolToken === this.sdk.contractAddress('TicToken')) {
      return apr.dividedBy(365).plus(1).exponentiatedBy(365).minus(1);
    }

    return apr;
  }

  /**
   * Calculates and returns the current APR of the pool.
   *
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<BigNumber>}
   * @memberof StakingPools
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
    if (poolToken === this.sdk.contractAddress('TicToken')) {
      return poolRate.multipliedBy(SECONDS_PER_YEAR).dividedBy(totalDeposited);
    }

    // time token Pre-seed
    // assumptions:
    //   ETH = $4,358.59 (Dec 7th, 2021)
    //   TIC = $10 (launch price)
    //   For better accuracy, the current price of TIC should be used (div 10, mul current price)
    if (poolToken === this.sdk.contractAddress('TimeTokenPreSeed')) {
      return poolRate
        .multipliedBy(SECONDS_PER_YEAR)
        .dividedBy(totalDeposited)
        .multipliedBy('435.859');
    }

    // time token DAO
    if (poolToken === this.sdk.contractAddress('TimeTokenDAO')) {
      return this.toBigNumber(1); // 100% because the DAO doesn't really have an APR / APY
    }

    // time token Team
    if (poolToken === this.sdk.contractAddress('TimeTokenTeam')) {
      return this.toBigNumber(1); // 100% because the Team doesn't really have an APR / APY
    }

    // token = tic pair, 1 to 2
    // Every other rewarded pool is assumed to be half TIC and half something else of equal value
    // Ergo each token deposited represents 2x TIC
    // Any non-TIC pool token should be adjusted (div 2*TIC price, mul actual price)

    // 0xean's comments - totalDeposited is the LP token which is not being rewarded,
    // so we need to turn this into TIC deposited in order to get an accurate APR.
    const lpToken = this.sdk.contract({ address: poolToken });
    const ticToken = this.sdk.contract({
      address: this.sdk.contractAddress('TicToken'),
    });

    const [lpTokenTotalSupplyBN, lpTokenInStakingBN, lpTicBalanceBN] = await Promise.all([
      lpToken.totalSupply(),
      lpToken.balanceOf(this._address),
      ticToken.balanceOf(poolToken),
    ]);

    const lpTokenTotalSupply = this.toBigNumber(lpTokenTotalSupplyBN, 18);
    const lpTokenInStaking = this.toBigNumber(lpTokenInStakingBN, 18);
    const lpTicBalance = this.toBigNumber(lpTicBalanceBN, 18);

    const percentOfLPStaked = lpTokenInStaking.div(lpTokenTotalSupply);
    const ticStaked = lpTicBalance.multipliedBy(percentOfLPStaked);
    const valueStaked = ticStaked.multipliedBy(2); // 1/2 tic and 1/2 USDC

    return poolRate.multipliedBy(SECONDS_PER_YEAR).dividedBy(valueStaked);
  }

  /**
   * Gets the amount of tokens per second being distributed to all stakers in the pool.
   *
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<BigNumber>}
   * @memberof StakingPools
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
   * @memberof StakingPools
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
   * @memberof StakingPools
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
   * @memberof StakingPools
   */
  async getPoolTotalDeposited(poolId, overrides = {}) {
    const amount = await this.contract.getPoolTotalDeposited(
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
   * @memberof StakingPools
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
   * Gets the number of reward tokens that a specific account can claim.
   *
   * @param {string} account - An EVM address of the account to get the reward token balance for
   * @param {number} poolId - The id of the pool
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<BigNumber>}
   * @memberof StakingPools
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
   * @memberof StakingPools
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
   * @memberof StakingPools
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
   * @memberof StakingPools
   */
  async poolCount(overrides = {}) {
    const count = await this.contract.poolCount(this.sanitizeOverrides(overrides, true));

    return this.toNumber(count);
  }

  /**
   * Gets the total reward weight of all the pools.
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<number>}
   * @memberof StakingPools
   */
  async totalRewardWeight(overrides = {}) {
    const rate = await this.contract.totalRewardWeight(this.sanitizeOverrides(overrides, true));

    return this.toBigNumber(rate);
  }

  /**
   * Withdraws a specific number of tokens and all rewards from the pool.
   *
   * @param {number} poolId - The id of the pool
   * @param {BigNumber} withdrawAmount - The amount to withdraw
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<ethers.TransactionResponse>}
   * @see {@link https://docs.ethers.io/v5/api/providers/types/#providers-TransactionResponse}
   * @memberof StakingPools
   */
  async withdraw(poolId, withdrawAmount, overrides = {}) {
    return this._handleTransaction(
      await this.contract.withdraw(
        this.toNumber(poolId),
        this.toEthersBigNumber(withdrawAmount, 18),
        this.sanitizeOverrides(overrides),
      ),
    );
  }

  // Takes the transaction hash and triggers a notification, waits to the transaction to be mined
  // and the returns the TransactionReceipt.
  async _handleTransaction(tx) {
    this.sdk.notify(tx);
    const receipt = await tx.wait(1);
    return receipt;
  }
}
