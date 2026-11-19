import { config } from 'dotenv';
import path from 'node:path';
import { projectRoot } from './store.ts';
import type { Connection, Provider } from '../src/types.ts';
import {registerSecret,redactSecrets} from './secret-redaction.ts';
config({path:path.join(projectRoot,'.env.local'),quiet:true});

const overrides=new Map<Provider,string>();
export function setCredentialOverride(provider:Provider,key:string){registerSecret(key);overrides.set(provider,key);}
export function credential(provider: Provider) { const key=overrides.get(provider)||process.env[provider==='openai'?'OPENAI_API_KEY':'ANTHROPIC_API_KEY']?.trim();registerSecret(key);return key; }
export function safeError(error: unknown) {
  let text = error instanceof Error ? error.message : String(error);
  for (const provider of ['openai','anthropic'] as const) { const key=credential(provider); if(key) text=text.replaceAll(key,'[REDACTED]'); }
  return redactSecrets(text).slice(0,1600);
}
export const connections: Connection[] = (['openai','anthropic'] as const).map(provider=>({provider,configured:!!credential(provider),status:credential(provider)?'configured':'missing',models:[]}));
export async function checkConnections() {
  await Promise.all(connections.map(async connection=>{
    const key=credential(connection.provider);
    connection.configured=!!key;
    if(!key){connection.status='missing';return;}
    try {
      const openai=connection.provider==='openai';
      const response=await fetch(openai?'https://api.openai.com/v1/models':'https://api.anthropic.com/v1/models?limit=100',{
        headers:{Authorization:`Bearer ${key}`,...(!openai?{'anthropic-version':'2023-06-01'}:{})},signal:AbortSignal.timeout(15000)
      });
      if(!response.ok) throw new Error(`HTTP ${response.status}：${response.status===401?'密钥认证失败':response.status===429?'请求受限或额度不足':'无法读取模型列表'}`);
      const data=await response.json() as {data:{id:string}[]};
      connection.models=data.data.map(x=>x.id).filter(id=>openai?/^gpt-/.test(id)&&!/(audio|realtime|transcribe|tts|search|image)/.test(id):/^claude-/.test(id)).sort();
      connection.status='connected';delete connection.error;
    } catch(error){connection.status='error';connection.error=safeError(error);}
    connection.checkedAt=new Date().toISOString();
  }));
  return connections;
}
