// UART transport only. Never runs game rules or writes before READY.
export class UnoSerial {
  constructor({ serial = globalThis.navigator?.serial, onHit = () => {}, onStatus = () => {}, lights = () => [],
    timeout = 4000 } = {}) {
    Object.assign(this, { serial, onHit, onStatus, lights, timeout });
    this.ready = false; this.port = null; this.session = 0; this.queue = Promise.resolve();
    this.onDisconnect = event => {
      if ((event.port || event.target) === this.port) void this.disconnect('Uno 已断开，继续网页游戏');
    };
    serial?.addEventListener('disconnect', this.onDisconnect);
  }
  async connect() {
    if (this.port || this.connecting || !this.serial) return;
    this.connecting = true;
    try {
      const port = await this.serial.requestPort();
      await port.open({ baudRate: 115200 });
      this.port = port; this.ready = false; this.buffer = ''; this.discarding = false;
      const session = ++this.session;
      this.writer = port.writable.getWriter();
      this.reader = port.readable.getReader();
      this.onStatus('等待 Uno 重启和 READY…', 'waiting');
      this.timer = setTimeout(() => {
        if (this.session === session && !this.ready)
          void this.disconnect('没连上胡同地鼠固件，请检查是否烧录');
      }, this.timeout);
      this.readTask = this.read(session);
    } catch (error) {
      await this.disconnect(error.name === 'NotFoundError' ? '已取消连接，继续网页游戏' : '串口打开失败，请关闭串口监视器后重试');
    } finally { this.connecting = false; }
  }
  async read(session) {
    const reader = this.reader;
    const decoder = new TextDecoder();
    try {
      while (session === this.session) {
        const { value, done } = await reader.read();
        if (done) break;
        this.receive(decoder.decode(value, { stream: true }));
      }
    } catch { /* Unplug/read failure: clear transport, retain the game state. */ }
    finally {
      reader.releaseLock();
      if (session === this.session) void this.disconnect('Uno 已断开，继续网页游戏');
    }
  }
  receive(chunk) {
    // Bound unfinished lines without ever interpreting their tail as a new message.
    for (const char of chunk) {
      if (char === '\n') {
        const line = this.buffer.replace(/\r$/, ''); this.buffer = '';
        if (!this.discarding) this.line(line);
        this.discarding = false;
      } else if (!this.discarding) {
        this.buffer += char;
        if (this.buffer.length > 128) { this.buffer = ''; this.discarding = true; }
      }
    }
  }
  line(line) {
    if (line === 'READY') {
      this.ready = true; clearTimeout(this.timer);
      this.onStatus('Uno 已连接 · 网页与实体按键同时可用', 'connected');
      this.send('ALL:0'); for (const command of this.lights()) this.send(command);
    } else if (this.ready && /^HIT:[0-5]$/.test(line)) this.onHit(Number(line.at(-1)));
    // PONG and unknown lines require no UI action.
  }
  send(command) {
    if (!this.ready || !this.writer || !/^(ON:[0-5]|OFF:[0-5]|ALL:[01]|PING)$/.test(command)) return;
    const session = this.session, writer = this.writer;
    this.queue = this.queue.then(async () => {
      if (this.ready && this.session === session) await writer.write(new TextEncoder().encode(command + '\n'));
    }).catch(() => { if (this.session === session) void this.disconnect('Uno 写入失败，继续网页游戏'); });
  }
  async disconnect(message = '已断开 Uno，继续网页游戏') {
    // Invalidate queued writes before asynchronous cleanup.
    ++this.session; this.ready = false; clearTimeout(this.timer);
    const port = this.port, reader = this.reader, writer = this.writer, task = this.readTask;
    this.port = this.reader = this.writer = this.readTask = null;
    this.onStatus(message, 'disconnected');
    try { await reader?.cancel(); await task; } catch { /* Already detached. */ }
    try { await this.queue; writer?.releaseLock(); } catch { /* Writer already released. */ }
    try { await port?.close(); } catch { /* USB unplugged. */ }
  }
}
