const frame = document.querySelector('#primary'), output = document.querySelector('#park-result');
const eventId = new URLSearchParams(location.search).get('event');
if (!['127.0.0.1', 'localhost'].includes(location.hostname) || !eventId?.startsWith('local-')) throw new Error('Local rehearsal only');
const pause = ms => new Promise(r => setTimeout(r, ms));
const assert = (v, m) => { if (!v) throw new Error(m); };
const doc = () => frame.contentDocument, metric = () => doc()?.querySelector('[data-venue-metrics]');
const until = async (f, message) => { const end = performance.now() + 20000; while (!f()) { if (performance.now() > end) throw new Error(message); await pause(30); } };
function emit(type, id, x, y) { doc().querySelector('.game-venue').dispatchEvent(new frame.contentWindow.PointerEvent(type, { bubbles:true, pointerId:id, pointerType:'touch', isPrimary:id===71, clientX:x, clientY:y, buttons:type==='pointerup'?0:1, button:0 })); }
const click = label => { const b = doc().querySelector('[aria-label="'+label+'"]'); assert(b, '缺少 '+label); b.click(); };
document.querySelector('#park').onclick = async () => {
  const checks = [], requests = [];
  try {
    assert(JSON.parse(document.querySelector('#result').textContent).ok, '请先完成业务回归');
    const transport = frame.contentWindow.fetch.bind(frame.contentWindow);
    frame.contentWindow.fetch = (input, init) => { requests.push({ path:String(input), method:init?.method??'GET' }); return transport(input, init); };
    const revision = metric().dataset.recordRevision, world = metric().dataset.worldLayout, sizes = [];
    for (const [width,height] of [[320,568],[390,600],[390,844],[430,932],[844,390],[1280,720]]) {
      frame.style.width=width+'px'; frame.style.height=height+'px'; click('Sophia 球馆总览');
      await pause(300); await until(()=>metric().dataset.cameraMoving==='false','全景未完成');
      assert(metric().dataset.worldLayout===world, '环境改动重排了球场');
      assert(doc().querySelectorAll('.game-player-label').length===13, '人数改变或角色重复');
      const calls=Number(metric().dataset.drawCalls), triangles=Number(metric().dataset.triangles);
      assert(calls<240&&triangles<40000,'环境超出绘制预算');
      assert([...doc().querySelectorAll('.game-player-label')].every(n=>n.getBoundingClientRect().height>=44),'人物触区缩小');
      sizes.push({width,height,calls,triangles});
    }
    checks.push('六种视口，三片场地坐标不变，13 人及 44px 姓名触区，绘制预算');
    frame.style.width='390px'; frame.style.height='844px'; await pause(350);
    click('Sophia 球馆总览'); await until(()=>metric().dataset.cameraMoving==='false','回正未完成');
    const yaw=Number(metric().dataset.cameraYaw);
    emit('pointerdown',71,180,500); emit('pointermove',71,270,500); emit('pointerup',71,270,500); await pause(300);
    assert(Math.abs(Number(metric().dataset.cameraYaw)-yaw)>.2,'单指旋转未响应');
    const zoom=Number(metric().dataset.cameraZoom);
    emit('pointerdown',71,110,500); emit('pointerdown',72,250,500); emit('pointermove',72,300,500); emit('pointerup',72,300,500); emit('pointerup',71,110,500); await pause(300);
    assert(Number(metric().dataset.cameraZoom)>zoom,'双指放大未响应');
    assert(metric().dataset.recordRevision===revision,'纯视角交互修改了比赛');
    checks.push('场景装饰不抢占单指旋转／双指缩放，不修改活动');
    click('更多选项'); await until(()=>doc().querySelector('.game-drawer[open]'),'菜单未开');
    [...doc().querySelectorAll('.game-tools button')].find(b=>b.textContent.includes('暂停场景动画')).click();
    await until(()=>metric().dataset.localAnimationActive==='false','暂停无效');
    await pause(400); const before=JSON.parse(metric().dataset.performance).frames; await pause(700); const after=JSON.parse(metric().dataset.performance).frames;
    assert(after-before<=3,'静态环境持续触发动画循环');
    click('更多选项'); await until(()=>doc().querySelector('.game-drawer[open]'),'菜单未开');
    [...doc().querySelectorAll('.game-tools button')].find(b=>b.textContent.includes('恢复场景动画')).click();
    await until(()=>metric().dataset.localAnimationActive==='true','恢复无效');
    assert(!requests.some(r=>r.method==='POST'),'环境／视角／暂停产生了写入请求');
    click('Sophia 球馆总览');
    output.textContent=JSON.stringify({ok:true,eventId,revision,checks,sizes,pauseFrames:after-before,requests:requests.length,posts:0},null,2);
  } catch(error) { output.textContent=JSON.stringify({ok:false,error:String(error),checks},null,2); }
};
