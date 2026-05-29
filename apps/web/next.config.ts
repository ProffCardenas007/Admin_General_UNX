import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  webpack: (config, { dev }) => {
    if (dev) {
      // OneDrive can race with webpack cache files (.pack.gz) in .next/dev.
      // Disabling filesystem cache and using polling is slower but stable.
      config.cache = false;
      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        poll: 1000,
        aggregateTimeout: 300,
      };
    }

    return config;
  },
};

export default nextConfig;
