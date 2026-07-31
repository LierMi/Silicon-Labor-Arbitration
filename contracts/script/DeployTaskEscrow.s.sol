// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {TaskEscrow} from "../src/TaskEscrow.sol";

/// @notice Deploys TaskEscrow to Monad Testnet and writes the deployment manifest.
contract DeployTaskEscrow is Script {
    function run() external {
        address settler = vm.envAddress("SETTLEMENT_AUTHORITY_ADDRESS");
        address admin = vm.envAddress("AUTHORITY_ADMIN_ADDRESS");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        TaskEscrow escrow = new TaskEscrow(settler, admin);
        vm.stopBroadcast();

        // Write the deployment artifact in a deterministic format.
        string memory root = vm.projectRoot();
        string memory chainId = vm.toString(block.chainid);
        string memory json = "deployment";

        // Store key facts so the manifest generator can read them.
        vm.serializeAddress(json, "settlementAuthority", settler);
        vm.serializeAddress(json, "authorityAdmin", admin);
        vm.serializeAddress(json, "contractAddress", address(escrow));
        string memory finalJson = vm.serializeString(json, "chainId", chainId);

        vm.writeJson(finalJson, string.concat(root, "/deployments/raw-deploy.json"));
    }
}
