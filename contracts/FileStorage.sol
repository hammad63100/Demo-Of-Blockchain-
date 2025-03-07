// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract FileStorage {
    struct FileData {
        bytes32 merkleRoot;    // Root hash for file verification
        uint256 size;         // File size in bytes
        uint256 timestamp;    // Upload timestamp
        address uploader;     // Who uploaded the file
        string[] shardHashes; // IPFS hashes of file shards
    }

    mapping(bytes32 => FileData) public files;
    mapping(address => uint256) public userRewards;
    mapping(address => bytes32[]) public userFiles;
    
    uint256 public constant SHARD_SIZE = 1024 * 100; // 100KB per shard
    uint256 public constant REWARD_PER_SHARD = 1 ether; // 1 QRYPT per shard (100KB)
    uint256 public constant MIN_NODES = 3; // Minimum replicas for redundancy

    event FileUploaded(bytes32 indexed fileId, address uploader, uint256 shards);
    event FileVerified(bytes32 indexed fileId, address verifier);
    event RewardPaid(address indexed recipient, uint256 amount);
    event FileShared(bytes32 indexed fileId, address from, address to);

    function uploadFile(bytes32 merkleRoot, uint256 size, string[] memory shardHashes) public {
        require(size > 0, "File size must be positive");
        require(shardHashes.length > 0, "Must have at least one shard");
        
        bytes32 fileId = keccak256(abi.encodePacked(merkleRoot, msg.sender, block.timestamp));
        
        files[fileId] = FileData({
            merkleRoot: merkleRoot,
            size: size,
            timestamp: block.timestamp,
            uploader: msg.sender,
            shardHashes: shardHashes
        });

        userFiles[msg.sender].push(fileId);
        
        // Calculate and assign reward based on number of shards
        uint256 reward = (shardHashes.length * REWARD_PER_SHARD);
        userRewards[msg.sender] += reward;

        emit FileUploaded(fileId, msg.sender, shardHashes.length);
    }

    function verifyFile(bytes32 fileId, bytes32[] memory proof) public {
        FileData storage file = files[fileId];
        require(file.timestamp > 0, "File does not exist");
        
        // Verify merkle proof
        require(verifyMerkleProof(proof, file.merkleRoot), "Invalid merkle proof");
        
        // Reward verification
        uint256 verificationReward = REWARD_PER_SHARD / 10;
        userRewards[msg.sender] += verificationReward;
        
        emit FileVerified(fileId, msg.sender);
    }

    function claimRewards() public {
        uint256 reward = userRewards[msg.sender];
        require(reward > 0, "No rewards to claim");
        
        userRewards[msg.sender] = 0;
        payable(msg.sender).transfer(reward);
        
        emit RewardPaid(msg.sender, reward);
    }

    function getUserFiles(address user) public view returns (bytes32[] memory) {
        return userFiles[user];
    }

    function getFileDetails(bytes32 fileId) public view returns (FileData memory) {
        require(files[fileId].timestamp > 0, "File does not exist");
        return files[fileId];
    }

    function verifyMerkleProof(bytes32[] memory proof, bytes32 root) private pure returns (bool) {
        bytes32 computedHash = proof[0];
        
        for (uint256 i = 1; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            
            if (computedHash < proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }
        
        return computedHash == root;
    }

    // Function to handle file sharing between users
    function shareFile(bytes32 fileId, address recipient) public {
        require(files[fileId].uploader == msg.sender, "Not file owner");
        require(recipient != address(0), "Invalid recipient");
        
        userFiles[recipient].push(fileId);
        emit FileShared(fileId, msg.sender, recipient);
    }

    receive() external payable {}
    fallback() external payable {}
}
