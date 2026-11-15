import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('.',import.meta.url)));
await mkdir('dist',{recursive:true});
await build({absWorkingDir:fileURLToPath(new URL('.',import.meta.url)),entryPoints:['client.mjs'],bundle:true,format:'esm',outfile:'dist/app.js',target:'es2022'});
await writeFile('dist/index.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connected website example</title><div id="app"></div><script type="module" src="/app.js"></script></html>');
