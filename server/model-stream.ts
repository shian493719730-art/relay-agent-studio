/** Do not let compatible gateways turn a truncated SSE completion into a successful SDK result. */
export function guardModelStream(response:Response,protocol:'chat'|'responses'|'anthropic'){
 if(!response.ok||!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))return response;
 const decoder=new TextDecoder();let pending='',terminal=false;
 const inspect=(line:string)=>{
  if(!line.startsWith('data:'))return;const raw=line.slice(5).trim();if(!raw)return;if(raw==='[DONE]'){if(!terminal)throw new Error('模型连接已结束，但未收到完整完成标记；已保留部分输出，请明确继续。');return;}
  let data:any;try{data=JSON.parse(raw)}catch{return}
  const reason=protocol==='chat'?data.choices?.find((c:any)=>c.index===0)?.finish_reason:protocol==='anthropic'?data.delta?.stop_reason:data.response?.incomplete_details?.reason;
  if(reason==='length'||reason==='max_tokens'||reason==='max_output_tokens')throw new Error('模型输出达到 token 上限，正文未完成；已保留部分输出，不能作为完整成果交付。请明确继续重试。');
  if(protocol==='chat'&&reason){if(!['stop','tool_calls','function_call'].includes(reason))throw new Error('模型未正常完成：'+String(reason).slice(0,80));terminal=true;}
  if(protocol==='anthropic'&&reason)terminal=true;
  if(protocol==='responses'&&data.type==='response.completed')terminal=true;
  if(protocol==='responses'&&['response.incomplete','response.failed'].includes(data.type))throw new Error('模型响应未完整完成，已保留部分输出。请检查后明确继续。');
 };
 const body=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
  transform(chunk,controller){pending+=decoder.decode(chunk,{stream:true});let pos;while((pos=pending.indexOf('\n'))>=0){inspect(pending.slice(0,pos).trimEnd());pending=pending.slice(pos+1)}if(pending.length>2_000_000)throw new Error('模型流事件过长');controller.enqueue(chunk);},
  flush(){pending+=decoder.decode();if(pending)inspect(pending);if(!terminal)throw new Error('模型连接已结束，但未收到完整完成标记；已保留部分输出，请明确继续。');}
 }));
 const headers=new Headers(response.headers);headers.delete('content-length');return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
