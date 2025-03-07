import { execSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function startServices() {
    console.log('Starting services...\n');

    try {
        // Start local Hardhat node
        console.log('Starting Hardhat node...');
        execSync('npx hardhat node', { 
            stdio: 'pipe',
            detached: true 
        });
        
        // Wait for node to start
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Deploy contract
        console.log('Deploying contract...');
        execSync('npx hardhat run scripts/deploy.js --network qryptumTest', {
            stdio: 'inherit'
        });

        // Start backend server
        console.log('\nStarting backend server...');
        execSync('node backend.js', {
            stdio: 'inherit'
        });

    } catch (error) {
        console.error('Error starting services:', error);
        process.exit(1);
    }
}

startServices().catch(console.error);
