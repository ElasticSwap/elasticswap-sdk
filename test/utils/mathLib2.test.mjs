/* eslint import/extensions: 0 */
import { expect } from 'chai';
import { ethers } from 'ethers';
import {
  BASIS_POINTS,
  calculateQtyToReturnAfterFees,
  getBaseQtyFromQuoteQty,
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

  describe('getBaseQtyFromQuoteQty', () => {
    it('works with 2 - 18 decimal tokens without decay', () => {
      const quoteTokenQtyToSwap = ethers.utils.parseUnits('100', 18);
      const quoteTokenReserveQty = ethers.utils.parseUnits('150000000', 18);
      const baseTokenReserveQty = ethers.utils.parseUnits('75000000', 18);
      const fee = ethers.BigNumber.from(50); // basis points;
      const output = getBaseQtyFromQuoteQty(quoteTokenQtyToSwap, baseTokenReserveQty, fee, {
        quoteTokenReserveQty,
        baseTokenReserveQty,
      });
      expect(output.toString()).to.equal('49749966999188557204');
    });

    it('works with 2 - 18 decimal tokens with decay', () => {
      const quoteTokenQtyToSwap = ethers.utils.parseUnits('100', 18);
      const quoteTokenReserveQty = ethers.utils.parseUnits('150000000', 18);
      const baseTokenReserveQty = ethers.utils.parseUnits('75000000', 18);
      const decayAmount = ethers.utils.parseUnits('50000', 18);
      const fee = ethers.BigNumber.from(50); // basis points;
      const output = getBaseQtyFromQuoteQty(quoteTokenQtyToSwap, baseTokenReserveQty, fee, {
        quoteTokenReserveQty,
        baseTokenReserveQty: baseTokenReserveQty.add(decayAmount),
      });
      expect(output.toString()).to.equal('49783133621839489500');
    });
  });
});
