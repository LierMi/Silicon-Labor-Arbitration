import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// E3 证据溯源（mossCommit / protocolVersion）是构建期常量：
// serverless 运行时（Vercel lambda）cwd 没有仓库文件，所以在 next build 时
// 从仓库根读 moss.lock.json 与 protocol 包版本，经 env 内联进服务端 bundle。
// 与 packages/moss-bridge 的 getE3Provenance() 读取路径同源同序。
function readRepoJson(rel: string): unknown {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    try {
      return JSON.parse(readFileSync(resolve(dir, rel), "utf-8"));
    } catch {
      dir = resolve(dir, "..");
    }
  }
  throw new Error(`找不到 ${rel}（next.config 构建期溯源）`);
}

const lock = readRepoJson("moss.lock.json") as { commit?: string };
const protocolPkg = readRepoJson("vendor/moss/packages/protocols/silicon-arbitration/package.json") as {
  version?: string;
};

const nextConfig: NextConfig = {
  env: {
    SLA_MOSS_LOCK_COMMIT: lock.commit ?? "",
    SLA_MOSS_PROTOCOL_VERSION: protocolPkg.version ?? "",
  },
  transpilePackages: ["@sla/domain", "@sla/chain", "@sla/moss-bridge"],
  webpack(config, { isServer }) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };

    if (isServer && config.output) {
      config.output.chunkFilename = "chunks/[id].js";
    }

    return config;
  },
};

export default nextConfig;
