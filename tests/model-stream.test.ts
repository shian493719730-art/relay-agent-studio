import {test} from 'node:test';
import assert from 'node:assert/strict';
import {guardModelStream} from '../server/model-stream.ts';
const response=(data:unknown)=>new Response('data: '+JSON.stringify(data)+'\n\n',{headers:{'content-type':'text/event-stream'}});
test('native protocol terminal markers distinguish complete and truncated content',async()=>{
 await assert.rejects(()=>guardModelStream(response({type:'response.incomplete',response:{incomplete_details:{reason:'max_output_tokens'}}}),'responses').text(),/token 上限/);
 await assert.rejects(()=>guardModelStream(response({type:'message_delta',delta:{stop_reason:'max_tokens'}}),'anthropic').text(),/token 上限/);
 assert.match(await guardModelStream(response({type:'response.completed'}),'responses').text(),/response.completed/);
 assert.match(await guardModelStream(response({type:'message_delta',delta:{stop_reason:'end_turn'}}),'anthropic').text(),/end_turn/);
});
