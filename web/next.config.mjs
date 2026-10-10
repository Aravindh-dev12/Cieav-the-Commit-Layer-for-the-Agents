/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Ensure deployment ID skew protection is enabled for Next.js builds
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID || undefined,
  generateEtags: true,
  poweredByHeader: false,
}

export default nextConfig
