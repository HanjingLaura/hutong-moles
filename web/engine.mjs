export const IDS = Array.from({ length: 8 }, (_, i) => `f0${i + 1}`);
export const ROUND_MS = 60000;
export const HIT_MS = 420;

// The only game rules, shared by all input sources. Time/random are injectable for simulation.
export class MolesGame {
  constructor({ now = () => performance.now(), random = Math.random, command = () => {} } = {}) {
    this.now = now; this.random = random; this.command = command;
    this.phase = 'select'; this.selected = []; this.reset();
  }
  reset() {
    this.score = 0; this.combo = 0; this.counts = {}; this.active = null;
    this.remaining = 60; this.dwell = 1200;
  }
  start(selected) {
    const valid = IDS.filter(id => selected.includes(id));
    if (!valid.length || ['countdown', 'playing'].includes(this.phase)) return false;
    this.selected = valid; this.reset(); this.phase = 'countdown';
    this.countdownEnd = this.now() + 3000; this.command('ALL:0'); return true;
  }
  interval() { return 300 + this.random() * 600; }
  tick() {
    const time = this.now();
    if (this.phase === 'countdown' && time >= this.countdownEnd) {
      this.phase = 'playing'; this.end = this.countdownEnd + ROUND_MS;
      this.next = time;
    }
    if (this.phase !== 'playing') return;
    this.remaining = Math.max(0, Math.ceil((this.end - time) / 1000));
    if (time >= this.end) { this.finish(); return; }
    if (this.active && time >= this.active.until) {
      this.command(`OFF:${this.active.hole}`);
      if (!this.active.hit) this.combo = 0;
      this.active = null; this.next = time + this.interval();
    }
    if (!this.active && time >= this.next) {
      this.active = { hole: Math.min(5, Math.floor(this.random() * 6)),
        person: this.selected[Math.min(this.selected.length - 1, Math.floor(this.random() * this.selected.length))],
        born: time, until: Math.min(this.end, time + this.dwell), hit: false };
      this.command(`ON:${this.active.hole}`);
    }
  }
  hit(hole) {
    this.tick();
    if (this.phase !== 'playing' || !Number.isInteger(hole) || hole < 0 || hole > 5) return false;
    if (!this.active || this.active.hole !== hole || this.active.hit) { this.combo = 0; return false; }
    this.score++; this.combo++;
    this.counts[this.active.person] = (this.counts[this.active.person] || 0) + 1;
    this.dwell = Math.max(350, 1200 - this.score * 40);
    this.active.hit = true; this.active.hitAt = this.now(); this.active.until = Math.min(this.end, this.now() + HIT_MS);
    this.command(`OFF:${hole}`); return true;
  }
  finish() {
    if (this.active) this.command(`OFF:${this.active.hole}`);
    this.active = null; this.remaining = 0; this.phase = 'ended'; this.command('ALL:0');
  }
  selection() { this.phase = 'select'; this.active = null; this.command('ALL:0'); }
  leaders() {
    const most = Math.max(0, ...Object.values(this.counts));
    return most ? this.selected.filter(id => this.counts[id] === most) : [];
  }
  lights() { return this.phase === 'playing' && this.active && !this.active.hit ? [`ON:${this.active.hole}`] : []; }
}
