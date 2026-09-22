import {Companion} from './demo-model.mjs';
const slot='vibedock-public-demo-v1',listeners=new Set();
let model=new Companion();
function restore(){try{const saved=JSON.parse(localStorage.getItem(slot));if(saved?.schema===1 && saved.tools?.codex?.mode==='demo' && saved.tools?.workbuddy?.mode==='demo'){
 for(const field of ['instanceId','epoch','revision','activeTool','deviceConnected','tools','events'])model[field]=saved[field];
}}catch{}}
function persist(){try{const saved={schema:1};for(const field of ['instanceId','epoch','revision','activeTool','deviceConnected','tools','events'])saved[field]=model[field];localStorage.setItem(slot,JSON.stringify(saved))}catch{}}
function notify(){const s=model.snapshot();for(const fn of listeners)fn(s)}
restore();persist();
model.on('snapshot',()=>{persist();notify()});
window.addEventListener('storage',e=>{if(e.key===slot){restore();notify()}});
export const subscribeDemo=fn=>{listeners.add(fn);return ()=>listeners.delete(fn)};
export async function demoApi(route,data){
 if(route==='/api/session')return {key:'demo-only',snapshot:model.snapshot()};
 if(route!=='/api/command')throw Error('在线演示不支持连接真实客户端');
 if(data.type==='mode.set' && data.mode!=='demo')throw Error('在线演示仅使用模拟数据');
 const run=async()=>{restore();const result=await model.command(data);return {...result,snapshot:model.snapshot()}};
 return navigator.locks? navigator.locks.request(slot,run):run();
}
