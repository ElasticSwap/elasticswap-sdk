/* eslint class-methods-use-this: 0 */

import { ethers } from 'ethers';
import Base from '../Base.mjs';
import SLP from '../tokens/SLP.mjs';

const ticLogo = './images/stake/tic.svg';
const slpLogo = './images/stake/tic-usdc-sushi.svg';

const TIC_USDC_SLP_ADDRESS = '0x4cf9dc05c715812fead782dc98de0168029e05c8';

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

  get account() {
    return this._account;
  }

  get active() {
    return this.rewardRate.isGreaterThan(0);
  }

  get apr() {
    return this._apr;
  }

  get awaitInitialized() {
    return this._promise;
  }

  get image() {
    return this.name.match(/SLP/) ? slpLogo : ticLogo;
  }

  get id() {
    return this._poolId;
  }

  get name() {
    if (this.token.address === this.sdk.contractAddress('TicToken')) {
      return 'TIC';
    }

    if (this.token.address === this.sdk.contractAddress('TimeTokenPreseed')) {
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

  get rewardRate() {
    return this._rewardRate;
  }

  get staked() {
    return this._staked;
  }

  get token() {
    return this._token;
  }

  get tokenAllowance() {
    return this._tokenAllowance;
  }

  get tokenBalance() {
    return this._tokenBalance;
  }

  get tvl() {
    return this._tvl;
  }

  get unclaimed() {
    return this._unclaimed;
  }

  get valuePerToken() {
    return this._valuePerToken;
  }

  get visible() {
    return this._visible;
  }

  async load() {
    console.log('loading staking pool', this.id);
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

    const [poolRewardRate, poolTokenAddress, apr, slpPrice, staked, unclaimed, slpTotalSupply, slpTicSupply] = await Promise.all([
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
      this._valuePerToken = slpPrice.multipliedBy(slpTotalSupply).dividedBy(slpTicSupply).dividedBy(2);
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
    console.log('visibility check on pool', this.id, this.staked.toFixed(), this.tokenBalance.toFixed(), this.tokenBalance.plus(this.staked).toFixed())
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
