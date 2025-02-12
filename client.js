const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const readline = require('readline');

const BASE_URL = 'http://localhost:3000/api';
let authToken = '';
let currentUsername = '';
let savedPassword = '';
const MAX_RETRIES = 3;

async function register(username, password) {
    try {
        const response = await axios.post(`${BASE_URL}/register`, {
            username,
            password
        });
        console.log('Registration successful:', response.data);
    } catch (error) {
        console.error('Registration failed:', error.response?.data || error.message);
        throw error;
    }
}

async function login(username, password) {
    try {
        const response = await axios.post(`${BASE_URL}/login`, {
            username,
            password
        });
        authToken = response.data.token;
        currentUsername = username;
        savedPassword = password; // Save password for potential re-login
        console.log('Login successful:', response.data);
        return authToken;
    } catch (error) {
        console.error('Login failed:', error.response?.data || error.message);
        authToken = '';
        currentUsername = '';
        savedPassword = '';
    }
}

// Add new function to handle re-login
async function tryReLogin() {
    if (currentUsername && savedPassword) {
        console.log('Token expired, attempting to re-login...');
        await login(currentUsername, savedPassword);
        return !!authToken;
    }
    return false;
}

async function uploadFile(filePath) {
    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        // Get the original filename from the path
        const fileName = filePath.split('\\').pop().split('/').pop();
        form.append('username', currentUsername);  // Keep username for server authentication
        form.append('originalFileName', fileName); // Add original filename as separate field

        const response = await axios.post(`${BASE_URL}/upload`, form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${authToken}`
            }
        });
        console.log('File upload successful:', response.data);
    } catch (error) {
        console.error('File upload failed:', error.response?.data || error.message);
    }
}

// Add this helper function for delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getBlockchain(retryCount = 0) {
    if (!authToken) {
        console.error('Please login first');
        return;
    }

    try {
        const response = await axios.get(`${BASE_URL}/blockchain`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        // Successfully got blockchain data
        if (response.data) {
            console.log('\nBlockchain Blocks:');
            const chain = Array.isArray(response.data) ? response.data : 
                        response.data.chain ? response.data.chain : 
                        [response.data];
            
            chain.forEach((block, index) => {
                console.log(`\nBlock ${index}:`);
                console.log(JSON.stringify(block, null, 2));
            });
        }
    } catch (error) {
        if (error.response?.status === 403 || error.response?.status === 401) {
            // Only try to re-login once
            if (retryCount === 0 && await tryReLogin()) {
                return getBlockchain(1);
            } else {
                console.error('Session expired - please login again manually');
                authToken = ''; // Clear token to force new login
                currentUsername = '';
                savedPassword = '';
            }
        } else {
            console.error('Failed to get blockchain:', error.message);
        }
    }
}

// Remove or comment out the verifyToken function since we're not using it
// async function verifyToken() { ... }

async function logout() {
    try {
        if (authToken) {
            await axios.post(`${BASE_URL}/logout`, null, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
        }
    } catch (error) {
        if (error.response?.status !== 404) {
            console.error('Logout error:', error.message);
        }
    } finally {
        authToken = '';
        currentUsername = '';
        savedPassword = ''; // Add this line to clear saved password
        console.log('Successfully logged out');
    }
}

async function promptUser(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function mainMenu() {
    console.log('\nMain Menu:');
    console.log('1. Register');
    console.log('2. Login');
    console.log('3. Upload File');
    console.log('4. View Blockchain');
    console.log('5. Logout');
    const choice = await promptUser('Choose an option: ');
    return choice;
}

async function test() {
    let exit = false;
    while (!exit) {
        const choice = await mainMenu();
        switch (choice) {
            case '1':
                const regUsername = await promptUser('Enter username: ');
                const regPassword = await promptUser('Enter password: ');
                try {
                    await register(regUsername, regPassword);
                } catch (error) {
                    console.error('Skipping registration:', error.response?.data || error.message);
                }
                break;
            case '2':
                currentUsername = await promptUser('Enter username: ');
                const loginPassword = await promptUser('Enter password: ');
                await login(currentUsername, loginPassword);
                break;
            case '3':
                if (authToken) {
                    const filePath = await promptUser('Enter file path: ');
                    if (fs.existsSync(filePath)) {
                        await uploadFile(filePath);  
                    } else {
                        console.error('File upload failed: File does not exist');
                    }
                } else {
                    console.error('Please login first.');
                }
                break;
            case '4':
                if (authToken) {
                    await getBlockchain();
                } else {
                    console.error('Please login first.');
                }
                break;
            case '5':
                await logout();
                break;
            default:
                console.error('Invalid choice. Please try again.');
        }
    }
}

test();
