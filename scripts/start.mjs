// Avoid shell-specific environment assignment so npm start works on all hosts.
process.env.NODE_ENV = 'production';
await import('../server/index.ts');
