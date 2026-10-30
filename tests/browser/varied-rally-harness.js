const frame=document.querySelector('#primary'),peer=document.querySelector('#peer'),output=document.querySelector('#result');
const eventId=new URLSearchParams(location.search).get('event');if(!['127.0.0.1','localhost'].includes(location.hostname)||!eventId?.startsWith('local-'))throw new Error('Local rehearsal only');
const root='/api/events/'+eventId,checks=[],requests=[],sleep=ms=>new Promise(r=>setTimeout(r,ms)),doc=(f=frame)=>f.contentDocument;
const assert=(v,m)=>{if(!v)throw new Error(m);},metric=(f=frame)=>doc(f)?.querySelector('[data-venue-metrics]'),label=(id,f=frame)=>doc(f).querySelector('[data-player-id="'+id+'"]')?.closest('.projected-label'),point=s=>s?.split(',').map(Number),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
async function until(f,m,timeout=30000){const end=performance.now()+timeout;while(!f()){if(performance.now()>end)throw new Error(m);await sleep(30);}}
let state;
async function read(){state=(await(await fetch(root)).json()).state;return state;}
async function sync(){for(const f of[frame,peer])doc(f)?.querySelector('.sync-icon')?.click();await until(()=>[frame,peer].every(f=>Number(metric(f)?.dataset.recordRevision)===state.revision),'两端不同步');}
async function command(command){await read();const r=await fetch(root+'/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId,commandId:crypto.randomUUID(),expectedRevision:state.revision,expectedGeneration:state.generation,command})});const j=await r.json();assert(r.ok,JSON.stringify(j));state=j.state;await sync();}
function button(text){return[...doc().querySelectorAll('button')].find(b=>b.textContent.trim()===text);}
function emit(type,id,x,y,target){target.dispatchEvent(new frame.contentWindow.PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y}));}
await fetch('/signin-with-chatgpt?return_to=/',{redirect:'manual'});await fetch('/api/local/initialize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId})});await read();assert(state.revision===0,'使用新的独立活动，不重置旧演练');
frame.src='/?event='+eventId+'&venueMetrics=1';peer.src='/?event='+eventId+'&venueMetrics=1';await until(()=>metric()&&metric(peer),'球馆未加载');
const native=frame.contentWindow.fetch.bind(frame.contentWindow);frame.contentWindow.fetch=(input,init)=>{requests.push({path:String(input),method:init?.method??'GET'});return native(input,init);};
const anonymous=peer.contentWindow.fetch.bind(peer.contentWindow);peer.contentWindow.fetch=(input,init)=>anonymous(input,{...init,credentials:'omit'});await sync();output.textContent='准备完成';
document.querySelector('#run').onclick=async()=>{try{
 const matchId='M-R01-C01';await command({type:'OpenFirstRound'});
 for(const[slotId,playerId]of[['WHITE-1','W02'],['WHITE-2','W04'],['BLACK-1','B03'],['BLACK-2','B07']])await command({type:'AssignPlayer',matchId,slotId,playerId});
 await until(()=>Number(metric().dataset.localBallCount)===2,'热身没有两球');await command({type:'StartMatch',matchId});
 await until(()=>Number(metric().dataset.localBallCount)===1&&![...doc().querySelectorAll('.game-player-label')].some(n=>n.closest('.projected-label').dataset.walking==='true'),'没有进入单球比赛');
 const roster=state.matches[0].draftSlots.map(s=>s.playerId),bench=state.players.filter(p=>!roster.includes(p.id)).map(p=>p.id),before=JSON.stringify(state),moves=Object.fromEntries(bench.map(id=>[id,0])),routes=[],bounces=[],requestsBegin=requests.length;
 let lastPhase=2,low=null,peerDiff=0,walkers=new Set(),rests=new Set();const end=performance.now()+32000;
 while(performance.now()<end){
  const balls=JSON.parse(metric().dataset.localBalls??'[]');assert(balls.length===1,'比赛出现重复球');const ball=balls[0];
  if(ball.phase<lastPhase){routes.push([ball.source,ball.receiver]);if(low)bounces.push(low);low=null;}
  if(!low||ball.position[1]<low[1])low=ball.position;lastPhase=ball.phase;
  for(const id of bench){const l=label(id),at=point(l.dataset.worldPosition),base=point(l.dataset.targetPosition);moves[id]=Math.max(moves[id],Math.hypot(at[0]-base[0],at[2]-base[2]));assert(Math.abs(at[0])<=13.51&&Math.abs(at[2])>=7.59&&Math.abs(at[2])<=10.21,'场下角色走入球场或越界 '+id+':'+at);if(l.dataset.ambientWalking==='true')walkers.add(id);else rests.add(id);const other=point(label(id,peer)?.dataset.worldPosition);if(other)peerDiff=Math.max(peerDiff,distance(at,other));}
  assert(doc().querySelectorAll('.game-player-label').length===13,'重复或缺少角色');await new Promise(r=>frame.contentWindow.requestAnimationFrame(r));
 }
 const routeKinds=new Set(routes.map(p=>p.join(':'))),depths=bounces.map(p=>Math.abs(p[2]));
 assert(routeKinds.size>=5,'接球搭档仍是固定线路 '+JSON.stringify([...routeKinds]));assert(new Set(routes.map(p=>p[0])).size===4,'有人没有击球');
 assert(Math.max(...depths)-Math.min(...depths)>.4,'落点深浅没有变化');assert(Object.values(moves).filter(n=>n>1.1).length>=bench.length/2,'场下仍只在原位小幅活动');assert(walkers.size>=bench.length/2&&rests.size===bench.length,'走动或停留缺失');assert(peerDiff>.3,'不同浏览器没有本机节奏');
 checks.push({case:'32秒随机单球与真实场外走停',routeKinds:[...routeKinds],hits:routes.length,depthRange:[Math.min(...depths),Math.max(...depths)],bench,moves,walkers:[...walkers],peerDiff});
 const moving=bench.find(id=>label(id).dataset.ambientWalking==='true');assert(moving,'没有可检查的走动选手');const player=doc().querySelector('[data-player-id="'+moving+'"]'),r=player.getBoundingClientRect();
 emit('pointerdown',91,r.x+r.width/2,r.y+r.height/2,player);await sleep(100);const frozen=label(moving).dataset.worldPosition;await sleep(500);assert(label(moving).dataset.worldPosition===frozen&&label(moving).dataset.localHeld==='true','按下后仍移动');
 emit('pointerup',91,r.x+r.width/2,r.y+r.height/2,doc().querySelector('.game-venue'));await until(()=>doc().querySelector('.game-selection-bar'),'走动球友不能选中');await sleep(450);assert(label(moving).dataset.worldPosition===frozen,'选中仍漂移');doc().querySelector('[aria-label="取消选择球友"]').click();
 doc().querySelector('[aria-label="更多选项"]').click();await until(()=>button('暂停场景动画'),'无暂停');button('暂停场景动画').click();await until(()=>metric().dataset.localAnimationActive==='false','暂停无效');await sleep(80);const paused=label(moving).dataset.worldPosition;await sleep(450);assert(label(moving).dataset.worldPosition===paused&&Number(metric().dataset.localBallCount)===0,'暂停后仍运动');
 doc().querySelector('[aria-label="更多选项"]').click();await until(()=>button('恢复场景动画'),'无恢复');button('恢复场景动画').click();await until(()=>Number(metric().dataset.localBallCount)===1,'恢复重复或丢球');
 const traffic=requests.slice(requestsBegin);assert(!traffic.some(r=>r.method!=='GET')&&traffic.length<=30,'动画增加写入或额外轮询');await read();assert(JSON.stringify(state)===before,'本机动画修改了比赛记录');
 checks.push({case:'触屏按下与点选稳定、暂停恢复、双端阵容相同、无动画写入',selected:moving,requests:traffic.length,animationWrites:0,actors:13});
 output.textContent=JSON.stringify({ok:true,eventId,revision:state.revision,checks,twoClients:true},null,2);
}catch(error){output.textContent=JSON.stringify({ok:false,error:String(error),revision:state?.revision,checks},null,2);}};
