import { expect } from "chai";
import customFetch from 'node-fetch';
import * as elasticSwapSDK from '../src/index.mjs';
import LocalStorageAdapterMock from './adapters/LocalStorageAdapterMock.mjs';

export const buildCoreObjects = async (deployments, provider) => {
  const { SDK, utils } = elasticSwapSDK;

  const sdkConfig = await buildSDKConfig(deployments, provider);

  // deployments
  const BaseToken = await deployments.get('BaseToken');
  const Exchange = await deployments.get('Exchange');
  const ExchangeFactory = await deployments.get('ExchangeFactory');
  const MathLib = await deployments.get('MathLib');
  const QuoteToken = await deployments.get('QuoteToken');

  // sdk
  const sdk = new SDK(sdkConfig);
  await sdk.awaitInitialized();

  await sdk.provider.send("evm_setIntervalMining", [100]); // mine a block every 100 ms

  // class instances
  const baseToken = sdk.erc20(BaseToken.address);
  const quoteToken = sdk.erc20(QuoteToken.address);

  // contracts - NOTE: These are readonly
  const baseTokenContract = sdk.contract(BaseToken);
  const exchangeFactoryContract = sdk.contract(ExchangeFactory);
  const quoteTokenContract = sdk.contract(QuoteToken);

  // token contract decimals - we could look these up, but we already know
  const baseTokenDecimals = 18;
  const quoteTokenDecimals = 18;

  // extremely common utils
  const { toBigNumber } = utils;

  return {
    baseToken,
    BaseToken,
    baseTokenContract,
    baseTokenDecimals,
    elasticSwapSDK,
    Exchange,
    ExchangeFactory,
    exchangeFactoryContract,
    MathLib,
    quoteToken,
    QuoteToken,
    quoteTokenContract,
    quoteTokenDecimals,
    sdk,
    SDK,
    sdkConfig,
    toBigNumber,
    utils,
  }
}

export const buildSDKConfig = async (testDeployments, provider) => {
  await testDeployments.fixture();
  const network = await provider.getNetwork();
  const chainId = network.chainId.toString()
  const chainHex = elasticSwapSDK.utils.toHex(chainId);
  const storageAdapter = new LocalStorageAdapterMock();

  const Exchange = await testDeployments.get('Exchange');
  const ExchangeFactory = await testDeployments.get('ExchangeFactory');
  const MathLib = await testDeployments.get('MathLib');

  const contracts = {};
  contracts[chainHex] = {
    Exchange: { abi: Exchange.abi, address: Exchange.address },
    ExchangeFactory: { abi: ExchangeFactory.abi, address: ExchangeFactory.address },
    MathLib: { abi: MathLib.abi, address: MathLib.address },
  }

  const deployments = {};
  deployments[chainId] = [{
    chainId,
    contracts: contracts[chainHex],
    name: 'Hardhat',
  }];

  return {
    customFetch,
    env: {
      contracts,
      deployments,
    },
    provider,
    storageAdapter,
  };
};


export const expectThrowsAsync = async (method, errorMessage) => {
  let error = null;
  try {
    await method();
  } catch (err) {
    error = err;
  }
  expect(error).to.be.an('Error');
  if (errorMessage) expect(error.message).to.equal(errorMessage);
};