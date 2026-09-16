import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {mkdirSync,rmSync} from 'node:fs';
try{process.loadEnvFile('.env');}catch(e){if(e.code!=='ENOENT')throw e;}
const name=process.argv[2];if(!['check','providers-check','retry-check','migration-check','env-only-check','updates-check','bank'].includes(name))throw new Error('Unknown script.');
mkdirSync('test-output',{recursive:true});const outfile=`test-output/${name}.mjs`;
await build({entryPoints:[`scripts/${name}.ts`],bundle:true,platform:'node',format:'esm',packages:'external',outfile});
const result=spawnSync(process.execPath,[outfile,...process.argv.slice(3)],{stdio:'inherit'});rmSync(outfile,{force:true});process.exit(result.status??1);
