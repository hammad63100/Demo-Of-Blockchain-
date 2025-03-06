@echo off
echo Initializing IPFS...
set PATH=%~dp0kubo;%PATH%
cd %~dp0kubo
ipfs.exe init
echo.
echo IPFS initialized! Now starting the daemon...
echo.
start "IPFS Daemon" ipfs.exe daemon
echo IPFS daemon started in a new window.
