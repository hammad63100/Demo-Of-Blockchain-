const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

const IPFS_VERSION = 'v0.26.0';
const ARCH = os.arch() === 'x64' ? 'amd64' : '386';
const PLATFORM = 'windows';

async function extract7Zip(zipPath, outputPath) {
    return new Promise((resolve, reject) => {
        // Updated 7-Zip paths to include more possible locations
        const possible7zPaths = [
            'C:\\Program Files\\7-Zip\\7z.exe',
            'C:\\Program Files\\7-Zip\\7z',
            'C:\\Program Files (x86)\\7-Zip\\7z.exe',
            'C:\\Program Files (x86)\\7-Zip\\7z',
            '7z.exe',
            '7z'
        ];

        let found7z = false;
        let tried = 0;

        for (const sevenZipPath of possible7zPaths) {
            tried++;
            try {
                // Log the attempt
                console.log(`Trying 7-Zip path: ${sevenZipPath}`);
                
                const command = `"${sevenZipPath}" x "${zipPath}" -o"${outputPath}" -y`;
                console.log('Executing command:', command);
                
                exec(command, (err, stdout, stderr) => {
                    if (err) {
                        console.error('Extraction error with', sevenZipPath, ':', err.message);
                        if (tried === possible7zPaths.length) {
                            reject(new Error('All 7-Zip paths failed'));
                        }
                        return;
                    }
                    
                    console.log('Extraction successful!');
                    found7z = true;
                    resolve();
                });
                
                // If we get here without error, break the loop
                break;
            } catch (err) {
                console.error('Error with', sevenZipPath, ':', err.message);
                if (tried === possible7zPaths.length) {
                    console.error(`
⚠️ 7-Zip not found! Please ensure:
1. 7-Zip is installed correctly from https://7-zip.org/
2. The installation completed successfully
3. Try running PowerShell/Command Prompt as Administrator
4. You may need to restart your computer after installing 7-Zip
5. Verify 7-Zip is in one of these locations:
   ${possible7zPaths.join('\n   ')}
                    `);
                    reject(new Error('7-Zip not found or not accessible'));
                }
            }
        }
    });
}

async function downloadIPFS() {
    console.log('📦 Installing IPFS...');
    
    const fileName = `kubo_${IPFS_VERSION}_${PLATFORM}-${ARCH}.zip`;
    const downloadUrl = `https://dist.ipfs.tech/kubo/${IPFS_VERSION}/kubo_${IPFS_VERSION}_${PLATFORM}-${ARCH}.zip`;
    const outputPath = path.join(__dirname, 'ipfs-bin');
    const ipfsBinPath = path.join(outputPath, 'kubo');

    // Create directory if it doesn't exist
    if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
    }

    console.log('⬇️ Downloading IPFS binary...');
    console.log(`URL: ${downloadUrl}`);

    return new Promise((resolve, reject) => {
        const zipPath = path.join(outputPath, fileName);
        const file = fs.createWriteStream(zipPath);

        https.get(downloadUrl, (response) => {
            response.pipe(file);
            file.on('finish', async () => {
                file.close();
                console.log('✅ Download complete!');
                console.log(`📂 Saved to: ${zipPath}`);
                
                try {
                    // Extract using 7-Zip
                    console.log('📦 Extracting files...');
                    await extract7Zip(zipPath, outputPath);
                    
                    // Create .ipfs directory in user's home
                    const ipfsConfigDir = path.join(os.homedir(), '.ipfs');
                    if (!fs.existsSync(ipfsConfigDir)) {
                        fs.mkdirSync(ipfsConfigDir, { recursive: true });
                    }

                    // Create batch file for easy access
                    const batchContent = `@echo off
set PATH=${ipfsBinPath};%PATH%
ipfs.exe %*`;
                    
                    const batchPath = path.join(outputPath, 'ipfs.bat');
                    fs.writeFileSync(batchPath, batchContent);

                    console.log(`
✅ IPFS installed successfully!
🚀 To start using IPFS:

1. Copy and paste these commands:
   ${batchPath}
   ipfs init
   ipfs daemon

Note: If you get permission errors, run your terminal as Administrator.
`);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        }).on('error', (err) => {
            fs.unlink(zipPath, () => {});
            reject(err);
        });
    });
}

downloadIPFS().catch(console.error);
