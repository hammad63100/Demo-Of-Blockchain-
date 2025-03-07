import { execSync } from 'child_process';
import { checkPortInUse, killProcessOnPort } from './utils/node-manager.js';

async function main() {
    try {
        const PORT = 8545;
        
        // Check if port is in use
        const isPortBusy = await checkPortInUse(PORT);
        if (isPortBusy) {
            console.log('Port 8545 is in use. Attempting to free it...');
            await killProcessOnPort(PORT);
            // Wait a moment for the port to be freed
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Start local node in a separate process
        console.log('Starting local node...');
        const nodeProcess = execSync('npx hardhat node', { 
            stdio: 'inherit',
            detached: true
        });

        // Wait for node to start
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('\nDeploying contracts...');
        execSync('npx hardhat run scripts/deploy.js --network qryptumTest', { 
            stdio: 'inherit' 
        });

        console.log('\nGetting token info...');
        execSync('npx hardhat run scripts/token-info.js --network qryptumTest', {
            stdio: 'inherit'
        });

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main().catch(console.error);
