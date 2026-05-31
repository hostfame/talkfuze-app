import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['contemporary-priorities-wilderness-deposit.trycloudflare.com'],
  async headers() {
    return [
      {
        source: '/talkfuze-widget.js',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
      {
        source: '/pop.mp3',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
      {
        source: '/swoosh.mp3',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      }
    ]
  },
};

export default nextConfig;
