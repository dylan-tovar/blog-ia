import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["172.16.0.44"],
  // /post/[id] renamed to /p/[id]; keep old links (bookmarks, already-sent
  // emails) working forever. /author/[id] -> /[username] can't go here
  // because it needs a DB lookup — see the redirect shim at
  // src/app/(public)/author/[id]/page.tsx instead.
  async redirects() {
    return [{ source: "/post/:id", destination: "/p/:id", permanent: true }];
  },
};

export default nextConfig;
