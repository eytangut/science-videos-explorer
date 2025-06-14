
import type {NextConfig} from 'next';

// IMPORTANT FOR GITHUB PAGES:
// If you are deploying to a project page (e.g., https://<username>.github.io/<repository-name>/)
// set REPO_NAME to your repository name.
// If you are deploying to a user/organization page (e.g., https://<username>.github.io/),
// set REPO_NAME to an empty string ''.
const REPO_NAME = 'science-videos-explorer'; // <<--!!! UPDATE THIS TO YOUR REPOSITORY NAME OR EMPTY STRING !!!

const isProd = process.env.NODE_ENV === 'production';

const basePath = isProd && REPO_NAME ? `/${REPO_NAME}` : undefined;
const assetPrefix = isProd && REPO_NAME ? `/${REPO_NAME}/` : undefined;


const nextConfig: NextConfig = {
  output: 'export', // Enable static site generation
  basePath: basePath,
  assetPrefix: assetPrefix,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true, // Required for static export with next/image without a custom loader
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com', // For YouTube thumbnails
        port: '',
        pathname: '/**',
      }
    ],
  },
};

export default nextConfig;
