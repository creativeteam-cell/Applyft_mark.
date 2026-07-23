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
    // ffmpeg-static бинарник не отслеживается автоматически — включаем явно
    outputFileTracingIncludes: {
      '/api/video/last-frame/[id]': ['./node_modules/ffmpeg-static/**'],
      '/api/video/translate': ['./node_modules/ffmpeg-static/**'],
    },
  },
}

module.exports = nextConfig