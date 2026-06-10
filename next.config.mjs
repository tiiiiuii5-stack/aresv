import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: true
  },
  serverExternalPackages: ["bullmq", "ioredis"],
  images: {
    unoptimized: true
  },
  webpack(config) {
    if (process.env.NEXT_DISABLE_WEBPACK_CACHE === "1") {
      config.cache = false;
    }
    config.resolve.alias["framer-motion"] = path.resolve("./node_modules/framer-motion/dist/cjs/index.js");
    return config;
  }
};

export default nextConfig;
