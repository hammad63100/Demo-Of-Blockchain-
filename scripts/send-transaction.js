import { ethers } from 'ethers';

async function main() {
    const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545', {
        name: 'local',
        chainId: 1337
    });
    const signer = provider.getSigner(0); // Use the first account

    const recipient = '0x6726FCe27F62f0651Ea68466f95513A9079c7dbe'; // Replace with the recipient address
    const amount = ethers.utils.parseEther('1.0'); // 1 ETH

    try {
        const tx = await signer.sendTransaction({
            to: recipient,
            value: amount
        });

        console.log('Transaction hash:', tx.hash);

        const receipt = await tx.wait();
        console.log('Transaction confirmed in block:', receipt.blockNumber);
    } catch (error) {
        if (error.code === 'UNSUPPORTED_OPERATION') {
            console.error('Network does not support ENS. Please use a valid Ethereum address.');
        } else {
            console.error('Transaction failed:', error);
        }
    }
}

main().catch(console.error);
