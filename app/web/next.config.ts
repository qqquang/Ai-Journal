import path from 'path';
import type { NextConfig } from 'next';

type ExtendedNextConfig = NextConfig & {
  allowedDevOrigins?: string[];
};

const nextConfig: ExtendedNextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  allowedDevOrigins: ['127.0.0.1', '127.0.0.1:3100', '127.0.0.1:3000'],
};

export default nextConfig;
