
const frame=document.querySelector('iframe'), output=document.querySelector('#result');
const eventId=new URLSearchParams(location.search).get('event') || 'local-game-upgrade-20261030';
if(!['127.0.0.1','localhost'].includes(location.hostname)||!eventId.startsWith('local-')) throw new Error('仅允许本地隔离活动');
frame.src=`/?event=${encodeURIComponent(eventId)}&venueMetrics=1`;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const doc=()=>frame.contentDocument, win=()=>frame.contentWindow;
const metric=()=>doc().querySelector('[data-venue-metrics]');
const pose=()=>Object.fromEntries(['cameraPitch','cameraYaw','renderZoom','recordRevision'].map(k=>[k,Number(metric().dataset[k])]));
async function until(check,message,timeout=8000){const end=performance.now()+timeout;while(!check()){if(performance.now()>end)throw new Error(message);await sleep(30);}}
async function painted(){await new Promise(resolve=>win().requestAnimationFrame(()=>win().requestAnimationFrame(resolve)));}
async function home(){doc().querySelector('[aria-label="Sophia 球馆总览"]').click();await painted();await until(()=>metric()?.dataset.cameraMoving==='false','镜头未停止');await sleep(100);}
function emit(type,id,x,y,target=doc().querySelector('canvas')){target.dispatchEvent(new (win().PointerEvent)(type,{bubbles:true,pointerId:id,pointerType:'touch',isPrimary:id===1,clientX:x,clientY:y,buttons:type==='pointerup'?0:1,button:0}));}
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
async function run(task){for(const b of document.querySelectorAll('button'))b.disabled=true;output.textContent='运行中…';try{output.textContent=JSON.stringify(await task(),null,2)}catch(error){output.textContent='FAIL '+error.stack}finally{for(const b of document.querySelectorAll('button'))b.disabled=false}}
await until(()=>metric(),'球馆未加载');output.textContent='就绪。所有轨迹均检查记录版本不变。';
document.querySelector('#gestures').onclick=()=>run(async()=>{
 const checks=[];await home();const revision=pose().recordRevision;
 emit('pointerdown',1,25,350);emit('pointermove',1,26,350);await painted();const first=pose();
 assert(first.cameraYaw!==.071,'首像素未改变角度');
 emit('pointermove',1,26,450);await painted();const boundary=pose();
 emit('pointermove',1,26,449);await painted();const reversed=pose();
 assert(reversed.cameraPitch>boundary.cameraPitch,'边界反向未立即响应');
 emit('pointerup',1,36,439);await painted();const released=pose();await sleep(250);
 assert(released.cameraYaw!==reversed.cameraYaw&&released.cameraPitch>reversed.cameraPitch,'抬手末位置未消费');
 assert(JSON.stringify(pose())===JSON.stringify(released),'松手后漂移');assert(first.renderZoom===released.renderZoom,'旋转改变实际缩放');checks.push({case:'首像素/边界反向/抬手/停住',first,boundary,reversed,released});
 await home();const start=pose();emit('pointerdown',1,25,350);emit('pointermove',1,35,350);await painted();const beforeResize=pose();
 const labelBefore=doc().querySelector('[data-player-id=W01]').getBoundingClientRect();frame.style.height='644px';await sleep(150);const labelAfter=doc().querySelector('[data-player-id=W01]').getBoundingClientRect();assert(Math.abs(labelAfter.x-labelBefore.x)<.1&&Math.abs(labelAfter.y-labelBefore.y)<.1,'resize 在手势中移动了可见坐标系');emit('pointermove',1,45,350);await painted();const afterResize=pose();emit('pointerup',1,45,350);await painted();
 assert(Math.abs((start.cameraYaw-beforeResize.cameraYaw)-(beforeResize.cameraYaw-afterResize.cameraYaw))<.002,'resize 改变同一手势灵敏度');
 assert(Math.abs(start.renderZoom-pose().renderZoom)<.001,'resize 后实际 zoom 跳变');checks.push({case:'手势中 viewport resize',beforeResize,afterResize,settled:pose()});
 frame.style.height='844px';await sleep(150);await home();
 const beforePinch=pose();emit('pointerdown',1,30,350);emit('pointerdown',2,200,350);emit('pointermove',2,250,350);await painted();const pinch=pose();
 assert(pinch.renderZoom>beforePinch.renderZoom,'双指未放大');
 frame.style.height='700px';await sleep(120);emit('pointermove',2,260,350);await painted();const pinchResize=pose();
 assert(Object.values(pinchResize).every(Number.isFinite)&&pinchResize.renderZoom>pinch.renderZoom,'捏合 resize 失去有限连续姿态');
 emit('pointerup',2,260,350);await painted();const one=pose();emit('pointermove',1,110,400);emit('pointerup',1,110,400);await painted();
 assert(Math.abs(one.cameraYaw-pose().cameraYaw)<.001,'双指降一指误旋转');checks.push({case:'捏合/resize/交替抬指',beforePinch,pinch,pinchResize,after:pose()});
 frame.style.height='844px';await sleep(150);await home();
 for(const exit of ['pointercancel','lostpointercapture']){
   const person=doc().querySelector('[data-player-id="W01"]'),r=person.getBoundingClientRect();
   emit('pointerdown',1,r.x+r.width/2,r.y+r.height/2,person);emit('pointermove',1,180,400);emit(exit,1,180,400,doc().querySelector('.game-venue'));emit('pointerup',1,180,400);await painted();
   assert(pose().recordRevision===revision,exit+' 误提交');checks.push({case:exit,result:'取消无提交'});await home();
 }
 const person=doc().querySelector('[data-player-id="W01"]'),r=person.getBoundingClientRect();
 emit('pointerdown',1,r.x+r.width/2,r.y+r.height/2,person);emit('pointermove',1,180,400);emit('pointerdown',2,250,400,doc().querySelector('.world-scoreboard'));
 emit('pointerup',1,180,400);emit('pointermove',2,280,450);emit('pointerup',2,280,450);await painted();assert(pose().recordRevision===revision,'多指误提交人物');checks.push({case:'拖人时第二指落在记分牌',result:'取消无提交'});
 await home();const toy=doc().querySelector('[data-scene-play="ball"]'),tr=toy.getBoundingClientRect();emit('pointerdown',1,tr.x+20,tr.y+20,toy);emit('pointermove',1,tr.x+60,tr.y+20,toy);emit('pointerup',1,tr.x+60,tr.y+20,toy);toy.dispatchEvent(new(win().MouseEvent)('click',{bubbles:true,detail:1,clientX:tr.x+60,clientY:tr.y+20}));await painted();assert(toy.dataset.active==='false','划动误触玩具');checks.push({case:'从玩具按钮滑动',result:'相机可转、无彩蛋'});
 await home();const layer=doc().querySelector('.projected-labels');
 doc().querySelector('[data-player-id="W07"]').scrollIntoView({block:'center'});await painted();
 assert(layer.scrollTop===0&&layer.scrollLeft===0,'聚焦滚动使 DOM 标签脱离 3D 坐标');
 checks.push({case:'姓名层不可被聚焦自动滚动',result:'投影层偏移保持零'});
 assert(pose().recordRevision===revision,'回归脚本改变赛事');await home();return {status:'PASS',checks,revision};
});
document.querySelector('#recovery').onclick=()=>run(async()=>{
 await home();const before=pose();const canvas=doc().querySelector('canvas');const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');const extension=gl.getExtension('WEBGL_lose_context');
 assert(extension,'WebGL context loss extension unavailable');emit('pointerdown',1,25,350);emit('pointermove',1,60,350);extension.loseContext();
 await until(()=>doc().querySelector('.context-notice'),'未出现恢复提示');await sleep(100);extension.restoreContext();
 await until(()=>!doc().querySelector('.context-notice'),'未恢复场景',10000);await sleep(500);emit('pointerup',1,180,400);await painted();
 assert(pose().recordRevision===before.recordRevision,'WebGL恢复改变赛事记录');assert(doc().querySelectorAll('[data-player-id]').length===14,'人物未完整重建');assert(Object.values(pose()).every(Number.isFinite),'恢复姿态异常');
 return {status:'PASS',before,after:pose(),players:14};
});
document.querySelector('#metrics').onclick=()=>{output.textContent=JSON.stringify({pose:pose(),performance:JSON.parse(metric().dataset.performance||'{}')},null,2)};
