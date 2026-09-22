import {demoApi,subscribeDemo} from './demo-transport.mjs';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={codex:'Codex',workbuddy:'WorkBuddy'};
const labels={running:'执行中',waiting:'待介入',completed:'已完成',failed:'异常',paused:'已暂停',unknown:'状态未知'};
const taskLabel=t=>t.stateLabel || labels[t.state] || '未知';
const marks={running:'↻',waiting:'!',completed:'✓',failed:'×',paused:'Ⅱ',unknown:'·'};
let state=null,badgeState=null,key='',online=false,screen='tasks',decision=null,busy=false,toastTimer,stream,renderKey='';
const deviceOnly=new URLSearchParams(location.search).get('view')==='device';
if(deviceOnly){document.body.classList.add('device-only');document.title='VibeDock · 圆屏模拟器'}
const current=s=>s?.tasks.find(t=>t?.id===s.selected)||s?.tasks.find(Boolean);
const formatTokens=n=>n===null?'—':n>=1000000?`${(n/1000000).toFixed(2)}M`:n>=1000?`${(n/1000).toFixed(1)}k`:String(n);
const date=n=>n?new Date(n).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const safe=()=>online && state?.connected;
const canDevice=()=>safe() && state.deviceConnected;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000)}
async function api(route,data){return demoApi(route,data)}
function apply(next){
 if(state && next.instanceId!==state.instanceId){state=null;badgeState=null;decision=null;$('confirmDialog').close();screen='tasks'}
 if(state && next.revision<state.revision)return;
 if(state && state.epoch!==next.epoch){decision=null;$('confirmDialog').close();screen='tasks'}
 state=next;if(state.deviceConnected || !badgeState)badgeState=structuredClone(state);
 if(decision){const task=state.tasks.find(t=>t?.id===decision.taskId);if(task?.approval?.id!==decision.requestId){decision=null;$('confirmDialog').close()}}
 render();
}
async function send(type,extra={},source='pc'){
 if(!online)throw new Error('本地服务已断开，请恢复连接后重试');
 const basis=source==='device'?badgeState:state;
 const message={v:1,actionId:crypto.randomUUID(),epoch:basis.epoch,tool:basis.tool,source,type,...extra};
 const result=await api('/api/command',message);if(result.snapshot)apply(result.snapshot);return result;
}
function status(t){return `<span class="status ${t.state}">${marks[t.state]} ${esc(taskLabel(t))}</span>`}
function render(){
 if(!state)return;
 const nextKey=JSON.stringify({state,badgeState,online},(name,value)=>['revision','lastSync','observedAt'].includes(name)?undefined:value);
 $('synced').textContent=state.mode==='demo'?'模拟适配器 · 状态实时同步':state.lastSync?`最近同步 ${date(state.lastSync)} · ${(state.pollMs || 2000)/1000} 秒轮询`:'尚未同步真实数据';
 if(nextKey===renderKey)return;renderKey=nextKey;
 $('service').textContent=online?'在线演示 · 模拟数据':'演示未就绪';$('service').classList.toggle('offline',!online);
 $('offline').hidden=online && state.connected;
 $('offline').textContent=!online?'本地服务连接中断，保留最后快照。恢复同步后才能操作。':state.error || '正在连接工具，请稍候。';
 $('deviceStatus').textContent=state.deviceConnected && online?'模拟设备在线':'模拟设备离线';$('deviceStatus').classList.toggle('offline',!state.deviceConnected || !online);
 $('deviceToggle').textContent=state.deviceConnected?'模拟断连':'重新连接';$('deviceToggle').disabled=!online;
 document.querySelectorAll('[data-tool]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.tool===state.tool));b.disabled=!online});
 $('toolName').textContent=names[state.tool];$('mode').value=state.mode;$('mode').disabled=true;
 $('sourceBadge').textContent=state.mode==='demo'?'模拟演示':state.connected?state.provider==='cloud'?'云端 · 只读':'本机 · 状态跟踪':'等待连接';$('sourceBadge').classList.toggle('demo',state.mode==='demo');
 $('sourceNote').textContent=state.note+(state.tool==='workbuddy' && state.mode==='live'?` ${state.provider==='cloud'?'本地助理':'客户端心跳'}：${state.localOnline===null?'未知':state.localOnline?'在线':'未检测到'}。`:'');
 $('refresh').textContent=state.busy?'同步中…':'同步 ↻';$('refresh').disabled=!online || state.busy || state.mode==='demo';
 const unknown=state.tasks.filter(t=>t?.state==='unknown').length;
 const stateCount=kind=>{const count=state.tasks.filter(t=>t?.state===kind).length;return unknown?(count?`≥${count}`:'—'):String(count).padStart(2,'0')};
 $('runningCount').textContent=stateCount('running');$('waitingCount').textContent=stateCount('waiting');
 $('runningHint').textContent=unknown?`${unknown} 项实时状态未知`:'当前四个槽位';$('waitingHint').textContent=unknown?`${unknown} 项实时状态未知`:'需要你的回应';
 if(state.mode==='live' && state.tool==='codex'){
  const waiting=state.tasks.filter(t=>t?.state==='waiting').length;
  $('waitingCount').textContent=waiting?`≥${waiting}`:'—';$('waitingHint').textContent=state.hookStatus==='trusted'?'已收到的审批请求 · 覆盖待验证':'审批钩子未启用，数量未知';
 }
 if(state.mode==='live' && state.tool==='workbuddy' && state.provider==='desktop' && !unknown)$('waitingHint').textContent='包含等待输入 / 未开始';
 $('tokens').textContent=formatTokens(state.usage.tokens);$('tokenHint').textContent=`${state.mode==='demo'?'模拟':'历史记录'} · ${state.usage.known} 项已知 / ${state.usage.unknown} 项未知`;
 const quota=state.usage.quota[0];$('usageLabel').textContent=quota?'剩余额度':'已知任务 Token';
 if(quota){$('tokens').textContent=`${quota.remaining.toFixed(0)}%`;$('tokenHint').textContent=`${quota.label}${quota.resetsAt?' · '+date(quota.resetsAt)+' 恢复':''}`}
 const attention=state.attention || [];
 $('attentionCard').hidden=!attention.length;$('attentionTitle').textContent=`${attention.length} 项需要你看一下`;
 $('attentionScope').textContent=`已读取的 ${state.availableTasks.length} 项内`;
 $('attentionList').innerHTML=attention.map(t=>`<button class="attention-row" data-focus="${esc(t.id)}" ${!safe()?'disabled':''}><span><b>${esc(t.title)}</b><small>${esc(t.label)}${t.inSlots?'':' · 四区之外'}</small></span><span>查看 →</span></button>`).join('');
 $('deviceAttention').textContent=`待处理${attention.length?' '+attention.length:''}`;$('deviceAttention').classList.toggle('has-attention',!!attention.length);
 $('taskCount').textContent=`/ ${String(state.tasks.filter(Boolean).length).padStart(2,'0')}`;
 $('tasks').innerHTML=state.tasks.map((t,i)=>t?`<button class="task" data-task="${esc(t.id)}" aria-pressed="${t.id===state.selected}" ${!safe()?'disabled':''}><span class="slot-number ${t.state}">${String(i+1).padStart(2,'0')}</span><span><span class="task-title">${esc(t.title)}</span><span class="task-meta">${esc(t.project)} · ${t.lastState?'上轮'+labels[t.lastState]:'分区 '+(i+1)}</span></span>${status(t)}</button>`:`<div class="task"><span class="slot-number unknown">0${i+1}</span><span class="task-meta">空闲槽位</span></div>`).join('');
 $('latest').disabled=!safe();$('resetDemo').disabled=!online || state.mode!=='demo';
 const incoming=state.availableTasks.slice(0,4).filter(t=>!state.tasks.some(s=>s?.id===t.id)).length;
 $('latest').textContent=incoming?`${incoming} 个新任务 · 换为最近四项 ↻`:'换为最近四项 ↻';
 $('events').innerHTML=state.events.length?state.events.slice().reverse().map(e=>`<div class="event-row"><span>${new Date(e.time).toLocaleTimeString('zh-CN',{hour12:false})}</span><span>${e.direction} ${esc(e.type)}</span><span>${esc(e.result)}</span></div>`).join(''):'等待触控消息…<br>PC → snapshot → 圆屏<br>圆屏 → action → PC → ack';
 $('capabilities').innerHTML=`<div class="capabilities">${state.mode==='demo'?'演示能力：四区 / 审批 / 语音触发回执 / 断线恢复':state.tool==='codex'?'已接入：本地生命周期事件 / 历史 Token / 账户额度':state.provider==='cloud'?'已接入：云端任务 / 本地助理在线状态':'已接入：本地桌面状态库 / 客户端心跳 / 上下文占用'}</div>`;
 document.querySelectorAll('[data-scenario]').forEach(b=>b.disabled=!safe() || state.mode!=='demo' || !current(state) || !!current(state)?.approval?.pending);
 renderDetail();renderScreen();renderUsage();
}
function renderDetail(){
 const t=current(state);$('detailSource').textContent=t?.source||state.scope;
 if(!t){$('detail').innerHTML=`<div class="empty">${state.mode==='live'?'暂无可读取任务，可切换模拟演示体验交互。':'暂无任务'}</div>`;return}
 const request=t.approval;
 $('detail').innerHTML=`<h3 class="detail-title">${esc(t.title)}</h3><p class="detail-meta">${esc(t.statusNote)}${t.lastState?` · 最后一轮：${labels[t.lastState]}`:''}</p>${status(t)}<p class="detail-copy">${esc(t.summary)}</p>${request?`<div class="command">${esc(request.command)}<small>${esc(request.scope)} · 请求 ${esc(request.id.slice(0,12))}</small></div>`:''}<div class="actions">${request?`<button class="primary" data-decision="accept" ${!safe() || request.pending?'disabled':''}>${request.pending?'等待回执…':'批准本次'}</button><button class="danger" data-decision="decline" ${!safe() || request.pending?'disabled':''}>拒绝</button>`:`<button class="primary" data-native="pc" ${!safe() || !t.capabilities.nativeVoice?'disabled':''}>${state.mode==='demo'?'模拟原生语音':'原生语音待接入'}</button>`}<button class="secondary" data-open="pc" ${!safe() || !t.capabilities.openTask?'disabled':''}>${state.mode==='demo'?'模拟打开任务 ↗':t.capabilities.openTask?'在电脑打开任务 ↗':'任务跳转待接入'}</button><button class="link" id="copyTask">复制任务标识</button></div>${state.mode==='live'?'<p class="cap-note">点击打开任务后，在原客户端核对审批或使用语音。发送打开请求不会改变任务状态。</p>':''}`;
 if(t.evidence)$('detail').insertAdjacentHTML('beforeend',`<p class="detail-meta">状态依据：${esc(t.evidence.event || t.evidence.rawState || '本地记录')} · ${date(t.evidence.at)}${t.evidence.stale?' · 记录已陈旧':''}</p>`);
 if(t.contextUsage)$('detail').insertAdjacentHTML('beforeend',`<p class="detail-meta">已记录的上下文占用：${formatTokens(t.contextUsage.used)} / ${formatTokens(t.contextUsage.size)} tokens（不计入累计用量）</p>`);
}
function renderScreen(){
 const s=badgeState;if(!s)return;const t=current(s),disabled=!canDevice()?'disabled':'';
 document.querySelectorAll('[data-screen]').forEach(b=>b.classList.toggle('active',b.dataset.screen===screen || b.dataset.screen==='tasks' && ['detail','confirm'].includes(screen)));
 if(screen==='tasks'){
 $('screen').innerHTML=`<div class="quadrants">${s.tasks.map((v,i)=>v?`<button class="quadrant ${v.state}" data-device-task="${esc(v.id)}" aria-label="分区 ${i+1}，${esc(v.title)}，${esc(taskLabel(v))}" ${disabled}><span class="number">0${i+1}</span><span class="symbol">${marks[v.state]}</span><strong>${esc(taskLabel(v))}</strong><span class="quad-title">${esc(v.title)}</span>${v.lastState?`<span class="history">上轮${labels[v.lastState]}</span>`:''}</button>`:`<div class="quadrant unknown"><span class="number">0${i+1}</span><strong>空闲</strong></div>`).join('')}</div><span class="hub">${s.tool==='codex'?'⌘':'w'}</span>${!canDevice()?'<span class="offline-chip">离线缓存 / 暂停操作</span>':''}`;
  $('screenHint').textContent='四个槽位保持固定。点击分区查看任务，收到回执后更新状态。';return;
 }
 const top=`<div class="screen-top"><button class="screen-back" data-screen="tasks">‹ 四区</button><span>${names[s.tool]}${s.mode==='demo'?' · 模拟':''}</span></div>`;
 let content='';
 if(screen==='detail') {
  content=t?`${status(t)}<h2>${esc(t.title)}</h2><p class="device-summary">${esc(t.summary)}</p>${t.approval?`<div class="device-actions"><button class="screen-action" data-device-decision="accept" ${disabled}>查看并批准</button><button class="screen-action reject" data-device-decision="decline" ${disabled}>拒绝</button></div>`:`${s.mode==='live'&&t.capabilities.openTask?`<button class="screen-action" data-open="device" ${disabled}>在电脑打开 ↗</button>`:`<button class="screen-action" data-screen="voice" ${disabled}>原生语音</button>`}`}`:'<p>暂无任务</p>';
  $('screenHint').textContent=t?.state==='unknown'?'圆屏显示最后已知信息，当前状态尚未确认。':s.mode==='live'?'点击“在电脑打开”定位原任务，处理后状态会继续同步。':'任务摘要已同步到电脑端。点击批准或拒绝可核对本次请求。';
 }
 if(screen==='attention'){
  const items=s.attention || [];
  content=`<div class="device-kicker">需要你看一下 · ${items.length}</div><div class="device-attention-list">${items.map(v=>`<button data-focus="${esc(v.id)}" data-focus-source="device" ${disabled}><b>${esc(v.title)}</b><small>${esc(v.label)}${v.inSlots?'':' · 四区之外'}</small></button>`).join('') || '<p>当前没有已识别的待处理项</p>'}</div>`;
  $('screenHint').textContent=`覆盖已读取的 ${s.availableTasks.length} 项。选择四区之外的任务时，替换当前选中槽位；未知状态不等于无需处理。`;
 }
 if(screen==='voice') {
  content=`<div class="device-kicker">${names[s.tool]} 原生语音</div><h2>继续这个想法</h2><div class="voice-icon">♩</div><p class="quad-title">${esc(t?.title || '尚未选择任务')}</p><button class="screen-action" data-native="device" ${!canDevice() || !t?.capabilities.nativeVoice?'disabled':''}>${s.mode==='demo'?'模拟触发入口':'原生入口待接入'}</button><p class="micro">录音与识别由原工具完成</p>`;
  $('screenHint').textContent=s.mode==='demo'?'点击将发送 voice.start 并显示模拟回执，不会启动录音。':'真实语音控制尚未接通。可在原工具中使用吧唧麦克风，不做独立转写。';
 }
 if(screen==='usage'){
  content=`<div class="device-kicker">当前四项 · 已知 Token</div><div class="big">${formatTokens(s.usage.tokens)}</div><p>${s.usage.unknown} 项未知用量未计入</p>${s.usage.quota.slice(0,2).map(q=>`<p>${esc(q.label)}<br><b>剩余 ${q.remaining.toFixed(0)}%</b></p>`).join('') || '<p>账户额度暂不可用</p>'}`;
  $('screenHint').textContent='Token 来自任务记录；账户额度单独展示。未知数据不会计作 0。';
 }
 if(screen==='confirm' && decision) {
  const req=t?.approval;
  content=req?`<div class="device-kicker">仅本次 · 模拟请求</div><h2>${decision.decision==='accept'?'确认批准？':'确认拒绝？'}</h2><p class="device-command">${esc(req.command)}</p><p class="micro">${esc(req.scope)}</p><div class="device-actions"><button class="screen-action" id="deviceConfirm" ${disabled || busy?'disabled':''}>${busy?'等待回执…':'确认'}</button><button class="screen-action reject" data-screen="detail">返回</button></div>`:'<p>请求已处理，请返回四区。</p>';
  $('screenHint').textContent='确认绑定任务与请求编号；后端会拒绝过期或重复的决定。';
 }
 $('screen').innerHTML=`<div class="screen-inner">${top}${content}<span class="screen-bottom">${canDevice()?'VIBEDOCK / '+screen.toUpperCase():'CACHED / 离线'}</span></div>`;
}
function renderUsage(){
 if(!state)return;const u=state.usage;
 $('usageDetail').innerHTML=`<p class="muted">${names[state.tool]} · ${state.mode==='demo'?'模拟数据':'真实数据'} · 当前四个槽位</p><div class="usage-total">${formatTokens(u.tokens)} <small>tokens</small></div><p class="muted">${u.known} 项已知，${u.unknown} 项未知。历史累计记录不等同于本轮消耗。</p>${u.quota.map(q=>`<div class="quota-row"><div class="quota-heading"><span>${esc(q.label)}</span><b>剩余 ${q.remaining.toFixed(1)}%</b></div><progress value="${q.remaining}" max="100" aria-label="${esc(q.label)}剩余额度"></progress><small>${q.resetsAt?'重置时间 '+date(q.resetsAt):'重置时间未提供'}</small></div>`).join('')}<p class="muted">${esc(u.quotaNote)}</p>`;
}
function requestDecision(kind,source){
 const s=source==='device'?badgeState:state,t=current(s),r=t?.approval;if(!r || r.pending)return;
 decision={tool:s.tool,epoch:s.epoch,taskId:t.id,requestId:r.id,requestRevision:r.revision,decision:kind,source};
 if(source==='device'){screen='confirm';renderScreen();return}
 $('confirmTitle').textContent=kind==='accept'?'批准这一次操作？':'拒绝这一次操作？';$('confirmTask').textContent=names[s.tool]+' · '+t.title;$('confirmCommand').textContent=r.command;$('confirmScope').textContent=r.scope;$('confirmAction').textContent=kind==='accept'?'确认批准':'确认拒绝';$('confirmDialog').showModal();
}
async function confirmDecision(){
 if(!decision || busy)return;const intent={...decision};busy=true;$('confirmAction').disabled=true;renderScreen();
 try{await send('interaction.resolve',intent,intent.source);decision=null;$('confirmDialog').close();screen='detail';toast('模拟适配器已确认，任务状态已同步。')}
 finally{busy=false;$('confirmAction').disabled=false;renderScreen()}
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b || b.disabled || !state)return;
 try {
  if(b.dataset.close)$(b.dataset.close).close();
  if(b.dataset.tool && b.dataset.tool!==state.tool)await send('tool.select',{target:b.dataset.tool});
  if(b.dataset.screen){screen=b.dataset.screen;decision=null;renderScreen()}
  if(b.dataset.task || b.dataset.deviceTask){const device=!!b.dataset.deviceTask;await send('task.select',{taskId:b.dataset.task || b.dataset.deviceTask},device?'device':'pc');screen='detail';renderScreen()}
  if(b.dataset.decision)requestDecision(b.dataset.decision,'pc');
  if(b.dataset.deviceDecision)requestDecision(b.dataset.deviceDecision,'device');
  if(b.id==='confirmAction' || b.id==='deviceConfirm')await confirmDecision();
  if(b.dataset.native){const source=b.dataset.native;const t=current(source==='device'?badgeState:state);const result=await send('voice.start',{taskId:t.id},source);toast(result.message)}
 if(b.dataset.open){const source=b.dataset.open,t=current(source==='device'?badgeState:state);b.disabled=true;try{const result=await send('task.open',{taskId:t.id},source);toast(result.message)}finally{renderKey='';render()}}
 if(b.dataset.focus){await send('task.focus',{taskId:b.dataset.focus},b.dataset.focusSource || 'pc');screen='detail';renderScreen()}
  if(b.dataset.scenario)await send('demo.state',{taskId:current(state).id,state:b.dataset.scenario});
  if(b.id==='deviceToggle')await send('device.connection',{connected:!state.deviceConnected});
  if(b.id==='resetDemo')await send('demo.reset');
  if(b.id==='latest')await send('tasks.latest');
  if(b.id==='refresh'){const result=await api('/api/refresh',{});apply(result.snapshot)}
  if(b.id==='settingsButton')$('settingsDialog').showModal();
  if(b.id==='usageCard')$('usageDialog').showModal();
  if(b.id==='copyTask'){await navigator.clipboard.writeText(current(state).id);toast('任务标识已复制')}
 }catch(error){toast(error.message)}
});
$('mode').addEventListener('change',async e=>{try{await send('mode.set',{mode:e.target.value})}catch(error){toast(error.message);renderKey='';render()}});
async function connect(){const session=await api('/api/session');online=true;apply(session.snapshot);subscribeDemo(next=>{online=true;apply(next)})}
void connect();
