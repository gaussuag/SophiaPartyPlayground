const frame = document.querySelector('iframe'), output = document.querySelector('#result');
const eventId = new URLSearchParams(location.search).get('event');
if (!['127.0.0.1', 'localhost'].includes(location.hostname) || !eventId?.startsWith('local-')) throw new Error('仅允许本地独立活动');
frame.src = `/?event=${encodeURIComponent(eventId)}&venueMetrics=1`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const doc = () => frame.contentDocument, win = () => frame.contentWindow;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
async function until(check, message, timeout = 8000) { const end = performance.now() + timeout; while (!check()) { if (performance.now() > end) throw new Error(message); await sleep(20); } }
const metric = () => doc()?.querySelector('[data-venue-metrics]');
const person = () => doc().querySelector('[data-player-id="W01"]');
const pose = () => { const el = person().closest('.projected-label'); return { position: el.dataset.worldPosition, walking: el.dataset.walking, pending: person().getAttribute('aria-busy'), revision: Number(metric().dataset.recordRevision), feedback: doc().querySelector('.game-toast')?.textContent ?? '' }; };
const checks = [];
let nextMode = 'normal', release = null;
const posts = [];
await until(() => metric() && person(), '球馆未就绪');
const transport = win().fetch.bind(win());
win().fetch = async (input, init) => {
  if (init?.method !== 'POST' || !String(input).endsWith(`/api/events/${eventId}/commands`)) return transport(input, init);
  const request = JSON.parse(init.body), mode = nextMode; nextMode = 'normal'; posts.push({ commandId: request.commandId, type: request.command.type, mode });
  if (mode === 'held' || mode === 'reject') await new Promise(resolve => { release = resolve; });
  if (mode === 'reject') return new (win().Response)(JSON.stringify({ error: { code: 'TEST_REJECTED', message: '本地验收：本次安排未保存' } }), { status: 422, headers: { 'Content-Type': 'application/json' } });
  if (mode === 'drop-before') throw new TypeError('本地验收：请求未送达');
  const response = await transport(input, init);
  if (mode === 'drop-after') { await response.text(); throw new TypeError('本地验收：成功响应丢失'); }
  return response;
};
async function ready() { await until(() => doc().querySelector('.sync-icon.synced'), '未恢复同步'); }
async function assign() {
  person().click();
  await until(() => doc().querySelector('button.game-position[aria-label="安排 尼克 到 1 号场 WHITE-1"]'), '可安排位置未出现');
  doc().querySelector('button.game-position[aria-label="安排 尼克 到 1 号场 WHITE-1"]').click();
}
async function remove() { person().click(); await until(() => doc().querySelector('[aria-label="移出 尼克"]'), '下场入口未出现'); doc().querySelector('[aria-label="移出 尼克"]').click(); }
async function run(task) {
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  output.textContent = '运行中…';
  try { checks.push(await task()); output.textContent = JSON.stringify({ status: 'PASS', eventId, checks, posts }, null, 2); }
  catch (error) { output.textContent = `FAIL ${error.stack}\n${JSON.stringify({ pose: pose(), posts }, null, 2)}`; }
  finally { for (const button of document.querySelectorAll('button')) button.disabled = false; }
}
output.textContent = '就绪。请按 1 → 5 验证。';
document.querySelector('#delayed').onclick = () => run(async () => {
  await ready(); const before = pose(); nextMode = 'held'; await assign();
  await until(() => release && pose().walking === 'true', '响应前未开始走动'); await sleep(180); const pending = pose();
  assert(pending.position !== before.position && pending.revision === before.revision, '动画或权威版本不符合预期');
  assert(pending.pending === 'true' && !pending.feedback, '保存反馈不够轻量');
  await sleep(1200); const slow = pose(); assert(slow.feedback.includes('正在同步安排'), '慢保存反馈缺失');
  release(); release = null; await ready(); const accepted = pose();
  assert(accepted.revision === before.revision + 1 && accepted.pending !== 'true', '确认状态错误');
  await until(() => pose().walking === 'false', '人物未到位');
  return { case: '延迟成功：先行动、后台保存、确认后不停步', before, pending, slow, accepted, arrived: pose() };
});
document.querySelector('#rejected').onclick = () => run(async () => {
  await ready(); await until(() => pose().walking === 'false', '人物未到位'); const before = pose(); nextMode = 'reject'; await remove();
  await until(() => release && pose().walking === 'true', '下场预测未开始'); await sleep(300); const pending = pose();
  release(); release = null; await until(() => pose().feedback.includes('未保存'), '失败反馈缺失');
  const corrected = pose(); assert(corrected.walking === 'true' && corrected.position !== before.position, '纠正时发生瞬移');
  await until(() => pose().walking === 'false', '回位未完成'); const arrived = pose();
  assert(arrived.position === before.position && arrived.revision === before.revision, '拒绝改变了正式位置');
  doc().querySelector('[aria-label="收起提示"]').click(); await ready();
  return { case: '明确拒绝：从当前位置走回权威位置', before, pending, corrected, arrived };
});
document.querySelector('#lost').onclick = () => run(async () => {
  await ready(); nextMode = 'drop-after'; const before = pose(), count = posts.length; await remove();
  await until(() => doc().querySelector('.sync-icon.unknown-outcome'), '未显示结果未知'); const unknown = pose();
  doc().querySelector('.sync-icon').click(); await ready(); const accepted = pose();
  assert(posts.length === count + 1 && accepted.revision === before.revision + 1, '回执核对重复提交');
  await until(() => pose().walking === 'false', '未到候场位置');
  return { case: '成功响应丢失：保留动画、查回执收敛、不重复写', before, unknown, accepted, arrived: pose() };
});
document.querySelector('#retry').onclick = () => run(async () => {
  await ready(); nextMode = 'drop-before'; const before = pose(), count = posts.length; await assign();
  await until(() => doc().querySelector('.sync-icon.unknown-outcome'), '未显示结果未知'); const unknown = pose();
  doc().querySelector('.sync-icon').click(); await until(() => pose().feedback.includes('尚未查到'), '未核对回执');
  assert(pose().revision === before.revision && posts.length === count + 1, '自动重放了操作');
  doc().querySelector('.game-toast .text-button').click(); await ready(); const accepted = pose();
  assert(posts.length === count + 2 && posts.at(-1).commandId === posts.at(-2).commandId, '重试未保留原编号');
  await until(() => pose().walking === 'false', '人物未到位');
  return { case: '未送达：保留预测、显式原编号重试', before, unknown, accepted, arrived: pose() };
});
// Exercises the real picker and gesture owner, not an alternate implementation.
document.querySelector('#picker').onclick = () => run(async () => {
  await ready(); const revision = pose().revision, layout = metric().dataset.worldLayout;
  const target = '[aria-label="1 号场 黑队男性位置 BLACK-1"]';
  const candidates = () => [...doc().querySelectorAll('[data-candidate="true"]')].map(el => el.dataset.playerId);
  const ids = () => [...doc().querySelectorAll('[data-picker-player]')].map(el => el.dataset.pickerPlayer);
  const player = () => doc().querySelector('[data-player-id="B02"]');
  const walking = () => player().closest('.projected-label').dataset.walking === 'true';
  function touch(target) {
    const box = target.getBoundingClientRect(), point = { bubbles: true, pointerId: 90, pointerType: 'touch', isPrimary: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, button: 0 };
    target.dispatchEvent(new (win().PointerEvent)('pointerdown', { ...point, buttons: 1 }));
    target.dispatchEvent(new (win().PointerEvent)('pointerup', { ...point, buttons: 0 }));
  }
  // At the smallest supported view, a bench name must not steal a seat tap.
  frame.style.width = '320px'; frame.style.flexBasis = '320px'; frame.style.height = '568px'; await sleep(160);
  doc().querySelector('[aria-label="Sophia 球馆总览"]').click();
  await until(() => metric().dataset.cameraMoving === 'false', '小屏全景未稳定');
  const empty = doc().querySelector('[aria-label="1 号场 白队女性位置 WHITE-2"]'), box = empty.getBoundingClientRect();
  assert(doc().elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('.game-position') === empty, '候场姓名遮挡空席位热区');
  empty.click(); await until(() => doc().querySelector('.slot-picker'), '小屏空位未打开头像面板');
  doc().querySelector('[aria-label="关闭选人面板"]').click();
  frame.style.width = '390px'; frame.style.flexBasis = '390px'; frame.style.height = '844px'; await sleep(160);
  doc().querySelector('[aria-label="Sophia 球馆总览"]').click(); await until(() => metric().dataset.cameraMoving === 'false', '恢复全景未稳定');
  doc().querySelector(target).click(); await until(() => doc().querySelector('.slot-picker'), '头像面板未打开');
  assert(JSON.stringify(ids()) === JSON.stringify(['B02', 'B04', 'B05', 'B06']), '候选人不符合队伍／性别');
  assert(JSON.stringify(candidates()) === JSON.stringify(ids()), '场景高亮与头像名单不一致');
  await until(() => doc().querySelector('[data-player-id="B02"]').closest('.projected-label').dataset.inviting === 'true', '没有候选举手动画');
  const cards = [...doc().querySelectorAll('[data-picker-player]')].map(el => ({ id: el.dataset.pickerPlayer, svg: !!el.querySelector('svg'), name: el.textContent, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
  assert(cards.every(c => c.svg && c.name && c.width >= 44 && c.height >= 44), '头像／姓名或触区不满足要求');
  doc().querySelector('.slot-picker').dispatchEvent(new (win().KeyboardEvent)('keydown', { key: 'Escape', bubbles: true }));
  await until(() => !doc().querySelector('.slot-picker') && !candidates().length, 'Escape 未取消选择');
  doc().querySelector(target).click(); await until(() => doc().querySelector('[data-picker-player="B02"]'), '无法重新打开选人');
  nextMode = 'held'; doc().querySelector('[data-picker-player="B02"]').click();
  await until(() => release && walking(), '选择后未立即走动');
  assert(!doc().querySelector('.slot-picker') && !candidates().length, '选人后面板／高亮未关闭');
  touch(player()); await sleep(100);
  assert(!doc().querySelector('dialog[open]') && !doc().querySelector('.game-selection-bar'), '走动中触摸打开了详情或再次选择');
  assert(pose().revision === revision, '响应前篡改正式版本');
  release(); release = null; await ready();
  await until(() => !walking(), '选手未到场');
  player().click(); await until(() => doc().querySelector('[aria-label="移出 Kyle"]'), '下场入口缺失'); doc().querySelector('[aria-label="移出 Kyle"]').click(); await until(() => pose().revision === revision + 2, '下场保存未确认'); await ready(); await until(() => !walking(), '下场未完成');
  // A separate anonymous HTTP client changes an unrelated seat while the picker is open.
  doc().querySelector(target).click(); await until(() => doc().querySelector('.slot-picker'), '并发检查前面板未打开');
  const root = `/api/events/${eventId}`;
  async function command(command) {
    const { state } = await (await fetch(root)).json();
    const response = await fetch(root + '/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, commandId: crypto.randomUUID(), expectedRevision: state.revision, expectedGeneration: state.generation, command }) });
    assert(response.ok, '本地独立客户端写入失败'); return (await response.json()).state;
  }
  await command({ type: 'AssignPlayer', matchId: 'M-R01-C01', slotId: 'WHITE-2', playerId: 'W02' });
  await until(() => !doc().querySelector('.slot-picker') && doc().querySelector('.game-toast')?.textContent.includes('记录已更新'), '旧选位未随版本变化失效');
  const cleaned = await command({ type: 'RemovePlayer', matchId: 'M-R01-C01', slotId: 'WHITE-2' });
  doc().querySelector('[aria-label="收起提示"]').click(); doc().querySelector('.sync-icon').click(); await until(() => pose().revision === cleaned.revision, '清理后的共享版本未同步'); await ready();
  assert(metric().dataset.worldLayout === layout, '选人或同步改变了横向场地布局');
  assert(doc().querySelectorAll('[data-player-id]').length === 14 && !doc().querySelector('dialog[open]'), '场景人物或弹窗状态异常');
  return { case: '头像选人／触摸行走角色／Escape／并发旧选位失效', cards, candidates: ['B02', 'B04', 'B05', 'B06'], beforeRevision: revision, afterRevision: pose().revision, layoutUnchanged: true, smallScreenSeatHitClear: true, noAutomaticProfile: true };
});
