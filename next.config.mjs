/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  serverExternalPackages: ['pg'],
  turbopack: { resolveAlias: { canvas: './lib/empty.ts' } },
};
export default nextConfig;
