import ExchangeSolidity from '@elasticswap/elasticswap/artifacts/src/contracts/Exchange.sol/Exchange.json' assert { type: 'json' };
import ERC20 from '../tokens/ERC20.mjs';
import ErrorHandling from '../ErrorHandling.mjs';
import {
  calculateBaseTokenQty,
  calculateExchangeRate,
  calculateInputAmountFromOutputAmount,
  calculateFees,
  calculateLPTokenAmount,
  calculateQuoteTokenQty,
  calculateTokenAmountsFromLPTokens,
  calculateOutputAmountLessFees,
} from '../utils/mathLib.mjs';
import { toBigNumber, toEthersBigNumber } from '../utils/utils.mjs';
import { validateIsAddress, validateIsBigNumber } from '../utils/validations.mjs';

export default class Exchange extends ERC20 {
  constructor(sdk, exchangeAddress, baseTokenAddress, quoteTokenAddress) {
    super(sdk, exchangeAddress);
    this._baseTokenAddress = baseTokenAddress.toLowerCase();
    this._quoteTokenAddress = quoteTokenAddress.toLowerCase();
    this._baseToken = this.sdk.erc20(this.baseTokenAddress);
    this._quoteToken = this.sdk.erc20(this.quoteTokenAddress);
    this._errorHandling = new ErrorHandling('exchange');
  }

  /**
   * @readonly
   * @see {@link SDK#contract}
   * @see {@link https://docs.ethers.io/v5/api/contract/contract/}
   * @returns {ethers.Contract} contract - An ethers.js Contract instance
   * @memberof Exchange
   */
  static contract(sdk, address, readonly = false) {
    return sdk.contract({
      abi: ExchangeSolidity.abi,
      address,
      readonly,
    });
  }

  /**
   * @readonly
   * @see {@link SDK#contract}
   * @see {@link https://docs.ethers.io/v5/api/contract/contract/}
   * @returns {ethers.Contract} contract - An ethers.js Contract instance
   * @memberof ERC20
   */
  get contract() {
    return this.constructor.contract(this.sdk, this.address);
  }

  /**
   * @alias address
   * @readonly
   * @memberof ERC20
   */
  get id() {
    return this.address;
  }

  /**
   * @readonly
   * @see {@link SDK#contract}
   * @see {@link https://docs.ethers.io/v5/api/contract/contract/}
   * @returns {ethers.Contract} contract - A readonly ethers.js Contract instance
   * @memberof ExchangeFactory
   */
  get readonlyContract() {
    return this.constructor.contract(this.sdk, this.address, true);
  }

  get exchangeAddress() {
    return this.address;
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

  get liquidityFee() {
    return this.contract.TOTAL_LIQUIDITY_FEE();
  }

  get errorHandling() {
    return this._errorHandling;
  }

  async calculateBaseTokenQty(quoteTokenQty, baseTokenQtyMin) {
    const baseTokenReserveQty = await this._baseToken.balanceOf(this._exchangeAddress);
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

  async calculateInputAmountFromOutputAmount(outputAmount, outputTokenAddress, slippagePercent) {
    const outputTokenAddressLowerCase = outputTokenAddress.toLowerCase();
    const outputTokenAmountBN = toBigNumber(outputAmount);
    const slippagePercentBN = toBigNumber(slippagePercent);
    const liquidityFeeInBasisPointsBN = toBigNumber(await this.liquidityFee);

    let inputTokenReserveQty;
    let outputTokenReserveQty;

    const internalBalances = await this.contract.internalBalances();

    if (outputTokenAddressLowerCase === this.baseTokenAddress.toLowerCase()) {
      inputTokenReserveQty = internalBalances.quoteTokenReserveQty;
      outputTokenReserveQty = internalBalances.baseTokenReserveQty;
    } else {
      inputTokenReserveQty = internalBalances.baseTokenReserveQty;
      outputTokenReserveQty = internalBalances.quoteTokenReserveQty;
    }

    return calculateInputAmountFromOutputAmount(
      outputTokenAmountBN,
      inputTokenReserveQty,
      outputTokenReserveQty,
      slippagePercentBN,
      liquidityFeeInBasisPointsBN,
    );
  }

  async calculateLPTokenAmount(quoteTokenAmount, baseTokenAmount, slippage) {
    const quoteTokenReserveQty = await this._quoteToken.balanceOf(this._exchangeAddress);
    const baseTokenReserveQty = await this._baseToken.balanceOf(this._exchangeAddress);
    const internalBalances = await this.contract.internalBalances();
    const totalSupplyOfLiquidityTokens = await this.totalSupply();

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

  /**
   * The alternative way of calulating the priceImpact
   * 100 - ( OALFLS x 100 )
   *        ------
   *         IOA
   * OALFLS - outputAmountLessFessLessSlippage
   * IOA - initialOutputAmount = input / exchangeRate
   */
  async calculatePriceImpact(inputTokenAmount, inputTokenAddress, slippagePercent) {
    const calculatedOutputAmountLessFeesLessSlippage = await this.calculateOutputAmountLessFees(
      inputTokenAmount,
      inputTokenAddress,
      slippagePercent,
    );

    // this exchange rate is prior to swap occurance
    const calculatedExchangeRate = await this.calculateExchangeRate(inputTokenAddress);
    const iniialOutputAmount = toBigNumber(inputTokenAmount).dividedBy(calculatedExchangeRate);
    const ratioMultiplier = calculatedOutputAmountLessFeesLessSlippage
      .dividedBy(iniialOutputAmount)
      .multipliedBy(toBigNumber(100));
    const priceImpact = toBigNumber(100).minus(ratioMultiplier);

    return priceImpact;
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
    const quoteTokenReserveQty = await this._quoteToken.balanceOf(this._exchangeAddress);
    const baseTokenReserveQty = await this._baseToken.balanceOf(this._exchangeAddress);
    const totalLPTokenSupply = await this.totalSupply();

    return calculateTokenAmountsFromLPTokens(
      lpTokenQtyToRedeem,
      slippagePercent,
      baseTokenReserveQty,
      quoteTokenReserveQty,
      totalLPTokenSupply,
    );
  }

  async calculateOutputAmountLessFees(inputAmount, inputTokenAddress, slippagePercent) {
    const inputTokenAddressLowerCase = inputTokenAddress.toLowerCase();
    const inputTokenAmountBN = toBigNumber(inputAmount);
    let inputTokenReserveQty;
    let outputTokenReserveQty;
    const internalBalances = await this.contract.internalBalances();

    if (inputTokenAddressLowerCase === this.baseTokenAddress.toLowerCase()) {
      inputTokenReserveQty = internalBalances.baseTokenReserveQty;
      outputTokenReserveQty = internalBalances.quoteTokenReserveQty;
    } else {
      inputTokenReserveQty = internalBalances.quoteTokenReserveQty;
      outputTokenReserveQty = internalBalances.baseTokenReserveQty;
    }

    return calculateOutputAmountLessFees(
      inputTokenAmountBN,
      inputTokenReserveQty,
      outputTokenReserveQty,
      slippagePercent,
      await this.liquidityFee,
    );
  }

  async calculateShareOfPool(quoteTokenAmount, baseTokenAmount, slippage) {
    const totalSupplyOfLiquidityTokens = toBigNumber(await this.totalSupply());
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
    const totalSupplyOfLiquidityTokens = toBigNumber(await this.totalSupply());
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
    validateIsBigNumber(baseTokenQtyDesired);
    validateIsBigNumber(quoteTokenQtyDesired);
    validateIsBigNumber(baseTokenQtyMin);
    validateIsBigNumber(quoteTokenQtyMin);
    validateIsAddress(liquidityTokenRecipient);
    validateIsAddress(this.sdk.account);

    if (expirationTimestamp < new Date().getTime() / 1000) {
      throw this.errorHandling.error('TIMESTAMP_EXPIRED');
    }

    if (baseTokenQtyDesired.lte(baseTokenQtyMin)) {
      throw this.errorHandling.error('TOKEN_QTY_DESIRED_LESS_OR_EQUAL_THAN_MINIMUM');
    }

    const [
      baseTokenBalance,
      quoteTokenBalance,
      baseTokenAllowance,
      quoteTokenAllowance,
      baseTokenDecimals,
      quoteTokenDecimals,
    ] = await Promise.all([
      this.baseToken.balanceOf(this.sdk.account),
      this.quoteToken.balanceOf(this.sdk.account),
      this.baseToken.allowance(this.sdk.account, this.address),
      this.quoteToken.allowance(this.sdk.account, this.address),
      this.baseToken.decimals(),
      this.quoteToken.decimals(),
    ]);

    if ((await baseTokenBalance).lt(baseTokenQtyDesired)) {
      throw this.errorHandling.error('NOT_ENOUGH_BASE_TOKEN_BALANCE');
    }

    if (quoteTokenQtyDesired.lte(quoteTokenQtyMin)) {
      throw this.errorHandling.error('TOKEN_QTY_DESIRED_LESS_OR_EQUAL_THAN_MINIMUM');
    }

    if ((await quoteTokenBalance).lt(quoteTokenQtyDesired)) {
      throw this.errorHandling.error('NOT_ENOUGH_QUOTE_TOKEN_BALANCE');
    }

    if (
      baseTokenAllowance.lt(baseTokenQtyDesired) ||
      quoteTokenAllowance.lt(quoteTokenQtyDesired)
    ) {
      throw this.errorHandling.error('TRANSFER_NOT_APPROVED');
    }

    const payload = [
      this.toEthersBigNumber(baseTokenQtyDesired, baseTokenDecimals),
      this.toEthersBigNumber(quoteTokenQtyDesired, quoteTokenDecimals),
      this.toEthersBigNumber(baseTokenQtyMin, baseTokenDecimals),
      this.toEthersBigNumber(quoteTokenQtyMin, quoteTokenDecimals),
      liquidityTokenRecipient,
      expirationTimestamp,
      this.sanitizeOverrides(overrides),
    ];

    console.log('PAYLOAD', payload);

    return this._handleTransaction(await this.contract.addLiquidity(...payload));
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

  // wraps the transaction in a notification popup and resolves when it has been mined
  async _handleTransaction(tx) {
    this.sdk.notify(tx);
    const receipt = await tx.wait(1);
    return receipt;
  }
}
