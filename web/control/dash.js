/* RZMONG Airsuspension — tampilan DASHBOARD (gaya kontroler manifold: tangki, 4 sudut, preset, naik/turun per as).
 * Desain & gambar orisinal RZMONG (tanpa logo/aset pihak lain). Dipakai di web (GitHub Pages), modul (192.168.4.1),
 * dan aplikasi Android. Data & perintah lewat API dari app.js (RZMDash.mount(api)), jadi BLE / WiFi / INTERNET sama saja.
 * Catatan hardware: 2 sensor (depan & belakang). Balon kiri & kanan satu as berbagi satu saluran, jadi angkanya sama.
 */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var A = null, E = {}, armed = null, armTimer = 0, lastSync = 0;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  function polar(cx, cy, r, deg) { var a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function arc(cx, cy, r, a0, a1) {
    var p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    return "M" + p0[0].toFixed(2) + " " + p0[1].toFixed(2) + " A" + r + " " + r + " 0 " + (a1 - a0 > 180 ? 1 : 0) + " 1 " + p1[0].toFixed(2) + " " + p1[1].toFixed(2);
  }

  /* ---------- mobil tampak atas + 4 gelembung tekanan ---------- */
  var CORNERS = [
    { k: "fl", axle: "front", x: 40, y: 112, wx: 83, lbl: "DEPAN KIRI" },
    { k: "fr", axle: "front", x: 280, y: 112, wx: 237, lbl: "DEPAN KANAN" },
    { k: "rl", axle: "rear", x: 40, y: 308, wx: 83, lbl: "BLKG KIRI" },
    { k: "rr", axle: "rear", x: 280, y: 308, wx: 237, lbl: "BLKG KANAN" },
  ];
  function buildCar() {
    var s = $("dCar");
    var defs = el("defs", {}, s);
    var g = el("linearGradient", { id: "dBody", x1: "0", y1: "0", x2: "1", y2: "0" }, defs);
    el("stop", { offset: "0", "stop-color": "var(--car2)" }, g);
    el("stop", { offset: ".5", "stop-color": "var(--car1)" }, g);
    el("stop", { offset: "1", "stop-color": "var(--car2)" }, g);
    var gl = el("linearGradient", { id: "dGlass", x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
    el("stop", { offset: "0", "stop-color": "var(--accent)", "stop-opacity": ".35" }, gl);
    el("stop", { offset: "1", "stop-color": "var(--accent)", "stop-opacity": ".08" }, gl);
    // garis lantai / grid halus
    for (var y = 30; y < 410; y += 30) el("line", { x1: 70, y1: y, x2: 250, y2: y, stroke: "var(--line)", "stroke-width": .6, opacity: .5 }, s);
    E.shadow = el("ellipse", { cx: 160, cy: 212, rx: 92, ry: 190, fill: "#000", opacity: .28 }, s);
    // roda (di bawah bodi)
    [[74, 88], [228, 88], [74, 286], [228, 286]].forEach(function (p) { el("rect", { x: p[0], y: p[1], width: 18, height: 48, rx: 6, fill: "var(--wheel)", stroke: "var(--line)" }, s); });
    E.car = el("g", {}, s);
    el("path", { d: "M160 34 C206 34 228 50 232 82 L236 150 L236 300 C236 352 226 380 160 388 C94 380 84 352 84 300 L84 150 L88 82 C92 50 114 34 160 34 Z", fill: "url(#dBody)", stroke: "var(--accent)", "stroke-opacity": ".55", "stroke-width": 1.6 }, E.car);
    el("path", { d: "M104 64 Q160 50 216 64", fill: "none", stroke: "var(--line)", "stroke-width": 1.2 }, E.car);
    el("path", { d: "M120 92 L118 132 M200 92 L202 132", stroke: "var(--line)", "stroke-width": 1.2 }, E.car);
    el("path", { d: "M104 142 Q160 122 216 142 L206 184 Q160 174 114 184 Z", fill: "url(#dGlass)", stroke: "var(--line)" }, E.car);
    el("rect", { x: 113, y: 190, width: 94, height: 92, rx: 14, fill: "var(--car2)", stroke: "var(--line)" }, E.car);
    el("path", { d: "M114 288 Q160 296 206 288 L214 324 Q160 336 106 324 Z", fill: "url(#dGlass)", stroke: "var(--line)" }, E.car);
    el("path", { d: "M84 158 l-12 -6 l0 14 z M236 158 l12 -6 l0 14 z", fill: "var(--car1)", stroke: "var(--line)" }, E.car);
    el("ellipse", { cx: 112, cy: 50, rx: 14, ry: 5, fill: "#fff", opacity: .75, transform: "rotate(-14 112 50)" }, E.car);
    el("ellipse", { cx: 208, cy: 50, rx: 14, ry: 5, fill: "#fff", opacity: .75, transform: "rotate(14 208 50)" }, E.car);
    el("rect", { x: 98, y: 368, width: 30, height: 6, rx: 3, fill: "var(--bad)", opacity: .85 }, E.car);
    el("rect", { x: 192, y: 368, width: 30, height: 6, rx: 3, fill: "var(--bad)", opacity: .85 }, E.car);
    var t = el("text", { x: 160, y: 241, "text-anchor": "middle", fill: "var(--dim)", "font-size": 11, "letter-spacing": "3", "font-family": "var(--mono)" }, E.car); t.textContent = "RZMONG";
    E.tankDot = el("circle", { cx: 160, cy: 258, r: 3, fill: "var(--accent)" }, E.car);
    // saluran udara as depan & belakang
    E.lineF = el("path", { d: "M40 112 H83 M237 112 H280", stroke: "var(--front)", "stroke-width": 2, "stroke-dasharray": "3 4", opacity: .7 }, s);
    E.lineR = el("path", { d: "M40 308 H83 M237 308 H280", stroke: "var(--rear)", "stroke-width": 2, "stroke-dasharray": "3 4", opacity: .7 }, s);
    E.bub = {};
    CORNERS.forEach(function (c) {
      var col = c.axle === "front" ? "var(--front)" : "var(--rear)";
      var gg = el("g", { class: "d-bub", "data-axle": c.axle }, s);
      el("circle", { cx: c.x, cy: c.y, r: 33, fill: "var(--surface)", stroke: "var(--line)", "stroke-width": 1 }, gg);
      el("path", { d: arc(c.x, c.y, 28, -140, 140), fill: "none", stroke: "var(--track)", "stroke-width": 5, "stroke-linecap": "round" }, gg);
      var a = el("path", { d: arc(c.x, c.y, 28, -140, 140), fill: "none", stroke: col, "stroke-width": 5, "stroke-linecap": "round", pathLength: 100, "stroke-dasharray": "0 100" }, gg);
      var mk = el("circle", { cx: c.x, cy: c.y - 28, r: 3.2, fill: "#fff", stroke: col }, gg);
      var v = el("text", { x: c.x, y: c.y + 6, "text-anchor": "middle", fill: "var(--text)", "font-size": 20, "font-weight": 700, "font-family": "var(--mono)" }, gg);
      var st = el("text", { x: c.x, y: c.y + 23, "text-anchor": "middle", fill: "var(--dim)", "font-size": 8.5, "font-family": "var(--mono)" }, gg);
      var lb = el("text", { x: c.x, y: c.y - 39, "text-anchor": "middle", fill: col, "font-size": 8, "letter-spacing": "1", "font-family": "var(--mono)" }, gg);
      lb.textContent = c.lbl;
      E.bub[c.k] = { a: a, mk: mk, v: v, st: st, c: c };
    });
  }
  function buildTank() {
    var s = $("dTankG");
    el("path", { d: arc(100, 100, 80, -110, 110), fill: "none", stroke: "var(--track)", "stroke-width": 12, "stroke-linecap": "round" }, s);
    // zona kompresor hidup/mati (145/165 psi dari 200)
    var a145 = -110 + 220 * 145 / 200, a165 = -110 + 220 * 165 / 200;
    el("path", { d: arc(100, 100, 94, a145, a165), fill: "none", stroke: "var(--ok)", "stroke-width": 3, opacity: .7 }, s);
    for (var v = 0; v <= 200; v += 25) {
      var a = -110 + 220 * v / 200, p0 = polar(100, 100, 66, a), p1 = polar(100, 100, v % 50 ? 70 : 62, a);
      el("line", { x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], stroke: "var(--dim)", "stroke-width": v % 50 ? .8 : 1.6 }, s);
    }
    E.tankArc = el("path", { d: arc(100, 100, 80, -110, 110), fill: "none", stroke: "var(--accent)", "stroke-width": 12, "stroke-linecap": "round", pathLength: 100, "stroke-dasharray": "0 100" }, s);
  }

  /* ---------- kontrol ---------- */
  function needConfirm() { var c = A.conn(); return c.connected && c.link === "remote"; }
  // Lewat internet: ketuk sekali = pilih, ketuk lagi dalam 3 dtk = jalankan (mencegah salah pencet dari jauh).
  function confirmThen(key, btn, fn) {
    if (!needConfirm() || armed === key) { disarm(); fn(); return; }
    disarm(); armed = key; btn.classList.add("armed");
    $("dMsg").textContent = "Lewat internet: ketuk sekali lagi untuk menjalankan.";
    armTimer = setTimeout(disarm, 3000);
  }
  function disarm() { armed = null; clearTimeout(armTimer); document.querySelectorAll("#dash .armed").forEach(function (b) { b.classList.remove("armed"); }); }
  function bind() {
    $("dPresets").addEventListener("click", function (e) {
      var b = e.target.closest(".d-pre"); if (!b) return;
      var id = Number(b.dataset.id);
      confirmThen("p" + id, b, function () { A.goPreset(id); });
    });
    $("dUp").onclick = function () { confirmThen("up", $("dUp"), function () { A.goPreset(2); }); };
    $("dDown").onclick = function () { confirmThen("down", $("dDown"), function () { A.goPreset(0); }); };
    $("dStop").onclick = function () { disarm(); A.stop(); };
    $("dConn").addEventListener("click", function () { var c = A.conn(); if (!c.connected) A.connect(); else if (!c.authOk) A.unlock(); });
    document.querySelectorAll("#dash .d-step").forEach(function (b) {
      var timer = 0, rep = 0;
      var step = function () {
        var axle = b.dataset.axle, key = axle === "front" ? "pf" : "pr";
        A.setTarget(axle, A.state[key] + Number(b.dataset.d));
        if (navigator.vibrate) navigator.vibrate(8);
      };
      var stop = function () { clearTimeout(timer); clearInterval(rep); timer = rep = 0; b.classList.remove("pressed"); };
      b.addEventListener("pointerdown", function (e) {
        e.preventDefault(); stop(); b.classList.add("pressed"); step();
        timer = setTimeout(function () { rep = setInterval(step, 110); }, 420);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { b.addEventListener(ev, stop); });
      b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    });
  }

  function connInfo() {
    var c = A.conn(), now = Date.now();
    var names = { ble: "BLUETOOTH", wifi: "WIFI LOKAL", remote: "INTERNET" };
    if (!c.connected) return c.demo ? ["demo", "DEMO", "simulasi tanpa modul · ketuk untuk sambung"] : ["off", "TERPUTUS", "ketuk untuk sambung (" + names[c.link] + ")"];
    var lock = c.authOk ? "" : " · terkunci, ketuk untuk kode";
    if (c.link !== "remote") return [c.authOk ? "live" : "warn", names[c.link], (c.authOk ? "terhubung" : "terhubung") + lock];
    if (c.online === false) return ["off", "INTERNET", "modul OFFLINE (tidak ke broker)"];
    if (c.online === null) return ["busy", "INTERNET", "menyambung ke broker…"];
    var age = c.last ? Math.round((now - c.last) / 1000) : null;
    return [c.authOk ? "live" : "warn", "INTERNET", "modul online" + (age !== null ? " · data " + (age < 2 ? "baru" : age + " dtk lalu") : "") + lock];
  }

  function sync() {
    var S = A.state, pv = A.presetVals;
    var ci = connInfo();
    $("dConn").dataset.s = ci[0]; $("dConnT").textContent = ci[1]; $("dConnS").textContent = ci[2];
    $("dAcc").textContent = typeof S.acc === "boolean" ? (S.acc ? "ON" : "OFF") : "—";
    $("dAcc").dataset.on = S.acc ? "1" : "";
    $("dComp").textContent = S.comp ? "HIDUP" : "MATI";
    $("dComp").dataset.on = S.comp ? "1" : "";
    $("dPreset").textContent = A.PRESET_NAMES[S.preset];
    $("dPresetN").textContent = "PRESET " + (S.preset + 1);
    $("dPf").textContent = S.pf; $("dPr").textContent = S.pr;
    document.querySelectorAll("#dPresets .d-pre").forEach(function (b) { b.classList.toggle("active", Number(b.dataset.id) === S.preset); });
    document.querySelectorAll("#dPresets small").forEach(function (s) { var p = pv[s.dataset.v]; s.textContent = p.f + " / " + p.r; });
    var v = A.valves(), c = A.conn();
    var msg = "", cls = "";
    if (S.fault) { msg = "⚠ " + S.fault.toUpperCase(); cls = "bad"; }
    else if (c.connected && c.link === "remote" && c.online === false) { msg = "Modul offline. Kontrol internet tidak tersedia; BLE/WiFi lokal di mobil tetap jalan."; cls = "bad"; }
    else if (armed) return;
    else if (v.fillF || v.dumpF || v.fillR || v.dumpR) {
      var parts = [];
      if (v.fillF) parts.push("depan ▲ mengisi"); if (v.dumpF) parts.push("depan ▼ membuang");
      if (v.fillR) parts.push("belakang ▲ mengisi"); if (v.dumpR) parts.push("belakang ▼ membuang");
      msg = "Menyesuaikan: " + parts.join(" · "); cls = "busy";
    } else msg = "Stabil di preset " + (S.preset + 1) + " (" + A.PRESET_NAMES[S.preset] + ")";
    if (S.tank < 100 && !S.fault) { msg += " · tangki rendah"; }
    $("dMsg").textContent = msg; $("dMsg").dataset.s = cls;
    $("dHint").textContent = c.connected && c.link === "remote"
      ? "Lewat internet: preset & tombol SEMUA perlu ketuk 2×. ▲/▼ mengubah target 1 psi. STOP selalu langsung."
      : "▲/▼ mengubah target preset aktif 1 psi (tahan = cepat). Batas aman 15–110 psi.";
  }

  function frame() {
    if (!A || document.documentElement.dataset.layout !== "dash") return;
    var U = A.ui, S = A.state, v = A.valves();
    CORNERS.forEach(function (c) {
      var b = E.bub[c.k], psi = U[c.axle], target = c.axle === "front" ? S.pf : S.pr;
      b.v.textContent = Math.round(psi);
      b.a.setAttribute("stroke-dasharray", (clamp(psi / 120, 0, 1) * 100).toFixed(2) + " 100");
      var ta = -140 + 280 * clamp(target / 120, 0, 1), p = polar(c.x, c.y, 28, ta);
      b.mk.setAttribute("cx", p[0].toFixed(1)); b.mk.setAttribute("cy", p[1].toFixed(1));
      var f = c.axle === "front" ? v.fillF : v.fillR, d = c.axle === "front" ? v.dumpF : v.dumpR;
      b.st.textContent = f ? "▲ " + target : d ? "▼ " + target : "● " + target;
      b.st.setAttribute("fill", f ? "var(--ok)" : d ? "var(--warn)" : "var(--dim)");
    });
    E.lineF.classList.toggle("flow-on", v.fillF || v.dumpF);
    E.lineR.classList.toggle("flow-on", v.fillR || v.dumpR);
    // bodi sedikit "turun" (bayangan mengecil) saat tekanan rendah — isyarat visual tinggi rendah
    var lift = clamp((U.front + U.rear) / 2 / 110, 0, 1);
    E.shadow.setAttribute("rx", (84 + lift * 14).toFixed(1));
    E.shadow.setAttribute("opacity", (.38 - lift * .2).toFixed(2));
    E.car.setAttribute("transform", "translate(0 " + ((1 - lift) * 4).toFixed(1) + ")");
    E.tankArc.setAttribute("stroke-dasharray", (clamp(U.tank / 200, 0, 1) * 100).toFixed(2) + " 100");
    E.tankArc.setAttribute("stroke", U.tank < 100 ? "var(--warn)" : "var(--accent)");
    $("dTank").textContent = Math.round(U.tank);
    var now = performance.now();
    if (now - lastSync > 250) { lastSync = now; sync(); }
  }

  window.RZMDash = {
    mount: function (api) { A = api; buildCar(); buildTank(); bind(); sync(); },
    frame: frame,
  };
})();
