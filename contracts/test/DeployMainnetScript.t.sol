// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Test } from "forge-std/Test.sol";
import { DeployMainnet } from "../script/DeployMainnet.s.sol";
import { MockDiceCoordinator } from "./mocks/MockDiceCoordinator.sol";
import { POTSToken } from "../src/POTSToken.sol";
import { PotsRandomnessAdapter } from "../src/PotsRandomnessAdapter.sol";
import { PotsRoundManager } from "../src/PotsRoundManager.sol";

/// @dev Test harness: owner and seed come from fields, not from the shared process environment.
contract DeployMainnetHarness is DeployMainnet {
    address public ownerInput;
    uint256 public seedInput;

    function configure(address owner_, uint256 seed_) external {
        ownerInput = owner_;
        seedInput = seed_;
    }

    function _ownerInput() internal view override returns (address) {
        return ownerInput;
    }

    function _seedInput() internal view override returns (uint256) {
        return seedInput;
    }

    /// @dev A test cannot broadcast while pranking, so the caller is impersonated instead.
    function _startBroadcast() internal override {
        vm.startPrank(msg.sender);
    }

    function _stopBroadcast() internal override {
        vm.stopPrank();
    }
}

/// @dev Runs the real mainnet deployment script against a mock oracle so a change to a contract
/// constructor, the parameter file, or the wiring cannot silently break it. The fork rehearsal
/// stays the check against the real oracle.
contract DeployMainnetScriptTest is Test {
    address internal constant ORACLE = 0xd8A0680e7699526B57140ED4EAfdCc7219Dc0A0c;

    DeployMainnetHarness internal script;
    address internal multisig;
    address internal deployer;
    uint256 internal nonceBefore;

    function setUp() public {
        vm.chainId(4663);
        script = new DeployMainnetHarness();
        vm.etch(ORACLE, address(new MockDiceCoordinator(address(0xD1CE))).code);
        MockDiceCoordinator(payable(ORACLE)).setFee(25_000_000_000_000);
        multisig = address(new MockDiceCoordinator(address(0)));
        script.configure(multisig, 0);
        deployer = address(this);
    }

    function _run() internal {
        nonceBefore = vm.getNonce(deployer);
        script.run();
    }

    function test_script_refusesAnotherChain() public {
        vm.chainId(46630);
        vm.expectRevert(bytes("DeployMainnet: not chain 4663"));
        _run();
    }

    function test_script_refusesAnEoaOwner() public {
        script.configure(address(0x1234), 0);
        vm.expectRevert(bytes("DeployMainnet: owner must be a contract"));
        _run();
    }

    function test_script_refusesTheDeployerAsOwner() public {
        script.configure(deployer, 0);
        vm.expectRevert(bytes("DeployMainnet: owner must not be the deployer"));
        _run();
    }

    function test_script_refusesAnEip7702DelegatedOwner() public {
        address delegated = address(0x7702);
        vm.etch(delegated, hex"ef01008a67b5020ee254ef48e3b6a04927f39baf7e408a");
        script.configure(delegated, 0);
        vm.expectRevert(bytes("DeployMainnet: owner must be a contract"));
        _run();
    }

    function test_script_refusesAMissingOracle() public {
        vm.etch(ORACLE, hex"");
        vm.expectRevert(bytes("DeployMainnet: no Dice oracle at address"));
        _run();
    }

    function test_script_refusesAnImplausibleFee() public {
        MockDiceCoordinator(payable(ORACLE)).setFee(1 ether);
        vm.expectRevert(bytes("DeployMainnet: Dice fee out of range"));
        _run();
    }

    function test_script_deploysAndHandsOverEveryPrivilegedRole() public {
        _run();
        // The script asserts wiring, ownership, and every parameter itself; reaching this line means
        // those assertions passed. Read the result back independently of the script.
        PotsRoundManager manager = _findManager();
        POTSToken token = manager.token();
        PotsRandomnessAdapter adapter = PotsRandomnessAdapter(payable(address(manager.adapter())));

        assertEq(manager.owner(), multisig);
        assertEq(manager.pendingOwner(), address(0));
        assertEq(token.owner(), address(0));
        assertEq(adapter.owner(), address(0));
        assertEq(token.minter(), address(manager));
        assertEq(adapter.manager(), address(manager));
        assertEq(manager.maxEntryPerSquare(), 0.05 ether);
        assertEq(manager.lockedCancelDelay(), 3600);
        assertEq(manager.forceCancelDelay(), 86_400);
        assertTrue(manager.invariantHolds());
        assertEq(manager.currentRoundId(), 0);
    }

    function test_script_seedsTheTreasuryWhenAsked() public {
        script.configure(multisig, 0.1 ether);
        _run();
        PotsRoundManager manager = _findManager();
        assertEq(manager.treasuryBalance(), 0.1 ether);
        assertEq(address(manager).balance, 0.1 ether);
        assertTrue(manager.invariantHolds());
    }

    /// @dev The script logs addresses but does not return them; token, adapter, and manager are the deployer's next three creations, at nonce offsets 1 to 3.
    function _findManager() internal view returns (PotsRoundManager) {
        return PotsRoundManager(payable(computeCreateAddress(deployer, nonceBefore + 3)));
    }
}
