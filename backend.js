import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import session from 'express-session';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import Web3 from 'web3';
import P2PNode from './p2p-node.js';
import dotenv from 'dotenv';
import { Readable } from 'stream';
import { Blockchain, Block } from './blockchain.js';
import pinataSDK from '@pinata/sdk';
import fs from 'fs/promises';
import { existsSync, createReadStream, mkdirSync } from 'fs';
import axios from 'axios';
import { QRYPTUM_CONFIG } from './config/network.js';
import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables at the very start
dotenv.config();

// Initialize blockchain as soon as possible after imports
const blockchain = new Blockchain();

// Create app and server with new imports
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Initialize web3 and constants
const web3 = new Web3(QRYPTUM_CONFIG.RPC_URL);
const SENDER_PRIVATE_KEY = 'cdeb7422343d69a60f35529c32f130c178c8fb5d470929cdff325369bf533f2d'; // Update with your private key
const SENDER_ADDRESS = '0x46299ac2A9DBaf393DC7B00A53A4B6894cB78F3E'; // Update with your address

// Initialize ethers provider and QryptToken contract
const provider = new ethers.providers.JsonRpcProvider(QRYPTUM_CONFIG.RPC_URL);

// Remove QRYPT token initialization
// let qryptToken;

async function initializeContracts() {
    try {
        console.log('QryptToken contract initialized');
    } catch (error) {
        console.error('Failed to initialize contracts:', error);
    }
}

// Peer connections storage
const peers = new Map();
const activeSessions = new Map();

// Session middleware setup
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

const port = 3001;

// Update CORS configuration at the top
const corsOptions = {
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-User-Name', 'Accept']
};

app.use(cors(corsOptions));

// Add options handling for CORS preflight
app.options('*', cors(corsOptions));

// Middleware
app.use(express.json());

// Update express static file serving
app.use(express.static(join(__dirname)));

// Add headers middleware before routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-User-Name');
    next();
});

// In-memory storage (replace with database in production)
const users = new Map();

// In-memory storage for uploaded files
const uploadedFiles = [];

// Add new retry utility
const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (err) {
            if (i === maxRetries - 1) throw err;
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
    }
};

// Update Pinata initialization with retry logic
const initPinata = async () => {
    return await retryOperation(async () => {
        const pinata = new pinataSDK({
            pinataApiKey: process.env.PINATA_API_KEY || '71cab20ce1ad034f1a65',
            pinataSecretApiKey: process.env.PINATA_SECRET_KEY || '876a8721c6e8bed6905cad402e6e4f8155aa6262c207a75956e6ace2ab314b56'
        });
        await pinata.testAuthentication();
        return pinata;
    });
};

// Update Pinata initialization
const pinata = await initPinata();

// Update upload directory to use absolute path
const uploadDir = join(__dirname, 'uploads');

// Create uploads directory if it doesn't exist with proper error handling
try {
    if (!existsSync(uploadDir)) {
        mkdirSync(uploadDir, { recursive: true });
    }
} catch (err) {
    console.error('Error creating uploads directory:', err);
    process.exit(1);
}

// Remove local storage configuration and keep only metadata storage
const uploadMiddleware = multer({
    storage: multer.memoryStorage(), // Change to memory storage instead of disk
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    }
}).single('file');

const usersFilePath = join(__dirname, 'users.json');

// Function to save users data to JSON file
const saveUsers = async () => {
    try {
        const usersArray = Array.from(users.entries());
        await fs.writeFile(usersFilePath, JSON.stringify(usersArray, null, 2));
    } catch (err) {
        console.error('Error saving users data:', err);
    }
};

// Function to load users data from JSON file
const loadUsers = async () => {
    try {
        if (existsSync(usersFilePath)) {
            const data = await fs.readFile(usersFilePath, 'utf8');
            const usersArray = JSON.parse(data);
            usersArray.forEach(([username, password]) => {
                users.set(username, password);
            });
        }
    } catch (err) {
        console.error('Error loading users data:', err);
    }
};

// Load users data on server start
loadUsers();

// AUTH ENDPOINTS
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Username and password are required'
        });
    }

    if (users.has(username)) {
        return res.status(409).json({
            success: false,
            message: 'Username already exists'
        });
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    users.set(username, hashedPassword);

    // Save users data to JSON file
    saveUsers();

    res.status(201).json({
        success: true,
        message: 'User registered successfully'
    });
});

// Modified login endpoint to handle sessions
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Username and password are required'
        });
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    const storedPassword = users.get(username);

    if (!storedPassword || storedPassword !== hashedPassword) {
        return res.status(401).json({
            success: false,
            message: 'Invalid credentials'
        });
    }

    // Create session
    req.session.user = {
        username: username,
        loginTime: new Date(),
        sessionId: crypto.randomBytes(16).toString('hex')
    };

    activeSessions.set(username, req.session.user);

    res.json({
        success: true,
        message: 'Login successful',
        sessionId: req.session.user.sessionId
    });
});

// Function to calculate hash of a block
const calculateHash = (block) => {
    const blockString = JSON.stringify(block);
    return crypto.createHash('sha256').update(blockString).digest('hex');
};

const uploadedFilesPath = join(__dirname, 'uploadedFiles.json');

// Function to save uploaded files data to JSON file
const saveUploadedFiles = async () => {
    try {
        await fs.writeFile(uploadedFilesPath, JSON.stringify(uploadedFiles, null, 2));
    } catch (err) {
        console.error('Error saving uploaded files data:', err);
    }
};

// Function to load uploaded files data from JSON file
const loadUploadedFiles = async () => {
    try {
        if (existsSync(uploadedFilesPath)) {
            const data = await fs.readFile(uploadedFilesPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading uploaded files data:', err);
    }
    return [];
};

// Load uploaded files data on server start
const loadedFiles = await loadUploadedFiles();
uploadedFiles.push(...loadedFiles);

const blockchainFilePath = join(__dirname, 'blockchain.json');

// Function to save blockchain data to JSON file
const saveBlockchain = async () => {
    try {
        await fs.writeFile(blockchainFilePath, JSON.stringify(blockchain, null, 2));
    } catch (err) {
        console.error('Error saving blockchain data:', err);
    }
};

// Move loadBlockchain function definition before it's used
const loadBlockchain = async () => {
    try {
        await blockchain.init();
        console.log('Blockchain loaded successfully');
    } catch (err) {
        console.error('Error loading blockchain:', err);
        // Reset chain if loading fails
        blockchain.chain = [];
        await blockchain.createGenesisBlock();
    }
};

// Initialize blockchain before server starts
const initializeBlockchain = async () => {
    try {
        await loadBlockchain();
    } catch (err) {
        console.error('Failed to initialize blockchain:', err);
        process.exit(1);
    }
};

// Add delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Update the reward calculation function
const calculateReward = (fileSizeInBytes) => {
    try {
        const fileSizeInKB = fileSizeInBytes / 1024;
        const reward = (QRYPTUM_CONFIG.UPLOAD_REWARD * (fileSizeInKB / 100));
        return reward > 0 ? reward.toFixed(6) : QRYPTUM_CONFIG.UPLOAD_REWARD.toFixed(6);
    } catch (error) {
        console.error('Error calculating reward:', error);
        return QRYPTUM_CONFIG.UPLOAD_REWARD.toFixed(6);
    }
};

// Add upload charge calculation function
const calculateUploadCharge = (fileSizeInBytes) => {
    const fileSizeInKB = fileSizeInBytes / 1024;
    return (QRYPTUM_CONFIG.UPLOAD_CHARGE * (fileSizeInKB / 100)).toFixed(6);
};

// Add rate limiting configuration
const TX_RATE_LIMIT = 1; // Lower to 1 transaction per minute
const TX_QUEUE = new Map();
const TX_TIMEOUT = 60000; // 1 minute timeout
let lastTxTime = 0;

// Add delay utility function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Add queue management functions
const addToQueue = (receiverAddress, transaction) => {
    TX_QUEUE.set(receiverAddress, {
        transaction,
        timestamp: Date.now()
    });
};

const processQueue = async () => {
    for (const [address, data] of TX_QUEUE) {
        if (Date.now() - data.timestamp >= TX_TIMEOUT) {
            TX_QUEUE.delete(address);
            continue;
        }
        
        try {
            await executeTransaction(data.transaction);
            TX_QUEUE.delete(address);
        } catch (error) {
            if (!error.message.includes('Too Many Requests')) {
                TX_QUEUE.delete(address);
            }
        }
    }
};

// Add transaction execution function with retry logic
const executeTransactionWithRetry = async (transaction) => {
    return await exponentialBackoff(async () => {
        const web3 = new Web3(process.env.ETH_RPC_URL);
        const signedTx = await web3.eth.accounts.signTransaction(transaction, SENDER_PRIVATE_KEY);
        return await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    });
};

// Update the sendReward function with enhanced error handling and rate limiting
// Removed duplicate sendReward function

// Add queue processor interval
setInterval(processQueue, 60000); // Process queue every minute

// Update file uniqueness check function
const checkFileUniqueness = async (fileBuffer, fileType) => {
    const supportedFormats = ['application/pdf', 'application/json', 'text/csv', 'text/plain'];
    if (!supportedFormats.includes(fileType)) {
        throw new Error('Unsupported file format. Please upload a PDF, JSON, CSV, or TXT file.');
    }

    try {
        const formData = new FormData();
        const blob = new Blob([fileBuffer], { type: fileType });
        const file = new File([blob], 'upload.bin', { type: fileType });
        formData.append('file', file);

        const response = await axios.post('https://qryptum-ai.onrender.com/upload/', formData, {
            headers: {
                'accept': 'application/json',
                'Content-Type': 'multipart/form-data'
            },
            maxBodyLength: Infinity
        });

        console.log('Uniqueness check response:', response.data);
        
        if (response.data.error) {
            throw new Error(response.data.error);
        }
        
        if (response.data && typeof response.data.uniqueness_score === 'number') {
            return response.data.uniqueness_score;
        }
        
        throw new Error('Invalid response format from uniqueness check service');
    } catch (error) {
        console.error('Error checking file uniqueness:', error);
        throw new Error(error.message || 'Failed to check file uniqueness');
    }
};

// Add rate limit handling utility
const handleRateLimit = async (operation, maxRetries = 5, initialDelay = 1000) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (error.message.includes('Too Many Requests')) {
                const delay = initialDelay * Math.pow(2, attempt);
                console.log(`Rate limited. Waiting ${delay/1000} seconds before retry ${attempt + 1}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
    throw new Error('Max retries reached for rate limited operation');
};

// Add new transaction retry utility with exponential backoff
const executeTransactionWithBackoff = async (transaction, maxAttempts = 5) => {
    let attempt = 0;
    while (attempt < maxAttempts) {
        try {
            const signedTx = await web3.eth.accounts.signTransaction(transaction, SENDER_PRIVATE_KEY);
            return await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        } catch (error) {
            attempt++;
            if (!error.message.includes('Too Many Requests') || attempt === maxAttempts) {
                throw error;
            }
            const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30 seconds delay
            console.log(`Transaction rate limited. Waiting ${delay/1000} seconds before retry ${attempt}/${maxAttempts}`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('Max retry attempts reached');
};

// Add a new function to handle ETH transfers
async function handleRewardTransfer(userAddress, amount) {
    try {
        const amountInWei = web3.utils.toWei(amount.toString(), 'ether');
        const transaction = {
            from: SENDER_ADDRESS,
            to: userAddress,
            value: amountInWei,
            gas: '21000',
            gasPrice: await web3.eth.getGasPrice()
        };

        const signedTx = await web3.eth.accounts.signTransaction(transaction, SENDER_PRIVATE_KEY);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        
        return {
            success: true,
            receipt,
            details: {
                from: SENDER_ADDRESS,
                to: userAddress,
                value: amount + ' ETH',
                status: 'completed'
            }
        };
    } catch (error) {
        console.error('Reward transfer failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Update the sendReward function
const sendReward = async (receiverAddress, fileSizeInBytes) => {
    try {
        if (!receiverAddress || !fileSizeInBytes) {
            throw new Error('Invalid parameters for reward calculation');
        }

        const rewardAmount = calculateReward(fileSizeInBytes);
        const rewardResult = await handleRewardTransfer(receiverAddress, rewardAmount);

        if (!rewardResult.success) {
            throw new Error('Failed to send reward: ' + rewardResult.error);
        }

        return rewardResult;

    } catch (error) {
        console.error('Reward transaction error:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// Update the upload endpoint to include proper waiting and error handling
const requestTracker = new Map();

app.post('/api/upload', uploadMiddleware, async (req, res) => {
    const requestId = uuidv4();
    
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file provided'
            });
        }

        const username = req.headers['x-user-name'];
        const ethAddress = req.body.ethAddress;

        if (!username || !ethAddress) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated or ETH address not provided'
            });
        }

        // Check if this file is already being processed
        const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
        if (requestTracker.has(fileHash)) {
            return res.status(429).json({
                success: false,
                message: 'This file is already being processed'
            });
        }

        // Track this request
        requestTracker.set(fileHash, {
            timestamp: Date.now(),
            requestId
        });

        // Step 1: Check uniqueness exactly once
        console.log(`[${requestId}] Checking file uniqueness...`);
        const formData = new FormData();
        formData.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);
        
        const uniquenessResponse = await axios.post('https://qryptum-ai.onrender.com/upload/', formData, {
            headers: {
                'accept': 'application/json',
                'Content-Type': 'multipart/form-data'
            },
            maxBodyLength: Infinity
        });

        // Clean up request tracker after getting response
        requestTracker.delete(fileHash);

        if (!uniquenessResponse.data || typeof uniquenessResponse.data.uniqueness_score !== 'number') {
            throw new Error('Invalid response from uniqueness check service');
        }

        const uniquenessScore = uniquenessResponse.data.uniqueness_score;
        console.log('Uniqueness score:', uniquenessScore);

        if (uniquenessScore < 50) {
            return res.status(400).json({
                success: false,
                message: 'File is too similar to existing content. Please upload unique content.',
                score: uniquenessScore,
                threshold: 50
            });
        }

        // Step 2: Process file with Proof of Data
        console.log('Processing file with Proof of Data...');
        const fileBuffer = req.file.buffer;
        const fileData = {
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
            fileBuffer: fileBuffer,
            uniquenessScore: uniquenessScore,
            uploadedBy: username,
            timestamp: new Date().toISOString()
        };

        // Mine block with PoD
        console.log('Mining block with Proof of Data...');
        const result = await blockchain.processUploadedFile(fileData);
        console.log('Mining result:', result);

        // Step 3: Process reward transaction
        const rewardTransaction = await sendReward(ethAddress, result.reward);

        // Step 4: Upload to IPFS only after successful mining
        console.log('Uploading to Pinata...');
        const readableStream = new Readable();
        readableStream.push(req.file.buffer);
        readableStream.push(null);

        const pinataResponse = await pinata.pinFileToIPFS(readableStream, {
            pinataMetadata: {
                name: req.file.originalname,
                keyvalues: {
                    uploadedBy: username,
                    timestamp: new Date().toISOString(),
                    uniquenessScore: uniquenessScore
                }
            }
        });

        // Create file record and update blockchain
        const fileRecord = {
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
            ipfsHash: pinataResponse.IpfsHash,
            pinataUrl: `https://gateway.pinata.cloud/ipfs/${pinataResponse.IpfsHash}`,
            uniquenessScore,
            timestamp: new Date().toISOString(),
            uploadedBy: username,
            uploadTime: new Date().toISOString(),
            transaction: {
                hash: rewardTransaction.receipt.transactionHash,
                from: rewardTransaction.details.from,
                to: rewardTransaction.details.to,
                value: rewardTransaction.details.value,
                gasPrice: rewardTransaction.details.gasPrice,
                status: rewardTransaction.details.status
            }
        };

        // Final step: Update blockchain and save data
        const newBlock = await blockchain.processUploadedFile(fileRecord);
        uploadedFiles.push(fileRecord);
        await Promise.all([
            saveUploadedFiles(),
            saveBlockchain()
        ]);

        res.json({
            success: true,
            data: {
                fileData: {
                    fileName: fileRecord.fileName,
                    fileSize: fileRecord.fileSize,
                    uniquenessScore: fileRecord.uniquenessScore
                },
                ipfs: {
                    hash: fileRecord.ipfsHash,
                    viewUrl: fileRecord.pinataUrl
                },
                transaction: fileRecord.transaction,
                block: {
                    hash: newBlock.hash,
                    number: blockchain.chain.length - 1
                },
                mining: {
                    blockHash: result.block.hash,
                    proof: result.proof,
                    reward: result.reward
                }
            }
        });

    } catch (error) {
        // Clean up request tracker on error
        const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
        requestTracker.delete(fileHash);
        
        console.error('Upload error:', error);
        const errorMessage = error.message.includes('Too Many Requests') 
            ? 'Server is busy. Please try again in a few moments.' 
            : error.message;
            
        res.status(error.message.includes('Too Many Requests') ? 429 : 500).json({
            success: false,
            message: 'Upload failed',
            error: errorMessage,
            retryAfter: error.message.includes('Too Many Requests') ? 30 : undefined
        });
    }
});

// Update upload middleware configuration
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    }
});

// Update the /upload endpoint to use the new middleware
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file provided'
            });
        }

        // Get uniqueness score
        console.log(`[${req.file.originalname}] Checking file uniqueness...`);
        const uniquenessScore = await checkFileUniqueness(req.file.buffer, req.file.mimetype);
        console.log('Uniqueness score:', uniquenessScore);

        // Upload to IPFS via Pinata
        const readableStream = new Readable();
        readableStream.push(req.file.buffer);
        readableStream.push(null);

        const ipfsResult = await pinata.pinFileToIPFS(readableStream, {
            pinataMetadata: {
                name: req.file.originalname
            }
        });

        // Process file through blockchain
        const blockchainResult = await blockchain.processUploadedFile({
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
            ipfsHash: ipfsResult.IpfsHash,
            pinataUrl: `https://gateway.pinata.cloud/ipfs/${ipfsResult.IpfsHash}`,
            uniquenessScore: uniquenessScore,
            timestamp: new Date().toISOString(),
            uploadedBy: username, // Dynamically set based on user authentication
            uploadTime: new Date().toISOString()
        });

        if (!blockchainResult.success) {
            throw new Error(blockchainResult.error);
        }

        // Save updated chain state
        await blockchain.saveChain();

        res.json({
            success: true,
            message: 'File uploaded successfully',
            data: {
                file: req.file,
                ipfs: ipfsResult,
                uniquenessScore,
                blockchain: blockchainResult
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Add cleanup for old requests every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [hash, data] of requestTracker.entries()) {
        if (now - data.timestamp > 300000) { // 5 minutes
            requestTracker.delete(hash);
        }
    }
}, 300000);

// Update blockchain data endpoint to handle potential errors
app.get('/api/blockchain', (req, res) => {
    try {
        const chainData = blockchain.chain.map(block => {
            // Create a new Block instance for validation
            const validationBlock = new Block(block.data, block.previousHash);
            validationBlock.timestamp = block.timestamp;
            validationBlock.nonce = block.nonce;

            return {
                ...block,
                isValid: block === blockchain.chain[0] || // Skip genesis block validation
                    (block.hash === validationBlock.calculateHash() &&
                     block.previousHash === blockchain.chain[blockchain.chain.indexOf(block) - 1].hash)
            };
        });

        res.json({
            success: true,
            data: {
                chain: chainData,
                length: blockchain.chain.length,
                isValid: blockchain.isChainValid()
            }
        });
    } catch (err) {
        console.error('Blockchain data error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch blockchain data',
            error: err.message
        });
    }
});

// Add new endpoint to get specific block
app.get('/api/block/:hash', (req, res) => {
    try {
        const block = blockchain.getBlockByHash(req.params.hash);
        if (!block) {
            return res.status(404).json({
                success: false,
                message: 'Block not found'
            });
        }
        res.json({
            success: true,
            data: block
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch block data'
        });
    }
});

// Update status endpoint
app.get('/api/status', async (req, res) => {
    try {
        const pinataStatus = await retryOperation(async () => {
            const pinata = await initPinata();
            return await pinata.testAuthentication();
        });

        const stats = {
            networkName: "Qryptum Blockchain",
            version: "1.0.0",
            totalFiles: Array.isArray(blockchain.chain) ? blockchain.chain.length : 0,
            totalSize: Array.isArray(blockchain.chain) ? blockchain.chain.reduce((acc, block) => {
                if (block.data && block.data.fileInfo) {
                    return acc + (block.data.fileInfo.fileSize || 0);
                }
                return acc;
            }, 0) : 0,
            lastUpload: Array.isArray(blockchain.chain) && blockchain.chain.length > 0 
                ? blockchain.chain[blockchain.chain.length - 1].timestamp 
                : null,
            pinataConnected: pinataStatus ? true : false
        };
        
        res.json({
            success: true,
            pinata: pinataStatus,
            stats: stats
        });
    } catch (err) {
        console.error('Status check error:', err.message);
        res.status(503).json({
            success: false,
            message: 'Service temporarily unavailable',
            error: err.message
        });
    }
});

// Add a new endpoint to verify uploaded files
app.get('/api/verify-uploads', async (req, res) => {
    try {
        const savedFiles = await loadUploadedFiles();
        const verifiedFiles = [];
        const invalidFiles = [];

        for (const file of savedFiles) {
            try {
                // Check if file still exists on Pinata
                const pinataResponse = await pinata.pinList({
                    hashContains: file.ipfsHash
                });
                
                if (pinataResponse.count > 0) {
                    verifiedFiles.push(file);
                } else {
                    invalidFiles.push(file);
                }
            } catch (err) {
                console.error(`Error verifying file ${file.fileName}:`, err);
                invalidFiles.push(file);
            }
        }

        // Update local metadata
        if (invalidFiles.length > 0) {
            uploadedFiles.length = 0;
            uploadedFiles.push(...verifiedFiles);
            await saveUploadedFiles();
        }

        res.json({
            success: true,
            verified: verifiedFiles.length,
            removed: invalidFiles.length,
            files: verifiedFiles
        });

    } catch (err) {
        console.error('Verification error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to verify uploads'
        });
    }
});

// Add a new endpoint to get uploaded files data
app.get('/api/uploaded-files', async (req, res) => {
    try {
        const files = await loadUploadedFiles();
        res.json({
            success: true,
            data: files
        });
    } catch (err) {
        console.error('Error fetching uploaded files:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch uploaded files'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!'
    });
});

// Add global error handlers
process.on('uncaughtException', async (err) => {
    console.error('Uncaught Exception:', err);
    // Perform cleanup
    try {
        const files = await fs.readdir(uploadDir);
        files.forEach(async file => {
            try {
                await fs.unlink(join(uploadDir, file));
            } catch (e) {
                console.error(`Error deleting file ${file}:`, e);
            }
        });
    } catch (e) {
        console.error('Error during cleanup:', e);
    }
});

// Add logout endpoint
app.post('/api/logout', (req, res) => {
    if (req.session.user) {
        const username = req.session.user.username;
        activeSessions.delete(username);
        peers.delete(username);
        req.session.destroy();
        broadcastPeerList();
    }
    
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch(data.type) {
                case 'register':
                    handlePeerRegistration(ws, data);
                    break;
                case 'fileUploaded':
                    broadcastFileUpload(ws, data);
                    break;
                case 'disconnect':
                    handlePeerDisconnection(ws);
                    break;
            }
        } catch (err) {
            console.error('WebSocket message error:', err);
        }
    });

    ws.on('close', () => {
        handlePeerDisconnection(ws);
    });
});

function handlePeerRegistration(ws, data) {
    const peerId = data.username;
    peers.set(peerId, ws);
    
    // Notify all peers about new connection
    broadcastPeerList();
}

function handlePeerDisconnection(ws) {
    // Remove disconnected peer
    for (const [peerId, peerWs] of peers.entries()) {
        if (peerWs === ws) {
            peers.delete(peerId);
            break;
        }
    }
    broadcastPeerList();
}

function broadcastPeerList() {
    const peerList = Array.from(peers.keys());
    const message = JSON.stringify({
        type: 'peerList',
        peers: peerList
    });
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function broadcastFileUpload(ws, data) {
    const message = JSON.stringify({
        type: 'newFile',
        file: data.file,
        uploader: data.username
    });
    
    wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Add a catch-all route handler for undefined routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// Update server start to use WebSocket server
const startServer = (initialPort) => {
    server.listen(initialPort)
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${initialPort} is busy, trying ${initialPort + 1}...`);
                setTimeout(() => startServer(initialPort + 1), 1000); // Add delay before retrying
            } else {
                console.error('Server error:', err);
            }
        })
        .on('listening', () => {
            const address = server.address();
            console.log(`🚀 Server running on http://localhost:${address.port}`);
            console.log(`WebSocket server running on ws://localhost:${address.port}`);
        });
};

let node; // Declare node variable at the top level

// Initialize async operations with retry
const initApp = async () => {
    try {
        await initializeContracts();
        await initializeBlockchain();
        await loadUsers();
        
        // Initialize P2P node with proper error handling
        console.log('Initializing P2P node...');
        node = new P2PNode({
            repoPath: join(__dirname, 'ipfs-repo-backend'),
            tcpPort: 4012, // Use different port range for backend
            wsPort: 4013
        });

        try {
            await node.init();
            console.log('P2P Node initialized successfully');
            
            // Add new status endpoint for P2P node
            app.get('/api/p2p-status', (req, res) => {
                const status = node.getNodeStatus();
                res.json({
                    success: true,
                    data: status
                });
            });

        } catch (err) {
            console.warn('P2P Node initialization failed:', err.message);
            console.log('Continuing with limited functionality...');
        }
        
        // Start server
        startServer(port);
    } catch (err) {
        console.error('Failed to initialize application:', err);
        process.exit(1);
    }
};

// Only call initApp once
initApp().catch(console.error);

// Export for testing
export { app, server, blockchain };

// Add enhanced rate limiting configuration
const TX_CONFIG = {
    RATE_LIMIT: 1, // 1 transaction per interval
    INTERVAL: 60000, // 1 minute in milliseconds
    MAX_RETRIES: 5,
    INITIAL_RETRY_DELAY: 5000, // 5 seconds
    MAX_RETRY_DELAY: 60000, // 1 minute
    BACKOFF_FACTOR: 1.5,
    BATCH_SIZE: 5,
    BACKOFF: {
        INITIAL_DELAY: 2000,
        MAX_DELAY: 30000,
        FACTOR: 1.5,
        MAX_RETRIES: 5
    }
};

// Add exponential backoff utility
const exponentialBackoff = async (operation, attempt = 0) => {
    try {
        return await operation();
    } catch (error) {
        if (error.message.includes('Too Many Requests') && attempt < TX_CONFIG.MAX_RETRIES) {
const delay = Math.min(
    TX_CONFIG.INITIAL_RETRY_DELAY * Math.pow(TX_CONFIG.BACKOFF_FACTOR, attempt),
    TX_CONFIG.MAX_RETRY_DELAY
);
console.log(`Rate limited. Retrying in ${delay/1000} seconds... (Attempt ${attempt + 1}/${TX_CONFIG.MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return exponentialBackoff(operation, attempt + 1);
        }
        throw error;
    }
};

// Configuration removed as it's already defined in the main TX_CONFIG object above

// Add improved transaction queue
const txQueue = {
    items: new Map(),
    processing: false,
    lastTxTime: 0,

    add(address, tx) {
        this.items.set(address, {
            tx,
            attempts: 0,
            timestamp: Date.now()
        });
    },

    async process() {
        if (this.processing) return;
        this.processing = true;

        for (const [address, item] of this.items) {
            if (await this.shouldProcess(item)) {
                try {
                    const receipt = await this.executeWithBackoff(item.tx);
                    this.items.delete(address);
                    this.lastTxTime = Date.now();
                    console.log(`Transaction processed successfully for ${address}`);
                    return receipt;
                } catch (error) {
                    item.attempts++;
                    if (item.attempts >= TX_CONFIG.BACKOFF.MAX_RETRIES) {
                        this.items.delete(address);
                        console.error(`Max retries reached for ${address}`);
                    }
                }
            }
        }
        this.processing = false;
    },

    async shouldProcess(item) {
        const now = Date.now();
        const timeSinceLastTx = now - this.lastTxTime;
        return timeSinceLastTx >= TX_CONFIG.INTERVAL;
    },

    async executeWithBackoff(tx, attempt = 0) {
        try {
            const signedTx = await web3.eth.accounts.signTransaction(tx, SENDER_PRIVATE_KEY);
            return await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        } catch (error) {
            if (error.message.includes('Too Many Requests') && attempt < TX_CONFIG.BACKOFF.MAX_RETRIES) {
                const delay = Math.min(
                    TX_CONFIG.BACKOFF.INITIAL_DELAY * Math.pow(TX_CONFIG.BACKOFF.FACTOR, attempt),
                    TX_CONFIG.BACKOFF.MAX_DELAY
                );
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.executeWithBackoff(tx, attempt + 1);
            }
            throw error;
        }
    }
};

// Update queue processing interval

// Start queue processing interval
setInterval(() => txQueue.process(), TX_CONFIG.INTERVAL);

// Add these lines instead:
const QryptTokenABI = JSON.parse(
    await fs.readFile(
        new URL('./contracts/QryptToken.json', import.meta.url)
    )
);