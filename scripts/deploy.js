import pkg from 'hardhat';
const { ethers } = pkg;
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
    try {
        console.log("\n=== Deployment Started ===");
        
        const [deployer] = await ethers.getSigners();
        console.log("Deployer Account:", deployer.address);
        
        // Get initial block number
        const startBlock = await ethers.provider.getBlockNumber();
        console.log("Starting block:", startBlock);

        console.log("\nDeploying QryptumToken...");
        const QryptumToken = await ethers.getContractFactory("QryptumToken");
        const token = await QryptumToken.deploy();
        
        // Wait for only 1 confirmation
        await token.deployTransaction.wait(1);
        console.log("QryptumToken deployed to:", token.address);

        // Verify contract deployment immediately
        try {
            const code = await ethers.provider.getCode(token.address);
            if (code === '0x') {
                throw new Error('Contract deployment failed - no bytecode at address');
            }
            
            // Basic contract verification
            const name = await token.callStatic.name();
            const symbol = await token.callStatic.symbol();
            
            console.log(`\nContract verified:`);
            console.log(`Name: ${name}`);
            console.log(`Symbol: ${symbol}`);

        } catch (error) {
            console.error('\nContract verification failed:', error.message);
            process.exit(1);
        }

        // Save contract artifacts
        const artifactsDir = join(__dirname, '../artifacts/deployed');
        if (!fs.existsSync(artifactsDir)) {
            fs.mkdirSync(artifactsDir, { recursive: true });
        }

        // Save deployed contract info
        const deploymentInfo = {
            address: token.address,
            abi: JSON.parse(JSON.stringify(QryptumToken.interface.format())),
            network: pkg.network.name,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync(
            join(artifactsDir, 'QryptumToken.json'),
            JSON.stringify(deploymentInfo, null, 2)
        );

        console.log("\n=== Deployment Complete ===");
        console.log("Contract artifacts saved to:", artifactsDir);

    } catch (error) {
        console.error("\n❌ Deployment failed:");
        console.error(error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });