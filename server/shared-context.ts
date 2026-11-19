import {z} from 'zod';
const id=z.string().min(1).max(180);
export const sharedReceiptSchema=z.object({id,linkId:id.optional(),from:id,fromName:z.string().max(240).default('来源项目'),to:id,path:z.array(id).max(12),items:z.array(z.object({type:z.enum(['summary','note','artifact','document']),ref:id,text:z.string().max(50000)})).max(80)});
export type SharedReceipt=z.infer<typeof sharedReceiptSchema>;
export function sharedContext(receipts:SharedReceipt[],projectId:string){if(receipts.some(r=>r.to!==projectId))throw new Error('共享收件不属于此项目');return receipts.map(r=>'来源项目：'+r.fromName+'\n来源路径：'+r.path.join(' → ')+'\n'+r.items.map(i=>'['+i.type+'] '+i.text).join('\n')).join('\n\n')||'无';}
