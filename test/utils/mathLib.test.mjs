/* eslint import/extensions: 0 */
import { expect } from 'chai';
import BigNumber from 'bignumber.js';
import {
  BASIS_POINTS,
  calculateExchangeRate,
  calculateFees,
  calculateInputAmountFromOutputAmount,
  calculateLiquidityTokenQtyForDoubleAssetEntry,
  calculateLiquidityTokenQtyForSingleAssetEntry,
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
      const tokenSwapQty = 50;
      const feeInBasisPoints = 30;
      const expectedFeeAmount = (tokenSwapQty * 30) / 10000;
      const tokenAReserveQtyBeforeTrade = 100;
      const tokenAReserveQtyAfterTrade =
        tokenAReserveQtyBeforeTrade + tokenSwapQty - expectedFeeAmount;
      const tokenBReserveQtyBeforeTrade = 5000;
      const pricingConstantK = tokenAReserveQtyBeforeTrade * tokenBReserveQtyBeforeTrade;

      const tokenBReserveQtyBeforeTradeAfterTrade = pricingConstantK / tokenAReserveQtyAfterTrade;
      const tokenBQtyExpected = Math.floor(
        tokenBReserveQtyBeforeTrade - tokenBReserveQtyBeforeTradeAfterTrade,
      );

      expect(
        calculateQtyToReturnAfterFees(
          tokenSwapQty,
          tokenAReserveQtyBeforeTrade,
          tokenBReserveQtyBeforeTrade,
          feeInBasisPoints,
        ).toNumber(),
      ).to.equal(tokenBQtyExpected);
    });

    it('Should return the correct value when fees are zero', async () => {
      const tokenSwapQty = 15;
      const tokenAReserveQtyBeforeTrade = 2000;
      const tokenAReserveQtyAfterTrade = tokenAReserveQtyBeforeTrade + tokenSwapQty;
      const tokenBReserveQtyBeforeTrade = 3000;
      const pricingConstantK = tokenAReserveQtyBeforeTrade * tokenBReserveQtyBeforeTrade;

      const tokenBReserveQtyBeforeTradeAfterTrade = pricingConstantK / tokenAReserveQtyAfterTrade;
      const tokenBQtyExpected = Math.floor(
        tokenBReserveQtyBeforeTrade - tokenBReserveQtyBeforeTradeAfterTrade,
      );

      expect(
        calculateQtyToReturnAfterFees(
          tokenSwapQty,
          tokenAReserveQtyBeforeTrade,
          tokenBReserveQtyBeforeTrade,
          0,
        ).toNumber(),
      ).to.equal(tokenBQtyExpected);
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
      const totalSupplyOfLiquidityTokens = 5000;
      const tokenAQtyToAdd = 50;
      // 950 + 50 brining us back to original state.
      const tokenAInternalReserveQtyAfterTransaction = 1000;
      const tokenBDecayChange = 250;
      const tokenBDecay = 250;

      const gamma =
        (tokenAQtyToAdd / tokenAInternalReserveQtyAfterTransaction / 2) *
        (tokenBDecayChange / tokenBDecay);
      const expectLiquidityTokens = Math.floor(
        (totalSupplyOfLiquidityTokens * gamma) / (1 - gamma),
      );

      expect(
        calculateLiquidityTokenQtyForSingleAssetEntry(
          totalSupplyOfLiquidityTokens,
          tokenAQtyToAdd,
          tokenAInternalReserveQtyAfterTransaction,
          tokenBDecayChange,
          tokenBDecay,
        ).toNumber(),
      ).to.equal(expectLiquidityTokens);

      // if we supply half, and remove half the decay, we should get roughly 1/2 the tokens
      const tokenAQtyToAdd2 = 25;
      // 950 + 25 brining us back to original state.
      const tokenAInternalReserveQtyAfterTransaction2 = 975;
      const tokenBDecayChange2 = 125;
      const gamma2 =
        (tokenAQtyToAdd2 / tokenAInternalReserveQtyAfterTransaction2 / 2) *
        (tokenBDecayChange2 / tokenBDecay);
      const expectLiquidityTokens2 = Math.floor(
        (totalSupplyOfLiquidityTokens * gamma2) / (1 - gamma2),
      );

      expect(
        calculateLiquidityTokenQtyForSingleAssetEntry(
          totalSupplyOfLiquidityTokens,
          tokenAQtyToAdd2,
          tokenAInternalReserveQtyAfterTransaction2,
          tokenBDecayChange2,
          tokenBDecay,
        ).toNumber(),
      ).to.equal(expectLiquidityTokens2);
    });

    it('Should return the correct qty of liquidity tokens with a rebase up', async () => {
      // Scenario: We have 1000:5000 A:B or X:Y, a rebase up occurs (of 500 tokens)
      // and a user needs to add 2500 quote tokens to remove the base decay
      const totalSupplyOfLiquidityTokens = 5000;
      const tokenAQtyToAdd = 2500;
      const tokenAInternalReserveQtyAfterTransaction = 7500; // 5000 + 2500 to offset rebase up
      const tokenBDecayChange = 500;
      const tokenBDecay = 500;

      const gamma =
        (tokenAQtyToAdd / tokenAInternalReserveQtyAfterTransaction / 2) *
        (tokenBDecayChange / tokenBDecay);
      const expectLiquidityTokens = Math.floor(
        (totalSupplyOfLiquidityTokens * gamma) / (1 - gamma),
      );
      expect(
        calculateLiquidityTokenQtyForSingleAssetEntry(
          totalSupplyOfLiquidityTokens,
          tokenAQtyToAdd,
          tokenAInternalReserveQtyAfterTransaction,
          tokenBDecayChange,
          tokenBDecay,
        ).toNumber(),
      ).to.equal(expectLiquidityTokens);

      // if we supply half, and remove half the decay, we should get roughly 1/2 the tokens
      const tokenAQtyToAdd2 = 2500;
      const tokenAInternalReserveQtyAfterTransaction2 = 6250;
      const tokenBDecayChange2 = 250;
      const gamma2 =
        (tokenAQtyToAdd2 / tokenAInternalReserveQtyAfterTransaction2 / 2) *
        (tokenBDecayChange2 / tokenBDecay);
      const expectLiquidityTokens2 = Math.floor(
        (totalSupplyOfLiquidityTokens * gamma2) / (1 - gamma2),
      );

      expect(
        calculateLiquidityTokenQtyForSingleAssetEntry(
          totalSupplyOfLiquidityTokens,
          tokenAQtyToAdd2,
          tokenAInternalReserveQtyAfterTransaction2,
          tokenBDecayChange2,
          tokenBDecay,
        ).toNumber(),
      ).to.equal(expectLiquidityTokens2);
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
      const slippage = 5;
      const tokenSwapQty = 50;
      const feeInBasisPoints = 30;
      const expectedFeeAmount = (tokenSwapQty * 30) / 10000;
      const tokenAReserveQtyBeforeTrade = 100;
      const tokenAReserveQtyAfterTrade =
        tokenAReserveQtyBeforeTrade + tokenSwapQty - expectedFeeAmount;
      const tokenBReserveQtyBeforeTrade = 5000;
      const pricingConstantK = tokenAReserveQtyBeforeTrade * tokenBReserveQtyBeforeTrade;

      const tokenBReserveQtyBeforeTradeAfterTrade = pricingConstantK / tokenAReserveQtyAfterTrade;
      const tokenBQtyExpected = Math.floor(
        tokenBReserveQtyBeforeTrade - tokenBReserveQtyBeforeTradeAfterTrade,
      );

      const tokenBQtyExpectedLessSlippage = tokenBQtyExpected * (1 - slippage / 100);

      expect(
        calculateOutputAmountLessFees(
          tokenSwapQty,
          tokenAReserveQtyBeforeTrade,
          tokenBReserveQtyBeforeTrade,
          slippage,
          feeInBasisPoints,
        ).toNumber(),
      ).to.equal(tokenBQtyExpectedLessSlippage);
    });

    it('Should calculateOutputAmount correctly, accounting for fees and 0 slippage', async () => {
      // no slippage
      const tokenSwapQty = 50;
      const feeInBasisPoints = 30;
      const expectedFeeAmount = (tokenSwapQty * 30) / 10000;
      const tokenAReserveQtyBeforeTrade = 100;
      const tokenAReserveQtyAfterTrade =
        tokenAReserveQtyBeforeTrade + tokenSwapQty - expectedFeeAmount;
      const tokenBReserveQtyBeforeTrade = 5000;
      const pricingConstantK = tokenAReserveQtyBeforeTrade * tokenBReserveQtyBeforeTrade;

      const tokenBReserveQtyBeforeTradeAfterTrade = pricingConstantK / tokenAReserveQtyAfterTrade;
      const tokenBQtyExpected = Math.floor(
        tokenBReserveQtyBeforeTrade - tokenBReserveQtyBeforeTradeAfterTrade,
      );

      expect(
        calculateOutputAmountLessFees(
          tokenSwapQty,
          tokenAReserveQtyBeforeTrade,
          tokenBReserveQtyBeforeTrade,
          ZERO,
          feeInBasisPoints,
        ).toNumber(),
      ).to.equal(tokenBQtyExpected);
    });

    it('Should calculateOutputAmount correctly, accounting for 0 fees and 0 slippage', async () => {
      // no slippage no fees
      const tokenSwapQty = 15;
      const tokenAReserveQtyBeforeTrade = 2000;
      const tokenAReserveQtyAfterTrade = tokenAReserveQtyBeforeTrade + tokenSwapQty;
      const tokenBReserveQtyBeforeTrade = 3000;
      const pricingConstantK = tokenAReserveQtyBeforeTrade * tokenBReserveQtyBeforeTrade;

      const tokenBReserveQtyBeforeTradeAfterTrade = pricingConstantK / tokenAReserveQtyAfterTrade;
      const tokenBQtyExpected = Math.floor(
        tokenBReserveQtyBeforeTrade - tokenBReserveQtyBeforeTradeAfterTrade,
      );

      expect(
        calculateOutputAmountLessFees(
          tokenSwapQty,
          tokenAReserveQtyBeforeTrade,
          tokenBReserveQtyBeforeTrade,
          ZERO,
          ZERO,
        ).toNumber(),
      ).to.equal(tokenBQtyExpected);
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
