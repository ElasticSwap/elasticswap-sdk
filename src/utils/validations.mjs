import {
  isAddress,
  isArray,
  isBigNumber,
  isDate,
  isFunction,
  isNumber,
  isPOJO,
  isSet,
  isString,
  isTransactionHash,
} from './typeChecks.mjs';

const buildError = ({ message, prefix = '@elasticswap/sdk - validations' }) =>
  `${prefix}: ${message}`;

export const validate = (result, options) => {
  const { level = 'error', message, prefix, throwError = true } = options;

  if (result) {
    return true;
  }

  const error = buildError({ message, prefix });

  if (throwError) {
    throw new TypeError(error);
  }

  console[level](error);
  return false;
};

// Core

export const validateIsArray = (thing, options = {}) => {
  const defaultMessage = 'not an Array';
  return validate(isArray(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

export const validateIsBigNumber = (thing, options = {}) => {
  const defaultMessage = 'not a BigNumber';
  return validate(isBigNumber(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

export const validateIsDate = (thing, options = {}) => {
  const defaultMessage = 'not a Date object';
  return validate(isDate(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

export const validateIsFunction = (thing, options = {}) => {
  const defaultMessage = 'not a function';
  return validate(isFunction(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

export const validateIsNumber = (thing, options = {}) => {
  const defaultMessage = 'not a number';
  return validate(isNumber(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

export const validateIsPOJO = (thing, options = {}) => {
  const defaultMessage = 'not a POJO';
  return validate(isPOJO(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

export const validateIsSet = (thing, options = {}) => {
  const defaultMessage = 'not a Set';
  return validate(isSet(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

export const validateIsString = (thing, options = {}) => {
  const defaultMessage = 'not a string';
  return validate(isString(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

// Blockchain

export const validateIsAddress = (thing, options = {}) => {
  const defaultMessage = 'not an Ethereum address';
  return validate(isAddress(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

export const validateIsTransactionHash = (thing, options = {}) => {
  const defaultMessage = 'not an Ethereum transaction hash';
  return validate(isTransactionHash(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};
