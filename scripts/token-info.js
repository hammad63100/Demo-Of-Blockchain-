import pkg from 'hardhat';
const { ethers } = pkg;
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("Network:", pkg.network.name);
    console.log("ChainID:", (await ethers.provider.getNetwork()).chainId);
    
    // Deploy a new token if needed
    const QryptumToken = await ethers.getContractFactory("QryptumToken");
    let token;
    
    try {
        // Try to get the most recently deployed contract
        const deployments = JSON.parse(fs.readFileSync(join(__dirname, '../deployments.json')));
        const deployedAddress = deployments[pkg.network.name];
        console.log("Found existing deployment at:", deployedAddress);
        token = await QryptumToken.attach(deployedAddress);
        
        // Verify the contract responds
        await token.name();
    } catch (error) {
        console.log("Deploying new token instance...");
        token = await QryptumToken.deploy();
        await token.deployed();
        
        // Save deployment info
        const deployments = {};
        deployments[pkg.network.name] = token.address;
        fs.writeFileSync(
            join(__dirname, '../deployments.json'),
            JSON.stringify(deployments, null, 2)
        );
    }

    console.log("\nQRYPT Token Information:");
    console.log("Contract Address:", token.address);
    console.log("Name:", await token.name());
    console.log("Symbol:", await token.symbol());
    console.log("Decimals:", await token.decimals());
    
    console.log("\nMetaMask Import Instructions:");
    console.log("1. Add Network:");
    console.log("   - Network Name: Qryptum Test");
    console.log("   - RPC URL: http://127.0.0.1:8545");
    console.log("   - Chain ID:", (await ethers.provider.getNetwork()).chainId);
    console.log("   - Currency Symbol: QRYPT");
    console.log("\n2. Import Token:");
    console.log("   - Token Contract Address:", token.address);
    console.log("   - Token Symbol: QRYPT");
    console.log("   - Decimals: 18");
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
