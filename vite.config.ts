import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import {defineConfig,loadEnv} from 'vite';
export default defineConfig(({mode})=>{
 // Unprefixed secrets stay in the server process; never inject them with define.
 const env=loadEnv(mode,process.cwd(),'');for(const [k,v] of Object.entries(env))process.env[k]??=v;
 return {css:{postcss:{plugins:[tailwindcss()]}},server:{host:'127.0.0.1'},plugins:[vinext()]};
});
