import process from 'node:process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleTransferFileRequest } from './server/transferRelay.js';
import { handleGoogleAuthRequest } from './server/googleAuthHandler.js';

function cloudBackendPlugin(env) {
  const middleware = (req, res, next) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname === '/api/transfer-file') {
      return handleTransferFileRequest(req, res);
    }
    if (pathname === '/api/google-auth') {
      return handleGoogleAuthRequest(req, res, env);
    }
    return next();
  };

  return {
    name: 'cloud-backend-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), cloudBackendPlugin(env)],
  };
});
