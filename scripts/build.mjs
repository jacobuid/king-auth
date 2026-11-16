import { build } from 'esbuild';
await build({ entryPoints: ['client/portal.mjs'], bundle: true, format: 'esm', outfile: 'public/app.js', minify: true, target: ['es2022'], legalComments: 'none' });
await build({entryPoints:['client/password-toggle.mjs'],bundle:true,format:'esm',outfile:'public/password-toggle.js',minify:true,target:['es2022'],legalComments:'none'});
