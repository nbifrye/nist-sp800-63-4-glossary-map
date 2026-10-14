import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { rolldownOptions: { input: { main: 'index.html', embed: 'embed.html' } } },
  server: { host: '127.0.0.1', port: 8765, strictPort: true },
  preview: { host: '127.0.0.1', port: 8765, strictPort: true },
});
