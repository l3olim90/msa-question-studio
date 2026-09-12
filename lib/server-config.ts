// Server-only settings. Never pass this object to a client component.
export function serverConfig(env:Record<string,string|undefined>=process.env){
 const provider=env.AI_PROVIDER||'openai';
 if(!['openai','azure','anthropic'].includes(provider))throw new Error('AI_PROVIDER must be openai, azure or anthropic.');
 return {key:env[provider==='azure'?'AZURE_OPENAI_API_KEY':provider==='anthropic'?'ANTHROPIC_API_KEY':'OPENAI_API_KEY']||'',
  connection:{provider:provider as 'openai'|'azure'|'anthropic',endpoint:env.AZURE_OPENAI_ENDPOINT||'',deployment:env.AZURE_OPENAI_CHAT_DEPLOYMENT_NAME||'',model:provider==='openai'?env.OPENAI_MODEL:provider==='anthropic'?env.ANTHROPIC_MODEL:undefined},
  password:env.APP_PASSWORD||'',user:env.APP_USERNAME||'studio'};
}
