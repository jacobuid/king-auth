import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('.',import.meta.url));
await mkdir(new URL('./dist',import.meta.url),{recursive:true});
await build({absWorkingDir:directory,entryPoints:['client.mjs'],bundle:true,format:'esm',outfile:'dist/app.js',target:'es2022'});
await writeFile(new URL('./dist/index.html',import.meta.url),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Browser-only King Auth example</title><div id="app"></div><script type="module" src="./app.js"></script></html>');
