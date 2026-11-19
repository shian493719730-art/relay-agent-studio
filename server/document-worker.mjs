import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import yauzl from 'yauzl';

const {file,kind,resume=[]}=workerData;
const maxText=150000,maxParts=2000;
let characters=0,index=0;
const warnings=[];
function part(location,text){
 text=String(text).replace(/\u0000/g,'').trim();if(!text)return;if(text.length>6000){for(let i=0;i<text.length;i+=6000)part(location+' · 片段 '+(i/6000+1),text.slice(i,i+6000));return;}
 characters+=text.length;if(characters>maxText||index>=maxParts)throw new Error('文件正文超过本次读取上限（15万字符/2000段），请拆分文件后再试；没有截断后假报完整。');
 const segment={location,text};if(resume[index]&&(resume[index].location!==location||resume[index].text!==text))throw new Error('文件读取检查点不一致，请重新导入原件');
 if(!resume[index])parentPort.postMessage({type:'segment',segment,index});index++;
}
async function inspectZip(){
 await new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true},(err,zip)=>{
  if(err)return reject(new Error('Office文件损坏或已加密，请提供未加密的DOCX/XLSX文件'));
  let total=0,count=0;const fail=e=>{zip.close();reject(e)};
  zip.on('error',fail);zip.on('end',resolve);zip.on('entry',entry=>{
   total+=entry.uncompressedSize;count++;
   if(total>80*1024*1024||count>10000||entry.generalPurposeBitFlag&1)return fail(new Error('Office文件已加密或解压体积过大，请解密或拆分后再试'));
   zip.readEntry();
  });zip.readEntry();
 }));
}
try{
 if(kind==='docx'){
  await inspectZip();const {default:mammoth}=await import('mammoth');const result=await mammoth.extractRawText({path:file},{externalFileAccess:false});
  warnings.push('读取Word主体段落与表格文本；图片、版式、批注与页眉页脚未作为正文读取。');
  warnings.push(...result.messages.map(m=>m.message).slice(0,15));
  result.value.split(/\n\s*\n/).forEach((p,i)=>part('提取段落 '+(i+1),p));
 }else if(kind==='xlsx'){
  await inspectZip();const {default:ExcelJS}=await import('exceljs');const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(file);
  warnings.push('保留工作表名与单元格坐标；公式展示公式和文件内缓存结果，不重算，不执行宏或外部连接。');
  let cells=0;
  for(const sheet of workbook.worksheets){
   sheet.eachRow({includeEmpty:false},row=>{
    const values=[];row.eachCell({includeEmpty:false},cell=>{
     if(++cells>30000)throw new Error('Excel非空单元格超过30000个，请按工作表或范围拆分后再试');
     if(cell.isMerged&&cell.master.address!==cell.address){values.push(cell.address+'=[合并到 '+cell.master.address+']');return;}
     const v=cell.value;let text=cell.text;
     if(v&&typeof v==='object'){
      if('formula'in v||'sharedFormula'in v)text='公式 '+(v.formula||'共享公式 '+v.sharedFormula)+'；缓存结果：'+('result'in v?JSON.stringify(v.result):'无（未计算）');
      else if('richText'in v)text=v.richText.map(x=>x.text).join('');
      else if(v instanceof Date)text=v.toISOString();
      else if('hyperlink'in v)text=(v.text||'')+' [链接：'+v.hyperlink+']';
     }
     values.push(cell.address+'='+text);
    });part('工作表「'+sheet.name+'」'+(sheet.state!=='visible'?'（隐藏）':'')+' / 行 '+row.number,values.join(' | '));
   });
  }
 }else if(kind==='pdf'){
  const require=createRequire(import.meta.url),dist=path.dirname(require.resolve('pdfjs-dist/package.json'));
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  // PDF.js requires a forward-slash terminator even for Node filesystem paths on Windows.
  const assetDirectory=name=>path.join(dist,name).split(path.sep).join('/')+'/';
  const loading=getDocument({data:new Uint8Array(await fs.readFile(file)),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,cMapUrl:assetDirectory('cmaps'),cMapPacked:true,standardFontDataUrl:assetDirectory('standard_fonts')});const doc=await loading.promise;
  if(doc.numPages>300)throw new Error('PDF超过300页，请按页码拆分后再试');
  const empty=[];
  try{for(let page=1;page<=doc.numPages;page++){
   const p=await doc.getPage(page),content=await p.getTextContent();let text='';
   for(const item of content.items)if('str'in item)text+=item.str+(item.hasEOL?'\n':' ');
   if(!text.trim())empty.push(page);else part('第 '+page+' 页',text);p.cleanup();
  }}finally{await loading.destroy()}
  if(empty.length)warnings.push('以下PDF页未提取到文字，可能是扫描图片或空白页，未执行OCR：'+empty.join('、'));
  warnings.push('PDF按文字层提取；复杂多栏、表格顺序与图片需对照原件，不读取图片内容。');
 }else{
  const text=await fs.readFile(file,'utf8');if(text.includes('\ufffd'))warnings.push('原件可能不是UTF-8编码，出现替换字符；请转为UTF-8后重试。');
  text.split(/\n/).forEach((line,i)=>part('第 '+(i+1)+' 行',line));
 }
 if(!index)throw new Error('未读取到正文。扫描PDF需要OCR；加密、空白或损坏文件请处理后重试，不能仅凭文件名执行。');
 parentPort.postMessage({type:'done',warnings,characters,segments:index});
}catch(error){parentPort.postMessage({type:'error',message:error?.name==='PasswordException'?'PDF已加密，请先解密后重新导入':error instanceof Error?error.message:'文件解析未完成'});}
