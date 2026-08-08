import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit loads its bundled font AFM files via __dirname-relative paths at runtime — bundling it
  // into the route handler (Turbopack's default) breaks that path resolution. Excluding it here
  // makes Next require() it natively from node_modules instead, matching how sharp/better-sqlite3
  // (both native/fs-path-dependent) are already auto-externalized by Next's own default list.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
