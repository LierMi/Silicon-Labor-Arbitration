// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TaskEscrow} from "../src/TaskEscrow.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData) external;
    function expectRevert(bytes calldata revertData) external;
    function prank(address msgSender) external;
    function warp(uint256 newTimestamp) external;
}

contract TaskEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    TaskEscrow private escrow;
    address private constant CLIENT = address(0xC11E17);
    address private constant SETTLEMENT_AUTHORITY = address(0xA11CE);
    address private constant AUTHORITY_ADMIN = address(0xAD111);
    bytes32 private constant REQUIREMENTS_HASH = keccak256("potato-case-requirements-v1");
    uint256 private constant AMOUNT = 0.2 ether;
    uint256 private constant START_TIME = 1_754_044_800;
    uint256 private constant DEADLINE = START_TIME + 3 hours;

    event TaskCreated(
        bytes32 indexed taskId, address indexed client, uint256 amount, bytes32 reqHash, uint256 deadline
    );

    function setUp() public {
        vm.warp(START_TIME);
        vm.deal(CLIENT, 10 ether);
        escrow = new TaskEscrow(SETTLEMENT_AUTHORITY, AUTHORITY_ADMIN);
    }

    function test_CreateTaskLocksFundsStoresCommitmentAndEmitsFrozenEvent() public {
        bytes32 expectedTaskId =
            keccak256(abi.encode(block.chainid, address(escrow), CLIENT, REQUIREMENTS_HASH, DEADLINE, AMOUNT));

        vm.expectEmit(true, true, false, true);
        emit TaskCreated(expectedTaskId, CLIENT, AMOUNT, REQUIREMENTS_HASH, DEADLINE);

        vm.prank(CLIENT);
        bytes32 taskId = escrow.createTask{value: AMOUNT}(REQUIREMENTS_HASH, DEADLINE);

        _assertEq(taskId, expectedTaskId, "unexpected task id");
        _assertEq(address(escrow).balance, AMOUNT, "escrow did not retain funds");

        (address client,, uint256 amount, bytes32 requirementsHash,,, uint256 deadline,,,,) = escrow.tasks(taskId);
        _assertEq(client, CLIENT, "wrong client");
        _assertEq(amount, AMOUNT, "wrong amount");
        _assertEq(requirementsHash, REQUIREMENTS_HASH, "wrong requirements hash");
        _assertEq(deadline, DEADLINE, "wrong deadline");
    }

    function test_RevertWhenIdenticalTaskAlreadyExists() public {
        vm.prank(CLIENT);
        bytes32 taskId = escrow.createTask{value: AMOUNT}(REQUIREMENTS_HASH, DEADLINE);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.TaskAlreadyExists.selector, taskId));
        vm.prank(CLIENT);
        escrow.createTask{value: AMOUNT}(REQUIREMENTS_HASH, DEADLINE);

        _assertEq(address(escrow).balance, AMOUNT, "duplicate changed escrow balance");
    }

    function testFuzz_CreateTaskRetainsExactEscrowAmount(uint96 rawAmount, bytes32 rawRequirementsHash, uint64 offset)
        public
    {
        uint256 amount = uint256(rawAmount) + 1;
        bytes32 requirementsHash = rawRequirementsHash == bytes32(0) ? REQUIREMENTS_HASH : rawRequirementsHash;
        uint256 deadline = START_TIME + uint256(offset) + 1;
        vm.deal(CLIENT, amount);

        vm.prank(CLIENT);
        bytes32 taskId = escrow.createTask{value: amount}(requirementsHash, deadline);

        _assertEq(address(escrow).balance, amount, "escrow amount changed");
        (,, uint256 storedAmount, bytes32 storedHash,,, uint256 storedDeadline,,,,) = escrow.tasks(taskId);
        _assertEq(storedAmount, amount, "stored amount changed");
        _assertEq(storedHash, requirementsHash, "stored hash changed");
        _assertEq(storedDeadline, deadline, "stored deadline changed");
    }

    function test_RevertWhenRequirementsHashIsEmpty() public {
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.EmptyRequirementsHash.selector));
        vm.prank(CLIENT);
        escrow.createTask{value: AMOUNT}(bytes32(0), DEADLINE);
    }

    function test_RevertWhenEscrowAmountIsZero() public {
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.ZeroEscrowAmount.selector));
        vm.prank(CLIENT);
        escrow.createTask(REQUIREMENTS_HASH, DEADLINE);
    }

    function test_RevertWhenDeadlineEqualsCurrentTimestamp() public {
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.DeadlineNotFuture.selector, START_TIME, START_TIME));
        vm.prank(CLIENT);
        escrow.createTask{value: AMOUNT}(REQUIREMENTS_HASH, START_TIME);
    }

    function test_RevertWhenDeadlineIsInThePast() public {
        uint256 pastDeadline = START_TIME - 1;
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.DeadlineNotFuture.selector, pastDeadline, START_TIME));
        vm.prank(CLIENT);
        escrow.createTask{value: AMOUNT}(REQUIREMENTS_HASH, pastDeadline);
    }

    function _assertEq(address actual, address expected, string memory reason) private pure {
        if (actual != expected) revert(reason);
    }

    function _assertEq(bytes32 actual, bytes32 expected, string memory reason) private pure {
        if (actual != expected) revert(reason);
    }

    function _assertEq(uint256 actual, uint256 expected, string memory reason) private pure {
        if (actual != expected) revert(reason);
    }
}
