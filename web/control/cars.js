/* RZMONG Airsuspension — ilustrasi mobil stance (SVG orisinal, tanpa logo/merek) dengan pilihan model, velg, livery, dan warna.
 * Dipakai landing & kontroler (dan aplikasi Android lewat UI yang sama).
 *   const car = RZMCars.mount(svgEl, { picker: divEl, labels: true });
 *   car.update(frontPsi, rearPsi, speedKmh, dtDetik);
 * Velg stance digambar dengan camber negatif (muka velg miring, bibir dalam terlihat) & ban stretch.
 * Bodi naik-turun per sumbu (depan/belakang terpisah, bodi miring), roda tetap menapak, spatbor turun menutup ban.
 */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var G = 170;                       // garis tanah
  var KEY = "rzm.car";

  /* ---------- util warna ---------- */
  function hex2rgb(h) { h = h.replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); var n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) { var x = hex2rgb(a), y = hex2rgb(b); return "#" + x.map(function (v, i) { return Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0"); }).join(""); }
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ---------- model ----------
   * R = jari-jari ban, rim = jari-jari velg, xr/xf = as roda belakang/depan, sill = bawah bodi (posisi normal),
   * top = profil atas dari belakang-bawah ke depan-bawah (path relatif mulai di "M rearX sill").
   */
  /* Model dijiplak dari foto (lihat cars-traced.js). Koordinat viewBox 420x190, tanah y=170.
   * xr/xf = as roda, R = jari-jari ban, rim = jari-jari velg, arch = jari-jari lengkung spatbor,
   * x0/fx = ujung belakang/depan bodi, bl = garis pinggang (bawah kaca), sill = bawah bodi (untuk livery & sorot lampu). */
  var MODELS = {
    fd: { src: "fd", paint: "#b6b8bd", name: "Civic FD", icon: "🚘", xr: 92.3, xf: 326, R: 28, rim: 21, x0: 34, fx: 386, bl: 86, sill: 153, headY: 108, wheel: "lm", stance: true },
    show: { src: "fd", paint: "#8e1022", name: "Civic FD Show", icon: "🏁", xr: 92.3, xf: 326, R: 28, rim: 21, x0: 34, fx: 386, bl: 86, sill: 153, headY: 108, wheel: "dishmesh", stance: true, show: true },
    zenix: { src: "zenix", paint: "#f1f1ee", name: "Zenix MPV", icon: "🚐", xr: 114.8, xf: 332.8, R: 29, rim: 21.5, x0: 38, fx: 382, bl: 77, sill: 150, headY: 93, wheel: "dish5", stance: true },
    accord: { src: "accord", paint: "#121318", name: "Accord Prestige", icon: "🚖", xr: 90, xf: 315, R: 27, rim: 20, x0: 18, fx: 402, bl: 95, sill: 157, headY: 116, wheel: "multi", stance: true },
  };
  var WHEELS = {
    lm: "Gold mesh deep dish", dishmesh: "Mesh 3-piece", dish5: "5-spoke deep dish", multi: "Multi-spoke", mesh: "Deep-dish mesh", five: "5-spoke", yspoke: "Y-spoke", turbofan: "Turbofan",
  };
  var COLORS = [
    ["", "Warna asli foto", null], ["auto", "Ikut tema", null], ["#d1122f", "Merah candy", null], ["#0d0f14", "Hitam", null], ["#f3f4f6", "Putih mutiara", null],
    ["#8a9199", "Nardo grey", null], ["#1f5fff", "Biru", null], ["#ffc21a", "Kuning", null], ["#18b26b", "Hijau", null], ["#7c3aed", "Ungu", null], ["#f7b3cc", "Pink pastel", null], ["#a9d8ff", "Biru muda", null], ["#f0a032", "Oranye emas", null],
  ];
  var LIVERIES = { "": "Polos", pin: "Pinstripe", graf: "Graffiti", race: "Racing stripe" };
  var THEME_COLOR = { neon: "#1c2f55", merah: "#c0142f", terang: "#f1f3f7", anime: "#ff9cc4" };

  function load() { try { return Object.assign({ model: "fd", wheel: "", color: "", livery: "", view: "" }, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { return { model: "fd", wheel: "", color: "", livery: "", view: "" }; } }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* abaikan */ } }

  /* ---------- velg ---------- */
  function pol(r, deg) { var a = (deg - 90) * Math.PI / 180; return [r * Math.cos(a), r * Math.sin(a)]; }
  function P(r, deg) { var p = pol(r, deg); return p[0].toFixed(2) + " " + p[1].toFixed(2); }
  function spokes(type, r, id) {
    var s = "", i, a;
    var metal = "url(#" + id + "-metal)";
    if (type === "lm") {
      // mesh ganda ala velg balap 2-piece: 10 pasang jari-jari silang berwarna emas
      var gold = "url(#" + id + "-gold)";
      for (i = 0; i < 10; i++) { a = i * 36; s += '<path d="M' + P(r * .27, a - 5) + " L" + P(r * .72, a - 19) + " M" + P(r * .27, a + 5) + " L" + P(r * .72, a + 19) + '" stroke="' + gold + '" stroke-width="' + (r * .075).toFixed(2) + '" stroke-linecap="round"/><path d="M' + P(r * .27, a) + " L" + P(r * .5, a) + '" stroke="' + gold + '" stroke-width="' + (r * .06).toFixed(2) + '"/>'; }
      s += '<circle r="' + (r * .72) + '" fill="none" stroke="' + gold + '" stroke-width="' + (r * .06).toFixed(2) + '"/><circle r="' + (r * .29) + '" fill="' + gold + '"/><circle r="' + (r * .2) + '" fill="none" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>';
    } else if (type === "dishmesh") {
      // tengah mesh ala velg 3-piece: anyaman silang + ring dalam + baut rivet di bibir
      for (i = 0; i < 12; i++) { a = i * 30; s += '<path d="M' + P(r * .24, a) + " L" + P(r * .7, a + 24) + " M" + P(r * .24, a) + " L" + P(r * .7, a - 24) + '" stroke="' + metal + '" stroke-width="' + (r * .062).toFixed(2) + '" stroke-linecap="round"/>'; }
      s += '<circle r="' + (r * .7) + '" fill="none" stroke="' + metal + '" stroke-width="' + (r * .05).toFixed(2) + '"/><circle r="' + (r * .29) + '" fill="' + metal + '"/>';
    } else if (type === "dish5") {
      for (i = 0; i < 5; i++) { a = i * 72; s += '<path d="M' + P(r * .2, a - 20) + " L" + P(r * .7, a - 13) + " A" + (r * .7) + " " + (r * .7) + " 0 0 1 " + P(r * .7, a + 13) + " L" + P(r * .2, a + 20) + 'Z" fill="' + metal + '"/><path d="M' + P(r * .26, a) + " L" + P(r * .66, a) + '" stroke="rgba(0,0,0,.28)" stroke-width="' + (r * .05).toFixed(2) + '"/>'; }
      s += '<circle r="' + (r * .7) + '" fill="none" stroke="' + metal + '" stroke-width="' + (r * .06).toFixed(2) + '"/><circle r="' + (r * .3) + '" fill="' + metal + '"/>';
    } else if (type === "multi") {
      for (i = 0; i < 14; i++) { a = i * 360 / 14; s += '<path d="M' + P(r * .24, a - 5) + " L" + P(r * .9, a - 2.2) + " L" + P(r * .9, a + 2.2) + " L" + P(r * .24, a + 5) + 'Z" fill="' + metal + '"/>'; }
      s += '<circle r="' + (r * .3) + '" fill="' + metal + '"/>';
    } else if (type === "mesh") {
      for (i = 0; i < 10; i++) { a = i * 36; s += '<path d="M' + P(r * .26, a) + " L" + P(r * .74, a + 20) + " M" + P(r * .26, a) + " L" + P(r * .74, a - 20) + '" stroke="' + metal + '" stroke-width="' + (r * .07).toFixed(1) + '" stroke-linecap="round"/>'; }
      s += '<circle r="' + (r * .3) + '" fill="' + metal + '"/>';
    } else if (type === "five") {
      for (i = 0; i < 5; i++) { a = i * 72; s += '<path d="M' + P(r * .22, a - 14) + " L" + P(r * .88, a - 11) + " Q" + P(r * .93, a) + " " + P(r * .88, a + 11) + " L" + P(r * .22, a + 14) + 'Z" fill="' + metal + '"/>'; }
      s += '<circle r="' + (r * .32) + '" fill="' + metal + '"/>';
    } else if (type === "yspoke") {
      for (i = 0; i < 5; i++) {
        a = i * 72;
        s += '<path d="M' + P(r * .22, a - 9) + " L" + P(r * .52, a - 5) + " L" + P(r * .9, a - 22) + " L" + P(r * .9, a - 13) + " L" + P(r * .58, a) + " L" + P(r * .9, a + 13) + " L" + P(r * .9, a + 22) + " L" + P(r * .52, a + 5) + " L" + P(r * .22, a + 9) + 'Z" fill="' + metal + '"/>';
      }
      s += '<circle r="' + (r * .3) + '" fill="' + metal + '"/>';
    } else if (type === "turbofan") {
      s += '<circle r="' + (r * .92) + '" fill="' + metal + '"/>';
      for (i = 0; i < 18; i++) { a = i * 20; s += '<path d="M' + P(r * .3, a) + " Q" + P(r * .62, a + 4) + " " + P(r * .88, a + 26) + '" stroke="rgba(20,24,32,.55)" stroke-width="' + (r * .06).toFixed(1) + '" fill="none" stroke-linecap="round"/>'; }
      s += '<circle r="' + (r * .3) + '" fill="#1a1d24"/><circle r="' + (r * .2) + '" fill="' + metal + '"/>';
    } else { // beadlock
      s += '<circle r="' + (r * .84) + '" fill="#2b2f36"/>';
      for (i = 0; i < 8; i++) { var c = pol(r * .56, i * 45); s += '<circle cx="' + c[0].toFixed(2) + '" cy="' + c[1].toFixed(2) + '" r="' + (r * .12).toFixed(2) + '" fill="#0c0e12"/>'; }
      s += '<circle r="' + (r * .3) + '" fill="#3a3f48"/>';
      s += '<circle r="' + (r * .93) + '" fill="none" stroke="' + metal + '" stroke-width="' + (r * .16).toFixed(1) + '"/>';
      for (i = 0; i < 16; i++) { var b = pol(r * .93, i * 22.5); s += '<circle cx="' + b[0].toFixed(2) + '" cy="' + b[1].toFixed(2) + '" r="' + (r * .045).toFixed(2) + '" fill="#111"/>'; }
    }
    for (i = 0; i < 5; i++) { var n = pol(r * .17, i * 72); s += '<circle cx="' + n[0].toFixed(2) + '" cy="' + n[1].toFixed(2) + '" r="' + (r * .035).toFixed(2) + '" fill="#222"/>'; }
    s += '<circle r="' + (r * .1) + '" fill="var(--accent)" opacity=".9"/>';
    return s;
  }
  var DISH = { lm: .26, dishmesh: .27, dish5: .3, mesh: .2 };
  function wheelSVG(m, wheel, id) {
    var R = m.R, r = m.rim, s = "", dish = DISH[wheel] || 0, k;
    // ban (stance: ban "stretch" tipis + tapak terlihat di bawah karena camber negatif)
    s += '<circle r="' + R + '" fill="#0f1014"/>';
    s += '<circle r="' + (R - 1.2) + '" fill="url(#' + id + '-tire)"/>';
    if (m.lifted) {
      s += '<circle r="' + (R - 2.5) + '" fill="none" stroke="#1c1e24" stroke-width="5" stroke-dasharray="6 4.2"/>';
      s += '<circle r="' + (R - 9) + '" fill="none" stroke="#24272e" stroke-width="1.5" stroke-dasharray="3 5"/>';
    }
    // camber: muka velg dipersempit vertikal & digeser ke bawah, laras dalam terlihat di atas
    var cam = m.stance ? ' transform="translate(0 1.9) scale(.96 .87)"' : "";
    if (m.stance) {
      s += '<path d="M' + P(R - .8, 115) + " A" + (R - .8) + " " + (R - .8) + " 0 0 1 " + P(R - .8, 245) + '" stroke="#30333b" stroke-width="1.6" fill="none"/>';
      s += '<ellipse cy="-1.4" rx="' + r + '" ry="' + (r * .93) + '" fill="url(#' + id + '-barrel)"/>';
    }
    s += "<g" + cam + ">";
    // laras velg + cakram rem + kaliper
    s += '<circle r="' + r + '" fill="#15171c"/>';
    s += '<circle r="' + (r * (dish ? .66 : .78)) + '" fill="url(#' + id + '-disc)"/>';
    s += '<g class="cx-spin">' + spokes(wheel, r, id) + "</g>";
    s += '<path d="M' + P(r * .64, 210) + " A" + (r * .64) + " " + (r * .64) + " 0 0 1 " + P(r * .64, 258) + " L" + P(r * .44, 252) + " A" + (r * .44) + " " + (r * .44) + " 0 0 0 " + P(r * .44, 216) + 'Z" fill="var(--cx-caliper)" opacity=".95"/>';
    if (dish) {
      // bibir dalam (deep dish) dipoles: ring lebar + garis tangga + rivet
      k = r * (1 - dish / 2);
      s += '<circle r="' + k.toFixed(2) + '" fill="none" stroke="url(#' + id + '-lip)" stroke-width="' + (r * dish).toFixed(2) + '"/>';
      s += '<circle r="' + (r * (1 - dish) + .3).toFixed(2) + '" fill="none" stroke="rgba(0,0,0,.45)" stroke-width=".9"/>';
      s += '<circle r="' + (r - .6).toFixed(2) + '" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width=".9"/>';
      if (wheel !== "mesh" && wheel !== "lm") s += '<g class="cx-spin"><circle r="' + (r * (1 - dish) + 1.3).toFixed(2) + '" fill="none" stroke="#3a3f48" stroke-width="1.1" stroke-dasharray=".9 ' + (2 * Math.PI * (r * (1 - dish) + 1.3) / 24 - .9).toFixed(2) + '"/></g>';
      s += '<path d="M' + P(k, -70) + " A" + k + " " + k + ' 0 0 1 ' + P(k, -10) + '" stroke="#fff" stroke-width="' + (r * dish * .35).toFixed(2) + '" fill="none" opacity=".7" stroke-linecap="round"/>';
      s += '<path d="M' + P(k, 120) + " A" + k + " " + k + ' 0 0 1 ' + P(k, 165) + '" stroke="#fff" stroke-width="' + (r * dish * .25).toFixed(2) + '" fill="none" opacity=".35" stroke-linecap="round"/>';
    } else {
      s += '<circle r="' + (r - .8) + '" fill="none" stroke="url(#' + id + '-metal)" stroke-width="2.4"/>';
      s += '<path d="M' + P(r * .95, -60) + " A" + (r * .95) + " " + (r * .95) + ' 0 0 1 ' + P(r * .95, 10) + '" stroke="#fff" stroke-width="1.4" fill="none" opacity=".45" stroke-linecap="round"/>';
    }
    s += '<circle r="' + (r - .3) + '" fill="none" stroke="var(--accent)" stroke-width=".6" opacity=".45"/>';
    s += "</g>";
    return s;
  }

  /* ---------- livery (pola orisinal, di-clip ke bodi) ---------- */
  function lum(c) { var x = hex2rgb(c); return (x[0] * .299 + x[1] * .587 + x[2] * .114) / 255; }
  function blade(ax, ay, bx, by, w, bend) {
    // daun/pisau runcing kedua ujung: dua kurva kuadratik dengan offset normal berbeda
    var mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay, L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L, ny = dx / L;
    var f = function (v) { return v.toFixed(1); };
    return "M" + f(ax) + " " + f(ay) + " Q" + f(mx + nx * (bend + w)) + " " + f(my + ny * (bend + w)) + " " + f(bx) + " " + f(by) + " Q" + f(mx + nx * (bend - w)) + " " + f(my + ny * (bend - w)) + " " + f(ax) + " " + f(ay) + "Z";
  }
  function livery(type, m, col) {
    if (!type) return "";
    var x0 = m.x0, x1 = m.fx, yb = m.bl, ys = m.sill, h = ys - yb, len = x1 - x0, out = "", i, d = "";
    var c1 = lum(col) > .62 ? "#16181f" : "#ffffff", c2 = lum(col) > .62 ? "var(--accent)" : "#ffd166";
    if (type === "race") {
      var y = yb + h * .36;
      out += '<path d="M' + (x0 - 2) + " " + y + " L" + (x1 - 26) + " " + (y + 2) + " L" + (x1 - 40) + " " + (y + 12) + " L" + (x0 - 2) + " " + (y + 11) + 'Z" fill="' + c1 + '" opacity=".92"/>';
      out += '<path d="M' + (x0 - 2) + " " + (y + 15) + " L" + (x1 - 46) + " " + (y + 16.5) + '" stroke="' + c1 + '" stroke-width="2.2" opacity=".92"/>';
      out += '<path d="M' + (x0 - 2) + " " + (y + 5.5) + " L" + (x1 - 32) + " " + (y + 7.2) + '" stroke="' + c2 + '" stroke-width="1.1" opacity=".9"/>';
      return out;
    }
    if (type === "pin") {
      // pinstripe gaya tribal tajam: bilah-bilah dari belakang menyapu ke depan & melingkari spatbor
      var B = [
        [.02, .22, .46, .14, 5, -5], [.02, .46, .54, .4, 6.5, -7], [.03, .7, .4, .74, 4.5, 6], [.16, .06, .34, .0, 2.4, -2],
        [.98, .26, .6, .18, 5, 5], [.98, .52, .56, .5, 6.5, 7], [.97, .76, .7, .8, 4, -5], [.7, .04, .86, .1, 2.4, 2],
      ];
      for (i = 0; i < B.length; i++) d += blade(x0 + B[i][0] * len, yb + B[i][1] * h, x0 + B[i][2] * len, yb + B[i][3] * h, B[i][4], B[i][5]);
      out += '<path d="' + d + '" fill="' + c1 + '" stroke="' + c2 + '" stroke-width="1.6" stroke-linejoin="round" paint-order="stroke"/>';
      out += '<path d="M' + (x0 + len * .1) + " " + (yb + h * .58) + " C" + (x0 + len * .32) + " " + (yb + h * .3) + " " + (x0 + len * .6) + " " + (yb + h * .86) + " " + (x0 + len * .9) + " " + (yb + h * .62) + '" stroke="' + c1 + '" stroke-width="1" fill="none" opacity=".8"/>';
      return out;
    }
    // graffiti: gelembung warna-warni + drip + titik semprot (pseudo-acak tetap)
    var seed = 7, rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    var pal = ["var(--accent)", "#ffd166", "#ff5fa2", "#7cf5c4", "var(--accent2)"], dk = "#101218";
    var blobs = "", fills = "", drips = "";
    for (i = 0; i < 9; i++) {
      var cx = x0 + len * (.08 + i * .105 + rnd() * .03), cy = yb + h * (.32 + rnd() * .3), rr = h * (.2 + rnd() * .1), cc = pal[i % pal.length];
      var circ = function (x, y2, r2, f) { return '<circle cx="' + x.toFixed(1) + '" cy="' + y2.toFixed(1) + '" r="' + r2.toFixed(1) + '" fill="' + f + '"/>'; };
      var parts = [[0, 0, 1], [rr * .8, -rr * .3, .75], [-rr * .7, rr * .25, .7], [rr * .2, rr * .55, .6]];
      parts.forEach(function (q) { blobs += circ(cx + q[0], cy + q[1], rr * q[2] + 1.6, dk); fills += circ(cx + q[0], cy + q[1], rr * q[2], cc); });
      fills += circ(cx - rr * .35, cy - rr * .4, rr * .22, "rgba(255,255,255,.55)");
      if (i % 2 === 0) drips += '<path d="M' + (cx + rr * .1).toFixed(1) + " " + cy.toFixed(1) + " L" + (cx + rr * .1).toFixed(1) + " " + (cy + rr + 6 + rnd() * 8).toFixed(1) + '" stroke="' + cc + '" stroke-width="2.2" stroke-linecap="round"/>';
    }
    var dots = ""; for (i = 0; i < 26; i++) dots += '<circle cx="' + (x0 + rnd() * len).toFixed(1) + '" cy="' + (yb + rnd() * h).toFixed(1) + '" r="' + (.5 + rnd() * 1.1).toFixed(1) + '" fill="' + pal[i % 5] + '"/>';
    return '<g opacity=".93">' + blobs + drips + fills + dots + "</g>";
  }
  var uid = 0;
  function mount(svg, opts) {
    opts = opts || {};
    var id = "cx" + (++uid), cfg = load(), refs = {}, rot = 0, roadOff = 0;
    svg.setAttribute("viewBox", "0 0 420 190");
    svg.classList.add("cx");

    function themeColor() { var t = document.documentElement.getAttribute("data-theme") || "neon"; return THEME_COLOR[t] || THEME_COLOR.neon; }
    function build() {
      var m = MODELS[cfg.model] || MODELS.fd, T = (window.RZMTraced || {})[m.src], wheel = WHEELS[cfg.wheel] ? cfg.wheel : m.wheel;
      if (!T) return;
      m.arch = T.arches[0][2];
      var col = cfg.color === "auto" ? themeColor() : cfg.color || m.paint;
      var bp = T.body, cyR = G - m.R, u = function (n) { return "url(#" + id + "-" + n + ")"; };
      var defs = '<defs>' +
        '<linearGradient id="' + id + '-paint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + mix(col, "#ffffff", .22) + '"/><stop offset=".45" stop-color="' + col + '"/><stop offset="1" stop-color="' + mix(col, "#000000", .35) + '"/></linearGradient>' +
        '<linearGradient id="' + id + '-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3346"/><stop offset=".6" stop-color="#0c1018"/><stop offset="1" stop-color="#05070c"/></linearGradient>' +
        '<linearGradient id="' + id + '-metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#aab2bd"/><stop offset=".55" stop-color="#eef1f4"/><stop offset="1" stop-color="#5d646e"/></linearGradient>' +
        '<linearGradient id="' + id + '-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1c4"/><stop offset=".35" stop-color="#d6ad5c"/><stop offset=".6" stop-color="#f6dc9a"/><stop offset="1" stop-color="#8c6a2c"/></linearGradient>' +
        '<linearGradient id="' + id + '-lip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#b9c1cb"/><stop offset=".5" stop-color="#f7f9fb"/><stop offset=".75" stop-color="#6f7782"/><stop offset="1" stop-color="#dfe4ea"/></linearGradient>' +
        '<radialGradient id="' + id + '-barrel"><stop offset=".6" stop-color="#22252c"/><stop offset=".95" stop-color="#6c737d"/><stop offset="1" stop-color="#2a2d34"/></radialGradient>' +
        '<radialGradient id="' + id + '-tire"><stop offset=".7" stop-color="#16181d"/><stop offset=".92" stop-color="#262930"/><stop offset="1" stop-color="#0d0e11"/></radialGradient>' +
        '<radialGradient id="' + id + '-disc"><stop offset="0" stop-color="#4a4f58"/><stop offset=".8" stop-color="#8b929c"/><stop offset="1" stop-color="#3b4048"/></radialGradient>' +
        '<radialGradient id="' + id + '-shadow"><stop offset="0" stop-color="#000" stop-opacity=".6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="' + id + '-beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
        '<filter id="' + id + '-glow" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
        '<clipPath id="' + id + '-clip"><path d="' + bp + '"/></clipPath>' +
        (T.glass ? '<clipPath id="' + id + '-gl"><path d="' + T.glass + '"/></clipPath>' : "") +
        '<mask id="' + id + '-am" maskUnits="userSpaceOnUse" x="-20" y="-20" width="460" height="230"><rect x="-20" y="-20" width="460" height="230" fill="#fff"/>' +
        T.arches.map(function (a) { return '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="' + a[2] + '" fill="#000"/>'; }).join("") + "</mask>" +
        '<radialGradient id="' + id + '-under"><stop offset="0" stop-color="var(--accent)" stop-opacity=".75"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></radialGradient>' +
        "</defs>";
      var layers = function (arr, fill) { return '<g transform="' + T.tr + '">' + arr.map(function (l) { return '<path d="' + l[1] + '" fill="' + fill + '" fill-opacity="' + l[0] + '"/>'; }).join("") + "</g>"; };
      var bagHTML = function () { return '<g class="cx-bag"><path class="cx-rod"/><path class="cx-bellow"/></g>'; };
      var wheelHTML = function (x) { return '<g class="cx-wheel" transform="translate(' + x + " " + cyR + ')">' + wheelSVG(m, wheel, id) + "</g>"; };
      // bibir spatbor: busur gelap + kilap tipis di tepi lengkung
      var lip = function (a) { var r = a[2] + .6; return "M" + (a[0] - r * .97).toFixed(1) + " " + (a[1] + r * .26).toFixed(1) + " A" + r + " " + r + " 0 0 1 " + (a[0] + r * .97).toFixed(1) + " " + (a[1] + r * .26).toFixed(1); };
      var lips = T.arches.map(function (a) { return '<path d="' + lip(a) + '" class="cx-lip" stroke="' + mix(col, "#000000", .6) + '"/><path d="' + lip(a) + '" class="cx-lip2" transform="translate(0 -1.6)"/>'; }).join("");
      var beam = '<path class="cx-beam" d="M' + (m.fx - 6) + " " + m.headY + " L" + (m.fx + 56) + " " + (m.headY - 9) + " L" + (m.fx + 56) + " " + (m.headY + 16) + ' Z" fill="' + u("beam") + '"/>';
      var decal = '<g class="cx-decal" transform="translate(' + ((m.xr + m.xf) / 2 - 10) + " " + (m.sill - 30) + ')"><path d="M8 3 C8 0 3 0 3 4 C3 7 8 10 8 10 C8 10 13 7 13 4 C13 0 8 0 8 3Z" fill="#fff" opacity=".9"/><circle cx="20" cy="4" r="2.4" fill="#fff" opacity=".8"/><circle cx="26" cy="8" r="1.5" fill="#fff" opacity=".7"/></g>';
      var showKit = m.show ?
        // kit show car (terinspirasi FD milik @rzmong): GT wing swan-neck, canard, splitter, diffuser, roll cage
        '<path d="M47 85 L42 58 M62 82 L60 56" class="cx-neck"/><path d="M10 54 C30 49 66 47 96 49 L96 56 C66 55 32 57 12 62 Z" class="cx-gt"/>' +
        '<path d="M8 44 L18 44 L19 70 L9 70 Z M92 41 L101 41 L102 64 L93 64 Z" class="cx-wing"/>' +
        '<path d="M368 129 L392 124.5 L392.5 128 L371 133 Z M372 139 L395 135.5 L395.5 139 L375 142 Z" class="cx-wing"/>' +
        '<path d="M318 153 L398 150.5 L399 155 L320 157 Z M120 153.5 L300 154 L299 157.5 L121 157 Z" class="cx-dark"/><path d="M36 150 L64 150 M36 154 L64 154" class="cx-strut"/>' : "";
      var cage = m.show && T.glass ? '<g clip-path="' + u("gl") + '" class="cx-cage"><path d="M186 54 L187 90 M187 58 L128 90 M186 57 C150 58 125 70 108 88 M187 60 L285 88"/><path class="hl" d="M186 54 L187 90 M187 58 L128 90" transform="translate(-.8 -.8)"/></g>' : "";
      svg.innerHTML = defs +
        '<g class="cx-world"><g class="cx-road"><rect x="-60" y="' + G + '" width="540" height="40" fill="var(--cx-road)"/><line class="cx-dash" x1="-60" y1="' + (G + 11) + '" x2="480" y2="' + (G + 11) + '"/></g>' +
        '<ellipse class="cx-shadow" cx="' + ((m.x0 + m.fx) / 2) + '" cy="' + (G + 1) + '" rx="' + ((m.fx - m.x0) / 2 + 14) + '" ry="8" fill="' + u("shadow") + '"/>' +
        '<ellipse class="cx-under" cx="' + ((m.xr + m.xf) / 2) + '" cy="' + (G - 2) + '" rx="' + ((m.xf - m.xr) / 2 + 40) + '" ry="7" fill="' + u("under") + '"/></g>' +
        '<g class="cx-body-back"><g clip-path="' + u("clip") + '">' + T.arches.map(function (a) { return '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="' + (a[2] + .2) + '" fill="#06070a"/>'; }).join("") + "</g></g>" +
        '<g class="cx-world">' + bagHTML() + bagHTML() + wheelHTML(m.xr) + wheelHTML(m.xf) + "</g>" +
        '<g class="cx-body">' + showKit +
        '<g mask="' + u("am") + '">' +
        '<path d="' + bp + '" fill="' + u("paint") + '"/>' +
        '<g clip-path="' + u("clip") + '">' + livery(cfg.livery, m, col) + layers(T.dark, "#000") +
        (T.glass ? '<path d="' + T.glass + '" fill="' + u("glass") + '" fill-opacity=".9"/>' : "") + cage +
        (T.mirror ? '<path d="' + T.mirror + '" fill="' + u("paint") + '"/>' : "") +
        layers(T.light, "#fff") + "</g>" +
        '<path d="' + bp + '" fill="none" stroke="#000" stroke-opacity=".45" stroke-width=".7"/>' +
        "</g>" + '<g clip-path="' + u("clip") + '">' + lips + "</g>" +
        (T.head ? '<path d="' + T.head + '" class="cx-head" filter="' + u("glow") + '"/>' : "") + beam +
        (T.tail ? '<path d="' + T.tail + '" class="cx-tail" filter="' + u("glow") + '"/>' : "") +
        decal + "</g>" +
        (opts.labels ? '<text class="cx-lbl cx-lr" x="' + m.xr + '" y="18" text-anchor="middle"></text><text class="cx-lbl cx-lf" x="' + m.xf + '" y="18" text-anchor="middle"></text>' : "");
      refs = {
        m: m, body: svg.querySelector(".cx-body"), back: svg.querySelector(".cx-body-back"), shadow: svg.querySelector(".cx-shadow"),
        worlds: svg.querySelectorAll(".cx-world"), bags: svg.querySelectorAll(".cx-bag"),
        spins: svg.querySelectorAll(".cx-spin"), dash: svg.querySelector(".cx-dash"), lf: svg.querySelector(".cx-lf"), lr: svg.querySelector(".cx-lr"),
      };
      if (opts.picker) syncPicker();
    }

    /* ---------- pemilih model / velg / warna ---------- */
    function buildPicker() {
      var p = opts.picker; if (!p) return;
      p.classList.add("cx-picker");
      p.innerHTML =
        '<div class="cx-row" data-k="model">' + Object.keys(MODELS).map(function (k) { return '<button data-v="' + k + '"><span>' + MODELS[k].icon + "</span>" + MODELS[k].name + "</button>"; }).join("") + "</div>" +
        '<div class="cx-row" data-k="wheel"><button data-v="">Bawaan</button>' + Object.keys(WHEELS).map(function (k) { return '<button data-v="' + k + '">' + WHEELS[k] + "</button>"; }).join("") + "</div>" +
        '<div class="cx-row" data-k="livery">' + Object.keys(LIVERIES).map(function (k) { return '<button data-v="' + k + '">' + LIVERIES[k] + "</button>"; }).join("") + "</div>" +
        '<div class="cx-row" data-k="view"><button data-v="">🧍 Tampilan: Bodi diam</button><button data-v="ground">🛞 Tampilan: Ban diam</button></div>' +
        '<div class="cx-row cx-colors" data-k="color">' + COLORS.map(function (c) { return '<button data-v="' + c[0] + '" title="' + c[1] + '" aria-label="' + c[1] + '" style="--sw:' + (c[0] === "auto" ? "conic-gradient(var(--accent),var(--accent2),var(--accent))" : c[0] === "" ? "linear-gradient(135deg,#d9dbe0,#9a9ca2 45%,#8e1022 55%,#15171c)" : c[0]) + '"></button>'; }).join("") + "</div>";
      p.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-v]"); if (!b) return;
        var k = b.parentNode.getAttribute("data-k"); cfg[k] = b.getAttribute("data-v"); save(cfg); build();
        if (k === "model" && window.RZMTheme) window.RZMTheme.mascot.say("Mobil baru: " + MODELS[cfg.model].name + "~! ✨", "happy", 1600);
        try { window.dispatchEvent(new CustomEvent("rzm-car", { detail: cfg })); } catch (err) { /* lama */ }
      });
    }
    function syncPicker() {
      var p = opts.picker; if (!p) return;
      p.querySelectorAll(".cx-row").forEach(function (row) {
        var k = row.getAttribute("data-k");
        row.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === (cfg[k] || "")); });
      });
    }
    window.addEventListener("rzm-theme", function () { if (cfg.color === "auto") build(); });
    window.addEventListener("rzm-car", function (e) { if (e.detail !== cfg) { cfg = load(); build(); } });

    var lift = function (psi) { return 10 - clamp((psi - 15) / 95, 0, 1.25) * 24; };
    var REF = -5, spr = null; // REF = posisi bodi tetap di mode "Bodi diam"
    function bellow(x, y0, y1, w) {
      // kantong udara 2 tingkat (bellows) dari y0 (atas, menempel bodi) ke y1 (bawah)
      var h = y1 - y0, l = x - w / 2, r = x + w / 2, b = w * .22, f = function (v) { return v.toFixed(1); };
      return "M" + f(l) + " " + f(y0) + " Q" + f(l - b) + " " + f(y0 + h * .25) + " " + f(l + 1) + " " + f(y0 + h * .5) + " Q" + f(l - b) + " " + f(y0 + h * .75) + " " + f(l) + " " + f(y1) +
        " L" + f(r) + " " + f(y1) + " Q" + f(r + b) + " " + f(y0 + h * .75) + " " + f(r - 1) + " " + f(y0 + h * .5) + " Q" + f(r + b) + " " + f(y0 + h * .25) + " " + f(r) + " " + f(y0) + "Z";
    }
    function update(front, rear, speed, dt) {
      var m = refs.m, tF = lift(front), tR = lift(rear), i;
      // pegas: sedikit underdamped supaya terasa "ngayun" seperti suspensi udara
      if (!spr || !dt) spr = { f: tF, r: tR, vf: 0, vr: 0 };
      if (dt) {
        var st = Math.min(dt, .1), n = Math.ceil(st / .016), h = st / n, k = 90, c = 11;
        for (i = 0; i < n; i++) {
          spr.vf += (k * (tF - spr.f) - c * spr.vf) * h; spr.f += spr.vf * h;
          spr.vr += (k * (tR - spr.r) - c * spr.vr) * h; spr.r += spr.vr * h;
        }
      }
      var dyF = spr.f, dyR = spr.r, avg = (dyF + dyR) / 2, cy = G - m.R;
      var ang = Math.atan2(dyF - dyR, m.xf - m.xr) * 180 / Math.PI, mx = (m.xr + m.xf) / 2;
      var t = "translate(0 " + avg.toFixed(2) + ") rotate(" + ang.toFixed(2) + " " + mx + " " + cy + ")";
      var fixedBody = cfg.view !== "ground", wt = "";
      if (fixedBody) { wt = "translate(0 " + REF + ") rotate(" + (-ang).toFixed(2) + " " + mx + " " + cy + ") translate(0 " + (-avg).toFixed(2) + ")"; t = "translate(0 " + REF + ")"; }
      refs.body.setAttribute("transform", t); refs.back.setAttribute("transform", t);
      for (i = 0; i < refs.worlds.length; i++) refs.worlds[i].setAttribute("transform", wt);
      // kantong udara: dari atas lengkung spatbor (ikut bodi) ke hub roda (ikut tanah), digambar di bingkai "tanah"
      var rad = ang * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
      [m.xr, m.xf].forEach(function (x, j) {
        var px = x - mx, py = -(m.arch - 4);               // titik atas relatif pusat rotasi (mx, cy)
        var ax = mx + px * co - py * si, ay = cy + px * si + py * co + avg;
        var span = Math.max(4, cy - ay), y1 = ay + span * .62, g = refs.bags[j];
        g.firstChild.setAttribute("d", "M" + ax.toFixed(1) + " " + (y1 - 1).toFixed(1) + " L" + x + " " + cy);
        g.lastChild.setAttribute("d", bellow(ax, ay, y1, Math.min(18, m.R * .6)));
      });
      refs.shadow.setAttribute("opacity", clamp(1 - (10 - avg) / 40, .35, 1).toFixed(2));
      refs.shadow.setAttribute("ry", (9 - (10 - avg) * .12).toFixed(1));
      rot = (rot + (speed || 0) * (dt || 0) * 14) % 360;
      for (i = 0; i < refs.spins.length; i++) refs.spins[i].setAttribute("transform", "rotate(" + rot.toFixed(1) + ")");
      roadOff = (roadOff + (speed || 0) * (dt || 0) * 2.2) % 40;
      refs.dash.setAttribute("stroke-dashoffset", (-roadOff).toFixed(1));
      if (refs.lf) { refs.lf.textContent = "DEPAN " + Math.round(front) + " psi"; refs.lr.textContent = "BELAKANG " + Math.round(rear) + " psi"; }
    }

    buildPicker(); build(); update(50, 55, 0, 0);
    return { update: update, rebuild: build, get config() { return cfg; } };
  }

  window.RZMCars = { mount: mount, colors: COLORS, models: MODELS, wheels: WHEELS, liveries: LIVERIES };
})();
