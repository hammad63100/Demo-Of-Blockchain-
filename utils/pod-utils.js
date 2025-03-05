import crypto from 'crypto';
import { ethers } from 'ethers';

/**
 * Calculate a hash of the file data using SHA256
 * @param {Buffer} fileBuffer - The file data as a buffer
 * @returns {Promise<string>} The hash of the file
 */
export const calculateFileHash = async (fileBuffer) => {
    return new Promise((resolve, reject) => {
        try {
            // Handle different input types
            let buffer = fileBuffer;
            if (!Buffer.isBuffer(fileBuffer)) {
                if (fileBuffer instanceof Uint8Array) {
                    buffer = Buffer.from(fileBuffer);
                } else if (typeof fileBuffer === 'string') {
                    buffer = Buffer.from(fileBuffer);
                } else {
                    throw new Error('Invalid file data type');
                }
            }

            const hash = crypto.createHash('sha256');
            hash.update(buffer);
            resolve(hash.digest('hex'));
        } catch (error) {
            reject(error);
        }
    });
};

/**
 * Verify the proof of data
 * @param {Object} proof - The proof object containing fileHash, timestamp, and nonce
 * @param {string} fileHash - The hash of the file
 * @param {Object} [data=null] - The original file data (optional)
 * @returns {boolean} Whether the proof is valid
 */
export const verifyProofOfData = async (proof, fileHash, data = null) => {
    try {
        // Basic validation
        if (!proof || !proof.fileHash || !proof.nonce) {
            return false;
        }

        // Simple hash verification
        if (fileHash && proof.fileHash !== fileHash) {
            return false;
        }

        // Advanced verification with timestamp if data is provided
        if (data && proof.timestamp) {
            const proofString = ethers.utils.solidityKeccak256(
                ['string', 'uint256', 'uint256'],
                [proof.fileHash, proof.timestamp, proof.nonce]
            );
            return proofString.startsWith('0x000');
        }

        return true;
    } catch (error) {
        console.error('Error verifying proof:', error);
        return false;
    }
};

/**
 * Calculate merkle root from a list of file hashes
 * @param {string[]} hashes - Array of file hashes
 * @returns {string} The merkle root hash
 */
export function calculateMerkleRoot(hashes) {
    if (!hashes || hashes.length === 0) {
        throw new Error('No hashes provided');
    }

    let nodes = hashes.map(hash => Buffer.from(hash, 'hex'));

    while (nodes.length > 1) {
        const layer = [];
        for (let i = 0; i < nodes.length; i += 2) {
            if (i + 1 === nodes.length) {
                layer.push(nodes[i]);
            } else {
                const hash = crypto.createHash('sha256');
                hash.update(Buffer.concat([nodes[i], nodes[i + 1]]));
                layer.push(hash.digest());
            }
        }
        nodes = layer;
    }

    return nodes[0].toString('hex');
}

/**
 * Generate merkle proof for a file hash
 * @param {string[]} hashes - Array of all file hashes
 * @param {string} targetHash - Hash to generate proof for
 * @returns {string[]} Array of proof hashes
 */
export function generateMerkleProof(hashes, targetHash) {
    let proof = [];
    let nodes = hashes.map(hash => Buffer.from(hash, 'hex'));
    let targetIndex = nodes.findIndex(node => node.toString('hex') === targetHash);

    if (targetIndex === -1) {
        throw new Error('Target hash not found');
    }

    while (nodes.length > 1) {
        const layer = [];
        for (let i = 0; i < nodes.length; i += 2) {
            if (i + 1 === nodes.length) {
                layer.push(nodes[i]);
            } else {
                const hash = crypto.createHash('sha256');
                hash.update(Buffer.concat([nodes[i], nodes[i + 1]]));
                layer.push(hash.digest());
                
                if (Math.floor(targetIndex / 2) === Math.floor(i / 2)) {
                    proof.push(nodes[i + (targetIndex % 2 === 0 ? 1 : 0)].toString('hex'));
                }
            }
        }
        nodes = layer;
        targetIndex = Math.floor(targetIndex / 2);
    }

    return proof;
}
