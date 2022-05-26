/* eslint import/extensions: 0 */
import { expect } from 'chai';
import { ethers } from 'ethers';
import {
  BASIS_POINTS,
  calculateQtyToReturnAfterFees,
  getAddLiquidityBaseTokenQtyFromQuoteTokenQty,
  getAddLiquidityQuoteTokenQtyFromBaseTokenQty,
  getBaseTokenQtyFromQuoteTokenQty,
  getLPTokenQtyFromTokenQtys,
  getTokenImbalanceQtys,
  WAD,
} from '../../src/utils/mathLib.mjs';

describe('MathLib', async () => {
  describe('calculateQtyToReturnAfterFees', () => {
    it('works with 2 - 18 decimal tokens', () => {
      const tokenASwapQty = ethers.utils.parseUnits('100', 18);
      const tokenAReserveQty = ethers.utils.parseUnits('150000000', 18);
      const tokenBReserveQty = ethers.utils.parseUnits('75000000', 18);
      const fee = ethers.BigNumber.from(50); // basis points;
      const output = calculateQtyToReturnAfterFees(
        tokenASwapQty,
        tokenAReserveQty,
        tokenBReserveQty,
        fee,
      );
      expect(output.toString()).to.equal('49749966999188557204');
    });

    it('works with a 18 decimal token and a 6 decimal token', () => {
      const tokenASwapQty = ethers.utils.parseUnits('100', 18);
      const tokenAReserveQty = ethers.utils.parseUnits('150000000', 18);
      const tokenBReserveQty = ethers.utils.parseUnits('75000000', 6);
      const fee = ethers.BigNumber.from(50); // basis points;
      const output = calculateQtyToReturnAfterFees(
        tokenASwapQty,
        tokenAReserveQty,
        tokenBReserveQty,
        fee,
      );
      expect(output.toString()).to.equal('49749966');
    });

    it('works with a 9 decimal token and a 6 decimal token', () => {
      const tokenASwapQty = ethers.utils.parseUnits('100', 9);
      const tokenAReserveQty = ethers.utils.parseUnits('150000000', 9);
      const tokenBReserveQty = ethers.utils.parseUnits('75000000', 6);
      const fee = ethers.BigNumber.from(50); // basis points;
      const output = calculateQtyToReturnAfterFees(
        tokenASwapQty,
        tokenAReserveQty,
        tokenBReserveQty,
        fee,
      );
      expect(output.toString()).to.equal('49749966');
    });

    it('Properly extracts fee amounts', () => {
      const tokenASwapQty = ethers.utils.parseUnits('100', 18);
      const tokenAReserveQty = ethers.utils.parseUnits('150000000', 18);
      const tokenBReserveQty = ethers.utils.parseUnits('75000000', 18);
      const fee = ethers.BigNumber.from(50); // basis points;
      const outputWithFee = calculateQtyToReturnAfterFees(
        tokenASwapQty,
        tokenAReserveQty,
        tokenBReserveQty,
        fee,
      );
      expect(outputWithFee.toString()).to.equal('49749966999188557204');

      const outputWithOutFee = calculateQtyToReturnAfterFees(
        tokenASwapQty,
        tokenAReserveQty,
        tokenBReserveQty,
        ethers.BigNumber.from(0),
      );

      const diff = outputWithOutFee.sub(outputWithFee);
      const diffInBP = diff.mul(BASIS_POINTS).div(outputWithOutFee);
      expect(diffInBP.toString()).to.equal('49');
    });
  });

  describe('getBaseTokenQtyFromQuoteTokenQty', () => {
    it('works with 2 - 18 decimal tokens without decay', () => {
      const quoteTokenQtyToSwap = ethers.utils.parseUnits('100', 18);
      const quoteTokenReserveQty = ethers.utils.parseUnits('150000000', 18);
      const baseTokenReserveQty = ethers.utils.parseUnits('75000000', 18);
      const fee = ethers.BigNumber.from(50); // basis points;
      const output = getBaseTokenQtyFromQuoteTokenQty(
        quoteTokenQtyToSwap,
        baseTokenReserveQty,
        fee,
        {
          quoteTokenReserveQty,
          baseTokenReserveQty,
        },
      );
      expect(output.toString()).to.equal('49749966999188557204');
    });

    it('works with 2 - 18 decimal tokens with decay', () => {
      const quoteTokenQtyToSwap = ethers.utils.parseUnits('100', 18);
      const quoteTokenReserveQty = ethers.utils.parseUnits('150000000', 18);
      const baseTokenReserveQty = ethers.utils.parseUnits('75000000', 18);
      const decayAmount = ethers.utils.parseUnits('50000', 18);
      const fee = ethers.BigNumber.from(50); // basis points;
      const output = getBaseTokenQtyFromQuoteTokenQty(
        quoteTokenQtyToSwap,
        baseTokenReserveQty,
        fee,
        {
          quoteTokenReserveQty,
          baseTokenReserveQty: baseTokenReserveQty.add(decayAmount),
        },
      );
      expect(output.toString()).to.equal('49783133621839489500');
    });
  });

  describe('getLPTokenQtyFromTokenQtys', () => {
    it('Properly issues LP when base token decay is present and SAE (complete) happens', () => {
      // internalBalances { baseTokenReserveQty, quoteTokenReserveQty }
      // we have 1000:5000 base:quote in the pool initially, base token rebases up by 500
      // quote token required (for complete offset) => 500/(1000/5000) => 2500
      const internalBalanceBaseTokenReserveQty = ethers.utils.parseUnits('1000', 18);
      const internalBalancesQuoteTokenReserveQty = ethers.utils.parseUnits('5000', 18);

      const internalBalancesKLast = internalBalanceBaseTokenReserveQty.mul(
        internalBalancesQuoteTokenReserveQty,
      );

      const internalBalances = {
        baseTokenReserveQty: internalBalanceBaseTokenReserveQty,
        quoteTokenReserveQty: internalBalancesQuoteTokenReserveQty,
        kLast: internalBalancesKLast,
      };
      const totalLPTokenSupply = ethers.utils.parseUnits('5000', 18);
      const baseTokenReserveQty = ethers.utils.parseUnits('1500', 18);
      const quoteTokenQty = ethers.utils.parseUnits('2500', 18);
      const baseTokenQty = ethers.BigNumber.from(0);

      const calculatedLPTokenGenerated = getLPTokenQtyFromTokenQtys(
        baseTokenQty,
        quoteTokenQty,
        baseTokenReserveQty,
        totalLPTokenSupply,
        internalBalances,
      );
      expect(calculatedLPTokenGenerated.toString()).to.equal('1000000000000000002400');
    });

    it('Properly issues LP when base token decay is present and SAE (partial) happens', () => {
      // internalBalances { baseTokenReserveQty, quoteTokenReserveQty }
      // we have 1000:5000 base:quote in the pool initially, base token rebases up by 500
      // quote token required (for complete offset) => 500/(1000/5000) => 2500
      const internalBalanceBaseTokenReserveQty = ethers.utils.parseUnits('1000', 18);
      const internalBalancesQuoteTokenReserveQty = ethers.utils.parseUnits('5000', 18);

      const internalBalancesKLast = internalBalanceBaseTokenReserveQty.mul(
        internalBalancesQuoteTokenReserveQty,
      );

      const internalBalances = {
        baseTokenReserveQty: internalBalanceBaseTokenReserveQty,
        quoteTokenReserveQty: internalBalancesQuoteTokenReserveQty,
        kLast: internalBalancesKLast,
      };
      const totalLPTokenSupply = ethers.utils.parseUnits('5000', 18);
      const baseTokenReserveQty = ethers.utils.parseUnits('1500', 18);
      const quoteTokenQty = ethers.utils.parseUnits('1250', 18);
      const baseTokenQty = ethers.BigNumber.from(0);

      const calculatedLPTokenGenerated = getLPTokenQtyFromTokenQtys(
        baseTokenQty,
        quoteTokenQty,
        baseTokenReserveQty,
        totalLPTokenSupply,
        internalBalances,
      );
      expect(calculatedLPTokenGenerated.toString()).to.equal('499999999999999999450');
    });

    it('Properly issues LP when base token decay is present and SAE + DAE happens', () => {
      // internalBalances { baseTokenReserveQty, quoteTokenReserveQty }
      // we have 1000:5000 base:quote in the pool initially, base token rebases up by 500
      // quote token required (for complete offset) => 500/(1000/5000) => 2500
      // providing 1000 base and 3500 quote -> 0,2500 for SAE and then 1000,1000 for DAE
      // total LP = LP(SAE) + LP(DAE)
      const internalBalanceBaseTokenReserveQty = ethers.utils.parseUnits('1000', 18);
      const internalBalancesQuoteTokenReserveQty = ethers.utils.parseUnits('5000', 18);

      const internalBalancesKLast = internalBalanceBaseTokenReserveQty.mul(
        internalBalancesQuoteTokenReserveQty,
      );

      const internalBalances = {
        baseTokenReserveQty: internalBalanceBaseTokenReserveQty,
        quoteTokenReserveQty: internalBalancesQuoteTokenReserveQty,
        kLast: internalBalancesKLast,
      };
      const totalLPTokenSupply = ethers.utils.parseUnits('5000', 18);
      const baseTokenReserveQty = ethers.utils.parseUnits('1500', 18);
      const quoteTokenQty = ethers.utils.parseUnits('3500', 18);
      const baseTokenQty = ethers.utils.parseUnits('1000', 18);

      const calculatedLPTokenGenerated = getLPTokenQtyFromTokenQtys(
        baseTokenQty,
        quoteTokenQty,
        baseTokenReserveQty,
        totalLPTokenSupply,
        internalBalances,
      );

      // After SAE,
      // Pool balances - 1500 base, 7500 quote (Ro outstanding is ~6k (5k initially + ~1k for SAE) )
      // LP Generated for SAE is ~1k
      // User has provided additional 1000 quote and 1000 base,for DAE LP gets additional ~800 Ro
      // Therefore, LP issued is ~1800 for the participant LP
      expect(calculatedLPTokenGenerated.toString()).to.equal('1800000000000000002720');
    });

    it('Properly issues LP when quote token decay is present and SAE (complete) occurs', () => {
      // we have 10000:10000 base:quote in the pool initially, base token rebases down by 5000
      // base token required (for complete offset) => iOmega*Decay = 1*5k = 5k
      const internalBalanceBaseTokenReserveQty = ethers.utils.parseUnits('10000', 18);
      const internalBalancesQuoteTokenReserveQty = ethers.utils.parseUnits('10000', 18);

      const internalBalancesKLast = internalBalanceBaseTokenReserveQty.mul(
        internalBalancesQuoteTokenReserveQty,
      );

      const internalBalances = {
        baseTokenReserveQty: internalBalanceBaseTokenReserveQty,
        quoteTokenReserveQty: internalBalancesQuoteTokenReserveQty,
        kLast: internalBalancesKLast,
      };
      const totalLPTokenSupply = ethers.utils.parseUnits('10000', 18);
      const baseTokenReserveQty = ethers.utils.parseUnits('5000', 18);
      const quoteTokenQty = ethers.BigNumber.from(0);
      const baseTokenQty = ethers.utils.parseUnits('5000', 18);

      const calculatedLPTokenGenerated = getLPTokenQtyFromTokenQtys(
        baseTokenQty,
        quoteTokenQty,
        baseTokenReserveQty,
        totalLPTokenSupply,
        internalBalances,
      );
      console.log('complete SAE', calculatedLPTokenGenerated.toString());
      expect(calculatedLPTokenGenerated.toString()).to.equal('3333333333333333333333');
    });

    it('Properly issues LP when quote token decay is present and SAE (partial) occurs', () => {
      // we have 10000:10000 base:quote in the pool initially, base token rebases down by 5000
      // base token required (for 50% offset) => iOmega*Decay/2 => 2500
      const internalBalanceBaseTokenReserveQty = ethers.utils.parseUnits('10000', 18);
      const internalBalancesQuoteTokenReserveQty = ethers.utils.parseUnits('10000', 18);

      const internalBalancesKLast = internalBalanceBaseTokenReserveQty.mul(
        internalBalancesQuoteTokenReserveQty,
      );

      const internalBalances = {
        baseTokenReserveQty: internalBalanceBaseTokenReserveQty,
        quoteTokenReserveQty: internalBalancesQuoteTokenReserveQty,
        kLast: internalBalancesKLast,
      };
      const totalLPTokenSupply = ethers.utils.parseUnits('10000', 18);
      const baseTokenReserveQty = ethers.utils.parseUnits('5000', 18);
      const quoteTokenQty = ethers.BigNumber.from(0);
      const baseTokenQty = ethers.utils.parseUnits('2500', 18);

      const calculatedLPTokenGenerated = getLPTokenQtyFromTokenQtys(
        baseTokenQty,
        quoteTokenQty,
        baseTokenReserveQty,
        totalLPTokenSupply,
        internalBalances,
      );
      console.log(calculatedLPTokenGenerated.toString());
      expect(calculatedLPTokenGenerated.toString()).to.equal('1666666666666666664722');
    });

    it('Properly issues LP when quote token decay is present and SAE + DAE occurs', () => {
      // we have 10000:10000 base:quote in the pool initially, base token rebases down by 5000
      // base token required (for complete offset) => iOmega*Decay = 1*5k = 5k
      // a clearer explanation of this example can be found in ElasticSwapMath.md
      const internalBalanceBaseTokenReserveQty = ethers.utils.parseUnits('10000', 18);
      const internalBalancesQuoteTokenReserveQty = ethers.utils.parseUnits('10000', 18);

      const internalBalancesKLast = internalBalanceBaseTokenReserveQty.mul(
        internalBalancesQuoteTokenReserveQty,
      );

      const internalBalances = {
        baseTokenReserveQty: internalBalanceBaseTokenReserveQty,
        quoteTokenReserveQty: internalBalancesQuoteTokenReserveQty,
        kLast: internalBalancesKLast,
      };
      const totalLPTokenSupply = ethers.utils.parseUnits('10000', 18);
      const baseTokenReserveQty = ethers.utils.parseUnits('5000', 18);
      const quoteTokenQty = ethers.utils.parseUnits('10000', 18);
      const baseTokenQty = ethers.utils.parseUnits('15000', 18);

      const calculatedLPTokenGenerated = getLPTokenQtyFromTokenQtys(
        baseTokenQty,
        quoteTokenQty,
        baseTokenReserveQty,
        totalLPTokenSupply,
        internalBalances,
      );
      expect(calculatedLPTokenGenerated.toString()).to.equal('16666666666666666666666');
    });
  });

  describe('getAddLiquidityQuoteTokenQtyFromBaseTokenQty', () => {
    it('should return correct amount of quoteToken qty, when baseDecay is present', () => {
      // 1000, 5000 -> 1500, 5000 (a rebase up occurs)
      // quotetokenReqd => alphaDecay * (iOmega) = 2500
      // if 100 BaseTokenQty -> 2500 quoteTokenQty (for baseDecay) +
      // with (1500,7500) DAE for 100 BaseTokens(100 *(7500/1500) = 500)
      // Hence if 100 Base Token for 500 Basetokendecay, quoteToken reqd is 2500 + 500
      const internalBalanceBaseTokenReserveQty = ethers.utils.parseUnits('1000', 18);
      const internalBalancesQuoteTokenReserveQty = ethers.utils.parseUnits('5000', 18);
      const internalBalancesKLast = internalBalanceBaseTokenReserveQty.mul(
        internalBalancesQuoteTokenReserveQty,
      );

      const internalBalances = {
        baseTokenReserveQty: internalBalanceBaseTokenReserveQty,
        quoteTokenReserveQty: internalBalancesQuoteTokenReserveQty,
        kLast: internalBalancesKLast,
      };

      const baseTokenReserveQty = ethers.utils.parseUnits('1500', 18);
      const baseTokenQty = ethers.utils.parseUnits('100', 18);
      const quoteTokenQty = getAddLiquidityQuoteTokenQtyFromBaseTokenQty(
        baseTokenQty,
        baseTokenReserveQty,
        internalBalances,
      );

      expect(quoteTokenQty.toString()).to.equal('3000000000000000000000');
    });

    it('should return correct amount of quoteToken qty, when quoteTokenDecay is present', () => {
      // 1000, 5000 -> 500, 5000 (a rebase down occurs)
      // baseTokenReqd = 1000-500=500
      // hence if baseTokenQty <= 500, quoteToken = 0
      // if baseToken > 500, then DAE of baseTokenQty :: (1000,1000)
      const internalBalanceBaseTokenReserveQty = ethers.utils.parseUnits('1000', 18);
      const internalBalancesQuoteTokenReserveQty = ethers.utils.parseUnits('5000', 18);
      const internalBalancesKLast = internalBalanceBaseTokenReserveQty.mul(
        internalBalancesQuoteTokenReserveQty,
      );

      const internalBalances = {
        baseTokenReserveQty: internalBalanceBaseTokenReserveQty,
        quoteTokenReserveQty: internalBalancesQuoteTokenReserveQty,
        kLast: internalBalancesKLast,
      };

      const baseTokenReserveQty = ethers.utils.parseUnits('500', 18);

      const baseTokenQty1 = ethers.utils.parseUnits('100', 18);
      const quoteTokenQty1 = getAddLiquidityQuoteTokenQtyFromBaseTokenQty(
        baseTokenQty1,
        baseTokenReserveQty,
        internalBalances,
      );
      const baseTokenQty2 = ethers.utils.parseUnits('500', 18);
      const quoteTokenQty2 = getAddLiquidityQuoteTokenQtyFromBaseTokenQty(
        baseTokenQty2,
        baseTokenReserveQty,
        internalBalances,
      );

      const baseTokenQty3 = ethers.utils.parseUnits('600', 18);
      const quoteTokenQty3 = getAddLiquidityQuoteTokenQtyFromBaseTokenQty(
        baseTokenQty3,
        baseTokenReserveQty,
        internalBalances,
      );

      expect(quoteTokenQty1.toString()).to.equal('0');
      expect(quoteTokenQty2.toString()).to.equal('0');
      expect(quoteTokenQty3.toString()).to.equal('500000000000000000000');
    });
  });

  describe('getAddLiquidityBaseTokenQtyFromQuoteTokenQty', () => {
    it('should return correct amount of baseToken qty, when baseDecay is present', () => {
      const internalBalanceBaseTokenReserveQty = ethers.utils.parseUnits('1000', 18);
      const internalBalancesQuoteTokenReserveQty = ethers.utils.parseUnits('5000', 18);
      const internalBalancesKLast = internalBalanceBaseTokenReserveQty.mul(
        internalBalancesQuoteTokenReserveQty,
      );

      const internalBalances = {
        baseTokenReserveQty: internalBalanceBaseTokenReserveQty,
        quoteTokenReserveQty: internalBalancesQuoteTokenReserveQty,
        kLast: internalBalancesKLast,
      };

      const baseTokenReserveQty = ethers.utils.parseUnits('1500', 18);
      const quoteTokenQty1 = ethers.utils.parseUnits('2600', 18);
      const baseTokenQty1 = getAddLiquidityBaseTokenQtyFromQuoteTokenQty(
        quoteTokenQty1,
        baseTokenReserveQty,
        internalBalances,
      );
      expect(baseTokenQty1.toString()).to.equal('20000000000000000000');

      const quoteTokenQty2 = ethers.utils.parseUnits('2500', 18);
      const baseTokenQty2 = getAddLiquidityBaseTokenQtyFromQuoteTokenQty(
        quoteTokenQty2,
        baseTokenReserveQty,
        internalBalances,
      );
      expect(baseTokenQty2.toString()).to.equal('0');

      const quoteTokenQty3 = ethers.utils.parseUnits('100', 18);
      const baseTokenQty3 = getAddLiquidityBaseTokenQtyFromQuoteTokenQty(
        quoteTokenQty3,
        baseTokenReserveQty,
        internalBalances,
      );
      expect(baseTokenQty3.toString()).to.equal('0');
    });

    it('should return correct amount of baseToken qty, when quoteTokenDecay is present', () => {
      const internalBalanceBaseTokenReserveQty = ethers.utils.parseUnits('1000', 18);
      const internalBalancesQuoteTokenReserveQty = ethers.utils.parseUnits('5000', 18);
      const internalBalancesKLast = internalBalanceBaseTokenReserveQty.mul(
        internalBalancesQuoteTokenReserveQty,
      );

      const internalBalances = {
        baseTokenReserveQty: internalBalanceBaseTokenReserveQty,
        quoteTokenReserveQty: internalBalancesQuoteTokenReserveQty,
        kLast: internalBalancesKLast,
      };

      const baseTokenReserveQty = ethers.utils.parseUnits('500', 18);

      const quoteTokenQty1 = ethers.utils.parseUnits('100', 18);
      const baseTokenQty1 = getAddLiquidityBaseTokenQtyFromQuoteTokenQty(
        quoteTokenQty1,
        baseTokenReserveQty,
        internalBalances,
      );
      expect(baseTokenQty1.toString()).to.equal('520000000000000000000');
    });
  });

  describe('tokenImbalanceQtys', () => {
    it('calculates imbalance as zero when no decay is present', () => {
      const baseTokenReserveQty = ethers.BigNumber.from('1000');
      const quoteTokenReserveQty = ethers.BigNumber.from('1000');
      const internalBalances = {
        baseTokenReserveQty,
        quoteTokenReserveQty,
        kLast: baseTokenReserveQty.mul(quoteTokenReserveQty),
      };

      const tokenImbalanceQtys = getTokenImbalanceQtys(baseTokenReserveQty, internalBalances);
      expect(tokenImbalanceQtys.baseTokenImbalanceQty.eq(ethers.constants.Zero)).to.be.true;
      expect(tokenImbalanceQtys.quoteTokenImbalanceQty.eq(ethers.constants.Zero)).to.be.true;
    });

    it('calculates quote token imbalance when base decay is present', () => {
      const baseTokenReserveQty = ethers.BigNumber.from('1000');
      const internalBaseTokenReserveQty = ethers.BigNumber.from('900');
      const quoteTokenReserveQty = ethers.BigNumber.from('1000');
      const internalBalances = {
        baseTokenReserveQty: internalBaseTokenReserveQty,
        quoteTokenReserveQty,
        kLast: baseTokenReserveQty.mul(quoteTokenReserveQty),
      };

      const tokenImbalanceQtys = getTokenImbalanceQtys(baseTokenReserveQty, internalBalances);
      const wRatio = internalBaseTokenReserveQty.mul(WAD).div(quoteTokenReserveQty);
      const decay = baseTokenReserveQty.sub(internalBaseTokenReserveQty);
      const quoteTokenQtyExpected = decay.mul(WAD).div(wRatio);

      expect(tokenImbalanceQtys.baseTokenImbalanceQty.eq(ethers.constants.Zero)).to.be.true;
      expect(tokenImbalanceQtys.quoteTokenImbalanceQty.eq(quoteTokenQtyExpected)).to.be.true;
    });

    it('calculates base token imbalance when quote decay is present', () => {
      const baseTokenReserveQty = ethers.BigNumber.from('1000');
      const internalBaseTokenReserveQty = ethers.BigNumber.from('1100');
      const quoteTokenReserveQty = ethers.BigNumber.from('1000');
      const internalBalances = {
        baseTokenReserveQty: internalBaseTokenReserveQty,
        quoteTokenReserveQty,
        kLast: baseTokenReserveQty.mul(quoteTokenReserveQty),
      };

      const tokenImbalanceQtys = getTokenImbalanceQtys(baseTokenReserveQty, internalBalances);
      const decay = internalBaseTokenReserveQty.sub(baseTokenReserveQty);

      expect(tokenImbalanceQtys.quoteTokenImbalanceQty.eq(ethers.constants.Zero)).to.be.true;
      expect(tokenImbalanceQtys.baseTokenImbalanceQty.eq(decay)).to.be.true;
    });
  });
});
