import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleTransferFileRequest } from './server/transferRelay.js';

function cloudTransferRelayPlugin() {
  const middleware = (req, res, next) => {
    if (req.url !== '/api/transfer-file') {
      return next();
    }
    return handleTransferFileRequest(req, res);
  };

  return {
    name: 'cloud-transfer-relay',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cloudTransferRelayPlugin()],
});
