// const BigNumber = require("bignumber.js");
import BigNumber from 'bignumber.js';
import { toBigNumber } from './utils.mjs';

const { ROUND_DOWN } = BigNumber;

export const ZERO = toBigNumber('0');
export const INSUFFICIENT_BASE_QTY = new Error('MathLib: INSUFFICIENT_BASE_QTY');
export const INSUFFICIENT_BASE_TOKEN_QTY = new Error('MathLib: INSUFFICIENT_BASE_TOKEN_QTY');
export const INSUFFICIENT_BASE_QTY_DESIRED = new Error('MathLib: INSUFFICIENT_BASE_QTY_DESIRED');
export const INSUFFICIENT_CHANGE_IN_DECAY = new Error('MathLib: INSUFFICIENT_CHANGE_IN_DECAY');
export const INSUFFICIENT_DECAY = new Error('MathLib: INSUFFICIENT_DECAY');
export const INSUFFICIENT_LIQUIDITY = new Error('MathLib: INSUFFICIENT_LIQUIDITY');
export const INSUFFICIENT_QTY = new Error('MathLib: INSUFFICIENT_QTY');
export const INSUFFICIENT_QUOTE_QTY = new Error('MathLib: INSUFFICIENT_QUOTE_QTY');
export const INSUFFICIENT_QUOTE_QTY_DESIRED = new Error('MathLib: INSUFFICIENT_QUOTE_QTY_DESIRED');
export const INSUFFICIENT_QUOTE_TOKEN_QTY = new Error('MathLib: INSUFFICIENT_QUOTE_TOKEN_QTY');
export const INSUFFICIENT_TOKEN_QTY = new Error('MathLib: INSUFFICIENT_TOKEN_QTY');
export const NAN_ERROR = new Error('MathLib: NaN');
export const NEGATIVE_INPUT = new Error('MathLib: NEGATIVE_INPUT');
export const NO_QUOTE_DECAY = new Error('MathLib: NO_QUOTE_DECAY');

export const BASIS_POINTS = toBigNumber('10000');

/**
 * @dev used to calculate the qty of base tokens required and liquidity
 * tokens (deltaRo) to be issued
 * in order to add liquidity and remove base token decay.
 * @param baseTokenQtyDesired the amount of base token the user wants to contribute
 * @param baseTokenQtyMin the minimum amount of base token the user wants to
 * contribute (allows for slippage)
 * @param baseTokenReserveQty the external base token reserve qty prior to this
 * transaction
 * @param totalSupplyOfLiquidityTokens the total supply of our exchange's liquidity
 * tokens (aka Ro)
 * @param internalBalances internal balances struct from our exchange's internal accounting
 *
 * @return {baseTokenQty, liquidityTokenQty}
 * baseTokenQty - qty of base token the user must supply
 * liquidityTokenQty - qty of liquidity tokens to be issued in exchange
 */
export const calculateAddBaseTokenLiquidityQuantities = (
  baseTokenQtyDesired,
  baseTokenQtyMin,
  baseTokenReserveQty,
  totalSupplyOfLiquidityTokens,
  internalBalances,
) => {
  // cleanse input
  const baseTokenQtyDesiredBN = toBigNumber(baseTokenQtyDesired);
  const baseTokenQtyMinBN = toBigNumber(baseTokenQtyMin);
  const baseTokenReserveQtyBN = toBigNumber(baseTokenReserveQty);
  const totalSupplyOfLiquidityTokensBN = toBigNumber(totalSupplyOfLiquidityTokens);
  const internalBalancesBN = internalBalancesBNConverter(internalBalances);

  const maxBaseTokenQty = internalBalancesBN.baseTokenReserveQty.minus(baseTokenReserveQtyBN);

  if (baseTokenQtyMinBN.isGreaterThanOrEqualTo(maxBaseTokenQty)) {
    throw INSUFFICIENT_DECAY;
  }

  let baseTokenQty;
  if (baseTokenQtyDesiredBN.isGreaterThan(maxBaseTokenQty)) {
    baseTokenQty = maxBaseTokenQty;
  } else {
    baseTokenQty = baseTokenQtyDesiredBN;
  }

  // determine the quote token qty decay change quoted on our current ratios
  const internalQuoteToBaseTokenRatio = internalBalancesBN.quoteTokenReserveQty.dividedBy(
    internalBalancesBN.baseTokenReserveQty,
  );

  const quoteTokenQtyDecayChange = baseTokenQty.multipliedBy(internalQuoteToBaseTokenRatio);

  if (quoteTokenQtyDecayChange.isLessThanOrEqualTo(ZERO)) {
    throw INSUFFICIENT_CHANGE_IN_DECAY;
  }

  // we can now calculate the total amount of quote token decay
  const quoteTokenDecay = maxBaseTokenQty.multipliedBy(internalQuoteToBaseTokenRatio);

  if (quoteTokenDecay.isLessThanOrEqualTo(ZERO)) {
    throw NO_QUOTE_DECAY;
  }
  // we are not changing anything about our internal accounting here. We are simply adding tokens
  // to make our internal account "right"...or rather getting the external balances to
  // match our internal
  // quoteTokenReserveQty += quoteTokenQtyDecayChange;
  // baseTokenReserveQty += baseTokenQty;

  const liquidityTokenQty = calculateLiquidityTokenQtyForSingleAssetEntry(
    totalSupplyOfLiquidityTokensBN,
    baseTokenQty,
    internalBalancesBN.baseTokenReserveQty,
    quoteTokenQtyDecayChange,
    quoteTokenDecay,
  );

  const baseAndLiquidityTokenQty = {
    baseTokenQty,
    liquidityTokenQty,
  };

  return baseAndLiquidityTokenQty;
};

/**
 * @dev used to calculate the qty of tokens a user will need to contribute and be issued in
 * order to add liquidity
 * @param baseTokenQtyDesired the amount of base token the user wants to contribute
 * @param quoteTokenQtyDesired the amount of quote token the user wants to contribute
 * @param baseTokenQtyMin the minimum amount of base token the user wants to contribute
 * (allows for slippage)
 * @param quoteTokenQtyMin the minimum amount of quote token the user wants to contribute
 * (allows for slippage)
 * @param baseTokenReserveQty the external base token reserve qty prior to this transaction
 * @param quoteTokenReserveQty the external quote token reserve qty prior to this transaction
 * @param totalSupplyOfLiquidityTokens the total supply of our exchange's liquidity tokens (aka Ro)
 * @param internalBalances internal balances struct from our exchange's internal accounting
 * internalBalances = {
 *  baseTokenReserveQty: ZERO,
 *  quoteTokenReserveQty: ZERO,
 *  kLast: ZERO
 *
 * @return tokenQtys = {baseTokenQty, quoteTokenQty, liquidityTokenQty} - qty of tokens
 * needed to complete transaction
 */
export const calculateAddLiquidityQuantities = (
  baseTokenQtyDesired,
  quoteTokenQtyDesired,
  baseTokenQtyMin,
  quoteTokenQtyMin,
  baseTokenReserveQty,
  quoteTokenReserveQty,
  totalSupplyOfLiquidityTokens,
  internalBalances,
) => {
  // cleanse input
  const baseTokenQtyDesiredBN = toBigNumber(baseTokenQtyDesired);
  const quoteTokenQtyDesiredBN = toBigNumber(quoteTokenQtyDesired);
  const baseTokenQtyMinBN = toBigNumber(baseTokenQtyMin);
  const quoteTokenQtyMinBN = toBigNumber(quoteTokenQtyMin);
  const baseTokenReserveQtyBN = toBigNumber(baseTokenReserveQty);
  const quoteTokenReserveQtyBN = toBigNumber(quoteTokenReserveQty);
  let totalSupplyOfLiquidityTokensBN = toBigNumber(totalSupplyOfLiquidityTokens);
  const internalBalancesBN = internalBalancesBNConverter(internalBalances);

  const tokenQtys = {
    baseTokenQty: ZERO,
    quoteTokenQty: ZERO,
    liquidityTokenQty: ZERO,
    liquidityTokenFeeQty: ZERO,
  };

  if (totalSupplyOfLiquidityTokensBN.isGreaterThan(ZERO)) {
    // we have outstanding liquidity tokens present and an existing price curve

    tokenQtys.liquidityTokenFeeQty = calculateLiquidityTokenFees(
      totalSupplyOfLiquidityTokensBN,
      internalBalancesBN,
    );

    // we need to take this amount (that will be minted) into account for below calculations
    totalSupplyOfLiquidityTokensBN = tokenQtys.liquidityTokenFeeQty.plus(
      totalSupplyOfLiquidityTokensBN,
    );

    // confirm that we have no beta or alpha decay present
    // if we do, we need to resolve that first

    if (isSufficientDecayPresent(baseTokenReserveQtyBN, internalBalancesBN)) {
      // decay is present and needs to be dealt with by the caller.

      let baseTokenQtyFromDecay = ZERO;
      let quoteTokenQtyFromDecay = ZERO;
      let liquidityTokenQtyFromDecay = ZERO;

      if (baseTokenReserveQtyBN.isGreaterThan(internalBalancesBN.baseTokenReserveQty)) {
        // we have more base token than expected (base token decay) due to rebase up
        // we first need to handle this situation by requiring this user
        // to add quote tokens
        const fetchCalculateAddQuoteTokenLiquidityQuantities =
          calculateAddQuoteTokenLiquidityQuantities(
            quoteTokenQtyDesiredBN,
            ZERO, // there is no minimum for this particular call since we may use
            // quote tokens later.
            baseTokenReserveQtyBN,
            totalSupplyOfLiquidityTokensBN,
            internalBalancesBN,
          );
        quoteTokenQtyFromDecay = fetchCalculateAddQuoteTokenLiquidityQuantities.quoteTokenQty;
        liquidityTokenQtyFromDecay =
          fetchCalculateAddQuoteTokenLiquidityQuantities.liquidityTokenQty;
        tokenQtys.quoteTokenQty = tokenQtys.quoteTokenQty.plus(quoteTokenQtyFromDecay);
        tokenQtys.liquidityTokenQty = tokenQtys.liquidityTokenQty.plus(liquidityTokenQtyFromDecay);
      } else {
        // we have less base token than expected (quote token decay) due to a rebase down
        // we first need to handle this by adding base tokens to offset this.

        const fetchCalculateAddBaseTokenLiquidityQuantities =
          calculateAddBaseTokenLiquidityQuantities(
            baseTokenQtyDesiredBN,
            ZERO, // there is no minimum for this particular call since we may use quote
            // tokens later.
            baseTokenReserveQtyBN,
            totalSupplyOfLiquidityTokensBN,
            internalBalancesBN,
          );

        // {baseTokenQty, liquidityTokenQty}
        baseTokenQtyFromDecay = fetchCalculateAddBaseTokenLiquidityQuantities.baseTokenQty;
        liquidityTokenQtyFromDecay =
          fetchCalculateAddBaseTokenLiquidityQuantities.liquidityTokenQty;

        tokenQtys.baseTokenQty = tokenQtys.baseTokenQty.plus(baseTokenQtyFromDecay);
        tokenQtys.liquidityTokenQty = tokenQtys.liquidityTokenQty.plus(liquidityTokenQtyFromDecay);
      }

      if (
        quoteTokenQtyFromDecay.isLessThan(quoteTokenQtyDesiredBN) &&
        baseTokenQtyFromDecay.isLessThan(baseTokenQtyDesiredBN)
      ) {
        // the user still has qty that they desire to contribute to the exchange for liquidity

        const fetchTokenQty = calculateAddTokenPairLiquidityQuantities(
          baseTokenQtyDesiredBN.minus(baseTokenQtyFromDecay),
          quoteTokenQtyDesiredBN.minus(quoteTokenQtyFromDecay),
          ZERO,
          ZERO,
          quoteTokenReserveQtyBN.plus(quoteTokenQtyFromDecay),
          totalSupplyOfLiquidityTokensBN.plus(liquidityTokenQtyFromDecay),
          internalBalancesBN, // NOTE: these balances have already been updated when we
          // did the decay math.
        );

        tokenQtys.baseTokenQty = fetchTokenQty.baseTokenQty;
        tokenQtys.quoteTokenQty = fetchTokenQty.quoteTokenQty;
        tokenQtys.liquidityTokenQty = fetchTokenQty.liquidityTokenQty;
        tokenQtys.baseTokenQty = tokenQtys.baseTokenQty.plus(baseTokenQtyFromDecay);
        tokenQtys.quoteTokenQty = tokenQtys.quoteTokenQty.plus(quoteTokenQtyFromDecay);
        tokenQtys.liquidityTokenQty = tokenQtys.liquidityTokenQty.plus(liquidityTokenQtyFromDecay);

        if (tokenQtys.baseTokenQty.isLessThan(baseTokenQtyMinBN)) {
          throw INSUFFICIENT_BASE_QTY;
        }
        if (tokenQtys.quoteTokenQty.isLessThan(quoteTokenQtyMinBN)) {
          throw INSUFFICIENT_QUOTE_QTY;
        }
      }

      return tokenQtys;
    }
    // the user is just doing a simple double asset entry / providing both base and quote.

    const fetchTokenQtys = calculateAddTokenPairLiquidityQuantities(
      baseTokenQtyDesiredBN,
      quoteTokenQtyDesiredBN,
      baseTokenQtyMinBN,
      quoteTokenQtyMinBN,
      quoteTokenReserveQtyBN,
      totalSupplyOfLiquidityTokensBN,
      internalBalancesBN,
    );
    tokenQtys.baseTokenQty = fetchTokenQtys.baseTokenQty;
    tokenQtys.quoteTokenQty = fetchTokenQtys.quoteTokenQty;
    tokenQtys.liquidityTokenQty = fetchTokenQtys.liquidityTokenQty;

    return tokenQtys;
  }
  // this user will set the initial pricing curve
  if (baseTokenQtyDesiredBN.isLessThanOrEqualTo(ZERO)) {
    throw INSUFFICIENT_BASE_QTY_DESIRED;
  }
  if (quoteTokenQtyDesiredBN.isLessThanOrEqualTo(ZERO)) {
    throw INSUFFICIENT_QUOTE_QTY_DESIRED;
  }

  tokenQtys.baseTokenQty = baseTokenQtyDesiredBN;
  tokenQtys.quoteTokenQty = quoteTokenQtyDesiredBN;
  tokenQtys.liquidityTokenQty = baseTokenQtyDesiredBN.multipliedBy(quoteTokenQtyDesiredBN).sqrt();

  internalBalancesBN.baseTokenReserveQty = internalBalancesBN.baseTokenReserveQty.plus(
    tokenQtys.baseTokenQty,
  );
  internalBalancesBN.quoteTokenReserveQty = internalBalancesBN.quoteTokenReserveQty.plus(
    tokenQtys.quoteTokenQty,
  );
  return tokenQtys;
};

/**
 * @dev used to calculate the qty of quote token required and liquidity tokens (deltaRo)
 * to be issued
 * in order to add liquidity and remove base token decay.
 * @param quoteTokenQtyDesired the amount of quote token the user wants to contribute
 * @param quoteTokenQtyMin the minimum amount of quote token the user wants to contribute
 * (allows for slippage)
 * @param baseTokenReserveQty the external base token reserve qty prior to this transaction
 * @param totalSupplyOfLiquidityTokens the total supply of our exchange's liquidity tokens (aka Ro)
 * @param internalBalances internal balances struct from our exchange's internal accounting
 *
 *
 * @returns {quoteTokenQty, liquidityTokenQty}
 * quoteTokenQty - qty of quote token the user must supply
 * liquidityTokenQty -  qty of liquidity tokens to be issued in exchange
 */
export const calculateAddQuoteTokenLiquidityQuantities = (
  quoteTokenQtyDesired,
  quoteTokenQtyMin,
  baseTokenReserveQty,
  totalSupplyOfLiquidityTokens,
  internalBalances,
) => {
  // cleanse input
  const quoteTokenQtyDesiredBN = toBigNumber(quoteTokenQtyDesired);
  const quoteTokenQtyMinBN = toBigNumber(quoteTokenQtyMin);
  const baseTokenReserveQtyBN = toBigNumber(baseTokenReserveQty);
  const totalSupplyOfLiquidityTokensBN = toBigNumber(totalSupplyOfLiquidityTokens);
  const internalBalancesBN = internalBalancesBNConverter(internalBalances);

  const baseTokenDecay = baseTokenReserveQtyBN.minus(internalBalancesBN.baseTokenReserveQty);

  // omega - X/Y
  const internalBaseTokenToQuoteTokenRatio = internalBalancesBN.baseTokenReserveQty.dividedBy(
    internalBalancesBN.quoteTokenReserveQty,
  );

  // alphaDecay / omega (A/B)
  const maxQuoteTokenQty = baseTokenDecay.dividedBy(internalBaseTokenToQuoteTokenRatio);

  if (quoteTokenQtyMinBN.isGreaterThanOrEqualTo(maxQuoteTokenQty)) {
    throw INSUFFICIENT_DECAY;
  }
  // deltaBeta
  let quoteTokenQty;
  if (quoteTokenQtyDesiredBN > maxQuoteTokenQty) {
    quoteTokenQty = maxQuoteTokenQty;
  } else {
    quoteTokenQty = quoteTokenQtyDesiredBN;
  }

  const baseTokenQtyDecayChange = quoteTokenQty.multipliedBy(internalBaseTokenToQuoteTokenRatio);

  if (baseTokenQtyDecayChange.isLessThanOrEqualTo(ZERO)) {
    throw INSUFFICIENT_DECAY;
  }
  // x += alphaDecayChange
  // y += deltaBeta

  internalBalancesBN.baseTokenReserveQty =
    internalBalancesBN.baseTokenReserveQty.plus(baseTokenQtyDecayChange);
  internalBalancesBN.quoteTokenReserveQty =
    internalBalancesBN.quoteTokenReserveQty.plus(quoteTokenQty);

  const liquidityTokenQty = calculateLiquidityTokenQtyForSingleAssetEntry(
    totalSupplyOfLiquidityTokensBN,
    quoteTokenQty,
    internalBalancesBN.quoteTokenReserveQty,
    baseTokenQtyDecayChange,
    baseTokenDecay,
  );

  const quoteAndLiquidityTokenQty = {
    quoteTokenQty,
    liquidityTokenQty,
  };
  return quoteAndLiquidityTokenQty;
};

/**
 * @dev calculates the qty of base and quote tokens required and liquidity tokens (deltaRo)
 * to be issued
 * in order to add liquidity when no decay is present.
 * @param baseTokenQtyDesired the amount of base token the user wants to contribute
 * @param quoteTokenQtyDesired the amount of quote token the user wants to contribute
 * @param baseTokenQtyMin the minimum amount of base token the user wants to contribute
 * (allows for slippage)
 * @param quoteTokenQtyMin the minimum amount of quote token the user wants to contribute
 * (allows for slippage)
 * @param quoteTokenReserveQty the external quote token reserve qty prior to this transaction
 * @param totalSupplyOfLiquidityTokens the total supply of our exchange's liquidity tokens (aka Ro)
 * @param internalBalances internal balances struct from our exchange's internal accounting
 *
 * @return baseTokenQty qty of base token the user must supply
 * @return quoteTokenQty qty of quote token the user must supply
 * @return liquidityTokenQty qty of liquidity tokens to be issued in exchange
 */
export const calculateAddTokenPairLiquidityQuantities = (
  baseTokenQtyDesired,
  quoteTokenQtyDesired,
  baseTokenQtyMin,
  quoteTokenQtyMin,
  quoteTokenReserveQty,
  totalSupplyOfLiquidityTokens,
  internalBalances,
) => {
  // cleanse input
  const baseTokenQtyDesiredBN = toBigNumber(baseTokenQtyDesired);
  const quoteTokenQtyDesiredBN = toBigNumber(quoteTokenQtyDesired);
  const baseTokenQtyMinBN = toBigNumber(baseTokenQtyMin);
  const quoteTokenQtyMinBN = toBigNumber(quoteTokenQtyMin);
  const quoteTokenReserveQtyBN = toBigNumber(quoteTokenReserveQty);
  const totalSupplyOfLiquidityTokensBN = toBigNumber(totalSupplyOfLiquidityTokens);
  const internalBalancesBN = internalBalancesBNConverter(internalBalances);

  let baseTokenQty;
  let quoteTokenQty;

  const requiredQuoteTokenQty = calculateQty(
    baseTokenQtyDesiredBN,
    internalBalancesBN.baseTokenReserveQty,
    internalBalancesBN.quoteTokenReserveQty,
  );

  if (requiredQuoteTokenQty.isLessThanOrEqualTo(quoteTokenQtyDesiredBN)) {
    // user has to provide less than their desired amount
    if (requiredQuoteTokenQty.isLessThan(quoteTokenQtyMinBN)) {
      throw INSUFFICIENT_QUOTE_QTY;
    }
    baseTokenQty = baseTokenQtyDesiredBN;
    quoteTokenQty = requiredQuoteTokenQty;
  } else {
    // we need to check the opposite way.
    const requiredBaseTokenQty = calculateQty(
      quoteTokenQtyDesiredBN,
      internalBalancesBN.quoteTokenReserveQty,
      internalBalancesBN.baseTokenReserveQty,
    );
    if (requiredBaseTokenQty.isLessThan(baseTokenQtyMinBN)) {
      throw INSUFFICIENT_BASE_QTY;
    }
    baseTokenQty = requiredBaseTokenQty;
    quoteTokenQty = quoteTokenQtyDesiredBN;
  }

  const liquidityTokenQty = calculateLiquidityTokenQtyForDoubleAssetEntry(
    totalSupplyOfLiquidityTokensBN,
    quoteTokenQty,
    quoteTokenReserveQtyBN,
  );

  internalBalancesBN.baseTokenReserveQty = baseTokenQty.plus(
    internalBalancesBN.baseTokenReserveQty,
  );
  internalBalancesBN.quoteTokenReserveQty = quoteTokenQty.plus(
    internalBalancesBN.quoteTokenReserveQty,
  );

  const baseQuoteLiquidityTokenQty = {
    baseTokenQty,
    quoteTokenQty,
    liquidityTokenQty,
  };

  return baseQuoteLiquidityTokenQty;
};

/**
 * @dev calculates the qty of base tokens a user will receive for swapping their quote
 * tokens (less fees)
 * @param quoteTokenQty the amount of quote tokens the user wants to swap
 * @param baseTokenQtyMin the minimum about of base tokens they are willing to receive in
 * return (slippage)
 * @param baseTokenReserveQty the external base token reserve qty prior to this transaction
 * @param liquidityFeeInBasisPoints the current total liquidity fee represented as an integer
 * of basis points
 * @param internalBalances internal balances struct from our exchange's internal accounting
 *
 * @return baseTokenQty qty of base token the user will receive back
 */
export const calculateBaseTokenQty = (
  quoteTokenQty,
  baseTokenQtyMin,
  baseTokenReserveQty,
  liquidityFeeInBasisPoints,
  internalBalances,
) => {
  // cleanse inputs
  const quoteTokenQtyBN = toBigNumber(quoteTokenQty);
  const baseTokenQtyMinBN = toBigNumber(baseTokenQtyMin);
  const baseTokenReserveQtyBN = toBigNumber(baseTokenReserveQty);
  const liquidityFeeInBasisPointsBN = toBigNumber(liquidityFeeInBasisPoints);
  const internalBalancesBN = internalBalancesBNConverter(internalBalances);

  let baseTokenQty = ZERO;

  if (
    baseTokenReserveQtyBN.isLessThan(ZERO) &&
    internalBalancesBN.baseTokenReserveQty.isLessThan(ZERO)
  ) {
    throw INSUFFICIENT_BASE_TOKEN_QTY;
  }

  // check to see if we have experienced quote token Decay / a rebase down event
  if (baseTokenReserveQtyBN.isLessThan(internalBalancesBN.baseTokenReserveQty)) {
    // we have less reserves than our current price curve will expect, we need to adjust the curve
    const pricingRatio = internalBalancesBN.baseTokenReserveQty.dividedBy(
      internalBalancesBN.quoteTokenReserveQty,
    );
    //    ^ is Omega

    const impliedQuoteTokenQty = baseTokenReserveQtyBN.dividedBy(pricingRatio);
    baseTokenQty = calculateQtyToReturnAfterFees(
      quoteTokenQtyBN,
      impliedQuoteTokenQty,
      baseTokenReserveQtyBN,
      liquidityFeeInBasisPointsBN,
    );
  } else {
    // we have the same or more reserves, no need to alter the curve.
    baseTokenQty = calculateQtyToReturnAfterFees(
      quoteTokenQtyBN,
      internalBalancesBN.quoteTokenReserveQty,
      internalBalancesBN.baseTokenReserveQty,
      liquidityFeeInBasisPointsBN,
    );
  }

  if (baseTokenQty.isLessThanOrEqualTo(baseTokenQtyMinBN)) {
    throw INSUFFICIENT_BASE_TOKEN_QTY;
  }
  internalBalancesBN.baseTokenReserveQty =
    internalBalancesBN.baseTokenReserveQty.minus(baseTokenQty);
  internalBalancesBN.quoteTokenReserveQty =
    internalBalancesBN.quoteTokenReserveQty.plus(quoteTokenQtyBN);

  return baseTokenQty;
};

/**
 * @dev calculates the current exchange rate (X/Y)
 * @param inputTokenReserveQty - The reserve qty of the X token (the baseToken) (the
 * elastic token, in an elastic pair)
 * @param outputTokenReserveQty -The reserve qty of the Y token (the quoteToken) (the
 * non-elastic token, in an elastic pair)
 * @returns exchangeRate - the current exchange rate
 */

export const calculateExchangeRate = (inputTokenReserveQty, outputTokenReserveQty) => {
  // cleanse input
  const inputTokenReserveQtyBN = toBigNumber(inputTokenReserveQty);
  const outputTokenReserveQtyBN = toBigNumber(outputTokenReserveQty);

  if (inputTokenReserveQtyBN.isNaN() || outputTokenReserveQtyBN.isNaN()) {
    throw NAN_ERROR;
  }

  if (inputTokenReserveQtyBN.isNegative() || outputTokenReserveQtyBN.isNegative()) {
    throw NEGATIVE_INPUT;
  }

  if (inputTokenReserveQtyBN.isEqualTo(ZERO) || outputTokenReserveQtyBN.isEqualTo(ZERO)) {
    throw INSUFFICIENT_LIQUIDITY;
  }

  const exchangeRate = inputTokenReserveQtyBN.dividedBy(outputTokenReserveQtyBN);

  return exchangeRate;
};

/**
 * @dev calculates the fees
 * @param feesInBasisPoints - the amount of fees in basis points
 * @param swapAmount - the amount being traded
 * @return fees - the fee amount
 */
export const calculateFees = (feesInBasisPoints, swapAmount) => {
  // cleanse inputs
  const feesInBasisPointsBN = toBigNumber(feesInBasisPoints);
  const swapAmountBN = toBigNumber(swapAmount);

  // NaN case
  if (feesInBasisPointsBN.isNaN() || swapAmountBN.isNaN()) {
    throw NAN_ERROR;
  }

  // negative case
  if (feesInBasisPointsBN.isLessThan(ZERO) || swapAmountBN.isLessThan(ZERO)) {
    throw NEGATIVE_INPUT;
  }

  const fees = feesInBasisPointsBN.dividedBy(BASIS_POINTS).multipliedBy(swapAmountBN);

  return fees;
};

/**
 * @dev calculates the inputAmount given an OutputAmount
 *
 *
 * inputAmount =  - (outputAmount * inputTokenReserveQty * BASIS_POINTS)
 *                -----------------------------------------------------------------
 *                ( outputAmount - outputTokenReserveQty + (outputTokenReserveQty* (slippage/100)) )
 *                  * (BP - liquidityFeeInBasisPoints )
 *
 *
 * @param  outputTokenAmount - The amount user wants to receive after fees and slippage
 * @param inputTokenReserveQty - The reserve quantity of the inputToken
 * @param outputTokenReserveQty - The reserve quantity of the output
 * @param  slippagePercent - The percentage of the slippage
 * @param liquidityFeeInBasisPoints - The liquidity fee in BasisPoints
 * @returns inputAmountFromOutputAmount
 */
export const calculateInputAmountFromOutputAmount = (
  outputTokenAmount,
  inputTokenReserveQty,
  outputTokenReserveQty,
  slippagePercent,
  liquidityFeeInBasisPoints,
) => {
  // cleanse input to BN
  const outputTokenAmountBN = toBigNumber(outputTokenAmount);
  const inputTokenReserveQtyBN = toBigNumber(inputTokenReserveQty);
  const outputTokenReserveQtyBN = toBigNumber(outputTokenReserveQty);
  const slippagePercentBN = toBigNumber(slippagePercent);
  const liquidityFeeInBasisPointsBN = toBigNumber(liquidityFeeInBasisPoints);

  if (
    outputTokenAmountBN.isNaN() ||
    inputTokenReserveQtyBN.isNaN() ||
    outputTokenReserveQtyBN.isNaN() ||
    slippagePercentBN.isNaN() ||
    liquidityFeeInBasisPointsBN.isNaN()
  ) {
    throw NAN_ERROR;
  }

  if (
    outputTokenAmountBN.isNegative() ||
    inputTokenReserveQtyBN.isNegative() ||
    outputTokenReserveQtyBN.isNegative() ||
    slippagePercentBN.isNegative() ||
    liquidityFeeInBasisPointsBN.isNegative()
  ) {
    throw NEGATIVE_INPUT;
  }

  if (inputTokenReserveQtyBN.isEqualTo(ZERO) || outputTokenReserveQtyBN.isEqualTo(ZERO)) {
    throw INSUFFICIENT_LIQUIDITY;
  }

  const numerator = outputTokenAmountBN
    .multipliedBy(inputTokenReserveQtyBN)
    .multipliedBy(BASIS_POINTS)
    .dp(18, ROUND_DOWN);

  const basisPointDifference = BASIS_POINTS.minus(liquidityFeeInBasisPointsBN);

  const outputSlippageMultiplier = outputTokenReserveQtyBN
    .multipliedBy(slippagePercentBN.dividedBy(toBigNumber(100)))
    .dp(18, ROUND_DOWN);

  const outputSlippageTerm = outputTokenAmountBN
    .plus(outputSlippageMultiplier)
    .minus(outputTokenReserveQtyBN)
    .dp(18, ROUND_DOWN);

  const denominator = outputSlippageTerm.multipliedBy(basisPointDifference);

  const inputAmountFromOutputAmount = numerator.dividedBy(denominator).abs();

  return inputAmountFromOutputAmount;
};

/**
 * @dev calculates the qty of liquidity tokens that should be sent to the DAO due to the
 * growth in K from trading.
 * The DAO takes 1/6 of the total fees (30BP total fee, 25 BP to lps and 5 BP to the DAO)
 * @param totalSupplyOfLiquidityTokens the total supply of our exchange's liquidity tokens (aka Ro)
 * @param internalBalances internal balances struct from our exchange's internal accounting
 *
 * @return liquidityTokenFeeQty qty of tokens to be minted to the fee address for the growth in K
 */
export const calculateLiquidityTokenFees = (totalSupplyOfLiquidityTokens, internalBalances) => {
  // cleanse inputs
  const totalSupplyOfLiquidityTokensBN = toBigNumber(totalSupplyOfLiquidityTokens);
  const internalBalancesBN = internalBalancesBNConverter(internalBalances);

  const rootK = internalBalancesBN.baseTokenReserveQty
    .multipliedBy(internalBalancesBN.quoteTokenReserveQty)
    .sqrt();
  const rootKLast = internalBalancesBN.kLast.sqrt();

  let liquidityTokenFeeQty = ZERO;

  if (rootK.isGreaterThan(rootKLast)) {
    const numerator = totalSupplyOfLiquidityTokensBN.multipliedBy(rootK.minus(rootKLast));
    const denominator = rootK.multipliedBy(toBigNumber(5)).plus(rootKLast);
    liquidityTokenFeeQty = numerator.dividedBy(denominator);
    return liquidityTokenFeeQty;
  }

  return liquidityTokenFeeQty;
};

/**
 * @dev used to calculate the qty of liquidity tokens (deltaRo) we will be issued to a supplier
 * of a single asset entry when decay is present.
 * @param totalSupplyOfLiquidityTokens the total supply of our exchange's liquidity tokens (aka Ro)
 * @param quoteTokenQty the amount of quote token the user it adding to the pool (deltaB or deltaY)
 * @param quoteTokenReserveBalance the total balance (external) of quote tokens in our pool (Beta)
 *
 * @return liquidityTokenQty qty of liquidity tokens to be issued in exchange
 */
export const calculateLiquidityTokenQtyForDoubleAssetEntry = (
  totalSupplyOfLiquidityTokens,
  quoteTokenQty,
  quoteTokenReserveBalance,
) => {
  // cleanse the input
  const totalSupplyOfLiquidityTokensBN = toBigNumber(totalSupplyOfLiquidityTokens);
  const quoteTokenQtyBN = toBigNumber(quoteTokenQty);
  const quoteTokenReserveBalanceBN = toBigNumber(quoteTokenReserveBalance);

  /*

  # liquidityTokens - Ro
  # ΔRo =  (ΔY/Y) * Ro

  # deltaRo =  _quoteTokenQty  * _totalSupplyOfLiquidityTokens
              ------------------------------------------
                  _quoteTokenReserveBalance

  */
  const numerator = quoteTokenQtyBN.multipliedBy(totalSupplyOfLiquidityTokensBN).dp(18, ROUND_DOWN);
  const deltaLiquidityTokenQty = numerator.dividedBy(quoteTokenReserveBalanceBN).dp(18, ROUND_DOWN);

  return deltaLiquidityTokenQty;
};

/**
 * @dev used to calculate the qty of liquidity tokens (deltaRo) we will be issued to a supplier
 * of a single asset entry when decay is present.
 * @param totalSupplyOfLiquidityTokens the total supply of our exchange's liquidity tokens (aka Ro)
 * @param tokenQtyAToAdd the amount of tokens being added by the caller to remove the current decay
 * @param internalTokenAReserveQty the internal balance (X or Y) of token A as a result
 * of this transaction
 * @param tokenBDecayChange the change that will occur in the decay in the opposite token
 * as a result of
 * this transaction
 * @param tokenBDecay the amount of decay in tokenB
 *
 * @return liquidityTokenQty qty of liquidity tokens to be issued in exchange
 */
export const calculateLiquidityTokenQtyForSingleAssetEntry = (
  totalSupplyOfLiquidityTokens,
  tokenQtyAToAdd,
  internalTokenAReserveQty,
  tokenBDecayChange,
  tokenBDecay,
) => {
  // cleanse input to BN
  const totalSupplyOfLiquidityTokensBN = toBigNumber(totalSupplyOfLiquidityTokens);
  const tokenQtyAToAddBN = toBigNumber(tokenQtyAToAdd);
  const internalTokenAReserveQtyBN = toBigNumber(internalTokenAReserveQty);
  const tokenBDecayChangeBN = toBigNumber(tokenBDecayChange);
  const tokenBDecayBN = toBigNumber(tokenBDecay);
  const aTokenDiv = tokenQtyAToAddBN.dividedBy(internalTokenAReserveQtyBN);
  const bTokenWADMul = tokenBDecayChangeBN;
  const aAndBDecayMul = aTokenDiv.multipliedBy(bTokenWADMul);
  const AAndBDecayMulDivByTokenBDecay = aAndBDecayMul.dividedBy(tokenBDecayBN);
  const altWGamma = AAndBDecayMulDivByTokenBDecay.dividedBy(toBigNumber(2)).dp(18, ROUND_DOWN);
  // /*

  // # gamma = deltaY / Y' / 2 * (deltaX / alphaDecay')

  //             deltaY  *   deltaX * 2
  // # gamma =  ------------------------
  //               Y'    *   alphaDecay'

  // */

  /*

  # liquidityTokens - Ro
  # ΔRo = (Ro/(1 - γ)) * γ

  # deltaRo =  totalSupplyOfLiquidityTokens  * gamma
              ------------------------------------------
                  ( 1 - gamma )

  */
  const liquidityTokenQty = totalSupplyOfLiquidityTokensBN
    .multipliedBy(altWGamma)
    .dividedBy(toBigNumber(1).minus(altWGamma))
    .dp(0, ROUND_DOWN);
  return liquidityTokenQty;
};

/**
 * @dev calculates expected Ro amount based on inputs
 * @param  quoteTokenAmount The amount of quote token the user wants to provide for liquidity
 * @param  baseTokenAmount The amount of base token the user wants to provide for liquidity
 * @param  quoteTokenReserveQty
 * @param  baseTokenReserveQty
 * @param  decay
 * @param  slippage percentage
 * @param totalSupplyOfLiquidityTokens
 * @param internalBalances - internal balances struct from the exchange's internal accounting
 * internalBalances - {
 *  baseTokenReserveQty:
 *  quoteTokenReserveQty:
 *  kLast:
 *  }
 */
export const calculateLPTokenAmount = (
  quoteTokenAmount,
  baseTokenAmount,
  quoteTokenReserveQty,
  baseTokenReserveQty,
  slippage,
  totalSupplyOfLiquidityTokens,
  internalBalances,
) => {
  // cleanse input
  // the amount of quote token the user wants to contribute
  const quoteTokenAmountBN = toBigNumber(quoteTokenAmount);

  // the amount of base token the user wants to contribute
  const baseTokenAmountBN = toBigNumber(baseTokenAmount);

  const quoteTokenReserveQtyBN = toBigNumber(quoteTokenReserveQty);
  const baseTokenReserveQtyBN = toBigNumber(baseTokenReserveQty);
  const slippageBN = toBigNumber(slippage);
  const totalSupplyOfLiquidityTokensBN = toBigNumber(totalSupplyOfLiquidityTokens);
  const cleansedInternalBalancesBN = internalBalancesBNConverter(internalBalances);

  // NaN cases
  if (
    quoteTokenAmountBN.isNaN() ||
    baseTokenAmountBN.isNaN() ||
    quoteTokenReserveQtyBN.isNaN() ||
    baseTokenReserveQtyBN.isNaN() ||
    slippageBN.isNaN() ||
    totalSupplyOfLiquidityTokensBN.isNaN()
  ) {
    throw NAN_ERROR;
  }

  // Negative cases
  if (
    quoteTokenAmountBN.isLessThan(ZERO) ||
    baseTokenAmountBN.isLessThan(ZERO) ||
    quoteTokenReserveQtyBN.isLessThan(ZERO) ||
    baseTokenReserveQtyBN.isLessThan(ZERO) ||
    slippageBN.isLessThan(ZERO) ||
    totalSupplyOfLiquidityTokensBN.isLessThan(ZERO)
  ) {
    throw NEGATIVE_INPUT;
  }

  const slippageMultiplier = toBigNumber('1').minus(slippageBN.dividedBy(100));

  // the minimum amount of quote token the user wants to contribute (allows for slippage)
  const quoteTokenAmountLessSlippage = quoteTokenAmountBN.multipliedBy(slippageMultiplier);

  // the minimum amount of base token the user wants to contribute (allows for slippage)
  const baseTokenAmountLessSlippage = baseTokenAmountBN.multipliedBy(slippageMultiplier);

  const tokenQtys = calculateAddLiquidityQuantities(
    baseTokenAmountBN,
    quoteTokenAmountBN,
    baseTokenAmountLessSlippage,
    quoteTokenAmountLessSlippage,
    baseTokenReserveQtyBN,
    quoteTokenReserveQtyBN,
    totalSupplyOfLiquidityTokensBN,
    cleansedInternalBalancesBN,
  );
  return tokenQtys.liquidityTokenQty;
};

/**
 * @dev calculates the min amount of output tokens given the slippage percent supplied
 * @param inputTokenAmount base or quote token qty to be swapped by the trader
 * @param inputTokenReserveQty current reserve qty of the base or quote token (same token as tokenA)
 * @param outputTokenReserveQty current reserve qty of the other base or quote token (not tokenA)
 * @param slippagePercent the percentage of slippage
 * @param feeAmount the total amount of fees in Basis points for the trade
 * @returns outputAmountLessSlippage
 */
export const calculateOutputAmountLessFees = (
  inputTokenAmount,
  inputTokenReserveQty,
  outputTokenReserveQty,
  slippagePercent,
  feeAmount,
) => {
  // cleanse input to BN
  const inputTokenAmountBN = toBigNumber(inputTokenAmount);
  const inputTokenReserveQtyBN = toBigNumber(inputTokenReserveQty);
  const outputTokenReserveQtyBN = toBigNumber(outputTokenReserveQty);
  const slippagePercentBN = toBigNumber(slippagePercent);
  const feeAmountBN = toBigNumber(feeAmount);

  if (
    inputTokenAmountBN.isNaN() ||
    inputTokenReserveQtyBN.isNaN() ||
    outputTokenReserveQtyBN.isNaN() ||
    slippagePercentBN.isNaN() ||
    feeAmountBN.isNaN()
  ) {
    throw NAN_ERROR;
  }

  if (
    inputTokenAmountBN.isNegative() ||
    inputTokenReserveQtyBN.isNegative() ||
    outputTokenReserveQtyBN.isNegative() ||
    slippagePercentBN.isNegative() ||
    feeAmountBN.isNegative()
  ) {
    throw NEGATIVE_INPUT;
  }

  if (inputTokenReserveQtyBN.isEqualTo(ZERO) || outputTokenReserveQtyBN.isEqualTo(ZERO)) {
    throw INSUFFICIENT_LIQUIDITY;
  }

  const outputAmount = calculateQtyToReturnAfterFees(
    inputTokenAmountBN,
    inputTokenReserveQtyBN,
    outputTokenReserveQtyBN,
    feeAmountBN,
  );

  // slippage multiplier = 1 - (slippage% / 100)
  const slippageMultiplier = toBigNumber(1).minus(slippagePercentBN.dividedBy(toBigNumber(100)));

  // outputAmountLessSlippage = outputamount * slippage multiplier
  const outputAmountLessSlippage = outputAmount.multipliedBy(slippageMultiplier);

  return outputAmountLessSlippage;
};

/**
 * @dev used to calculate the qty of token a liquidity provider
 * must add in order to maintain the current reserve ratios
 * @param tokenAQty base or quote token qty to be supplied by the liquidity provider
 * @param tokenAReserveQty current reserve qty of the base or quote token (same token as tokenA)
 * @param tokenBReserveQty current reserve qty of the other base or quote token (not tokenA)
 * @return tokenBQty
 */
export const calculateQty = (tokenAQty, tokenAReserveQty, tokenBReserveQty) => {
  // cleanse input
  const tokenAQtyBN = toBigNumber(tokenAQty);
  const tokenAReserveQtyBN = toBigNumber(tokenAReserveQty);
  const tokenBReserveQtyBN = toBigNumber(tokenBReserveQty);

  if (tokenAQtyBN.isLessThanOrEqualTo(ZERO)) {
    throw INSUFFICIENT_QTY;
  }
  if (
    tokenAReserveQtyBN.isLessThanOrEqualTo(ZERO) ||
    tokenBReserveQtyBN.isLessThanOrEqualTo(ZERO)
  ) {
    throw INSUFFICIENT_LIQUIDITY;
  }
  const tokenBQty = tokenAQtyBN
    .multipliedBy(tokenBReserveQtyBN)
    .dividedBy(tokenAReserveQtyBN)
    .dp(18, ROUND_DOWN);
  return tokenBQty;
};

/**
 * @dev used to calculate the qty of token a trader will receive (less fees)
 * given the qty of token A they are providing
 * @param tokenASwapQty base or quote token qty to be swapped by the trader
 * @param tokenAReserveQty current reserve qty of the base or quote token (same token as tokenA)
 * @param tokenBReserveQty current reserve qty of the other base or quote token (not tokenA)
 * @param liquidityFeeInBasisPoints fee to liquidity providers represented in basis points
 * @return qtyToReturn
 */
export const calculateQtyToReturnAfterFees = (
  tokenASwapQty,
  tokenAReserveQty,
  tokenBReserveQty,
  liquidityFeeInBasisPoints,
) => {
  // cleanse inputs
  const tokenASwapQtyBN = toBigNumber(tokenASwapQty);
  const tokenAReserveQtyBN = toBigNumber(tokenAReserveQty);
  const tokenBReserveQtyBN = toBigNumber(tokenBReserveQty);
  const liquidityFeeInBasisPointsBN = toBigNumber(liquidityFeeInBasisPoints);

  const differenceInBP = BASIS_POINTS.minus(liquidityFeeInBasisPointsBN);
  const tokenASwapQtyLessFee = tokenASwapQtyBN.multipliedBy(differenceInBP).dp(18, ROUND_DOWN);

  const numerator = tokenASwapQtyLessFee.multipliedBy(tokenBReserveQtyBN).dp(18, ROUND_DOWN);
  const denominator = tokenAReserveQtyBN
    .multipliedBy(BASIS_POINTS)
    .dp(18, ROUND_DOWN)
    .plus(tokenASwapQtyLessFee);

  const qtyToReturn = numerator.dividedBy(denominator).dp(0, ROUND_DOWN);

  return qtyToReturn;
};

/**
 * @dev calculates the qty of quote tokens a user will receive for swapping their base
 * tokens (less fees)
 * @param baseTokenQty the amount of bases tokens the user wants to swap
 * @param quoteTokenQtyMin the minimum about of quote tokens they are willing to receive in
 * return (slippage)
 * @param liquidityFeeInBasisPoints the current total liquidity fee represented as an integer
 * of basis points
 * @param internalBalances internal balances struct from our exchange's internal accounting
 *
 * @return quoteTokenQty qty of quote token the user will receive back
 */
export const calculateQuoteTokenQty = (
  baseTokenQty,
  quoteTokenQtyMin,
  liquidityFeeInBasisPoints,
  internalBalances,
) => {
  // cleanse input
  const baseTokenQtyBN = toBigNumber(baseTokenQty);
  const quoteTokenQtyMinBN = toBigNumber(quoteTokenQtyMin);
  const liquidityFeeInBasisPointsBN = toBigNumber(liquidityFeeInBasisPoints);
  const internalBalancesBN = internalBalancesBNConverter(internalBalances);

  let quoteTokenQty = ZERO;

  if (baseTokenQtyBN.isLessThanOrEqualTo(ZERO) && quoteTokenQtyMinBN.isLessThanOrEqualTo(ZERO)) {
    throw INSUFFICIENT_TOKEN_QTY;
  }

  quoteTokenQty = calculateQtyToReturnAfterFees(
    baseTokenQtyBN,
    internalBalancesBN.baseTokenReserveQty,
    internalBalancesBN.quoteTokenReserveQty,
    liquidityFeeInBasisPointsBN,
  );

  if (quoteTokenQty.isLessThanOrEqualTo(quoteTokenQtyMinBN)) {
    throw INSUFFICIENT_QUOTE_TOKEN_QTY;
  }

  internalBalancesBN.baseTokenReserveQty =
    internalBalancesBN.baseTokenReserveQty.plus(baseTokenQtyBN);
  internalBalancesBN.quoteTokenReserveQty =
    internalBalancesBN.quoteTokenReserveQty.minus(quoteTokenQty);

  return quoteTokenQty;
};

/**
 * @dev returns the min amount of each token received by redeeming @param lpTokenQtyToRedeem
 * @param  lpTokenQtyToRedeem - the amount of LP tokens user wants to redeem
 * @param  slippagePercent - the percentage of slippage set by the user
 * @param baseTokenReserveQty - current reserve qty of the base token (the Elastic token if
 * it is an elastic pair)
 * @param  quoteTokenReserveQty - current reserve qty of the quote token (the non-Elastic token
 * if it is an elastic pair)
 * @param  totalLPTokenSupply - current total outstanding qty of the LP token
 * @return   tokenAmounts - The min amounts of each token received by
 * redeeming @param lpTokenQtyToRedeem
 * {
 *  quoteToken: BigNumber
 *  baseToken: Bignumber
 * }
 *
 * Math: (not accounting for slippage)
 * ΔX = α * ΔRo / Ro
 * ΔY = β * ΔRo / Ro
 *
 * where,
 * # ΔRo - The amount of liquidity tokens the liquidity provider wants to exchange
 * # ΔX - The amount of baseToken the liquidity provider receives
 * # ΔY - The amount of quoteTokens the liquidity provider receives
 * # α - The balance of baseToken currently in the exchange
 * # β - The balance of quoteToken currently in the exchange
 *
 * Accounting for slippage:
 * quoteTokenReceived = deltaX * (1 - (slippage/percent))
 * baseTokenReceived = deltaY *  (1 - (slippage/percent))
 */
export const calculateTokenAmountsFromLPTokens = (
  lpTokenQtyToRedeem,
  slippagePercent,
  baseTokenReserveQty,
  quoteTokenReserveQty,
  totalLPTokenSupply,
) => {
  // cleanse inputs
  const lpTokenQtyToRedeemBN = toBigNumber(lpTokenQtyToRedeem);
  const slippagePercentBN = toBigNumber(slippagePercent);
  const baseTokenReserveQtyBN = toBigNumber(baseTokenReserveQty);
  const quoteTokenReserveQtyBN = toBigNumber(quoteTokenReserveQty);
  const totalSupplyLPTokenSupplyBN = toBigNumber(totalLPTokenSupply);

  // NaN cases
  if (
    lpTokenQtyToRedeemBN.isNaN() ||
    slippagePercentBN.isNaN() ||
    baseTokenReserveQtyBN.isNaN() ||
    quoteTokenReserveQtyBN.isNaN() ||
    totalSupplyLPTokenSupplyBN.isNaN()
  ) {
    throw NAN_ERROR;
  }

  // negative cases
  if (
    lpTokenQtyToRedeemBN.isLessThan(ZERO) ||
    slippagePercentBN.isLessThan(ZERO) ||
    baseTokenReserveQtyBN.isLessThan(ZERO) ||
    quoteTokenReserveQtyBN.isLessThan(ZERO) ||
    totalSupplyLPTokenSupplyBN.isLessThan(ZERO)
  ) {
    throw NEGATIVE_INPUT;
  }

  const lpRatio = lpTokenQtyToRedeemBN.dividedBy(totalSupplyLPTokenSupplyBN);
  const slippageMultiplier = toBigNumber(1).minus(slippagePercentBN.dividedBy(toBigNumber(100)));

  const baseTokenRecieved = baseTokenReserveQtyBN.multipliedBy(lpRatio);
  const baseTokenRecievedMin = baseTokenRecieved.multipliedBy(slippageMultiplier);

  const quoteTokenReceived = quoteTokenReserveQtyBN.multipliedBy(lpRatio);
  const quoteTokenReceivedMin = quoteTokenReceived.multipliedBy(slippageMultiplier);

  const tokenQtys = {
    quoteTokenReceived: quoteTokenReceivedMin,
    baseTokenReceived: baseTokenRecievedMin,
  };

  return tokenQtys;
};

/**
 * @dev defines the amount of decay needed in order for us to require a user to handle the
 * decay prior to a double asset entry as the equivalent of 1 unit of quote token
 * @param baseTokenReserveQty current reserve qty of the baseToken
 * @param internalBalances the internal balance Struct
 * internalBalances = {
 *  baseTokenReserveQty: ,
 *  quoteTokenReserveQty: ,
 *  kLast:
 * }
 */
export const isSufficientDecayPresent = (baseTokenReserveQty, internalBalances) => {
  const baseTokenReserveQtyBN = toBigNumber(baseTokenReserveQty);
  const internalBalancesBN = internalBalancesBNConverter(internalBalances);
  const baseTokenReserveDifference = baseTokenReserveQtyBN
    .minus(internalBalancesBN.baseTokenReserveQty)
    .abs();
  const internalBalanceRatio = internalBalancesBN.baseTokenReserveQty.dividedBy(
    internalBalancesBN.quoteTokenReserveQty,
  );
  const decayPresentComparison = baseTokenReserveDifference
    .dividedBy(internalBalanceRatio)
    .isGreaterThan(toBigNumber('1'));
  return decayPresentComparison;
};

// helper function
export const internalBalancesBNConverter = (internalBalances) => ({
  baseTokenReserveQty: toBigNumber(internalBalances.baseTokenReserveQty),
  quoteTokenReserveQty: toBigNumber(internalBalances.quoteTokenReserveQty),
  kLast: toBigNumber(internalBalances.kLast),
});

export default {
  calculateAddBaseTokenLiquidityQuantities,
  calculateAddLiquidityQuantities,
  calculateAddQuoteTokenLiquidityQuantities,
  calculateAddTokenPairLiquidityQuantities,
  calculateBaseTokenQty,
  calculateExchangeRate,
  calculateFees,
  calculateLiquidityTokenFees,
  calculateLiquidityTokenQtyForDoubleAssetEntry,
  calculateLiquidityTokenQtyForSingleAssetEntry,
  calculateLPTokenAmount,
  calculateOutputAmountLessFees,
  calculateQty,
  calculateQtyToReturnAfterFees,
  calculateQuoteTokenQty,
  calculateTokenAmountsFromLPTokens,
  isSufficientDecayPresent,
  BASIS_POINTS,
  INSUFFICIENT_QTY,
  INSUFFICIENT_LIQUIDITY,
  NEGATIVE_INPUT,
  NAN_ERROR,
};
