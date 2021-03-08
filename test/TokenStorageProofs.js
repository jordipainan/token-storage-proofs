const StorageProofs = require('../lib/storage-proofs')

const TokenStorageProofs = artifacts.require('TokenStorageProofs')
const ERC20 = artifacts.require('ERC20Mock')

contract('TokenStorageProofs', ([holder]) => {
  let otherHolder, noHolder
  let tokenStorageProofs, token, mintBlockNumber, transferBlockNumber

  const BALANCE_MAPPING_SLOT = '1'

  const LIBS = {
    0: 'Aragon',
    1: 'Vocdoni',
    2: 'Proveth'
  }

  Object.entries(LIBS).forEach(([key, value]) => {
    describe(`${value}`, () => {
      before('setup addresses', async () => {
        otherHolder = (await web3.eth.accounts.create()).address
        noHolder = (await web3.eth.accounts.create()).address
      })

      before('deploy contracts', async () => {
        tokenStorageProofs = await TokenStorageProofs.new()
        token = await ERC20.new()
      })

      before('process storage roots', async () => {
        await token.mint(holder, 1000)

        mintBlockNumber = await web3.eth.getBlockNumber()
        const mintProof = await StorageProofs.getProof(token.address, [], mintBlockNumber, false)
        await tokenStorageProofs.processStorageRoot(token.address, mintBlockNumber, mintProof.blockHeaderRLP, mintProof.accountProofRLP)

        await token.transfer(otherHolder, 200, { from: holder })

        transferBlockNumber = await web3.eth.getBlockNumber()
        const transferProof = await StorageProofs.getProof(token.address, [], transferBlockNumber, false)
        await tokenStorageProofs.processStorageRoot(token.address, transferBlockNumber, transferProof.blockHeaderRLP, transferProof.accountProofRLP)
      })

      const getBalance = async(holder, blockNumber) => {
        const balanceSlot = await tokenStorageProofs.getBalanceSlot(holder, BALANCE_MAPPING_SLOT)
        const { storageProofsRLP } = await StorageProofs.getProof(token.address, [balanceSlot], blockNumber, false)
        return tokenStorageProofs.getBalance(token.address, holder, blockNumber, storageProofsRLP[0], BALANCE_MAPPING_SLOT, key)
      }

      it('gets balance from proof', async () => {
        const provenBalance = await getBalance(holder, mintBlockNumber)

        assert.equal(provenBalance.toNumber(), 1000)
      })

      it('gets balance from proof after transfer', async () => {
        const holderProvenBalance = await getBalance(holder, transferBlockNumber)
        assert.equal(holderProvenBalance.toNumber(), 800)

        const otherHolderProvenBalance = await getBalance(otherHolder, transferBlockNumber)
        assert.equal(otherHolderProvenBalance.toNumber(), 200)
      })

      it('gets 0 balance for non-holder from exclusion proof', async () => {
        const provenBalance = await getBalance(noHolder, mintBlockNumber)
        assert.equal(provenBalance.toNumber(), 0)
      })
    })
  })
})
