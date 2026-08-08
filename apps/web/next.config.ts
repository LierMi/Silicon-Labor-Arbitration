import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sla/domain", "@sla/chain"],
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
