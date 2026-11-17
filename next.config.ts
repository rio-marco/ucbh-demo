import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js dev mode only allows HMR/dev requests from trusted origins.
  // Add LAN and tunnel hosts here so the app can be previewed remotely.
  allowedDevOrigins: [
    "192.168.0.131",
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.ngrok.io",
    "*.trycloudflare.com",
  ],
};

export default nextConfig;
