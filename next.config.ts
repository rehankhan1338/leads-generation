import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep visited result pages in the client router cache for a while so
    // toggling a filter off and on again, or Next/Previous, renders instantly
    // instead of re-querying. The data only changes on import, so 60 s of
    // staleness is invisible.
    staleTimes: { dynamic: 60, static: 300 },
  },
};

export default nextConfig;
