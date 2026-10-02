// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract POTSToken is ERC20, Ownable {
    uint256 public immutable cap;
    address public minter;

    error Unauthorized();
    error CapExceeded();
    error ZeroAddress();

    event MinterSet(address indexed minter);

    constructor(string memory name_, string memory symbol_, uint256 cap_, address owner_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        cap = cap_;
    }

    function setMinter(address minter_) external onlyOwner {
        if (minter_ == address(0)) {
            revert ZeroAddress();
        }
        minter = minter_;
        emit MinterSet(minter_);
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) {
            revert Unauthorized();
        }
        if (totalSupply() + amount > cap) {
            revert CapExceeded();
        }
        _mint(to, amount);
    }
}
