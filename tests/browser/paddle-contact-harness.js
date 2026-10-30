const frame=document.querySelector('#primary'),peer=document.querySelector('#peer'),output=document.querySelector('#result');
const eventId=new URLSearchParams(location.search).get('event');
if(!['127.0.0.1','localhost'].includes(location.hostname)||!eventId?.startsWith('local-'))throw new Error('Local rehearsal only');
const root='/api/events/'+eventId,matchId='M-R01-C01',checks=[],requests=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(v,m)=>{if(!v)throw new Error(m);};
const doc=(f=frame)=>f.contentDocument,metric=(f=frame)=>doc(f)?.querySelector('[data-venue-metrics]');
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const point=s=>s?.split(',').map(Number);
async function until(f,m,timeout=30000){const end=performance.now()+timeout;while(!f()){if(performance.now()>end)throw new Error(m);await sleep(25);}}
let state;
async function read(){state=(await(await fetch(root)).json()).state;return state;}
async function sync(){for(const f of[frame,peer])doc(f)?.querySelector('.sync-icon')?.click();await until(()=>[frame,peer].every(f=>Number(metric(f)?.dataset.recordRevision)===state.revision),'两端未同步');}
async function command(command){await read();const r=await fetch(root+'/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId,commandId:crypto.randomUUID(),expectedRevision:state.revision,expectedGeneration:state.generation,command})});const j=await r.json();assert(r.ok,JSON.stringify(j));state=j.state;await sync();}
const label=id=>doc().querySelector('[data-player-id="'+id+'"]')?.closest('.projected-label');
async function balls(count){await until(()=>Number(metric().dataset.localBallCount)===count&&![...doc().querySelectorAll('.game-player-label')].some(n=>n.closest('.projected-label').dataset.walking==='true'),'球数或到位状态错误');}
async function sample(seconds,expected,ids){
  await balls(expected);const outgoing=[],incoming=[],sources=new Set(),end=performance.now()+seconds*1000,before=requests.length;
  while(performance.now()<end){
    const poses=JSON.parse(metric().dataset.localBalls??'[]');assert(poses.length===expected,'旧球或重复球');
    for(const b of poses){
      if(b.phase<.025&&b.impact){const actual=point(label(b.source)?.dataset.paddleCenter);if(actual?.length===3){outgoing.push(distance(actual,b.impact.center));sources.add(b.source);}}
      if(b.phase>.985){const actual=point(label(b.receiver)?.dataset.paddleCenter);if(actual?.length===3)incoming.push(Math.abs(distance(actual,b.position)-.105));}
    }
    await new Promise(r=>frame.contentWindow.requestAnimationFrame(r));
  }
  assert(outgoing.length>=4&&incoming.length>=3,'接触采样不足 '+JSON.stringify({outgoing:outgoing.length,incoming:incoming.length}));
  const maxOut=Math.max(...outgoing),maxIn=Math.max(...incoming);
  assert(maxOut<.08,'球拍与出球点漂移 '+maxOut);assert(maxIn<.17,'来球没有接到拍面 '+maxIn);
  assert(ids.every(id=>sources.has(id)),'有人没有参与击球');
  assert(!requests.slice(before).some(r=>r.method!=='GET'),'动画产生写入');
  return{seconds,balls:expected,sources:[...sources],outgoingSamples:outgoing.length,incomingSamples:incoming.length,maxOut,maxIn};
}
await fetch('/signin-with-chatgpt?return_to=/',{redirect:'manual'});
await fetch('/api/local/initialize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId})});
await read();assert(state.revision===0&&state.ruleVersion===2,'请使用新活动，不重置既有记录');
frame.src='/?event='+eventId+'&venueMetrics=1';peer.src='/?event='+eventId+'&venueMetrics=1';
await until(()=>metric()&&metric(peer),'球馆未加载');
const transport=frame.contentWindow.fetch.bind(frame.contentWindow);
frame.contentWindow.fetch=(input,init)=>{requests.push({path:String(input),method:init?.method??'GET'});return transport(input,init);};
const anonymous=peer.contentWindow.fetch.bind(peer.contentWindow);peer.contentWindow.fetch=(input,init)=>anonymous(input,{...init,credentials:'omit'});
output.textContent='准备完成';
document.querySelector('#run').onclick=async()=>{
 try{
  await command({type:'OpenFirstRound'});
  for(const [slotId,playerId]of[['WHITE-1','W02'],['WHITE-2','W04'],['BLACK-1','B03'],['BLACK-2','B07']])await command({type:'AssignPlayer',matchId,slotId,playerId});
  checks.push({case:'四人双球热身',...await sample(8,2,['W02','W04','B03','B07'])});
  await command({type:'RemovePlayer',matchId,slotId:'WHITE-2'});await balls(1);
  const target=point(label('W04').dataset.targetPosition);assert(Math.abs(Math.abs(target[2])-8.4)<.001,'下场停在场间');
  const visible=point(label('W04').dataset.worldPosition);assert(Math.abs(Math.abs(visible[2])-8.4)<.6,'没有走到候场排');
  checks.push({case:'三人一对二热身与两排下场',target,...await sample(6,1,['W02','B03','B07'])});
  await command({type:'AssignPlayer',matchId,slotId:'WHITE-2',playerId:'W04'});
  await command({type:'RemovePlayer',matchId,slotId:'BLACK-2'});await command({type:'AssignPlayer',matchId,slotId:'BLACK-2',playerId:'B01'});
  checks.push({case:'Sophia 悬浮拍面与双球',...await sample(7,2,['W02','W04','B03','B01'])});
  await command({type:'StartMatch',matchId});
  checks.push({case:'比赛单球四人参与',...await sample(8,1,['W02','W04','B03','B01'])});
  const lineupRevisionId=state.matches.find(m=>m.id===matchId).activeLineupRevisionId;
  await command({type:'SubmitResult',matchId,lineupRevisionId,whiteScore:11,blackScore:8});await balls(0);
  assert(doc().querySelectorAll('.game-player-label').length===13,'重复角色');
  assert(!requests.some(r=>r.method==='POST'),'演出向服务端写入');
  output.textContent=JSON.stringify({ok:true,eventId,revision:state.revision,checks,actors:13,animationWrites:0,requests:requests.length,twoClients:true},null,2);
 }catch(error){output.textContent=JSON.stringify({ok:false,error:String(error),revision:state?.revision,checks},null,2);}
};
