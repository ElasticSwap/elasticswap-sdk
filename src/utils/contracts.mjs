// ref: https://docs.soliditylang.org/en/v0.5.3/abi-spec.html#json

import { isArray, isPOJO, isString } from './typeChecks.mjs';
import { toHex } from './utils.mjs';

export const isAbi = (obj) => {
  if (
    isPOJO(obj) &&
    isArray(obj.abi) &&
    isString(obj.contractName) &&
    !obj.abi.map(isAbiComponent).find((bool) => bool === false)
  ) {
    return true;
  }

  return false;
};

export const isAbiComponent = (obj) => {
  if (isPOJO(obj)) {
    if (
      isAbiComponentInputsOrOutputs(obj.inputs) &&
      isString(obj.name) &&
      isAbiComponentInputsOrOutputs(obj.outputs) &&
      isString(obj.stateMutability)
    ) {
      return true;
    }
  }

  return false;
};

export const isAbiComponentInputsOrOutputs = (obj) => {
  if (isArray(obj)) {
    return !obj.map(isAbiComponentInputOrOutput).find((bool) => bool === false);
  }

  return false;
};

export const isAbiComponentInputOrOutput = (obj) => {
  if (isPOJO(obj)) {
    if (isString(obj.name) && isString(obj.type)) {
      return true;
    }
  }

  return false;
};

export const isDeployment = (obj) => {
  if (isPOJO(obj)) {
    const keys = Object.keys(obj);
    const mapping = keys.map(isStringVersionOfNumber)
    const finded = mapping.find((bool) => bool === false);
    return finded !== false;
  }

  return false;
};

export const isStringVersionOfNumber = (obj) => {
  const result = isString(obj) && parseInt(obj, 10).toString() === obj;
  return result
}

export const processContracts = (env) => {
  const contracts = {};

  const rawAbis = env.contracts.filter(isAbi).map(({ abi, contractName }) => ({ abi, contractName }));
  const rawDeployments = env.contracts.filter(isDeployment);

  const rawNetworks = new Set();
  for (let i = 0; i < rawDeployments.length; i += 1) {
    const networkIds = Object.keys(rawDeployments[i]);
    for (let j = 0; j < networkIds.length; j += 1) {
      rawNetworks.add(networkIds[j]);
    }
  }

  const uniqueNetworks = Array.from(rawNetworks);

  for (let i = 0; i < uniqueNetworks.length; i += 1) {
    const networkIdString = uniqueNetworks[i];
    const networkIdHex = toHex(networkIdString);

    contracts[networkIdHex] = {};

    for (let j = 0; j < rawAbis.length; j += 1) {
      contracts[networkIdHex]
      [rawAbis[j].contractName] = rawAbis[j];
    }

    for (let j = 0; j < rawDeployments.length; j += 1) {
      if (rawDeployments[j][networkIdString]) {
        for (let k=0; k < rawDeployments[j][networkIdString].length; k+=1) {
          if (rawDeployments[j][networkIdString][k]?.contracts) {
            contracts[networkIdHex] = { ...contracts[networkIdHex], ...rawDeployments[j][networkIdString][k].contracts };
          }
        }
      }
    }
  }

  return { ...env, contracts };
};
