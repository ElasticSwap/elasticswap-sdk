import StakingPoolsContract from '../abi/StakingPools.json';
import Base from '../Base.mjs';

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
    this._contract = sdk.contract({
      abi: StakingPoolsContract.abi,
      address,
    });
  }

  /**
   * Provides an ethers contract object via the sdk.
   *
   * @param {SDK} sdk - An instance of the SDK class
   * @param {string} address - An EVM compatible wallet address
   * @param {boolean} [readonly=false] - Readonly contracts use the provider even if a signer exists
   * @returns {ether.Contract}
   * @see {@link SDK#contract}
   * @memberof StakingPools
   */
  static contract(sdk, address, readonly = false) {
    return sdk.contract({
      abi: StakingPoolsContract.abi,
      address,
      readonly,
    });
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
    return this._contract;
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
      await this.contract.claim(
        this.toNumber(poolId),
        this.sanitizeOverrides(overrides),
      ),
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
      await this.contract.exit(
        this.toNumber(poolId),
        this.sanitizeOverrides(overrides),
      ),
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
    // TODO: make this compound daily
    return this.getAPR(poolId, overrides);
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

    // strategies for getting apr
    // token = tic, 1 to 1
    // token = tic pair, 1 to 2
    // token = other, price to price (TODO)

    return poolRate.multipliedBy(31557600).dividedBy();
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
    const rate = await this.contract.rewardRate(
      this.sanitizeOverrides(overrides, true),
    );

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
    const count = await this.contract.poolCount(
      this.sanitizeOverrides(overrides, true),
    );

    return this.toNumber(count);
  }

  /**
   * Gets the total reward weight of all the pools.
   *
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @returns {Promise<number>}
   * @memberof StakingPools
   */
  async totalRewardRate(overrides = {}) {
    const rate = await this.contract.totalRewardRate(
      this.sanitizeOverrides(overrides, true),
    );

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
