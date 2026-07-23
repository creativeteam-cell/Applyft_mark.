/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'lh3.googleusercontent.com',
      'res.cloudinary.com',
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['sharp', 'ffmpeg-static'],
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
}

module.exports = nextConfig