import { sendTransaction } from '../utils/transactions.js';

export const QRYPTUM_CONFIG = {
    RPC_URL: 'http://127.0.0.1:8545',
    CHAIN_ID: 1337,
    NETWORK_NAME: 'Qryptum',
    CURRENCY_SYMBOL: 'QRYPT',
    UPLOAD_REWARD: 1, // 1 QRYPT per 100KB
    UPLOAD_CHARGE: 0.8, // 0.8 QRYPT per 100KB
    MAIN_ACCOUNT: {
        ADDRESS: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
    },
    IPFS: {
        GATEWAY: 'https://gateway.pinata.cloud/ipfs'
    },
    TOKEN_ADDRESS: '0x5FbDB2315678afecb367f032d93F642f64180aa3', // Will be updated after deployment
    GAS_SETTINGS: {
        gasLimit: 3000000,
        gasPrice: 'auto'
    },
    TRANSACTION: {
        MIN_CONFIRMATIONS: 1,
        DEFAULT_GAS_LIMIT: 3000000,
        TIMEOUT: 60000 // 60 seconds
    },
    NETWORK: {
        CHAIN_ID: 1337,
        NAME: 'Qryptum Local Network',
        SYMBOL: 'QRYPT',
        RPC_URL: 'http://127.0.0.1:8545',
        BLOCK_EXPLORER: 'http://localhost:8545',
        PARAMS: {
            chainId: '0x539', // Hex of 1337
            chainName: 'Qryptum Local Network',
            nativeCurrency: {
                name: 'QRYPT',
                symbol: 'QRYPT',
                decimals: 18
            },
            rpcUrls: ['http://127.0.0.1:8545'],
            blockExplorerUrls: ['http://localhost:8545']
        }
    }
};

export const addQryptumNetwork = async () => {
    try {
        await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [QRYPTUM_CONFIG.NETWORK.PARAMS],
        });
        return true;
    } catch (error) {
        console.error('Failed to add network:', error);
        return false;
    }
};

export const switchToQryptumNetwork = async () => {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: QRYPTUM_CONFIG.NETWORK.PARAMS.chainId }],
        });
        return true;
    } catch (error) {
        if (error.code === 4902) {
            return await addQryptumNetwork();
        }
        console.error('Failed to switch network:', error);
        return false;
    }
};

export const NETWORK_ENDPOINTS = {
    RPC: QRYPTUM_CONFIG.RPC_URL,
    WS: QRYPTUM_CONFIG.RPC_URL.replace('http', 'ws'),
    EXPLORER: "https://sepolia.etherscan.io"
};

export const TransactionService = {
    sendTransaction,
    // Add any other transaction-related functions here
};

export default {
    QRYPTUM_CONFIG,
    NETWORK_ENDPOINTS,
    TransactionService
};
