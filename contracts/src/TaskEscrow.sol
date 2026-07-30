// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title TaskEscrow
/// @notice Creates funded Agent-work tasks and commits their requirements onchain.
/// @dev Gate 3 freezes only createTask and TaskCreated. Later lifecycle methods are out of scope.
contract TaskEscrow {
    uint256 private constant LOCAL_DEVELOPMENT_CHAIN_ID = 31_337;

    error DeadlineNotFuture(uint256 deadline, uint256 currentTimestamp);
    error EmptyRequirementsHash();
    error Gate3IncompleteLifecycle(uint256 chainId);
    error TaskAlreadyExists(bytes32 taskId);
    error ZeroEscrowAmount();

    struct Task {
        address client;
        uint256 amount;
        bytes32 requirementsHash;
        uint256 deadline;
    }

    /// @notice Emitted when a client creates and funds a task.
    event TaskCreated(
        bytes32 indexed taskId, address indexed client, uint256 amount, bytes32 reqHash, uint256 deadline
    );

    mapping(bytes32 taskId => Task task) public tasks;

    /// @dev Gate 3 freezes and tests task creation but deliberately has no release path yet.
    ///      Only the conventional local Foundry chain ID is admitted; this reliably blocks
    ///      Monad Testnet deployment until Gate 4 implements and tests the complete lifecycle.
    constructor() {
        if (block.chainid != LOCAL_DEVELOPMENT_CHAIN_ID) revert Gate3IncompleteLifecycle(block.chainid);
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
        if (tasks[taskId].client != address(0)) revert TaskAlreadyExists(taskId);

        tasks[taskId] =
            Task({client: msg.sender, amount: msg.value, requirementsHash: requirementsHash, deadline: deadline});

        emit TaskCreated(taskId, msg.sender, msg.value, requirementsHash, deadline);
    }
}
