const ERC20PresetFixedSupply = require('@elasticswap/elasticswap/artifacts/@openzeppelin/contracts/token/ERC20/presets/ERC20PresetFixedSupply.sol/ERC20PresetFixedSupply.json');

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const namedAccounts = await getNamedAccounts();
  const { admin } = namedAccounts;
  const initialSupply = '10000000000000000000000000000000';
  const deployResult = await deploy('QuoteToken', {
    from: admin,
    contract: ERC20PresetFixedSupply,
    args: ['Fake-USD', 'FUSD', initialSupply, admin],
  });
  if (deployResult.newlyDeployed) {
    log(
      `contract QuoteToken deployed at ${deployResult.address}\
      using ${deployResult.receipt.gasUsed} gas`,
    );
  }
};
module.exports.tags = ['QuoteToken'];
