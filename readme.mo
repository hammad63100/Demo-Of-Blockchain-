pahly node intsall-ipfs.js chalna hay 

//node forceforce-cleanup-ipfs.js

terminal no 1 
1. cd ipfs-bin\kubo
2. .\ipfs.exe init
3. .\ipfs.exe daemon


terminal no 2
npm run start

terminal no 3
node scripts/start-local-node.js

npx hardhat node

terminal 4
npx hardhat compile

npx hardhat run scripts/deploy.js --network qryptumTest

node cleanup-ipfs-repos.js


terminal 5
node scripts/send-transaction.js
for check a transaction



Open MetaMask

Click "Add Network"

Click "Add Network Manually"

Fill in these details:

Network Name: Qryptum
New RPC URL: http://127.0.0.1:8545
Chain ID: 1337
Currency Symbol: QRYPT
To start the network, run: