/* eslint class-methods-use-this: 0 */

import { ethers } from 'ethers';
import Base from '../Base.mjs';
import SLP from '../tokens/SLP.mjs';

const ticLogo = './images/stake/tic.svg';
const slpLogo = './images/stake/tic-usdc-sushi.svg';

const TIC_USDC_SLP_ADDRESS = '0x4cf9dc05c715812fead782dc98de0168029e05c8';

/**
 * Provides interface for compiled staking pool data.
 *
 * @export
 * @class StakingPool
 * @extends {Base}
 */
export default class StakingPool extends Base {
  constructor(sdk, poolId) {
    super(sdk);

    this._lastUpdate = Date.now();
    this._poolId = poolId;
    this._promise = this.load();

    this.sdk.subscribe(() => {
      if (this.sdk.account && this.sdk.account !== this.account) {
        this.load();
        return;
      }

      // 30 second refresh time
      if (this._lastUpdate + 30000 < Date.now() && this.visible) {
        this.load();
      }
    });
  }

  /**
   * The most recent account noticed by the pool
   *
   * @readonly
   * @memberof StakingPool
   */
  get account() {
    return this._account;
  }

  /**
   * A boolean indicating if the pool is currently active (providing rewards)
   *
   * @readonly
   * @memberof StakingPool
   */
  get active() {
    return this.rewardRate.isGreaterThan(0);
  }

  /**
   * The apr of the pool
   *
   * @readonly
   * @memberof StakingPool
   */
  get apr() {
    return this._apr;
  }

  /**
   * A promise which is resolved after the first data load
   *
   * @readonly
   * @memberof StakingPool
   */
  get awaitInitialized() {
    return this._promise;
  }

  /**
   * The url of an image to use with the pool
   *
   * @readonly
   * @memberof StakingPool
   */
  get image() {
    return this.name.match(/SLP/) ? slpLogo : ticLogo;
  }

  /**
   * The id of the pool
   *
   * @readonly
   * @memberof StakingPool
   */
  get id() {
    return this._poolId;
  }

  /**
   * The name of the pool
   *
   * @readonly
   * @memberof StakingPool
   */
  get name() {
    if (this.token.address === this.sdk.contractAddress('TicToken')) {
      return 'TIC';
    }

    if (this.token.address === this.sdk.contractAddress('TimeTokenPreSeed')) {
      return 'Pre-seed';
    }

    if (this.token.address === this.sdk.contractAddress('TimeTokenTeam')) {
      return 'Team';
    }

    if (this.token.address === this.sdk.contractAddress('TimeTokenDAO')) {
      return 'DAO';
    }

    return 'TIC/USDC.e SLP';
  }

  /**
   * The reward rate of the pool
   *
   * @readonly
   * @memberof StakingPool
   */
  get rewardRate() {
    return this._rewardRate;
  }

  /**
   * The staked balance of account
   *
   * @readonly
   * @memberof StakingPool
   */
  get staked() {
    return this._staked;
  }

  /**
   * The ERC20 instance of the token which can be deposited
   *
   * @readonly
   * @memberof StakingPool
   */
  get token() {
    return this._token;
  }

  /**
   * The amount of token the staking pool is allowed to pull from account
   *
   * @readonly
   * @memberof StakingPool
   */
  get tokenAllowance() {
    return this._tokenAllowance;
  }

  /**
   * The current token balance of account
   *
   * @readonly
   * @memberof StakingPool
   */
  get tokenBalance() {
    return this._tokenBalance;
  }

  /**
   * The total value locked in the pool
   *
   * @readonly
   * @memberof StakingPool
   */
  get tvl() {
    return this._tvl;
  }

  /**
   * The amount of unclaimed rewards for account
   *
   * @readonly
   * @memberof StakingPool
   */
  get unclaimed() {
    return this._unclaimed;
  }

  /**
   * The value of each token deposited in the pool
   *
   * @readonly
   * @memberof StakingPool
   */
  get valuePerToken() {
    return this._valuePerToken;
  }

  /**
   * Boolean indicating if account can see the pool
   *
   * @readonly
   * @memberof StakingPool
   */
  get visible() {
    return this._visible;
  }

  /**
   * Loads all of the pool data
   *
   * @return {bool}
   * @memberof StakingPool
   */
  async load() {
    this._lastUpdate = Date.now();

    // Only valid on Avalanche. We'll never be deploying this contract elsewhere
    if (this.sdk.networkHex !== '0xa86a') {
      this._account = ethers.constants.AddressZero;
      this._apr = this.toBigNumber(0);
      this._rewardRate = this.toBigNumber(0);
      this._staked = this.toBigNumber(0);
      this._token = undefined;
      this._tokenAllowance = this.toBigNumber(0);
      this._tokenBalance = this.toBigNumber(0);
      this._tvl = this.toBigNumber(0);
      this._unclaimed = this.toBigNumber(0);
      this._valuePerToken = this.toBigNumber(0);
      this._visible = false;

      return true;
    }

    const slp = new SLP(this.sdk, TIC_USDC_SLP_ADDRESS);
    const ticAddress = this.sdk.contractAddress('TicToken');
    const ticToken = this.sdk.erc20(ticAddress);

    this._account = this.sdk.account || ethers.constants.AddressZero;

    const [
      poolRewardRate,
      poolTokenAddress,
      apr,
      slpPrice,
      staked,
      unclaimed,
      slpTotalSupply,
      slpTicSupply,
    ] = await Promise.all([
      this.sdk.stakingPools.getPoolRewardRate(this.id),
      this.sdk.stakingPools.getPoolToken(this.id),
      this.sdk.stakingPools.getAPR(this.id),
      slp.priceOfSLPInToken1(this.id),
      this.sdk.stakingPools.getStakeTotalDeposited(this.account, this.id),
      this.sdk.stakingPools.getStakeTotalUnclaimed(this.account, this.id),
      slp.totalSupply(),
      ticToken.balanceOf(slp.address),
    ]);

    this._apr = apr;
    this._rewardRate = poolRewardRate;
    this._staked = staked;
    this._token = this.sdk.erc20(poolTokenAddress);
    this._unclaimed = unclaimed;
    this._valuePerToken = this.toBigNumber(0);

    // if this is the TIC / USDC.e SLP we can know it's value
    if (this.token.address === slp.address) {
      this._valuePerToken = slpPrice;
    }

    // if this is the TIC token, we can use the spot value of the SLP pool
    if (this.token.address === ticAddress) {
      this._valuePerToken = slpPrice
        .multipliedBy(slpTotalSupply)
        .dividedBy(slpTicSupply)
        .dividedBy(2);
    }

    const [tokenBalance, tokenAllowance, tvl] = await Promise.all([
      this.token.balanceOf(this.account, { multicall: true }),
      this.token.allowance(this.account, this.sdk.stakingPools.address, { multicall: true }),
      this.sdk.stakingPools.getTVL(this.id, this.valuePerToken),
    ]);

    this._tokenAllowance = tokenAllowance;
    this._tokenBalance = tokenBalance;
    this._tvl = tvl;

    // visibility check
    this._visible = !this.tokenBalance.plus(this.staked).isZero();

    if (this.token.address === slp.address || this.token.address === ticToken.address) {
      this._visible = true;
    }

    console.log('staking pool', this.id, 'load took', Date.now() - this._lastUpdate, 'ms');

    this.touch();
    this.sdk.touch();
    return true;
  }
}
