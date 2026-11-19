const secrets=new Set<string>();
export function registerSecret(value:string|undefined){if(value)secrets.add(value);}
export function redactSecrets(value:string){for(const key of secrets)value=value.replaceAll(key,'[REDACTED]');return value.replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]');}
