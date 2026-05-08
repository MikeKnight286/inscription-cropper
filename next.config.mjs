/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pdfjs-dist ships its worker as a separate file; tell webpack to leave it alone
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
