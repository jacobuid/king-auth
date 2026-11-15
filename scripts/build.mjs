import { build } from 'esbuild';
await build({ entryPoints: ['client/portal.mjs'], bundle: true, format: 'esm', outfile: 'public/app.js', minify: true, target: ['es2022'], legalComments: 'none' });
