import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit loads its bundled font AFM files via __dirname-relative paths at runtime — bundling it
  // into the route handler (Turbopack's default) breaks that path resolution. Excluding it here
  // makes Next require() it natively from node_modules instead, matching how sharp/better-sqlite3
  // (both native/fs-path-dependent) are already auto-externalized by Next's own default list.
  serverExternalPackages: ["pdfkit"],
  // Next's dev server blocks cross-origin requests to dev-only resources (the Turbopack/HMR
  // websocket) by default — reaching the dev server from a second machine on the LAN (its own
  // "Network: http://<lan-ip>:3000" address, printed on every `npm run dev` start) trips this and
  // can leave the page half-hydrated, which looks exactly like "none of the buttons work." Add
  // any other machine's LAN IP here too if it needs dev access to this app.
  // The .nip.io entry is the same machine, reached by a different hostname specifically so Google
  // OAuth's redirect-URI validation accepts it — Google flatly rejects raw IP addresses (only
  // `localhost` or a real public-suffix domain are allowed), and nip.io's wildcard DNS resolves
  // <ip>.nip.io straight back to <ip> with zero setup, so this is the same server either way.
  allowedDevOrigins: ["192.168.1.51", "192.168.1.51.nip.io"],
};

export default nextConfig;
