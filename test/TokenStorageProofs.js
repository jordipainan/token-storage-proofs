const { assert } = require('hardhat')
const StorageProofs = require('../lib/storage-proofs')

const TokenStorageProofs = artifacts.require('TokenStorageProofs')
const ERC20 = artifacts.require('ERC20Mock')


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

contract('TokenStorageProofs', ([holder]) => {
  let tokenStorageProofs, token, mintBlockNumber, mintProof
  const BALANCE_MAPPING_SLOT = '1'
 
  describe("token storage proofs register token", () => {

    it('should register a token if msg.sender is holder', async() => {
      // create contracts
      tokenStorageProofs = await TokenStorageProofs.new()
      token = await ERC20.new()
      // mint erc20 token
      await token.mint(holder, 1000)
      // get mint block number
      mintBlockNumber = await web3.eth.getBlockNumber()
      // get token account proof
      mintProof = await StorageProofs.getProof(token.address, [], mintBlockNumber, false)
      // get balance slot of holder
      let balanceSlot = await tokenStorageProofs.getBalanceSlot(holder, BALANCE_MAPPING_SLOT)
      // get holder storage proof
      let pprof = await StorageProofs.getProof(token.address, [balanceSlot], mintBlockNumber, false)
      // register token
      let registered = await tokenStorageProofs.registerToken(token.address, mintBlockNumber, pprof.storageProofsRLP[0], mintProof.blockHeaderRLP, mintProof.accountProofRLP, BALANCE_MAPPING_SLOT)
      assert.equal(registered.logs[0].event, "TokenRegistered")
    })
    
    it('should not register a token if msg.sender is not holder', async() => {
      // create contracts
      tokenStorageProofs = await TokenStorageProofs.new()
      token = await ERC20.new()
      // NO MINT
      // get mint block number
      mintBlockNumber = await web3.eth.getBlockNumber()
      // get token account proof
      mintProof = await StorageProofs.getProof(token.address, [], mintBlockNumber, false)
      // get balance slot of holder
      let balanceSlot = await tokenStorageProofs.getBalanceSlot(holder, BALANCE_MAPPING_SLOT)
      // get holder storage proof
      let pprof = await StorageProofs.getProof(token.address, [balanceSlot], mintBlockNumber, false)
      // register token
      try {
        await tokenStorageProofs.registerToken(token.address, mintBlockNumber, pprof.storageProofsRLP[0], mintProof.blockHeaderRLP, mintProof.accountProofRLP, BALANCE_MAPPING_SLOT)
        throw new Error("The transaction should have thrown an error but didn't")
      } catch (err) {
        assert.equal(err.receipt.status, false)
      }
    })
  })
})
