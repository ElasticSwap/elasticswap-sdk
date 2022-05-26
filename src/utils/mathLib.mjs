import { ethers } from 'ethers';

export const BASIS_POINTS = ethers.BigNumber.from('10000');
const ZERO = ethers.BigNumber.from(0);
const ONE = ethers.BigNumber.from(1);
const TWO = ethers.BigNumber.from(2);
export const WAD = ethers.utils.parseUnits('1', 18);

export const getAddLiquidityBaseTokenQtyFromQuoteTokenQty = (
  quoteTokenQty,
  baseTokenReserveQty,
  internalBalances,
) => {
  let baseTokenQtyToReturn = ZERO;
  // check if decay (base or quote) is present
  if (isSufficientDecayPresent(baseTokenReserveQty, internalBalances)) {
    // if base token Decay is present
    if (baseTokenReserveQty.gt(internalBalances.baseTokenReserveQty)) {
      const baseTokenDecay = baseTokenReserveQty.sub(internalBalances.baseTokenReserveQty);
      const quoteTokenQtyRequiredToRemoveBaseTokenDecayCompletely =
        calculateMaxQuoteTokenQtyWhenBaseDecayIsPresentForSingleAssetEntry(
          baseTokenReserveQty,
          internalBalances,
        );

      if (quoteTokenQty.gt(quoteTokenQtyRequiredToRemoveBaseTokenDecayCompletely)) {
        const remQuoteTokenQty = quoteTokenQty.sub(
          quoteTokenQtyRequiredToRemoveBaseTokenDecayCompletely,
        );

        const updatedInternalBalancesBaseTokenReserveQty =
          internalBalances.baseTokenReserveQty.add(baseTokenDecay);

        const updatedInternalBalancesQuoteTokenReserveQty =
          internalBalances.quoteTokenReserveQty.add(
            quoteTokenQtyRequiredToRemoveBaseTokenDecayCompletely,
          );

        const baseTokenQtyToMatchRemQuoteTokenQty = calculateQty(
          remQuoteTokenQty,
          updatedInternalBalancesQuoteTokenReserveQty,
          updatedInternalBalancesBaseTokenReserveQty,
        );
        baseTokenQtyToReturn = baseTokenQtyToMatchRemQuoteTokenQty;
      }
    } else {
      // quoteToken decay is present
      const baseTokenQtyRequiredToRemoveQuoteTokenDecayCompletely =
        calculateMaxBaseTokenQtyWhenQuoteDecayIsPresentForSingleAssetEntry(
          baseTokenReserveQty,
          internalBalances,
        );

      const baseTokenQtyToMatchQuoteTokenQty = calculateQty(
        quoteTokenQty,
        internalBalances.quoteTokenReserveQty,
        internalBalances.baseTokenReserveQty,
      );
      baseTokenQtyToReturn = baseTokenQtyRequiredToRemoveQuoteTokenDecayCompletely.add(
        baseTokenQtyToMatchQuoteTokenQty,
      );
    }
  } else {
    // no decay
    baseTokenQtyToReturn = calculateQty(
      quoteTokenQty,
      internalBalances.quoteTokenReserveQty,
      internalBalances.baseTokenReserveQty,
    );
  }
  return baseTokenQtyToReturn;
};

export const getAddLiquidityQuoteTokenQtyFromBaseTokenQty = (
  baseTokenQty,
  baseTokenReserveQty,
  internalBalances,
) => {
  let quoteTokenQtyToReturn = ZERO;
  // check if decay (base or quote) is present
  if (isSufficientDecayPresent(baseTokenReserveQty, internalBalances)) {
    // if base token decay is present
    if (baseTokenReserveQty.gt(internalBalances.baseTokenReserveQty)) {
      // quoteTokenQty =
      // quoteToken(baseTokenDecay)+amount to for baseTokenQty(assuming the decay got matched)
      const quoteTokenToRemoveBaseTokenDecayCompletely =
        calculateMaxQuoteTokenQtyWhenBaseDecayIsPresentForSingleAssetEntry(
          baseTokenReserveQty,
          internalBalances,
        );

      const baseTokenDecay = baseTokenReserveQty.sub(internalBalances.baseTokenReserveQty);

      // to match baseTokenQty - assuming baseTokenDecay has been nullified
      // internalBalances.baseTokenReserveQty = internalBalances.baseTokenReserveQty + alphaDecay
      // internalBalances.quoteTokenReserveQty
      // = internalBalances.quoteTokenReserveQty + quoteTokenToRemoveBaseTokenDecayCompletely
      const updatedInternalBalancesBaseTokenReserveQty =
        internalBalances.baseTokenReserveQty.add(baseTokenDecay);
      const updatedInternalBalancesQuoteTokenReserveQty = internalBalances.quoteTokenReserveQty.add(
        quoteTokenToRemoveBaseTokenDecayCompletely,
      );

      const quoteTokenQtyToMatchBaseTokenQty = calculateQty(
        baseTokenQty,
        updatedInternalBalancesBaseTokenReserveQty,
        updatedInternalBalancesQuoteTokenReserveQty,
      );
      quoteTokenQtyToReturn = quoteTokenToRemoveBaseTokenDecayCompletely.add(
        quoteTokenQtyToMatchBaseTokenQty,
      );
    } else {
      // quote token decay is present
      const baseTokenQtyRequiredToRemoveQuoteTokenDecayCompletely =
        calculateMaxBaseTokenQtyWhenQuoteDecayIsPresentForSingleAssetEntry(
          baseTokenReserveQty,
          internalBalances,
        );
      // if baseTokenQty => reqdbaseToken amnt:
      //    quoteToken qty :: baseTokenQty - reqdBaseTokenToRemoveDecay
      // else quoteTokenQty = 0
      if (baseTokenQty.gt(baseTokenQtyRequiredToRemoveQuoteTokenDecayCompletely)) {
        const remBaseTokenQty = baseTokenQty.sub(
          baseTokenQtyRequiredToRemoveQuoteTokenDecayCompletely,
        );

        const quoteTokenQtyToMatchRemBaseTokenQty = calculateQty(
          remBaseTokenQty,
          internalBalances.baseTokenReserveQty,
          internalBalances.quoteTokenReserveQty,
        );
        quoteTokenQtyToReturn = quoteTokenQtyToMatchRemBaseTokenQty;
      }
    }
  } else {
    // no decay - quoteTokenAmount such that the ratio is same (quoteTokenQty::baseTokenQty)
    const quoteTokenQtyToMatchBaseTokenQty = calculateQty(
      baseTokenQty,
      internalBalances.baseTokenReserveQty,
      internalBalances.quoteTokenReserveQty,
    );
    quoteTokenQtyToReturn = quoteTokenQtyToMatchBaseTokenQty;
  }
  return quoteTokenQtyToReturn;
};

/**
 * get the base qty expected to output (assuming no slippage) based on the quoteTokenQty
 * passed in.
 * @param {ethers.BigNumber} quoteTokenQty quoteTokenQty to swap
 * @param {ethers.BigNumber} baseTokenReserveQty current baseToken.balanceOf(exchange)
 * @param {ethers.BigNumber} fee fee amount in basis points
 * @param {object} internalBalances { baseTokenReserveQty, quoteTokenReserveQty }
 * representing internal accounting of the exchange contract
 * @returns baseToken qty
 */
export const getBaseTokenQtyFromQuoteTokenQty = (
  quoteTokenQty,
  baseTokenReserveQty,
  fee,
  internalBalances,
) => {
  // check to see if we have experienced quote token Decay / a rebase down event
  if (baseTokenReserveQty.lt(internalBalances.baseTokenReserveQty)) {
    // we have less reserves than our current price curve will expect, we need to adjust the curve
    const pricingRatio = wDiv(
      internalBalances.baseTokenReserveQty,
      internalBalances.quoteTokenReserveQty,
    );
    //    ^ is Omega
    const impliedQuoteTokenQty = wDiv(baseTokenReserveQty, pricingRatio);

    return calculateQtyToReturnAfterFees(
      quoteTokenQty,
      impliedQuoteTokenQty,
      baseTokenReserveQty,
      fee,
    );
  }
  // we have the same or more reserves, no need to alter the curve.
  return calculateQtyToReturnAfterFees(
    quoteTokenQty,
    internalBalances.quoteTokenReserveQty,
    internalBalances.baseTokenReserveQty,
    fee,
  );
};

/**
 * Returns the quote qty expected to output (given no slippage) based on the baseTokenQty
 * passed in for the given internal balances and fee.
 * @param {ethers.BigNumber} baseTokenQty
 * @param {ethers.BigNumber} fee fee amount in basis points
 * @param {object} internalBalances { baseTokenReserveQty, quoteTokenReserveQty }
 * representing internal accounting of the exchange contract
 * @returns quoteToken qty
 */
export const getQuoteTokenQtyFromBaseTokenQty = (baseTokenQty, fee, internalBalances) =>
  calculateQtyToReturnAfterFees(
    baseTokenQty,
    internalBalances.baseTokenReserveQty,
    internalBalances.quoteTokenReserveQty,
    fee,
  );

/**
 *
 * @param {ethers.BigNumber} lpTokenQty
 * @param {ethers.BigNumber} baseTokenReserveQty α baseToken.balanceOf(exchange)
 * @param {ethers.BigNumber} quoteTokenReserveQty β quoteToken.balanceOf(exchange)
 * @param {ethers.BigNumber} totalLPTokenSupply exchange.totalSupply();
 * @returns {object} { baseTokenQty: ethers.BigNumber, quoteTokenQty: ethers.BigNumber }
 */
export const getTokenQtysFromLPTokenQty = (
  lpTokenQty,
  baseTokenReserveQty,
  quoteTokenReserveQty,
  totalLPTokenSupply,
) => {
  const lpRatio = wDiv(lpTokenQty, totalLPTokenSupply);
  const baseTokenQty = baseTokenReserveQty.mul(lpRatio).div(WAD);
  const quoteTokenQty = quoteTokenReserveQty.mul(lpRatio).div(WAD);

  const tokenQtys = {
    baseTokenQty,
    quoteTokenQty,
  };

  return tokenQtys;
};

export const getLPTokenQtyFromTokenQtys = (
  baseTokenQty,
  quoteTokenQty,
  baseTokenReserveQty,
  totalLPTokenSupply,
  internalBalances,
) => {
  if (totalLPTokenSupply.eq(0)) {
    // TODO: do we want to handle this case?
    // return squareRoot(baseTokenQty.mul(quoteTokenQty)).sub(MIN_LIQ);
    throw new Error('No existing LP Tokens');
  }
  const lpFeeTokensToBeMinted = calculateLiquidityTokenFees(totalLPTokenSupply, internalBalances);
  const totalLPTokenSupplyWFees = totalLPTokenSupply.add(lpFeeTokensToBeMinted);
  if (!isSufficientDecayPresent(baseTokenReserveQty, internalBalances)) {
    // no decay is present
    const quoteTokenQtyToConsume = calculateQuoteTokenQtyToUse(
      baseTokenQty,
      quoteTokenQty,
      internalBalances,
    );
    return calculateLiquidityTokenQtyForDoubleAssetEntry(
      totalLPTokenSupplyWFees,
      quoteTokenQtyToConsume,
      internalBalances.quoteTokenReserveQty,
    );
  }

  let lpTokensGenerated;
  let remainingQuoteTokenQty = ethers.BigNumber.from(quoteTokenQty);
  let remainingBaseTokenQty = ethers.BigNumber.from(baseTokenQty);
  let updatedInternalBalances;

  // decay is present and needs to be handled first
  if (baseTokenReserveQty.gt(internalBalances.baseTokenReserveQty)) {
    // base token decay present, user must first add quote tokens
    const quoteTokenValues = calculateAddQuoteTokenLiquidityQuantities(
      quoteTokenQty,
      baseTokenReserveQty,
      totalLPTokenSupply,
      internalBalances,
    );
    remainingQuoteTokenQty = remainingQuoteTokenQty.sub(quoteTokenValues.quoteTokenQtyUsed);
    lpTokensGenerated = quoteTokenValues.lpTokenQty;
    updatedInternalBalances = quoteTokenValues.updatedInternalBalances;
  } else {
    // quote token decay present user must first add base tokens
    const baseTokenValues = calculateAddBaseTokenLiquidityQuantities(
      baseTokenQty,
      baseTokenReserveQty,
      totalLPTokenSupply,
      internalBalances,
    );
    remainingBaseTokenQty = remainingBaseTokenQty.sub(baseTokenValues.baseTokenQtyUsed);
    lpTokensGenerated = baseTokenValues.lpTokenQty;
    updatedInternalBalances = internalBalances;
  }

  // User has now offset some amount of decay, check if they still have left over
  // qty to be consumed
  if (remainingQuoteTokenQty.gt(ZERO) && remainingBaseTokenQty.gt(ZERO)) {
    const updatedTotalSupplyOfLPTokens = totalLPTokenSupplyWFees.add(lpTokensGenerated);
    const remQuoteTokenQtyToConsume = calculateQuoteTokenQtyToUse(
      remainingBaseTokenQty,
      remainingQuoteTokenQty,
      updatedInternalBalances,
    );
    lpTokensGenerated = lpTokensGenerated.add(
      calculateLiquidityTokenQtyForDoubleAssetEntry(
        updatedTotalSupplyOfLPTokens,
        remQuoteTokenQtyToConsume,
        updatedInternalBalances.quoteTokenReserveQty,
      ),
    );
  }
  return lpTokensGenerated;
};

const calculateQuoteTokenQtyToUse = (baseTokenQty, quoteTokenQty, internalBalances) => {
  const requiredQuoteTokenQty = calculateQty(
    baseTokenQty,
    internalBalances.baseTokenReserveQty,
    internalBalances.quoteTokenReserveQty,
  );

  if (requiredQuoteTokenQty.lte(quoteTokenQty)) {
    // consuming all of the baseTokenQty works, leaving none or some quoteTokenQty.
    return requiredQuoteTokenQty;
  }
  // we cannot consume all of their baseTokenQty, so instead, use all of the quoteTokenQty.
  return quoteTokenQty;
};

/**
 *
 * @param {ethers.BigNumber} tokenASwapQty
 * @param {ethers.BigNumber} tokenAReserveQty
 * @param {ethers.BigNumber} tokenBReserveQty
 * @param {ethers.BigNumber} fee fee amount in basis points
 * @returns ethers.BigNumber token qty
 */
export const calculateQtyToReturnAfterFees = (
  tokenASwapQty,
  tokenAReserveQty,
  tokenBReserveQty,
  fee,
) => {
  const differenceInBP = BASIS_POINTS.sub(fee);
  const tokenASwapQtyLessFee = tokenASwapQty.mul(differenceInBP);
  const numerator = tokenASwapQtyLessFee.mul(tokenBReserveQty);
  const denominator = tokenAReserveQty.mul(BASIS_POINTS).add(tokenASwapQtyLessFee);
  const qtyToReturn = numerator.div(denominator);
  return qtyToReturn;
};

/**
 * Given tokenA, computes the needed amount of tokenB when
 * adding liquidity when nod decay is present.
 * @param {} tokenAQty
 * @param {*} tokenAReserveQty
 * @param {*} tokenBReserveQty
 * @returns
 */
const calculateQty = (tokenAQty, tokenAReserveQty, tokenBReserveQty) =>
  tokenAQty.mul(tokenBReserveQty).div(tokenAReserveQty);

/**
 * Calculates the amount of LP tokens that have not yet been minted (but need to be) to the fee
 * address.
 * @param {Cal} totalLPTokenSupply
 * @param {*} internalBalances
 * @returns lpTokenQty to be minted to the fee address on the next liquidity event.
 */
const calculateLiquidityTokenFees = (totalLPTokenSupply, internalBalances) => {
  const rootK = squareRoot(
    internalBalances.baseTokenReserveQty.mul(internalBalances.quoteTokenReserveQty),
  );
  const rootKLast = squareRoot(internalBalances.kLast);
  if (rootK.gt(rootKLast)) {
    return totalLPTokenSupply.mul(rootK.sub(rootKLast)).div(rootK.mul(2));
  }
  return ZERO;
};

/**
 * Determines is sufficient decay is present in the exchange to warrant a user to need to
 * remove decay prior to adding liquidity to both sides
 * @param {} baseTokenReserveQty
 * @param {*} internalBalances
 * @returns boolean
 */
export const isSufficientDecayPresent = (baseTokenReserveQty, internalBalances) => {
  const baseTokenReserveDifference = baseTokenReserveQty
    .sub(internalBalances.baseTokenReserveQty)
    .mul(WAD)
    .abs();
  const internalBalanceRatio = wDiv(
    internalBalances.baseTokenReserveQty,
    internalBalances.quoteTokenReserveQty,
  );
  return wDiv(baseTokenReserveDifference, internalBalanceRatio).gte(WAD);
};

const calculateLiquidityTokenQtyForDoubleAssetEntry = (
  totalLPTokenSupply,
  quoteTokenQty,
  quoteTokenReserveQty,
) => quoteTokenQty.mul(totalLPTokenSupply).div(quoteTokenReserveQty);

const calculateAddBaseTokenLiquidityQuantities = (
  baseTokenQty,
  baseTokenReserveQty,
  totalSupplyOfLP,
  internalBalances,
) => {
  const maxBaseTokenQty = calculateMaxBaseTokenQtyWhenQuoteDecayIsPresentForSingleAssetEntry(
    baseTokenReserveQty,
    internalBalances,
  );

  let baseTokenQtyUsed;
  if (baseTokenQty.gt(maxBaseTokenQty)) {
    baseTokenQtyUsed = maxBaseTokenQty;
  } else {
    baseTokenQtyUsed = baseTokenQty;
  }

  const lpTokenQty = calculateLiquidityTokenQtyForSingleAssetEntryWithQuoteTokenDecay(
    baseTokenReserveQty,
    totalSupplyOfLP,
    baseTokenQtyUsed,
    internalBalances.baseTokenReserveQty,
  );
  // note: we do NOT update internal balances here! See solidity for why.
  return {
    baseTokenQtyUsed,
    lpTokenQty,
  };
};

const calculateLiquidityTokenQtyForSingleAssetEntryWithQuoteTokenDecay = (
  baseTokenReserveQty,
  totalLPTokenSupply,
  tokenQtyAToAdd,
  internalTokenAReserveQty,
) => {
  const denominator = internalTokenAReserveQty.add(baseTokenReserveQty).add(tokenQtyAToAdd);
  const gamma = wDiv(tokenQtyAToAdd, denominator);
  return wDiv(wMul(totalLPTokenSupply.mul(WAD), gamma), WAD.sub(gamma)).div(WAD);
};

const calculateAddQuoteTokenLiquidityQuantities = (
  quoteTokenQty,
  baseTokenReserveQty,
  totalSupplyOfLiquidityTokens,
  internalBalances,
) => {
  // const baseTokenDecay = baseTokenReserveQty.sub(internalBalances.baseTokenReserveQty);

  // omega - X/Y
  const internalBaseTokenToQuoteTokenRatio = wDiv(
    internalBalances.baseTokenReserveQty,
    internalBalances.quoteTokenReserveQty,
  );

  // alphaDecay / omega (A/B)
  // const maxQuoteTokenQty = wDiv(baseTokenDecay, internalBaseTokenToQuoteTokenRatio);
  const maxQuoteTokenQty = calculateMaxQuoteTokenQtyWhenBaseDecayIsPresentForSingleAssetEntry(
    baseTokenReserveQty,
    internalBalances,
  );

  // deltaBeta
  let quoteTokenQtyUsed;
  if (quoteTokenQty.gt(maxQuoteTokenQty)) {
    quoteTokenQtyUsed = maxQuoteTokenQty;
  } else {
    quoteTokenQtyUsed = quoteTokenQty;
  }
  const baseTokenQtyDecayChange = quoteTokenQty.mul(internalBaseTokenToQuoteTokenRatio).div(WAD);

  // x += alphaDecayChange
  // y += deltaBeta
  const updatedInternalBalances = {};
  updatedInternalBalances.baseTokenReserveQty =
    internalBalances.baseTokenReserveQty.add(baseTokenQtyDecayChange);
  updatedInternalBalances.quoteTokenReserveQty =
    internalBalances.quoteTokenReserveQty.add(quoteTokenQtyUsed);

  const lpTokenQty = calculateLiquidityTokenQtyForSingleAssetEntryWithBaseTokenDecay(
    baseTokenReserveQty,
    totalSupplyOfLiquidityTokens,
    quoteTokenQtyUsed,
    updatedInternalBalances.quoteTokenReserveQty,
    internalBaseTokenToQuoteTokenRatio,
  );

  return {
    quoteTokenQtyUsed,
    updatedInternalBalances,
    lpTokenQty,
  };
};

const calculateLiquidityTokenQtyForSingleAssetEntryWithBaseTokenDecay = (
  baseTokenReserveQty,
  totalLPTokenSupply,
  tokenAQty,
  internalTokenAReserveQty,
  internalBaseTokenToQuoteTokenRatio,
) => {
  const ratio = wDiv(baseTokenReserveQty, internalBaseTokenToQuoteTokenRatio);
  const denominator = ratio.add(internalTokenAReserveQty);
  const gamma = wDiv(tokenAQty, denominator);
  return wDiv(wMul(totalLPTokenSupply.mul(WAD), gamma), WAD.sub(gamma)).div(WAD);
};

export const calculateMaxBaseTokenQtyWhenQuoteDecayIsPresentForSingleAssetEntry = (
  baseTokenReserveQty,
  internalBalances,
) => {
  const maxBaseTokenQty = internalBalances.baseTokenReserveQty.sub(baseTokenReserveQty);
  return maxBaseTokenQty;
};

export const calculateMaxQuoteTokenQtyWhenBaseDecayIsPresentForSingleAssetEntry = (
  baseTokenReserveQty,
  internalBalances,
) => {
  const baseTokenDecay = baseTokenReserveQty.sub(internalBalances.baseTokenReserveQty);

  // omega - X/Y
  const internalBaseTokenToQuoteTokenRatio = wDiv(
    internalBalances.baseTokenReserveQty,
    internalBalances.quoteTokenReserveQty,
  );

  // alphaDecay / omega (A/B)
  const maxQuoteTokenQty = wDiv(baseTokenDecay, internalBaseTokenToQuoteTokenRatio);
  return maxQuoteTokenQty;
};

/**
 * returns a / b in the form of a WAD integer (18 decimals of precision)
 * NOTE: this rounds to the nearest integer (up or down). For example .666666 would end up
 * rounding to .66667.
 * @param {ethers.BigNumber} a
 * @param {ethers.BigNumber} b
 * @returns wad value of a/b
 */
const wDiv = (a, b) => a.mul(WAD).add(b.div(2)).div(b);

/**
 *
 * @param {*} a
 * @param {*} b
 * @returns
 */
const wMul = (a, b) => a.mul(b).add(WAD.div(2)).div(WAD);

/**
 *
 * @param {ethers.BigNumber} x
 * @returns
 */
const squareRoot = (x) => {
  let z = x.add(ONE).div(TWO);
  let y = x;
  while (z.sub(y).isNegative()) {
    y = z;
    z = x.div(z).add(z).div(TWO);
  }
  return y;
};

export const getTokenImbalanceQtys = (baseTokenReserveQty, internalBalances) => {
  if (!isSufficientDecayPresent(baseTokenReserveQty, internalBalances)) {
    return {
      baseTokenImbalanceQty: ZERO,
      quoteTokenImbalanceQty: ZERO,
    };
  }

  if (baseTokenReserveQty.gt(internalBalances.baseTokenReserveQty)) {
    // we need more quote tokens in the system (base token decay)
    const quoteTokenImbalanceQty =
      calculateMaxQuoteTokenQtyWhenBaseDecayIsPresentForSingleAssetEntry(
        baseTokenReserveQty,
        internalBalances,
      );

    return {
      baseTokenImbalanceQty: ZERO,
      quoteTokenImbalanceQty,
    };
  }
  // we need more base tokens in the system (quote token decay)
  const baseTokenImbalanceQty = calculateMaxBaseTokenQtyWhenQuoteDecayIsPresentForSingleAssetEntry(
    baseTokenReserveQty,
    internalBalances,
  );

  return {
    baseTokenImbalanceQty,
    quoteTokenImbalanceQty: ZERO,
  };
};

export default {
  BASIS_POINTS,
  calculateQtyToReturnAfterFees,
  getBaseTokenQtyFromQuoteTokenQty,
  getQuoteTokenQtyFromBaseTokenQty,
  getTokenQtysFromLPTokenQty,
  getTokenImbalanceQtys,
  WAD,
};
