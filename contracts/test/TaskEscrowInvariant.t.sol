// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TaskEscrow} from "../src/TaskEscrow.sol";

interface VmInvariant {
    function deal(address account, uint256 newBalance) external;
    function prank(address msgSender) external;
    function warp(uint256 newTimestamp) external;
}

contract InvariantRejectingAgent {
    TaskEscrow private immutable _escrow;

    constructor(TaskEscrow escrow_) {
        _escrow = escrow_;
    }

    function submit(bytes32 taskId, bytes32 deliveryHash) external {
        _escrow.submitDelivery(taskId, deliveryHash);
    }

    function withdraw(bytes32 taskId, address payable recipient) external {
        _escrow.withdrawPayment(taskId, recipient);
    }

    receive() external payable {
        revert("defer invariant payment");
    }
}

contract TaskEscrowHandler {
    VmInvariant private constant vm = VmInvariant(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 private constant PROPOSAL_HASH = keccak256("invariant-proposal");
    bytes32 private constant REVIEW_HASH = keccak256("invariant-review");
    address private constant ADMIN = address(0xAD111);
    address private constant WITHDRAW_RECIPIENT = address(0xBEEF);
    uint256 private constant MAX_TASKS = 8;

    TaskEscrow public immutable escrow;
    InvariantRejectingAgent public immutable agent;
    bytes32[] private _taskIds;
    uint256 private _nonce;

    constructor() {
        escrow = new TaskEscrow(address(this), ADMIN);
        agent = new InvariantRejectingAgent(escrow);
    }

    receive() external payable {}

    function create(uint96 rawAmount, uint32 rawDeadlineOffset) external {
        if (_taskIds.length >= MAX_TASKS) return;
        uint256 amount = uint256(rawAmount) + 1;
        uint256 deadline = block.timestamp + (uint256(rawDeadlineOffset) % 30 days) + 1;
        bytes32 requirementsHash = keccak256(abi.encode("invariant-task", _nonce++));
        vm.deal(address(this), amount);
        bytes32 taskId = escrow.createTask{value: amount}(requirementsHash, deadline);
        _taskIds.push(taskId);
    }

    function deliver(uint256 rawIndex) external {
        if (_taskIds.length == 0) return;
        bytes32 taskId = _taskIds[rawIndex % _taskIds.length];
        if (escrow.getTaskStatus(taskId) != TaskEscrow.TaskStatus.Created) return;
        (, address assignedAgent,,,,,,,,,) = escrow.tasks(taskId);
        if (assignedAgent == address(0)) escrow.assignAgent(taskId, address(agent));
        (,,,,,, uint256 deadline,,,,) = escrow.tasks(taskId);
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) return;
        agent.submit(taskId, keccak256(abi.encode("delivery", taskId)));
    }

    function refund(uint256 rawIndex) external {
        if (_taskIds.length == 0) return;
        bytes32 taskId = _taskIds[rawIndex % _taskIds.length];
        if (escrow.getTaskStatus(taskId) != TaskEscrow.TaskStatus.Created) return;
        (,,,,,, uint256 deadline,,,,) = escrow.tasks(taskId);
        vm.warp(deadline + 1);
        escrow.refundExpiredTask(taskId);
    }

    function accept(uint256 rawIndex) external {
        if (_taskIds.length == 0) return;
        bytes32 taskId = _taskIds[rawIndex % _taskIds.length];
        if (escrow.getTaskStatus(taskId) != TaskEscrow.TaskStatus.Delivered) return;
        escrow.acceptDelivery(taskId);
    }

    function disputeAndSettle(uint256 rawIndex, uint96 agentSeed, uint96 clientSeed) external {
        if (_taskIds.length == 0) return;
        bytes32 taskId = _taskIds[rawIndex % _taskIds.length];
        if (escrow.getTaskStatus(taskId) != TaskEscrow.TaskStatus.Delivered) return;
        bytes32 caseId = escrow.openDispute(taskId);
        (,, uint256 amount,,,,,,,,) = escrow.tasks(taskId);
        uint256 toAgent = uint256(agentSeed) % (amount + 1);
        uint256 remaining = amount - toAgent;
        uint256 toClient = uint256(clientSeed) % (remaining + 1);
        escrow.settle(caseId, toAgent, toClient, remaining - toClient, PROPOSAL_HASH);
    }

    function release(uint256 rawIndex, uint96 agentSeed) external {
        if (_taskIds.length == 0) return;
        bytes32 taskId = _taskIds[rawIndex % _taskIds.length];
        if (escrow.getTaskStatus(taskId) != TaskEscrow.TaskStatus.ManualReview) return;
        (,,,,, bytes32 caseId,, uint256 frozenAmount,,,) = escrow.tasks(taskId);
        uint256 toAgent = uint256(agentSeed) % (frozenAmount + 1);
        escrow.releaseFrozen(caseId, toAgent, frozenAmount - toAgent, REVIEW_HASH);
    }

    function withdrawAgentCredit(uint256 rawIndex) external {
        if (_taskIds.length == 0) return;
        bytes32 taskId = _taskIds[rawIndex % _taskIds.length];
        if (escrow.claimable(taskId, address(agent)) == 0) return;
        agent.withdraw(taskId, payable(WITHDRAW_RECIPIENT));
    }

    function taskCount() external view returns (uint256) {
        return _taskIds.length;
    }

    function taskIdAt(uint256 index) external view returns (bytes32) {
        return _taskIds[index];
    }
}

contract TaskEscrowInvariantTest {
    TaskEscrowHandler private _handler;
    address[] private _targetedContracts;

    function setUp() public {
        _handler = new TaskEscrowHandler();
        _targetedContracts.push(address(_handler));
    }

    function targetContracts() public view returns (address[] memory) {
        return _targetedContracts;
    }

    function test_InvariantHarnessConfigured() public view {
        require(_targetedContracts.length == 1, "handler target missing");
    }

    function invariant_PerTaskLiabilitiesNeverExceedOriginalEscrow() public view {
        TaskEscrow escrow = _handler.escrow();
        uint256 count = _handler.taskCount();
        for (uint256 i = 0; i < count; i++) {
            bytes32 taskId = _handler.taskIdAt(i);
            (
                address client,
                address assignedAgent,
                uint256 amount,,,,,
                uint256 frozenAmount,
                TaskEscrow.TaskStatus status,,
            ) = escrow.tasks(taskId);
            uint256 liabilities =
                frozenAmount + escrow.claimable(taskId, client) + escrow.claimable(taskId, assignedAgent);
            require(liabilities <= amount, "task liabilities exceed original escrow");
            if (
                status == TaskEscrow.TaskStatus.Accepted || status == TaskEscrow.TaskStatus.Settled
                    || status == TaskEscrow.TaskStatus.Refunded
            ) {
                require(frozenAmount == 0, "terminal task retains frozen funds");
            }
        }
    }
}
