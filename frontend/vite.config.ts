import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// What the live site's pages may load. If a script ever got into a page, it could not run or send anything out, because
// its source would not be on this list. The site's own pages use no inline scripts. Only for `vite preview`: the dev
// server needs inline scripts for hot reload.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' is for the barcode reader's own WebAssembly file, which still has to come from this site.
  "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://api.loved-it.shop https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.googleusercontent.com",
  "connect-src 'self' https://api.loved-it.shop wss://ws.loved-it.shop https://psgc.gitlab.io https://router.project-osrm.org https://nominatim.openstreetmap.org https://accounts.google.com/gsi/",
  'frame-src https://accounts.google.com/gsi/',
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const previewHeaders: Plugin = {
  name: 'preview-headers',
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
      res.setHeader('Strict-Transport-Security', 'max-age=15552000');

      // `vite preview` has no file type for .apk. An APK is a ZIP inside, so with no type a phone saves it under a
      // number and opens it as a ZIP instead of offering to install it.
      if (req.url?.split('?')[0] === '/download/loved-it.apk') {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', 'attachment; filename="Loved-IT.apk"');
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), previewHeaders],
  // `vite preview` serves the production build through the Cloudflare tunnel;
  // Vite blocks unknown Host headers unless they are listed here.
  preview: {
    port: 5173,
    allowedHosts: ['loved-it.shop'],
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/sanctum': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/sanctum': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
