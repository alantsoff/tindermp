import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@tanstack/react-query',
      'zustand',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
    ],
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
  async rewrites() {
    const apiBase = process.env.NEXT_INTERNAL_API_URL ?? 'http://127.0.0.1:3001';
    return [
      {
        source: '/match-api/:path*',
        destination: `${apiBase}/match-api/:path*`,
      },
      {
        source: '/match-media/:path*',
        destination: `${apiBase}/match-media/:path*`,
      },
    ];
  },
};

export default nextConfig;
