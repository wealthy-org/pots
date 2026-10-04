// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice POTS: capped by the amount ever minted, burnable by its holders.
/// @dev A burn lowers `totalSupply` but never reopens minting capacity: the cap is checked against
/// `totalMinted`, which only grows.
contract POTSToken is ERC20, ERC20Burnable, Ownable {
    uint256 public immutable cap;
    address public minter;
    /// @notice Total POTS ever minted; burns never lower it.
    uint256 public totalMinted;

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

    /// @notice Mints POTS to an address while the amount ever minted stays within the cap.
    /// @dev Minter only.
    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) {
            revert Unauthorized();
        }
        if (totalMinted + amount > cap) {
            revert CapExceeded();
        }
        totalMinted += amount;
        _mint(to, amount);
    }
}
