import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import {defineConfig,loadEnv} from 'vite';
import {nitro} from 'nitro/vite';
import {resolve} from 'node:path';
export default defineConfig(({mode})=>{
 // Unprefixed secrets stay in the server process; never inject them with define.
 const env=loadEnv(mode,process.cwd(),'');for(const [k,v] of Object.entries(env))process.env[k]??=v;
 return {resolve:{alias:{'tailwindcss':resolve('node_modules/tailwindcss/index.css'),'tw-animate-css':resolve('node_modules/tw-animate-css/dist/tw-animate.css')}},css:{postcss:{plugins:[tailwindcss()]}},server:{host:'127.0.0.1'},plugins:[vinext(),...(process.env.NITRO_PRESET?[nitro({preset:process.env.NITRO_PRESET,vercel:{functions:{maxDuration:300}}})]:[])]};
});
