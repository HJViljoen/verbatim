import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Apex redirects to the app for now; temporary (307) so browsers don't
      // cache it once the marketing site takes over verbatimintel.com.
      {
        source: "/:path*",
        has: [{ type: "host", value: "verbatimintel.com" }],
        destination: "https://app.verbatimintel.com/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
