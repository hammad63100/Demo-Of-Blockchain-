import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
    console.log('Starting local Hardhat node...');
    try {
        // Clean up any existing deployments
        execSync('npx hardhat clean', { stdio: 'inherit' });
        
        // Start local node in background
        console.log('\nStarting Hardhat node...');
        const node = execSync('npx hardhat node', { 
            stdio: 'inherit',
            detached: true,
            env: {
                ...process.env,
                NODE_ENV: 'development'
            }
        });

        // Wait for node to start
        console.log('Waiting for node to start...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Deploy contracts
        console.log('\nDeploying contracts...');
        execSync('npx hardhat run scripts/deploy.js --network qryptumTest', {
            stdio: 'inherit',
            env: {
                ...process.env,
                NODE_ENV: 'development'
            }
        });

    } catch (error) {
        console.error('Error starting local network:', error);
        process.exit(1);
    }
}

// Using async IIFE instead of main().then()
(async () => {
    try {
        await main();
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
})();
