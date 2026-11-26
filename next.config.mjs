/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Outbound calls are made from route handlers only (PROJECT-PLAN.md §5.7):
  // no third-party API is ever called from the browser.
};

export default nextConfig;
