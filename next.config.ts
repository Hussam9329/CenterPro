import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=()' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ] },
    // public/ artwork has no content hash, so a week of browser caching (not
    // immutable) instead of the default revalidation on every page view.
    // Rename a file when its artwork changes.
    ...['/ranks/:file*', '/brand/:file*'].map(source => ({ source, headers: [
      { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
    ] }))];
  },
};

export default nextConfig;
