import StakingPoolsContract from '../abi/StakingPools.json';
import Base from '../Base.mjs';

export default class StakingPools extends Base {
  constructor(sdk, address) {
    super(sdk);
    this._address = address;
    this._contract = sdk.contract({
      abi: StakingPoolsContract.abi,
      address,
    });
  }

  static contract(sdk, address, readonly = false) {
    return sdk.contract({
      abi: StakingPoolsContract.abi,
      address,
      readonly,
    });
  }

  get address() {
    return this._address;
  }

  get contract() {
    return this._contract;
  }

  get readonlyContract() {
    return this.constructor.contract(this.sdk, this.address, true);
  }

  async claim(poolId, overrides = {}) {
    return this._handleTransaction(
      await this.contract.claim(
        this.toNumber(poolId),
        this.sanitizeOverrides(overrides),
      ),
    );
  }

  async deposit(poolId, depositAmount, overrides = {}) {
    return this._handleTransaction(
      await this.contract.deposit(
        this.toNumber(poolId),
        this.toEthersBigNumber(depositAmount, 18),
        this.sanitizeOverrides(overrides),
      ),
    );
  }

  async exit(poolId, overrides = {}) {
    return this._handleTransaction(
      await this.contract.exit(
        this.toNumber(poolId),
        this.sanitizeOverrides(overrides),
      ),
    );
  }

  async getAPY(poolId, overrides = {}) {

  }

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

  async getPoolRewardRate(poolId, overrides = {}) {
    const rate = await this.contract.getPoolRewardRate(
      this.toNumber(poolId),
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(rate);
  }

  async getPoolRewardWeight(poolId, overrides = {}) {
    const rate = await this.contract.getPoolRewardWeight(
      this.toNumber(poolId),
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(rate);
  }

  async getPoolToken(poolId, overrides = {}) {
    const tokenAddress = await this.contract.getPoolToken(
      this.toNumber(poolId),
      this.sanitizeOverrides(overrides, true),
    );

    return tokenAddress.toLowerCase();
  }

  async getPoolTotalDeposited(poolId, overrides = {}) {
    const amount = await this.contract.getPoolTotalDeposited(
      this.toNumber(poolId),
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(amount, 18);
  }

  async getStakeTotalDeposited(account, poolId, overrides = {}) {
    const amount = await this.contract.getStakeTotalDeposited(
      account,
      this.toNumber(poolId),
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(amount, 18);
  }

  async getStakeTotalUnclaimed(account, poolId, overrides = {}) {
    const amount = await this.contract.getStakeTotalUnclaimed(
      account,
      this.toNumber(poolId),
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(amount, 18);
  }

  async getTVL(poolId, valuePerToken, overrides = {}) {
    const totalDeposited = await this.getPoolTotalDeposited(poolId, overrides);
    return totalDeposited.multipliedBy(valuePerToken);
  }

  async rewardRate(overrides = {}) {
    const rate = await this.contract.rewardRate(
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(rate);
  }

  async poolCount(overrides = {}) {
    const count = await this.contract.poolCount(
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(count);
  }

  async totalRewardRate(overrides = {}) {
    const rate = await this.contract.totalRewardRate(
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(rate);
  }

  async withdraw(poolId, withdrawAmount, overrides = {}) {
    return this._handleTransaction(
      await this.contract.withdraw(
        this.toNumber(poolId),
        this.toEthersBigNumber(withdrawAmount, 18),
        this.sanitizeOverrides(overrides),
      ),
    );
  }

  async _handleTransaction(tx) {
    this.sdk.notify(tx);
    const receipt = await tx.wait(1);
    return receipt;
  }
}
