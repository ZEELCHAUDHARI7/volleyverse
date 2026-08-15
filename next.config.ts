import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/console/matches",
        destination: "/console",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
