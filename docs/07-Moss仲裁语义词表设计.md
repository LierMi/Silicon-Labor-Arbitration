# Moss 全生命周期语义扩展方案（已废弃）

> 状态：Superseded
> 日期：2026-07-30
> 替代决策：[Moss 边界与职责划分](./08-Moss边界与职责划分.md)

本文件保留此前讨论结论的决策轨迹，不再作为实施事实源。

此前方案计划将 `createTask`、`submitDelivery`、`acceptDelivery`、`openDispute`、`submitEvidence`、`proposeRuling`、`requestAppeal`、`settle` 全部建模为 Moss Capability，并向 Moss Core 增加 8 个 Verb、2 个 Category 和 4 个 Risk Label。

经重新审视 Moss 的实际职责、黑客松交付范围和维护成本，团队不采用该方案：

1. Moss 技术上可以在每笔交易签名前构造和模拟任何 Capability，但本项目 P0 不需要把完整业务状态机都变成 Moss Protocol API；
2. `createTask` 涉及资金锁定、参数解释和 E3，是 Moss 增量价值最高的入口；
3. 后续生命周期操作在黑客松阶段使用 viem/wagmi 直接调用，并保存普通交易证据；
4. 不在当前 Runtime PR 中增加项目专用全局词汇；
5. 是否扩展更通用的业务语义模型，留待 Protocol 实际运行和用户反馈后再评估。

请以 `docs/08-Moss边界与职责划分.md`、`docs/05-双仓库架构与Moss-Testnet集成.md` 和 `docs/06-技术风险与决策清单.md` 为当前事实源。
