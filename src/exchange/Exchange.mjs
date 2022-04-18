/* eslint class-methods-use-this: 0 */
/* eslint prefer-destructuring: 0 */

import ERC20 from '../tokens/ERC20.mjs';
import { isPOJO } from '../utils/typeChecks.mjs';
import { toBigNumber } from '../utils/utils.mjs';
import { validate, validateIsAddress, validateIsBigNumber } from '../utils/validations.mjs';
import {
  getBaseTokenQtyFromQuoteTokenQty,
  getQuoteTokenQtyFromBaseTokenQty,
} from '../utils/mathLib2.mjs';

const prefix = 'Exchange';

export default class Exchange extends ERC20 {
  constructor(sdk, exchangeAddress, baseTokenAddress, quoteTokenAddress) {
    super(sdk, exchangeAddress);

    validateIsAddress(baseTokenAddress, { prefix });
    validateIsAddress(quoteTokenAddress, { prefix });

    this._baseTokenAddress = baseTokenAddress.toLowerCase();
    this._quoteTokenAddress = quoteTokenAddress.toLowerCase();

    // subscribe to balance updates
    this.baseToken.balanceOf(this.address).catch(() => {}); // errors here don't matter
    this.quoteToken.balanceOf(this.address).catch(() => {}); // errors here don't matter

    // replicate touches between this and the standard ERC20 instance from the sdk
    this.sdk.erc20(this.address).subscribe(() => this.touch());

    // update base and quote token addresses to make sure they're in the right order
    this._promise = Promise.all([
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
   * Provides a promise that is resolved after the initial data load.
   *
   * @readonly
   * @memberof Exchange
   */
  get awaitInitialized() {
    return this._promise;
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
    return this.sdk.tokensByAddress.tokenByAddress(this.baseTokenAddress);
  }

  /**
   * The ERC20 instance for the quote token
   *
   * @readonly
   * @memberof Exchange
   */
  get quoteToken() {
    return this.sdk.tokensByAddress.tokenByAddress(this.quoteTokenAddress);
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

    // if there are overrides, fetch directly from the readonly contract
    if (isPOJO(overrides)) {
      const results = await this.readonlyContract.internalBalances(overrides);
      internalBalances = results[0];
    }

    // fetch the value from the network using multicall
    if (!internalBalances) {
      const results = await this.sdk.multicall.enqueue(this.abi, this.address, 'internalBalances');
      internalBalances = results[0];
    }

    const baseTokenReserveQty = this.toBigNumber(
      internalBalances.baseTokenReserveQty,
      this.baseToken.decimals,
    );
    const quoteTokenReserveQty = this.toBigNumber(
      internalBalances.quoteTokenReserveQty,
      this.quoteToken.decimals,
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
    validateIsBigNumber(this.toBigNumber(baseTokenQtyDesired), { prefix });
    validateIsBigNumber(this.toBigNumber(quoteTokenQtyDesired), { prefix });
    validateIsBigNumber(this.toBigNumber(baseTokenQtyMin), { prefix });
    validateIsBigNumber(this.toBigNumber(quoteTokenQtyMin), { prefix });
    validateIsAddress(liquidityTokenRecipient, { prefix });
    validateIsAddress(this.sdk.account, { prefix });

    this.sdk.trackAddress(liquidityTokenRecipient);

    const [baseTokenBalance, quoteTokenBalance, baseTokenAllowance, quoteTokenAllowance] =
      await Promise.all([
        this.baseToken.balanceOf(this.sdk.account, { multicall: true }),
        this.quoteToken.balanceOf(this.sdk.account, { multicall: true }),
        this.baseToken.allowance(this.sdk.account, this.address, { multicall: true }),
        this.quoteToken.allowance(this.sdk.account, this.address, { multicall: true }),
      ]);

    // save the user gas by confirming that the minimum values are not greater than the maximum ones
    validate(this.toBigNumber(baseTokenQtyMin).lte(baseTokenQtyDesired), {
      message: `Minimum amount of ${this.baseToken.symbol} requested is greater than the maximum.`,
      prefix,
    });

    validate(this.toBigNumber(quoteTokenQtyMin).lte(quoteTokenQtyDesired), {
      message: `Minimum amount of ${this.quoteToken.symbol} requested is greater than the maximum.`,
      prefix,
    });

    // save the user gas by confirming that the allowances and balance match the request
    validate(this.toBigNumber(baseTokenQtyDesired).lt(baseTokenBalance), {
      message: `You don't have enough ${this.baseToken.symbol}`,
      prefix,
    });

    validate(this.toBigNumber(quoteTokenQtyDesired).lt(quoteTokenBalance), {
      message: `You don't have enough ${this.quoteToken.symbol}`,
      prefix,
    });

    validate(baseTokenAllowance.gte(baseTokenQtyDesired), {
      message: `Not allowed to spend that much ${this.baseToken.symbol}`,
      prefix,
    });

    validate(quoteTokenAllowance.gte(quoteTokenQtyDesired), {
      message: `Not allowed to spend that much ${this.quoteToken.symbol}`,
      prefix,
    });

    // build the payload
    const payload = [
      this.toEthersBigNumber(baseTokenQtyDesired, this.baseToken.decimals),
      this.toEthersBigNumber(quoteTokenQtyDesired, this.quoteToken.decimals),
      this.toEthersBigNumber(baseTokenQtyMin, this.baseToken.decimals),
      this.toEthersBigNumber(quoteTokenQtyMin, this.quoteToken.decimals),
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

  async removeLiquidity(
    liquidityTokenQty,
    baseTokenQtyMin,
    quoteTokenQtyMin,
    tokenRecipient,
    expirationTimestamp,
    overrides = {},
  ) {
    validateIsBigNumber(this.toBigNumber(liquidityTokenQty), { prefix });
    validateIsBigNumber(this.toBigNumber(baseTokenQtyMin), { prefix });
    validateIsBigNumber(this.toBigNumber(quoteTokenQtyMin), { prefix });
    validateIsAddress(tokenRecipient, { prefix });
    validateIsAddress(this.sdk.account, { prefix });

    this.sdk.trackAddress(tokenRecipient);

    const lpBalance = await this.balanceOf(this.sdk.account, { multicall: true });

    // save the user gas by confirming that the balance matches the request
    validate(this.toBigNumber(liquidityTokenQty).lte(lpBalance), {
      message: "You don't have enough ELP",
      prefix,
    });

    const nowish = (Date.now() + 100) / 1000;

    // save the user gas by confirming that the timestamp is not already expired
    // do this at the last possible moment and add 100 ms for network latency
    validate(expirationTimestamp > nowish, {
      message: 'Requested expiration is in the past',
      prefix,
    });

    return this._handleTransaction(
      await this.contract.removeLiquidity(
        this.toEthersBigNumber(liquidityTokenQty, 18),
        this.toEthersBigNumber(baseTokenQtyMin, this.baseToken.decimals),
        this.toEthersBigNumber(quoteTokenQtyMin, this.quoteToken.decimals),
        tokenRecipient,
        expirationTimestamp,
        this.sanitizeOverrides(overrides),
      ),
    );
  }

  async swapBaseTokenForQuoteToken(
    baseTokenQty,
    quoteTokenQtyMin,
    expirationTimestamp,
    overrides = {},
  ) {
    validateIsBigNumber(this.toBigNumber(baseTokenQty), { prefix });
    validateIsBigNumber(this.toBigNumber(quoteTokenQtyMin), { prefix });

    // check balances and approval of base token
    const [baseTokenBalance, baseTokenAllowance] = await Promise.all([
      this.baseToken.balanceOf(this.sdk.account, { multicall: true }),
      this.baseToken.allowance(this.sdk.account, this.address, { multicall: true }),
    ]);

    // save the user gas by confirming that the allowances and balance match the request
    validate(baseTokenAllowance.gte(baseTokenQty), {
      message: `Not allowed to spend that much ${this.baseToken.symbol} token`,
      prefix,
    });

    validate(this.toBigNumber(baseTokenQty).lt(baseTokenBalance), {
      message: `You don't have enough ${this.baseToken.symbol} token`,
      prefix,
    });

    const nowish = (Date.now() + 100) / 1000;
    validate(expirationTimestamp > nowish, {
      message: 'Requested expiration is in the past',
      prefix,
    });

    const receipt = await this._handleTransaction(
      await this.contract.swapBaseTokenForQuoteToken(
        this.toEthersBigNumber(baseTokenQty, this.baseToken.decimals),
        this.toEthersBigNumber(quoteTokenQtyMin, this.quoteToken.decimals),
        expirationTimestamp,
        this.sanitizeOverrides(overrides),
      ),
    );

    // update balances
    await Promise.all([
      this.baseToken.balanceOf(this.sdk.account, { multicall: true }),
      this.quoteToken.balanceOf(this.sdk.account, { multicall: true }),
    ]);

    return receipt;
  }

  async swapQuoteTokenForBaseToken(
    quoteTokenQty,
    baseTokenQtyMin,
    expirationTimestamp,
    overrides = {},
  ) {
    validateIsBigNumber(this.toBigNumber(quoteTokenQty), { prefix });
    validateIsBigNumber(this.toBigNumber(baseTokenQtyMin), { prefix });

    // check balances and approval of base token
    const [quoteTokenBalance, quoteTokenAllowance] = await Promise.all([
      this.quoteToken.balanceOf(this.sdk.account, { multicall: true }),
      this.quoteToken.allowance(this.sdk.account, this.address, { multicall: true }),
    ]);

    // save the user gas by confirming that the allowances and balance match the request
    validate(quoteTokenAllowance.gte(quoteTokenQty), {
      message: `Not allowed to spend that much ${this.quoteToken.symbol} token`,
      prefix,
    });

    validate(this.toBigNumber(quoteTokenQty).lt(quoteTokenBalance), {
      message: `You don't have enough ${this.quoteToken.symbol} token`,
      prefix,
    });

    const nowish = (Date.now() + 100) / 1000;
    validate(expirationTimestamp > nowish, {
      message: 'Requested expiration is in the past',
      prefix,
    });

    const receipt = await this._handleTransaction(
      await this.contract.swapQuoteTokenForBaseToken(
        this.toEthersBigNumber(quoteTokenQty, this.quoteToken.decimals),
        this.toEthersBigNumber(baseTokenQtyMin, this.baseToken.decimals),
        expirationTimestamp,
        this.sanitizeOverrides(overrides),
      ),
    );

    // update balances
    await Promise.all([
      this.baseToken.balanceOf(this.sdk.account, { multicall: true }),
      this.quoteToken.balanceOf(this.sdk.account, { multicall: true }),
    ]);

    return receipt;
  }

  // CALCULATIONS

  /**
   * gets the expected output amount of base tokens given the input
   * @param {string | BigNumber | Number } quoteTokenQty in native, decimal format of the quoteToken
   * @returns BigNumber decimal representation of expected output amount
   */
  async getBaseTokenQtyFromQuoteTokenQty(quoteTokenQty) {
    const [baseTokenReserveQty, fee, internalBalances] = await Promise.all([
      this.sdk.multicall.enqueue(this.baseToken.abi, this.baseToken.address, 'balanceOf', [
        this.address,
      ]),
      this.sdk.multicall.enqueue(this.abi, this.address, 'TOTAL_LIQUIDITY_FEE'),
      this.sdk.multicall.enqueue(this.abi, this.address, 'internalBalances'),
    ]);
    const rawBaseTokenQty = getBaseTokenQtyFromQuoteTokenQty(
      this.toEthersBigNumber(quoteTokenQty, this.quoteToken.decimals),
      baseTokenReserveQty,
      fee,
      internalBalances,
    );
    return this.toBigNumber(rawBaseTokenQty, this.baseToken.decimals);
  }

  /**
   * gets the expected output amount of quote tokens tokens given the input
   * @param {string | BigNumber | Number } baseTokenQty in native, decimal format of the baseToken
   * @returns BigNumber decimal representation of expected output amount
   */
  async getQuoteTokenQtyFromBaseTokenQty(baseTokenQty) {
    const [fee, internalBalances] = await Promise.all([
      this.sdk.multicall.enqueue(this.abi, this.address, 'TOTAL_LIQUIDITY_FEE'),
      this.sdk.multicall.enqueue(this.abi, this.address, 'internalBalances'),
    ]);
    const rawQuoteTokenQty = getQuoteTokenQtyFromBaseTokenQty(
      this.toEthersBigNumber(baseTokenQty, this.baseToken.decimals),
      fee,
      internalBalances,
    );
    return this.toBigNumber(rawQuoteTokenQty, this.quoteToken.decimals);
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
