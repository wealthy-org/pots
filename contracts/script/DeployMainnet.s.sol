// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { console2 } from "forge-std/Script.sol";
import { DeployBase } from "./DeployBase.sol";
import { IDiceEntropy } from "../src/interfaces/IDiceEntropy.sol";
import { POTSToken } from "../src/POTSToken.sol";
import { PotsRandomnessAdapter } from "../src/PotsRandomnessAdapter.sol";
import { PotsAutoPlan } from "../src/PotsAutoPlan.sol";
import { PotsRoundManager } from "../src/PotsRoundManager.sol";

/// @notice Mainnet deployment. Run it first against a fork of chain 4663 without `--broadcast`.
/// @dev Environment: `MAINNET_OWNER` (the multisig contract that will own the manager) and an
/// optional `MAINNET_TREASURY_SEED_WEI`. The deployer owns the token and the adapter only until
/// the wiring is done, then renounces both: neither keeps any power after `setMinter` and
/// `setManager`, so the manager owner is the only privileged role left. The plan contract has no
/// owner. The manager is owned by the multisig from its construction, so the multisig registers the
/// plan contract afterwards with `setPlanContract` (once); until then no plan can be created.
contract DeployMainnet is DeployBase {
    uint256 internal constant MAINNET_CHAIN_ID = 4663;
    uint256 internal constant MAX_SANE_FEE = 0.001 ether;
    uint256 internal constant MAX_SANE_ACTIVE_PLANS = 1000;

    struct Plan {
        string json;
        address coordinator;
        address provider;
        address multisig;
        uint32 callbackGas;
        uint256 seed;
    }

    function run() external {
        Plan memory plan = _preflight();

        _startBroadcast();
        address deployer = msg.sender;
        POTSToken token = _deployToken(plan.json, deployer);
        PotsRandomnessAdapter adapter = _deployAdapter(plan.json, plan.coordinator, deployer);
        PotsRoundManager manager =
            _deployManager(plan.json, address(token), address(adapter), plan.multisig);
        PotsAutoPlan autoPlan = _deployPlan(plan.json, manager);
        token.setMinter(address(manager));
        adapter.setManager(address(manager));
        token.renounceOwnership();
        adapter.renounceOwnership();
        if (plan.seed > 0) {
            manager.fundTreasury{ value: plan.seed }();
        }
        _stopBroadcast();

        _assertDeployment(plan, token, adapter, manager, autoPlan);

        console2.log("POTSToken", address(token));
        console2.log("PotsRandomnessAdapter", address(adapter));
        console2.log("PotsRoundManager", address(manager));
        console2.log("PotsAutoPlan", address(autoPlan));
        console2.log("Manager owner", manager.owner());
        console2.log("Next: the multisig calls setPlanContract(PotsAutoPlan) on the manager, once");
        console2.log(
            "Next: take the manager creation receipt blockNumber (the chain height, not block.number) for the app and indexer start block"
        );
    }

    /// @dev Read from the environment; a test harness overrides both so it does not depend on
    /// process-wide environment variables, which Foundry tests share when they run in parallel.
    function _ownerInput() internal view virtual returns (address) {
        return vm.envAddress("MAINNET_OWNER");
    }

    function _seedInput() internal view virtual returns (uint256) {
        return vm.envOr("MAINNET_TREASURY_SEED_WEI", uint256(0));
    }

    function _startBroadcast() internal virtual {
        vm.startBroadcast();
    }

    function _stopBroadcast() internal virtual {
        vm.stopBroadcast();
    }

    function _preflight() internal view returns (Plan memory plan) {
        require(block.chainid == MAINNET_CHAIN_ID, "DeployMainnet: not chain 4663");
        plan.json = vm.readFile("script/params.mainnet.json");
        plan.coordinator = vm.parseJsonAddress(plan.json, ".randomness.diceCoordinator");
        plan.provider = vm.parseJsonAddress(plan.json, ".randomness.diceProvider");
        plan.callbackGas = uint32(vm.parseJsonUint(plan.json, ".randomness.callbackGasLimit"));
        plan.multisig = _ownerInput();
        plan.seed = _seedInput();

        require(plan.multisig != address(0), "DeployMainnet: owner is zero");
        require(plan.multisig != msg.sender, "DeployMainnet: owner must not be the deployer");
        require(_isContract(plan.multisig), "DeployMainnet: owner must be a contract");
        require(plan.coordinator.code.length > 0, "DeployMainnet: no Dice oracle at address");
        uint256 fee = IDiceEntropy(plan.coordinator).getFeeV2(plan.provider, plan.callbackGas);
        require(fee > 0 && fee <= MAX_SANE_FEE, "DeployMainnet: Dice fee out of range");
        require(
            vm.parseJsonUint(plan.json, ".entry.maxPerSquareWei") > 0,
            "DeployMainnet: max entry must be set"
        );
        uint256 maxActivePlans = vm.parseJsonUint(plan.json, ".plan.maxActivePlans");
        require(
            maxActivePlans > 0 && maxActivePlans <= MAX_SANE_ACTIVE_PLANS,
            "DeployMainnet: max active plans out of range"
        );
        require(
            vm.parseJsonUint(plan.json, ".plan.minPlanDepositWei")
                >= vm.parseJsonUint(plan.json, ".entry.minPerSquareWei"),
            "DeployMainnet: plan deposit below one entry"
        );
    }

    /// @dev An EOA that delegated through EIP-7702 holds a 23 byte designator that starts with
    /// 0xef0100. It has code but is not a contract, so it must not pass as a multisig.
    function _isContract(address account) internal view returns (bool) {
        bytes memory code = account.code;
        if (code.length == 0) {
            return false;
        }
        bool delegated = code.length == 23 && code[0] == 0xef && code[1] == 0x01 && code[2] == 0x00;
        return !delegated;
    }

    function _assertDeployment(
        Plan memory plan,
        POTSToken token,
        PotsRandomnessAdapter adapter,
        PotsRoundManager manager,
        PotsAutoPlan autoPlan
    ) internal view {
        string memory json = plan.json;
        require(token.minter() == address(manager), "wiring: token minter");
        require(adapter.manager() == address(manager), "wiring: adapter manager");
        require(address(manager.token()) == address(token), "wiring: manager token");
        require(address(manager.adapter()) == address(adapter), "wiring: manager adapter");
        require(manager.owner() == plan.multisig, "ownership: manager owner");
        require(manager.pendingOwner() == address(0), "ownership: pending owner");
        require(token.owner() == address(0), "ownership: token not renounced");
        require(adapter.owner() == address(0), "ownership: adapter not renounced");
        require(address(adapter.dice()) == plan.coordinator, "params: coordinator");
        require(adapter.provider() == plan.provider, "params: provider");
        require(adapter.callbackGasLimit() == plan.callbackGas, "params: callback gas");
        require(token.cap() == vm.parseJsonUint(json, ".token.cap"), "params: cap");
        require(
            manager.treasuryBps() == vm.parseJsonUint(json, ".fees.treasuryBps"), "params: treasury"
        );
        require(
            manager.jackpotBps() == vm.parseJsonUint(json, ".fees.jackpotBps"), "params: jackpot"
        );
        require(manager.payoutBps() == vm.parseJsonUint(json, ".fees.payoutBps"), "params: payout");
        require(
            manager.minEntryPerSquare() == vm.parseJsonUint(json, ".entry.minPerSquareWei"),
            "params: min entry"
        );
        require(
            manager.maxEntryPerSquare() == vm.parseJsonUint(json, ".entry.maxPerSquareWei"),
            "params: max entry"
        );
        require(
            manager.roundWindow() == vm.parseJsonUint(json, ".round.windowSeconds"),
            "params: window"
        );
        require(
            manager.lockedCancelDelay()
                == vm.parseJsonUint(json, ".round.lockedCancelDelaySeconds"),
            "params: locked delay"
        );
        require(
            manager.forceCancelDelay() == vm.parseJsonUint(json, ".round.forceCancelDelaySeconds"),
            "params: force delay"
        );
        require(
            manager.jackpotChanceDenominator()
                == vm.parseJsonUint(json, ".jackpot.chanceDenominator"),
            "params: jackpot odds"
        );
        require(
            manager.potEmissionPerRound() == vm.parseJsonUint(json, ".emission.perRoundWei"),
            "params: emission"
        );
        require(
            manager.randomnessRefundDelayBlocks()
                == vm.parseJsonUint(json, ".randomness.refundDelayBlocks"),
            "params: refund delay"
        );
        require(address(autoPlan.manager()) == address(manager), "plan: manager");
        require(
            autoPlan.maxActivePlans() == vm.parseJsonUint(json, ".plan.maxActivePlans"),
            "params: max active plans"
        );
        require(
            autoPlan.minPlanDeposit() == vm.parseJsonUint(json, ".plan.minPlanDepositWei"),
            "params: min plan deposit"
        );
        require(manager.planContract() == address(0), "plan: registered before the multisig");
        require(manager.treasuryBalance() == plan.seed, "treasury: seed");
        require(manager.invariantHolds(), "accounting: invariant");
        require(manager.paused() == false, "state: paused");
        require(manager.currentRoundId() == 0, "state: round started");
    }
}
