/* eslint import/extensions: 0 */
import { expect } from 'chai';
import BigNumber from 'bignumber.js';
import {
  BASIS_POINTS,
  calculateExchangeRate,
  calculateFees,
  calculateInputAmountFromOutputAmount,
  calculateLiquidityTokenQtyForDoubleAssetEntry,
  calculateLiquidityTokenQtyForSingleAssetEntryWithBaseTokenDecay,
  calculateLiquidityTokenQtyForSingleAssetEntryWithQuoteTokenDecay,
  calculateOutputAmountLessFees,
  calculateQty,
  calculateQtyToReturnAfterFees,
  calculateTokenAmountsFromLPTokens,
  INSUFFICIENT_LIQUIDITY,
  INSUFFICIENT_QTY,
  NAN_ERROR,
  NEGATIVE_INPUT,
} from '../../src/utils/mathLib.mjs';

const ZERO = BigNumber(0);
const { ROUND_DOWN } = BigNumber;

describe('MathLib', async () => {
  describe('calculateQty', () => {
    it('Should return the correct calculateQty', async () => {
      expect(calculateQty(500, 100, 5000).toNumber()).to.equal(25000);
      expect(calculateQty(100, 500, 5000).toNumber()).to.equal(1000);
    });

    it('Should revert if any value is 0', async () => {
      expect(() => calculateQty(0, 100, 500)).to.throw(INSUFFICIENT_QTY);
      expect(() => calculateQty(500, 0, 1000)).to.throw(INSUFFICIENT_LIQUIDITY);
      expect(() => calculateQty(500, 100, 0)).to.throw(INSUFFICIENT_LIQUIDITY);
    });
  });

  describe('calculateQtyToReturnAfterFees', () => {
    it('Should return the correct values', async () => {
      const tokenSwapQty = BigNumber(1);
      const tokenAReserveQtyBeforeTrade = BigNumber(3170);
      const tokenBReserveQtyBeforeTrade = BigNumber(3175.79385113);
      const feeInBasisPoints = BigNumber(50);

      const differenceInBP = BASIS_POINTS.minus(feeInBasisPoints);
      const tokenASwapQtyLessFee = tokenSwapQty.multipliedBy(differenceInBP).dp(18, ROUND_DOWN);

      const numerator = tokenASwapQtyLessFee
        .multipliedBy(tokenBReserveQtyBeforeTrade)
        .dp(18, ROUND_DOWN);
      const denominator = tokenAReserveQtyBeforeTrade
        .multipliedBy(BASIS_POINTS)
        .dp(18, ROUND_DOWN)
        .plus(tokenASwapQtyLessFee);

      // what the sdk should be doing
      const qtyToReturn = numerator.dividedBy(denominator).dp(18, ROUND_DOWN);

      // Here passing in normal decimals, sdk will convert to BN for calcs
      const SdkCalculatedQtyToReturnAfterFees = calculateQtyToReturnAfterFees(
        1,
        3170,
        3175.79385113,
        50,
      );

      expect(SdkCalculatedQtyToReturnAfterFees.toString()).to.equal(qtyToReturn.toString());
    });

    it('Should return the correct value when fees are zero', async () => {
      const tokenSwapQty = BigNumber(1);
      const tokenAReserveQtyBeforeTrade = BigNumber(970.42042042042042042042);
      const tokenBReserveQtyBeforeTrade = BigNumber(3175.696969696969696969696);
      const feeInBasisPoints = BigNumber(0);

      const differenceInBP = BASIS_POINTS.minus(feeInBasisPoints);
      const tokenASwapQtyLessFee = tokenSwapQty.multipliedBy(differenceInBP).dp(18, ROUND_DOWN);

      const numerator = tokenASwapQtyLessFee
        .multipliedBy(tokenBReserveQtyBeforeTrade)
        .dp(18, ROUND_DOWN);
      const denominator = tokenAReserveQtyBeforeTrade
        .multipliedBy(BASIS_POINTS)
        .dp(18, ROUND_DOWN)
        .plus(tokenASwapQtyLessFee);

      // what the sdk should be doing
      const qtyToReturn = numerator.dividedBy(denominator).dp(18, ROUND_DOWN);

      // Here passing in normal decimals, sdk will convert to BN for calcs
      const SdkCalculatedQtyToReturnAfterFees = calculateQtyToReturnAfterFees(
        1,
        970.42042042042042042,
        3175.696969696969696969,
        0,
      );

      expect(SdkCalculatedQtyToReturnAfterFees.toString()).to.equal(qtyToReturn.toString());
    });
  });

  describe('calculateLiquiditytokenQtyForDoubleAssetEntry', () => {
    it('Should return the correct qty of liquidity tokens', async () => {
      const totalSupplyOfLiquidityTokens = 50;
      const quoteTokenBalance = 50;
      const quoteTokenQtyToAdd = 15;

      expect(
        calculateLiquidityTokenQtyForDoubleAssetEntry(
          totalSupplyOfLiquidityTokens,
          quoteTokenQtyToAdd,
          quoteTokenBalance,
        ).toNumber(),
      ).to.equal(15);
    });
  });

  describe('calculateLiquidityTokenQtyForSingleAssetEntry', () => {
    it('Should return the correct qty of liquidity tokens with a rebase down', async () => {
      // Scenario: We have 1000:5000 A:B or X:Y, a rebase down occurs (of 50 tokens)
      // and a user needs to 50 tokens in order to remove the decay
      const tokenAQty = 950;
      const tokenAQtyBN = BigNumber(tokenAQty);

      const totalSupplyOfLiquidityTokens = 5000;
      const totalSupplyOfLiquidityTokensBN = BigNumber(totalSupplyOfLiquidityTokens);

      const tokenAQtyToAdd = 50;
      const tokenAQtyToAddBN = BigNumber(tokenAQtyToAdd);
      // 950 + 50 brining us back to original state.
      const tokenAInternalReserveQtyAfterTransaction = 1000;
      const tokenAInternalReserveQtyAfterTransactionBN = BigNumber(
        tokenAInternalReserveQtyAfterTransaction,
      );

      const denominator = tokenAInternalReserveQtyAfterTransactionBN
        .plus(tokenAQtyBN)
        .plus(tokenAQtyToAddBN);
      const gamma = tokenAQtyToAddBN.dividedBy(denominator).dp(18, ROUND_DOWN);

      const liquidityTokensNumerator = totalSupplyOfLiquidityTokensBN
        .multipliedBy(gamma)
        .dp(18, ROUND_DOWN);
      const liquidityTokensNumeratorDenominator = BigNumber(1).minus(gamma);
      const expectedLiquidityTokens = liquidityTokensNumerator
        .dividedBy(liquidityTokensNumeratorDenominator)
        .dp(18, ROUND_DOWN);

      // passing in normal decimal as SDK is expecting it like that
      const sdkCalculatedLiquidityTokens =
        calculateLiquidityTokenQtyForSingleAssetEntryWithQuoteTokenDecay(
          tokenAQty,
          totalSupplyOfLiquidityTokens,
          tokenAQtyToAdd,
          tokenAInternalReserveQtyAfterTransaction,
        );

      expect(sdkCalculatedLiquidityTokens.toString()).to.equal(expectedLiquidityTokens.toString());

      // if we supply half, and remove half the decay, we should get roughly 1/2 the tokens
      const tokenAQtyToAdd2 = 25;
      const tokenAQtyToAdd2BN = BigNumber(25);
      // 950 + 25
      const tokenAInternalReserveQtyAfterTransaction2 = 975;
      const tokenAInternalReserveQtyAfterTransaction2BN = BigNumber(975);

      const denominator2 = tokenAInternalReserveQtyAfterTransaction2BN
        .plus(tokenAQtyBN)
        .plus(tokenAQtyToAdd2BN);

      const gamma2 = tokenAQtyToAdd2BN.dividedBy(denominator2).dp(18, ROUND_DOWN);

      const liquidityTokensNumerator2 = totalSupplyOfLiquidityTokensBN
        .multipliedBy(gamma2)
        .dp(18, ROUND_DOWN);
      const liquidityTokensNumeratorDenominator2 = BigNumber(1).minus(gamma2);

      const expectedLiquidityTokens2 = liquidityTokensNumerator2
        .dividedBy(liquidityTokensNumeratorDenominator2)
        .dp(18, ROUND_DOWN);

      // passing in normal decimal as SDK is expecting it like that
      const sdkCalculatedLiquidityTokens2 =
        calculateLiquidityTokenQtyForSingleAssetEntryWithQuoteTokenDecay(
          tokenAQty,
          totalSupplyOfLiquidityTokens,
          tokenAQtyToAdd2,
          tokenAInternalReserveQtyAfterTransaction2,
        );

      expect(sdkCalculatedLiquidityTokens2.toString()).to.equal(
        expectedLiquidityTokens2.toString(),
      );
    });

    it('Should return the correct qty of liquidity tokens with a rebase down', async () => {
      // Scenario: We have 10000:10000 A:B or X:Y, a rebase down occurs (of 5000 tokens)
      // and a user puts in 5000 tokens in order to remove the decay
      const tokenAQty = 5000;
      const tokenAQtyBN = BigNumber(tokenAQty);

      const totalSupplyOfLiquidityTokens = 10000;
      const totalSupplyOfLiquidityTokensBN = BigNumber(totalSupplyOfLiquidityTokens);

      const tokenAQtyToAdd = 5000;
      const tokenAQtyToAddBN = BigNumber(tokenAQtyToAdd);
      // 5000 + 5000 brining us back to original state.
      const tokenAInternalReserveQtyAfterTransaction = 10000;
      const tokenAInternalReserveQtyAfterTransactionBN = BigNumber(
        tokenAInternalReserveQtyAfterTransaction,
      );

      const denominator = tokenAInternalReserveQtyAfterTransactionBN
        .plus(tokenAQtyBN)
        .plus(tokenAQtyToAddBN);
      const gamma = tokenAQtyToAddBN.dividedBy(denominator).dp(18, ROUND_DOWN);

      const liquidityTokensNumerator = totalSupplyOfLiquidityTokensBN
        .multipliedBy(gamma)
        .dp(18, ROUND_DOWN);
      const liquidityTokensNumeratorDenominator = BigNumber(1).minus(gamma);
      const expectedLiquidityTokens = liquidityTokensNumerator
        .dividedBy(liquidityTokensNumeratorDenominator)
        .dp(18, ROUND_DOWN);

      // passing in normal decimal as SDK is expecting it like that
      const sdkCalculatedLiquidityTokens =
        calculateLiquidityTokenQtyForSingleAssetEntryWithQuoteTokenDecay(
          tokenAQty,
          totalSupplyOfLiquidityTokens,
          tokenAQtyToAdd,
          tokenAInternalReserveQtyAfterTransaction,
        );

      expect(sdkCalculatedLiquidityTokens.toString()).to.equal(expectedLiquidityTokens.toString());

      // if we supply half, and remove half the decay, we should get roughly 1/2 the tokens
      const tokenAQtyToAdd2 = 2500;
      const tokenAQtyToAdd2BN = BigNumber(tokenAQtyToAdd2);
      // 5000 + 2500
      const tokenAInternalReserveQtyAfterTransaction2 = 7500;
      const tokenAInternalReserveQtyAfterTransaction2BN = BigNumber(
        tokenAInternalReserveQtyAfterTransaction2,
      );

      const denominator2 = tokenAInternalReserveQtyAfterTransaction2BN
        .plus(tokenAQtyBN)
        .plus(tokenAQtyToAdd2BN);

      const gamma2 = tokenAQtyToAdd2BN.dividedBy(denominator2).dp(18, ROUND_DOWN);

      const liquidityTokensNumerator2 = totalSupplyOfLiquidityTokensBN
        .multipliedBy(gamma2)
        .dp(18, ROUND_DOWN);
      const liquidityTokensNumeratorDenominator2 = BigNumber(1).minus(gamma2);

      const expectedLiquidityTokens2 = liquidityTokensNumerator2
        .dividedBy(liquidityTokensNumeratorDenominator2)
        .dp(18, ROUND_DOWN);

      // passing in normal decimal as SDK is expecting it like that
      const sdkCalculatedLiquidityTokens2 =
        calculateLiquidityTokenQtyForSingleAssetEntryWithQuoteTokenDecay(
          tokenAQty,
          totalSupplyOfLiquidityTokens,
          tokenAQtyToAdd2,
          tokenAInternalReserveQtyAfterTransaction2,
        );

      expect(sdkCalculatedLiquidityTokens2.toString()).to.equal(
        expectedLiquidityTokens2.toString(),
      );
    });

    it('Should return the correct qty of liquidity tokens with a rebase up', async () => {
      // Scenario: We have 1000:5000 A:B or X:Y, a rebase up occurs (of 500 tokens)
      // and a user needs to add 2500 quote tokens to remove the base decay

      // omega - X/Y
      const omega = 1000 / 5000;
      const omegaBN = BigNumber(omega);

      // current Alpha - post rebase
      const baseTokenReserveBalance = 1500;
      const baseTokenReserveBalanceBN = BigNumber(1500);

      const totalSupplyOfLiquidityTokens = 5000;
      const totalSupplyOfLiquidityTokensBN = BigNumber(5000);

      const tokenQtyAToAdd = 2500;
      const tokenQtyAToAddBN = BigNumber(2500);

      const internalTokenAReserveQty = 7500; // 5000 + 2500 to offset rebase up
      const internalTokenAReserveQtyBN = BigNumber(internalTokenAReserveQty);

      const ratio = baseTokenReserveBalanceBN.dividedBy(omegaBN).dp(18, ROUND_DOWN);
      const denominator = ratio.plus(internalTokenAReserveQtyBN);
      const gamma = tokenQtyAToAddBN.dividedBy(denominator).dp(18, ROUND_DOWN);

      const expectedLiquidityTokenQty = totalSupplyOfLiquidityTokensBN
        .multipliedBy(gamma)
        .dividedBy(BigNumber(1).minus(gamma))
        .dp(18, ROUND_DOWN);
      console.log(expectedLiquidityTokenQty.toString());

      // passing in decimal as sdk expects it in decimal form
      const sdkCalculatedLiquidityTokens =
        calculateLiquidityTokenQtyForSingleAssetEntryWithBaseTokenDecay(
          baseTokenReserveBalance,
          totalSupplyOfLiquidityTokens,
          tokenQtyAToAdd,
          internalTokenAReserveQty,
          omega,
        );
      expect(sdkCalculatedLiquidityTokens.toString()).to.equal(
        expectedLiquidityTokenQty.toString(),
      );
    });
  });

  describe('calculateExchangeRate', () => {
    it('Should calculate the exchange rate correctly', async () => {
      const baseTokenReserveQty1 = BigNumber('10.123456789123456789');
      const quoteTokenReserveQty1 = BigNumber('12.123456789123456789');

      const calculatedExchangeRate1 = baseTokenReserveQty1.dividedBy(quoteTokenReserveQty1);
      expect(
        calculateExchangeRate(baseTokenReserveQty1, quoteTokenReserveQty1).toNumber(),
      ).to.equal(calculatedExchangeRate1.toNumber());

      const baseTokenReserveQty2 = BigNumber('10');
      const quoteTokenReserveQty2 = BigNumber('12.123456789123456789');

      const calculatedExchangeRate2 = baseTokenReserveQty2.dividedBy(quoteTokenReserveQty2);
      expect(
        calculateExchangeRate(baseTokenReserveQty2, quoteTokenReserveQty2).toNumber(),
      ).to.equal(calculatedExchangeRate2.toNumber());
    });

    it('Should return an error when incorrect values are provided', async () => {
      const quoteTokenReserveQty1 = BigNumber('12.123456789123456789');
      const negativeQuoteTokenReserveQty = BigNumber('-12.123456789123456789');

      // ZERO case
      expect(() => calculateExchangeRate(ZERO, quoteTokenReserveQty1)).to.throw(
        INSUFFICIENT_LIQUIDITY,
      );
      expect(() => calculateExchangeRate(quoteTokenReserveQty1, ZERO)).to.throw(
        INSUFFICIENT_LIQUIDITY,
      );

      // Negative inputs provided
      expect(() =>
        calculateExchangeRate(quoteTokenReserveQty1, negativeQuoteTokenReserveQty),
      ).to.throw(NEGATIVE_INPUT);

      // Nan cases
      expect(() => calculateExchangeRate(null, quoteTokenReserveQty1)).to.throw(NAN_ERROR);
      expect(() => calculateExchangeRate(undefined, quoteTokenReserveQty1)).to.throw(NAN_ERROR);
    });
  });

  describe('calculateOutputAmountLessFees', () => {
    it('Should calculateOutputAmount correctly, accounting for fees and  slippage', async () => {
      // slippage and fees
      // 5 percent slippage
      const slippage = BigNumber(5);
      const tokenSwapQty = BigNumber(1);
      const tokenAReserveQtyBeforeTrade = BigNumber(3175.696969696969696969696);
      const tokenBReserveQtyBeforeTrade = BigNumber(315.79385113);
      const feeInBasisPoints = BigNumber(50);

      const differenceInBP = BASIS_POINTS.minus(feeInBasisPoints);
      const tokenASwapQtyLessFee = tokenSwapQty.multipliedBy(differenceInBP).dp(18, ROUND_DOWN);

      const numerator = tokenASwapQtyLessFee
        .multipliedBy(tokenBReserveQtyBeforeTrade)
        .dp(18, ROUND_DOWN);
      const denominator = tokenAReserveQtyBeforeTrade
        .multipliedBy(BASIS_POINTS)
        .dp(18, ROUND_DOWN)
        .plus(tokenASwapQtyLessFee);

      // what the sdk should be doing
      const qtyToReturn = numerator.dividedBy(denominator).dp(18, ROUND_DOWN);

      // Here passing in normal decimals, sdk will convert to BN for calcs
      const SdkCalculatedQtyToReturnAfterFees = calculateQtyToReturnAfterFees(
        1,
        3175.696969696969696969696,
        315.79385113,
        50,
      );

      expect(SdkCalculatedQtyToReturnAfterFees.toString()).to.equal(qtyToReturn.toString());

      const slippageMultiplier = BigNumber(1).minus(slippage.dividedBy(BigNumber(100)));
      const tokenBQtyExpectedLessSlippage = qtyToReturn.multipliedBy(slippageMultiplier);

      // Here passing in normal decimals, sdk will convert to BN for calcs
      expect(
        calculateOutputAmountLessFees(
          1,
          3175.696969696969696969696,
          315.79385113,
          5,
          50,
        ).toString(),
      ).to.equal(tokenBQtyExpectedLessSlippage.toString());
    });

    it('Should calculateOutputAmount correctly, accounting for fees and 0 slippage', async () => {
      // no slippage
      const slippage = ZERO;
      const tokenSwapQty = BigNumber(1);
      const tokenAReserveQtyBeforeTrade = BigNumber(317000);
      const tokenBReserveQtyBeforeTrade = BigNumber(3175.79385113);
      const feeInBasisPoints = BigNumber(50);

      const differenceInBP = BASIS_POINTS.minus(feeInBasisPoints);
      const tokenASwapQtyLessFee = tokenSwapQty.multipliedBy(differenceInBP).dp(18, ROUND_DOWN);

      const numerator = tokenASwapQtyLessFee
        .multipliedBy(tokenBReserveQtyBeforeTrade)
        .dp(18, ROUND_DOWN);
      const denominator = tokenAReserveQtyBeforeTrade
        .multipliedBy(BASIS_POINTS)
        .dp(18, ROUND_DOWN)
        .plus(tokenASwapQtyLessFee);

      // what the sdk should be doing
      const qtyToReturn = numerator.dividedBy(denominator).dp(18, ROUND_DOWN);

      // Here passing in normal decimals, sdk will convert to BN for calcs
      const SdkCalculatedQtyToReturnAfterFees = calculateQtyToReturnAfterFees(
        1,
        317000,
        3175.79385113,
        50,
      );

      expect(SdkCalculatedQtyToReturnAfterFees.toString()).to.equal(qtyToReturn.toString());

      const slippageMultiplier = BigNumber(1).minus(slippage.dividedBy(BigNumber(100)));
      const tokenBQtyExpectedLessSlippage = qtyToReturn.multipliedBy(slippageMultiplier);

      // Here passing in normal decimals, sdk will convert to BN for calcs
      expect(calculateOutputAmountLessFees(1, 317000, 3175.79385113, 0, 50).toString()).to.equal(
        tokenBQtyExpectedLessSlippage.toString(),
      );
    });

    it('Should calculateOutputAmount correctly, accounting for 0 fees and 0 slippage', async () => {
      // no slippage no fees
      const slippage = ZERO;
      const tokenSwapQty = BigNumber(1);
      const tokenAReserveQtyBeforeTrade = BigNumber(970.42042042042042042042);
      const tokenBReserveQtyBeforeTrade = BigNumber(3175.696969696969696969696);
      const feeInBasisPoints = ZERO;

      const differenceInBP = BASIS_POINTS.minus(feeInBasisPoints);
      const tokenASwapQtyLessFee = tokenSwapQty.multipliedBy(differenceInBP).dp(18, ROUND_DOWN);

      const numerator = tokenASwapQtyLessFee
        .multipliedBy(tokenBReserveQtyBeforeTrade)
        .dp(18, ROUND_DOWN);
      const denominator = tokenAReserveQtyBeforeTrade
        .multipliedBy(BASIS_POINTS)
        .dp(18, ROUND_DOWN)
        .plus(tokenASwapQtyLessFee);

      // what the sdk should be doing
      const qtyToReturn = numerator.dividedBy(denominator).dp(18, ROUND_DOWN);

      // Here passing in normal decimals, sdk will convert to BN for calcs
      const SdkCalculatedQtyToReturnAfterFees = calculateQtyToReturnAfterFees(
        1,
        970.42042042042042042042,
        3175.696969696969696969696,
        0,
      );

      expect(SdkCalculatedQtyToReturnAfterFees.toString()).to.equal(qtyToReturn.toString());

      const slippageMultiplier = BigNumber(1).minus(slippage.dividedBy(BigNumber(100)));
      const tokenBQtyExpectedLessSlippage = qtyToReturn.multipliedBy(slippageMultiplier);
      console.log('after slippage: ', tokenBQtyExpectedLessSlippage.toString());

      // Here passing in normal decimals, sdk will convert to BN for calcs
      expect(
        calculateOutputAmountLessFees(
          1,
          970.42042042042042042042,
          3175.696969696969696969696,
          0,
          0,
        ).toString(),
      ).to.equal(tokenBQtyExpectedLessSlippage.toString());
    });

    it('Should return an error when incorrect values are provided', async () => {
      const slippage = 5;
      const tokenSwapQty = 50;
      const negativeSwapQty = -50;
      const feeInBasisPoints = 30;
      const tokenAReserveQtyBeforeTrade = 100;
      const tokenBReserveQtyBeforeTrade = 5000;

      // ZERO case
      expect(() =>
        calculateOutputAmountLessFees(
          tokenSwapQty,
          ZERO,
          tokenBReserveQtyBeforeTrade,
          slippage,
          feeInBasisPoints,
        ),
      ).to.throw(INSUFFICIENT_LIQUIDITY);

      expect(() =>
        calculateOutputAmountLessFees(
          tokenSwapQty,
          tokenAReserveQtyBeforeTrade,
          ZERO,
          slippage,
          feeInBasisPoints,
        ),
      ).to.throw(INSUFFICIENT_LIQUIDITY);

      // Negative inputs provided
      expect(() =>
        calculateOutputAmountLessFees(
          negativeSwapQty,
          tokenAReserveQtyBeforeTrade,
          tokenBReserveQtyBeforeTrade,
          slippage,
          feeInBasisPoints,
        ),
      ).to.throw(NEGATIVE_INPUT);

      // Nan cases
      expect(() =>
        calculateOutputAmountLessFees(
          null,
          tokenAReserveQtyBeforeTrade,
          tokenBReserveQtyBeforeTrade,
          slippage,
          feeInBasisPoints,
        ),
      ).to.throw(NAN_ERROR);

      expect(() =>
        calculateOutputAmountLessFees(
          undefined,
          tokenAReserveQtyBeforeTrade,
          tokenBReserveQtyBeforeTrade,
          slippage,
          feeInBasisPoints,
        ),
      ).to.throw(NAN_ERROR);
    });
  });

  describe('calculateTokenAmountsFromLPTokens', () => {
    it('Should return an error when incorrect values are provided ', async () => {
      const lpTokenQtyToRedeem = BigNumber(-10);
      const slippagePercent = BigNumber(2);
      const baseTokenReserveQty = BigNumber(100);
      const quoteTokenReserveQty = BigNumber(200);
      const totalLPTokenSupply = BigNumber(200);

      expect(() =>
        calculateTokenAmountsFromLPTokens(
          lpTokenQtyToRedeem,
          slippagePercent,
          baseTokenReserveQty,
          quoteTokenReserveQty,
          totalLPTokenSupply,
        ),
      ).to.throw(NEGATIVE_INPUT);

      expect(() =>
        calculateTokenAmountsFromLPTokens(
          null,
          slippagePercent,
          baseTokenReserveQty,
          quoteTokenReserveQty,
          totalLPTokenSupply,
        ),
      ).to.throw(NAN_ERROR);

      expect(() =>
        calculateTokenAmountsFromLPTokens(
          undefined,
          slippagePercent,
          baseTokenReserveQty,
          quoteTokenReserveQty,
          totalLPTokenSupply,
        ),
      ).to.throw(NAN_ERROR);
    });
    it('Should calculate correct amount of tokens received (without slippage) ', async () => {
      const lpTokenQtyToRedeem = BigNumber(10);
      const slippagePercent = ZERO;
      const baseTokenReserveQty = BigNumber(100);
      const quoteTokenReserveQty = BigNumber(200);
      const totalLPTokenSupply = BigNumber(200);

      const answer = {
        quoteTokenReceived: quoteTokenReserveQty
          .multipliedBy(lpTokenQtyToRedeem.dividedBy(totalLPTokenSupply))
          .multipliedBy(BigNumber(1).minus(slippagePercent.dividedBy(BigNumber(100)))),
        baseTokenReceived: baseTokenReserveQty
          .multipliedBy(lpTokenQtyToRedeem.dividedBy(totalLPTokenSupply))
          .multipliedBy(BigNumber(1).minus(slippagePercent.dividedBy(BigNumber(100)))),
      };

      const expected = calculateTokenAmountsFromLPTokens(
        lpTokenQtyToRedeem,
        slippagePercent,
        baseTokenReserveQty,
        quoteTokenReserveQty,
        totalLPTokenSupply,
      );

      expect(expected.quoteTokenReceived.toNumber()).to.equal(answer.quoteTokenReceived.toNumber());
      expect(expected.baseTokenReceived.toNumber()).to.equal(answer.baseTokenReceived.toNumber());
    });

    it('Should calculate correct amount of tokens received (with slippage) ', async () => {
      const lpTokenQtyToRedeem = BigNumber(10);
      const slippagePercent = BigNumber(2);
      const baseTokenReserveQty = BigNumber(100);
      const quoteTokenReserveQty = BigNumber(200);
      const totalLPTokenSupply = BigNumber(200);

      const answer = {
        quoteTokenReceived: quoteTokenReserveQty
          .multipliedBy(lpTokenQtyToRedeem.dividedBy(totalLPTokenSupply))
          .multipliedBy(BigNumber(1).minus(slippagePercent.dividedBy(BigNumber(100)))),
        baseTokenReceived: baseTokenReserveQty
          .multipliedBy(lpTokenQtyToRedeem.dividedBy(totalLPTokenSupply))
          .multipliedBy(BigNumber(1).minus(slippagePercent.dividedBy(BigNumber(100)))),
      };

      const expected = calculateTokenAmountsFromLPTokens(
        lpTokenQtyToRedeem,
        slippagePercent,
        baseTokenReserveQty,
        quoteTokenReserveQty,
        totalLPTokenSupply,
      );

      expect(expected.quoteTokenReceived.toNumber()).to.equal(answer.quoteTokenReceived.toNumber());
      expect(expected.baseTokenReceived.toNumber()).to.equal(answer.baseTokenReceived.toNumber());
    });
  });

  describe('calculateFees', () => {
    it('Should return an error when incorrect values are provided ', async () => {
      const feesInBasisPoints = BigNumber('-2');
      const swapAmount = BigNumber(100);

      expect(() => calculateFees(feesInBasisPoints, swapAmount)).to.throw(NEGATIVE_INPUT);
      expect(() => calculateFees(null, swapAmount)).to.throw(NAN_ERROR);
      expect(() => calculateFees(undefined, swapAmount)).to.throw(NAN_ERROR);
    });

    it('Should calculate correct amount of fees', async () => {
      const feesInBasisPoints1 = BigNumber('5');
      const swapAmount1 = BigNumber('100');
      const answer1 = swapAmount1.multipliedBy(feesInBasisPoints1.dividedBy(BASIS_POINTS));

      const feesInBasisPoints2 = BigNumber('30');
      const swapAmount2 = BigNumber('100');
      const answer2 = swapAmount1.multipliedBy(feesInBasisPoints2.dividedBy(BASIS_POINTS));

      expect(calculateFees(feesInBasisPoints1, swapAmount1).toNumber()).to.equal(
        answer1.toNumber(),
      );
      expect(calculateFees(feesInBasisPoints2, swapAmount2).toNumber()).to.equal(
        answer2.toNumber(),
      );
    });
  });

  describe('calculateInputAmountFromOutputAmount', () => {
    it('Should calculate correct input amount accounting for fees and 0 slippage', async () => {
      const outputTokenAmountBN = BigNumber(100);
      const inputTokenReserveQtyBN = BigNumber(1000);
      const outputTokenReserveQtyBN = BigNumber(1000);
      const slippagePercentBN = BigNumber(0);
      const liquidityFeeInBasisPointsBN = BigNumber(3000);

      const numerator = outputTokenAmountBN
        .multipliedBy(inputTokenReserveQtyBN)
        .multipliedBy(BASIS_POINTS);
      const basisPointDifference = BASIS_POINTS.minus(liquidityFeeInBasisPointsBN);
      const outputSlippageMultiplier = outputTokenReserveQtyBN.multipliedBy(
        slippagePercentBN.dividedBy(BigNumber(100)),
      );
      const outputSlippageTerm = outputTokenAmountBN
        .plus(outputSlippageMultiplier)
        .minus(outputTokenReserveQtyBN);
      const denominator = outputSlippageTerm.multipliedBy(basisPointDifference);
      const calculatedInputAmount = numerator.dividedBy(denominator).abs();

      const expectedInputAmount = calculateInputAmountFromOutputAmount(
        outputTokenAmountBN,
        inputTokenReserveQtyBN,
        outputTokenReserveQtyBN,
        slippagePercentBN,
        liquidityFeeInBasisPointsBN,
      );

      expect(expectedInputAmount.toNumber()).to.equal(calculatedInputAmount.toNumber());
    });

    it('Should calculate correct input amount accounting for fees and slippage', async () => {
      const outputTokenAmountBN = BigNumber(100);
      const inputTokenReserveQtyBN = BigNumber(1000);
      const outputTokenReserveQtyBN = BigNumber(1000);
      const slippagePercentBN = BigNumber(5);
      const liquidityFeeInBasisPointsBN = BigNumber(3000);

      const numerator = outputTokenAmountBN
        .multipliedBy(inputTokenReserveQtyBN)
        .multipliedBy(BASIS_POINTS);
      const basisPointDifference = BASIS_POINTS.minus(liquidityFeeInBasisPointsBN);
      const outputSlippageMultiplier = outputTokenReserveQtyBN.multipliedBy(
        slippagePercentBN.dividedBy(BigNumber(100)),
      );
      const outputSlippageTerm = outputTokenAmountBN
        .plus(outputSlippageMultiplier)
        .minus(outputTokenReserveQtyBN);
      const denominator = outputSlippageTerm.multipliedBy(basisPointDifference);
      const calculatedInputAmount = numerator.dividedBy(denominator).abs();

      const expectedInputAmount = calculateInputAmountFromOutputAmount(
        outputTokenAmountBN,
        inputTokenReserveQtyBN,
        outputTokenReserveQtyBN,
        slippagePercentBN,
        liquidityFeeInBasisPointsBN,
      );

      expect(expectedInputAmount.toNumber()).to.equal(calculatedInputAmount.toNumber());
    });

    it('Should return an error when incorrect values are provided', async () => {
      const outputTokenAmountBN = BigNumber(100);
      const negativeInputTokenReserveQtyBN = BigNumber(-1000);
      const outputTokenReserveQtyBN = BigNumber(1000);
      const slippagePercentBN = BigNumber(5);
      const liquidityFeeInBasisPointsBN = BigNumber(3000);

      // ZERO case
      expect(() =>
        calculateInputAmountFromOutputAmount(
          outputTokenAmountBN,
          ZERO,
          outputTokenReserveQtyBN,
          slippagePercentBN,
          liquidityFeeInBasisPointsBN,
        ),
      ).to.throw(INSUFFICIENT_LIQUIDITY);

      // Negative inputs provided
      expect(() =>
        calculateInputAmountFromOutputAmount(
          outputTokenAmountBN,
          negativeInputTokenReserveQtyBN,
          outputTokenReserveQtyBN,
          slippagePercentBN,
          liquidityFeeInBasisPointsBN,
        ),
      ).to.throw(NEGATIVE_INPUT);

      // Nan cases
      expect(() =>
        calculateInputAmountFromOutputAmount(
          outputTokenAmountBN,
          null,
          outputTokenReserveQtyBN,
          slippagePercentBN,
          liquidityFeeInBasisPointsBN,
        ),
      ).to.throw(NAN_ERROR);

      expect(() =>
        calculateInputAmountFromOutputAmount(
          outputTokenAmountBN,
          undefined,
          outputTokenReserveQtyBN,
          slippagePercentBN,
          liquidityFeeInBasisPointsBN,
        ),
      ).to.throw(NAN_ERROR);
    });
  });
});
