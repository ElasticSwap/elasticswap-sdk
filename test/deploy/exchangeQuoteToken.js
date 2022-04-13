const ERC20PresetFixedSupply = require('@elasticswap/elasticswap/artifacts/@openzeppelin/contracts/token/ERC20/presets/ERC20PresetFixedSupply.sol/ERC20PresetFixedSupply.json');

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const namedAccounts = await getNamedAccounts();
  const { admin } = namedAccounts;
  const initialSupply = '10000000000000000000000000000000';
  const deployResult = await deploy('ExchangeQuoteToken', {
    from: admin,
    contract: ERC20PresetFixedSupply,
    args: ['StaticTokenMock', 'STM', initialSupply, admin],
  });
  if (deployResult.newlyDeployed) {
    log(
      `contract ExchangeQuoteToken deployed at ${deployResult.address}\
      using ${deployResult.receipt.gasUsed} gas`,
    );
  }
};
module.exports.tags = ['ExchangeQuoteToken'];
