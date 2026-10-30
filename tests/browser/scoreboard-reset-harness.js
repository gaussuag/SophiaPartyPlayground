const frame=document.querySelector('#primary'),peer=document.querySelector('#peer'),output=document.querySelector('#result');
const eventId=new URLSearchParams(location.search).get('event');
if(!['127.0.0.1','localhost'].includes(location.hostname)||!eventId?.startsWith('local-'))throw new Error('Local rehearsal only');
const root='/api/events/'+eventId,checks=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(v,m)=>{if(!v)throw new Error(m);},doc=(f=frame)=>f.contentDocument,metrics=f=>doc(f)?.querySelector('[data-venue-metrics]');
async function until(f,m,timeout=30000){const end=performance.now()+timeout;while(!f()){if(performance.now()>end)throw new Error(m);await sleep(30);}}
let state;
async function read(){state=(await(await fetch(root)).json()).state;return state;}
async function synced(){for(const f of [frame,peer])doc(f)?.querySelector('.sync-icon')?.click();await until(()=>[frame,peer].every(f=>Number(metrics(f)?.dataset.recordRevision)===state.revision),'两客户端未同步');}
async function command(command){await read();const r=await fetch(root+'/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId,commandId:crypto.randomUUID(),expectedRevision:state.revision,expectedGeneration:state.generation,command})});const j=await r.json();assert(r.ok,JSON.stringify(j));state=j.state;await synced();}
const button=(text,f=frame)=>[...doc(f).querySelectorAll('button')].find(b=>b.textContent.trim()===text);
await fetch('/signin-with-chatgpt?return_to=/',{redirect:'manual'});
await fetch('/api/local/initialize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId})});
await read();assert(state.revision===0,'使用新的隔离活动，不能重置旧活动');
frame.src='/?event='+eventId+'&venueMetrics=1';peer.src='/?event='+eventId+'&venueMetrics=1';
await until(()=>metrics(frame)&&metrics(peer),'球馆未加载');
const anonymous=peer.contentWindow.fetch.bind(peer.contentWindow);peer.contentWindow.fetch=(input,init)=>anonymous(input,{...init,credentials:'omit'});await synced();
output.textContent='准备完成';
document.querySelector('#boards').onclick=async()=>{try{
 await command({type:'OpenFirstRound'});
 for(const [court,ids,scores]of [['C01',['W02','W04','B03','B07'],[15,11]],['C02',['W01','W03','B02','B04'],[11,15]],['C03',['W06','B05'],[99,98]]]){
  const matchId='M-R01-'+court;
  for(const [i,slot]of state.matches.find(m=>m.id===matchId).draftSlots.entries())await command({type:'AssignPlayer',matchId,slotId:slot.id,playerId:ids[i]});
  await command({type:'StartMatch',matchId});await command({type:'SubmitResult',matchId,lineupRevisionId:state.matches.find(m=>m.id===matchId).activeLineupRevisionId,whiteScore:scores[0],blackScore:scores[1]});
 }
 const sizes=[];
 for(const [width,height]of [[320,568],[390,844],[430,932],[1365,892]]){
  frame.style.width=width+'px';frame.style.height=height+'px';await sleep(400);
  const boards=[...doc().querySelectorAll('.board-result')].map(r=>{const range=doc().createRange();range.selectNodeContents(r);const text=range.getBoundingClientRect(),box=r.getBoundingClientRect();return{text:r.textContent,available:box.width,needed:r.scrollWidth,range:text.width,textHeight:text.height,height:r.closest('button').getBoundingClientRect().height};});
  sizes.push({width,height,boards});assert(boards.length===3,'缺少三个赛果牌');
  assert(boards.every(b=>b.available>=38&&b.textHeight>=11&&b.needed<=b.available+1&&b.range<=b.available+1&&b.height>=44),'两位数比分被裁切 '+JSON.stringify(sizes));
 }
 checks.push({case:'两位数比分完整、三个牌子与44px触区',sizes});output.textContent=JSON.stringify({ok:true,eventId,revision:state.revision,checks},null,2);
}catch(error){output.textContent=JSON.stringify({ok:false,error:String(error),revision:state?.revision,checks},null,2);}};

document.querySelector('#reset').onclick=async()=>{try{
 await read();assert(state.results.length===3,'先完成比分牌检查');
 const previous=JSON.stringify(state),generation=state.generation;
 const stale=JSON.stringify({commandId:crypto.randomUUID(),expectedRevision:state.revision,expectedGeneration:state.generation,confirmEventId:eventId,maintenance:true});
 const denied=await fetch(root+'/reset',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:stale});assert(denied.status===401,'匿名可重置');
 doc(peer).querySelector('[aria-label="更多选项"]').click();await sleep(100);assert(!button('重置比赛数据',peer),'匿名显示管理员入口');doc(peer).querySelector('[aria-label="关闭面板"]').click();
 frame.style.width='390px';frame.style.height='844px';await sleep(150);
 doc().querySelector('[aria-label="更多选项"]').click();await until(()=>button('重置比赛数据'),'管理员没有重置入口');button('重置比赛数据').click();
 await until(()=>button('确认清空并重新开始'),'没有明确重置确认');assert(doc().querySelector('dialog').textContent.includes('重置前备份'),'未说明恢复路径');
 // Cancel is read-only and must not clear any result.
 button('返回核对').click();await read();assert(JSON.stringify(state)===previous,'取消也清空了记录');
 doc().querySelector('[aria-label="更多选项"]').click();await until(()=>button('重置比赛数据'),'重置入口丢失');button('重置比赛数据').click();
 await until(()=>button('确认清空并重新开始'),'没有确认');button('确认清空并重新开始').click();
 await until(()=>!doc().querySelector('dialog'),'重置没有结束');await read();await synced();
 assert(state.generation===generation+1&&state.phase==='PREPARED'&&state.results.length===0&&state.lineups.length===0&&state.matches.every(m=>m.draftSlots.every(s=>!s.playerId)),'重置事实不完整');
 assert(doc().querySelectorAll('.game-player-label').length===13&&doc(peer).querySelectorAll('.game-player-label').length===13,'重置后有重复人物');
 assert(!doc().querySelector('.board-result')&&!doc(peer).querySelector('.board-result'),'旧比分牌残留');
 const old=await fetch(root+'/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:stale});assert(old.status===409,'旧版本重置被重放');
 const recovery=await(await fetch(root+'/backup?beforeRestore=1')).json();const prior=JSON.parse(previous);
 assert(JSON.stringify(recovery.aggregate.state.results.map(r=>{const value={...r};delete value.actorId;return value;}))===JSON.stringify(prior.results),'重置前赛果未备份');
 assert(recovery.aggregate.state.revision===prior.revision,'备份版本错误');
 const restore=await fetch(root+'/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commandId:crypto.randomUUID(),expectedRevision:state.revision,expectedGeneration:state.generation,confirmEventId:eventId,maintenance:true,backup:recovery})});assert(restore.ok,'重置前备份不能恢复');await read();await synced();
 assert(state.results.length===3&&state.generation===generation+2,'没有恢复三场赛果');
 checks.push({case:'匿名401与无入口、取消不写入、管理员菜单确认、原子重置、双端刷新、旧版本409、备份恢复',revision:state.revision,generation:state.generation});
 output.textContent=JSON.stringify({ok:true,eventId,revision:state.revision,twoClients:true,checks},null,2);
}catch(error){output.textContent=JSON.stringify({ok:false,error:String(error),revision:state?.revision,checks},null,2);}};
