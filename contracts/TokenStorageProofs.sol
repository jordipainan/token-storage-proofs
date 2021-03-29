// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;

import "./lib/RLP.sol";
import "./lib/TrieProof.sol";
import "./lib/ContractSupport.sol";
import "./lib/IERC20.sol";

contract TokenStorageProofs {
    using RLP for bytes;
    using RLP for RLP.RLPItem;
    using TrieProof for bytes;

    uint8 private constant ACCOUNT_STORAGE_ROOT_INDEX = 2;

    string private constant ERROR_BLOCKHASH_NOT_AVAILABLE = "BLOCKHASH_NOT_AVAILABLE";
    string private constant ERROR_INVALID_BLOCK_HEADER = "INVALID_BLOCK_HEADER";
    string private constant ERROR_UNPROCESSED_STORAGE_ROOT = "UNPROCESSED_STORAGE_ROOT";

    event TokenRegistered(address indexed token, address indexed registrar);

    struct ERC20Token {
        uint256 balanceMappingPosition;
        bool registered;
    }

    // proven storage root for account at block number
    mapping(address => ERC20Token) public tokens;
    address[] public tokenAddresses;
    uint32 public tokenCount = 0;

    function isRegistered(address ercTokenAddress) public view returns (bool) {
        require(ercTokenAddress != address(0x0), "Invalid address");
        return tokens[ercTokenAddress].registered;
    }

    function registerToken(
        address token,
        uint256 blockNumber,
        bytes memory storageProof,
        bytes memory blockHeaderRLP,
        bytes memory accountStateProof,
        uint256 balanceMappingPosition
    ) public {
        // Check that the address is a contract
        require(
            ContractSupport.isContract(token),
            "The address must be a contract"
        );
        // check token is not registered
        require(!isRegistered(token), "Token already registered");

        // check msg.sender balance calling 'balanceOf' function on the ERC20 contract
        IERC20 tokenContract = IERC20(token);
        uint256 balance = tokenContract.balanceOf(msg.sender);
        require(balance > 0, "Insufficient funds");

        bytes32 root = processStorageRoot(token, blockNumber, blockHeaderRLP, accountStateProof);

        uint256 balanceFromTrie = getBalance(
            msg.sender,
            storageProof,
            root,
            balanceMappingPosition
        );
        require(balanceFromTrie > 0, "Insufficient funds");

        ERC20Token storage newToken = tokens[token];
        newToken.registered = true;
        newToken.balanceMappingPosition = balanceMappingPosition;
        tokenAddresses.push(token);
        tokenCount = tokenCount + 1;

        emit TokenRegistered(token, msg.sender);
    }

    function processStorageRoot(
        address token,
        uint256 blockNumber,
        bytes memory blockHeaderRLP,
        bytes memory accountStateProof
    )
        internal view returns (bytes32 accountStorageRoot)
    {
        bytes32 blockHash = blockhash(blockNumber);
        // Before Constantinople only the most recent 256 block hashes are available
        require(blockHash != bytes32(0), ERROR_BLOCKHASH_NOT_AVAILABLE);

        // The path for an account in the state trie is the hash of its address
        bytes32 accountProofPath = keccak256(abi.encodePacked(token));

        // Get the account state from a merkle proof in the state trie. Returns an RLP encoded bytes array
        bytes32 stateRoot = _getStateRoot(blockHeaderRLP, blockHash);
        bytes memory accountRLP = accountStateProof.verify(stateRoot, accountProofPath);

        // Extract the storage root from the account node and convert to bytes32
        accountStorageRoot = bytes32(accountRLP.toRLPItem().toList()[ACCOUNT_STORAGE_ROOT_INDEX].toUint());
    }

    function getBalance(
        address holder,
        bytes memory storageProof,
        bytes32 root,
        uint256 balanceMappingPosition
    )
        internal pure returns (uint256)
    {
        require(root != bytes32(0), ERROR_UNPROCESSED_STORAGE_ROOT);
        // The path for a storage value is the hash of its slot
        bytes32 slot = getBalanceSlot(holder, balanceMappingPosition);
        bytes32 storageProofPath = keccak256(abi.encodePacked(slot));

        bytes memory value;
        value = TrieProof.verify(storageProof, root, storageProofPath);

        return value.toRLPItem().toUint();
    }

    function getBalanceSlot(address holder, uint256 balanceMappingPosition) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes32(uint256(holder)), balanceMappingPosition));
    }


    function getBalanceMappingPosition(address ercTokenAddress) public view returns (uint256) {
        require(ercTokenAddress != address(0x0), "Invalid address");
        return tokens[ercTokenAddress].balanceMappingPosition;
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
}
