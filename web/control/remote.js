/* RZMONG Airsuspension — jalur INTERNET (remote lewat broker MQTT, wss).
 * Modul (firmware ≥0.4.0, mode STA + remote aktif) tersambung ke broker MQTT TLS. Web/aplikasi tersambung ke broker
 * yang sama lewat MQTT-over-WebSocket aman (wss), jadi bisa dari GitHub Pages (HTTPS) maupun aplikasi Android di mana saja.
 *
 * Topik (id perangkat dari kartu KEAMANAN → REMOTE INTERNET):
 *   rzm/<id>/status  retained, telemetri JSON (sama seperti status BLE + n = nonce, q = nomor urut terakhir)
 *   rzm/<id>/online  retained "1"/"0" (LWT)
 *   rzm/<id>/cmd     perintah: "<hmac-sha256 hex> <json>"  (kunci HMAC = kode akses; kode TIDAK pernah dikirim)
 *                    JSON = {"cmd":…, "n":<nonce dari status>, "q":<nomor urut > q terakhir>, "r":<id balasan>, …}
 *                    Pengecualian tanpa tanda tangan: {"cmd":"stop"} (keselamatan) dan {"cmd":"live"} (percepat telemetri).
 *   rzm/<id>/evt     balasan {"ev":…, "r":<id balasan>, "q":…}
 * API: window.RZMRemote.create(hooks) → transport {connect, writeLine, disconnect}. HMAC: RZMRemote.hmacHex(key, msg).
 */
(function () {
  "use strict";

  /* ---------- SHA-256 + HMAC (sinkron, tanpa crypto.subtle supaya jalan juga di http://) ---------- */
  var K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256(bytes) {
    var len = bytes.length, nBlk = ((len + 9 + 63) >> 6), buf = new Uint8Array(nBlk * 64);
    buf.set(bytes); buf[len] = 0x80;
    var bits = len * 8, dv = new DataView(buf.buffer);
    dv.setUint32(buf.length - 4, bits >>> 0); dv.setUint32(buf.length - 8, Math.floor(bits / 4294967296));
    var h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    var w = new Uint32Array(64);
    for (var off = 0; off < buf.length; off += 64) {
      for (var i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (i = 16; i < 64; i++) {
        var x = w[i - 15], y = w[i - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
    var out = new Uint8Array(32), odv = new DataView(out.buffer);
    for (i = 0; i < 8; i++) odv.setUint32(i * 4, h[i]);
    return out;
  }
  var enc = new TextEncoder();
  function hmacHex(key, msg) {
    var k = enc.encode(key), m = enc.encode(msg);
    if (k.length > 64) k = sha256(k);
    var ik = new Uint8Array(64 + m.length), ok = new Uint8Array(96);
    for (var i = 0; i < 64; i++) { var kb = i < k.length ? k[i] : 0; ik[i] = kb ^ 0x36; ok[i] = kb ^ 0x5c; }
    ik.set(m, 64);
    ok.set(sha256(ik), 64);
    return Array.prototype.map.call(sha256(ok), function (b) { return (b < 16 ? "0" : "") + b.toString(16); }).join("");
  }

  /* ---------- pemuat mqtt.js (lazy, hanya saat jalur INTERNET dipakai) ---------- */
  var mqttLoading = null;
  function loadMqtt() {
    if (window.mqtt) return Promise.resolve(window.mqtt);
    if (mqttLoading) return mqttLoading;
    mqttLoading = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = "vendor/mqtt.min.js";
      s.onload = function () { window.mqtt ? res(window.mqtt) : rej(new Error("mqtt.js tidak termuat")); };
      s.onerror = function () { mqttLoading = null; rej(new Error("Gagal memuat vendor/mqtt.min.js (offline?)")); };
      document.head.appendChild(s);
    });
    return mqttLoading;
  }

  /* ---------- pengaturan broker di HP ini ---------- */
  var CFG_KEY = "rzm.remote";
  function loadCfg() {
    var c = {};
    try { c = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { /* abaikan */ }
    return { host: c.host || "", port: c.port || 8084, user: c.user || "", pass: c.pass || "", id: c.id || "", remember: c.remember !== false };
  }
  function saveCfg(c) {
    var o = { host: c.host, port: c.port, user: c.user, id: c.id, remember: !!c.remember };
    if (c.remember) o.pass = c.pass;   // sandi broker hanya disimpan kalau dicentang
    localStorage.setItem(CFG_KEY, JSON.stringify(o));
  }
  // "xxxx.ala.asia-southeast1.emqxsl.com" → wss://…:8084/mqtt (EMQX Serverless; HiveMQ Cloud pakai port 8884) ; URL lengkap (ws://localhost:9001) dipakai apa adanya.
  function brokerUrl(c) {
    var h = String(c.host || "").trim();
    if (/^wss?:\/\//i.test(h)) return h;
    h = h.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
    return "wss://" + h + ":" + (Number(c.port) || 8084) + "/mqtt";
  }
  function cleanId(id) { return String(id || "").trim().toLowerCase().replace(/[^0-9a-f-]/g, ""); }
  function rand(n) { var s = ""; var a = new Uint8Array(n); crypto.getRandomValues(a); for (var i = 0; i < n; i++) s += (a[i] % 36).toString(36); return s; }

  var LOCAL_ONLY = ["security", "wifi", "remote", "rinfo"];

  function create(hooks) {
    // hooks: onStatus(obj), onEvent(ev, rid), onOnline(bool|null), getCode() → string, log(msg)
    var T = {
      client: null, cfg: loadCfg(), nonce: "", q: 0, online: null, lastStatus: 0, mine: {}, liveTimer: null, onDisc: null, closing: false,
      async connect(onDisc) {
        var c = T.cfg = loadCfg();
        c.id = cleanId(c.id);
        if (!c.host || !c.id) throw new Error("Isi alamat broker dan ID perangkat di Pengaturan INTERNET dulu.");
        var mqtt = await loadMqtt();
        T.onDisc = onDisc; T.closing = false; T.nonce = ""; T.q = 0; T.online = null; T.mine = {};
        var base = "rzm/" + c.id + "/";
        T.topics = { status: base + "status", online: base + "online", cmd: base + "cmd", evt: base + "evt" };
        var url = brokerUrl(c);
        await new Promise(function (res, rej) {
          var cl = mqtt.connect(url, {
            username: c.user || undefined, password: c.pass || undefined,
            clientId: "rzmweb-" + rand(10), clean: true, keepalive: 30, reconnectPeriod: 3000, connectTimeout: 10000, protocolVersion: 4,
          });
          var done = false;
          var to = setTimeout(function () { if (!done) { done = true; cl.end(true); rej(new Error("Broker tidak menjawab (cek alamat/port wss " + url + ")")); } }, 12000);
          cl.on("connect", function () {
            cl.subscribe([T.topics.status, T.topics.online, T.topics.evt], { qos: 0 }, function (err) {
              if (err) hooks.log("Gagal subscribe: " + err.message);
            });
            T.ping();
            if (!done) { done = true; clearTimeout(to); T.client = cl; res(); }
            else hooks.log("Broker tersambung lagi.");
          });
          cl.on("error", function (e) {
            var m = (e && e.message) || String(e);
            if (/not authorized|bad user|code 4|code 5/i.test(m)) m += " — cek username/sandi broker";
            if (!done) { done = true; clearTimeout(to); cl.end(true); rej(new Error(m)); }
            else hooks.log("Broker: " + m);
          });
          cl.on("offline", function () { if (done && !T.closing) { hooks.onOnline(null); hooks.log("Internet/broker terputus, menyambung ulang…"); } });
          cl.on("message", function (topic, payload) {
            var txt = new TextDecoder().decode(payload);
            if (topic === T.topics.online) { T.online = txt === "1"; hooks.onOnline(T.online); return; }
            var m; try { m = JSON.parse(txt); } catch (e) { return; }
            if (topic === T.topics.status) {
              if (typeof m.n === "string") { if (m.n !== T.nonce) T.q = 0; T.nonce = m.n; }
              if (typeof m.q === "number" && m.q > T.q) T.q = m.q;
              T.lastStatus = Date.now();
              hooks.onStatus(m);
            } else if (topic === T.topics.evt) {
              if (typeof m.q === "number" && m.q > T.q) T.q = m.q;
              var p = m.r && T.mine[m.r];
              if (!p) return;                                    // balasan untuk HP lain
              if (m.ev === "stale" && !p.retried && T.nonce) {   // nonce/urutan lama → tanda tangani ulang sekali
                p.retried = true; T.publishSigned(p.obj, p.key, m.r); return;
              }
              delete T.mine[m.r];
              hooks.onEvent(m.ev, m.r);
            }
          });
        });
        T.liveTimer = setInterval(T.ping, 20000);
        return "broker " + url.replace(/^wss?:\/\//, "") + " · id " + c.id;
      },
      ping() { if (T.client && T.client.connected) T.client.publish(T.topics.cmd, '{"cmd":"live"}', { qos: 0 }); },
      publishSigned(obj, key, rid) {
        T.q = Math.max(T.q + 1, 1);
        var body = Object.assign({}, obj, { n: T.nonce, q: T.q, r: rid });
        var json = JSON.stringify(body);
        T.client.publish(T.topics.cmd, hmacHex(key, json) + " " + json, { qos: 1 });
      },
      async writeLine(line) {
        if (!T.client || !T.client.connected) throw new Error("belum tersambung ke broker");
        var obj = JSON.parse(line);
        var rid = rand(8);
        if (obj.cmd === "stop") {                  // STOP tanpa tanda tangan, selalu dikirim
          T.mine[rid] = { obj: obj, key: "", t: Date.now(), retried: true };
          T.client.publish(T.topics.cmd, JSON.stringify({ cmd: "stop", r: rid }), { qos: 1 });
          return;
        }
        if (LOCAL_ONLY.indexOf(obj.cmd) >= 0) { hooks.onEvent("local_only", rid); return; }
        // Kode akses dipakai sebagai kunci HMAC dan TIDAK ikut dikirim ke broker.
        if (T.online === false) throw new Error("modul offline — perintah tidak dikirim (STOP tetap dikirim)");
        var key = typeof obj.code === "string" ? obj.code : hooks.getCode();
        delete obj.code;
        if (!key) { hooks.onEvent("need_auth", rid); return; }
        for (var w = 0; !T.nonce && w < 50 && T.client; w++) await new Promise(function (r) { setTimeout(r, 100); });   // tunggu status retained pertama
        if (!T.nonce) throw new Error(T.online === false ? "modul sedang offline" : "belum ada status dari modul (cek ID perangkat / modul belum pernah online)");
        T.mine[rid] = { obj: obj, key: key, t: Date.now() };
        for (var r in T.mine) if (Date.now() - T.mine[r].t > 30000) delete T.mine[r];
        T.publishSigned(obj, key, rid);
      },
      async disconnect() {
        T.closing = true;
        if (T.liveTimer) clearInterval(T.liveTimer);
        T.liveTimer = null;
        if (T.client) { var c = T.client; T.client = null; await new Promise(function (r) { c.end(false, {}, r); setTimeout(r, 1500); }); }
      },
    };
    return T;
  }

  window.RZMRemote = { create: create, hmacHex: hmacHex, sha256: sha256, loadCfg: loadCfg, saveCfg: saveCfg, brokerUrl: brokerUrl, cleanId: cleanId };
})();
