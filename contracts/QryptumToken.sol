// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract QryptumToken is ERC20, Ownable {
    // Events for better tracking
    event TokenMinted(address indexed to, uint256 amount);
    event TokenBurned(address indexed from, uint256 amount);
    event TransferFailed(address indexed from, address indexed to, uint256 amount);
    event ApprovalFailed(address indexed owner, address indexed spender, uint256 amount);
    event GasFeePaid(address indexed from, uint256 amount);
    event EtherReceived(address indexed from, uint256 amount);

    // Error messages
    error InsufficientBalance(uint256 required, uint256 available);
    error InsufficientAllowance(uint256 required, uint256 allowed);
    error TransferToZeroAddress();
    error MintToZeroAddress();

    constructor() ERC20("Qryptum", "QRYPT") {
        // Mint initial supply to contract deployer
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) public onlyOwner {
        if (to == address(0)) revert MintToZeroAddress();
        _mint(to, amount);
        emit TokenMinted(to, amount);
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
        emit TokenBurned(msg.sender, amount);
    }

    function approve(address spender, uint256 amount) public override returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (to == address(0)) revert TransferToZeroAddress();
        if (amount == 0) revert("Cannot transfer 0 amount");
        if (balanceOf(msg.sender) < amount) revert InsufficientBalance(amount, balanceOf(msg.sender));

        _transfer(msg.sender, to, amount);
        return true;
    }

    // ✅ Safe Transfer with Try/Catch to handle errors properly
    function safeTransfer(address to, uint256 amount) public returns (bool) {
        if (to == address(0)) revert TransferToZeroAddress();
        if (amount == 0) revert("Cannot transfer 0 amount");
        if (balanceOf(msg.sender) < amount) revert InsufficientBalance(amount, balanceOf(msg.sender));

        try this.transfer(to, amount) {
            return true;
        } catch {
            emit TransferFailed(msg.sender, to, amount);
            return false;
        }
    }

    // ✅ Safe Approve function (Prevents common allowance issues)
    function safeApprove(address spender, uint256 amount) public returns (bool) {
        address owner = _msgSender();

        try this.approve(spender, amount) {
            return true;
        } catch {
            // Reset allowance before setting new one
            try this.approve(spender, 0) {
                try this.approve(spender, amount) {
                    return true;
                } catch {
                    emit ApprovalFailed(owner, spender, amount);
                    return false;
                }
            } catch {
                emit ApprovalFailed(owner, spender, amount);
                return false;
            }
        }
    }

    // Add receive function to accept ETH transfers
    receive() external payable {
        emit EtherReceived(msg.sender, msg.value);
    }

    // ✅ Function to accept native gas fee (ETH/QRYPT)
    function payGasFee() public payable {
        require(msg.value > 0, "Must send some ETH/QRYPT for gas");
        payable(owner()).transfer(msg.value);
        emit GasFeePaid(msg.sender, msg.value);
    }
}
