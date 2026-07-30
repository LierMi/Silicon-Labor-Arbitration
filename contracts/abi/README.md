# Frozen Moss-facing ABI

`TaskEscrow.createTask.json` is the Gate 3 ABI subset consumed by the `silicon-arbitration.createTask` Moss Protocol Capability.

Frozen signatures:

- Function selector: `createTask(bytes32,uint256)` → `0x6fbb5f62`
- Event topic: `TaskCreated(bytes32,address,uint256,bytes32,uint256)` → `0x5bb958daa8dc2a1dff1f3a035228e85cc808e19978835e55d3dfa08e5ba5651f`
- Indexed event fields: `taskId`, `client`

## ABI hash

The E3 `abiHash` is computed over this ABI subset, not over unrelated public getters or later direct-path lifecycle methods.

Canonicalization:

1. Parse the JSON array.
2. Preserve array order.
3. Recursively sort object keys lexicographically.
4. Serialize UTF-8 JSON with compact separators and no trailing newline.
5. Compute `keccak256` over those bytes.

The canonical hash is recorded here after generation and must be copied into the Gate 4 deployment manifest. A change to this file reopens Gate 3 and requires a new hash plus Moss adapter review.

Run `python3 script/check_gate3_abi.py` from `contracts/` to verify that the committed subset matches the compiler ABI and that its canonical hash remains unchanged.

Gate 3 ABI hash:

```text
0xce8965794b678d101ae433472fb8d7e536fc0254386e00fabef36aaa66b73cf5
```
