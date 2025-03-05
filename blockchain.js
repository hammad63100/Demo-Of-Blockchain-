import fs from 'fs/promises';
import crypto from 'crypto';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { calculateFileHash, verifyProofOfData } from './utils/pod-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Block {
    constructor(data, previousHash = '') {
        this.timestamp = new Date().toISOString();
        this.data = data;
        this.previousHash = previousHash;
        this.nonce = 0;
        this.podProof = { fileHash: '', timestamp: 0, nonce: 0 };
        this.hash = this.calculateHash();
    }

    // ✅ Calculate the block's hash including PoD Proof
    calculateHash() {
        const blockString = JSON.stringify({
            timestamp: this.timestamp,
            data: this.data,
            previousHash: this.previousHash,
            nonce: this.nonce,
            podProof: this.podProof
        });
        return crypto.createHash('sha256').update(blockString).digest('hex');
    }

    // ✅ Proof-of-Data: Calculate the file hash
    async calculateFileHash(buffer) {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    // ✅ Mine the block (Proof-of-Work) with PoD Proof
    async mineBlock(difficulty, fileData, timeout = 15000) { // 15 seconds timeout
        const startTime = Date.now();

        // If fileData exists, generate PoD Proof
        if (fileData) {
            try {
                const buffer = fileData.fileBuffer || fileData;
                const fileHash = await this.calculateFileHash(buffer);
                this.podProof = {
                    fileHash,
                    timestamp: Date.now(),
                    nonce: Math.floor(Math.random() * 10000)
                };
            } catch (error) {
                console.error('Error in Proof-of-Data:', error);
                throw error;
            }
        }

        console.log('⛏️  Mining block...');

        // Proof-of-Work loop (PoW)
        while (!this.hash.startsWith('0'.repeat(difficulty))) {
            if (Date.now() - startTime > timeout) {
                console.log('⚠️ Mining timeout reached. Reducing difficulty...');
                difficulty = Math.max(1, difficulty - 1); // Reduce difficulty if taking too long
            }
            this.nonce++;
            this.hash = this.calculateHash();
        }

        console.log('✅ Block successfully mined:', this.hash);
        return this.podProof;
    }

    // ✅ Verify the block's proof (PoD + PoW)
    isValidProof(difficulty) {
        if (!this.podProof || !this.podProof.fileHash) {
            return false;
        }
        return this.hash.startsWith('0'.repeat(difficulty));
    }
}


class Blockchain {
    constructor() {
        this.chain = [];
        this.uploadedFiles = [];
        this.difficulty = 1; // Start with difficulty 1
        this.name = "Qryptum Blockchain"; // Add blockchain name
        this.version = "1.0.0";
    }

    async init() {
        try {
            await this.loadChain();
            // Ensure chain is an array even if loading fails
            if (!Array.isArray(this.chain)) {
                console.warn('Chain was not an array, resetting...');
                this.chain = [];
                this.uploadedFiles = [];
                this.createGenesisBlock();
            }
            // If chain is empty, create genesis block
            if (this.chain.length === 0) {
                this.createGenesisBlock();
            }
        } catch (err) {
            console.error('Error initializing blockchain:', err);
            this.chain = [];
            this.uploadedFiles = [];
            this.createGenesisBlock();
        }
    }

    createGenesisBlock() {
        const genesisBlock = new Block({ message: 'Genesis Block' }, '0');
        this.chain.push(genesisBlock);
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    async addFileBlock(fileData) {
        const previousBlock = this.getLatestBlock();
        const newBlock = new Block(fileData, previousBlock.hash);
        newBlock.mineBlock(this.difficulty);
        this.chain.push(newBlock);
        await this.saveChain();
        return newBlock;
    }

    createBlock(data) {
        const previousBlock = this.getLatestBlock();
        const block = new Block(data, previousBlock.hash);
        return block;
    }

    async processUploadedFile(fileData) {
        try {
            // Ensure fileData has required properties
            if (!fileData || !fileData.fileSize) {
                throw new Error('Invalid file data provided');
            }

            // Calculate mining reward based on file size
            const reward = this.calculateMiningReward(fileData.fileSize);

            // Create new block
            const block = this.createBlock({
                fileInfo: fileData,
                timestamp: new Date().toISOString()
            });
            
            // Try to mine the block with the raw file buffer
            await block.mineBlock(this.difficulty, fileData.fileBuffer);
            
            // Add block to chain
            this.chain.push(block);
            
            // If file info exists, add to uploaded files
            if (fileData.fileName) {
                this.uploadedFiles.push({
                    ...fileData,
                    blockHash: block.hash,
                    previousHash: block.previousHash
                });
            }

            return {
                success: true,
                block,
                reward,
                proof: block.podProof
            };

        } catch (error) {
            console.error("Error processing uploaded file:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    calculateMiningReward(fileSize) {
        if (!fileSize || isNaN(fileSize)) {
            return 0.0001; // Default minimum reward
        }
        
        // Base reward of 0.0001 ETH
        const baseReward = 0.0001;
        
        // Additional reward based on file size (0.00001 ETH per MB)
        const fileSizeInMB = fileSize / (1024 * 1024);
        const sizeBasedReward = fileSizeInMB * 0.00001;
        
        // Total reward (minimum 0.0001 ETH)
        const totalReward = Math.max(baseReward, baseReward + sizeBasedReward);
        
        // Return with maximum 6 decimal places
        return Number(totalReward.toFixed(6));
    }

    adjustDifficulty(newBlock) {
        const lastBlock = this.chain[this.chain.length - 2];
        const timeExpected = 60000; // 1 minute target time
        const timeActual = newBlock.timestamp - lastBlock.timestamp;
        
        if (timeActual < timeExpected / 2) {
            this.difficulty++;
        } else if (timeActual > timeExpected * 2) {
            this.difficulty = Math.max(1, this.difficulty - 1);
        }
    }

    async saveChain() {
        try {
            const blockchainPath = join(__dirname, 'blockchain.json');
            const data = {
                chain: this.chain,
                uploadedFiles: this.uploadedFiles,
                difficulty: this.difficulty
            };
            await fs.writeFile(blockchainPath, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error('Error saving blockchain:', err);
            throw err;
        }
    }

    async loadChain() {
        try {
            const blockchainPath = join(__dirname, 'blockchain.json');
            const data = await fs.readFile(blockchainPath, 'utf8');
            const loadedData = JSON.parse(data);
            
            // Convert loaded data back to Block instances
            if (loadedData.chain && Array.isArray(loadedData.chain)) {
                this.chain = loadedData.chain.map(blockData => {
                    const block = new Block(blockData.data, blockData.previousHash);
                    block.timestamp = blockData.timestamp;
                    block.nonce = blockData.nonce;
                    block.hash = blockData.hash;
                    return block;
                });
            } else {
                this.chain = [];
            }

            this.uploadedFiles = loadedData.uploadedFiles || [];
            this.difficulty = loadedData.difficulty || 2;

            if (this.chain.length === 0) {
                this.createGenesisBlock();
            }
        } catch (err) {
            if (err.code === 'ENOENT') {
                // If file doesn't exist, create new chain
                this.chain = [];
                this.uploadedFiles = [];
                this.createGenesisBlock();
                await this.saveChain();
            } else {
                console.error('Error loading chain:', err);
                this.chain = [];
                this.uploadedFiles = [];
                this.createGenesisBlock();
            }
        }
    }

    isChainValid() {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            // Create a new Block instance to calculate hash
            const tempBlock = new Block(currentBlock.data, currentBlock.previousHash);
            tempBlock.timestamp = currentBlock.timestamp;
            tempBlock.nonce = currentBlock.nonce;

            // Verify current block's hash
            if (currentBlock.hash !== tempBlock.calculateHash()) {
                return false;
            }

            // Verify chain linkage
            if (currentBlock.previousHash !== previousBlock.hash) {
                return false;
            }
        }
        return true;
    }

    getBlockByHash(hash) {
        return this.chain.find(block => block.hash === hash);
    }

    getBlocksByUploader(uploaderAddress) {
        return this.chain.filter(block => 
            block.data?.uploadInfo?.uploadedBy === uploaderAddress
        );
    }
}

// Export the classes
export { Blockchain, Block };
