// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TaskEscrow} from "../src/TaskEscrow.sol";

interface VmLifecycle {
    function chainId(uint256 newChainId) external;
    function deal(address account, uint256 newBalance) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData) external;
    function expectRevert(bytes calldata revertData) external;
    function prank(address msgSender) external;
    function warp(uint256 newTimestamp) external;
}

contract ReentrantAgent {
    TaskEscrow private immutable _escrow;
    bytes32 private _taskId;

    bool public reentryAttempted;
    bool public reentryBlocked;
    uint256 public reentryAttempts;

    constructor(TaskEscrow escrow_) {
        _escrow = escrow_;
    }

    function submit(bytes32 taskId, bytes32 deliveryHash) external {
        _taskId = taskId;
        _escrow.submitDelivery(taskId, deliveryHash);
    }

    receive() external payable {
        reentryAttempted = true;
        reentryAttempts += 1;
        try _escrow.acceptDelivery(_taskId) {}
        catch (bytes memory reason) {
            bytes4 selector;
            assembly {
                selector := mload(add(reason, 32))
            }
            reentryBlocked = selector == TaskEscrow.ReentrantCall.selector;
        }
    }
}

contract RejectingAgent {
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
        revert("reject payment");
    }
}

contract CrossTaskAgent {
    TaskEscrow private immutable _escrow;
    bytes32 private _nestedTaskId;

    constructor(TaskEscrow escrow_) {
        _escrow = escrow_;
    }

    function createNestedTask(bytes32 requirementsHash, uint256 deadline, address agent)
        external
        payable
        returns (bytes32 taskId)
    {
        taskId = _escrow.createTask{value: msg.value}(requirementsHash, deadline);
        _escrow.assignAgent(taskId, agent);
        _nestedTaskId = taskId;
    }

    function submit(bytes32 taskId, bytes32 deliveryHash) external {
        _escrow.submitDelivery(taskId, deliveryHash);
    }

    receive() external payable {
        if (_nestedTaskId != bytes32(0)) {
            bytes32 taskId = _nestedTaskId;
            _nestedTaskId = bytes32(0);
            _escrow.acceptDelivery(taskId);
        }
    }
}

contract DeferredReentrantAgent {
    TaskEscrow private immutable _escrow;
    bytes32 private _taskId;
    bool private _rejectPush = true;
    bool public reentryBlocked;
    uint256 public reentryAttempts;

    constructor(TaskEscrow escrow_) {
        _escrow = escrow_;
    }

    function submit(bytes32 taskId, bytes32 deliveryHash) external {
        _taskId = taskId;
        _escrow.submitDelivery(taskId, deliveryHash);
    }

    function withdrawDeferred() external {
        _rejectPush = false;
        _escrow.withdrawPayment(_taskId, payable(address(this)));
    }

    receive() external payable {
        if (_rejectPush) revert("defer payment");
        reentryAttempts += 1;
        try _escrow.withdrawPayment(_taskId, payable(address(this))) {}
        catch (bytes memory reason) {
            bytes4 selector;
            assembly {
                selector := mload(add(reason, 32))
            }
            reentryBlocked = selector == TaskEscrow.ReentrantCall.selector;
        }
    }
}

contract TaskEscrowLifecycleTest {
    VmLifecycle private constant vm = VmLifecycle(address(uint160(uint256(keccak256("hevm cheat code")))));

    TaskEscrow private escrow;
    address private constant CLIENT = address(0xC11E17);
    address private constant AGENT = address(0xA6E17);
    address private constant AUTHORITY = address(0xA11CE);
    address private constant AUTHORITY_ADMIN = address(0xAD111);
    address private constant NEW_AUTHORITY = address(0xA11CE2);
    address private constant OUTSIDER = address(0xBAD);
    bytes32 private constant REQUIREMENTS_HASH = keccak256("potato-case-requirements-v1");
    bytes32 private constant DELIVERY_HASH = keccak256("potato-delivery-v1");
    bytes32 private constant SETTLEMENT_PROPOSAL_HASH = keccak256("potato-settlement-proposal-v1");
    bytes32 private constant REVIEW_DECISION_HASH = keccak256("potato-review-decision-v1");
    uint256 private constant AMOUNT = 0.2 ether;
    uint256 private constant START_TIME = 1_754_044_800;
    uint256 private constant DEADLINE = START_TIME + 3 hours;

    event AgentAssigned(bytes32 indexed taskId, address indexed agent);
    event DeliverySubmitted(bytes32 indexed taskId, address indexed agent, bytes32 deliveryHash);
    event TaskAccepted(bytes32 indexed taskId, address indexed agent, uint256 amount);
    event TaskRefunded(bytes32 indexed taskId, address indexed client, uint256 amount);
    event DisputeOpened(bytes32 indexed taskId, bytes32 indexed caseId);
    event CaseSettled(
        bytes32 indexed caseId, uint256 toAgent, uint256 toClient, uint256 frozen, bytes32 settlementProposalHash
    );
    event FrozenReleased(bytes32 indexed caseId, uint256 toAgent, uint256 toClient, bytes32 reviewDecisionHash);
    event PaymentDeferred(bytes32 indexed taskId, address indexed recipient, uint256 amount);
    event PaymentWithdrawn(bytes32 indexed taskId, address indexed creditor, address indexed recipient, uint256 amount);
    event SettlementAuthorityProposed(address indexed currentAuthority, address indexed pendingAuthority);
    event SettlementAuthorityUpdated(address indexed previousAuthority, address indexed newAuthority);

    function setUp() public {
        vm.warp(START_TIME);
        vm.deal(CLIENT, 10 ether);
        escrow = new TaskEscrow(AUTHORITY, AUTHORITY_ADMIN);
    }

    function test_DeploysOnMonadTestnetAfterCompleteLifecycleExists() public {
        vm.chainId(10_143);
        TaskEscrow monadEscrow = new TaskEscrow(AUTHORITY, AUTHORITY_ADMIN);
        _assertEq(monadEscrow.settlementAuthority(), AUTHORITY, "wrong settlement authority");
        _assertEq(monadEscrow.authorityAdmin(), AUTHORITY_ADMIN, "wrong authority admin");
    }

    function test_RevertDeployWithZeroSettlementAuthority() public {
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.ZeroAddress.selector));
        new TaskEscrow(address(0), AUTHORITY_ADMIN);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.ZeroAddress.selector));
        new TaskEscrow(AUTHORITY, address(0));

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.RolesMustBeDistinct.selector, AUTHORITY, AUTHORITY));
        new TaskEscrow(AUTHORITY, AUTHORITY);
    }

    function test_AdminRecoversLostSettlementAuthorityWithTwoStepRotation() public {
        (bytes32 taskId, bytes32 caseId) = _createDisputedTask(AGENT, AMOUNT);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.Unauthorized.selector, AUTHORITY_ADMIN));
        vm.prank(AUTHORITY_ADMIN);
        escrow.settle(caseId, AMOUNT, 0, 0, SETTLEMENT_PROPOSAL_HASH);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.Unauthorized.selector, AUTHORITY));
        vm.prank(AUTHORITY);
        escrow.proposeSettlementAuthority(NEW_AUTHORITY);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.ZeroAddress.selector));
        vm.prank(AUTHORITY_ADMIN);
        escrow.proposeSettlementAuthority(address(0));

        vm.expectRevert(
            abi.encodeWithSelector(TaskEscrow.RolesMustBeDistinct.selector, AUTHORITY_ADMIN, AUTHORITY_ADMIN)
        );
        vm.prank(AUTHORITY_ADMIN);
        escrow.proposeSettlementAuthority(AUTHORITY_ADMIN);

        vm.expectEmit(true, true, false, true);
        emit SettlementAuthorityProposed(AUTHORITY, NEW_AUTHORITY);
        vm.prank(AUTHORITY_ADMIN);
        escrow.proposeSettlementAuthority(NEW_AUTHORITY);
        _assertEq(escrow.pendingSettlementAuthority(), NEW_AUTHORITY, "pending authority not recorded");

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.Unauthorized.selector, OUTSIDER));
        vm.prank(OUTSIDER);
        escrow.acceptSettlementAuthority();

        vm.expectEmit(true, true, false, true);
        emit SettlementAuthorityUpdated(AUTHORITY, NEW_AUTHORITY);
        vm.prank(NEW_AUTHORITY);
        escrow.acceptSettlementAuthority();
        _assertEq(escrow.settlementAuthority(), NEW_AUTHORITY, "authority rotation failed");
        _assertEq(escrow.pendingSettlementAuthority(), address(0), "pending authority not cleared");

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.Unauthorized.selector, AUTHORITY));
        vm.prank(AUTHORITY);
        escrow.settle(caseId, AMOUNT, 0, 0, SETTLEMENT_PROPOSAL_HASH);

        vm.prank(NEW_AUTHORITY);
        escrow.settle(caseId, AMOUNT, 0, 0, SETTLEMENT_PROPOSAL_HASH);
        _assertStatus(taskId, TaskEscrow.TaskStatus.Settled);
    }

    function test_ClientAssignsAgentAndOnlyAssignedAgentCanDeliver() public {
        bytes32 taskId = _createTask(AMOUNT, DEADLINE);

        vm.expectEmit(true, true, false, true);
        emit AgentAssigned(taskId, AGENT);
        vm.prank(CLIENT);
        escrow.assignAgent(taskId, AGENT);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.Unauthorized.selector, OUTSIDER));
        vm.prank(OUTSIDER);
        escrow.submitDelivery(taskId, DELIVERY_HASH);

        vm.expectEmit(true, true, false, true);
        emit DeliverySubmitted(taskId, AGENT, DELIVERY_HASH);
        vm.prank(AGENT);
        escrow.submitDelivery(taskId, DELIVERY_HASH);

        _assertStatus(taskId, TaskEscrow.TaskStatus.Delivered);
    }

    function test_RevertInvalidOrDuplicateAgentAssignment() public {
        bytes32 taskId = _createTask(AMOUNT, DEADLINE);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.InvalidAgent.selector, address(0)));
        vm.prank(CLIENT);
        escrow.assignAgent(taskId, address(0));

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.InvalidAgent.selector, CLIENT));
        vm.prank(CLIENT);
        escrow.assignAgent(taskId, CLIENT);

        vm.prank(CLIENT);
        escrow.assignAgent(taskId, AGENT);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.AgentAlreadyAssigned.selector, taskId));
        vm.prank(CLIENT);
        escrow.assignAgent(taskId, OUTSIDER);
    }

    function test_RevertEmptyDeliveryHash() public {
        bytes32 taskId = _createAssignedTask(AGENT, AMOUNT, DEADLINE);
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.EmptyDeliveryHash.selector));
        vm.prank(AGENT);
        escrow.submitDelivery(taskId, bytes32(0));
        _assertStatus(taskId, TaskEscrow.TaskStatus.Created);
    }

    function test_AcceptDeliveryPaysAgentAndCannotPayTwice() public {
        bytes32 taskId = _createAssignedDelivered(AGENT, AMOUNT, DEADLINE);
        uint256 agentBefore = AGENT.balance;

        vm.expectEmit(true, true, false, true);
        emit TaskAccepted(taskId, AGENT, AMOUNT);
        vm.prank(CLIENT);
        escrow.acceptDelivery(taskId);

        _assertEq(AGENT.balance, agentBefore + AMOUNT, "agent did not receive full escrow");
        _assertEq(address(escrow).balance, 0, "accepted funds remain in escrow");
        _assertStatus(taskId, TaskEscrow.TaskStatus.Accepted);

        vm.expectRevert(
            abi.encodeWithSelector(
                TaskEscrow.InvalidStatus.selector,
                taskId,
                TaskEscrow.TaskStatus.Delivered,
                TaskEscrow.TaskStatus.Accepted
            )
        );
        vm.prank(CLIENT);
        escrow.acceptDelivery(taskId);
    }

    function test_ClientRefundsUndeliveredTaskOnlyAfterDeadline() public {
        bytes32 taskId = _createTask(AMOUNT, DEADLINE);
        uint256 clientAfterFunding = CLIENT.balance;

        vm.warp(DEADLINE);
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.DeadlineNotPassed.selector, DEADLINE, DEADLINE));
        vm.prank(CLIENT);
        escrow.refundExpiredTask(taskId);

        vm.warp(DEADLINE + 1);
        vm.expectEmit(true, true, false, true);
        emit TaskRefunded(taskId, CLIENT, AMOUNT);
        vm.prank(CLIENT);
        escrow.refundExpiredTask(taskId);

        _assertEq(CLIENT.balance, clientAfterFunding + AMOUNT, "client refund incorrect");
        _assertEq(address(escrow).balance, 0, "refunded funds remain in escrow");
        _assertStatus(taskId, TaskEscrow.TaskStatus.Refunded);
    }

    function test_AgentCannotSubmitAfterDeadlineOrBlockClientRefund() public {
        bytes32 taskId = _createAssignedTask(AGENT, AMOUNT, DEADLINE);
        vm.warp(DEADLINE + 1);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.DeliveryWindowClosed.selector, DEADLINE, DEADLINE + 1));
        vm.prank(AGENT);
        escrow.submitDelivery(taskId, DELIVERY_HASH);

        vm.prank(CLIENT);
        escrow.refundExpiredTask(taskId);
        _assertEq(CLIENT.balance, AMOUNT, "late delivery blocked refund");
        _assertEq(address(escrow).balance, 0, "refunded funds remain after late delivery attempt");
        _assertStatus(taskId, TaskEscrow.TaskStatus.Refunded);
    }

    function test_DisputeSettlementFreezesSubjectiveAmountThenHumanReleasesIt() public {
        bytes32 taskId = _createAssignedDelivered(AGENT, AMOUNT, DEADLINE);
        bytes32 expectedCaseId = keccak256(abi.encode(block.chainid, address(escrow), taskId, DELIVERY_HASH));

        vm.expectEmit(true, true, false, true);
        emit DisputeOpened(taskId, expectedCaseId);
        vm.prank(AGENT);
        bytes32 caseId = escrow.openDispute(taskId);
        _assertEq(caseId, expectedCaseId, "wrong case id");

        uint256 toAgent = 0.15 ether;
        uint256 frozen = 0.05 ether;
        vm.expectEmit(true, false, false, true);
        emit CaseSettled(caseId, toAgent, 0, frozen, SETTLEMENT_PROPOSAL_HASH);
        vm.prank(AUTHORITY);
        escrow.settle(caseId, toAgent, 0, frozen, SETTLEMENT_PROPOSAL_HASH);

        _assertEq(AGENT.balance, toAgent, "objective agent allocation incorrect");
        _assertEq(address(escrow).balance, frozen, "subjective amount not frozen");
        _assertStatus(taskId, TaskEscrow.TaskStatus.ManualReview);
        (bytes32 storedProposalHash,) = escrow.getSettlementEvidence(taskId);
        _assertEq(storedProposalHash, SETTLEMENT_PROPOSAL_HASH, "settlement evidence hash not stored");

        uint256 finalToAgent = 0.03 ether;
        uint256 finalToClient = 0.02 ether;
        vm.expectEmit(true, false, false, true);
        emit FrozenReleased(caseId, finalToAgent, finalToClient, REVIEW_DECISION_HASH);
        vm.prank(AUTHORITY);
        escrow.releaseFrozen(caseId, finalToAgent, finalToClient, REVIEW_DECISION_HASH);

        _assertEq(AGENT.balance, toAgent + finalToAgent, "human agent allocation incorrect");
        _assertEq(CLIENT.balance, finalToClient, "human client allocation incorrect");
        _assertEq(address(escrow).balance, 0, "released funds remain in escrow");
        _assertStatus(taskId, TaskEscrow.TaskStatus.Settled);
        (, bytes32 storedReviewHash) = escrow.getSettlementEvidence(taskId);
        _assertEq(storedReviewHash, REVIEW_DECISION_HASH, "review evidence hash not stored");
    }

    function test_SettlementWithoutFrozenAmountFinalizesImmediately() public {
        (bytes32 taskId, bytes32 caseId) = _createDisputedTask(AGENT, AMOUNT);

        vm.prank(AUTHORITY);
        escrow.settle(caseId, 0.1 ether, 0.1 ether, 0, SETTLEMENT_PROPOSAL_HASH);

        _assertEq(AGENT.balance, 0.1 ether, "agent split incorrect");
        _assertEq(CLIENT.balance, 0.1 ether, "client split incorrect");
        _assertEq(address(escrow).balance, 0, "settled funds remain in escrow");
        _assertStatus(taskId, TaskEscrow.TaskStatus.Settled);
    }

    function test_RevertUnauthorizedLifecycleCalls() public {
        bytes32 taskId = _createTask(AMOUNT, DEADLINE);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.Unauthorized.selector, OUTSIDER));
        vm.prank(OUTSIDER);
        escrow.assignAgent(taskId, AGENT);

        vm.prank(CLIENT);
        escrow.assignAgent(taskId, AGENT);
        vm.prank(AGENT);
        escrow.submitDelivery(taskId, DELIVERY_HASH);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.Unauthorized.selector, OUTSIDER));
        vm.prank(OUTSIDER);
        escrow.acceptDelivery(taskId);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.Unauthorized.selector, OUTSIDER));
        vm.prank(OUTSIDER);
        escrow.openDispute(taskId);

        vm.prank(CLIENT);
        bytes32 caseId = escrow.openDispute(taskId);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.Unauthorized.selector, OUTSIDER));
        vm.prank(OUTSIDER);
        escrow.settle(caseId, AMOUNT, 0, 0, SETTLEMENT_PROPOSAL_HASH);
    }

    function test_RevertInvalidAllocationAndRetainAllFunds() public {
        (bytes32 taskId, bytes32 caseId) = _createDisputedTask(AGENT, AMOUNT);

        vm.expectRevert(
            abi.encodeWithSelector(TaskEscrow.InvalidAllocation.selector, AMOUNT, 0.15 ether, 0.04 ether, 0)
        );
        vm.prank(AUTHORITY);
        escrow.settle(caseId, 0.15 ether, 0.04 ether, 0, SETTLEMENT_PROPOSAL_HASH);

        _assertEq(address(escrow).balance, AMOUNT, "invalid allocation moved funds");
        _assertStatus(taskId, TaskEscrow.TaskStatus.Disputed);
    }

    function test_RevertEmptySettlementAndReviewEvidenceHashes() public {
        (bytes32 taskId, bytes32 caseId) = _createDisputedTask(AGENT, AMOUNT);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.EmptySettlementProposalHash.selector));
        vm.prank(AUTHORITY);
        escrow.settle(caseId, 0, 0, AMOUNT, bytes32(0));

        vm.prank(AUTHORITY);
        escrow.settle(caseId, 0, 0, AMOUNT, SETTLEMENT_PROPOSAL_HASH);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.EmptyReviewDecisionHash.selector));
        vm.prank(AUTHORITY);
        escrow.releaseFrozen(caseId, AMOUNT, 0, bytes32(0));
        _assertStatus(taskId, TaskEscrow.TaskStatus.ManualReview);
    }

    function test_RevertSettlementForUnknownCase() public {
        bytes32 unknownCaseId = keccak256("unknown-case");
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.UnknownCase.selector, unknownCaseId));
        vm.prank(AUTHORITY);
        escrow.settle(unknownCaseId, 0, 0, 0, SETTLEMENT_PROPOSAL_HASH);
    }

    function test_RevertDuplicateSettlement() public {
        (bytes32 taskId, bytes32 caseId) = _createDisputedTask(AGENT, AMOUNT);
        vm.prank(AUTHORITY);
        escrow.settle(caseId, AMOUNT, 0, 0, SETTLEMENT_PROPOSAL_HASH);

        vm.expectRevert(
            abi.encodeWithSelector(
                TaskEscrow.InvalidStatus.selector, taskId, TaskEscrow.TaskStatus.Disputed, TaskEscrow.TaskStatus.Settled
            )
        );
        vm.prank(AUTHORITY);
        escrow.settle(caseId, AMOUNT, 0, 0, SETTLEMENT_PROPOSAL_HASH);
    }

    function test_ReentrantAgentCannotEnterAcceptanceTwice() public {
        ReentrantAgent attacker = new ReentrantAgent(escrow);
        bytes32 taskId = _createAssignedTask(address(attacker), AMOUNT, DEADLINE);
        attacker.submit(taskId, DELIVERY_HASH);

        vm.prank(CLIENT);
        escrow.acceptDelivery(taskId);

        _assertTrue(attacker.reentryAttempted(), "reentry was not attempted");
        _assertTrue(attacker.reentryBlocked(), "reentry guard did not block callback");
        _assertEq(address(attacker).balance, AMOUNT, "attacker received wrong amount");
        _assertEq(address(escrow).balance, 0, "escrow paid more than once");
        _assertStatus(taskId, TaskEscrow.TaskStatus.Accepted);
    }

    function test_ReentrantAgentCannotEnterDuringSettlementOrFrozenRelease() public {
        ReentrantAgent attacker = new ReentrantAgent(escrow);
        bytes32 taskId = _createAssignedTask(address(attacker), AMOUNT, DEADLINE);
        attacker.submit(taskId, DELIVERY_HASH);
        vm.prank(CLIENT);
        bytes32 caseId = escrow.openDispute(taskId);

        vm.prank(AUTHORITY);
        escrow.settle(caseId, 0.1 ether, 0, 0.1 ether, SETTLEMENT_PROPOSAL_HASH);
        _assertTrue(attacker.reentryAttempted(), "settlement reentry was not attempted");
        _assertTrue(attacker.reentryBlocked(), "settlement reentry was not blocked");
        _assertEq(attacker.reentryAttempts(), 1, "unexpected settlement callback count");
        _assertStatus(taskId, TaskEscrow.TaskStatus.ManualReview);

        vm.prank(AUTHORITY);
        escrow.releaseFrozen(caseId, 0.1 ether, 0, REVIEW_DECISION_HASH);
        _assertEq(attacker.reentryAttempts(), 2, "frozen release callback was not tested");
        _assertEq(address(attacker).balance, AMOUNT, "attacker received wrong settlement total");
        _assertEq(address(escrow).balance, 0, "reentrant settlement left funds");
        _assertStatus(taskId, TaskEscrow.TaskStatus.Settled);
    }

    function test_PerTaskLockAllowsIndependentTaskProgressDuringCallback() public {
        CrossTaskAgent crossTaskAgent = new CrossTaskAgent(escrow);
        vm.deal(address(this), AMOUNT);
        bytes32 nestedTaskId =
            crossTaskAgent.createNestedTask{value: AMOUNT}(keccak256("nested-requirements"), DEADLINE, AGENT);
        vm.prank(AGENT);
        escrow.submitDelivery(nestedTaskId, keccak256("nested-delivery"));

        bytes32 outerTaskId = _createAssignedTask(address(crossTaskAgent), AMOUNT, DEADLINE);
        crossTaskAgent.submit(outerTaskId, DELIVERY_HASH);

        vm.prank(CLIENT);
        escrow.acceptDelivery(outerTaskId);

        _assertStatus(outerTaskId, TaskEscrow.TaskStatus.Accepted);
        _assertStatus(nestedTaskId, TaskEscrow.TaskStatus.Accepted);
        _assertEq(address(crossTaskAgent).balance, AMOUNT, "outer Agent payment incorrect");
        _assertEq(AGENT.balance, AMOUNT, "nested Agent payment incorrect");
        _assertEq(address(escrow).balance, 0, "independent task callback left funds");
    }

    function test_RevertUnauthorizedAndDuplicateFrozenRelease() public {
        (bytes32 taskId, bytes32 caseId) = _createDisputedTask(AGENT, AMOUNT);
        vm.prank(AUTHORITY);
        escrow.settle(caseId, 0, 0, AMOUNT, SETTLEMENT_PROPOSAL_HASH);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.Unauthorized.selector, OUTSIDER));
        vm.prank(OUTSIDER);
        escrow.releaseFrozen(caseId, AMOUNT, 0, REVIEW_DECISION_HASH);

        vm.prank(AUTHORITY);
        escrow.releaseFrozen(caseId, AMOUNT, 0, REVIEW_DECISION_HASH);

        vm.expectRevert(
            abi.encodeWithSelector(
                TaskEscrow.InvalidStatus.selector,
                taskId,
                TaskEscrow.TaskStatus.ManualReview,
                TaskEscrow.TaskStatus.Settled
            )
        );
        vm.prank(AUTHORITY);
        escrow.releaseFrozen(caseId, AMOUNT, 0, REVIEW_DECISION_HASH);
    }

    function test_FailedPushDefersPaymentWithoutBlockingTerminalState() public {
        RejectingAgent rejectingAgent = new RejectingAgent(escrow);
        bytes32 taskId = _createAssignedTask(address(rejectingAgent), AMOUNT, DEADLINE);
        rejectingAgent.submit(taskId, DELIVERY_HASH);

        vm.expectEmit(true, true, false, true);
        emit TaskAccepted(taskId, address(rejectingAgent), AMOUNT);
        vm.expectEmit(true, true, false, true);
        emit PaymentDeferred(taskId, address(rejectingAgent), AMOUNT);
        vm.prank(CLIENT);
        escrow.acceptDelivery(taskId);

        _assertEq(escrow.claimable(taskId, address(rejectingAgent)), AMOUNT, "failed push was not credited");
        _assertEq(address(escrow).balance, AMOUNT, "deferred payment lost funds");
        _assertStatus(taskId, TaskEscrow.TaskStatus.Accepted);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.NothingToWithdraw.selector, taskId, OUTSIDER));
        vm.prank(OUTSIDER);
        escrow.withdrawPayment(taskId, payable(OUTSIDER));

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.ZeroAddress.selector));
        rejectingAgent.withdraw(taskId, payable(address(0)));

        vm.expectEmit(true, true, true, true);
        emit PaymentWithdrawn(taskId, address(rejectingAgent), AGENT, AMOUNT);
        rejectingAgent.withdraw(taskId, payable(AGENT));

        _assertEq(AGENT.balance, AMOUNT, "deferred payment withdrawal incorrect");
        _assertEq(escrow.claimable(taskId, address(rejectingAgent)), 0, "withdrawal credit not cleared");
        _assertEq(address(escrow).balance, 0, "withdrawn payment remains in escrow");

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.NothingToWithdraw.selector, taskId, address(rejectingAgent)));
        rejectingAgent.withdraw(taskId, payable(AGENT));
    }

    function test_FailedSettlementPushDoesNotBlockOtherRecipient() public {
        RejectingAgent rejectingAgent = new RejectingAgent(escrow);
        bytes32 taskId = _createAssignedTask(address(rejectingAgent), AMOUNT, DEADLINE);
        rejectingAgent.submit(taskId, DELIVERY_HASH);
        vm.prank(CLIENT);
        bytes32 caseId = escrow.openDispute(taskId);

        vm.prank(AUTHORITY);
        escrow.settle(caseId, 0.1 ether, 0.1 ether, 0, SETTLEMENT_PROPOSAL_HASH);

        _assertEq(CLIENT.balance, 0.1 ether, "client payment was blocked by Agent callback");
        _assertEq(escrow.claimable(taskId, address(rejectingAgent)), 0.1 ether, "Agent credit incorrect");
        _assertEq(address(escrow).balance, 0.1 ether, "deferred settlement amount incorrect");
        _assertStatus(taskId, TaskEscrow.TaskStatus.Settled);
    }

    function test_DeferredWithdrawalCannotReenterAndWithdrawTwice() public {
        DeferredReentrantAgent attacker = new DeferredReentrantAgent(escrow);
        bytes32 taskId = _createAssignedTask(address(attacker), AMOUNT, DEADLINE);
        attacker.submit(taskId, DELIVERY_HASH);

        vm.prank(CLIENT);
        escrow.acceptDelivery(taskId);
        _assertEq(escrow.claimable(taskId, address(attacker)), AMOUNT, "deferred credit missing");

        attacker.withdrawDeferred();

        _assertTrue(attacker.reentryBlocked(), "withdraw reentry was not blocked");
        _assertEq(attacker.reentryAttempts(), 1, "unexpected withdrawal callback count");
        _assertEq(address(attacker).balance, AMOUNT, "withdrawal paid wrong amount");
        _assertEq(escrow.claimable(taskId, address(attacker)), 0, "credit survived withdrawal");
        _assertEq(address(escrow).balance, 0, "withdrawal paid twice or retained funds");
    }

    function testFuzz_SettlementAndFrozenReleaseConserveEscrow(
        uint96 rawAmount,
        uint96 agentSeed,
        uint96 clientSeed,
        uint96 releaseSeed
    ) public {
        uint256 amount = uint256(rawAmount) + 1;
        (bytes32 taskId, bytes32 caseId) = _createDisputedTask(AGENT, amount);

        uint256 toAgent = uint256(agentSeed) % (amount + 1);
        uint256 remaining = amount - toAgent;
        uint256 toClient = uint256(clientSeed) % (remaining + 1);
        uint256 frozen = remaining - toClient;

        vm.prank(AUTHORITY);
        escrow.settle(caseId, toAgent, toClient, frozen, SETTLEMENT_PROPOSAL_HASH);

        _assertEq(AGENT.balance, toAgent, "fuzz agent allocation incorrect");
        _assertEq(CLIENT.balance, toClient, "fuzz client allocation incorrect");
        _assertEq(address(escrow).balance, frozen, "fuzz frozen amount incorrect");

        if (frozen == 0) {
            _assertStatus(taskId, TaskEscrow.TaskStatus.Settled);
            return;
        }

        uint256 finalToAgent = uint256(releaseSeed) % (frozen + 1);
        uint256 finalToClient = frozen - finalToAgent;
        vm.prank(AUTHORITY);
        escrow.releaseFrozen(caseId, finalToAgent, finalToClient, REVIEW_DECISION_HASH);

        _assertEq(AGENT.balance, toAgent + finalToAgent, "fuzz final agent allocation incorrect");
        _assertEq(CLIENT.balance, toClient + finalToClient, "fuzz final client allocation incorrect");
        _assertEq(address(escrow).balance, 0, "fuzz lifecycle left trapped funds");
        _assertStatus(taskId, TaskEscrow.TaskStatus.Settled);
    }

    function _createTask(uint256 amount, uint256 deadline) private returns (bytes32 taskId) {
        vm.deal(CLIENT, amount);
        vm.prank(CLIENT);
        taskId = escrow.createTask{value: amount}(REQUIREMENTS_HASH, deadline);
    }

    function _createAssignedTask(address agent, uint256 amount, uint256 deadline) private returns (bytes32 taskId) {
        taskId = _createTask(amount, deadline);
        vm.prank(CLIENT);
        escrow.assignAgent(taskId, agent);
    }

    function _createAssignedDelivered(address agent, uint256 amount, uint256 deadline)
        private
        returns (bytes32 taskId)
    {
        taskId = _createAssignedTask(agent, amount, deadline);
        vm.prank(agent);
        escrow.submitDelivery(taskId, DELIVERY_HASH);
    }

    function _createDisputedTask(address agent, uint256 amount) private returns (bytes32 taskId, bytes32 caseId) {
        taskId = _createAssignedDelivered(agent, amount, DEADLINE);
        vm.prank(CLIENT);
        caseId = escrow.openDispute(taskId);
    }

    function _assertStatus(bytes32 taskId, TaskEscrow.TaskStatus expected) private view {
        TaskEscrow.TaskStatus actual = escrow.getTaskStatus(taskId);
        if (actual != expected) revert("wrong task status");
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

    function _assertTrue(bool value, string memory reason) private pure {
        if (!value) revert(reason);
    }
}
