import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function forceRemoveDirectory(dir, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            // Kill any IPFS processes first
            try {
                execSync('taskkill /F /IM ipfs.exe /T', { stdio: 'ignore' });
            } catch (e) {
                // Ignore if no processes found
            }

            // Wait for processes to fully terminate
            await delay(1000);

            // Force unlock any database locks
            const datastorePath = path.join(dir, 'datastore');
            if (fs.existsSync(datastorePath)) {
                const files = fs.readdirSync(datastorePath);
                for (const file of files) {
                    if (file.endsWith('.log')) {
                        try {
                            fs.unlinkSync(path.join(datastorePath, file));
                        } catch (e) {
                            console.warn(`Could not remove log file ${file}, will retry...`);
                        }
                    }
                }
            }

            // Remove the entire directory
            fs.rmSync(dir, { recursive: true, force: true });
            console.log(`✅ Cleaned up ${path.basename(dir)}`);
            return true;
        } catch (err) {
            console.warn(`Attempt ${i + 1}/${maxRetries} failed:`, err.message);
            await delay(2000 * (i + 1)); // Exponential backoff
        }
    }
    return false;
}

async function cleanupRepos() {
    const repos = ['ipfs-repo-main', 'ipfs-repo-backend'];
    let allSuccess = true;
    
    console.log('🔄 Starting cleanup...');
    
    // Stop all IPFS related processes
    try {
        execSync('taskkill /F /IM ipfs.exe /T', { stdio: 'ignore' });
        console.log('✅ Stopped IPFS processes');
    } catch (e) {
        // Ignore if no processes found
    }

    // Give processes time to fully stop
    await delay(2000);

    for (const repo of repos) {
        const repoPath = path.join(__dirname, repo);
        if (fs.existsSync(repoPath)) {
            const success = await forceRemoveDirectory(repoPath);
            if (!success) {
                allSuccess = false;
                console.error(`❌ Failed to clean ${repo} after multiple attempts`);
            }
        } else {
            console.log(`ℹ️ ${repo} does not exist, skipping...`);
        }
    }

    if (allSuccess) {
        console.log('✨ All repos cleaned successfully!');
    } else {
        console.warn('⚠️ Some cleanups failed. You may need to:');
        console.warn('1. Close all programs using IPFS');
        console.warn('2. Restart your computer');
        console.warn('3. Try running this script again');
        process.exit(1);
    }
}

cleanupRepos().catch(err => {
    console.error('❌ Fatal error during cleanup:', err);
    process.exit(1);
});
