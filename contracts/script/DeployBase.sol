// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Script } from "forge-std/Script.sol";
import { POTSToken } from "../src/POTSToken.sol";
import { PotsRandomnessAdapter } from "../src/PotsRandomnessAdapter.sol";
import { PotsRoundManager } from "../src/PotsRoundManager.sol";

abstract contract DeployBase is Script {
    function _deployToken(string memory json, address owner) internal returns (POTSToken) {
        string memory name = vm.parseJsonString(json, ".token.name");
        string memory symbol = vm.parseJsonString(json, ".token.symbol");
        uint256 cap = vm.parseJsonUint(json, ".token.cap");
        return new POTSToken(name, symbol, cap, owner);
    }

    function _deployAdapter(string memory json, address coordinator, address owner)
        internal
        returns (PotsRandomnessAdapter)
    {
        address provider = vm.parseJsonAddress(json, ".randomness.diceProvider");
        uint32 gasLimit = uint32(vm.parseJsonUint(json, ".randomness.callbackGasLimit"));
        return new PotsRandomnessAdapter(coordinator, provider, gasLimit, owner);
    }

    function _deployManager(string memory json, address token, address adapter, address owner)
        internal
        returns (PotsRoundManager)
    {
        return new PotsRoundManager(
            token,
            adapter,
            owner,
            uint16(vm.parseJsonUint(json, ".fees.treasuryBps")),
            uint16(vm.parseJsonUint(json, ".fees.jackpotBps")),
            uint16(vm.parseJsonUint(json, ".fees.payoutBps")),
            vm.parseJsonUint(json, ".entry.minPerSquareWei"),
            vm.parseJsonUint(json, ".entry.maxPerSquareWei"),
            uint32(vm.parseJsonUint(json, ".round.windowSeconds")),
            vm.parseJsonUint(json, ".jackpot.chanceDenominator"),
            vm.parseJsonUint(json, ".emission.perRoundWei"),
            vm.parseJsonUint(json, ".randomness.refundDelayBlocks")
        );
    }
}
