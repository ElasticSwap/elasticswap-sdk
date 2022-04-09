/* eslint class-methods-use-this: 0 */
/* eslint prefer-destructuring: 0 */

import ERC20 from '../tokens/ERC20.mjs';
import { isPOJO } from '../utils/typeChecks.mjs';
import { toBigNumber } from '../utils/utils.mjs';

import {
  calculateBaseTokenQty,
  // calculateExchangeRate,
  // calculateInputAmountFromOutputAmount,
  // calculateFees,
  // calculateLPTokenAmount,
  calculateQuoteTokenQty,
  // calculateTokenAmountsFromLPTokens,
  // calculateOutputAmountLessFees,
} from '../utils/mathLib.mjs';

import { validate, validateIsAddress, validateIsBigNumber } from '../utils/validations.mjs';

const prefix = 'Exchange';

export default class Exchange extends ERC20 {
  constructor(sdk, exchangeAddress, baseTokenAddress, quoteTokenAddress) {
    super(sdk, exchangeAddress);

    validateIsAddress(baseTokenAddress, { prefix });
    validateIsAddress(quoteTokenAddress, { prefix });

    this._baseTokenAddress = baseTokenAddress.toLowerCase();
    this._quoteTokenAddress = quoteTokenAddress.toLowerCase();

    // subscribe to balance updates
    this.baseToken.balanceOf(this.address);
    this.quoteToken.balanceOf(this.address);

    // replicate touches between this and the standard ERC20 instance from the sdk
    this.sdk.erc20(this.address).subscribe(() => this.touch());

    // update base and quote token addresses to make sure they're in the right order
    Promise.all([
      this.sdk.multicall.enqueue(this.abi, this.address, 'baseToken'),
      this.sdk.multicall.enqueue(this.abi, this.address, 'quoteToken'),
      this.sdk.multicall.enqueue(this.abi, this.address, 'decimals'),
      this.sdk.multicall.enqueue(this.abi, this.address, 'name'),
      this.sdk.multicall.enqueue(this.abi, this.address, 'symbol'),
      this.sdk.multicall.enqueue(this.abi, this.address, 'totalSupply'),
    ]).then(([baseToken, quoteToken]) => {
      this._baseTokenAddress = baseToken.toLowerCase();
      this._quoteTokenAddress = quoteToken.toLowerCase();
      this.touch();
      // load all the core data
      this.baseToken.decimals();
      this.baseToken.name();
      this.baseToken.symbol();
      this.quoteToken.decimals();
      this.quoteToken.name();
      this.quoteToken.symbol();
    });
  }

  /**
   * @readonly
   * @see {@link SDK#contract}
   * @see {@link https://docs.ethers.io/v5/api/contract/contract/}
   * @returns {ethers.Contract} contract - An ethers.js Contract instance
   * @memberof Exchange
   */
  static contract(sdk, address, readonly = false) {
    const abi = sdk.contractAbi('Exchange');
    return sdk.contract({ abi, address, readonly });
  }

  /**
   * Returns the abi for the underlying contract
   *
   * @readonly
   * @memberof Exchange
   */
  get abi() {
    return this.sdk.contractAbi('Exchange');
  }

  /**
   * @alias address
   *
   * @readonly
   * @memberof Exchange
   */
  get exchangeAddress() {
    return this.address;
  }

  /**
   * The address of the base token
   *
   * @readonly
   * @memberof Exchange
   */
  get baseTokenAddress() {
    return this._baseTokenAddress;
  }

  get baseTokenBalance() {
    return this.baseToken.balances[this.address] || toBigNumber(0);
  }

  /**
   * The address of the quote token
   *
   * @readonly
   * @memberof Exchange
   */
  get quoteTokenAddress() {
    return this._quoteTokenAddress;
  }

  get quoteTokenBalance() {
    return this.quoteToken.balances[this.address] || toBigNumber(0);
  }

  /**
   * The ERC20 instance for the base token
   *
   * @readonly
   * @memberof Exchange
   */
  get baseToken() {
    return this.sdk.erc20(this.baseTokenAddress);
  }

  /**
   * The ERC20 instance for the quote token
   *
   * @readonly
   * @memberof Exchange
   */
  get quoteToken() {
    return this.sdk.erc20(this.quoteTokenAddress);
  }

  /**
   * Returns the internal balances of the exchange. This always has to be up to date, so no caching
   * is performed on the result.
   *
   * NOTE: kLast is not returned as part of this function
   *
   * @param {Object} [overrides] - @see {@link Base#sanitizeOverrides}
   * @return {Object}
   * @memberof ERC20
   */
  async internalBalances(overrides) {
    let internalBalances;
    let baseTokenDecimals;
    let quoteTokenDecimals;

    // if there are overrides, fetch directly from the readonly contract
    if (isPOJO(overrides)) {
      const results = await Promise.all([
        this.readonlyContract.internalBalances(overrides),
        this.baseToken.decimals(overrides),
        this.quoteToken.decimals(overrides),
      ]);

      internalBalances = results[0];
      baseTokenDecimals = results[1];
      quoteTokenDecimals = results[2];
    }

    // fetch the value from the network using multicall
    if (!internalBalances) {
      const results = await Promise.all([
        this.sdk.multicall.enqueue(this.abi, this.address, 'internalBalances'),
        this.baseToken.decimals(),
        this.quoteToken.decimals(),
      ]);

      internalBalances = results[0];
      baseTokenDecimals = results[1];
      quoteTokenDecimals = results[2];
    }

    const baseTokenReserveQty = this.toBigNumber(
      internalBalances.baseTokenReserveQty,
      baseTokenDecimals,
    );
    const quoteTokenReserveQty = this.toBigNumber(
      internalBalances.quoteTokenReserveQty,
      quoteTokenDecimals,
    );

    return { baseTokenReserveQty, quoteTokenReserveQty };
  }

  /**
   * Returns the MINIMUM_LIQUIDITY constant from the contract. There is never any reason to check
   * this at a previous block as it will always be the same, so no overrides are considered. Always
   * fetches the value using multicall.
   *
   * @return {number}
   * @memberof Exchange
   */
  async MINIMUM_LIQUIDITY() {
    // if the value is cached, return it
    if (this._totalLiquidityFee) {
      return this._totalLiquidityFee;
    }

    // fetch the value from the network using multicall
    this._minimumLiquidity = this.toNumber(
      await this.sdk.multicall.enqueue(this.abi, this.address, 'MINIMUM_LIQUIDITY'),
    );

    // update subscribers
    this.sdk.erc20(this.address).touch();

    // return the cached value
    return this._minimumLiquidity;
  }

  /**
   * Returns the TOTAL_LIQUIDITY_FEE constant from the contract. There is never any reason to check
   * this at a previous block as it will always be the same, so no overrides are considered. Always
   * fetches the value using multicall.
   *
   * @return {number}
   * @memberof Exchange
   */
  async TOTAL_LIQUIDITY_FEE() {
    // if the value is cached, return it
    if (this._totalLiquidityFee) {
      return this._totalLiquidityFee;
    }

    // fetch the value from the network using multicall
    this._totalLiquidityFee = this.toNumber(
      await this.sdk.multicall.enqueue(this.abi, this.address, 'TOTAL_LIQUIDITY_FEE'),
    );

    // update subscribers
    this.sdk.erc20(this.address).touch();

    // return the cached value
    return this._totalLiquidityFee;
  }

  /**
   * Adds liquidity to the pool. Single asset entry needs should be taken into account, so the
   * caller of this function should first check for decay. If you don't want to do that, setting
   * both min quantities to 0 will also suffice.
   *
   * @param {BigNumber} baseTokenQtyDesired - the amount of base token to be used
   * @param {BigNumber} quoteTokenQtyDesired - the amount of quote token to be used
   * @param {BigNumber} baseTokenQtyMin - minimum amount of base token to be used
   * @param {BigNumber} quoteTokenQtyMin - minimum amount of quote token to be used
   * @param {string} liquidityTokenRecipient - address to mint the ELP tokens to
   * @param {number} expirationTimestamp - a unix timestamp representing when this request expires
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {TransactionResponse}
   * @memberof Exchange
   */
  async addLiquidity(
    baseTokenQtyDesired,
    quoteTokenQtyDesired,
    baseTokenQtyMin,
    quoteTokenQtyMin,
    liquidityTokenRecipient,
    expirationTimestamp,
    overrides = {},
  ) {
    // Validate all the inputs
    validateIsBigNumber(this.toBigNumber(baseTokenQtyDesired));
    validateIsBigNumber(this.toBigNumber(quoteTokenQtyDesired));
    validateIsBigNumber(this.toBigNumber(baseTokenQtyMin));
    validateIsBigNumber(this.toBigNumber(quoteTokenQtyMin));
    validateIsAddress(liquidityTokenRecipient);
    validateIsAddress(this.sdk.account);

    const [
      baseTokenSymbol,
      quoteTokenSymbol,
      baseTokenBalance,
      quoteTokenBalance,
      baseTokenAllowance,
      quoteTokenAllowance,
      baseTokenDecimals,
      quoteTokenDecimals,
    ] = await Promise.all([
      this.baseToken.symbol(),
      this.quoteToken.symbol(),
      this.baseToken.balanceOf(this.sdk.account, { multicall: true }),
      this.quoteToken.balanceOf(this.sdk.account, { multicall: true }),
      this.baseToken.allowance(this.sdk.account, this.address, { multicall: true }),
      this.quoteToken.allowance(this.sdk.account, this.address, { multicall: true }),
      this.baseToken.decimals(),
      this.quoteToken.decimals(),
    ]);

    // save the user gas by confirming that the minimum values are not greater than the maximum ones
    validate(this.toBigNumber(baseTokenQtyMin).lte(baseTokenQtyDesired), {
      message: `Minimum amount of ${baseTokenSymbol} requested is greater than the maximum.`,
      prefix,
    });

    validate(this.toBigNumber(quoteTokenQtyMin).lte(quoteTokenQtyDesired), {
      message: `Minimum amount of ${quoteTokenSymbol} requested is greater than the maximum.`,
      prefix,
    });

    // save the user gas by confirming that the allowances and balance match the request
    validate(this.toBigNumber(baseTokenQtyDesired).lt(baseTokenBalance), {
      message: `You don't have enough ${baseTokenSymbol}`,
      prefix,
    });

    validate(this.toBigNumber(quoteTokenQtyDesired).lt(quoteTokenBalance), {
      message: `You don't have enough ${quoteTokenSymbol}`,
      prefix,
    });

    validate(baseTokenAllowance.gte(baseTokenQtyDesired), {
      message: `Not allowed to spend that much ${baseTokenSymbol}`,
      prefix,
    });

    validate(quoteTokenAllowance.gte(quoteTokenQtyDesired), {
      message: `Not allowed to spend that much ${quoteTokenSymbol}`,
      prefix,
    });

    // build the payload
    const payload = [
      this.toEthersBigNumber(baseTokenQtyDesired, baseTokenDecimals),
      this.toEthersBigNumber(quoteTokenQtyDesired, quoteTokenDecimals),
      this.toEthersBigNumber(baseTokenQtyMin, baseTokenDecimals),
      this.toEthersBigNumber(quoteTokenQtyMin, quoteTokenDecimals),
      liquidityTokenRecipient,
      expirationTimestamp,
      this.sanitizeOverrides(overrides),
    ];

    const nowish = (Date.now() + 100) / 1000;

    // save the user gas by confirming that the timestamp is not already expired
    // do this at the last possible moment and add 100 ms for network latency
    validate(expirationTimestamp > nowish, {
      message: 'Requested expiration is in the past',
      prefix,
    });

    // submit the transaction
    const receipt = await this._handleTransaction(await this.contract.addLiquidity(...payload));

    // update balances
    await Promise.all([
      this.baseToken.balanceOf(this.address, { multicall: true }),
      this.quoteToken.balanceOf(this.address, { multicall: true }),
      this.balanceOf(liquidityTokenRecipient, { multicall: true }),
    ]);

    return receipt;
  }

  async removeLiquidity() {
    // liquidityTokenQty,
    // baseTokenQtyMin,
    // quoteTokenQtyMin,
    // tokenRecipient,
    // expirationTimestamp,
    // overrides = {},
    /*
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
    */
  }

  async swapBaseTokenForQuoteToken() {
    // baseTokenQty,
    // quoteTokenQtyMin,
    // expirationTimestamp,
    // overrides = {},
    /*
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
    */
  }

  async swapQuoteTokenForBaseToken() {
    // quoteTokenQty,
    // baseTokenQtyMin,
    // expirationTimestamp,
    // overrides = {},
    /*
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
    */
  }

  // CALCULATIONS

  async calculateBaseTokenQty(quoteTokenQty, baseTokenQtyMin) {
    const [baseTokenDecimals, baseTokenReserveQty, liquidityFeeInBasisPoints, internalBalances] =
      await Promise.all([
        this.baseToken.decimals(),
        this.baseToken.balanceOf(this.address),
        this.TOTAL_LIQUIDITY_FEE(),
        this.internalBalances(),
      ]);

    return calculateBaseTokenQty(
      quoteTokenQty,
      baseTokenQtyMin || this.toBigNumber(1, baseTokenDecimals),
      baseTokenReserveQty,
      liquidityFeeInBasisPoints,
      internalBalances,
    );
  }

  async calculateQuoteTokenQty(baseTokenQty, quoteTokenQtyMin) {
    const [quoteTokenDecimals, liquidityFeeInBasisPoints, internalBalances] = await Promise.all([
      this.quoteToken.decimals(),
      this.TOTAL_LIQUIDITY_FEE(),
      this.internalBalances(),
    ]);

    return calculateQuoteTokenQty(
      baseTokenQty,
      quoteTokenQtyMin || this.toBigNumber(1, quoteTokenDecimals),
      liquidityFeeInBasisPoints,
      internalBalances,
    );
  }

  // wraps the transaction in a notification popup and resolves when it has been mined
  async _handleTransaction(tx) {
    this.sdk.notify(tx);
    const receipt = await tx.wait(2);
    return receipt;
  }
}

/**
 * The following functions may or may not belong on this class. Leaving below for the moment.
 */

/*

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
   * /
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
*/
