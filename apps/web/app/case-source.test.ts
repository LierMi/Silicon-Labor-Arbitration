import { test } from "node:test";
import assert from "node:assert/strict";
import { findLatestTaskCreated } from "./case-source";

type Log = { args: { taskId?: unknown } };

// 假 client：getLogs 只对预先登记的窗口返回事件，其余返回空。
// 窗口形状必须与 findLatestTaskCreated 真实生成的一致（latest=1000, step=100）：
// [901..1000] 最新 → [801..900] → ... → [1..100] 最旧
function fakeClient(windows: Array<{ from: bigint; to: bigint; taskId: string }>) {
  return {
    async getBlockNumber() {
      return 1000n;
    },
    async getLogs(args: { fromBlock: bigint; toBlock: bigint }) {
      const hit = windows.find((w) => w.from === args.fromBlock && w.to === args.toBlock);
      return hit ? [{ args: { taskId: hit.taskId } }] : ([] as Log[]);
    },
  };
}

test("findLatestTaskCreated：新旧窗口都有事件时，必须返回最新窗口的事件（回归：批内曾从旧窗口先查）", async () => {
  const client = fakeClient([
    { from: 801n, to: 900n, taskId: "0xold" }, // 旧窗口
    { from: 901n, to: 1000n, taskId: "0xnew" }, // 最新窗口
  ]);
  const taskId = await findLatestTaskCreated(client as never);
  assert.equal(taskId, "0xnew", "必须优先返回最新窗口的事件");
});

test("findLatestTaskCreated：只有旧窗口有事件时也能找到", async () => {
  const client = fakeClient([{ from: 1n, to: 100n, taskId: "0xoldonly" }]);
  const taskId = await findLatestTaskCreated(client as never);
  assert.equal(taskId, "0xoldonly");
});
