const ElasticMock = require('@elasticswap/elasticswap/artifacts/src/contracts/mocks/ElasticMock.sol/ElasticMock.json');

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const namedAccounts = await getNamedAccounts();
  const { admin } = namedAccounts;
  const initialSupply = '10000000000000000000000000000000';
  const deployResult = await deploy('ExchangeBaseToken', {
    from: admin,
    contract: ElasticMock,
    args: ['ElasticTokenMock', 'ETM', initialSupply, admin],
  });
  if (deployResult.newlyDeployed) {
    log(
      `contract ExchangeBaseToken deployed at ${deployResult.address}\
       using ${deployResult.receipt.gasUsed} gas`,
    );
  }
};
module.exports.tags = ['ExchangeBaseToken'];
