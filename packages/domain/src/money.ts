/**
 * 金额计算：全程整数，绝不用浮点。
 *
 * 为什么：JavaScript 里 0.1 + 0.2 !== 0.3。
 * 钱一旦出现这种误差，我们自己的 SETTLEMENT_SUM 校验就会报错，
 * 更糟的是台上会出现对不平的数字。
 *
 * 做法：一律换算成 wei（18 位小数）的 bigint 再算，最后才格式化回字符串。
 */

export const DECIMALS = 18;
const SCALE = 10n ** BigInt(DECIMALS);

/** "0.2" → 200000000000000000n */
export function toWei(amount: string): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`金额格式非法：${amount}`);
  }
  const [intPart = "0", fracRaw = ""] = trimmed.split(".");
  if (fracRaw.length > DECIMALS) {
    throw new Error(`金额小数位超过 ${DECIMALS}：${amount}`);
  }
  const frac = fracRaw.padEnd(DECIMALS, "0");
  return BigInt(intPart) * SCALE + BigInt(frac || "0");
}

/** 200000000000000000n → "0.2"（去掉末尾多余的 0） */
export function fromWei(wei: bigint): string {
  if (wei < 0n) throw new Error(`金额不能为负：${wei}`);
  const intPart = wei / SCALE;
  const frac = (wei % SCALE).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${intPart}.${frac}` : intPart.toString();
}

/**
 * 按基点切分金额。
 *
 * 整数除法会产生余数（尘埃）。我们把余数全部归入 `dustTo` 指定的那一份——
 * 默认是冻结部分，因为**拿不准的钱应该留住，而不是发出去**。
 */
export function splitByBps(
  totalWei: bigint,
  parts: { key: string; bps: number }[],
): Record<string, bigint> {
  const sumBps = parts.reduce((a, p) => a + p.bps, 0);
  if (sumBps !== 10_000) {
    throw new Error(`权重之和必须为 10000 bps，实际为 ${sumBps}`);
  }
  const out: Record<string, bigint> = {};
  let allocated = 0n;
  for (const p of parts) {
    const v = (totalWei * BigInt(p.bps)) / 10_000n;
    out[p.key] = v;
    allocated += v;
  }
  return { ...out, __dust: totalWei - allocated };
}
