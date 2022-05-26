/* eslint class-methods-use-this: 0 */
/* eslint prefer-destructuring: 0 */

import ERC20 from '../tokens/ERC20.mjs';
import { isPOJO } from '../utils/typeChecks.mjs';
import { toBigNumber } from '../utils/utils.mjs';
import {
  validate,
  validateIsAddress,
  validateIsBigNumber,
  validateIsNumber,
} from '../utils/validations.mjs';
import {
  getAddLiquidityBaseTokenQtyFromQuoteTokenQty,
  getAddLiquidityQuoteTokenQtyFromBaseTokenQty,
  getBaseTokenQtyFromQuoteTokenQty,
  getLPTokenQtyFromTokenQtys,
  getQuoteTokenQtyFromBaseTokenQty,
  getTokenImbalanceQtys,
  getTokenQtysFromLPTokenQty,
} from '../utils/mathLib.mjs';

const prefix = 'Exchange';
const BASIS_POINTS = 10000;

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

  /**
   * Tha cached base token balance of the exchange
   *
   * @readonly
   * @memberof Exchange
   */
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

  /**
   * The cached quote token balance of the exchange
   *
   * @readonly
   * @memberof Exchange
   */
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
   * The price of one quote token in base tokens.
   *
   * @return {Promise<BigNumber>}
   * @memberof Exchange
   */
  async priceofQuoteInBase() {
    const { baseTokenReserveQty, quoteTokenReserveQty } = await this.internalBalances();
    return baseTokenReserveQty.dividedBy(quoteTokenReserveQty);
  }

  /**
   * The price of one base token in quote tokens.
   *
   * @return {Promise<BigNumber>}
   * @memberof Exchange
   */
  async priceOfBaseInQuote() {
    const { baseTokenReserveQty, quoteTokenReserveQty } = await this.internalBalances();
    return quoteTokenReserveQty.dividedBy(baseTokenReserveQty);
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
    let baseTokenDecimals;
    let internalBalances;
    let quoteTokenDecimals;

    // if there are overrides, fetch directly from the readonly contract
    if (isPOJO(overrides)) {
      const [results, btDecimals, qtDecimals] = await Promise.all([
        this.readonlyContract.internalBalances(overrides),
        this.sdk.erc20(this.baseTokenAddress).decimals(overrides),
        this.sdk.erc20(this.quoteTokenAddress).decimals(overrides),
      ]);

      baseTokenDecimals = btDecimals;
      internalBalances = results;
      quoteTokenDecimals = qtDecimals;
    }

    // fetch the value from the network using multicall
    if (!internalBalances) {
      const [results, btDecimals, qtDecimals] = await Promise.all([
        this.sdk.multicall.enqueue(this.abi, this.address, 'internalBalances'),
        this.sdk.erc20(this.baseTokenAddress).decimals({ multicall: true }),
        this.sdk.erc20(this.quoteTokenAddress).decimals({ multicall: true }),
      ]);

      baseTokenDecimals = btDecimals;
      internalBalances = results;
      quoteTokenDecimals = qtDecimals;
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
    validate(this.toBigNumber(baseTokenQtyDesired).lte(baseTokenBalance), {
      message: `You don't have enough ${this.baseToken.symbol}`,
      prefix,
    });

    validate(this.toBigNumber(quoteTokenQtyDesired).lte(quoteTokenBalance), {
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

  /**
   * Called to swap base tokens for quote tokens.
   * @param {string | BigNumber | Number} baseTokenQty amount of base tokens desired to swap
   * @param {string | BigNumber | Number} quoteTokenQtyMin min amount of quote tokens to be received
   * @param {number} expirationTimestamp - a unix timestamp representing when this request expires
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {TransactionResponse}
   */
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

    validate(this.toBigNumber(baseTokenQty).lte(baseTokenBalance), {
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

  /**
   * Convenience wrapper for swapBaseTokenForQuoteTokens
   * @param {} baseTokenQty amount of base tokens to swap
   * @param {*} slippagePercentageBP allowed slippage percentage in basis points
   * @param {*} requestTimeoutSeconds number of seconds from now to expire request
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {TransactionResponse}
   */
  async swapBaseTokens(baseTokenQty, slippagePercentageBP, requestTimeoutSeconds, overrides = {}) {
    const baseTokenQtyBN = this.toBigNumber(baseTokenQty);
    validateIsBigNumber(baseTokenQtyBN, { prefix });
    validateIsNumber(slippagePercentageBP, prefix);
    validateIsNumber(requestTimeoutSeconds, prefix);

    const expectedQuoteTokenQty = await this.getQuoteTokenQtyFromBaseTokenQty(baseTokenQtyBN);
    const slippageAmount = expectedQuoteTokenQty
      .multipliedBy(slippagePercentageBP)
      .dividedBy(BASIS_POINTS);
    const minQuoteTokenQty = expectedQuoteTokenQty.minus(slippageAmount);
    const expiration = Math.floor(Date.now() / 1000 + requestTimeoutSeconds);
    return this.swapBaseTokenForQuoteTokens(
      baseTokenQtyBN,
      minQuoteTokenQty,
      expiration,
      overrides,
    );
  }

  /**
   * Called to swap quote tokens for base tokens.
   * @param {string | BigNumber | Number} quoteTokenQty amount of quote tokens to swap
   * @param {string | BigNumber | Number} baseTokenQtyMin min amount of baseTokens to receive back
   * @param {number} expirationTimestamp - a unix timestamp representing when this request expires
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {TransactionResponse}
   */
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

    validate(this.toBigNumber(quoteTokenQty).lte(quoteTokenBalance), {
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

  /**
   * Convenience wrapper for swapQuoteTokenForBaseToken to swapQuoteTokens
   * @param {} quoteTokenQty amount of quote tokens to swap
   * @param {*} slippagePercentageBP allowed slippage percentage in basis points
   * @param {*} requestTimeoutSeconds number of seconds from now to expire request
   * @param {Object} [overrides={}] - @see {@link Base#sanitizeOverrides}
   * @return {TransactionResponse}
   */
  async swapQuoteTokens(quoteTokenQty, slippagePercentageBP, requestTimeoutSeconds, overrides) {
    const quoteTokenQtyBN = this.toBigNumber(quoteTokenQty);
    validateIsBigNumber(quoteTokenQtyBN, { prefix });
    validateIsNumber(slippagePercentageBP, prefix);
    validateIsNumber(requestTimeoutSeconds, prefix);

    const expectedBaseTokenQty = await this.getBaseTokenQtyFromQuoteTokenQty(quoteTokenQtyBN);
    const slippageAmount = expectedBaseTokenQty
      .multipliedBy(slippagePercentageBP)
      .dividedBy(BASIS_POINTS);
    const minBaseTokenQty = expectedBaseTokenQty.minus(slippageAmount);
    const expiration = Math.floor(Date.now() / 1000 + requestTimeoutSeconds);
    return this.swapQuoteTokenForBaseToken(quoteTokenQtyBN, minBaseTokenQty, expiration, overrides);
  }

  // CALCULATIONS

  async getAddLiquidityBaseTokenQtyFromQuoteTokenQty(quoteTokenQty) {
    const quoteTokenQtyBN = this.toBigNumber(quoteTokenQty);
    validateIsBigNumber(quoteTokenQtyBN, { prefix });

    const [baseTokenReserveQty, internalBalances] = await Promise.all([
      this.sdk.multicall.enqueue(this.baseToken.abi, this.baseToken.address, 'balanceOf', [
        this.address,
      ]),
      this.sdk.multicall.enqueue(this.abi, this.address, 'internalBalances'),
    ]);

    const rawBaseTokenQty = getAddLiquidityBaseTokenQtyFromQuoteTokenQty(
      this.toEthersBigNumber(quoteTokenQty, this.quoteToken.decimals),
      baseTokenReserveQty,
      internalBalances,
    );

    const baseTokenQty = this.toBigNumber(rawBaseTokenQty, this.baseToken.decimals);
    return baseTokenQty;
  }

  async getAddLiquidityQuoteTokenQtyFromBaseTokenQty(baseTokenQty) {
    const baseTokenQtyBN = this.toBigNumber(baseTokenQty);
    validateIsBigNumber(baseTokenQtyBN, { prefix });

    const [baseTokenReserveQty, internalBalances] = await Promise.all([
      this.sdk.multicall.enqueue(this.baseToken.abi, this.baseToken.address, 'balanceOf', [
        this.address,
      ]),
      this.sdk.multicall.enqueue(this.abi, this.address, 'internalBalances'),
    ]);

    const rawQuoteTokenQty = getAddLiquidityQuoteTokenQtyFromBaseTokenQty(
      this.toEthersBigNumber(baseTokenQty, this.baseToken.decimals),
      baseTokenReserveQty,
      internalBalances,
    );

    const quoteTokenQty = this.toBigNumber(rawQuoteTokenQty, this.quoteToken.decimals);
    return quoteTokenQty;
  }

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
   * @param {string | BigNumber | number} baseTokenQty in native, decimal format of the baseToken
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

  /**
   * Computes the expected amounts of base and quote tokens to be returned to a user for a give
   * amount of lpTokenQty
   * @param {string | BigNumber | number} lpTokenQty in decimal format of lp token
   * @returns {object} { baseTokenQty: BigNumber, quoteTokenQty: BigNumber }
   */
  async getTokenQtysFromLPTokenQty(lpTokenQty) {
    const [baseTokenReserveQty, quoteTokenReserveQty, totalSupply] = await Promise.all([
      this.sdk.multicall.enqueue(this.baseToken.abi, this.baseToken.address, 'balanceOf', [
        this.address,
      ]),
      this.sdk.multicall.enqueue(this.quoteToken.abi, this.quoteToken.address, 'balanceOf', [
        this.address,
      ]),
      this.sdk.multicall.enqueue(this.abi, this.address, 'totalSupply'),
    ]);
    const rawTokenQtys = getTokenQtysFromLPTokenQty(
      this.toEthersBigNumber(lpTokenQty, this._decimals),
      baseTokenReserveQty,
      quoteTokenReserveQty,
      totalSupply,
    );

    return {
      baseTokenQty: this.toBigNumber(rawTokenQtys.baseTokenQty, this.baseToken.decimals),
      quoteTokenQty: this.toBigNumber(rawTokenQtys.quoteTokenQty, this.quoteToken.decimals),
    };
  }

  /**
   * Calculates the number of LP tokens generated given the inputs
   * @param {string | BigNumber | number} baseTokenQty base tokens to contribute
   * @param {string | BigNumber | number} quoteTokenQty quote tokens to contribute
   * @returns BigNumber lp token qty
   */
  async getLPTokenQtyFromTokenQtys(baseTokenQty, quoteTokenQty) {
    const [baseTokenReserveQty, totalSupply, internalBalances] = await Promise.all([
      this.sdk.multicall.enqueue(this.baseToken.abi, this.baseToken.address, 'balanceOf', [
        this.address,
      ]),
      this.sdk.multicall.enqueue(this.abi, this.address, 'totalSupply'),
      this.sdk.multicall.enqueue(this.abi, this.address, 'internalBalances'),
    ]);
    const rawLPTokenQty = getLPTokenQtyFromTokenQtys(
      this.toEthersBigNumber(baseTokenQty, this.baseToken.decimals),
      this.toEthersBigNumber(quoteTokenQty, this.quoteToken.decimals),
      baseTokenReserveQty,
      totalSupply,
      internalBalances,
    );
    return this.toBigNumber(rawLPTokenQty, this._decimals);
  }

  /**
   * Calculates the imbalanceQtys for each token. These represent the opposite of the decay.
   * For example when baseTokenDecay is present, we need to add quote tokens.  This returns
   * the amount of quote tokens needed to be added as `quoteTokenImbalanceQty` when in this state.
   * @returns {obj} {baseTokenImbalanceQty: BigNumber quoteTokenImbalanceQty:BigNumber } the qtys of
   * tokens that need to be added to the system to remove the decay.
   */
  async getTokenImbalanceQtys() {
    const [baseTokenReserveQty, internalBalances] = await Promise.all([
      this.sdk.multicall.enqueue(this.baseToken.abi, this.baseToken.address, 'balanceOf', [
        this.address,
      ]),
      this.sdk.multicall.enqueue(this.abi, this.address, 'internalBalances'),
    ]);

    const tokenImbalancesQtys = getTokenImbalanceQtys(baseTokenReserveQty, internalBalances);

    return {
      baseTokenImbalanceQty: this.toBigNumber(
        tokenImbalancesQtys.baseTokenImbalanceQty,
        this.baseToken.decimals,
      ),
      quoteTokenImbalanceQty: this.toBigNumber(
        tokenImbalancesQtys.quoteTokenImbalanceQty,
        this.quoteToken.decimals,
      ),
    };
  }

  // wraps the transaction in a notification popup and resolves when it has been mined
  async _handleTransaction(tx) {
    this.sdk.notify(tx);
    const receipt = await tx.wait(2);
    return receipt;
  }
}
