import BigNumber from 'bignumber.js';
import isPlainObject from 'is-plain-object';
import { ethers } from 'ethers';

// Core

export const isArray = (thing) => Array.isArray(thing);

export const isBigNumber = (thing) => thing && BigNumber.isBigNumber(thing) && !thing.isNaN();

export const isDate = (thing) => thing && typeof thing === 'object' && thing instanceof Date;

export const isFunction = (thing) => thing && {}.toString.call(thing) === '[object Function]';

export const isNumber = (thing) => !Number.isNaN(thing);

export const isPOJO = isPlainObject;

export const isSet = (thing) => thing && typeof thing === 'object' && thing instanceof Set;

export const isString = (thing) => typeof thing === 'string' || thing instanceof String;

// Blockchain

export const isAddress = (thing) => ethers.utils.isAddress(thing);

export const isTransactionHash = (thing) =>
  thing && isString(thing) && ethers.utils.isHexString(thing) && thing.length === 66;
