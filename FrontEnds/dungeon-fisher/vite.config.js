import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
        chunkSizeWarningLimit: 1500
    },
    server: {
        port: 8080
    }
});
