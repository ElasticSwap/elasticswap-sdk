const Exchange = require('@elasticswap/elasticswap/artifacts/src/contracts/Exchange.sol/Exchange.json');
const ElasticMock = require('@elasticswap/elasticswap/artifacts/src/contracts/mocks/ElasticMock.sol/ElasticMock.json');

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const namedAccounts = await getNamedAccounts();
  const { admin } = namedAccounts;

  const baseToken = await deployments.get('ExchangeBaseToken');
  const quoteToken = await deployments.get('ExchangeQuoteToken');
  const exchangeFactory = await deployments.get('ExchangeFactory');
  const exchangeFactoryAddress = exchangeFactory.address;
  const mathLib = await deployments.get('MathLib');
  const deployResult = await deploy('Exchange', {
    from: admin,
    contract: Exchange,
    args: [
      'DQTvDBT LP Token',
      'ELP',
      baseToken.address,
      quoteToken.address,
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
module.exports.dependencies = ['MathLib', 'ExchangeFactory', 'ExchangeBaseToken', 'ExchangeQuoteToken'];
