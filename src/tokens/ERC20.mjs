import ERC20Contract from '@elasticswap/elasticswap/artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';
import Base from '../Base.mjs';

export default class ERC20 extends Base {
  constructor(sdk, address) {
    super(sdk);
    this._address = address;
    this._contract = sdk.contract({
      abi: ERC20Contract.abi,
      address,
    });
  }

  static contract(sdk, address, readonly = false) {
    return sdk.contract({
      abi: ERC20Contract.abi,
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

  async totalSupply() {
    return this.contract.totalSupply();
  }

  async symbol() {
    return this.contract.symbol();
  }

  async approve(spenderAddress, amount, overrides = {}) {
    this._contract = this.confirmSigner(this.contract);
    const txStatus = await this.contract.approve(
      spenderAddress,
      this.toEthersBigNumber(amount),
      this.sanitizeOverrides(overrides),
    );
    return txStatus;
  }

  async transfer(recipient, amount, overrides = {}) {
    const txStatus = await this.contract.transfer(
      recipient,
      this.toEthersBigNumber(amount),
      this.sanitizeOverrides(overrides),
    );
    return txStatus;
  }

  async balanceOf(accountAddress, overrides = {}) {
    const balance = await this.contract.balanceOf(
      accountAddress,
      this.sanitizeOverrides(overrides, true),
    );

    return this.toBigNumber(balance.toString());
  }

  async allowance(ownerAddress, spenderAddress, overrides = {}) {
    const ERC20Token = await this.readonlyContract;
    const allowance = await ERC20Token.allowance(
      ownerAddress,
      spenderAddress,
      this.sanitizeOverrides(overrides, true),
    );

    return allowance;
  }
}
