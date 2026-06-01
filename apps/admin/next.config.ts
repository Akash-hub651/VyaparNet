import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Rewrites proxy API calls from the admin frontend to the NestJS API.
   * In production these are handled by the load balancer.
   * In development this eliminates CORS issues.
   */
  async rewrites() {
    return [
      {
        source: '/auth/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003/api/v1'}/auth/:path*`,
      },
      {
        source: '/admin/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003/api/v1'}/admin/:path*`,
      },
    ];
  },
};

export default nextConfig;
