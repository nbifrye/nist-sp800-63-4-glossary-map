import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    outDir: 'dist-widget',
    lib: { entry: 'src/widget.ts', name: 'GlossaryMap', formats: ['iife'], fileName: () => 'glossary-map.js', cssFileName: 'glossary-map' },
  },
});
