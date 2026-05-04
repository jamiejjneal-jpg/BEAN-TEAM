import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  // CRITICAL for Vercel: force single-threaded page data collection.
  // Next.js 16's multi-worker page collector silently crashes on Vercel's
  // 2-core runners, exiting with "Command failed with exit code 1" right
  // after "Skipping validation of types" with zero error output.
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
  // Hard-wire the @/* alias into webpack so the build does not depend on
  // tsconfig path resolution.
  webpack: (config) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': __dirname,
    }
    return config
  },
}

export default nextConfig
