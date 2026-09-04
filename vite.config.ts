import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  /** 内网穿透 / HTTPS 隧道访问时设为 1（见 .env.tunnel / npm run dev:tunnel） */
  const tunnelHmr = env.VITE_TUNNEL_HMR === '1';
  const labelingPort = env.LABELING_PORT?.trim() || '8100';

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // 允许局域网/内网穿透访问
      host: true,
      port: 5173,
      // 端口被占用时直接报错，避免静默切到 5174 导致隧道连错端口
      strictPort: true,
      // 内网穿透域名（含 *.space-xboard.ggff.net）
      allowedHosts: ['.space-xboard.ggff.net', 'localhost', '127.0.0.1'],
      // 仅隧道模式走 wss:443；本地 http://localhost:5173 使用默认 ws，避免白屏
      ...(tunnelHmr
        ? {
            hmr: {
              protocol: 'wss',
              clientPort: 443,
            },
          }
        : {}),
      proxy: {
        '/labeling-api': {
          target: `http://127.0.0.1:${labelingPort}`,
          changeOrigin: true,
          rewrite: (proxyPath) => proxyPath.replace(/^\/labeling-api/, ''),
        },
      },
    },
    build: {
      sourcemap: 'hidden',
    },
  };
});
