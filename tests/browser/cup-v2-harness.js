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
document.querySelector('#run').onclick = async () => {
  try {
    checks.length = 0;
    assert(doc().querySelectorAll('[data-player-id]').length === 13 && !doc().querySelector('[data-player-id="W07"]'), '名单人数或 Mike 未更新');
    assert(doc().querySelector('[data-player-id="B01"]').classList.contains('free'), 'Sophia 未显示自由阵营');
    await command({ type: 'OpenFirstRound' });
    click(seat(1, 'WHITE-1'));
    await until(() => doc().querySelector('[data-picker-player="B01"]'), '奇数轮白队缺少 Sophia 候选');
    click('[data-picker-player="B01"]');
    await until(() => doc().querySelector('[data-player-id="B01"]').closest('.projected-label').dataset.flying === 'true', '没有飞行转场');
    assert(!doc().querySelector('.slot-picker'), '选择后未关闭面板');
    await read(); await synced();
    await until(() => !doc().querySelector('[data-walking="true"]'), '飞行未停在真实席位');
    checks.push('13 人、Mike 移除、自由阵营、奇数轮白侧候选、选后关闭、飞行抵达');
    for (const [slotId, playerId] of [['WHITE-2','W04'], ['BLACK-1','B03'], ['BLACK-2','B07']]) await command({ type: 'AssignPlayer', matchId: 'M-R01-C01', slotId, playerId });
    const beforeAnimation = requests.length; await sleep(2400);
    const animationRequests = requests.slice(beforeAnimation), animationWrites = animationRequests.filter(r => r.method === 'POST'); assert(!animationWrites.length && animationRequests.length <= 3, '装饰动画增加写入或轮询请求');
    click('[aria-label="1 号场 · 确认上场"]');
    await until(() => button('确认上场并开始'), '未出现明确开赛确认'); button('确认上场并开始').click();
    await until(() => doc().querySelector('[aria-label="1 号场 · 录入赛果"]'), '开赛未完成');
    click('[aria-label="1 号场 · 录入赛果"]'); await until(() => doc().querySelector('[aria-label="白队最终比分"]'), '未打开记分牌');
    assert(doc().querySelector('.score-award').textContent.includes('2 分'), '录分牌未说明双倍积分');
    const set = Object.getOwnPropertyDescriptor(frame.contentWindow.HTMLInputElement.prototype, 'value').set;
    for (const [name, value] of [['白队最终比分','11'], ['黑队最终比分','8']]) { const input = doc().querySelector(`[aria-label="${name}"]`); set.call(input, value); input.dispatchEvent(new frame.contentWindow.Event('input', { bubbles: true })); await sleep(120); }
    button('确认比分并结束比赛').click();
    await until(() => !doc().querySelector('.world-scoreboard-editor'), '录分未成功关闭'); await read(); await synced();
    button('赛果').click(); await until(() => doc().querySelector('.team-standings'), '未显示队伍积分');
    assert(doc().querySelector('.team-standings .white strong').textContent === '2分', '白队应获得 2 分');
    const m = state.matches[0]; await command({ type: 'CorrectResult', matchId: m.id, lineupRevisionId: m.activeLineupRevisionId, resultRevisionId: m.activeResultRevisionId, whiteScore: 9, blackScore: 15, reason: 'SCORE_ENTRY_ERROR' });
    assert(doc().querySelector('.team-standings .black strong').textContent === '2分', '更正后黑队应获得 2 分');
    assert(doc().querySelector('.team-standings .white strong').textContent === '0分', '更正未扣除旧积分');
    assert(doc().querySelectorAll('.result-card').length === 1, '历史更正重复计入赛果卡');
    checks.push('场内确认开赛、11 分录入、双方代表名单、胜方 2 分、更正转移积分且不重复');
    doc().querySelector('[aria-label="关闭面板"]').click();
    button('赛程').click(); await until(() => doc().querySelector('.schedule-round'), '没有赛程');
    assert(doc().querySelector('.count-tag').textContent.includes('21 场'), '赛程场次计数仍为旧值');
    const rounds = [...doc().querySelectorAll('.schedule-round')]; assert(rounds.length === 7, '轮次数错误');
    assert(rounds.every(r => r.querySelectorAll('button').length === 3), '第七轮或其他轮缺少第三场');
    assert(rounds[0].textContent.includes('女双') && rounds[0].textContent.includes('男双') && rounds[0].textContent.includes('男单'), '奇数轮类型不符');
    assert(rounds[1].textContent.includes('混双①') && rounds[1].textContent.includes('女单') && rounds[1].textContent.includes('Sophia 本轮代表黑队'), '偶数轮说明不符');
    doc().querySelector('[aria-label="关闭面板"]').click();
    for (const [court, ids] of [['C02',['W01','W03','B02','B04']], ['C03',['W06','B05']]]) {
      const matchId = `M-R01-${court}`;
      for (const [i, slot] of state.matches.find(m => m.id === matchId).draftSlots.entries()) await command({ type: 'AssignPlayer', matchId, slotId: slot.id, playerId: ids[i] });
      await command({ type: 'StartMatch', matchId });
      await command({ type: 'SubmitResult', matchId, lineupRevisionId: state.matches.find(m => m.id === matchId).activeLineupRevisionId, whiteScore: 15, blackScore: 8 });
    }
    await command({ type: 'AdvanceRound', roundId: 'R01' });
    assert(state.matches.filter(m => m.roundId === 'R02').flatMap(m => m.draftSlots).every(s => !s.playerId), '新轮草稿没有清空');
    click(seat(3, 'WHITE-1')); await until(() => doc().querySelector('.slot-picker'), '未打开偶数轮候选'); assert(!doc().querySelector('[data-picker-player="B01"]'), '偶数轮白侧错误提供 Sophia'); doc().querySelector('[aria-label="关闭选人面板"]').click();
    await until(() => !doc().querySelector('.slot-picker'), '旧面板未关闭');
    click(seat(3, 'BLACK-1')); await until(() => doc().querySelector('[data-picker-player="B01"]'), '偶数轮黑侧缺少 Sophia'); doc().querySelector('[aria-label="关闭选人面板"]').click();
    await until(() => !doc(peer).querySelector('.game-primary-action button'), '匿名客户端出现管理动作');
    checks.push('21 场完整赛程、偶数轮说明、新轮回候场、偶数轮候选约束、匿名端权限');
    for (const [width, height] of [[320,568], [390,600], [430,932]]) {
      frame.style.width = `${width}px`; frame.style.height = `${height}px`; await sleep(300);
      const labels = [...doc().querySelectorAll('.game-player-label')]; assert(labels.every(el => el.getBoundingClientRect().height >= 44), '姓名触区小于 44px');
      button('赛果').click(); await until(() => doc().querySelector('.team-standings'), '积分卡未打开');
      const box = doc().querySelector('.team-standings').getBoundingClientRect(); assert(box.left >= 0 && box.right <= width, '积分卡越界');
      doc().querySelector('[aria-label="关闭面板"]').click();
    }
    checks.push('320×568、390×600、430×932 姓名触区、积分卡无横向越界');
    output.textContent = JSON.stringify({ ok: true, checks, eventId, revision: state.revision, requests: requests.length, animationPostRequests: animationWrites.length, animationRequests: animationRequests.length, peerRole, twoClients: true }, null, 2);
  } catch (error) { output.textContent = JSON.stringify({ ok: false, checks, error: String(error), revision: state?.revision }, null, 2); }
};
