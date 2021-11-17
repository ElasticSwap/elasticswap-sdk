/* eslint import/extensions: 0 */
import chai, { expect } from 'chai';
import mathLib from '../../src/utils/MathLib.js';
// import BigNumber from 'bignumber.js';


// const { assert } = chai;
const { 
  calculateQty,
  calculateQtyToReturnAfterFees,
  calculateLiquidityTokenQtyForSingleAssetEntry,
  calculateLiquidityTokenQtyForDoubleAssetEntry,
  INSUFFICIENT_QTY,
  INSUFFICIENT_LIQUIDITY } = mathLib;

const EPSILON = .0000000000000001;

describe("calculateQty", () => {

  it("Should return the correct calculateQty", async () => {
    
    expect(calculateQty(500, 100, 5000).toNumber()).to.equal(25000);
    expect(calculateQty(100, 500, 5000).toNumber()).to.equal(1000);
  });

  it("Should revert if any value is 0", async () => {
    expect(() => mathLib.calculateQty(0, 100, 500)).to.throw(INSUFFICIENT_QTY);
    expect(() => mathLib.calculateQty(500, 0, 1000)).to.throw(INSUFFICIENT_LIQUIDITY);
    expect(() => mathLib.calculateQty(500, 100, 0)).to.throw(INSUFFICIENT_LIQUIDITY);
  });

});

describe("calculateQtyToReturnAfterFees", () => {

  it("Should return the correct values", async () => {

    const tokenSwapQty = 50;
    const feeInBasisPoints = 30;
    const expectedFeeAmount = (tokenSwapQty * 30) / 10000;
    const tokenAReserveQtyBeforeTrade = 100;
    const tokenAReserveQtyAfterTrade =
      tokenAReserveQtyBeforeTrade + tokenSwapQty - expectedFeeAmount;
    const tokenBReserveQtyBeforeTrade = 5000;
    const pricingConstantK =
      tokenAReserveQtyBeforeTrade * tokenBReserveQtyBeforeTrade;

    const tokenBReserveQtyBeforeTradeAfterTrade =
      pricingConstantK / tokenAReserveQtyAfterTrade;
    const tokenBQtyExpected = Math.floor(
      tokenBReserveQtyBeforeTrade - tokenBReserveQtyBeforeTradeAfterTrade
    );

    expect(
      calculateQtyToReturnAfterFees(
        tokenSwapQty,
        tokenAReserveQtyBeforeTrade,
        tokenBReserveQtyBeforeTrade,
        feeInBasisPoints
      ).toNumber()
    ).to.equal(tokenBQtyExpected);

  });

  it("Should return the correct value when fees are zero", async () => {
    const tokenSwapQty = 15;
    const tokenAReserveQtyBeforeTrade = 2000;
    const tokenAReserveQtyAfterTrade =
      tokenAReserveQtyBeforeTrade + tokenSwapQty;
    const tokenBReserveQtyBeforeTrade = 3000;
    const pricingConstantK =
      tokenAReserveQtyBeforeTrade * tokenBReserveQtyBeforeTrade;

    const tokenBReserveQtyBeforeTradeAfterTrade =
      pricingConstantK / tokenAReserveQtyAfterTrade;
    const tokenBQtyExpected = Math.floor(
      tokenBReserveQtyBeforeTrade - tokenBReserveQtyBeforeTradeAfterTrade
    );

    expect(
      calculateQtyToReturnAfterFees(
        tokenSwapQty,
        tokenAReserveQtyBeforeTrade,
        tokenBReserveQtyBeforeTrade,
        0
      ).toNumber()
    ).to.equal(tokenBQtyExpected);
  });

});


describe("calculateLiquiditytokenQtyForDoubleAssetEntry", () => {
  it("Should return the correct qty of liquidity tokens", async () => {
    const totalSupplyOfLiquidityTokens = 50;
    const quoteTokenBalance = 50;
    const quoteTokenQtyToAdd = 15;

    expect(
      calculateLiquidityTokenQtyForDoubleAssetEntry(
        totalSupplyOfLiquidityTokens,
        quoteTokenQtyToAdd,
        quoteTokenBalance
      ).toNumber()
    ).to.equal(15);
  });
});

describe("calculateLiquidityTokenQtyForSingleAssetEntry", () => {
  it.only("Should return the correct qty of liquidity tokens with a rebase down", async () => {
    // Scenario: We have 1000:5000 A:B or X:Y, a rebase down occurs (of 50 tokens)
    // and a user needs to 50 tokens in order to remove the decay
    const totalSupplyOfLiquidityTokens = 5000;
    const tokenAQtyToAdd = 50;
    const tokenAInternalReserveQtyAfterTransaction = 1000; // 950 + 50 brining us back to original state.
    const tokenBDecayChange = 250;
    const tokenBDecay = 250;

    const gamma =
      (tokenAQtyToAdd / tokenAInternalReserveQtyAfterTransaction / 2) *
      (tokenBDecayChange / tokenBDecay);
    const expectLiquidityTokens = (totalSupplyOfLiquidityTokens * gamma) / (1 - gamma);

    expect(
      calculateLiquidityTokenQtyForSingleAssetEntry(
        totalSupplyOfLiquidityTokens,
        tokenAQtyToAdd,
        tokenAInternalReserveQtyAfterTransaction,
        tokenBDecayChange,
        tokenBDecay
      ).toNumber()
    ).to.be.closeTo(expectLiquidityTokens, EPSILON);

    // if we supply half, and remove half the decay, we should get roughly 1/2 the tokens
    const tokenAQtyToAdd2 = 25;
    const tokenAInternalReserveQtyAfterTransaction2 = 975; // 950 + 25 brining us back to original state.
    const tokenBDecayChange2 = 125;
    const gamma2 =
      (tokenAQtyToAdd2 / tokenAInternalReserveQtyAfterTransaction2 / 2) *
      (tokenBDecayChange2 / tokenBDecay);
    const expectLiquidityTokens2 = (totalSupplyOfLiquidityTokens * gamma2) / (1 - gamma2);

    expect(
      calculateLiquidityTokenQtyForSingleAssetEntry(
        totalSupplyOfLiquidityTokens,
        tokenAQtyToAdd2,
        tokenAInternalReserveQtyAfterTransaction2,
        tokenBDecayChange2,
        tokenBDecay
      ).toNumber()
    ).to.be.closeTo(expectLiquidityTokens2, EPSILON);
  });

  it("Should return the correct qty of liquidity tokens with a rebase up", async () => {
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
      (totalSupplyOfLiquidityTokens * gamma) / (1 - gamma)
    );
    expect(
     calculateLiquidityTokenQtyForSingleAssetEntry(
        totalSupplyOfLiquidityTokens,
        tokenAQtyToAdd,
        tokenAInternalReserveQtyAfterTransaction,
        tokenBDecayChange,
        tokenBDecay
      ).toNumber()
    ).to.equal(expectLiquidityTokens);

    // if we supply half, and remove half the decay, we should get roughly 1/2 the tokens
    const tokenAQtyToAdd2 = 2500;
    const tokenAInternalReserveQtyAfterTransaction2 = 6250;
    const tokenBDecayChange2 = 250;
    const gamma2 =
      (tokenAQtyToAdd2 / tokenAInternalReserveQtyAfterTransaction2 / 2) *
      (tokenBDecayChange2 / tokenBDecay);
    const expectLiquidityTokens2 = Math.floor(
      (totalSupplyOfLiquidityTokens * gamma2) / (1 - gamma2)
    );

    expect(
      calculateLiquidityTokenQtyForSingleAssetEntry(
        totalSupplyOfLiquidityTokens,
        tokenAQtyToAdd2,
        tokenAInternalReserveQtyAfterTransaction2,
        tokenBDecayChange2,
        tokenBDecay
      ).toNumber()
    ).to.equal(expectLiquidityTokens2);
  });
});


  



