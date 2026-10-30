const frame = document.querySelector('#primary'), peer = document.querySelector('#peer'), output = document.querySelector('#result');
const eventId = new URLSearchParams(location.search).get('event');
if (!['127.0.0.1', 'localhost'].includes(location.hostname) || !eventId?.startsWith('local-')) throw new Error('仅限 loopback 独立活动');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function until(check, message, timeout = 12000) { const end = performance.now() + timeout; while (!check()) { if (performance.now() > end) throw new Error(message); await sleep(25); } }
const doc = () => frame.contentDocument, win = () => frame.contentWindow;
const metric = (target = frame) => target.contentDocument?.querySelector('[data-venue-metrics]');
const programmes = target => JSON.parse(metric(target).dataset.courtProgrammes);
const balls = target => JSON.parse(metric(target).dataset.localBalls);
const root = `/api/events/${eventId}`;
const checks = [], requests = [];
let state;
async function read() { state = (await (await fetch(root)).json()).state; return state; }
async function command(command) {
  await read(); const response = await fetch(`${root}/commands`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({eventId, commandId:crypto.randomUUID(), expectedRevision:state.revision, expectedGeneration:state.generation, command}) });
  const result = await response.json(); assert(response.ok, JSON.stringify(result.error)); state = result.state;
  for (const target of [frame, peer]) target.contentDocument?.querySelector('.sync-icon')?.click();
  await until(() => [frame, peer].every(f => Number(metric(f)?.dataset.recordRevision) === state.revision), '两端未读到最新版本');
}
await fetch('/signin-with-chatgpt?return_to=/', {redirect:'manual'}); await read();
// Use this harness's own newly initialized event, never a production event or reset.
if (state.phase === 'PREPARED') {
  const response = await fetch(`${root}/commands`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({eventId, commandId:crypto.randomUUID(), expectedRevision:state.revision, expectedGeneration:state.generation, command:{type:'OpenFirstRound'}})});
  assert(response.ok, '无法开放本地轮次'); await read();
}
frame.src = peer.src = `/?event=${encodeURIComponent(eventId)}&venueMetrics=1`;
await until(() => metric() && metric(peer), '场景未就绪');
const transport = win().fetch.bind(win());
win().fetch = (input, init) => { requests.push({at:performance.now(), method:init?.method ?? 'GET', path:String(input)}); return transport(input, init); };
const matchId = 'M-R01-C01';
const label = id => doc().querySelector(`[data-player-id="${id}"]`)?.closest('.projected-label');
async function settle(count) { await until(() => Number(metric().dataset.localBallCount) === count && !doc().querySelector('[data-walking="true"]'), `未稳定到 ${count} 球`); await sleep(80); }
async function seats(white, black) {
  await command({type:'CancelDraft',matchId});
  for (const side of ['WHITE','BLACK']) for (const slot of state.matches.find(m => m.id === matchId).draftSlots.filter(s => s.sideId === side).slice(0, side === 'WHITE' ? white : black)) {
    const used = state.matches.filter(m => m.roundId === state.activeRoundId).flatMap(m => m.draftSlots.map(s => s.playerId));
    const player = state.players.find(p => p.teamId === side && (!slot.gender || p.gender === slot.gender) && !used.includes(p.id));
    await command({type:'AssignPlayer',matchId,slotId:slot.id,playerId:player.id});
  }
  await settle(white && black ? white === 2 && black === 2 ? 2 : 1 : 0);
}
function emit(type, id, x, y, target) { target.dispatchEvent(new (win().PointerEvent)(type,{bubbles:true,pointerId:id,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,buttons:type==='pointerup'?0:1,button:0})); }
async function run(task) {
  for (const b of document.querySelectorAll('button')) b.disabled = true;
  output.textContent = '运行中…';
  try { await task(); output.textContent = JSON.stringify({status:'PASS', eventId, checks}, null, 2); }
  catch (error) { output.textContent = 'FAIL '+error.stack; }
  finally { for (const b of document.querySelectorAll('button')) b.disabled = false; }
}
output.textContent = '就绪。依次执行 1 → 5。';
document.querySelector('#rosters').onclick = () => run(async () => {
  for (const [white,black,count] of [[0,0,0],[1,0,0],[0,1,0],[1,1,1],[1,2,1],[2,1,1],[2,2,2]]) {
    await seats(white,black); assert(programmes()[0].ballCount === count, '计划球数错误');
    assert(doc().querySelectorAll('[data-player-id]').length === state.players.length, '人物重复或缺失');
    assert(programmes()[0].white.length === white && programmes()[0].black.length === black, '阵容不符');
    await until(() => Number(metric(peer).dataset.localBallCount) === count, '另一客户端球数不符');
    checks.push({case:`准备 ${white}v${black}`,balls:count,players:state.players.length});
  }
  await sleep(200); const a = balls(), b = balls(peer);
  assert(JSON.stringify(programmes()) === JSON.stringify(programmes(peer)), '两端真实阵容不一致');
  assert(JSON.stringify(a) !== JSON.stringify(b), '本地演出意外同步');
  await command({type:'StartMatch',matchId}); await settle(1);
  checks.push({case:'四人比赛单球；双客户端同阵容不同节奏',balls:Number(metric().dataset.localBallCount),programme:programmes()[0]});
  await command({type:'UndoStart',matchId,reason:'ACTUAL_NOT_STARTED'}); await settle(2);
  checks.push({case:'撤销误开赛重新双球热身，无旧球',balls:2});
});
document.querySelector('#lifecycle').onclick = () => run(async () => {
  await until(() => doc().querySelector('[data-ambient-walking="true"]'), '未观察到场下走动');
  const moving = doc().querySelector('[data-ambient-walking="true"]'), player = moving.querySelector('[data-player-id]'), rect = player.getBoundingClientRect(), id = player.dataset.playerId;
  const original = moving.dataset.worldPosition;
  emit('pointerdown',1,rect.x+rect.width/2,rect.y+rect.height/2,player); await sleep(450);
  assert(label(id).dataset.worldPosition === original && label(id).dataset.localHeld === 'true', '按住时角色或名字漂移');
  emit('pointerup',1,rect.x+rect.width/2,rect.y+rect.height/2,doc().querySelector('.game-venue')); await sleep(100);
  assert(doc().querySelector('.game-selection-bar strong')?.textContent === state.players.find(p => p.id === id).name, '走动角色无法选中');
  doc().querySelector('[aria-label="取消选择球友"]')?.click();
  const begin = requests.length; await sleep(4200); const sample = requests.slice(begin);
  assert(sample.every(r => r.method === 'GET') && sample.length <= 4, '动画引入额外写入或密集请求');
  checks.push({case:'候场按下冻结、松开可选；4.2 秒动画请求',sample});
  for (let i=0;i<3;i++) {
    doc().querySelector('[aria-label="更多选项"]').click(); await until(() => doc().querySelector('.game-drawer[open]'), '菜单未打开');
    await until(() => metric().dataset.localAnimationActive === 'false', '面板打开仍演出');
    doc().querySelector('[aria-label="关闭面板"]').click(); await settle(2);
  }
  doc().querySelector('[aria-label="更多选项"]').click(); await sleep(80);
  [...doc().querySelectorAll('.game-tools button')].find(b => b.textContent.includes('暂停场景动画')).click();
  await until(() => metric().dataset.localAnimationActive === 'false', '手动暂停无效'); const frozen = label('W01').dataset.worldPosition;
  await sleep(350); assert(label('W01').dataset.worldPosition === frozen, '暂停仍移动');
  doc().querySelector('[aria-label="更多选项"]').click(); await sleep(80);
  [...doc().querySelectorAll('.game-tools button')].find(b => b.textContent.includes('恢复场景动画')).click(); await settle(2);
  checks.push({case:'反复面板与本机暂停/恢复，无叠加',balls:2});
});
document.querySelector('#schedule').onclick = () => run(async () => {
  await command({type:'CancelDraft',matchId});
  // Reach round 2 through real commands; retain every result and all schedule rows.
  for (const match of state.matches.filter(m => m.roundId === state.activeRoundId)) {
    for (const slot of match.draftSlots) {
      if (slot.playerId) continue;
      const used = state.matches.filter(m => m.roundId === state.activeRoundId).flatMap(m => m.phase === 'PLANNING' ? m.draftSlots.map(s => s.playerId) : state.lineups.find(l => l.id === m.activeLineupRevisionId).participants.map(p => p.playerId));
      const player = state.players.find(p => p.teamId === slot.sideId && (!slot.gender || p.gender === slot.gender) && !used.includes(p.id));
      await command({type:'AssignPlayer',matchId:match.id,slotId:slot.id,playerId:player.id});
    }
    await command({type:'StartMatch',matchId:match.id});
    await command({type:'SubmitResult',matchId:match.id,lineupRevisionId:state.matches.find(m => m.id === match.id).activeLineupRevisionId,whiteScore:11,blackScore:7});
  }
  await command({type:'AdvanceRound',roundId:state.activeRoundId}); await settle(0);
  doc().querySelectorAll('.game-dock button')[1].click(); await sleep(150);
  const scroll = doc().querySelector('[data-drawer-scroll]'), active = doc().querySelector('.schedule-round.active');
  const offset = active.getBoundingClientRect().top-scroll.getBoundingClientRect().top;
  assert(Math.abs(offset-12)<2, '赛程打开未定位当前轮');
  assert(active.textContent.includes('当前轮') && !active.textContent.includes('进行中'), '当前轮文案误导');
  scroll.scrollTop = scroll.scrollHeight; const chosen = scroll.scrollTop; await sleep(2600);
  assert(scroll.scrollTop === chosen && doc().querySelectorAll('.schedule-round').length === 7, '轮询重置浏览或删减赛程');
  doc().querySelector('[aria-label="关闭面板"]').click(); await sleep(100);
  const roundText = doc().querySelector('.game-round-switch').textContent; assert(roundText.includes('已录分 0/3 场'), '进度含义不明确');
  checks.push({case:'第二轮自动定位、自由浏览不重置、全部七轮保留',offset,roundText});
});

document.querySelector('#preferences').onclick = () => run(async () => {
  // Synthetic lifecycle/preference signals verify the wiring; these are not OS or Safari tests.
  const hidden = Object.getOwnPropertyDescriptor(doc(), 'hidden'), nativeMedia = win().matchMedia.bind(win());
  const revision = Number(metric().dataset.recordRevision);
  const position = label('W01').dataset.worldPosition;
  try {
    Object.defineProperty(doc(), 'hidden', { configurable: true, get: () => true }); doc().dispatchEvent(new (win().Event)('visibilitychange'));
    await until(() => metric().dataset.localAnimationActive === 'false', '隐藏未暂停'); await sleep(350);
    assert(label('W01').dataset.worldPosition === position, '隐藏期间人物移动');
  } finally {
    if (hidden) Object.defineProperty(doc(), 'hidden', hidden); else delete doc().hidden;
    doc().dispatchEvent(new (win().Event)('visibilitychange'));
  }
  await until(() => metric().dataset.localAnimationActive === 'true', '返回前台未恢复');
  win().matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? { matches: true, addEventListener() {}, removeEventListener() {} } : nativeMedia(query);
  doc().querySelector('[aria-label="更多选项"]').click(); await sleep(80); doc().querySelector('[aria-label="关闭面板"]').click();
  await until(() => metric().dataset.localAnimationReduced === 'true', '减少动态效果未接入');
  const reduced = label('W01').dataset.worldPosition; await sleep(250); assert(label('W01').dataset.worldPosition === reduced && metric().dataset.localBallCount === '0', '减少动态效果仍有移动');
  win().matchMedia = nativeMedia;
  doc().querySelector('[aria-label="更多选项"]').click(); await sleep(80); doc().querySelector('[aria-label="关闭面板"]').click();
  await until(() => metric().dataset.localAnimationReduced === 'false', '动态偏好恢复失败');
  frame.style.width='320px'; frame.style.height='568px'; await sleep(160); doc().querySelector('[aria-label="Sophia 球馆总览"]').click();
  await until(() => metric().dataset.cameraMoving === 'false', '手机全景未稳定');
  const empty = doc().querySelector('.game-position'), rect = empty.getBoundingClientRect();
  assert(doc().elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.closest('.game-position') === empty, '游走姓名遮挡空位');
  empty.click(); await until(() => doc().querySelector('.slot-picker'), '小屏选人入口失败');
  const cards = [...doc().querySelectorAll('[data-picker-player]')];
  assert(cards.length && cards.every(c => { const r = c.getBoundingClientRect(); return r.width>=44 && r.height>=44 && c.querySelector('svg'); }), '小屏头像触区异常');
  doc().querySelector('[aria-label="关闭选人面板"]').click(); frame.style.width='390px'; frame.style.height='844px';
  assert(Number(metric().dataset.recordRevision) === revision, '本机偏好改变业务记录');
  checks.push({case:'合成后台/前台、减少动态效果信号、小屏空位/头像热区',revision,performance:JSON.parse(metric().dataset.performance),drawCalls:Number(metric().dataset.drawCalls)});
});

document.querySelector('#scores').onclick = () => run(async () => {
  await read(); const match = state.matches.find(m => m.roundId === state.activeRoundId && m.phase === 'PLAYING') ?? state.matches.find(m => m.roundId === state.activeRoundId && m.phase === 'PLANNING');
  assert(match, '需要同一独立活动中的待安排场次');
  for (const slot of match.draftSlots) {
    if (slot.playerId) continue;
    const used = state.matches.filter(m => m.roundId === state.activeRoundId).flatMap(m => m.phase === 'PLANNING' ? m.draftSlots.map(s => s.playerId) : state.lineups.find(l => l.id === m.activeLineupRevisionId).participants.map(p => p.playerId));
    const player = state.players.find(p => p.teamId === slot.sideId && (!slot.gender || p.gender === slot.gender) && !used.includes(p.id));
    await command({type:'AssignPlayer',matchId:match.id,slotId:slot.id,playerId:player.id});
  }
  if (match.phase === 'PLANNING') await command({type:'StartMatch',matchId:match.id});
  const number = state.courts.find(c => c.id === match.courtId).number;
  doc().querySelector(`[aria-label="${number} 号场 · 录入赛果"]`).click();
  await until(() => doc().querySelector('.world-scoreboard-editor'), '记分牌编辑未打开');
  await until(() => metric().dataset.localAnimationActive === 'false', '录分期间未暂停本机演出');
  async function enter(side, value) {
    const input = doc().querySelector(`[aria-label="${side}队最终比分"]`);
    Object.getOwnPropertyDescriptor(win().HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new (win().Event)('input', {bubbles:true})); await sleep(100);
  }
  await enter('白','11'); await enter('黑','6');
  const falseWarnings = [], editor = doc().querySelector('.world-scoreboard-editor');
  const observer = new (win().MutationObserver)(() => { const notice = editor.querySelector('.notice.warning'); if (notice) falseWarnings.push(notice.textContent); });
  observer.observe(editor, {childList:true,subtree:true}); editor.querySelector('button[type="submit"]').click();
  await until(() => !doc().querySelector('.world-scoreboard-editor'), '自己的录分成功后未关闭'); observer.disconnect();
  await read(); const saved = state.matches.find(m => m.id === match.id);
  assert(saved.phase === 'COMPLETED' && !falseWarnings.length, '自己的保存被误报为他端冲突');
  assert(programmes().find(p => p.matchId === match.id).mode === 'rest', '录分后仍拉球');
  const participants = state.lineups.find(l => l.id === saved.activeLineupRevisionId).participants.map(p => p.playerId);
  assert(participants.every(id => doc().querySelector(`[data-player-id="${id}"]`).getAttribute('aria-label').includes('本轮已参赛')), '赛后阵容未保留');
  doc().querySelector(`[aria-label="${number} 号场 · 更正比分"]`).click();
  await until(() => doc().querySelector('.world-scoreboard-editor'), '更正入口未打开');
  await enter('白','9'); await enter('黑','11');
  await command({type:'CorrectResult',matchId:match.id,lineupRevisionId:saved.activeLineupRevisionId,resultRevisionId:saved.activeResultRevisionId,whiteScore:13,blackScore:11,reason:'SCORE_ENTRY_ERROR'});
  await until(() => doc().querySelector('.notice.warning'), '真实他端更正未提示核对');
  assert(doc().querySelector('[aria-label="白队最终比分"]').value === '9' && doc().querySelector('[aria-label="黑队最终比分"]').value === '11', '他端更正丢弃本机输入');
  doc().querySelector('[aria-label="关闭记分牌并保留草稿"]').click();
  checks.push({case:'真实界面录分后留场、无假冲突；他端更正仍提示且保留输入',matchId:match.id,falseWarnings,participants,revision:state.revision});
});
