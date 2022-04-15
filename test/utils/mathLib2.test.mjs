/* eslint import/extensions: 0 */
import { expect } from 'chai';
import { ethers } from 'ethers';
import {
  BASIS_POINTS,
  calculateQtyToReturnAfterFees,
  getBaseTokenQtyFromQuoteTokenQty,
  getLPTokenQtyFromTokenQtys,
} from '../../src/utils/mathLib2.mjs';

describe('MathLib2', async () => {
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
      console.log(calculatedLPTokenGenerated.toString());
      expect(calculatedLPTokenGenerated.toString()).to.equal('1000000000000000002400');
    });

    it('Properly issues LP when base token decay is present and SAE (partial) happens', () => {
      // internalBalances { baseTokenReserveQty, quoteTokenReserveQty }
      // we have 1000:5000 base:quote in the pool initially, base token rebases up by 500
      // quote token required (for complete offset) => 500/(1000/5000) => 2500
      // providing 1250 quote should provide ~half of the amount as you would get with complete SAE
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
      console.log(calculatedLPTokenGenerated.toString());
      expect(calculatedLPTokenGenerated.toString()).to.equal('499999999999999999450');
    });

    it.only('Properly issues LP when base token decay is present and SAE + DAE happens', () => {
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
      // User has provided additional 1000 quote and 1000 base, for this DAE LP gets additiona; ~800 Ro
      // Therefore, LP issued is ~1800 for the participant LP
      expect(calculatedLPTokenGenerated.toString()).to.equal('1800000000000000002720');
    });
  });
});
