require('@nomiclabs/hardhat-web3')
require('@nomiclabs/hardhat-truffle5')

module.exports = {
  solidity: '0.7.1',
  networks: {
    development: {
      gas: 8000000,
      network_id: '15',
      url: 'http://localhost:8545'
    }
  }
}
