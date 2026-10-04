# HUTONG MOLES · 胡同地鼠

一个打地鼠游戏，网页和 Arduino Uno 实体按键、LED 一起玩。网页上就能玩；接上 Uno 以后，六个按键对应六个洞，地鼠冒头时对应的 LED 会亮。

在线玩：[胡同地鼠](https://hanjing-laura.vercel.app/dishu/)

## 目录

| 路径 | 内容 |
|---|---|
| `web/` | 网页游戏（原生 HTML/JS，不用构建）：`engine.mjs` 管游戏规则，`serial.mjs` 管 Web Serial 串口，`app.js` 管界面 |
| `firmware/hutong_moles/hutong_moles.ino` | Uno 固件：只读按键、点灯，游戏规则都在网页上跑 |
| `tests/` | 规则和串口的测试：`node --test tests/` |
| `docs/screenshots/` | 桌面端和手机端截图 |
| [`WIRING.md`](WIRING.md) | 接线说明 |
| [`LEARNING.md`](LEARNING.md) | 学习总结 |

## 怎么玩

1. 照 [`WIRING.md`](WIRING.md) 接好线，用 Arduino IDE 把 `firmware/hutong_moles/hutong_moles.ino` 烧进 Uno（不需要第三方库）。
2. 关掉串口监视器，在电脑上用 Chrome 或 Edge 打开网页，点「连接 Uno」，选 CH340 那个串口。
3. 等 6 颗灯跑完一圈，就可以开玩。玩的时候 USB 线要一直插着。

在本地跑网页：在 `web/` 目录里执行 `python -m http.server 8000`，然后打开 `http://localhost:8000`。Web Serial 只在 HTTPS 或 localhost 下能用。

## 串口协议（115200，每行以换行结尾）

- Uno 发给网页：`READY`（开机自检完成）、`HIT:n`（按下第 n 个键，n 为 0–5）、`PONG`
- 网页发给 Uno：`ON:n`、`OFF:n`、`ALL:1`、`ALL:0`、`PING`、`TEST`（自检）
