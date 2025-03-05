import pkg from 'hardhat';
const { ethers } = pkg;
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
    try {
        const network = hre.network.name;
        console.log("\n=== Deployment Started ===");
        console.log("Network:", network);

        // Get multiple signers (accounts)
        const signers = await ethers.getSigners();
        console.log("Deployer Account:", signers[0].address);
        console.log("Deployer Balance:", ethers.utils.formatEther(await signers[0].getBalance()), "ETH");

        const QryptumToken = await ethers.getContractFactory("QryptumToken");
        console.log("\nDeploying QryptumToken...");
        
        const qryptumToken = await QryptumToken.deploy();
        await qryptumToken.deployed();
        console.log("QryptumToken deployed to:", qryptumToken.address);

        // Save deployment info
        const deployments = {};
        deployments[network] = qryptumToken.address;
        fs.writeFileSync(
            join(__dirname, '../deployments.json'),
            JSON.stringify(deployments, null, 2)
        );

        console.log("\n=== Minting Tokens ===");
        // Mint 100 QRYPT to each of the first 10 accounts
        const amount = ethers.utils.parseEther("100");
        
        for (let i = 0; i < 10; i++) {
            console.log(`\nProcessing Account ${i + 1}:`);
            console.log("Address:", signers[i].address);
            
            // Check initial balance
            let initialBalance = await qryptumToken.balanceOf(signers[i].address);
            console.log("Initial Balance:", ethers.utils.formatEther(initialBalance), "QRYPT");
            
            // Mint tokens
            const mintTx = await qryptumToken.mint(signers[i].address, amount);
            await mintTx.wait(); // Wait for transaction to be mined
            
            // Verify new balance
            let newBalance = await qryptumToken.balanceOf(signers[i].address);
            console.log("New Balance:", ethers.utils.formatEther(newBalance), "QRYPT");
            
            if(newBalance.toString() !== amount.toString()) {
                console.log("WARNING: Minting might have failed for this address!");
            }
        }

        console.log("\n=== Deployment Complete ===");
        console.log("To see token in MetaMask:");
        console.log("1. Make sure you're connected to http://127.0.0.1:8545");
        console.log("2. Import token address:", qryptumToken.address);

    } catch (error) {
        console.error("\nERROR:");
        console.error(error);
        throw error;
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