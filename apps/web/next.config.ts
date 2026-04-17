import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    const apiBase = process.env.NEXT_INTERNAL_API_URL ?? 'http://127.0.0.1:3001';
    return [
      {
        source: '/match-api/:path*',
        destination: `${apiBase}/match-api/:path*`,
      },
    ];
  },
};

export default nextConfig;
