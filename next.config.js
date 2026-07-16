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
    // Vercel не включает бинарник ffmpeg в сборку функций автоматически
    // (file tracing видит только JS-зависимости) — указываем явно
    outputFileTracingIncludes: {
      '/api/dubbing/prepare': ['./node_modules/ffmpeg-static/**'],
      '/api/dubbing/finalize': ['./node_modules/ffmpeg-static/**'],
      '/api/dubbing/align': ['./node_modules/ffmpeg-static/**'],
      '/api/dubbing/cut': ['./node_modules/ffmpeg-static/**'],
      '/api/dubbing/stitch': ['./node_modules/ffmpeg-static/**'],
    },
  },
}

module.exports = nextConfig