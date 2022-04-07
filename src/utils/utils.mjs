import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

import { isAddress, isBigNumber, isFunction, isNumber, isPOJO } from './typeChecks.mjs';
import { validateIsAddress, validateIsNumber } from './validations.mjs';

const prefix = '@elastic-swap/sdk';

//
// Formatting and sanitization
//

export const amountFormatter = ({
  amount,
  approximatePrefix = '~',
  decimalPlaces = 3,
  decimalShift = 0,
  fromEthers = false,
  lessThanPrefix = '< ',
  maxDigits,
  rounding = BigNumber.ROUND_DOWN,
}) => {
  if (!amount) {
    return '';
  }

  let decimals = decimalPlaces;
  let value = BigNumber(amount.toString());

  if (fromEthers) {
    value = value.dividedBy(10 ** 18);
  }

  if (decimalShift) {
    value = value.multipliedBy(10 ** decimalShift);
  }

  if (!isBigNumber(value)) {
    return '0.'.padEnd(decimalPlaces + 2, '0');
  }

  if (isNumber(maxDigits)) {
    let left = 0;
    while (BigNumber(10 ** left).isLessThan(value)) {
      left += 1;
    }
    const maxDecimals = maxDigits - left;
    if (maxDecimals < 0) {
      decimals = 0;
    } else if (maxDecimals < decimals) {
      decimals = maxDecimals;
    }
  }

  if (value.isZero()) {
    return value.toFixed(decimals);
  }

  const smallest = BigNumber(1)
    .dividedBy(10 ** decimals)
    .toString();

  if (value.isGreaterThan(0) && value.isLessThan(smallest)) {
    return `${lessThanPrefix}${smallest}`;
  }

  const base = value.toFormat(decimals, rounding);

  if (value.isGreaterThan(base)) {
    return `${approximatePrefix}${base}`;
  }

  return base;
};

export const toHex = (num) => {
  const dec = BigNumber(num).toNumber();
  return `0x${dec.toString(16).toLowerCase()}`;
};

/*
Rounding Types:
  ROUND_UP: 0 - Rounds away from zero
  ROUND_DOWN: 1 - Rounds towards zero
  ROUND_CEIL: 2 - Rounds towards Infinity
  ROUND_FLOOR: 3 - Rounds towards -Infinity
  ROUND_HALF_UP: 4 - Rounds towards nearest neighbour.
  If equidistant, rounds away from zero
  ROUND_HALF_DOWN: 5 - Rounds towards nearest neighbour.
  If equidistant, rounds towards zero
  ROUND_HALF_EVEN: 6 - Rounds towards nearest neighbour.
  If equidistant, rounds towards even neighbour
  ROUND_HALF_CEIL: 7 - Rounds towards nearest neighbour.
  If equidistant, rounds towards Infinity
  ROUND_HALF_FLOOR: 8 - Rounds towards nearest neighbour.
  If equidistant, rounds towards -Infinity
*/

export const round = (value, type = 1, decimalPlaces) => {
  const config = {
    DECIMAL_PLACES: decimalPlaces,
    ROUDING_MODE: type,
  };

  const BN = BigNumber.clone(config);

  const roundedNumber = new BN(value, 10);
  return roundedNumber;
};

export const sanitizeOverrides = (requested = {}, readonlyMethod = false) => {
  const overrides = {};
  let validKeys = [];

  if (readonlyMethod) {
    validKeys = ['blockTag', 'synchronous'];

    if (requested.blockTag) {
      try {
        overrides.blockTag = BigNumber(requested.blockTag).toNumber();
      } catch (e) {
        console.warn(
          // eslint-disable-next-line max-len
          `${prefix}: Requested override 'blockTag' (${requested.blockTag}) is invalid and was excluded (${e.message})`,
        );
      }
    }

    if (requested.synchronous) {
      overrides.synchronous = true;
    }
  } else {
    validKeys = ['from', 'gasLimit', 'gasPrice', 'nonce', 'value'];

    if (requested.from && isAddress(requested.from)) {
      overrides.from = requested.from;
    } else if (requested.from) {
      console.warn(
        // eslint-disable-next-line max-len
        `${prefix}: Requested override 'from' (${requested.from}) is not a valid address and was excluded`,
      );
    }

    if (requested.gasLimit) {
      try {
        overrides.gasLimit = toEthersBigNumber(requested.gasLimit);
      } catch (e) {
        console.warn(
          // eslint-disable-next-line max-len
          `${prefix}: Requested override 'gasLimit' (${requested.gasLimit}) is invalid and was excluded (${e.message})`,
        );
      }
    }

    if (requested.gasPrice) {
      try {
        overrides.gasPrice = toEthersBigNumber(requested.gasPrice);
      } catch (e) {
        console.warn(
          // eslint-disable-next-line max-len
          `${prefix}: Requested override 'gasPrice' (${requested.gasPrice}) is invalid and was excluded (${e.message})`,
        );
      }
    }

    if (requested.nonce && isNumber(requested.nonce)) {
      overrides.nonce = requested.nonce;
    } else if (requested.nonce) {
      console.warn(
        // eslint-disable-next-line max-len
        `${prefix}: Requested override 'nonce' (${requested.nonce}) is not a valid number and was excluded`,
      );
    }

    if (requested.value) {
      try {
        overrides.value = toEthersBigNumber(requested.value, 18);
      } catch (e) {
        console.warn(
          // eslint-disable-next-line max-len
          `${prefix}: Requested override 'value' (${requested.value}) is invalid and was excluded (${e.message})`,
        );
      }
    }
  }

  Object.keys(requested).forEach((key) => {
    if (!validKeys.includes(key)) {
      console.warn(`${prefix}: Requested override '${key}' is not supported and was excluded`);
    }
  });

  return overrides;
};

export const shortenAddress = (address, digits = 4) => {
  validateIsAddress(address, { prefix: '@elasticswap/sdk - shortenAddress' });

  const a = address.substring(0, digits + 2);
  const b = address.substring(42 - digits);

  return `${a}...${b}`;
};

export const shortenHash = (address, digits = 4) => {
  const a = address.substring(0, digits + 2);
  const b = address.substring(66 - digits);

  return `${a}...${b}`;
};

export const truncate = (str, opts = {}) => {
  if (!str) {
    return '';
  }

  const ending = opts.ending || '...';
  const length = opts.length || 40;
  const truncateNumber = opts.truncateNumber || false;
  const decimalPlaces = opts.decimalPlaces || 0;

  if (truncateNumber) {
    // When trucating a number, it must be passed as a string
    const re = new RegExp(`^-?\\d+(?:.\\d{0,${decimalPlaces || -1}})?`);
    return str.match(re)[0];
  }

  if (str.length > length) {
    return str.substring(0, length - ending.length) + ending;
  }

  return str;
};

//
// Type converters
//

export const swapBigNumber = (obj) => {
  const swappedObj = {};
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (ethers.BigNumber.isBigNumber(obj[key])) {
      swappedObj[key] = toBigNumber(obj[key], 18);
    } else if (BigNumber.isBigNumber(obj[key])) {
      swappedObj[key] = toEthersBigNumber(obj[key], 18);
    } else {
      swappedObj[key] = obj[key];
    }
  }
  return swappedObj;
};

export const toBigNumber = (value, decimalShift = 0) => {
  let normalizedValue = value;

  if (value === null || value === undefined) {
    return BigNumber(NaN);
  }

  if (isPOJO(normalizedValue) && normalizedValue.type === 'BigNumber') {
    normalizedValue = ethers.BigNumber.from(normalizedValue);
  }

  if (isFunction(normalizedValue.toString)) {
    normalizedValue = normalizedValue.toString();
  }

  return BigNumber(normalizedValue).dividedBy(10 ** decimalShift);
};

export const toEthersBigNumber = (value, decimalShift = 0) =>
  ethers.BigNumber.from(
    BigNumber(value.toString())
      .multipliedBy(10 ** decimalShift)
      .dp(0)
      .toFixed(),
  );

export const toKey = (...args) =>
  args
    .map((arg) => `${arg}`.toLowerCase())
    .filter((arg) => arg.length > 0)
    .join('|');

export const toNumber = (value, decimalShift = 0) => toBigNumber(value, decimalShift).toNumber();

export const upTo = (n) => {
  validateIsNumber(n);
  const arr = [];
  for (let i = 0; i < n; i += 1) {
    arr.push(i);
  }
  return arr;
};

export default {
  amountFormatter,
  swapBigNumber,
  toBigNumber,
  toEthersBigNumber,
  toKey,
  toNumber,
  truncate,
  upTo,
  round,
};
