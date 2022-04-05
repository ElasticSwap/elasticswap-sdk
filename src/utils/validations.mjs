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

/**
 * Returns a formatted error message for use with throw
 *
 * @param {Object} options - { message, prefix }
 * @param {string} options.message - the message
 * @param {string} options.prefix - the prefix, default is '@elasticswap/sdk - validations'
 * @return {string}
 */
const buildError = ({ message, prefix = '@elasticswap/sdk - validations' }) =>
  `${prefix}: ${message}`;

/**
 * returns true if the result is truthy or throws a TypeError as specified by options
 *
 * @export
 * @param {Object} options - { level, message, prefix, throwError = true }
 * @param {string} options.level - the name of the console function to use, default is 'error'
 * @param {string} options.message - the error message in case result is false
 * @param {string} options.prefix - the prefix, default is '@elasticswap/sdk - validations'
 * @return {boolean}
 */
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

/**
 * validates that thing is an Array
 *
 * @export
 * @param {*} thing - the thing to validate
 * @param {Object} options - @see {@link validate}
 * @return {boolean}
 */
export const validateIsArray = (thing, options = {}) => {
  const defaultMessage = 'not an Array';
  return validate(isArray(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

/**
 * validates that thing is a MikeMCL BigNumber
 *
 * @export
 * @param {*} thing - the thing to validate
 * @param {Object} options - @see {@link validate}
 * @return {boolean}
 */
export const validateIsBigNumber = (thing, options = {}) => {
  const defaultMessage = 'not a BigNumber';
  return validate(isBigNumber(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

/**
 * validates that thing is a Date
 *
 * @export
 * @param {*} thing - the thing to validate
 * @param {Object} options - @see {@link validate}
 * @return {boolean}
 */
export const validateIsDate = (thing, options = {}) => {
  const defaultMessage = 'not a Date object';
  return validate(isDate(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

/**
 * validates that thing is a Function
 *
 * @export
 * @param {*} thing - the thing to validate
 * @param {Object} options - @see {@link validate}
 * @return {boolean}
 */
export const validateIsFunction = (thing, options = {}) => {
  const defaultMessage = 'not a function';
  return validate(isFunction(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

/**
 * validates that thing is a Number
 *
 * @export
 * @param {*} thing - the thing to validate
 * @param {Object} options - @see {@link validate}
 * @return {boolean}
 */
export const validateIsNumber = (thing, options = {}) => {
  const defaultMessage = 'not a number';
  return validate(isNumber(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

/**
 * validates that thing is a plain Object
 *
 * @export
 * @param {*} thing - the thing to validate
 * @param {Object} options - @see {@link validate}
 * @return {boolean}
 */
export const validateIsPOJO = (thing, options = {}) => {
  const defaultMessage = 'not a POJO';
  return validate(isPOJO(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

/**
 * validates that thing is a Set
 *
 * @export
 * @param {*} thing - the thing to validate
 * @param {Object} options - @see {@link validate}
 * @return {boolean}
 */
export const validateIsSet = (thing, options = {}) => {
  const defaultMessage = 'not a Set';
  return validate(isSet(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

/**
 * validates that thing is a String
 *
 * @export
 * @param {*} thing - the thing to validate
 * @param {Object} options - @see {@link validate}
 * @return {boolean}
 */
export const validateIsString = (thing, options = {}) => {
  const defaultMessage = 'not a string';
  return validate(isString(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

// Blockchain

/**
 * validates that thing is an EVM address
 *
 * @export
 * @param {*} thing - the thing to validate
 * @param {Object} options - @see {@link validate}
 * @return {boolean}
 */
export const validateIsAddress = (thing, options = {}) => {
  const defaultMessage = 'not an Ethereum address';
  return validate(isAddress(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};

/**
 * validates that thing is an EVM transaction hash
 *
 * @export
 * @param {*} thing - the thing to validate
 * @param {Object} options - @see {@link validate}
 * @return {boolean}
 */
export const validateIsTransactionHash = (thing, options = {}) => {
  const defaultMessage = 'not an Ethereum transaction hash';
  return validate(isTransactionHash(thing), {
    ...options,
    message: options.message || defaultMessage,
  });
};
