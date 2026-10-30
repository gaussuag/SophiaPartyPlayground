const frame = document.querySelector('#primary'), peer = document.querySelector('#peer'), output = document.querySelector('#result');
const eventId = new URLSearchParams(location.search).get('event');
if (!['127.0.0.1', 'localhost'].includes(location.hostname) || !eventId?.startsWith('local-')) throw new Error('仅限本次独立本地活动');
const root = `/api/events/${eventId}`, checks = [], requests = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (v, message) => { if (!v) throw new Error(message); };
async function until(check, message, timeout = 25000) { const end = performance.now() + timeout; while (!check()) { if (performance.now() > end) throw new Error(message); await sleep(25); } }
const doc = (f = frame) => f.contentDocument, metric = (f = frame) => doc(f)?.querySelector('[data-venue-metrics]');
let state;
async function read() { state = (await (await fetch(root)).json()).state; return state; }
const button = (text, f = frame) => [...doc(f).querySelectorAll('button')].find(b => b.textContent.trim() === text);
async function synced() { for (const f of [frame, peer]) doc(f)?.querySelector('.sync-icon')?.click(); await until(() => [frame, peer].every(f => Number(metric(f)?.dataset.recordRevision) === state.revision), '两端没有同步到最新事实'); }
async function command(command) { await read(); const r = await fetch(`${root}/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, commandId: crypto.randomUUID(), expectedRevision: state.revision, expectedGeneration: state.generation, command }) }); const j = await r.json(); assert(r.ok, JSON.stringify(j)); state = j.state; await synced(); }
function click(selector) { const el = doc().querySelector(selector); assert(el, `缺少入口 ${selector}`); el.click(); }
const seat = (court, slot) => `.game-position[aria-label^="${court} 号场"][aria-label$="${slot}"]`;
await fetch('/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
await fetch('/api/local/initialize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId }) });
await read(); assert(state.ruleVersion === 2 && state.revision === 0, '请使用新的独立活动，不能重置已有活动');
frame.src = `/?event=${eventId}&venueMetrics=1`; peer.src = `/?event=${eventId}&venueMetrics=1`;
await until(() => metric() && metric(peer), '球馆尚未载入');
const transport = frame.contentWindow.fetch.bind(frame.contentWindow);
frame.contentWindow.fetch = (input, init) => { requests.push({ path: String(input), method: init?.method ?? 'GET' }); return transport(input, init); };
const peerFetch = peer.contentWindow.fetch.bind(peer.contentWindow);
const peerRole = (await (await peerFetch('/api/setup', { credentials: 'omit' })).json()).role; assert(peerRole === 'guest', '第二客户端不是匿名访客');
peer.contentWindow.fetch = (input, init) => peerFetch(input, { ...init, credentials: 'omit' });
output.textContent = '准备完成';

const actor = id => doc().querySelector(`[data-player-id="${id}"]`).closest('.projected-label');
const point = text => text.split(',').map(Number);
const distance = (a,b) => Math.hypot(a[0]-b[0],a[2]-b[2]);
async function track(id, action) {
  const start=point(actor(id).dataset.worldPosition), travelled=Number(actor(id).dataset.travelled), samples=[];
  const task=action(); let began=false, done=false;
  for(let i=0;i<1200;i++) {
    samples.push(point(actor(id).dataset.worldPosition)); const walking=actor(id).dataset.walking==='true'; began ||= walking;
    if(began&&!walking){done=true;break;} await sleep(20);
  }
  await task; assert(done,'人物没有完成转场 '+JSON.stringify({began,start,target:actor(id).dataset.targetPosition,pose:actor(id).dataset.worldPosition,walking:actor(id).dataset.walking,frames:samples.length,active:metric().dataset.localAnimationActive,hidden:doc().hidden,travelled:actor(id).dataset.travelled,initialTravelled:travelled}));
  const target=point(actor(id).dataset.targetPosition), length=Number(actor(id).dataset.travelled)-travelled, direct=distance(start,target);
  const deviation=Math.max(...samples.map(p=>direct ? Math.abs((p[0]-start[0])*(target[2]-start[2])-(p[2]-start[2])*(target[0]-start[0]))/direct : 0));
  assert(deviation<.14,`直线有额外折返 ${deviation}`); assert(Math.abs(length-direct)<.18,`未按最短路线到位 ${length}/${direct}`);
  return {id,start,target,length,direct,deviation,samples:samples.length};
}
async function choose(id) {
  click(seat(1,'WHITE-1')); await until(()=>doc().querySelector(`[data-picker-player="${id}"]`),'没有候选头像'); await sleep(60);
  return track(id,()=>click(`[data-picker-player="${id}"]`));
}
async function leave(id) {
  // The simulated peer move changed revision; reacquire the UI basis before a new write.
  const cancel=doc().querySelector('[aria-label="取消选择球友"]'); if(cancel){cancel.click();await until(()=>!doc().querySelector('.game-selection-bar'),'旧选择未清除');}
  click(`[data-player-id="${id}"]`); await until(()=>doc().querySelector('.return-player'),'没有回候场入口');
  await sleep(60); return track(id,()=>doc().querySelector('.return-player').click());
}
document.querySelector('#run').onclick=async()=>{
 try {
  await command({type:'OpenFirstRound'});
  const flights=[]; flights.push(await choose('B01')); await read(); await synced();
  // Keep the actor still before recording the cross-net flight.
  click('[data-player-id="B01"]'); await until(()=>doc().querySelector('.game-selection-bar'),'未选中 Sophia'); await sleep(60);
  flights.push(await track('B01',()=>command({type:'MovePlayer',fromMatchId:'M-R01-C01',fromSlotId:'WHITE-1',matchId:'M-R01-C01',slotId:'BLACK-1',playerId:'B01'})));
  assert(flights[1].start[2]*flights[1].target[2]<0,'没有跨网飞行');
  const oldHome=flights[0].start, exit=await leave('B01'); await read(); await synced();
  assert(distance(exit.start,exit.target)<distance(exit.start,oldHome)-1,'Sophia 仍回原候场位置');
  assert(Math.abs(Math.abs(exit.target[2])-8.4)<.001,'Sophia 未返回前后候场排');
  const walk=await choose('W02'); await read(); await synced(); const walkExit=await leave('W02'); await read(); await synced();
  assert(distance(walkExit.start,walkExit.target)<distance(walkExit.start,walk.start)-.5,'普通选手未就近下场');
  assert(distance(exit.target,walkExit.target)>2.79,'两名下场人物重叠');
  assert(doc().querySelectorAll('[data-player-id]').length===13,'重复或缺失人物');
  const before=requests.length; await sleep(2400); const idle=requests.slice(before); assert(idle.every(r=>r.method==='GET')&&idle.length<=3,'动画新增了同步请求');
  button('赛程').click(); await until(()=>metric().dataset.localAnimationActive==='false','离开球馆未暂停'); doc().querySelector('[aria-label="关闭面板"]').click();
  await until(()=>metric().dataset.localAnimationActive==='true','返回未恢复');
  click(seat(1,'WHITE-1')); await until(()=>doc().querySelector('[data-picker-player="B01"]'),'缺少 Sophia 头像');
  assert(!doc().querySelector('[data-picker-player="B01"] ellipse[cy="6"]'),'头像仍有光环');
  for(const [width,height] of [[320,568],[390,844]]) {
   frame.style.width=`${width}px`;frame.style.height=`${height}px`;await sleep(250);
   const target=doc().querySelector('[data-player-id="B01"]');assert(target.getBoundingClientRect().height>=44,'下场姓名触区过小');
  }
  output.textContent=JSON.stringify({ok:true,eventId,revision:state.revision,peerRole,flights,exit,walk,walkExit,idleRequests:idle.length,animationWrites:0,actors:13,pauseResume:true,portraitHalo:false},null,2);
 } catch(e){output.textContent=JSON.stringify({ok:false,error:String(e),revision:state?.revision},null,2);}
};
