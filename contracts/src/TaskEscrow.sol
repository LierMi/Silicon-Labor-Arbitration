// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title TaskEscrow
/// @notice Holds funded Agent-work tasks through delivery, dispute, and evidence-linked settlement.
/// @dev Moss consumes only createTask and TaskCreated. Every later operation is a direct wallet path.
contract TaskEscrow {
    uint256 private constant PUSH_PAYMENT_GAS = 100_000;

    enum TaskStatus {
        None,
        Created,
        Delivered,
        Disputed,
        ManualReview,
        Accepted,
        Settled,
        Refunded
    }

    error AgentAlreadyAssigned(bytes32 taskId);
    error DeadlineNotFuture(uint256 deadline, uint256 currentTimestamp);
    error DeadlineNotPassed(uint256 deadline, uint256 currentTimestamp);
    error DeliveryWindowClosed(uint256 deadline, uint256 currentTimestamp);
    error EmptyDeliveryHash();
    error EmptyRequirementsHash();
    error EmptyReviewDecisionHash();
    error EmptySettlementProposalHash();
    error InvalidAllocation(uint256 escrowed, uint256 toAgent, uint256 toClient, uint256 frozen);
    error InvalidAgent(address agent);
    error InvalidStatus(bytes32 taskId, TaskStatus expected, TaskStatus actual);
    error NothingToWithdraw(bytes32 taskId, address creditor);
    error ReentrantCall(bytes32 taskId);
    error RolesMustBeDistinct(address settlementAuthority, address authorityAdmin);
    error TaskAlreadyExists(bytes32 taskId);
    error TransferFailed(address recipient, uint256 amount);
    error Unauthorized(address caller);
    error UnknownCase(bytes32 caseId);
    error ZeroAddress();
    error ZeroEscrowAmount();

    struct Task {
        address client;
        address agent;
        uint256 amount;
        bytes32 requirementsHash;
        bytes32 deliveryHash;
        bytes32 caseId;
        uint256 deadline;
        uint256 frozenAmount;
        TaskStatus status;
        bytes32 settlementProposalHash;
        bytes32 reviewDecisionHash;
    }

    /// @notice Emitted when a client creates and funds a task.
    event TaskCreated(
        bytes32 indexed taskId, address indexed client, uint256 amount, bytes32 reqHash, uint256 deadline
    );
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

    address public settlementAuthority;
    address public immutable authorityAdmin;
    address public pendingSettlementAuthority;
    mapping(bytes32 taskId => Task task) public tasks;
    mapping(bytes32 caseId => bytes32 taskId) public caseToTask;
    mapping(bytes32 taskId => mapping(address recipient => uint256 amount)) public claimable;
    mapping(bytes32 taskId => bool locked) private _taskLocks;

    constructor(address settlementAuthority_, address authorityAdmin_) {
        if (settlementAuthority_ == address(0) || authorityAdmin_ == address(0)) revert ZeroAddress();
        if (settlementAuthority_ == authorityAdmin_) {
            revert RolesMustBeDistinct(settlementAuthority_, authorityAdmin_);
        }
        settlementAuthority = settlementAuthority_;
        authorityAdmin = authorityAdmin_;
    }

    modifier nonReentrant(bytes32 taskId) {
        if (_taskLocks[taskId]) revert ReentrantCall(taskId);
        _taskLocks[taskId] = true;
        _;
        _taskLocks[taskId] = false;
    }

    /// @notice Creates a task, commits its requirements, and locks the attached MON.
    /// @param requirementsHash Hash of the canonical requirements payload agreed before signing.
    /// @param deadline Unix timestamp after which delivery is late.
    /// @return taskId Stable identifier scoped by chain, contract, client, and the full task commitment.
    function createTask(bytes32 requirementsHash, uint256 deadline) external payable returns (bytes32 taskId) {
        if (requirementsHash == bytes32(0)) revert EmptyRequirementsHash();
        if (msg.value == 0) revert ZeroEscrowAmount();
        // forge-lint: disable-next-line(block-timestamp)
        if (deadline <= block.timestamp) revert DeadlineNotFuture(deadline, block.timestamp);

        taskId = keccak256(abi.encode(block.chainid, address(this), msg.sender, requirementsHash, deadline, msg.value));
        if (tasks[taskId].status != TaskStatus.None) revert TaskAlreadyExists(taskId);

        tasks[taskId] = Task({
            client: msg.sender,
            agent: address(0),
            amount: msg.value,
            requirementsHash: requirementsHash,
            deliveryHash: bytes32(0),
            caseId: bytes32(0),
            deadline: deadline,
            frozenAmount: 0,
            status: TaskStatus.Created,
            settlementProposalHash: bytes32(0),
            reviewDecisionHash: bytes32(0)
        });

        emit TaskCreated(taskId, msg.sender, msg.value, requirementsHash, deadline);
    }

    /// @notice Binds the Agent that may submit this task's delivery.
    function assignAgent(bytes32 taskId, address agent) external {
        Task storage task = tasks[taskId];
        _requireStatus(taskId, task, TaskStatus.Created);
        if (msg.sender != task.client) revert Unauthorized(msg.sender);
        if (agent == address(0) || agent == task.client) revert InvalidAgent(agent);
        if (task.agent != address(0)) revert AgentAlreadyAssigned(taskId);

        task.agent = agent;
        emit AgentAssigned(taskId, agent);
    }

    function submitDelivery(bytes32 taskId, bytes32 deliveryHash) external {
        Task storage task = tasks[taskId];
        _requireStatus(taskId, task, TaskStatus.Created);
        if (msg.sender != task.agent || task.agent == address(0)) revert Unauthorized(msg.sender);
        if (deliveryHash == bytes32(0)) revert EmptyDeliveryHash();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > task.deadline) revert DeliveryWindowClosed(task.deadline, block.timestamp);

        task.deliveryHash = deliveryHash;
        task.status = TaskStatus.Delivered;
        emit DeliverySubmitted(taskId, msg.sender, deliveryHash);
    }

    /// @notice Accepts a delivery and releases the entire escrow to the assigned Agent.
    function acceptDelivery(bytes32 taskId) external nonReentrant(taskId) {
        Task storage task = tasks[taskId];
        _requireStatus(taskId, task, TaskStatus.Delivered);
        if (msg.sender != task.client) revert Unauthorized(msg.sender);

        task.status = TaskStatus.Accepted;
        emit TaskAccepted(taskId, task.agent, task.amount);
        _payOrCredit(taskId, task.agent, task.amount);
    }

    /// @notice Refunds an undelivered task after its deadline.
    function refundExpiredTask(bytes32 taskId) external nonReentrant(taskId) {
        Task storage task = tasks[taskId];
        _requireStatus(taskId, task, TaskStatus.Created);
        if (msg.sender != task.client) revert Unauthorized(msg.sender);
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp <= task.deadline) revert DeadlineNotPassed(task.deadline, block.timestamp);

        task.status = TaskStatus.Refunded;
        emit TaskRefunded(taskId, task.client, task.amount);
        _payOrCredit(taskId, task.client, task.amount);
    }

    /// @notice Opens a dispute for a delivered task. Either task participant may call it.
    function openDispute(bytes32 taskId) external returns (bytes32 caseId) {
        Task storage task = tasks[taskId];
        _requireStatus(taskId, task, TaskStatus.Delivered);
        if (msg.sender != task.client && msg.sender != task.agent) revert Unauthorized(msg.sender);

        caseId = keccak256(abi.encode(block.chainid, address(this), taskId, task.deliveryHash));
        task.caseId = caseId;
        task.status = TaskStatus.Disputed;
        caseToTask[caseId] = taskId;
        emit DisputeOpened(taskId, caseId);
    }

    /// @notice Applies authority-witnessed rule-engine amounts and retains subjective funds for human review.
    function settle(bytes32 caseId, uint256 toAgent, uint256 toClient, uint256 frozen, bytes32 settlementProposalHash)
        external
        nonReentrant(caseToTask[caseId])
    {
        if (msg.sender != settlementAuthority) revert Unauthorized(msg.sender);
        bytes32 taskId = caseToTask[caseId];
        if (taskId == bytes32(0)) revert UnknownCase(caseId);

        Task storage task = tasks[taskId];
        _requireStatus(taskId, task, TaskStatus.Disputed);
        if (settlementProposalHash == bytes32(0)) revert EmptySettlementProposalHash();
        _validateAllocation(task.amount, toAgent, toClient, frozen);

        task.frozenAmount = frozen;
        task.settlementProposalHash = settlementProposalHash;
        task.status = frozen == 0 ? TaskStatus.Settled : TaskStatus.ManualReview;
        emit CaseSettled(caseId, toAgent, toClient, frozen, settlementProposalHash);

        _payOrCredit(taskId, task.agent, toAgent);
        _payOrCredit(taskId, task.client, toClient);
    }

    /// @notice Releases the subjective frozen portion after an explicit human decision.
    function releaseFrozen(bytes32 caseId, uint256 toAgent, uint256 toClient, bytes32 reviewDecisionHash)
        external
        nonReentrant(caseToTask[caseId])
    {
        if (msg.sender != settlementAuthority) revert Unauthorized(msg.sender);
        bytes32 taskId = caseToTask[caseId];
        if (taskId == bytes32(0)) revert UnknownCase(caseId);

        Task storage task = tasks[taskId];
        _requireStatus(taskId, task, TaskStatus.ManualReview);
        if (reviewDecisionHash == bytes32(0)) revert EmptyReviewDecisionHash();
        _validateAllocation(task.frozenAmount, toAgent, toClient, 0);

        task.frozenAmount = 0;
        task.reviewDecisionHash = reviewDecisionHash;
        task.status = TaskStatus.Settled;
        emit FrozenReleased(caseId, toAgent, toClient, reviewDecisionHash);

        _payOrCredit(taskId, task.agent, toAgent);
        _payOrCredit(taskId, task.client, toClient);
    }

    /// @notice Withdraws a deferred payment to an address chosen by the creditor.
    function withdrawPayment(bytes32 taskId, address payable recipient) external nonReentrant(taskId) {
        if (recipient == address(0)) revert ZeroAddress();
        uint256 amount = claimable[taskId][msg.sender];
        if (amount == 0) revert NothingToWithdraw(taskId, msg.sender);

        claimable[taskId][msg.sender] = 0;
        _sendValue(recipient, amount);
        emit PaymentWithdrawn(taskId, msg.sender, recipient, amount);
    }

    /// @notice Starts a two-step settlement-authority rotation without changing task state.
    function proposeSettlementAuthority(address newAuthority) external {
        if (msg.sender != authorityAdmin) revert Unauthorized(msg.sender);
        if (newAuthority == address(0)) revert ZeroAddress();
        if (newAuthority == authorityAdmin) revert RolesMustBeDistinct(newAuthority, authorityAdmin);

        pendingSettlementAuthority = newAuthority;
        emit SettlementAuthorityProposed(settlementAuthority, newAuthority);
    }

    /// @notice Completes authority rotation only when the nominated address accepts it.
    function acceptSettlementAuthority() external {
        if (msg.sender != pendingSettlementAuthority) revert Unauthorized(msg.sender);

        address previousAuthority = settlementAuthority;
        settlementAuthority = msg.sender;
        pendingSettlementAuthority = address(0);
        emit SettlementAuthorityUpdated(previousAuthority, msg.sender);
    }

    function getTaskStatus(bytes32 taskId) external view returns (TaskStatus) {
        return tasks[taskId].status;
    }

    function getSettlementEvidence(bytes32 taskId)
        external
        view
        returns (bytes32 settlementProposalHash, bytes32 reviewDecisionHash)
    {
        Task storage task = tasks[taskId];
        return (task.settlementProposalHash, task.reviewDecisionHash);
    }

    function _requireStatus(bytes32 taskId, Task storage task, TaskStatus expected) private view {
        if (task.status != expected) revert InvalidStatus(taskId, expected, task.status);
    }

    function _validateAllocation(uint256 escrowed, uint256 toAgent, uint256 toClient, uint256 frozen) private pure {
        if (toAgent > escrowed || toClient > escrowed - toAgent || frozen != escrowed - toAgent - toClient) {
            revert InvalidAllocation(escrowed, toAgent, toClient, frozen);
        }
    }

    function _sendValue(address recipient, uint256 amount) private {
        if (amount == 0) return;
        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed(recipient, amount);
    }

    function _payOrCredit(bytes32 taskId, address recipient, uint256 amount) private {
        if (amount == 0) return;
        (bool success,) = recipient.call{value: amount, gas: PUSH_PAYMENT_GAS}("");
        if (!success) {
            claimable[taskId][recipient] += amount;
            emit PaymentDeferred(taskId, recipient, amount);
        }
    }
}
