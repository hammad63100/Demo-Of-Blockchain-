import P2PNode from './p2p-node.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

async function startNode() {
    try {
        console.log('Initializing P2P node...');
        const node = new P2PNode({
            repoPath: join(__dirname, 'ipfs-repo-main'),
            tcpPort: 4002,
            wsPort: 4003
        });

        await node.init();
        
        if (!node.isIPFSAvailable) {
            console.log(`Node started in limited mode (without IPFS).
            To enable full functionality, please:
            1. Install IPFS from https://dist.ipfs.tech/#kubo
            2. Run 'ipfs init' to initialize
            3. Run 'ipfs daemon' to start the IPFS daemon
            4. Restart this application`);
        } else {
            console.log('Node started with full IPFS functionality!');
        }

        console.log('Node started successfully!');
        console.log('IPFS Gateway:', `http://localhost:${node.portRange?.gateway || 8080}/ipfs/`);
        console.log('Ethereum RPC:', process.env.ETH_RPC_URL);

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('Shutting down...');
            await node.stop();
            process.exit(0);
        });

        return node;
    } catch (err) {
        console.error('Failed to start node:', err);
        process.exit(1);
    }
}

startNode().catch(console.error);
