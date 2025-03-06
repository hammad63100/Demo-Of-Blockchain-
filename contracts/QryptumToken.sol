// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract QryptumToken is ERC20, Ownable {
    constructor() ERC20("Qryptum", "QRYPT") {
        // Initial supply will be distributed via mint function
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}