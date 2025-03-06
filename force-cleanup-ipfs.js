const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

async function forceCleanupIPFS() {
    const ipfsDir = path.join(os.homedir(), '.ipfs');
    const lockFile = path.join(ipfsDir, 'repo.lock');
    
    console.log('🧹 Force cleaning IPFS...');
    
    try {
        // Kill all IPFS processes
        try {
            console.log('Stopping all IPFS processes...');
            execSync('taskkill /F /IM "ipfs.exe" /T', { stdio: 'ignore' });
            console.log('✅ Stopped all IPFS processes');
        } catch (e) {
            // Processes might not exist, ignore error
        }

        // Remove lock file if it exists
        if (fs.existsSync(lockFile)) {
            console.log('Removing lock file...');
            fs.unlinkSync(lockFile);
            console.log('✅ Removed lock file');
        }

        // Remove entire IPFS directory
        if (fs.existsSync(ipfsDir)) {
            console.log('Removing IPFS directory...');
            fs.rmSync(ipfsDir, { recursive: true, force: true });
            console.log('✅ Removed IPFS directory');
        }

        console.log(`
✅ IPFS force cleanup complete!

Now run these commands in order:
1. cd D:\\pinata-starter\\ipfs-bin\\kubo
2. .\\ipfs.exe init
3. .\\ipfs.exe daemon
`);
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        console.error(error);
    }
}

forceCleanupIPFS();
