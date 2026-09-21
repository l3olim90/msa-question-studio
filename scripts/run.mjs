import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {mkdirSync,rmSync} from 'node:fs';
try{process.loadEnvFile('.env');}catch(e){if(e.code!=='ENOENT')throw e;}
const name=process.argv[2];if(!['check','providers-check','retry-check','migration-check','env-only-check','updates-check','features-check','team-check','bank','cloud','cloud-worker','cloud-verify'].includes(name))throw new Error('Unknown script.');
mkdirSync('test-output',{recursive:true});const outfile=`test-output/${name}-${process.pid}.mjs`;
await build({entryPoints:[`scripts/${name}.ts`],bundle:true,platform:'node',format:'esm',packages:'external',outfile});
const testRun=name.endsWith('check');
const env=testRun?{...process.env,STUDIO_STORAGE:'local',DATABASE_URL:'',SUPABASE_SECRET_KEY:'',VERCEL:'',STUDIO_DB_PATH:`test-output/test-${name}-${process.pid}.sqlite`}:process.env;
const result=spawnSync(process.execPath,[outfile,...process.argv.slice(3)],{stdio:'inherit',env});rmSync(outfile,{force:true});process.exit(result.status??1);
