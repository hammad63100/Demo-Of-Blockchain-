const crypto = require('crypto');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');
const pinataSDK = require('@pinata/sdk');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const IV_LENGTH = 16;
const getEncryptionKey = () => {
    const key = process.env.ENCRYPTION_KEY || 'default-key-that-is-32-bytes-long!';
    return crypto.createHash('sha256').update(String(key)).digest();
};
const ENCRYPTION_KEY = getEncryptionKey();
const SECRET_KEY = 'your_secret_key';

const app = express();

// Initialize Pinata client
const pinata = new pinataSDK({ pinataJWTKey: process.env.PINATA_JWT });

// Test Pinata connection
pinata.testAuthentication().then((result) => {
    console.log('Pinata Authentication:', result);
}).catch((err) => {
    console.log('Pinata Authentication Error:', err);
});

// Define Block class
class Block {
    constructor(index, previousHash, timestamp, data, hash) {
        this.index = index;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash || this.calculateHash();
    }

    calculateHash() {
        return crypto.createHash('sha256')
            .update(this.index + this.previousHash + this.timestamp + JSON.stringify(this.data))
            .digest('hex');
    }
}

// Blockchain Initialization
function createGenesisBlock() {
    return new Block(0, "0", Date.now(), "Genesis Block", null);
}

let blockchain = [createGenesisBlock()];

function getLatestBlock() {
    return blockchain[blockchain.length - 1];
}

function addBlock(fileHash, username) {
    const previousBlock = getLatestBlock();
    const newBlock = new Block(
        previousBlock.index + 1,
        previousBlock.hash,
        Date.now(),
        { fileHash, creator: username },
        null
    );
    newBlock.hash = newBlock.calculateHash();
    blockchain.push(newBlock);
    
    // Save blockchain after adding new block
    saveBlockchain();
    return newBlock;
}

// User Authentication
const DATA_DIR = './data';
const BLOCKCHAIN_FILE = './data/blockchain.json';
const USERS_FILE = './data/users.json';

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Load existing users from file
let users = new Map();
try {
    if (fs.existsSync(USERS_FILE)) {
        const userData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        users = new Map(Object.entries(userData));
    }
} catch (error) {
    console.error('Error loading users:', error);
}

function createUser(username, password) {
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    users.set(username, hashedPassword);
    // Save users to file
    const userData = Object.fromEntries(users);
    fs.writeFileSync(USERS_FILE, JSON.stringify(userData, null, 2));
    return true;
}

function authenticateUser(username, password) {
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    return users.get(username) === hashedPassword;
}

// Express Server Setup
app.use(bodyParser.json());
const upload = multer({ dest: 'uploads/' });

// Add authentication middleware
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: 'Authentication token required' });
    
    // Simple token validation (in production, use proper JWT)
    if (token.length < 32) return res.status(401).json({ error: 'Invalid token' });
    next();
};

const accessControlMiddleware = (req, res, next) => {
    // Add role-based access control here
    const userRole = req.headers['user-role'];
    if (!userRole || userRole !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
};

// REST API Endpoints
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (users.has(username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }
    
    createUser(username, password);
    res.json({ success: true, message: 'User registered successfully' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (authenticateUser(username, password)) {
        const token = crypto.randomBytes(32).toString('hex');
        res.json({ success: true, token, username });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const username = req.body.username;
        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        const readableStreamForFile = fs.createReadStream(req.file.path);
        const options = {
            pinataMetadata: {
                name: `Upload by ${username}`,
                keyvalues: {
                    creator: username,
                    timestamp: Date.now()
                }
            },
            pinataOptions: {
                cidVersion: 1
            }
        };

        const pinataResult = await pinata.pinFileToIPFS(readableStreamForFile, options);
        fs.unlinkSync(req.file.path); // Clean up temp file

        const fileHash = pinataResult.IpfsHash;
        const newBlock = addBlock(fileHash, username);
        
        res.json({
            success: true,
            fileHash,
            pinataUrl: `https://gateway.pinata.cloud/ipfs/${fileHash}`,
            block: newBlock
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'File upload failed' });
    }
});

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    res.send('File uploaded successfully.');
});

app.get('/api/blockchain', authenticateToken, accessControlMiddleware, (req, res) => {
    res.json({ success: true, blockchain });
});

app.post('/api/verify', (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        res.status(200).json({ success: true });
    });
});

// Also save blockchain state
function loadBlockchain() {
    try {
        if (fs.existsSync(BLOCKCHAIN_FILE)) {
            try {
                const encryptedData = fs.readFileSync(BLOCKCHAIN_FILE, 'utf8');
                const decryptedData = decrypt(encryptedData);
                const blockchainData = JSON.parse(decryptedData);
                blockchain = blockchainData.map(block => new Block(
                    block.index,
                    block.previousHash,
                    block.timestamp,
                    block.data,
                    block.hash
                ));
                console.log('Blockchain loaded successfully (decrypted)');
            } catch (error) {
                console.log('Could not decrypt existing blockchain, creating new one');
                // Backup the old file
                if (fs.existsSync(BLOCKCHAIN_FILE)) {
                    fs.renameSync(BLOCKCHAIN_FILE, `${BLOCKCHAIN_FILE}.bak.${Date.now()}`);
                }
                blockchain = [createGenesisBlock()];
                saveBlockchain();
            }
        } else {
            console.log('No blockchain file found, creating new one');
            blockchain = [createGenesisBlock()];
            saveBlockchain();
        }
    } catch (error) {
        console.error('Error in loadBlockchain:', error);
        blockchain = [createGenesisBlock()];
        saveBlockchain();
    }
}

function saveBlockchain() {
    try {
        // Ensure data directory exists
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const encryptedData = encrypt(JSON.stringify(blockchain));
        fs.writeFileSync(BLOCKCHAIN_FILE, encryptedData);
        console.log('Blockchain saved successfully (encrypted)');
    } catch (error) {
        console.error('Error saving blockchain:', error);
    }
}

// Load existing blockchain
loadBlockchain();

// Start the server
const PORT = process.env.PORT || 3000;

const startServer = (initialPort) => {
    const server = app.listen(initialPort)
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${initialPort} is busy, trying ${initialPort + 1}...`);
                startServer(initialPort + 1);
            } else {
                console.error('Server error:', err);
            }
        })
        .on('listening', () => {
            const port = server.address().port;
            console.log(`Server running on port ${port}`);
        });
};

// Start the server with initial port
startServer(PORT);

const WebSocket = require('ws');

// Create WebSocket server
const wss = new WebSocket.Server({ port: 6001 });

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', async (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'AUTH':
                if (data.isRegister) {
                    if (users.has(data.username)) {
                        ws.send(JSON.stringify({ 
                            type: 'AUTH_ERROR', 
                            error: 'Username already exists' 
                        }));
                    } else {
                        createUser(data.username, data.password);
                        ws.send(JSON.stringify({ type: 'AUTH_SUCCESS' }));
                    }
                } else {
                    if (authenticateUser(data.username, data.password)) {
                        ws.send(JSON.stringify({ type: 'AUTH_SUCCESS' }));
                    } else {
                        ws.send(JSON.stringify({ 
                            type: 'AUTH_ERROR', 
                            error: 'Invalid credentials' 
                        }));
                    }
                }
                break;

            case 'UPLOAD_FILE':
                try {
                    const tempFilePath = `./uploads/${Date.now()}-${data.fileName}`;
                    const fileBuffer = Buffer.from(data.file, 'base64');
                    fs.writeFileSync(tempFilePath, fileBuffer);

                    const readableStream = fs.createReadStream(tempFilePath);
                    const options = {
                        pinataMetadata: {
                            name: data.fileName,
                            keyvalues: {
                                timestamp: Date.now()
                            }
                        }
                    };

                    const result = await pinata.pinFileToIPFS(readableStream, options);
                    fs.unlinkSync(tempFilePath); // Clean up temp file

                    const fileHash = result.IpfsHash;
                    addBlock(fileHash, data.username);

                    ws.send(JSON.stringify({
                        type: 'UPLOAD_SUCCESS',
                        fileHash,
                        pinataUrl: `https://gateway.pinata.cloud/ipfs/${fileHash}`
                    }));
                } catch (error) {
                    console.error('Upload error:', error);
                    ws.send(JSON.stringify({ 
                        type: 'UPLOAD_ERROR', 
                        error: 'File upload failed' 
                    }));
                }
                break;

            case 'GET_BLOCKCHAIN':
                ws.send(JSON.stringify({ 
                    type: 'BLOCKCHAIN', 
                    blockchain 
                }));
                break;
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

console.log('WebSocket server running on port 6001');

// Create uploads directory if it doesn't exist
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// Add these encryption helper functions
function encrypt(text) {
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
        console.error('Encryption error:', error);
        throw error;
    }
}

function decrypt(text) {
    try {
        const textParts = text.split(':');
        if (textParts.length !== 2) {
            throw new Error('Invalid encrypted text format');
        }
        const iv = Buffer.from(textParts[0], 'hex');
        const encryptedText = Buffer.from(textParts[1], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error('Decryption error:', error);
        throw error;
    }
}
