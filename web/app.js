import { IDS, MolesGame } from './engine.mjs';
import { UnoSerial } from './serial.mjs';
import metadata from './characters.mjs';

const names = ['Suki', 'Sid', 'Jilly', 'Laura', 'Kay', 'Franco', 'Cora', 'Amber'];
const urls = [
  new URL('./characters/suki.png', import.meta.url).href,
  new URL('./characters/sid.png', import.meta.url).href,
  new URL('./characters/jilly.png', import.meta.url).href,
  new URL('./characters/laura.png', import.meta.url).href,
  new URL('./characters/kay.png', import.meta.url).href,
  new URL('./characters/franco.png', import.meta.url).href,
  new URL('./characters/cora.png', import.meta.url).href,
  new URL('./characters/amber.png', import.meta.url).href,
];
const $ = id => document.getElementById(id);
const storage = { get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode can disable storage. */ } } };
const saved = storage.get('hutong-moles-selection', IDS);
let selected = new Set(Array.isArray(saved) ? saved.filter(id => IDS.includes(id)) : IDS);
let best = Math.max(0, Number(storage.get('hutong-moles-best', 0)) || 0), loaded = false;
const frames = new Map();
const game = new MolesGame({ command: line => uno.send(line) });
const uno = new UnoSerial({ onHit: hole => strike(hole), lights: () => game.lights(),
  onStatus: (message, state) => {
    $('serial-status').textContent = message;
    $('connect').textContent = state === 'connected' ? '断开 Uno' : state === 'waiting' ? '等待 READY…' : '连接 Uno';
    $('connect').disabled = state === 'waiting';
  } });
if (!navigator.serial || !window.isSecureContext) {
  $('connect').disabled = true; $('serial-status').textContent = '请用电脑上的 Chrome 或 Edge';
}
$('connect').onclick = () => uno.port ? uno.disconnect() : uno.connect();

function draw(canvas, id, hit = false, age = 0) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, canvas.width, canvas.height);
  const frame = frames.get(id); if (!frame) return;
  const { source, w, h } = frame;
  const scale = Math.min((canvas.width - 14) / w, (canvas.height - 8) / h);
  const dw = Math.round(w * scale), dh = Math.round(h * scale);
  const x = Math.round((canvas.width - dw) / 2) + (hit ? Math.round(Math.sin(age / 22) * 2) : 0);
  const y = canvas.height - dh;
  ctx.drawImage(source, 0, 0, w, h, x, y, dw, dh);
  if (hit) {
    // Preserve the supplied pose; only shake the whole sprite and add hit stars.
    ctx.fillStyle = '#f1d36e';
    for (let i = 0; i < 3; i++) {
      const sx = Math.round(canvas.width / 2 + Math.cos(age / 140 + i * 2.1) * 22);
      const sy = Math.round(y + 5 + Math.sin(age / 140 + i * 2.1) * 5);
      ctx.fillRect(sx - 2, sy - 5, 4, 10); ctx.fillRect(sx - 5, sy - 2, 10, 4);
    }
  }
}

for (const [index, id] of IDS.entries()) {
  const button = document.createElement('button'); button.className = 'person'; button.dataset.id = id;
  button.innerHTML = `<span class="check" aria-hidden="true">✓</span><canvas width="100" height="128" aria-hidden="true"></canvas><b>${names[index]}</b><small>${id}</small>`;
  button.setAttribute('aria-label', `${id} ${names[index]}`);
  button.onclick = () => { selected.has(id) ? selected.delete(id) : selected.add(id); updateSelection(); };
  $('people').append(button);
}
const holeButtons = [];
for (let hole = 0; hole < 6; hole++) {
  const button = document.createElement('button'); button.className = 'hole'; button.dataset.hole = hole;
  button.setAttribute('aria-label', `窗口 ${hole} · ${'QWEASD'[hole]}`);
  button.innerHTML = `<span class="window"><span class="actor"><canvas width="120" height="144" aria-hidden="true"></canvas></span><span class="sill"></span></span><span class="hole-label"><b>0${hole}</b><kbd>${'QWEASD'[hole]}</kbd></span>`;
  button.onclick = () => strike(hole); holeButtons.push(button); $('holes').append(button);
}
function updateSelection() {
  for (const button of $('people').children) button.setAttribute('aria-pressed', String(selected.has(button.dataset.id)));
  $('start').disabled = !loaded || !selected.size;
  storage.set('hutong-moles-selection', [...selected]);
}
$('all').onclick = () => { selected = new Set(IDS); updateSelection(); };
$('clear').onclick = () => { selected.clear(); updateSelection(); };
function start() {
  if (!loaded || !game.start([...selected])) return;
  $('selection').hidden = $('result').hidden = true; $('play').hidden = false;
  $('countdown').hidden = false; $('countdown').textContent = '3';
}
$('start').onclick = $('again').onclick = start;
$('change').onclick = () => {
  game.selection(); $('result').hidden = $('play').hidden = true; $('selection').hidden = false;
  $('start').focus();
};
function strike(hole) {
  game.hit(hole); render();
  holeButtons[hole]?.classList.add('pressed');
  setTimeout(() => holeButtons[hole]?.classList.remove('pressed'), 100);
}
document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || game.phase !== 'playing') return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  const hole = 'qweasd'.indexOf(event.key.toLowerCase());
  if (hole >= 0) { event.preventDefault(); strike(hole); }
});
function result() {
  const previous = best;
  best = Math.max(best, game.score); storage.set('hutong-moles-best', best);
  $('play').hidden = true; $('result').hidden = false;
  $('final-score').textContent = game.score;
  $('record').textContent = game.score > previous ? `新纪录！比之前多 ${game.score - previous} 分。` : `本机最高 ${best} 分 · 下次再挑战`;
  $('leaders').replaceChildren();
  const leaders = game.leaders();
  if (!leaders.length) $('leaders').textContent = '这次大家都躲过了，下次加油！';
  for (const id of leaders) {
    const person = document.createElement('div'); person.className = 'leader';
    person.innerHTML = `<canvas width="100" height="128" aria-hidden="true"></canvas><p><b>${names[IDS.indexOf(id)]}</b><br>${game.counts[id]} 次${leaders.length > 1 ? ' · 并列' : ''}</p>`;
    $('leaders').append(person); draw(person.querySelector('canvas'), id);
  }
  $('again').focus();
}
let lastPhase = game.phase;
function render() {
  if (game.phase === 'ended' && lastPhase !== 'ended') result();
  lastPhase = game.phase;
  $('score').textContent = game.score; $('time').textContent = game.remaining;
  $('combo').textContent = game.combo; $('best').textContent = best;
  $('saved-best').textContent = `本机最高 ${best} 分`;
  $('countdown').hidden = game.phase !== 'countdown';
  if (game.phase === 'countdown') $('countdown').textContent = Math.max(1, Math.ceil((game.countdownEnd - game.now()) / 1000));
  for (const [hole, button] of holeButtons.entries()) {
    const active = game.active?.hole === hole ? game.active : null;
    button.classList.toggle('up', !!active); button.classList.toggle('hit', !!active?.hit);
    button.dataset.person = active?.person || '';
    button.setAttribute('aria-label', `窗口 ${hole} · ${'QWEASD'[hole]}${active ? ` · ${names[IDS.indexOf(active.person)]}${active.hit ? ' 已打中' : ' 冒头'}` : ' 空'} `);
    if (active) draw(button.querySelector('canvas'), active.person, active.hit, game.now() - (active.hitAt || active.born));
  }
}
updateSelection(); render();
Promise.all(IDS.map(async (id, index) => {
  const image = new Image(); image.src = urls[index]; await image.decode();
  const rect = metadata.members[names[index].toLowerCase()].frames.find(frame => frame.name === 'idle-front').rect;
  const [x, y, w, h] = rect;
  const source = document.createElement('canvas'); source.width = w; source.height = h;
  const ctx = source.getContext('2d'); ctx.drawImage(image, x, y, w, h, 0, 0, w, h);
  frames.set(id, { source, w, h }); draw($('people').children[index].querySelector('canvas'), id);
})).then(() => { loaded = true; $('selection').dataset.ready = 'true'; updateSelection(); })
  .catch(() => { $('asset-status').hidden = false; $('asset-status').textContent = '人物资源加载失败，请刷新页面重试。'; });
function loop() { game.tick(); render(); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
// Tick even in a background tab; absolute deadlines prevent extending the 60-second round.
setInterval(() => { game.tick(); render(); }, 100);
window.addEventListener('pagehide', () => { uno.send('ALL:0'); });
// Development-only access for browser acceptance captures; absent in the production build.

