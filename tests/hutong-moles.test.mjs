import test from 'node:test';
import assert from 'node:assert/strict';
import { IDS, MolesGame } from '../web/engine.mjs';
import { UnoSerial } from '../web/serial.mjs';




function fixture(selected = ['f03'], random = () => .4) {
  let time = 0; const commands = [];
  const game = new MolesGame({ now: () => time, random, command: command => commands.push(command) });
  game.start(selected);
  return { game, commands, at(value) { time = value; game.tick(); }, advance(value) { time += value; game.tick(); } };
}
test('3-second countdown, single selection, HIT, ON/OFF, miss and 60-second cutoff', () => {
  const f = fixture(); f.at(2999); assert.equal(f.game.phase, 'countdown');
  f.at(3000); assert.equal(f.game.active.person, 'f03'); assert.equal(f.game.active.hole, 2);
  assert.ok(f.commands.includes('ON:2'));
  assert.equal(f.game.hit(2), true); assert.equal(f.game.score, 1); assert.equal(f.game.combo, 1);
  assert.equal(f.game.dwell, 1160); assert.equal(f.game.active.hit, true); assert.ok(f.commands.includes('OFF:2'));
  f.game.hit(2); assert.equal(f.game.score, 1); assert.equal(f.game.combo, 0);
  f.advance(420); assert.equal(f.game.active, null);
  f.advance(540); assert.equal(f.game.active.person, 'f03');
  f.game.hit(2); assert.equal(f.game.score, 2);
  f.game.hit(0); assert.equal(f.game.score, 2); assert.equal(f.game.combo, 0);
  f.at(63000); assert.equal(f.game.phase, 'ended'); assert.equal(f.game.remaining, 0);
  assert.equal(f.commands.at(-1), 'ALL:0'); assert.deepEqual(f.game.leaders(), ['f03']);
});
test('only selected characters spawn, dwell bottoms at 350 ms, late hits cannot score', () => {
  let seed = 2;
  const f = fixture(['f01', 'f08'], () => ((seed = (seed * 16807) % 2147483647) / 2147483647));
  const seen = new Set(); f.at(3000);
  for (let i = 0; i < 25; i++) {
    const active = f.game.active; assert.ok(['f01', 'f08'].includes(active.person)); seen.add(active.person);
    f.game.hit(active.hole); f.advance(420); f.advance(900);
  }
  assert.equal(seen.size, 2); assert.equal(f.game.dwell, 350);
  f.advance(351); assert.equal(f.game.active, null); assert.equal(f.game.hit(2), false);
  assert.equal(f.game.combo, 0);
  const empty = new MolesGame(); assert.equal(empty.start([]), false); assert.equal(empty.start(['f09']), false);
  assert.equal(empty.start(IDS), true);
});

function fakeSerial() {
  let controller; const writes = []; const options = [];
  const port = new EventTarget();
  port.readable = new ReadableStream({ start(c) { controller = c; } });
  port.writable = new WritableStream({ write(bytes) { writes.push(new TextDecoder().decode(bytes)); } });
  port.open = async option => { options.push(option); }; port.close = async () => {};
  const serial = new EventTarget(); serial.requestPort = async () => port;
  return { serial, port, writes, options, push(text) { controller.enqueue(new TextEncoder().encode(text)); } };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 10));
test('fake transport: no pre-READY writes, fragmented lines, HIT scores, LEDs sync and unplug continues game', async () => {
  const fake = fakeSerial(); const statuses = [];
  const f = fixture();
  const uno = new UnoSerial({ serial: fake.serial, onStatus: (...s) => statuses.push(s),
    onHit: hole => f.game.hit(hole), lights: () => f.game.lights() });
  f.game.command = command => uno.send(command);
  await uno.connect(); assert.deepEqual(fake.options, [{ baudRate: 115200 }]);
  f.at(3000); uno.send('PING'); fake.push('HIT:2\nREA'); await settle();
  assert.equal(f.game.score, 0); assert.deepEqual(fake.writes, []);
  fake.push('DY\r\n'); await settle(); await uno.queue;
  assert.deepEqual(fake.writes, ['ALL:0\n', 'ON:2\n']);
  fake.push('HIT:'); await settle(); assert.equal(f.game.score, 0);
  fake.push('2\nHIT:9\nUNKNOWN\nPONG\n'); await settle(); await uno.queue;
  assert.equal(f.game.score, 1); assert.equal(fake.writes.at(-1), 'OFF:2\n');
  f.advance(420); f.advance(540); await uno.queue; assert.equal(fake.writes.at(-1), 'ON:2\n');
  fake.port.dispatchEvent(new Event('disconnect')); // Actual Serial disconnect events bubble to navigator.serial.
  const event = new Event('disconnect'); Object.defineProperty(event, 'port', { value: fake.port }); fake.serial.dispatchEvent(event);
  await settle(); assert.equal(uno.ready, false); assert.equal(f.game.phase, 'playing');
  assert.equal(f.game.hit(2), true); assert.equal(f.game.score, 2);
  assert.ok(statuses.some(([s]) => s.includes('断开')));
});
test('missing READY times out and overlong/unknown lines are ignored', async () => {
  const fake = fakeSerial(); const statuses = [];
  const uno = new UnoSerial({ serial: fake.serial, timeout: 15, onStatus: s => statuses.push(s) });
  await uno.connect(); fake.push('x'.repeat(200) + 'READY\n');
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(uno.port, null); assert.deepEqual(fake.writes, []);
  assert.ok(statuses.includes('没连上胡同地鼠固件，请检查是否烧录'));
});
