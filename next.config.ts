import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.131"],
  serverExternalPackages: ["@openai/codex-sdk", "@openai/codex"],
  outputFileTracingIncludes: {
    "/api/execute": [
      "./node_modules/@openai/codex/**",
      "./node_modules/@openai/codex-linux-x64/**",
      "./node_modules/@openai/codex-linux-arm64/**",
      "./node_modules/@openai/codex-darwin-x64/**",
      "./node_modules/@openai/codex-darwin-arm64/**",
      "./node_modules/@openai/codex-win32-x64/**",
      "./node_modules/@openai/codex-win32-arm64/**",
      "./node_modules/@openai/codex-sdk/**",
    ],
  },
};

export default nextConfig;
