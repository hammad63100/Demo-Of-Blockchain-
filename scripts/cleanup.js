import { killProcessOnPort } from './utils/node-manager.js';

async function cleanup() {
    console.log('Cleaning up...');
    await killProcessOnPort(8545);
    console.log('Cleanup complete');
}

cleanup().catch(console.error);
