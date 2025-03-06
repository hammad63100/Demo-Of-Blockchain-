import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fork } from 'child_process';
import fs from 'fs/promises';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

async function checkDirectory() {
    const dirs = ['uploads', 'ipfs-repo-backend'];
    for (const dir of dirs) {
        try {
            await fs.access(join(__dirname, dir));
        } catch {
            await fs.mkdir(join(__dirname, dir), { recursive: true });
            console.log(`Created directory: ${dir}`);
        }
    }
}

async function startServices() {
    try {
        // Check and create required directories
        await checkDirectory();

        // Start backend server
        const backend = fork(join(__dirname, 'backend.js'), [], {
            env: { ...process.env, PORT: 3001 }
        });

        backend.on('message', (msg) => {
            console.log('Backend:', msg);
        });

        backend.on('error', (err) => {
            console.error('Backend error:', err);
        });

        console.log('Starting services...');
        
        // Log startup status
        console.log(`
Services started:
- Backend API: http://localhost:3001
- WebSocket: ws://localhost:3001
- IPFS Node: Initialized
        `);

    } catch (error) {
        console.error('Failed to start services:', error);
        process.exit(1);
    }
}

startServices().catch(console.error);
