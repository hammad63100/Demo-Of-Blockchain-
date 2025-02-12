const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const pinataSDK = require('@pinata/sdk');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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
app.use(express.static(path.join(__dirname)));

// Add headers middleware before routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-User-Name');
    next();
});

// In-memory storage (replace with database in production)
const users = new Map();
const blockchain = [];

// In-memory storage for uploaded files
const uploadedFiles = [];

// Pinata setup
const pinata = new pinataSDK('71cab20ce1ad034f1a65', '876a8721c6e8bed6905cad402e6e4f8155aa6262c207a75956e6ace2ab314b56');

// Update upload directory to use absolute path
const uploadDir = path.join(__dirname, 'uploads');

// Create uploads directory if it doesn't exist with proper error handling
try {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
} catch (err) {
    console.error('Error creating uploads directory:', err);
    process.exit(1);
}

// Update Multer setup with absolute path
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Sanitize filename
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, Date.now() + '-' + sanitizedName);
    }
});

// Update the upload middleware with simplified logging
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // Increased to 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept all file types
        cb(null, true);
    }
}).single('file');

const usersFilePath = path.join(__dirname, 'users.json');

// Function to save users data to JSON file
const saveUsers = () => {
    try {
        const usersArray = Array.from(users.entries());
        fs.writeFileSync(usersFilePath, JSON.stringify(usersArray, null, 2));
    } catch (err) {
        console.error('Error saving users data:', err);
    }
};

// Function to load users data from JSON file
const loadUsers = () => {
    try {
        if (fs.existsSync(usersFilePath)) {
            const data = fs.readFileSync(usersFilePath);
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

const uploadedFilesPath = path.join(__dirname, 'uploadedFiles.json');

// Function to save uploaded files data to JSON file
const saveUploadedFiles = () => {
    try {
        fs.writeFileSync(uploadedFilesPath, JSON.stringify(uploadedFiles, null, 2));
    } catch (err) {
        console.error('Error saving uploaded files data:', err);
    }
};

// Function to load uploaded files data from JSON file
const loadUploadedFiles = () => {
    try {
        if (fs.existsSync(uploadedFilesPath)) {
            const data = fs.readFileSync(uploadedFilesPath);
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading uploaded files data:', err);
    }
    return [];
};

// Load uploaded files data on server start
const loadedFiles = loadUploadedFiles();
uploadedFiles.push(...loadedFiles);

const blockchainFilePath = path.join(__dirname, 'blockchain.json');

// Function to save blockchain data to JSON file
const saveBlockchain = () => {
    try {
        fs.writeFileSync(blockchainFilePath, JSON.stringify(blockchain, null, 2));
    } catch (err) {
        console.error('Error saving blockchain data:', err);
    }
};

// Function to load blockchain data from JSON file
const loadBlockchain = () => {
    try {
        if (fs.existsSync(blockchainFilePath)) {
            const data = fs.readFileSync(blockchainFilePath);
            const loadedBlockchain = JSON.parse(data);
            blockchain.push(...loadedBlockchain);
        }
    } catch (err) {
        console.error('Error loading blockchain data:', err);
    }
};

// Load blockchain data on server start
loadBlockchain();

// Add delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Update the upload endpoint with better error handling and logging
// Modified upload endpoint to include session verification
app.post('/api/upload', (req, res) => {
    // Remove session check since we'll handle auth through localStorage
    upload(req, res, async function(err) {
        if (err) {
            console.error('Upload error:', err.message);
            return res.status(500).json({
                success: false,
                message: `Upload failed: ${err.message}`
            });
        }

        if (!req.file) {
            console.error('No file provided');
            return res.status(400).json({
                success: false,
                message: 'No file provided'
            });
        }

        // Add username from request headers
        const username = req.headers['x-user-name'];
        if (!username) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        try {
            // Verify file exists before proceeding
            if (!fs.existsSync(req.file.path)) {
                throw new Error('File not found after upload');
            }

            const filePath = req.file.path;
            const readableStreamForFile = fs.createReadStream(filePath);
            const options = {
                pinataMetadata: {
                    name: req.file.originalname,
                    keyvalues: {
                        timestamp: Date.now(),
                        type: req.file.mimetype
                    }
                },
                pinataOptions: {
                    cidVersion: 0
                }
            };

            console.log(`📤 Starting upload to Pinata in 5 seconds: ${req.file.originalname}`);
            
            // Add 5-second delay here
            await delay(5000);
            
            // Try to upload to Pinata
            const response = await pinata.pinFileToIPFS(readableStreamForFile, options);
            
            // Verify Pinata upload was successful
            if (!response || !response.IpfsHash) {
                throw new Error('Failed to get IPFS hash from Pinata');
            }

            console.log(`✅ Uploaded successfully to Pinata! Hash: ${response.IpfsHash}`);
            
            // Only create and save file data after successful Pinata upload
            // Add user information to file data
            const fileData = {
                fileName: req.file.originalname,
                fileType: req.file.mimetype,
                fileSize: req.file.size,
                ipfsHash: response.IpfsHash,
                pinataUrl: `https://gateway.pinata.cloud/ipfs/${response.IpfsHash}`,
                timestamp: new Date().toISOString(),
                uploadedBy: username,
                uploadTime: new Date().toISOString()
            };

            // Verify file data before adding to records
            if (!fileData.fileName || !fileData.ipfsHash) {
                throw new Error('Invalid file data generated');
            }

            // Add to blockchain and save records only after all verifications pass
            const previousBlock = blockchain[blockchain.length - 1];
            const previousHash = previousBlock ? previousBlock.hash : '0';
            
            const blockData = {
                ...fileData,
                previousHash: previousHash
            };

            blockData.hash = calculateHash(blockData);
            
            // Add to records and save to files
            blockchain.push(blockData);
            uploadedFiles.push(fileData);

            // Save both records
            saveBlockchain();
            saveUploadedFiles();

            // Clean up
            readableStreamForFile.destroy();
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // Broadcast file upload to peers
            const ws = peers.get(username);
            if (ws) {
                broadcastFileUpload(ws, {
                    type: 'fileUploaded',
                    file: fileData,
                    username: username
                });
            }

            res.json({
                success: true,
                data: {
                    block: blockData,
                    ipfs: {
                        hash: response.IpfsHash,
                        size: req.file.size,
                        timestamp: Date.now(),
                        viewUrl: `https://gateway.pinata.cloud/ipfs/${response.IpfsHash}`,
                        gateway: `https://gateway.pinata.cloud/ipfs/${response.IpfsHash}`
                    },
                    fileData: fileData
                }
            });

        } catch (err) {
            console.error('❌ Upload failed:', err.message);
            // Clean up temporary file if it exists
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                try {
                    fs.unlinkSync(req.file.path);
                } catch (unlinkErr) {
                    console.error('Error cleaning up temporary file:', unlinkErr);
                }
            }
            res.status(500).json({
                success: false,
                message: 'Upload failed: ' + err.message
            });
        }
    });
});

// BLOCKCHAIN DATA ENDPOINT
app.get('/api/blockchain', (req, res) => {
    try {
        res.json({
            success: true,
            data: blockchain
        });
    } catch (err) {
        console.error('Blockchain data error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch blockchain data'
        });
    }
});

// Add a status endpoint to check Pinata connection
app.get('/api/status', async (req, res) => {
    try {
        const result = await pinata.testAuthentication();
        const stats = {
            totalFiles: blockchain.length,
            totalSize: blockchain.reduce((acc, block) => acc + (block.fileSize || 0), 0),
            lastUpload: blockchain.length > 0 ? blockchain[blockchain.length - 1].timestamp : null
        };
        
        res.json({
            success: true,
            pinata: result,
            stats: stats
        });
    } catch (err) {
        console.error('Status check error:', err);
        res.status(500).json({
            success: false,
            message: 'Pinata connection error',
            error: err.message
        });
    }
});

// Add a new endpoint to verify uploaded files
app.get('/api/verify-uploads', async (req, res) => {
    try {
        // Load saved files
        const savedFiles = loadUploadedFiles();
        
        // Verify each file with Pinata
        const verifiedFiles = [];
        const invalidFiles = [];

        for (const file of savedFiles) {
            try {
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

        // Update uploadedFiles with only verified files
        if (invalidFiles.length > 0) {
            uploadedFiles.length = 0;
            uploadedFiles.push(...verifiedFiles);
            saveUploadedFiles();
            console.log(`Removed ${invalidFiles.length} invalid files from records`);
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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!'
    });
});

// Add global error handlers
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Perform cleanup
    try {
        const files = fs.readdirSync(uploadDir);
        files.forEach(file => {
            try {
                fs.unlinkSync(path.join(uploadDir, file));
            } catch (e) {
                console.error(`Error deleting file ${file}:`, e);
            }
        });
    } catch (e) {
        console.error('Error during cleanup:', e);
    }
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Perform cleanup
    try {
        const files = fs.readdirSync(uploadDir);
        files.forEach(file => {
            try {
                fs.unlinkSync(path.join(uploadDir, file));
            } catch (e) {
                console.error(`Error deleting file ${file}:`, e);
            }
        });
    } catch (e) {
        console.error('Error during cleanup:', e);
    }
});

// Add endpoint to get active peers
app.get('/api/peers', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'User not authenticated'
        });
    }

    const peerList = Array.from(peers.keys());
    res.json({
        success: true,
        peers: peerList
    });
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
                startServer(initialPort + 1);
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

// Start the server
startServer(port);