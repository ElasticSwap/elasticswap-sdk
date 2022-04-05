const Exchange = require('@elasticswap/elasticswap/artifacts/src/contracts/Exchange.sol/Exchange.json');

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const namedAccounts = await getNamedAccounts();
  const { admin } = namedAccounts;
  const baseToken = await deployments.get('BaseToken');
  const baseTokenAddress = baseToken.address;
  const quoteToken = await deployments.get('QuoteToken');
  const quoteTokenAddress = quoteToken.address;
  const exchangeFactory = await deployments.get('ExchangeFactory');
  const exchangeFactoryAddress = exchangeFactory.address;
  const mathLib = await deployments.get('MathLib');
  const deployResult = await deploy('Exchange', {
    from: admin,
    contract: Exchange,
    args: [
      'ETMFUSD LP Token',
      'ETMFUSD',
      baseTokenAddress,
      quoteTokenAddress,
      exchangeFactoryAddress,
    ],
    libraries: {
      MathLib: mathLib.address,
    },
  });
  if (deployResult.newlyDeployed) {
    log(
      `contract Exchange deployed at ${deployResult.address}\
       using ${deployResult.receipt.gasUsed} gas`,
    );
  }
};
module.exports.tags = ['Exchange'];
module.exports.dependencies = ['BaseToken', 'QuoteToken', 'MathLib', 'ExchangeFactory'];
