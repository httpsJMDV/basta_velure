import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// `vite preview` has no file type for .apk. An APK is a ZIP inside, so with no type a phone saves it under a number and
// opens it as a ZIP instead of offering to install it.
const apkHeaders: Plugin = {
  name: 'apk-headers',
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] === '/download/loved-it.apk') {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', 'attachment; filename="Loved-IT.apk"');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), apkHeaders],
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
