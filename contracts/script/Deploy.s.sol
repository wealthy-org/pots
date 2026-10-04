// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { console2 } from "forge-std/Script.sol";
import { DeployBase } from "./DeployBase.sol";
import { POTSToken } from "../src/POTSToken.sol";
import { PotsRandomnessAdapter } from "../src/PotsRandomnessAdapter.sol";
import { PotsAutoPlan } from "../src/PotsAutoPlan.sol";
import { PotsRoundManager } from "../src/PotsRoundManager.sol";

contract Deploy is DeployBase {
    function run() external {
        string memory json = vm.readFile("script/params.testnet.json");
        address coordinator = vm.parseJsonAddress(json, ".randomness.diceCoordinator");

        vm.startBroadcast();
        address owner = msg.sender;
        POTSToken token = _deployToken(json, owner);
        PotsRandomnessAdapter adapter = _deployAdapter(json, coordinator, owner);
        PotsRoundManager manager = _deployManager(json, address(token), address(adapter), owner);
        PotsAutoPlan plan = _deployPlan(json, manager);
        token.setMinter(address(manager));
        adapter.setManager(address(manager));
        manager.setPlanContract(address(plan));
        vm.stopBroadcast();

        console2.log("POTSToken", address(token));
        console2.log("PotsRandomnessAdapter", address(adapter));
        console2.log("PotsRoundManager", address(manager));
        console2.log("PotsAutoPlan", address(plan));
    }
}
