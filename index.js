const WebSocket = require('ws');
const readline = require('readline');
const fs = require('fs');

class BlockchainClient {
    constructor() {
        this.ws = null;
        this.username = null;
        this.rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        this.maxRetries = 3;
        this.retryCount = 0;
        this.retryDelay = 2000; // 2 seconds
    }

    async connect() {
        console.log('Connecting to blockchain network...');
        
        try {
            this.ws = new WebSocket('ws://localhost:6001');

            this.ws.on('error', (error) => {
                console.error('❌ Connection error:', error.code || 'Unknown error');
                if (error.code === 'ECONNREFUSED') {
                    console.log('\n⚠️  Server is not running!');
                    console.log('1. Make sure you have started the server with: node server.js');
                    console.log('2. Check if port 6001 is available');
                    console.log('3. Wait a few seconds and the client will retry automatically...\n');
                    
                    if (this.retryCount < this.maxRetries) {
                        this.retryCount++;
                        console.log(`Retrying connection (${this.retryCount}/${this.maxRetries})...`);
                        setTimeout(() => this.connect(), this.retryDelay);
                    } else {
                        console.log('❌ Max retry attempts reached. Please:');
                        console.log('1. Start the server (node server.js)');
                        console.log('2. Restart the client (node index.js)');
                        process.exit(1);
                    }
                }
            });

            this.ws.on('close', () => {
                console.log('\n❌ Connection to server lost!');
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    console.log(`Attempting to reconnect (${this.retryCount}/${this.maxRetries})...`);
                    setTimeout(() => this.connect(), this.retryDelay);
                } else {
                    console.log('❌ Unable to reconnect. Please restart the application.');
                    process.exit(1);
                }
            });

            this.ws.on('open', () => {
                this.retryCount = 0; // Reset retry counter on successful connection
                console.log('✅ Connected successfully!');
                this.registerOrLogin();
            });

            this.ws.on('message', (data) => {
                const message = JSON.parse(data);
                switch (message.type) {
                    case 'AUTH_SUCCESS':
                        console.log('✅ Login successful!');
                        this.showMenu();
                        break;
                    case 'AUTH_ERROR':
                        console.log('❌ Error:', message.error);
                        if (message.error === 'User not registered') {
                            console.log('Please register first!');
                        }
                        this.registerOrLogin();
                        break;
                    case 'UPLOAD_SUCCESS':
                        console.log(`📦 File uploaded to IPFS with hash: ${message.fileHash}`);
                        console.log(`🌐 Pinata URL: ${message.pinataUrl}`);
                        this.showMenu();
                        break;
                    case 'BLOCKCHAIN':
                        console.log('\n📊 Blockchain Data:');
                        console.table(message.blockchain);
                        this.showMenu();
                        break;
                }
            });
        } catch (error) {
            console.error('❌ Failed to create WebSocket connection:', error.message);
            process.exit(1);
        }
    }

    registerOrLogin() {
        this.rl.question('1. Register\n2. Login\nEnter choice (1 or 2): ', (choice) => {
            (choice === '1') ? this.register() : this.login();
        });
    }

    register() {
        this.rl.question('Username: ', (username) => {
            this.rl.question('Password: ', (password) => {
                this.ws.send(JSON.stringify({ type: 'AUTH', username, password, isRegister: true }));
            });
        });
    }

    login() {
        this.rl.question('Username: ', (username) => {
            this.rl.question('Password: ', (password) => {
                this.ws.send(JSON.stringify({ 
                    type: 'AUTH', 
                    username, 
                    password,
                    isRegister: false 
                }));
            });
        });
    }

    async uploadFile() {
        this.rl.question('Enter file path: ', (filePath) => {
            if (!fs.existsSync(filePath)) {
                console.log('❌ File does not exist!');
                return this.showMenu();
            }

            const allowedExtensions = ['.pdf', '.csv', '.txt', '.json'];
            const fileExtension = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
            
            if (!allowedExtensions.includes(fileExtension)) {
                console.log('❌ Invalid file type! Only PDF, CSV, TEXT, and JSON files are supported.');
                return this.showMenu();
            }

            const fileBuffer = fs.readFileSync(filePath);
            const fileName = filePath.split(/[\\/]/).pop();
            
            this.ws.send(JSON.stringify({ 
                type: 'UPLOAD_FILE', 
                file: fileBuffer.toString('base64'),
                fileName: fileName,
                fileType: fileExtension.substring(1), // Remove the dot
                fieldName: 'file' // Add the correct field name for the file
            }));
        });
    }

    viewBlockchain() {
        this.ws.send(JSON.stringify({ type: 'GET_BLOCKCHAIN' }));
    }

    showMenu() {
        this.rl.question('\n1. Upload File\n2. View Blockchain\nChoose option: ', (choice) => {
            choice === '1' ? this.uploadFile() : this.viewBlockchain();
        });
    }
}

const client = new BlockchainClient();
client.connect();
