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
    error AlreadySet();

    event MinterSet(address indexed minter);

    constructor(string memory name_, string memory symbol_, uint256 cap_, address owner_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        cap = cap_;
    }

    /// @notice Sets the only address allowed to mint.
    /// @dev Owner only and one-time, so minting can never be re-pointed after wiring.
    function setMinter(address minter_) external onlyOwner {
        if (minter_ == address(0)) {
            revert ZeroAddress();
        }
        if (minter != address(0)) {
            revert AlreadySet();
        }
        minter = minter_;
        emit MinterSet(minter_);
    }

    /// @notice Mints POTS to an address, up to the cap.
    /// @dev Minter only.
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
