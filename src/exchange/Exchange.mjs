import ExchangeSolidity from '@elasticswap/elasticswap/artifacts/src/contracts/Exchange.sol/Exchange.json';
import ERC20 from '../tokens/ERC20.mjs';
import Base from '../Base.mjs';
import ErrorHandling from '../ErrorHandling.mjs';
import {
  calculateBaseTokenQty,
  calculateExchangeRate,
  calculateFees,
  calculateLPTokenAmount,
  calculateQuoteTokenQty,
  calculateTokenAmountsFromLPTokens,
  calculateOutputAmountLessFees,
} from '../utils/mathLib.mjs';
import { toBigNumber, toEthersBigNumber } from '../utils/utils.mjs';

export default class Exchange extends Base {
  constructor(sdk, exchangeAddress, baseTokenAddress, quoteTokenAddress) {
    super(sdk);
    this._exchangeAddress = exchangeAddress;
    this._baseTokenAddress = baseTokenAddress;
    this._quoteTokenAddress = quoteTokenAddress;
    this._baseToken = new ERC20(sdk, baseTokenAddress);
    this._quoteToken = new ERC20(sdk, quoteTokenAddress);
    this._lpToken = new ERC20(sdk, exchangeAddress);
    this._contract = sdk.contract({
      abi: ExchangeSolidity.abi,
      address: exchangeAddress,
      readonly: false,
    });
    this._errorHandling = new ErrorHandling('exchange');
  }

  static contract(sdk, address, readonly = false) {
    return sdk.contract({
      abi: ExchangeSolidity.abi,
      address,
      readonly,
    });
  }

  get contract() {
    return this._contract;
  }

  get readonlyContract() {
    return this.constructor.contract(this.sdk, this.address, true);
  }

  get ownerAddress() {
    return this._ownerAddress;
  }

  get address() {
    return this._exchangeAddress;
  }

  get baseTokenAddress() {
    return this._baseTokenAddress;
  }

  get quoteTokenAddress() {
    return this._quoteTokenAddress;
  }

  get baseToken() {
    return this._baseToken;
  }

  get quoteToken() {
    return this._quoteToken;
  }

  get lpToken() {
    return this._lpToken;
  }

  get baseTokenBalance() {
    return this.baseToken.balanceOf(this.sdk.account);
  }

  get quoteTokenBalance() {
    return this.quoteToken.balanceOf(this.sdk.account);
  }

  get lpTokenBalance() {
    return this.lpToken.balanceOf(this.sdk.account);
  }

  get baseTokenAllowance() {
    return this.baseToken.allowance(this.sdk.account, this.address);
  }

  get quoteTokenAllowance() {
    return this.quoteToken.allowance(this.sdk.account, this.address);
  }

  get lpTokenAllowance() {
    return this.lpToken.allowance(this.sdk.account, this.address);
  }

  get liquidityFee() {
    return this.contract.TOTAL_LIQUIDITY_FEE();
  }

  get errorHandling() {
    return this._errorHandling;
  }

  async calculateBaseTokenQty(quoteTokenQty, baseTokenQtyMin) {
    const baseTokenReserveQty = await this._baseToken.balanceOf(
      this._exchangeAddress,
    );
    const liquidityFeeInBasisPoints = await this.liquidityFee;
    const internalBalances = await this.contract.internalBalances();

    return calculateBaseTokenQty(
      quoteTokenQty,
      baseTokenQtyMin,
      baseTokenReserveQty,
      liquidityFeeInBasisPoints,
      internalBalances,
    );
  }

  async calculateExchangeRate(inputTokenAddress) {
    const inputTokenAddressLowerCase = inputTokenAddress.toLowerCase();
    let inputTokenReserveQty = toBigNumber(0);
    let outputTokenReserveQty = toBigNumber(0);

    const internalBalances = await this.contract.internalBalances();
    if (inputTokenAddressLowerCase === this.baseTokenAddress.toLowerCase()) {
      inputTokenReserveQty = internalBalances.baseTokenReserveQty;
      outputTokenReserveQty = internalBalances.quoteTokenReserveQty;
    } else if (inputTokenAddressLowerCase === this.quoteTokenAddress.toLowerCase()) {
      inputTokenReserveQty = internalBalances.quoteTokenReserveQty;
      outputTokenReserveQty = internalBalances.baseTokenReserveQty;
    }
    return calculateExchangeRate(inputTokenReserveQty, outputTokenReserveQty);
  }

  async calculateFees(swapAmount) {
    const liquidityFeeInBasisPoints = await this.liquidityFee;
    return calculateFees(swapAmount, liquidityFeeInBasisPoints);
  }

  async calculateLPTokenAmount(quoteTokenAmount, baseTokenAmount, slippage) {
    const quoteTokenReserveQty = await this._quoteToken.balanceOf(
      this._exchangeAddress,
    );
    const baseTokenReserveQty = await this._baseToken.balanceOf(
      this._exchangeAddress,
    );
    const internalBalances = await this.contract.internalBalances();
    const totalSupplyOfLiquidityTokens = await this._lpToken.totalSupply();

    return calculateLPTokenAmount(
      quoteTokenAmount,
      baseTokenAmount,
      quoteTokenReserveQty,
      baseTokenReserveQty,
      slippage,
      totalSupplyOfLiquidityTokens,
      internalBalances,
    );
  }

  async calculateQuoteTokenQty(baseTokenQty, quoteTokenQtyMin) {
    const liquidityFeeInBasisPoints = await this.liquidityFee;
    const internalBalances = await this.contract.internalBalances();

    return calculateQuoteTokenQty(
      baseTokenQty,
      quoteTokenQtyMin,
      liquidityFeeInBasisPoints,
      internalBalances,
    );
  }

  async calculateTokenAmountsFromLPTokens(lpTokenQtyToRedeem, slippagePercent) {
    const quoteTokenReserveQty = await this._quoteToken.balanceOf(
      this._exchangeAddress,
    );
    const baseTokenReserveQty = await this._baseToken.balanceOf(
      this._exchangeAddress,
    );
    const totalLPTokenSupply = await this._lpToken.totalSupply();

    return calculateTokenAmountsFromLPTokens(
      lpTokenQtyToRedeem,
      slippagePercent,
      baseTokenReserveQty,
      quoteTokenReserveQty,
      totalLPTokenSupply,
    );
  }

  async calculatePriceImpact(swapAmount, inputTokenAddress, slippagePercent) {
    const inputTokenAddressLowerCase = inputTokenAddress.toLowerCase();
    const inputTokenAmount = toBigNumber(swapAmount);
    let inputTokenReserveQty = toBigNumber(0);
    let outputTokenReserveQty = toBigNumber(0);
    const feeAmount = await this.calculateFees(swapAmount);
    const baseDecimals = await this._baseToken.contract.decimals();
    const quoteDecimals = await this._baseToken.contract.decimals();
    const internalBalances = await this.contract.internalBalances();

    if (inputTokenAddressLowerCase === this.baseTokenAddress.toLowerCase()) {
      inputTokenReserveQty = toBigNumber(
        internalBalances.baseTokenReserveQty,
        baseDecimals,
      );
      outputTokenReserveQty = toBigNumber(
        internalBalances.quoteTokenReserveQty,
        quoteDecimals,
      );
    } else if (
      inputTokenAddressLowerCase === this.quoteTokenAddress.toLowerCase()
    ) {
      inputTokenReserveQty = toBigNumber(
        internalBalances.quoteTokenReserveQty,
        quoteDecimals,
      );
      outputTokenReserveQty = toBigNumber(
        internalBalances.baseTokenReserveQty,
        baseDecimals,
      );
    }

    const initialExchangeRate = await calculateExchangeRate(
      inputTokenReserveQty,
      outputTokenReserveQty,
    );
    const initialOutputAmount = swapAmount.dividedBy(initialExchangeRate);
    const finalOutputAmount = await calculateOutputAmountLessFees(
      inputTokenAmount,
      inputTokenReserveQty,
      outputTokenReserveQty,
      slippagePercent,
      feeAmount,
    );
    const OutputDifference = initialOutputAmount.minus(finalOutputAmount);
    const OutputDifferenceMultiplied = OutputDifference.multipliedBy(
      toBigNumber('100'),
    );
    const priceImpact =
      OutputDifferenceMultiplied.dividedBy(initialOutputAmount);
    return priceImpact;
  }

  async calculateOutputAmountLessFees(
    swapAmount,
    inputTokenAddress,
    slippagePercent,
  ) {
    const inputTokenAddressLowerCase = inputTokenAddress.toLowerCase();
    const inputTokenAmount = toBigNumber(swapAmount);
    let inputTokenReserveQty = toBigNumber(0);
    let outputTokenReserveQty = toBigNumber(0);

    const feeAmount = await this.calculateFees(swapAmount);
    const internalBalances = await this.contract.internalBalances();
    const baseDecimals = await this._baseToken.contract.decimals();
    const quoteDecimals = await this._baseToken.contract.decimals();

    if (inputTokenAddressLowerCase === this.baseTokenAddress.toLowerCase()) {
      inputTokenReserveQty = toBigNumber(
        internalBalances.baseTokenReserveQty,
        baseDecimals,
      );
      outputTokenReserveQty = toBigNumber(
        internalBalances.quoteTokenReserveQty,
        quoteDecimals,
      );
    } else if (
      inputTokenAddressLowerCase === this.quoteTokenAddress.toLowerCase()
    ) {
      inputTokenReserveQty = toBigNumber(
        internalBalances.quoteTokenReserveQty,
        quoteDecimals,
      );
      outputTokenReserveQty = toBigNumber(
        internalBalances.baseTokenReserveQty,
        baseDecimals,
      );
    }
    return calculateOutputAmountLessFees(
      inputTokenAmount,
      inputTokenReserveQty,
      outputTokenReserveQty,
      slippagePercent,
      feeAmount,
    );
  }

  async calculateShareOfPool(quoteTokenAmount, baseTokenAmount, slippage) {
    const totalSupplyOfLiquidityTokens = toBigNumber(
      await this._lpToken.totalSupply(),
    );
    if (totalSupplyOfLiquidityTokens.eq(toBigNumber(0))) {
      return toBigNumber(1); // 100% of pool!
    }

    const newTokens = await this.calculateLPTokenAmount(
      quoteTokenAmount,
      baseTokenAmount,
      slippage,
    );
    return newTokens.div(totalSupplyOfLiquidityTokens.plus(newTokens));
  }

  async calculateShareOfPoolProvided(lpAmount) {
    const totalSupplyOfLiquidityTokens = toBigNumber(
      await this._lpToken.totalSupply(),
    );
    if (totalSupplyOfLiquidityTokens.eq(lpAmount)) {
      return toBigNumber(1); // 100% of pool!
    }
    return lpAmount.multipliedBy(100).dividedBy(totalSupplyOfLiquidityTokens);
  }

  async addLiquidityWithSlippage(
    baseTokenQtyDesired,
    quoteTokenQtyDesired,
    slippagePercent,
    liquidityTokenRecipient,
    expirationTimestamp,
    overrides = {},
  ) {
    if (slippagePercent.gte(1) || slippagePercent.lt(0)) {
      throw this.errorHandling.error('SLIPPAGE_MUST_BE_PERCENT');
    }

    const slippageInverse = toBigNumber(1).minus(slippagePercent);
    const baseTokenQtyMin = baseTokenQtyDesired.multipliedBy(slippageInverse);
    const quoteTokenQtyMin = quoteTokenQtyDesired.multipliedBy(slippageInverse);

    return this.addLiquidity(
      baseTokenQtyDesired,
      quoteTokenQtyDesired,
      baseTokenQtyMin,
      quoteTokenQtyMin,
      liquidityTokenRecipient,
      expirationTimestamp,
      overrides,
    );
  }

  async addLiquidity(
    baseTokenQtyDesired,
    quoteTokenQtyDesired,
    baseTokenQtyMin,
    quoteTokenQtyMin,
    liquidityTokenRecipient,
    expirationTimestamp,
    overrides = {},
  ) {
    const baseTokenQtyDesiredBN = toBigNumber(baseTokenQtyDesired);
    const quoteTokenQtyDesiredBN = toBigNumber(quoteTokenQtyDesired);
    const baseTokenQtyMinBN = toBigNumber(baseTokenQtyMin);
    const quoteTokenQtyMinBN = toBigNumber(quoteTokenQtyMin);

    if (expirationTimestamp < new Date().getTime() / 1000) {
      throw this.errorHandling.error('TIMESTAMP_EXPIRED');
    }

    if (baseTokenQtyDesiredBN.lte(baseTokenQtyMinBN)) {
      throw this.errorHandling.error(
        'TOKEN_QTY_DESIRED_LESS_OR_EQUAL_THAN_MINIMUM',
      );
    }

    if ((await this.baseTokenBalance).lt(baseTokenQtyDesiredBN)) {
      throw this.errorHandling.error('NOT_ENOUGH_BASE_TOKEN_BALANCE');
    }

    if (quoteTokenQtyDesiredBN.lte(quoteTokenQtyMinBN)) {
      throw this.errorHandling.error(
        'TOKEN_QTY_DESIRED_LESS_OR_EQUAL_THAN_MINIMUM',
      );
    }

    if ((await this.quoteTokenBalance).lt(quoteTokenQtyDesiredBN)) {
      throw this.errorHandling.error('NOT_ENOUGH_QUOTE_TOKEN_BALANCE');
    }
    const baseTokenAllowanceBN = toBigNumber(await this.baseTokenAllowance);
    const quoteTokenAllowanceBN = toBigNumber(await this.quoteTokenAllowance);

    if (
      baseTokenAllowanceBN.lt(baseTokenQtyDesiredBN) ||
      quoteTokenAllowanceBN.lt(quoteTokenQtyDesiredBN)
    ) {
      throw this.errorHandling.error('TRANSFER_NOT_APPROVED');
    }

    this._contract = this.confirmSigner(this.contract);
    const txStatus = await this.contract.addLiquidity(
      toEthersBigNumber(baseTokenQtyDesiredBN),
      toEthersBigNumber(quoteTokenQtyDesiredBN),
      toEthersBigNumber(baseTokenQtyMinBN),
      toEthersBigNumber(quoteTokenQtyMinBN),
      liquidityTokenRecipient,
      expirationTimestamp,
      this.sanitizeOverrides(overrides),
    );
    return txStatus;
  }

  async removeLiquidity(
    liquidityTokenQty,
    baseTokenQtyMin,
    quoteTokenQtyMin,
    tokenRecipient,
    expirationTimestamp,
    overrides = {},
  ) {
    const liquidityTokenQtyBN = toBigNumber(liquidityTokenQty);
    const lpTokenBalance = toBigNumber(await this.lpTokenBalance);
    const lpTokenAllowance = toBigNumber(await this.lpTokenAllowance);

    if (expirationTimestamp < new Date().getTime() / 1000) {
      throw this.errorHandling.error('TIMESTAMP_EXPIRED');
    }
    if (lpTokenBalance.lt(liquidityTokenQtyBN)) {
      throw this.errorHandling.error('NOT_ENOUGH_LP_TOKEN_BALANCE');
    }
    if (lpTokenAllowance.lt(liquidityTokenQtyBN)) {
      throw this.errorHandling.error('TRANSFER_NOT_APPROVED');
    }

    this._contract = this.confirmSigner(this.contract);
    const baseTokenQtyMinEBN = toEthersBigNumber(baseTokenQtyMin);
    const quoteTokenQtyMinEBN = toEthersBigNumber(quoteTokenQtyMin);

    const txStatus = await this.contract.removeLiquidity(
      toEthersBigNumber(liquidityTokenQty),
      baseTokenQtyMinEBN,
      quoteTokenQtyMinEBN,
      tokenRecipient,
      expirationTimestamp,
      this.sanitizeOverrides(overrides),
    );
    return txStatus;
  }

  async swapBaseTokenForQuoteToken(
    baseTokenQty,
    quoteTokenQtyMin,
    expirationTimestamp,
    overrides = {},
  ) {
    const baseTokenQtyBN = toBigNumber(baseTokenQty);
    const quoteTokenQtyMinBN = toBigNumber(quoteTokenQtyMin);
    const baseTokenBalanceBN = toBigNumber(await this.baseTokenBalance);
    const baseTokenAllowanceBN = toBigNumber(await this.baseTokenAllowance);

    if (expirationTimestamp < new Date().getTime() / 1000) {
      throw this.errorHandling.error('TIMESTAMP_EXPIRED');
    }
    if (baseTokenBalanceBN.lt(baseTokenQtyBN)) {
      throw this.errorHandling.error('NOT_ENOUGH_BASE_TOKEN_BALANCE');
    }
    if (baseTokenAllowanceBN.lt(baseTokenQtyBN)) {
      throw this.errorHandling.error('TRANSFER_NOT_APPROVED');
    }

    this._contract = this.confirmSigner(this.contract);
    const baseTokenQtyEBN = toEthersBigNumber(baseTokenQtyBN);
    const quoteTokenQtyMinEBN = toEthersBigNumber(quoteTokenQtyMinBN);
    const txStatus = await this.contract.swapBaseTokenForQuoteToken(
      baseTokenQtyEBN,
      quoteTokenQtyMinEBN,
      expirationTimestamp,
      this.sanitizeOverrides(overrides),
    );
    return txStatus;
  }

  async swapQuoteTokenForBaseToken(
    quoteTokenQty,
    baseTokenQtyMin,
    expirationTimestamp,
    overrides = {},
  ) {
    const quoteTokenQtyBN = toBigNumber(quoteTokenQty);
    const baseTokenQtyMinBN = toBigNumber(baseTokenQtyMin);
    const quoteTokenBalanceBN = toBigNumber(await this.quoteTokenBalance);
    const quoteTokenAllowanceBN = toBigNumber(await this.quoteTokenAllowance);

    if (expirationTimestamp < new Date().getTime() / 1000) {
      throw this.errorHandling.error('TIMESTAMP_EXPIRED');
    }
    if (quoteTokenBalanceBN.lt(quoteTokenQtyBN)) {
      throw this.errorHandling.error('NOT_ENOUGH_QUOTE_TOKEN_BALANCE');
    }
    if (quoteTokenAllowanceBN.lt(quoteTokenQtyBN)) {
      throw this.errorHandling.error('TRANSFER_NOT_APPROVED');
    }

    this._contract = this.confirmSigner(this.contract);
    const quoteTokenQtyEBN = toEthersBigNumber(quoteTokenQtyBN);
    const baseTokenQtyMinEBN = toEthersBigNumber(baseTokenQtyMinBN);
    const txStatus = await this.contract.swapQuoteTokenForBaseToken(
      quoteTokenQtyEBN,
      baseTokenQtyMinEBN,
      expirationTimestamp,
      this.sanitizeOverrides(overrides),
    );
    return txStatus;
  }
}
