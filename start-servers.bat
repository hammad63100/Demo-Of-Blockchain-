@echo off
start cmd /k "node --no-deprecation --experimental-json-modules start-node.js"
start cmd /k "node --no-deprecation --experimental-json-modules backend.js"
