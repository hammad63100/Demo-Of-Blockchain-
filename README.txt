
# Blockchain File Upload System

## Overview
This project is a blockchain-based file upload system that allows users to securely store files using blockchain technology. It includes features such as user authentication, file upload, file verification, and reward distribution.

## Features
- User Authentication (Login/Register)
- File Upload with IPFS and Pinata
- File Verification using Merkle Tree
- Reward Distribution in Ethereum
- WebSocket for real-time updates
- Peer-to-Peer (P2P) Node with libp2p

## Technologies Used
- HTML, CSS, JavaScript (Frontend)
- Node.js, Express.js (Backend)
- IPFS, Pinata (File Storage)
- Ethereum, Web3.js (Blockchain)
- WebSocket (Real-time Communication)
- libp2p (P2P Networking)
- Solidity (Smart Contracts)

## Setup Instructions

### Prerequisites
- Node.js and npm installed
- IPFS installed and running
- MetaMask browser extension
- Ethereum Sepolia Test Network

### Installation
1. Clone the repository:
   ```
   git clone <repository-url>
   cd pinata-starter
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory and add the following environment variables:
   ```
   ETH_RPC_URL=<Your Infura Project URL>
   CONTRACT_ADDRESS=<Your Deployed Contract Address>
   IPFS_REPO_PATH=./ipfs-repo
   ```

4. Start the IPFS daemon:
   ```
   ipfs daemon
   ```

5. Start the backend server:
   ```
   npm start
   ```

### Usage
1. Open `test-upload.html` in your browser.
2. Register a new user or login with existing credentials.
3. Upload a file and provide your Ethereum address.
4. Confirm the transaction in MetaMask.
5. View uploaded files and their details.

### Smart Contract
The smart contract is located in `contracts/FileStorage.sol`. It handles file uploads, verification, and reward distribution.

### Backend
The backend server is implemented in `backend.js`. It handles user authentication, file uploads, and communication with the blockchain.

### P2P Node
The P2P node is implemented in `p2p-node.js`. It uses libp2p for peer-to-peer networking and IPFS for file storage.

### Frontend
The frontend is implemented in `test-upload.html`. It provides a user interface for authentication, file upload, and viewing uploaded files.

## License
This project is licensed under the MIT License.






POST http://localhost:3001/api/upload
Headers:
- X-User-Name: [your username]
- Content-Type: multipart/form-data

Body (form-data):
- file: [select a PDF/TXT/CSV/JSON file]
- ethAddress: [your ETH address]