// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { console2 } from "forge-std/Script.sol";
import { DeployBase } from "./DeployBase.sol";
import { POTSToken } from "../src/POTSToken.sol";
import { PotsRandomnessAdapter } from "../src/PotsRandomnessAdapter.sol";
import { PotsAutoPlan } from "../src/PotsAutoPlan.sol";
import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { MockDiceCoordinator } from "../test/mocks/MockDiceCoordinator.sol";

contract DeployLocal is DeployBase {
    function run() external {
        string memory json = vm.readFile("script/params.anvil.json");
        address provider = vm.parseJsonAddress(json, ".randomness.diceProvider");

        vm.startBroadcast();
        address owner = msg.sender;
        MockDiceCoordinator dice = new MockDiceCoordinator(provider);
        POTSToken token = _deployToken(json, owner);
        PotsRandomnessAdapter adapter = _deployAdapter(json, address(dice), owner);
        PotsRoundManager manager = _deployManager(json, address(token), address(adapter), owner);
        PotsAutoPlan plan = _deployPlan(json, manager);
        token.setMinter(address(manager));
        adapter.setManager(address(manager));
        manager.setPlanContract(address(plan));
        manager.fundTreasury{ value: 10 ether }();
        vm.stopBroadcast();

        string memory objectKey = "deployments";
        vm.serializeAddress(objectKey, "diceCoordinator", address(dice));
        vm.serializeAddress(objectKey, "token", address(token));
        vm.serializeAddress(objectKey, "adapter", address(adapter));
        vm.serializeAddress(objectKey, "manager", address(manager));
        string memory output = vm.serializeAddress(objectKey, "plan", address(plan));
        vm.writeJson(output, "./deployments/anvil.json");

        console2.log("MockDiceCoordinator", address(dice));
        console2.log("POTSToken", address(token));
        console2.log("PotsRandomnessAdapter", address(adapter));
        console2.log("PotsRoundManager", address(manager));
        console2.log("PotsAutoPlan", address(plan));
    }
}
