import {resolve} from 'node:path';
import {defineConfig} from 'vite';

export default defineConfig({
    build: {
        lib: {
            // Build both entrypoints
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
            },
            formats: ['es', 'cjs'],
            fileName: (format, entryName) => `${entryName}.${format}.js`
        },
        rollupOptions: {
            external: ['fs', 'path']
        },
        emptyOutDir: false,
        sourcemap: true,
        target: 'node22'
    }
});
