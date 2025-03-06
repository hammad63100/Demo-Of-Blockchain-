pahly node intsall-ipfs.js chalna hay 

//node forceforce-cleanup-ipfs.js

terminal no 1 
1. cd ipfs-bin\kubo
2. .\ipfs.exe init
3. .\ipfs.exe daemon


terminal no 2
npm run start

terminal no 3
node scripts/start-local-node.js

terminal 4
npx hardhat run scripts/deploy.js --network qryptumTest


uploadedFiles.json
This file contains metadata for all uploaded files, including file name, type, size, IPFS hash, Pinata URL, timestamp, uploader, and transaction details.

test-upload.html
This HTML file provides the frontend interface for the blockchain file upload system. It includes sections for authentication, system status, file upload, and blockchain data. It also contains styles and scripts for handling user interactions and connecting to the backend API.

start-node.js
This script initializes and starts the P2P node. It sets up the IPFS and libp2p configurations, handles graceful shutdown, and logs the status of the node.

p2p-node.js
This module defines the P2PNode class, which manages the P2P network, IPFS interactions, and smart contract operations. It includes methods for initializing the node, uploading and downloading files, verifying blocks, and handling events.

StorageArtifact.js
This file contains the ABI (Application Binary Interface) for the smart contract used in the application. It defines the structure of the contract's functions and events.

Storage.sol
This Solidity contract defines a simple storage system for files. It includes functions for storing and retrieving files, as well as events for file storage and retrieval.

FileStorage.sol
This Solidity contract defines a more advanced file storage system with support for file sharding, merkle tree verification, rewards, and file sharing. It includes functions for uploading, verifying, and sharing files, as well as claiming rewards.

backend.js
This Node.js script sets up the backend server using Express. It handles user authentication, file uploads, blockchain data retrieval, and WebSocket connections for real-time updates. It also interacts with Pinata for IPFS file storage and manages the P2P node.

.env
This file contains environment variables for the application, including Pinata JWT, encryption key, IPFS configuration, Ethereum configuration, and server port. These variables are used to configure the application and connect to external services.
