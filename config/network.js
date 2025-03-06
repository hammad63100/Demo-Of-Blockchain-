export const QRYPTUM_CONFIG = {
    RPC_URL: 'http://localhost:8545',
    CHAIN_ID: 1337,
    UPLOAD_REWARD: 0.0001,  // Base reward in ETH
    UPLOAD_CHARGE: 0.00005, // Base charge in ETH
    MAIN_ACCOUNT: {
        ADDRESS: '0x46299ac2A9DBaf393DC7B00A53A4B6894cB78F3E'
    },
    IPFS: {
        GATEWAY: 'https://gateway.pinata.cloud/ipfs'
    },
    TOKEN_ADDRESS: '0x5fbdb2315678afecb367f032d93f642f64180aa3' // Update with your deployed contract address
};

export const NETWORK_ENDPOINTS = {
    RPC: QRYPTUM_CONFIG.RPC_URL,
    WS: QRYPTUM_CONFIG.RPC_URL.replace('http', 'ws'),
    EXPLORER: "https://sepolia.etherscan.io"
};

export default {
    QRYPTUM_CONFIG,
    NETWORK_ENDPOINTS
};
