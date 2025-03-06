import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { mdns } from '@libp2p/mdns'
import { kadDHT } from '@libp2p/kad-dht'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { create as createIPFS } from 'ipfs-http-client';
import { create } from 'ipfs-core'
import { ethers } from 'ethers'
import StorageArtifact from './contracts/StorageArtifact.js';
import Web3 from 'web3';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { findAvailablePort, generatePortRange } from './utils/port-manager.js';
import { promises as fsPromises } from 'fs';
const execAsync = promisify(exec);

class P2PNode {
    constructor(options = {}) {
        this.options = {
            repoPath: options.repoPath || './ipfs-repo',
            tcpPort: options.tcpPort || 4012,
            wsPort: options.wsPort || 4013,
            apiPort: options.apiPort || 5002,
            gatewayPort: options.gatewayPort || 9090
        };
        // Add random suffix to avoid conflicts
        this.options.repoPath += `-${Math.random().toString(36).substr(2, 9)}`;
        this.ipfs = null;
        this.libp2p = null;
        this.contract = null;
        this.peers = new Map();
        this.provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC_URL);
        this.files = new Map();
        this.isIPFSAvailable = false;
        this.shards = new Map();
        this.merkleTree = new Map();
        this.portRange = null;
        this.repoPath = options.repoPath;
    }

    async pathExists(path) {
        try {
            await fsPromises.access(path);
            return true;
        } catch {
            return false;
        }
    }

    async checkIPFSAvailability() {
        try {
            // Try to connect to IPFS daemon
            const ipfs = createIPFS({ url: 'http://localhost:5001' });
            await ipfs.version();
            return true;
        } catch (err) {
            console.warn('IPFS daemon not available:', err.message);
            return false;
        }
    }

    async cleanupLocks() {
        const locks = [
            path.join(this.repoPath, 'repo.lock'),
            path.join(this.repoPath, 'datastore', 'LOCK'),
            path.join(this.repoPath, 'api'),  // Add API lockfile
        ];

        // Kill any running IPFS processes first
        try {
            if (process.platform === 'win32') {
                await execAsync('taskkill /f /im ipfs.exe');
            } else {
                await execAsync('pkill -f ipfs');
            }
            console.log('Stopped running IPFS processes');
        } catch (err) {
            // Ignore errors if no IPFS process was running
        }

        // Wait a moment for processes to clean up
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Remove the entire repo if it exists
        if (fs.existsSync(this.repoPath)) {
            try {
                fs.rmSync(this.repoPath, { recursive: true, force: true });
                
                // Recreate empty repo directory
                fs.mkdirSync(this.repoPath, { recursive: true });
            } catch (err) {
                console.error('Failed to remove repo:', err);
            }
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    async init() {
        try {
            // Clean up old repo if exists
            if (await this.pathExists(this.options.repoPath)) {
                await fsPromises.rm(this.options.repoPath, { recursive: true, force: true });
            }

            await this.cleanupLocks();
            this.isIPFSAvailable = await this.checkIPFSAvailability();
            
            // Find available ports
            const basePort = await findAvailablePort(this.tcpPort);
            this.portRange = generatePortRange(basePort);
            
            // Initialize libp2p node with updated configuration
            this.libp2p = await createLibp2p({
                addresses: {
                    listen: [
                        `/ip4/127.0.0.1/tcp/${this.portRange.tcp}`,
                        `/ip4/0.0.0.0/tcp/${this.portRange.tcp}`
                    ]
                },
                transports: [tcp()],
                connectionEncryption: [noise()],
                pubsub: gossipsub({
                    allowPublishToZeroPeers: true,
                    emitSelf: true,
                    heartbeatInterval: 1000,
                    // Add more stable connection settings
                    maxInboundStreams: 256,
                    maxOutboundStreams: 256,
                    timeout: 30000
                }),
                connectionManager: {
                    minConnections: 0,
                    maxConnections: 50,
                    maxParallelDials: 25,
                    // Add connection stabilization
                    pollInterval: 2000,
                    autoDial: true,
                    autoDialInterval: 15000
                }
            });

            await this.libp2p.start();

            // Initialize IPFS with dynamic ports
            if (this.isIPFSAvailable) {
                try {
                    this.ipfs = await create({
                        repo: this.options.repoPath,
                        config: {
                            Addresses: {
                                Swarm: [
                                    `/ip4/127.0.0.1/tcp/${this.portRange.swarm}`
                                ],
                                API: `/ip4/127.0.0.1/tcp/${this.portRange.api}`,
                                Gateway: `/ip4/127.0.0.1/tcp/${this.portRange.gateway}`
                            },
                            Bootstrap: [],
                            Discovery: {
                                MDNS: {
                                    Enabled: true,
                                    Interval: 10
                                }
                            }
                        },
                        init: { allowNew: true }
                    });

                    const version = await this.ipfs.version();
                    console.log('Connected to IPFS version:', version);
                } catch (err) {
                    console.error('IPFS initialization error:', err);
                    this.isIPFSAvailable = false;
                }
            }

            // Initialize smart contract with address from env
            if (process.env.CONTRACT_ADDRESS) {
                try {
                    const signer = this.provider.getSigner();
                    this.contract = new ethers.Contract(
                        process.env.CONTRACT_ADDRESS,
                        StorageArtifact.abi,
                        signer
                    );
                } catch (err) {
                    console.warn('Failed to initialize contract:', err.message);
                }
            } else {
                console.warn('CONTRACT_ADDRESS not set in environment, smart contract features will be disabled');
            }

            // Set up event handlers
            await this.setupEventHandlers();
            
            console.log('P2P Node started with PeerID:', this.libp2p.peerId.toString());
        } catch (err) {
            console.error('Node initialization error:', err);
            this.isIPFSAvailable = false;
            throw err; // Re-throw to handle in calling code
        }
    }

    async uploadFile(file) {
        if (!this.isIPFSAvailable) {
            throw new Error('IPFS daemon is not available. Please install and start IPFS first.');
        }

        try {
            // Ensure file is a Buffer
            const fileBuffer = Buffer.isBuffer(file) ? file : Buffer.from(file);
            
            // Split file into shards
            const shards = await splitIntoShards(fileBuffer);
            
            // Create merkle tree
            const merkleTree = await createMerkleTree(shards);
            
            if (!merkleTree || !Array.isArray(merkleTree) || merkleTree.length === 0) {
                throw new Error('Failed to create merkle tree');
            }

            const shardHashes = [];

            // Upload each shard to IPFS
            for (const shard of shards) {
                const result = await this.ipfs.add(shard);
                shardHashes.push(result.cid.toString());
                this.shards.set(result.cid.toString(), shard);
            }

            // Get merkle root (first hash in first level of tree)
            const merkleRoot = merkleTree[0][0].toString('hex');

            return {
                merkleRoot,
                shardHashes,
                size: fileBuffer.length
            };
        } catch (error) {
            console.error('File upload error:', error);
            throw error;
        }
    }

    async downloadFile(merkleRoot) {
        if (!this.isIPFSAvailable) {
            throw new Error('IPFS daemon is not available. Please install and start IPFS first.');
        }
        // Get file info from contract
        const fileData = await this.contract.getFileDetails(merkleRoot);
        const shards = [];

        // Download shards from network
        for (const hash of fileData.shardHashes) {
            let shard;
            if (this.shards.has(hash)) {
                shard = this.shards.get(hash);
            } else {
                shard = await this.downloadShard(hash);
                this.shards.set(hash, shard);
            }
            shards.push(shard);
        }

        // Verify merkle proof
        const isValid = await this.verifyMerkleProof(shards, merkleRoot);
        if (!isValid) {
            throw new Error('File verification failed');
        }

        // Combine shards
        return Buffer.concat(shards);
    }

    async verifyBlock(blockData) {
        // Verify file exists on IPFS
        const exists = await this.ipfs.block.stat(blockData.cid);
        return exists !== null;
    }

    async setupEventHandlers() {
        // Only set up event handlers for available services
        try {
            // Handle new peers
            this.libp2p.addEventListener('peer:discovery', async (peer) => {
                console.log('Discovered peer:', peer.detail.id.toString());
                await this.libp2p.dial(peer.detail.id);
            });

            // Handle pubsub if available
            if (this.libp2p.services.pubsub) {
                this.libp2p.services.pubsub.subscribe('new-file');
                this.libp2p.services.pubsub.addEventListener('message', async (msg) => {
                    const fileInfo = JSON.parse(msg.detail.data.toString());
                    console.log('New file available:', fileInfo.hash);
                });
            }

            // Handle contract events if available
            if (this.contract) {
                this.contract.on('FileUploaded', (fileId, uploader, shards) => {
                    console.log('New file uploaded:', fileId, 'by', uploader, 'with', shards, 'shards');
                });
            }

            // Handle discovery events if available
            if (this.libp2p.services.discovery && typeof this.libp2p.services.discovery.on === 'function') {
                this.libp2p.services.discovery.on('peer', (peerId) => {
                    console.log('Discovered peer:', peerId.toString());
                });
            }

            // Handle connections if connection manager is available
            this.libp2p.addEventListener('peer:connect', (event) => {
                const peerId = event.detail.toString();
                this.peers.set(peerId, event.detail);
                console.log('Connected to peer:', peerId);
            });
            
            this.libp2p.addEventListener('peer:disconnect', (event) => {
                const peerId = event.detail.toString();
                this.peers.delete(peerId);
                console.log('Disconnected from peer:', peerId);
            });
            
        } catch (err) {
            console.warn('Error setting up event handlers:', err.message);
        }
    }

    getNodeStatus() {
        return {
            peerId: this.libp2p?.peerId?.toString() || null,
            isIPFSAvailable: this.isIPFSAvailable,
            connectedPeers: Array.from(this.peers.keys()),
            ipfsVersion: this.ipfs?.version || null
        };
    }

    async broadcastFileUpload(blockData) {
        const message = JSON.stringify({
            type: 'newFile',
            data: blockData
        });

        // Use pubsub to broadcast messages
        try {
            const topic = 'file-sharing';
            await this.libp2p.pubsub.publish(topic, new TextEncoder().encode(message));
        } catch (err) {
            console.error('Failed to broadcast message:', err);
        }
    }

    async stop() {
        await this.libp2p.stop();
        if (this.ipfs && this.isIPFSAvailable) {
            await this.ipfs.stop();
        }
        console.log('P2P Node stopped');
    }
}

async function splitIntoShards(buffer) {
    const shards = [];
    const shardSize = 1024 * 1024; // 1MB shards
    
    for (let i = 0; i < buffer.length; i += shardSize) {
        shards.push(buffer.slice(i, i + shardSize));
    }
    
    return shards;
}

async function createMerkleTree(shards) {
    if (!Array.isArray(shards) || shards.length === 0) {
        throw new Error('Invalid shards array');
    }

    // Create leaf nodes from shards
    const leaves = shards.map(shard => {
        if (!Buffer.isBuffer(shard)) {
            throw new Error('Each shard must be a Buffer');
        }
        return crypto.createHash('sha256').update(shard).digest();
    });

    const tree = [leaves];
    let currentLevel = leaves;

    // Build the tree bottom-up
    while (currentLevel.length > 1) {
        const nextLevel = [];
        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
            const combined = Buffer.concat([left, right]);
            const parent = crypto.createHash('sha256').update(combined).digest();
            nextLevel.push(parent);
        }
        tree.unshift(nextLevel);
        currentLevel = nextLevel;
    }

    return tree;
}

// Change export statement
export { P2PNode as default };
