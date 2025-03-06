const { exec } = require('child_process');
const path = require('path');

function checkIpfs() {
    const ipfsBinPath = path.join(__dirname, 'ipfs-bin', 'kubo');
    const command = `set PATH=${ipfsBinPath};%PATH% && ipfs.exe version`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Error checking IPFS:', error);
            console.log(`
Please ensure:
1. You've run the IPFS installation: node install-ipfs.js
2. The kubo folder exists in: ${ipfsBinPath}
3. Try running as Administrator
            `);
            return;
        }
        console.log('✅ IPFS is available:', stdout);
    });
}

checkIpfs();
