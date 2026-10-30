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
output.textContent = '就绪。请按 1 → 4 验证。';
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
