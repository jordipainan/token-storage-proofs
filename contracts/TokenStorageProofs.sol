// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;

import "./lib/RLP.sol";
import "./lib/TrieProofs.sol";
import "./lib/DVote.sol";
import "./lib/ProvethVerifier.sol";


contract TokenStorageProofs {
    using RLP for bytes;
    using RLP for RLP.RLPItem;
    using TrieProofs for bytes;

    uint8 private constant ACCOUNT_STORAGE_ROOT_INDEX = 2;

    string private constant ERROR_BLOCKHASH_NOT_AVAILABLE = "BLOCKHASH_NOT_AVAILABLE";
    string private constant ERROR_INVALID_BLOCK_HEADER = "INVALID_BLOCK_HEADER";
    string private constant ERROR_UNPROCESSED_STORAGE_ROOT = "UNPROCESSED_STORAGE_ROOT";

    // Proven storage root for account at block number
    mapping (address => mapping (uint256 => bytes32)) public storageRoot;

    event AccountSateProofProcessed(address indexed account, uint256 blockNumber, bytes32 storageRoot);

    function processStorageRoot(
        address account,
        uint256 blockNumber,
        bytes memory blockHeaderRLP,
        bytes memory accountStateProof
    )
        external
    {
        bytes32 blockHash = blockhash(blockNumber);
        // Before Constantinople only the most recent 256 block hashes are available
        require(blockHash != bytes32(0), ERROR_BLOCKHASH_NOT_AVAILABLE);

        // The path for an account in the state trie is the hash of its address
        bytes32 proofPath = keccak256(abi.encodePacked(account));

        // Get the account state from a merkle proof in the state trie. Returns an RLP encoded bytes array
        bytes32 stateRoot = _getStateRoot(blockHeaderRLP, blockHash);
        bytes memory accountRLP = accountStateProof.verify(stateRoot, proofPath);

        // Extract the storage root from the account node and convert to bytes32
        bytes32 accountStorageRoot = bytes32(accountRLP.toRLPItem().toList()[ACCOUNT_STORAGE_ROOT_INDEX].toUint());

        // Cache the storage root in storage as processing is expensive
        storageRoot[account][blockNumber] = accountStorageRoot;
        emit AccountSateProofProcessed(account, blockNumber, accountStorageRoot);
    }

    function getBalance(
        address token,
        address holder,
        uint256 blockNumber,
        bytes memory storageProof,
        uint256 balanceMappingPosition,
        uint256 lib
    )
        external view returns (uint256)
    {
        bytes32 root = storageRoot[token][blockNumber];
        require(root != bytes32(0), ERROR_UNPROCESSED_STORAGE_ROOT);

        // The path for a storage value is the hash of its slot
        bytes32 slot = getBalanceSlot(holder, balanceMappingPosition);
        bytes32 proofPath = keccak256(abi.encodePacked(slot));

        bytes memory value;
        if (lib == 0) {
            value = storageProof.verify(root, proofPath);
        } else if (lib == 1) {
            value = DVote.verify(storageProof, root, proofPath);
        } else {
            value = ProvethVerifier.validateMPTProof(root, _decodePath(proofPath), storageProof.toRLPItem().toList());
        }

        return value.toRLPItem().toUint();
    }

    function getBalanceSlot(address holder, uint256 balanceMappingPosition) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes32(uint256(holder)), balanceMappingPosition));
    }

    /**
    * @dev Extract state root from block header, verifying block hash
    */
    function _getStateRoot(bytes memory blockHeaderRLP, bytes32 blockHash) internal pure returns (bytes32 stateRoot) {
        require(blockHeaderRLP.length > 123, ERROR_INVALID_BLOCK_HEADER); // prevent from reading invalid memory
        require(keccak256(blockHeaderRLP) == blockHash, ERROR_INVALID_BLOCK_HEADER);
        // 0x7b = 0x20 (length) + 0x5b (position of state root in header, [91, 123])
        assembly { stateRoot := mload(add(blockHeaderRLP, 0x7b)) }
    }

    function _decodePath(bytes32 path) private pure returns (bytes memory) {
        bytes memory decodedPath = new bytes(32);
        assembly { mstore(add(decodedPath, 0x20), path) }
        return ProvethVerifier.decodeNibbles(decodedPath, 0);
    }
}
