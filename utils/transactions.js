import { ethers } from 'ethers';
import { QRYPTUM_CONFIG, switchToQryptumNetwork } from '../config/network.js';

export async function sendTransaction(to, amount) {
    try {
        if (!window.ethereum) {
            throw new Error('MetaMask not installed!');
        }

        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        
        // Check and switch network if needed
        const chainId = await ethereum.request({ method: 'eth_chainId' });
        if (chainId !== QRYPTUM_CONFIG.NETWORK.PARAMS.chainId) {
            const switched = await switchToQryptumNetwork();
            if (!switched) {
                throw new Error('Failed to switch to Qryptum network');
            }
        }

        const transactionParameters = {
            to: to,
            from: accounts[0],
            value: ethers.utils.parseEther(amount).toHexString(),
            gasLimit: QRYPTUM_CONFIG.GAS_SETTINGS.gasLimit,
            chainId: QRYPTUM_CONFIG.NETWORK.PARAMS.chainId
        };

        const txHash = await ethereum.request({
            method: 'eth_sendTransaction',
            params: [transactionParameters],
        });

        console.log('Transaction sent:', txHash);
        return txHash;
    } catch (error) {
        console.error('Transaction failed:', error);
        throw error;
    }
}

export async function waitForTransaction(txHash) {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    return await provider.waitForTransaction(txHash);
}
