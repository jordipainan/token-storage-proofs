const { web3 } = require('hardhat')
const RLP = require('rlp')
const Trie = require('merkle-patricia-tree')
const EthereumBlock = require('ethereumjs-block/from-rpc')
const util = require('util')

class StorageProofs {
  async getProof (address, storageKeys = [], blockNumber = 'latest', verify = true) {
    const proof = await this._jsonRpcSend('eth_getProof', [address, storageKeys, web3.utils.toHex(blockNumber)])
    const block = await web3.eth.getBlock(blockNumber)
    const blockHeaderRLP = this._blockHeaderRLP(block)

    if (verify) {
      // Verify account proof locally
      const accountProofVerification = await this.verifyAccountProof(block.stateRoot, address, proof)
      if (!accountProofVerification) {
        throw new Error('Local verification of account proof failed')
      }

      // Verify storage proofs locally
      const storageProofs = await Promise.all(proof.storageProof.map(
        (storageProof) => this.verifyStorageProof(proof.storageHash, storageProof)
      ))

      const failedProofs = storageProofs
        .filter((result, i) => !result) // filter failed proofs
        .map((_, i) => i)

      if (failedProofs.length > 0) {
        throw new Error(`Proof failed for storage proofs ${JSON.stringify(failed)}`)
      }
    }

    const accountProofRLP = this.encodeProof(proof.accountProof)
    const storageProofsRLP = proof.storageProof.map(p => this.encodeProof(p.proof))

    return {
      proof,
      block,
      blockHeaderRLP,
      accountProofRLP,
      storageProofsRLP
    }
  }

  encodeProof (proof) {
    return '0x' + RLP.encode(proof.map(part => RLP.decode(part))).toString('hex')
  }

  async verifyAccountProof (stateRoot, address, proof) {
    const path = web3.utils.sha3(address).slice(2)

    const proofAccountRLP = await this.verifyProof(stateRoot, Buffer.from(path, 'hex'), proof.accountProof)
    const stateAccountRLP = this._accountRLP(proof)

    return Buffer.compare(stateAccountRLP, proofAccountRLP) === 0
  }

  async verifyStorageProof (storageRoot, storageProof) {
    const path = web3.utils.soliditySha3({t: 'uint256', v: storageProof.key }).slice(2)

    const proofStorageValue = await this.verifyProof(storageRoot, Buffer.from(path, 'hex'), storageProof.proof)
    const stateValueRLP = RLP.encode(storageProof.value)

    return Buffer.compare(proofStorageValue, stateValueRLP) === 0
  }

  async verifyProof (rootHash, path, proof) {
    // Note: it crashes when the account is not used??? ()
    // Error: Key does not match with the proof one (extention|leaf)
    return util.promisify(Trie.verifyProof)(rootHash, path, proof)
  }

  _accountRLP ({ nonce, balance, storageHash, codeHash }) {
    if (balance === '0x0') {
      balance = null // account RLP sets a null value if the balance is 0
    }

    return RLP.encode([nonce, balance, storageHash, codeHash])
  }

  _blockHeaderRLP (block) {
    // From https://github.com/zmitton/eth-proof/blob/master/buildProof.js#L274
    block.difficulty = '0x' + web3.utils.toBN(block.difficulty).toString(16)
    const ethereumBlock = new EthereumBlock(block)
    const blockHeaderRLP = '0x' + RLP.encode(ethereumBlock.header.raw).toString('hex')

    const solidityBlockHash = web3.utils.soliditySha3(blockHeaderRLP)

    if (solidityBlockHash !== block.hash) {
      throw new Error(`Block header rlp hash (${solidityBlockHash}) doesnt match block hash (${block.hash})`)
    }

    return blockHeaderRLP
  }

  _jsonRpcSend (method, params) {
    const payload = {
      method,
      params,
      jsonrpc: '2.0',
      id: +new Date(),
    }

    return new Promise((resolve, reject) => {
      web3.currentProvider.send(payload, (err, response) => {
        if (err) return reject(err)
        if (response.error) return reject(new Error(response.error.message))
        resolve(response.result)
      })
    })
  }
}

module.exports = new StorageProofs()
