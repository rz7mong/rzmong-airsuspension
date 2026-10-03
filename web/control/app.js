/* RZMON-G Air Control — UI kontroler 2 titik.
 * Protokol mengikuti firmware/rzmong_airsuspension/rzmong_airsuspension.ino:
 *  - BLE nama "RZM-AIR", service Nordic UART 6e400001-…, RX (tulis) 6e400002-…, TX (notify) 6e400003-…
 *  - Perintah: JSON satu baris diakhiri "\n" → preset | set | auto | theme | manual | stop
 *  - Status (±4x/detik): {tank,front,rear,preset,comp,rise,drop,theme,pf,pr,fault}
 *  - WiFi: SoftAP "RZMONG-AIR" (IP 192.168.4.1) / STA. WebSocket ws://IP:81/ (baris JSON sama seperti BLE),
 *    cadangan HTTP: GET /api/status, POST /api/cmd (body = baris JSON perintah).
 *  - Field opsional yang belum dikirim firmware: speed (km/j), acc (bool) → UI siap kalau nanti ditambah.
 */
(() => {
  "use strict";
  const SVC = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
  const RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
  const TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
  const BAG_MIN = 15, BAG_MAX = 110, DEADBAND = 2, TANK_ON = 145, TANK_OFF = 165;
  const PRESET_NAMES = ["PARKIR", "JALAN", "TINGGI"];
  const THEMES = ["day", "night", "stance"];
  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const isNative = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform());

  const state = {
    tank: 150, front: 50, rear: 55, preset: 1, comp: false, rise: true, drop: false, theme: 1,
    pf: 50, pr: 55, fault: "", speed: 0, acc: undefined,
  };
  const presetVals = loadPresetCache();
  const ui = { tank: 0, front: 0, rear: 0, speed: 0 };       // nilai tampilan (dihaluskan)
  const manual = { front: null, rear: null };                  // "fill" | "dump" | null
  let demo = localStorage.getItem("rzm.demo") !== "0";
  let connected = false, part = "esp", dragging = null, lastRxLog = 0, hasSpeed = false;

  /* ---------------- util ---------------- */
  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const polar = (cx, cy, r, deg) => { const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  function arcPath(cx, cy, r, a0, a1) {
    const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  function loadPresetCache() {
    try { const v = JSON.parse(localStorage.getItem("rzm.presets")); if (Array.isArray(v) && v.length === 3) return v; } catch (e) { /* abaikan */ }
    return [{ f: 25, r: 25 }, { f: 50, r: 55 }, { f: 75, r: 80 }];   // default firmware
  }
  const savePresetCache = () => localStorage.setItem("rzm.presets", JSON.stringify(presetVals));

  function log(msg, cls = "sys") {
    const box = $("log");
    const line = document.createElement("div");
    line.className = cls;
    line.textContent = `${new Date().toLocaleTimeString("id-ID")} ${cls === "tx" ? "→" : cls === "rx" ? "←" : "•"} ${msg}`;
    box.prepend(line);
    while (box.childNodes.length > 80) box.lastChild.remove();
  }

  /* ---------------- transport BLE ---------------- */
  let rxBuf = "";
  const decoder = new TextDecoder();
  function onBytes(bytes) {
    rxBuf += decoder.decode(bytes, { stream: true });
    let i;
    while ((i = rxBuf.indexOf("\n")) >= 0) {
      const line = rxBuf.slice(0, i).trim();
      rxBuf = rxBuf.slice(i + 1);
      if (line) onLine(line);
    }
    if (rxBuf.length > 1024) rxBuf = "";
  }
  function onLine(line) {
    let msg;
    try { msg = JSON.parse(line); } catch (e) { log("JSON rusak: " + line.slice(0, 60)); return; }
    if (Date.now() - lastRxLog > 3000) { log(line, "rx"); lastRxLog = Date.now(); }
    applyStatus(msg);
  }

  const WebBle = {
    device: null, rx: null,
    async connect(onDisc) {
      if (!navigator.bluetooth) throw new Error("Browser ini tidak mendukung Web Bluetooth. Pakai Chrome/Edge di Android atau desktop, atau aplikasi Android RZMON-G.");
      this.device = await navigator.bluetooth.requestDevice({ filters: [{ name: "RZM-AIR" }, { namePrefix: "RZM" }], optionalServices: [SVC] });
      this.device.addEventListener("gattserverdisconnected", onDisc);
      setStatus("busy", "MENYAMBUNG");
      const server = await this.device.gatt.connect();
      const svc = await server.getPrimaryService(SVC);
      this.rx = await svc.getCharacteristic(RX_UUID);
      const tx = await svc.getCharacteristic(TX_UUID);
      tx.addEventListener("characteristicvaluechanged", (e) => { const v = e.target.value; onBytes(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); });
      await tx.startNotifications();
      return this.device.name || "RZM-AIR";
    },
    async write(chunk) {
      if (this.rx.writeValueWithResponse) await this.rx.writeValueWithResponse(chunk);
      else await this.rx.writeValue(chunk);
    },
    async disconnect() { if (this.device && this.device.gatt.connected) this.device.gatt.disconnect(); },
  };

  const NativeBle = {
    client: null, id: null,
    async connect(onDisc) {
      if (!this.client) this.client = (await import("./vendor/ble-native.js")).BleClient;
      const c = this.client;
      // Minta izin BLUETOOTH_SCAN/CONNECT (Android 12+) atau lokasi (Android ≤11).
      await c.initialize({ androidNeverForLocation: true });
      if (!(await c.isEnabled())) {
        try { await c.requestEnable(); } catch (e) { throw new Error("Bluetooth HP mati. Nyalakan Bluetooth lalu coba lagi."); }
      }
      const dev = await c.requestDevice({ namePrefix: "RZM", optionalServices: [SVC] });
      this.id = dev.deviceId;
      setStatus("busy", "MENYAMBUNG");
      await c.connect(this.id, () => onDisc());
      try { await c.startNotifications(this.id, SVC, TX_UUID, (dv) => onBytes(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength))); }
      catch (e) { await c.disconnect(this.id).catch(() => {}); throw e; }
      return dev.name || "RZM-AIR";
    },
    async write(chunk) { await this.client.write(this.id, SVC, RX_UUID, new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength)); },
    async disconnect() { if (this.id) await this.client.disconnect(this.id); },
  };
  const bleTransport = isNative ? NativeBle : WebBle;
  // BLE: potong 20 byte supaya aman di MTU default 23. Firmware menumpuk sampai "\n".
  for (const t of [WebBle, NativeBle]) t.writeLine = async function (line) {
    const bytes = new TextEncoder().encode(line + "\n");
    for (let i = 0; i < bytes.length; i += 20) await this.write(bytes.slice(i, i + 20));
  };

  /* WiFi: WebSocket port 81 untuk status live; kalau gagal, polling HTTP /api/status. */
  const WifiLink = {
    ws: null, timer: null, base: "", fails: 0, onDisc: null,
    parseHost(raw) {
      let h = String(raw || "").trim().replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
      if (!h) h = "192.168.4.1";
      return { http: "http://" + h, ws: "ws://" + h.replace(/:\d+$/, "") + ":81/" };
    },
    async connect(onDisc) {
      if (location.protocol === "https:" && !isNative) {
        throw new Error("Halaman HTTPS tidak boleh mengakses http:// modul (mixed content). Sambungkan HP ke WiFi RZMONG-AIR lalu buka http://192.168.4.1, atau pakai aplikasi Android.");
      }
      this.onDisc = onDisc; this.fails = 0;
      const u = this.parseHost($("wifiHost").value);
      this.base = u.http;
      setStatus("busy", "MENYAMBUNG");
      try {
        await new Promise((res, rej) => {
          const w = new WebSocket(u.ws);
          const to = setTimeout(() => { w.close(); rej(new Error("timeout WebSocket")); }, 4000);
          w.onopen = () => { clearTimeout(to); this.ws = w; res(); };
          w.onerror = () => { clearTimeout(to); rej(new Error("WebSocket gagal")); };
        });
        this.ws.onmessage = (e) => String(e.data).split("\n").forEach((l) => { l = l.trim(); if (l) onLine(l); });
        this.ws.onclose = () => { this.ws = null; if (this.onDisc) this.onDisc(); };
        return "WebSocket " + u.ws;
      } catch (e) {
        log("WebSocket tidak tersedia (" + e.message + "), pakai HTTP polling.");
      }
      const st = await this.fetchJson("/api/status");
      applyStatus(st);
      this.timer = setInterval(async () => {
        try { applyStatus(await this.fetchJson("/api/status")); this.fails = 0; }
        catch (e) { if (++this.fails >= 4) { this.stop(); if (this.onDisc) this.onDisc(); } }
      }, 500);
      return "HTTP " + this.base;
    },
    async fetchJson(path, opts = {}) {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 3000);
      try {
        const r = await fetch(this.base + path, { ...opts, signal: ctl.signal, cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        return await r.json();
      } finally { clearTimeout(to); }
    },
    async writeLine(line) {
      if (this.ws && this.ws.readyState === 1) { this.ws.send(line + "\n"); return; }
      // text/plain = "simple request", tanpa preflight CORS.
      applyStatus(await this.fetchJson("/api/cmd", { method: "POST", headers: { "Content-Type": "text/plain" }, body: line }));
    },
    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; },
    async disconnect() { this.onDisc = null; this.stop(); if (this.ws) { this.ws.close(); this.ws = null; } },
  };

  // Jalur aktif: "ble" atau "wifi". Default WiFi kalau halaman dibuka langsung dari modul (http://192.168.4.1 dll).
  const servedByModule = location.protocol === "http:" && !/^(localhost|127\.|\[::1\])/.test(location.hostname);
  let link = localStorage.getItem("rzm.link") || (servedByModule ? "wifi" : "ble");
  const savedHost = localStorage.getItem("rzm.host");
  let transport = link === "wifi" ? WifiLink : bleTransport;

  function setLink(l) {
    if (connected) { log("Putuskan koneksi dulu sebelum ganti jalur."); return; }
    link = l; transport = l === "wifi" ? WifiLink : bleTransport;
    localStorage.setItem("rzm.link", l);
    $("linkBle").classList.toggle("active", l === "ble");
    $("linkWifi").classList.toggle("active", l === "wifi");
    $("wifiHostBox").hidden = l !== "wifi";
    let hint = "";
    if (l === "ble") hint = isNative ? "BLE native: izinkan Bluetooth/Perangkat sekitar saat diminta." : navigator.bluetooth ? "" : "Browser ini tidak punya Web Bluetooth — pakai Chrome/Edge, aplikasi Android, atau jalur WiFi.";
    else hint = "Sambungkan HP ke WiFi RZMONG-AIR (sandi default rzmong123), lalu tekan Sambungkan. " + (location.protocol === "https:" && !isNative ? "Dari halaman HTTPS ini WiFi diblokir browser — buka http://192.168.4.1." : "");
    $("linkHint").textContent = hint.trim();
  }

  let writeQueue = Promise.resolve();
  function send(obj) {
    const line = JSON.stringify(obj);
    if (!connected) { log((demo ? "[demo] " : "[offline] ") + line, "tx"); return; }
    log(line, "tx");
    const t = transport;
    writeQueue = writeQueue.then(() => t.writeLine(line)).catch((e) => log("Gagal kirim: " + (e.message || e)));
  }

  async function connectToggle() {
    if (connected) { await transport.disconnect().catch(() => {}); onDisconnect(); return; }
    try {
      setStatus("busy", "MENCARI");
      const name = await transport.connect(onDisconnect);
      connected = true; rxBuf = "";
      setStatus("live", "TERHUBUNG");
      $("connectText").textContent = "PUTUSKAN";
      log(`Tersambung ke ${name} (${link === "wifi" ? "WiFi" : isNative ? "BLE aplikasi Android" : "Web Bluetooth"})`);
    } catch (e) {
      connected = false;
      setStatus(demo ? "demo" : "off", demo ? "DEMO" : "TERPUTUS");
      if (e && e.name === "NotFoundError") log("Pencarian dibatalkan.");
      else log("Gagal sambung: " + ((e && e.message) || e));
    }
  }
  function onDisconnect() {
    if (!connected) return;
    connected = false;
    $("connectText").textContent = "SAMBUNGKAN";
    setStatus(demo ? "demo" : "off", demo ? "DEMO" : "TERPUTUS");
    log("Koneksi terputus.");
  }
  function setStatus(s, text) { $("status").dataset.s = s; $("statusText").textContent = text; }

  /* ---------------- status dari modul ---------------- */
  function applyStatus(m) {
    for (const k of ["tank", "front", "rear", "pf", "pr", "speed"]) if (typeof m[k] === "number") state[k] = m[k];
    if (typeof m.preset === "number") state.preset = clamp(m.preset, 0, 2);
    for (const k of ["comp", "rise", "drop", "acc"]) if (typeof m[k] === "boolean") state[k] = m[k];
    if (typeof m.theme === "number") state.theme = clamp(m.theme, 0, 2);
    if (typeof m.fault === "string") state.fault = m.fault;
    if (typeof m.ip === "string") state.ip = m.ip;
    if (typeof m.speed === "number") hasSpeed = true;
    if (typeof m.pf === "number" && typeof m.pr === "number") {
      const p = presetVals[state.preset];
      if (p.f !== m.pf || p.r !== m.pr) { p.f = m.pf; p.r = m.pr; savePresetCache(); }
    }
    syncControls();
  }

  /* ---------------- simulasi demo ---------------- */
  const sim = { fillF: false, dumpF: false, fillR: false, dumpR: false };
  function simTick() {
    if (connected || !demo) return;
    const t = Date.now() / 1000;
    const step = (axle, target) => {
      const key = axle === "front" ? "F" : "R";
      let fill = false, dump = false;
      const man = manual[axle];
      if (man === "fill") fill = state.tank > state[axle] + 5;
      else if (man === "dump") dump = true;
      else if (state[axle] < target - DEADBAND) fill = state.tank > state[axle] + 5;
      else if (state[axle] > target + DEADBAND) dump = true;
      if (fill) { state[axle] += 0.45; state.tank -= 0.12; }
      if (dump) state[axle] -= 0.6;
      state[axle] = clamp(state[axle], 0, 200);
      sim["fill" + key] = fill; sim["dump" + key] = dump;
    };
    step("front", state.pf); step("rear", state.pr);
    if (state.tank < TANK_ON) state.comp = true;
    if (state.tank > TANK_OFF) state.comp = false;
    if (state.comp) state.tank += 0.3; else state.tank -= 0.004;
    state.speed = Math.max(0, 45 + 38 * Math.sin(t / 7) + 12 * Math.sin(t / 2.3));
    state.fault = "";
  }
  function valves() {
    if (!connected) return sim;
    // Firmware belum mengirim status katup → perkiraan dari psi vs target (deadband 2 psi).
    return {
      fillF: manual.front === "fill" || (!manual.front && state.front < clamp(state.pf, BAG_MIN, BAG_MAX) - DEADBAND),
      dumpF: manual.front === "dump" || (!manual.front && state.front > clamp(state.pf, BAG_MIN, BAG_MAX) + DEADBAND),
      fillR: manual.rear === "fill" || (!manual.rear && state.rear < clamp(state.pr, BAG_MIN, BAG_MAX) - DEADBAND),
      dumpR: manual.rear === "dump" || (!manual.rear && state.rear > clamp(state.pr, BAG_MIN, BAG_MAX) + DEADBAND),
    };
  }

  /* ---------------- HUD speedo ---------------- */
  const SPD_MAX = 200, A0 = -135, A1 = 135;
  let spdArc, needle, tankArc;
  function buildSpeedo() {
    const s = $("speedo");
    const defs = el("defs", {}, s);
    const g = el("linearGradient", { id: "spdGrad", x1: "0", y1: "1", x2: "1", y2: "0" }, defs);
    el("stop", { offset: "0", "stop-color": "var(--accent2)" }, g);
    el("stop", { offset: "1", "stop-color": "var(--accent)" }, g);
    const f = el("filter", { id: "glow", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
    el("feGaussianBlur", { stdDeviation: "3", result: "b" }, f);
    const m = el("feMerge", {}, f); el("feMergeNode", { in: "b" }, m); el("feMergeNode", { in: "SourceGraphic" }, m);
    el("circle", { cx: 120, cy: 120, r: 116, fill: "none", stroke: "var(--line)", "stroke-dasharray": "2 6" }, s);
    el("path", { d: arcPath(120, 120, 98, A0, A1), fill: "none", stroke: "rgba(255,255,255,.07)", "stroke-width": 12, "stroke-linecap": "round" }, s);
    spdArc = el("path", { d: arcPath(120, 120, 98, A0, A1), fill: "none", stroke: "url(#spdGrad)", "stroke-width": 12, "stroke-linecap": "round", pathLength: 100, "stroke-dasharray": "0 100", filter: "url(#glow)" }, s);
    for (let v = 0; v <= SPD_MAX; v += 10) {
      const a = A0 + (A1 - A0) * v / SPD_MAX, major = v % 40 === 0;
      const [x0, y0] = polar(120, 120, major ? 80 : 84, a), [x1, y1] = polar(120, 120, 89, a);
      el("line", { x1: x0, y1: y0, x2: x1, y2: y1, stroke: major ? "var(--text)" : "var(--dim)", "stroke-width": major ? 2 : 1, opacity: major ? .9 : .5 }, s);
      if (major) { const [tx, ty] = polar(120, 120, 68, a); const t = el("text", { x: tx, y: ty + 3, "text-anchor": "middle", fill: "var(--dim)", "font-size": 9, "font-family": "monospace" }, s); t.textContent = v; }
    }
    // cincin tangki (dalam)
    el("path", { d: arcPath(120, 120, 56, A0, A1), fill: "none", stroke: "rgba(255,255,255,.05)", "stroke-width": 4 }, s);
    tankArc = el("path", { d: arcPath(120, 120, 56, A0, A1), fill: "none", stroke: "var(--accent)", "stroke-width": 4, pathLength: 100, "stroke-dasharray": "0 100", opacity: .7 }, s);
    needle = el("g", {}, s);
    // jarum pendek di cincin luar supaya angka digital di tengah tetap terbaca
    el("path", { d: "M116.5 62 L120 20 L123.5 62 Z", fill: "var(--accent)", filter: "url(#glow)" }, needle);
  }

  /* ---------------- gauge PSI ---------------- */
  const G = {};
  function buildGauge(id, color) {
    const s = $(id), a0 = -130, a1 = 130;
    el("path", { d: arcPath(80, 80, 66, a0, a1), fill: "none", stroke: "rgba(255,255,255,.07)", "stroke-width": 10, "stroke-linecap": "round" }, s);
    for (let v = 0; v <= 120; v += 10) {
      const a = a0 + (a1 - a0) * v / 120; const [x0, y0] = polar(80, 80, 54, a), [x1, y1] = polar(80, 80, v % 30 ? 57 : 51, a);
      el("line", { x1: x0, y1: y0, x2: x1, y2: y1, stroke: "var(--dim)", "stroke-width": v % 30 ? .8 : 1.6 }, s);
    }
    // zona aman 15–110
    el("path", { d: arcPath(80, 80, 75, a0 + (a1 - a0) * BAG_MIN / 120, a0 + (a1 - a0) * BAG_MAX / 120), fill: "none", stroke: color, "stroke-width": 1.5, opacity: .35, "stroke-dasharray": "3 3" }, s);
    const arc = el("path", { d: arcPath(80, 80, 66, a0, a1), fill: "none", stroke: color, "stroke-width": 10, "stroke-linecap": "round", pathLength: 100, "stroke-dasharray": "0 100", style: `filter:drop-shadow(0 0 6px ${color})` }, s);
    const mark = el("g", {}, s);
    el("path", { d: "M80 4 L75 -6 L85 -6 Z", fill: "#fff", transform: "translate(0,8)" }, mark);
    G[id] = { arc, mark, a0, a1 };
  }
  function setGauge(id, psi, target) {
    const g = G[id], p = clamp(psi / 120, 0, 1);
    g.arc.setAttribute("stroke-dasharray", `${(p * 100).toFixed(2)} 100`);
    const ta = g.a0 + (g.a1 - g.a0) * clamp(target / 120, 0, 1);
    g.mark.setAttribute("transform", `rotate(${ta.toFixed(1)} 80 80)`);
  }

  /* ---------------- mobil (ilustrasi Grok, versi neon) ---------------- */
  const CAR = {};
  function buildCar() {
    const s = $("car");
    const defs = el("defs", {}, s);
    const bg = el("linearGradient", { id: "bodyGrad", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: 0, "stop-color": "color-mix(in srgb,var(--accent) 35%,#0b1a33)" }, bg);
    el("stop", { offset: 1, "stop-color": "#060c18" }, bg);
    CAR.lines = el("g", { opacity: .5 }, s);
    for (let i = 0; i < 6; i++) el("line", { x1: 0, y1: 40 + i * 18, x2: 40, y2: 40 + i * 18, stroke: "var(--accent)", "stroke-width": 1, class: "speedline", "data-i": i }, CAR.lines);
    el("line", { x1: 0, y1: 171, x2: 380, y2: 171, stroke: "var(--line)", "stroke-width": 2 }, s);
    CAR.road = el("line", { x1: 0, y1: 176, x2: 380, y2: 176, stroke: "var(--dim)", "stroke-width": 2, "stroke-dasharray": "18 22", opacity: .5 }, s);
    CAR.body = el("g", {}, s);
    el("path", { d: "M22 128 L24 106 Q26 94 46 92 L118 86 Q150 56 196 54 L252 56 Q284 60 312 86 L350 92 Q366 96 366 112 L364 128 Z", fill: "url(#bodyGrad)", stroke: "var(--accent)", "stroke-width": 2, style: "filter:drop-shadow(0 0 6px var(--accent))" }, CAR.body);
    el("path", { d: "M132 88 Q156 64 196 62 L248 64 Q272 68 292 88 Z", fill: "rgba(120,220,255,.12)", stroke: "var(--accent)", "stroke-width": 1, opacity: .8 }, CAR.body);
    el("line", { x1: 212, y1: 62, x2: 212, y2: 88, stroke: "var(--accent)", opacity: .5 }, CAR.body);
    el("rect", { x: 352, y: 100, width: 12, height: 6, rx: 3, fill: "#fff", style: "filter:drop-shadow(0 0 6px #fff)" }, CAR.body);
    el("rect", { x: 22, y: 102, width: 8, height: 6, rx: 3, fill: "var(--bad)", style: "filter:drop-shadow(0 0 6px var(--bad))" }, CAR.body);
    el("path", { d: "M40 120 H350", stroke: "var(--accent2)", "stroke-width": 1.5, opacity: .7 }, CAR.body);
    for (const x of [95, 292]) el("circle", { cx: x, cy: 132, r: 30, fill: "var(--bg)", stroke: "var(--line)" }, CAR.body);
    // balon udara di ruang roda (di atas bodi, di bawah roda)
    CAR.bags = {};
    for (const [axle, x, c] of [["rear", 95, "var(--rear)"], ["front", 292, "var(--front)"]]) {
      CAR.bags[axle] = el("rect", { x: x - 10, y: 100, width: 20, height: 40, rx: 8, fill: c, opacity: .85, style: `filter:drop-shadow(0 0 8px ${c})` }, s);
    }
    CAR.wheels = [];
    for (const x of [95, 292]) {
      const w = el("g", {}, s);
      el("circle", { cx: x, cy: 148, r: 23, fill: "#05070d", stroke: "var(--accent)", "stroke-width": 3 }, w);
      const spokes = el("g", {}, w);
      for (let i = 0; i < 5; i++) { const [sx, sy] = polar(x, 148, 15, i * 72); el("line", { x1: x, y1: 148, x2: sx, y2: sy, stroke: "var(--dim)", "stroke-width": 2 }, spokes); }
      el("circle", { cx: x, cy: 148, r: 4, fill: "var(--accent)" }, w);
      CAR.wheels.push({ g: spokes, x });
    }
    CAR.tf = el("text", { x: 292, y: 30, "text-anchor": "middle", fill: "var(--front)", "font-size": 13, "font-family": "monospace" }, s);
    CAR.tr = el("text", { x: 95, y: 30, "text-anchor": "middle", fill: "var(--rear)", "font-size": 13, "font-family": "monospace" }, s);
    CAR.rot = 0;
  }
  const lift = (psi) => 14 - (clamp(psi, 0, 120) - BAG_MIN) / (BAG_MAX - BAG_MIN) * 28;
  function drawCar(dt) {
    const dyF = lift(ui.front), dyR = lift(ui.rear);
    const ang = Math.atan2(dyF - dyR, 292 - 95) * 180 / Math.PI;
    CAR.body.setAttribute("transform", `translate(0 ${((dyF + dyR) / 2).toFixed(2)}) rotate(${ang.toFixed(2)} 193 110)`);
    for (const [axle, dy] of [["front", dyF], ["rear", dyR]]) {
      const top = 100 + dy, b = CAR.bags[axle];
      b.setAttribute("y", top.toFixed(1)); b.setAttribute("height", (140 - top).toFixed(1));
    }
    CAR.rot = (CAR.rot + ui.speed * dt * 0.9) % 360;
    for (const w of CAR.wheels) w.g.setAttribute("transform", `rotate(${CAR.rot.toFixed(1)} ${w.x} 148)`);
    CAR.road.setAttribute("stroke-dashoffset", (-(CAR.rot * 1.2) % 40).toFixed(1));
    CAR.lines.setAttribute("opacity", clamp(ui.speed / 120, 0, .7).toFixed(2));
    CAR.lines.querySelectorAll("line").forEach((l, i) => { const x = (((Date.now() / (6 - i * .5)) * (ui.speed / 60)) % 420) - 40; l.setAttribute("x1", 380 - x); l.setAttribute("x2", 420 - x); });
    CAR.tf.textContent = `DEPAN ${Math.round(ui.front)} psi`;
    CAR.tr.textContent = `BELAKANG ${Math.round(ui.rear)} psi`;
  }

  /* ---------------- diagram hardware (fitur Grok, diperluas) ---------------- */
  const parts = {
    pump: ["⚙️ Kompresor", "Mengisi tangki. Hidup di bawah 145 psi, mati di 165 psi. Jangan lewat relay kecil — pakai relay 40 A di GPIO 13.", () => `Status: <b>${state.comp ? "HIDUP" : "MATI"}</b>`],
    tank: ["🛢️ Tangki", "Penyimpan udara. Sensor tangki (ADS1115 A0) membaca psi yang tampil di HUD dan layar bulat.", () => `Tekanan: <b>${Math.round(state.tank)} psi</b>`],
    esp: ["🎛️ ESP32", "Otak modul. Membaca sensor, menggerakkan solenoid, dan bicara ke HP lewat Bluetooth RZM-AIR atau WiFi RZMONG-AIR (192.168.4.1).", () => `Link: <b>${connected ? "TERHUBUNG" : demo ? "DEMO" : "TERPUTUS"}</b> · jalur <b>${link === "wifi" ? "WiFi" : "Bluetooth"}</b>${state.ip ? " · IP " + state.ip : ""}`],
    valve: ["🔧 Solenoid", "Empat katup NC: isi/buang depan (GPIO 25/26) dan isi/buang belakang (GPIO 27/14).", () => { const v = valves(); return `Isi D <b>${v.fillF ? "●" : "○"}</b> · Buang D <b>${v.dumpF ? "●" : "○"}</b> · Isi B <b>${v.fillR ? "●" : "○"}</b> · Buang B <b>${v.dumpR ? "●" : "○"}</b>`; }],
    sensor: ["📟 Sensor", "Tiga sensor 0–200 psi (0,5–4,5 V) ke ADS1115: A0 tangki, A1 depan, A2 belakang. Bukan ADC internal ESP32.", () => `T ${Math.round(state.tank)} · D ${Math.round(state.front)} · B ${Math.round(state.rear)} psi`],
    front: ["🔵 Depan", "Dua balon satu saluran. Sensor hanya satu angka. Bocor di satu balon mengempiskan keduanya.", () => `Aktual <b>${Math.round(state.front)}</b> / target <b>${state.pf}</b> psi`],
    rear: ["🟣 Belakang", "Sama seperti depan, saluran terpisah. Preset menyimpan psi depan dan belakang sendiri.", () => `Aktual <b>${Math.round(state.rear)}</b> / target <b>${state.pr}</b> psi`],
  };
  const HW = {};
  function buildHw() {
    const s = $("hw");
    const box = (key, x, y, w, h, label, color) => {
      const g = el("g", { class: "hit", "data-part": key }, s);
      el("rect", { x, y, width: w, height: h, rx: 10, fill: "rgba(10,20,40,.85)", stroke: color, "stroke-width": 1.5 }, g);
      const t = el("text", { x: x + w / 2, y: y + h / 2 + 4, "text-anchor": "middle", fill: "var(--text)", "font-size": 11 }, g); t.textContent = label;
      return g;
    };
    // jalur udara
    HW.lineTank = el("path", { d: "M148 22 V10 H317 V22", class: "flow", fill: "none", stroke: "var(--accent)", "stroke-width": 3 }, s);
    HW.linePump = el("path", { d: "M92 44 H122", class: "flow", fill: "none", stroke: "var(--accent)", "stroke-width": 3 }, s);
    HW.lineF = el("path", { d: "M300 66 V116 H95 V136 M60 136 H130 M60 136 V146 M130 136 V146", class: "flow", fill: "none", stroke: "var(--front)", "stroke-width": 3 }, s);
    HW.lineR = el("path", { d: "M334 66 V126 H265 V136 M230 136 H300 M230 136 V146 M300 136 V146", class: "flow", fill: "none", stroke: "var(--rear)", "stroke-width": 3 }, s);
    el("path", { d: "M270 44 H288", stroke: "var(--dim)", "stroke-dasharray": "2 3", fill: "none" }, s);
    box("pump", 16, 22, 76, 44, "⚙️ pompa", "var(--dim)");
    HW.pump = s.lastChild.querySelector("rect");
    const tank = el("g", { class: "hit", "data-part": "tank" }, s);
    el("rect", { x: 122, y: 22, width: 52, height: 76, rx: 18, fill: "rgba(10,20,40,.85)", stroke: "var(--accent)", "stroke-width": 1.5 }, tank);
    HW.tankLvl = el("rect", { x: 126, y: 60, width: 44, height: 34, rx: 14, fill: "var(--accent)", opacity: .25 }, tank);
    HW.tankTxt = el("text", { x: 148, y: 64, "text-anchor": "middle", fill: "var(--text)", "font-size": 11, "font-family": "monospace" }, tank);
    box("esp", 196, 22, 74, 44, "🎛️ ESP32", "var(--accent)");
    HW.ble = el("g", { class: "hit", "data-part": "esp" }, s);
    for (let i = 0; i < 3; i++) el("path", { d: arcPath(233, 22, 6 + i * 5, -40, 40), fill: "none", stroke: "var(--accent)", "stroke-width": 1.5, class: "blewave", style: `animation:pulse 1.2s ${i * .2}s infinite` }, HW.ble);
    box("valve", 288, 22, 60, 44, "", "var(--warn)");
    HW.leds = ["fillF", "dumpF", "fillR", "dumpR"].map((k, i) => el("circle", { cx: 300 + i * 12, cy: 44, r: 4, fill: "#223", stroke: "var(--warn)" }, s.lastChild));
    const sens = el("g", { class: "hit", "data-part": "sensor" }, s);
    for (const [x, y] of [[176, 116], [282, 126], [174, 60]]) { el("circle", { cx: x, cy: y, r: 7, fill: "rgba(10,20,40,.95)", stroke: "#3dffa8", "stroke-width": 1.5 }, sens); el("line", { x1: x, y1: y, x2: x + 3, y2: y - 4, stroke: "#3dffa8" }, sens); }
    HW.bags = {};
    for (const [axle, xs, c] of [["front", [60, 130], "var(--front)"], ["rear", [230, 300], "var(--rear)"]]) {
      const g = el("g", { class: "hit", "data-part": axle }, s);
      HW.bags[axle] = xs.map((x) => {
        el("rect", { x: x - 26, y: 214, width: 52, height: 6, rx: 3, fill: "var(--dim)", opacity: .5 }, g);
        const b = el("rect", { x: x - 22, y: 170, width: 44, height: 44, rx: 18, fill: "rgba(10,20,40,.9)", stroke: c, "stroke-width": 2.5, style: `filter:drop-shadow(0 0 6px ${c})` }, g);
        const rib = el("line", { x1: x - 20, y1: 192, x2: x + 20, y2: 192, stroke: c, opacity: .5 }, g);
        return { b, rib };
      });
      const t = el("text", { x: (xs[0] + xs[1]) / 2, y: 236, "text-anchor": "middle", fill: c, "font-size": 11, "font-family": "monospace" }, g);
      HW.bags[axle].label = t;
    }
    s.addEventListener("click", (e) => { const h = e.target.closest(".hit"); if (h) selectPart(h.dataset.part); });
    $("chips").innerHTML = Object.entries(parts).map(([k, v]) => `<button class="chip" data-part="${k}">${v[0]}</button>`).join("");
    $("chips").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) selectPart(b.dataset.part); });
    selectPart(part);
  }
  function selectPart(k) {
    part = k;
    document.querySelectorAll("#chips .chip").forEach((b) => b.classList.toggle("on", b.dataset.part === k));
    document.querySelectorAll("#hw .hit").forEach((g) => g.classList.toggle("sel", g.dataset.part === k));
    drawInfo();
  }
  function drawInfo() { const [t, d, live] = parts[part]; $("info").innerHTML = `<b>${t}</b> — ${d}<br><small>${live()}</small>`; }
  function drawHw() {
    const v = valves();
    HW.linePump.classList.toggle("idle", !state.comp);
    HW.pump.setAttribute("stroke", state.comp ? "var(--ok)" : "var(--dim)");
    HW.lineTank.classList.toggle("idle", !(v.fillF || v.fillR));
    HW.lineF.classList.toggle("idle", !(v.fillF || v.dumpF));
    HW.lineR.classList.toggle("idle", !(v.fillR || v.dumpR));
    HW.lineF.style.animationDirection = v.dumpF ? "reverse" : "normal";
    HW.lineR.style.animationDirection = v.dumpR ? "reverse" : "normal";
    ["fillF", "dumpF", "fillR", "dumpR"].forEach((k, i) => { HW.leds[i].setAttribute("fill", v[k] ? (k.startsWith("fill") ? "var(--ok)" : "var(--warn)") : "#223"); });
    const lv = clamp(ui.tank / 200, 0, 1) * 68;
    HW.tankLvl.setAttribute("y", (94 - lv).toFixed(1)); HW.tankLvl.setAttribute("height", lv.toFixed(1));
    HW.tankTxt.textContent = Math.round(ui.tank);
    HW.ble.style.display = connected || demo ? "" : "none";
    for (const axle of ["front", "rear"]) {
      const h = 22 + clamp(ui[axle], 0, 120) / BAG_MAX * 26;
      HW.bags[axle].forEach(({ b, rib }) => { b.setAttribute("y", (214 - h).toFixed(1)); b.setAttribute("height", h.toFixed(1)); rib.setAttribute("y1", (214 - h / 2).toFixed(1)); rib.setAttribute("y2", (214 - h / 2).toFixed(1)); });
      HW.bags[axle].label.textContent = `${axle === "front" ? "depan" : "belakang"} ${Math.round(ui[axle])}`;
    }
  }

  /* ---------------- kontrol ---------------- */
  function syncControls() {
    document.querySelectorAll("#presets .preset").forEach((b) => b.classList.toggle("active", Number(b.dataset.id) === state.preset));
    document.querySelectorAll("#presets small").forEach((s) => { const p = presetVals[s.dataset.v]; s.textContent = `${p.f}/${p.r}`; });
    $("presetTag").textContent = PRESET_NAMES[state.preset];
    if (dragging !== "front") { $("frontRange").value = state.pf; $("frontOut").value = state.pf; }
    if (dragging !== "rear") { $("rearRange").value = state.pr; $("rearOut").value = state.pr; }
    $("pfVal").textContent = state.pf; $("prVal").textContent = state.pr;
    $("rise").classList.toggle("on", !!state.rise);
    $("drop").classList.toggle("on", !!state.drop);
    document.body.dataset.theme = THEMES[state.theme] || "night";
    document.querySelectorAll("#themes button").forEach((b) => b.classList.toggle("active", Number(b.dataset.id) === state.theme));
    $("fault").textContent = state.fault ? "⚠️ " + state.fault.toUpperCase() : "";
    const c = $("comp"); c.classList.toggle("on", !!state.comp); c.querySelector("span").textContent = state.comp ? "HIDUP" : "MATI";
    $("accTag").textContent = typeof state.acc === "boolean" ? (state.acc ? "🔑 ACC ON" : "🔑 ACC OFF") : "SPEEDO";
    const v = valves();
    for (const [axle, f, d] of [["front", v.fillF, v.dumpF], ["rear", v.fillR, v.dumpR]]) {
      const n = $(axle + "State"); n.className = "g-state" + (f ? " fill" : d ? " dump" : "");
      n.textContent = f ? "▲ MENGISI" : d ? "▼ MEMBUANG" : "● STABIL";
    }
  }

  function bindControls() {
    $("connect").onclick = connectToggle;
    $("linkBle").onclick = () => setLink("ble");
    $("linkWifi").onclick = () => setLink("wifi");
    $("wifiHost").value = savedHost || (servedByModule ? location.host : "192.168.4.1");
    $("wifiHost").addEventListener("change", () => localStorage.setItem("rzm.host", $("wifiHost").value.trim()));
    setLink(link);
    $("presets").addEventListener("click", (e) => {
      const b = e.target.closest(".preset"); if (!b) return;
      state.preset = Number(b.dataset.id);
      const p = presetVals[state.preset]; state.pf = p.f; state.pr = p.r;
      send({ cmd: "preset", id: state.preset }); syncControls();
    });
    for (const axle of ["front", "rear"]) {
      const r = $(axle + "Range"), key = axle === "front" ? "pf" : "pr";
      r.addEventListener("pointerdown", () => { dragging = axle; });
      r.addEventListener("input", () => { dragging = axle; state[key] = Number(r.value); $(axle + "Out").value = r.value; presetVals[state.preset][axle === "front" ? "f" : "r"] = state[key]; syncControls(); });
      // Kirim saat dilepas saja: firmware menyimpan ke flash (NVS) setiap perintah "set".
      r.addEventListener("change", () => { dragging = null; savePresetCache(); send({ cmd: "set", axle, psi: Number(r.value) }); });
    }
    $("rise").onclick = () => { state.rise = !state.rise; send({ cmd: "auto", rise: state.rise, drop: state.drop }); syncControls(); };
    $("drop").onclick = () => { state.drop = !state.drop; send({ cmd: "auto", rise: state.rise, drop: state.drop }); syncControls(); };
    $("themes").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.theme = Number(b.dataset.id); send({ cmd: "theme", id: state.theme }); syncControls(); });
    const goPreset = (id) => { state.preset = id; const p = presetVals[id]; state.pf = p.f; state.pr = p.r; send({ cmd: "preset", id }); syncControls(); };
    $("allUp").onclick = () => goPreset(2);
    $("allDown").onclick = () => goPreset(0);
    $("stop").onclick = () => { manual.front = manual.rear = null; send({ cmd: "stop" }); if (navigator.vibrate) navigator.vibrate(60); };
    document.querySelectorAll(".hold").forEach((b) => {
      const axle = b.dataset.axle, action = b.dataset.action;
      const start = (e) => { e.preventDefault(); if (manual[axle] === action) return; manual[axle] = action; b.classList.add("pressed"); if (navigator.vibrate) navigator.vibrate(15); send({ cmd: "manual", axle, action }); };
      const end = () => { if (manual[axle] !== action) return; manual[axle] = null; b.classList.remove("pressed"); send({ cmd: "manual", axle, action: "stop" }); };
      b.addEventListener("pointerdown", start);
      ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, end));
      b.addEventListener("contextmenu", (e) => e.preventDefault());
    });
    $("staSave").onclick = () => {
      if (!connected) { log("Sambungkan ke modul dulu (BLE atau WiFi) untuk menyimpan WiFi."); return; }
      send({ cmd: "wifi", ssid: $("staSsid").value.trim(), pass: $("staPass").value });
      log("Pengaturan WiFi dikirim. Cek IP modul di kartu ESP32 / Serial Monitor.");
    };
    $("demoToggle").onclick = () => {
      demo = !demo; localStorage.setItem("rzm.demo", demo ? "1" : "0");
      $("demoToggle").textContent = "MODE DEMO: " + (demo ? "ON" : "OFF");
      if (!connected) setStatus(demo ? "demo" : "off", demo ? "DEMO" : "TERPUTUS");
    };
    $("demoToggle").textContent = "MODE DEMO: " + (demo ? "ON" : "OFF");
  }

  /* ---------------- loop render ---------------- */
  let lastT = performance.now(), lastSim = 0, lastInfo = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (now - lastSim > 50) { simTick(); lastSim = now; }
    const k = 1 - Math.pow(0.001, dt);                 // pelunakan eksponensial
    for (const key of ["tank", "front", "rear", "speed"]) ui[key] += (state[key] - ui[key]) * k;
    const showSpeed = !connected || hasSpeed;
    $("speedVal").textContent = showSpeed ? Math.round(ui.speed) : "--";
    $("speedNote").textContent = showSpeed ? "" : "firmware belum mengirim data kecepatan";
    const sp = showSpeed ? clamp(ui.speed / SPD_MAX, 0, 1) : 0;
    spdArc.setAttribute("stroke-dasharray", `${(sp * 100).toFixed(2)} 100`);
    needle.setAttribute("transform", `rotate(${(A0 + (A1 - A0) * sp).toFixed(2)} 120 120)`);
    tankArc.setAttribute("stroke-dasharray", `${(clamp(ui.tank / 200, 0, 1) * 100).toFixed(2)} 100`);
    $("tankVal").textContent = Math.round(ui.tank);
    $("tankFill").style.width = clamp(ui.tank / 200 * 100, 0, 100) + "%";
    $("frontVal").textContent = Math.round(ui.front);
    $("rearVal").textContent = Math.round(ui.rear);
    setGauge("gFront", ui.front, state.pf);
    setGauge("gRear", ui.rear, state.pr);
    drawCar(dt);
    drawHw();
    if (now - lastInfo > 300) { syncControls(); drawInfo(); lastInfo = now; }
    requestAnimationFrame(frame);
  }

  /* ---------------- PWA ---------------- */
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("install").hidden = false; });
  function initPwa() {
    $("install").onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("install").hidden = true; };
    if (!isNative && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js").catch((e) => log("Service worker gagal: " + e.message));
    }
  }

  /* ---------------- start ---------------- */
  buildSpeedo();
  buildGauge("gFront", "var(--front)");
  buildGauge("gRear", "var(--rear)");
  buildCar();
  buildHw();
  bindControls();
  initPwa();
  Object.assign(ui, { tank: state.tank, front: 20, rear: 20, speed: 0 });
  setStatus(demo ? "demo" : "off", demo ? "DEMO" : "TERPUTUS");
  log(`Siap. BLE: ${isNative ? "native (Capacitor)" : navigator.bluetooth ? "Web Bluetooth" : "tidak tersedia"} · WiFi: WebSocket/HTTP. Jalur aktif: ${link === "wifi" ? "WiFi" : "Bluetooth"}. ${demo ? "Mode demo aktif." : ""}`);
  syncControls();
  requestAnimationFrame(frame);
  window.RZM = { state, send, applyStatus };   // untuk debug di konsol
})();
