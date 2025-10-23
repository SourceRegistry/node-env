import {resolve} from 'node:path';
import {defineConfig} from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    build: {
        lib: {
            // Build both entrypoints
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                promises: resolve(__dirname, 'src/promises.ts')
            },
            formats: ['es', 'cjs'],
            fileName: (format, entryName) => `${entryName}.${format}.js`
        },
        rollupOptions: {
            external: ['fs', 'path']
        },
        sourcemap: true,
        target: 'node22'
    },
    plugins: [
        dts({
            compilerOptions: {
                stripInternal: false,
                removeComments: false
            },
            // Ensure both files are included in type generation
            include: ['src/index.ts']
        })
    ]
});
