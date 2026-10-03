/* RZMONG Airsuspension — mobil stance PIXEL ART (sprite orisinal, tanpa logo/merek) dengan pilihan model, velg, livery, warna, tampilan.
 * Dipakai landing & kontroler (dan aplikasi Android lewat UI yang sama).
 *   const car = RZMCars.mount(svgAtauDivEl, { picker: divEl, labels: true });
 *   car.update(frontPsi, rearPsi, speedKmh, dtDetik);
 * Sprite bodi ada di cars-pixel.js (palet terindeks, cat bisa ditukar warna). Velg digambar per piksel di sini.
 * Digambar ke kanvas 220x100 lalu diperbesar bilangan bulat (image-rendering: pixelated).
 * Tampilan "Bodi diam": bodi tetap, roda naik/turun masuk spatbor. "Ban diam": roda menapak, bodi naik/turun.
 */
(function () {
  "use strict";
  var W = 220, H = 100, GY = 89;             // kanvas logis & baris tanah (ban menyentuh GY-1)
  var KEY = "rzm.car";
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  function hex2rgb(h) { h = h.replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); var n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) { var x = hex2rgb(a), y = hex2rgb(b); return "#" + x.map(function (v, i) { return Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0"); }).join(""); }
  function lum(c) { var x = hex2rgb(c); return (x[0] * .299 + x[1] * .587 + x[2] * .114) / 255; }
  // warna -> Uint32 (little-endian ABGR) untuk ImageData
  function U(c, a) { var x = hex2rgb(c); return ((a == null ? 255 : a) << 24 | x[2] << 16 | x[1] << 8 | x[0]) >>> 0; }

  var MODELS = {
    // nama model dikarang (bukan merek/model asli), proporsi dari foto mobil stance @rzmong & @gesrexgang
    kaze: { name: "Kazeryu 8", icon: "🚘", paint: "#b4b7bd", wheel: "goldmesh" },
    kazeshow: { name: "Kazeryu 8 Gekirin", icon: "🏁", paint: "#9c1024", wheel: "dishmesh" },
    lumora: { name: "Lumora V", icon: "🚐", paint: "#efefea", wheel: "dish5" },
    ronin: { name: "Ronin 88", icon: "🚖", paint: "#17181d", wheel: "multi" },
  };
  var WHEELS = { goldmesh: "Gold mesh deep dish", dishmesh: "Silver mesh", dish5: "5-spoke deep dish", multi: "Multi-spoke", black: "Hitam doff", chrome: "Chrome" };
  var COLORS = [
    ["", "Warna asli foto"], ["auto", "Ikut tema"], ["#d1122f", "Merah candy"], ["#0d0f14", "Hitam"], ["#f3f4f6", "Putih mutiara"],
    ["#8a9199", "Abu semen"], ["#1f5fff", "Biru"], ["#ffc21a", "Kuning"], ["#18b26b", "Hijau"], ["#7c3aed", "Ungu"], ["#f7b3cc", "Pink pastel"], ["#a9d8ff", "Biru muda"], ["#f0a032", "Oranye emas"],
  ];
  var LIVERIES = { "": "Polos", pin: "Pinstripe", graf: "Graffiti", race: "Racing stripe" };
  var THEME_COLOR = { neon: "#2a4a8a", merah: "#c0142f", terang: "#f1f3f7", anime: "#ff9cc4" };
  // palet tetap (indeks 6..20), indeks 1..5 = cat (ditukar)
  var FIX = { 6: "#0b1120", 7: "#1d2b45", 8: "#86a3c8", 9: "#d6dde6", 10: "#15161b", 11: "#f6fbff", 12: "#8fd0ff", 13: "#ff2b3d", 14: "#9a1020", 15: "#06070a", 16: "#1d1f26", 17: "#2b2e35", 18: "#ffae2b", 19: "#ffd21f", 20: "#23262d" };
  // latar per tema
  var SCENE = {
    neon: { sky: ["#070a14", "#0b1022", "#111a36", "#18264a"], city: "#0d1428", city2: "#121c38", win: ["#3fe9ff", "#ffd36b", "#7b8cff"], road: "#14161c", road2: "#191c23", curb: "#2b303b", curbHi: "#404757", dash: "#4a5160", glow: "#22e3ff", text: "#9fb3d1" },
    merah: { sky: ["#12040a", "#240812", "#3a0c18", "#5a1420"], city: "#1a0710", city2: "#240a14", win: ["#ff5470", "#ffb36b", "#ff2b3d"], road: "#170c10", road2: "#1e1015", curb: "#35161e", curbHi: "#4d202b", dash: "#5c2a35", glow: "#ff2b48", text: "#ffb3c0", sun: "#ff4a5e" },
    terang: { sky: ["#bfe0ff", "#cfe8ff", "#def0ff", "#ecf6ff"], city: "#b4c4dc", city2: "#c4d2e6", win: ["#eaf3ff", "#ffffff", "#d7e6fa"], road: "#7c8494", road2: "#868e9e", curb: "#c9d0dc", curbHi: "#e6ebf2", dash: "#f4f6fa", glow: null, text: "#3a4a66", cloud: "#ffffff" },
    anime: { sky: ["#ffd9ec", "#ffe3f1", "#ffeef7", "#fff5fb"], city: "#f6c6dc", city2: "#fad3e5", win: ["#ffffff", "#ff9cc4", "#b9a6ff"], road: "#e9c4d6", road2: "#efcfdf", curb: "#ffe6f1", curbHi: "#ffffff", dash: "#ffffff", glow: "#ff6fa8", text: "#c2457a", petal: "#ff8fbf" },
  };

  // migrasi id lama (tersimpan di localStorage) ke id baru
  var OLD_MODEL = { fd: "kaze", show: "kazeshow", zenix: "lumora", accord: "ronin" }, OLD_WHEEL = { lm: "goldmesh" };
  function load() {
    var c;
    try { c = Object.assign({ model: "kaze", wheel: "", color: "", livery: "", view: "" }, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { return { model: "kaze", wheel: "", color: "", livery: "", view: "" }; }
    if (OLD_MODEL[c.model]) c.model = OLD_MODEL[c.model];
    if (OLD_WHEEL[c.wheel]) c.wheel = OLD_WHEEL[c.wheel];
    if (!MODELS[c.model]) c.model = "kaze";
    return c;
  }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* abaikan */ } }

  /* ---------- velg pixel ---------- */
  var WCACHE = {};
  var WSYM = { goldmesh: 8, dishmesh: 8, dish5: 5, multi: 8, black: 6, chrome: 7 }, FRAMES = 6;
  var WPAL = {
    goldmesh: { face: "#d9b264", hi: "#fbe3a6", lo: "#9a7432", lip: 1.8 },
    dishmesh: { face: "#cfd5dd", hi: "#ffffff", lo: "#7f8893", lip: 2.4 },
    dish5: { face: "#d3d9e1", hi: "#ffffff", lo: "#88919c", lip: 2.6 },
    multi: { face: "#c2c9d2", hi: "#f4f7fa", lo: "#7a838e", lip: 1.6 },
    black: { face: "#202227", hi: "#3e4148", lo: "#111215", lip: 1.6 },
    chrome: { face: "#e9eef4", hi: "#ffffff", lo: "#6d8fb5", lip: 2.2 },
  };
  function frac(v) { return v - Math.floor(v); }
  function wheelSprite(type, R, frame) {
    var key = type + R + "_" + frame; if (WCACHE[key]) return WCACHE[key];
    var S = 2 * R + 1, out = new Uint32Array(S * S), P = WPAL[type], n = WSYM[type], rot = frame / FRAMES;
    var rim = R - 2.6, face = rim - P.lip, c = R + .5;
    var C = { tire: U("#121317"), side: U("#1f2127"), sideHi: U("#3a3d46"), tread: U("#0a0b0d"), lipHi: U("#f4f7fa"), lip: U("#c3cad3"), lipLo: U("#7d8691"), lipIn: U("#4a515b"),
      barrel: U("#16181d"), cal: U("#8e1822"), calHi: U("#d4303c"), face: U(P.face), hi: U(P.hi), lo: U(P.lo), nut: U("#2a2c31") };
    function classify(dx, dy) {
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > R + .45) return 0;
      var sh = (-dx - dy) / (d || 1);                    // arah cahaya kiri-atas
      if (d > rim) {
        if (d > R - .8 && dx < -R * .5) return C.tread;    // tapak ban stretch (kesan camber)
        if (d < rim + 1.1) return sh > .3 ? C.sideHi : C.side;
        return C.tire;
      }
      if (d > face) return d > rim - .6 ? C.lipIn : (d < face + .6 ? C.lipIn : (sh > .55 ? C.lipHi : (sh < -.55 ? C.lipLo : C.lip)));
      // muka velg sedikit digeser & dipipihkan = kesan camber negatif
      var fx = (dx - .3) * 1.06, fdist = Math.sqrt(fx * fx + dy * dy), a = Math.atan2(dy, fx);
      var per = 2 * Math.PI / n, ph = a + Math.PI / 2 - rot * per, spoke = false, q, ad;
      var near = function (off) { var t = ph + off; t = t - Math.round(t / per) * per; return Math.abs(t) * fdist; };
      if (type === "goldmesh" || type === "dishmesh") {
        // mesh: muka terang dengan lubang-lubang kecil di dua cincin (berputar ikut frame)
        var hole = function (rr, cntH, wr, wa, off) { if (Math.abs(fdist - rr) > wr) return false; var pp = 2 * Math.PI / cntH, t = ph + off - Math.round((ph + off) / pp) * pp; return Math.abs(t) * fdist < wa; };
        spoke = !(hole(face * .5, 8, .75, .7, 0) || hole(face * .83, 12, .95, .95, Math.PI / 12));
      }
      else if (type === "dish5") spoke = near(0) < .9 + (1 - fdist / face) * 1.2;
      else if (type === "multi") spoke = near(0) < .5 || fdist > face - .6;
      else if (type === "black") spoke = near(0) < .8 + (1 - fdist / face) * .9;
      else if (type === "chrome") spoke = near(fdist * .1) < .65 || fdist > face - .6;
      if (fdist < 1.8) spoke = true;
      if (spoke) return fdist < .7 ? C.nut : (sh > .5 ? C.hi : (sh < -.6 ? C.lo : C.face));
      return (dx > 2 && Math.abs(dy) < dx * .5 && fdist > face * .5) ? (dy < -1 ? C.calHi : C.cal) : C.barrel;
    }
    var SUB = [-.33, 0, .33];
    for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
      var cnt = {}, best = 0, bc = 0, center = classify(x + .5 - c, y + .5 - c);
      for (var sy = 0; sy < 3; sy++) for (var sx = 0; sx < 3; sx++) {
        var v = classify(x + .5 + SUB[sx] - c, y + .5 + SUB[sy] - c); cnt[v] = (cnt[v] || 0) + 1 + (v === center ? .5 : 0);
        if (cnt[v] > best) { best = cnt[v]; bc = v; }
      }
      out[y * S + x] = bc;
    }
    WCACHE[key] = out; return out;
  }

  /* ---------- livery pixel ---------- */
  function rnd(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed & 0xffff) / 65536; }; }
  function liveryMask(type, sp) {
    // kembalikan fungsi (x,y)->0 (tidak ada) / 1 (warna utama) / 2 (aksen) / 3 (garis tepi gelap)
    if (!type) return null;
    var m = new Uint8Array(sp.w * sp.h), set = function (x, y, v) { if (x >= 0 && y >= 0 && x < sp.w && y < sp.h) m[y * sp.w + x] = v; }, x, y;
    var x0 = sp.x0 + 4, x1 = sp.fx - 6;
    if (type === "race") {
      for (x = x0; x <= x1; x++) { for (y = sp.low - 8; y <= sp.low - 5; y++) set(x, y, 1); set(x, sp.low - 3, 2); }
    } else if (type === "pin") {
      for (x = x0 + 6; x <= x1 - 4; x++) {
        var t = (x - x0) / (x1 - x0), yy = Math.round(sp.belt + 6 + Math.sin(t * 9) * 1.6 + t * 2);
        set(x, yy, 1);
        if (x > x0 + 20 && x < x1 - 30) set(x, yy + 3 + Math.round(Math.sin(t * 9 + 1.4)), 2);
      }
      // ujung api (flame) di depan
      for (var f = 0; f < 4; f++) for (x = 0; x < 10 - f * 2; x++) set(x1 - 22 + f * 5 + x, sp.low - 6 - f + Math.round(x * .35), 1);
    } else if (type === "graf") {
      // graffiti: gelembung huruf lonjong warna-warni + tetesan cat + outline gelap
      var r = rnd(sp.w * 31 + 7), k, dx, dy, blobs = [];
      for (k = 0; k < 9; k++) blobs.push([sp.xr + 6 + k * (sp.xf - sp.xr - 12) / 8 + (r() - .5) * 4, sp.belt + 8 + r() * (sp.low - sp.belt - 14), 3 + r() * 2.5, [4, 5, 7][k % 3]]);
      blobs.forEach(function (b, bi) {
        for (dy = -7; dy <= 7; dy++) for (dx = -9; dx <= 9; dx++) {
          var e = (dx * dx) / (b[2] * b[2] * 2.2) + (dy * dy) / (b[2] * b[2] * .7), xx = Math.round(b[0] + dx), yy2 = Math.round(b[1] + dy), j = yy2 * sp.w + xx;
          if (e < 1) set(xx, yy2, (dy < -b[2] * .35 && dx < 0) ? 6 : b[3]);
          else if (e < 1.45 && !m[j]) set(xx, yy2, 3);
        }
        if (bi % 2 === 0) { var dxp = Math.round(b[0] + (r() - .5) * 4), y0 = Math.round(b[1] + b[2] * .8); for (dy = 0; dy < 2 + (r() * 3 | 0); dy++) set(dxp, y0 + dy, b[3]); }
      });
    }
    return m;
  }

  /* ---------- dekode sprite ---------- */
  var CH = "0123456789abcdefghijk";
  function decode(str, w, h) { var a = new Uint8Array(w * h), rows = str.split("|"); for (var y = 0; y < h; y++) { var r = rows[y] || ""; for (var x = 0; x < w; x++) a[y * w + x] = CH.indexOf(r[x] || "0"); } return a; }
  var SPR = {};
  function sprite(model) {
    if (SPR[model]) return SPR[model];
    var d = (window.RZMPix || {})[model]; if (!d) return null;
    var s = Object.assign({}, d); s.body = decode(d.body, d.w, d.h); s.well = decode(d.well, d.w, d.h);
    return (SPR[model] = s);
  }

  var uid = 0;
  function mount(el, opts) {
    opts = opts || {};
    var cfg = load(), id = ++uid;
    // ganti <svg> lama dengan kanvas pixel
    var wrap = document.createElement("div"); wrap.className = "cx-pix" + (el.getAttribute("class") ? " " + el.getAttribute("class") : "");
    wrap.setAttribute("role", "img"); wrap.setAttribute("aria-label", el.getAttribute("aria-label") || "Mobil");
    var cv = document.createElement("canvas"); wrap.appendChild(cv);
    if (el.parentNode) el.parentNode.replaceChild(wrap, el);
    var ctx = cv.getContext("2d"), low = document.createElement("canvas"); low.width = W; low.height = H;
    var lctx = low.getContext("2d"), img = lctx.createImageData(W, H), buf = new Uint32Array(img.data.buffer);
    var N = 3, dpr = 1;
    function resize() {
      dpr = window.devicePixelRatio || 1;
      var cw = wrap.clientWidth || 330; N = Math.max(1, Math.floor(cw * dpr / W));
      cv.width = W * N; cv.height = H * N; cv.style.width = (W * N / dpr) + "px"; cv.style.height = (H * N / dpr) + "px";
      ctx.imageSmoothingEnabled = false; draw();
    }
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(wrap); else window.addEventListener("resize", resize);

    var st = { sp: null, bodyCol: null, wheel: "goldmesh", scene: null, bg: null, theme: "neon", ox: 0 };
    function themeName() { return document.documentElement.getAttribute("data-theme") || "neon"; }
    function cssVar(n, d) { var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || d; }

    function buildBg() {
      var th = st.theme, S = SCENE[th] || SCENE.neon, bg = new Uint32Array(W * H), r = rnd(97), x, y, i;
      var bands = S.sky, bh = Math.ceil(GY / bands.length);
      for (y = 0; y < GY; y++) {
        var bi = Math.min(bands.length - 1, Math.floor(y / bh)), nb = Math.min(bands.length - 1, bi + 1), ny = (bi + 1) * bh;
        for (x = 0; x < W; x++) {
          var c = bands[bi];
          if (ny - y <= 2 && ((x + y) % 2 === 0 || ny - y === 1 && x % 2 === 0)) c = bands[nb]; // dither transisi
          bg[y * W + x] = U(c);
        }
      }
      if (S.sun) { for (y = -12; y <= 12; y++) for (x = -12; x <= 12; x++) if (x * x + y * y < 140 && (y < 4 || (y % 3 !== 0))) bg[(40 + y) * W + 160 + x] = U(S.sun); }
      if (S.cloud) { [[30, 14, 14], [120, 9, 18], [185, 18, 12]].forEach(function (c) { for (y = -4; y <= 3; y++) for (x = -c[2]; x <= c[2]; x++) { var e = (x * x) / (c[2] * c[2]) + (y * y) / 12; if (e < 1 && !(y === 3 && x % 3 === 0)) bg[(c[1] + y) * W + c[0] + x] = U(S.cloud); } }); }
      // siluet kota 2 lapis dengan jendela menyala
      [[S.city2, 34, 18, 6], [S.city, 22, 10, 4]].forEach(function (L, li) {
        x = -r() * 6 | 0;
        while (x < W) {
          var bw = 8 + (r() * 16 | 0), top = GY - 6 - L[1] - (r() * L[2] * 2 | 0), cc = U(L[0]);
          for (var yy = top; yy < GY - 5; yy++) for (var xx = x; xx < x + bw && xx < W; xx++) if (xx >= 0) bg[yy * W + xx] = cc;
          if (li === 1 || th !== "terang") for (var wy = top + 2; wy < GY - 8; wy += 3) for (var wx = x + 2; wx < x + bw - 1; wx += 3) if (wx >= 0 && wx < W && r() < .22) bg[wy * W + wx] = U(S.win[(r() * S.win.length) | 0]);
          x += bw + (r() * 3 | 0);
        }
      });
      // trotoar/curb di belakang jalan
      for (x = 0; x < W; x++) { bg[(GY - 5) * W + x] = U(S.curbHi); for (y = GY - 4; y < GY - 2; y++) bg[y * W + x] = U(S.curb); }
      st.bg = bg; st.S = S; st.stars = [];
      if (th === "anime" || th === "neon") for (i = 0; i < 14; i++) st.stars.push([r() * W | 0, 2 + (r() * (GY - 40)) | 0, r() * 6.28]);
    }

    function build() {
      var mk = MODELS[cfg.model] ? cfg.model : "kaze", m = MODELS[mk], sp = sprite(mk);
      if (!sp) return;
      st.sp = sp; st.wheel = WHEELS[cfg.wheel] ? cfg.wheel : m.wheel; st.theme = themeName();
      var base = cfg.color === "auto" ? (THEME_COLOR[st.theme] || THEME_COLOR.neon) : (cfg.color || m.paint), L = lum(base), pal = {};
      var mid = L > .82 ? mix(base, "#5a6070", .07) : base;
      pal[1] = mix(base, "#06070b", .8); pal[2] = mix(mix(base, "#000000", L > .82 ? .2 : .36), "#2b2a66", .12); pal[3] = mid;
      pal[4] = mix(mix(base, "#ffffff", L < .12 ? .22 : .3), "#fff2d8", .1); pal[5] = mix(base, "#ffffff", L < .12 ? .45 : .7);
      for (var k in FIX) pal[k] = FIX[k];
      var pu = {}; for (k in pal) pu[k] = U(pal[k]);
      // livery
      var lm = liveryMask(cfg.livery, sp), dark = L > .55, lc1 = dark ? "#15171d" : "#f6f7fb", lc2 = cssVar("--accent", "#22e3ff");
      if (lc2.charAt(0) !== "#") lc2 = dark ? "#d1122f" : "#ffd21f";
      var tri = function (c) { return [U(mix(c, "#000", .25)), U(c), U(mix(c, "#fff", .35))]; };
      var lv = { 1: tri(lc1), 2: tri(lc2), 3: [pu[1], pu[1], pu[1]], 4: tri(lc2), 5: tri("#ffd21f"), 6: [U("#ffffff"), U("#ffffff"), U("#ffffff")], 7: tri("#ff4fa3") };
      var bc = new Uint32Array(sp.w * sp.h), wc = new Uint32Array(sp.w * sp.h);
      for (var i = 0; i < bc.length; i++) {
        var v = sp.body[i]; if (v) {
          var c = pu[v];
          if (lm && lm[i] && v >= 2 && v <= 5) { var tone = v === 2 ? 0 : v === 3 ? 1 : 2; c = lv[lm[i]][tone]; }
          bc[i] = c;
        }
        if (sp.well[i]) wc[i] = pu[sp.well[i]];
      }
      // stiker hati anime
      if (st.theme === "anime") {
        var hx = Math.round((sp.xr + sp.xf) / 2) - 3, hy = sp.belt + 5, heart = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];
        heart.forEach(function (row, yy) { for (var xx = 0; xx < 7; xx++) if (row[xx] === "1") { var j = (hy + yy) * sp.w + hx + xx; if (sp.body[j] >= 2 && sp.body[j] <= 5) bc[j] = U(yy < 1 ? "#ffd1e3" : "#ff6fa8"); } });
      }
      st.bodyCol = bc; st.wellCol = wc;
      st.ox = Math.round((W - (sp.fx - sp.x0)) / 2) - sp.x0;
      buildBg();
      if (opts.picker) syncPicker();
      draw();
    }

    /* ---------- state animasi ---------- */
    var spr = null, rot = 0, roadOff = 0, tAnim = 0, last = { f: 50, r: 55 };
    var lift = function (psi) { return 6 - clamp((psi - 15) / 95, 0, 1.25) * 13; }; // piksel: + turun, - naik
    function blend(i, c, a) {
      var o = buf[i], r = (o & 255) * (1 - a) + (c & 255) * a, g = (o >> 8 & 255) * (1 - a) + (c >> 8 & 255) * a, b = (o >> 16 & 255) * (1 - a) + (c >> 16 & 255) * a;
      buf[i] = (255 << 24 | b << 16 | g << 8 | r) >>> 0;
    }
    function draw() {
      var sp = st.sp; if (!sp || !st.bg) return;
      var S = st.S, x, y, i, j;
      buf.set(st.bg);
      var dyF = spr ? spr.f : 0, dyR = spr ? spr.r : 0, fixedBody = cfg.view !== "ground";
      var ox = st.ox, axR = ox + sp.xr, axF = ox + sp.xf, wb = axF - axR;
      var lin = function (sx, a, b) { return a + (b - a) * (sx - axR) / wb; };
      // offset bodi per kolom layar (geser bertingkat = miring pixel) dan offset tanah
      var bodyOff = function (sx) { return fixedBody ? 0 : Math.round(lin(sx, dyR, dyF)); };
      var roadOffAt = function (sx) { return fixedBody ? Math.round(clamp(lin(sx, -dyR, -dyF), -16, 16)) : 0; };
      var wR = fixedBody ? -Math.round(dyR) : 0, wF = fixedBody ? -Math.round(dyF) : 0; // offset vertikal roda
      // jalan
      var cRoad = U(S.road), cRoad2 = U(S.road2), cDash = U(S.dash), cEdge = U(S.curbHi);
      for (x = 0; x < W; x++) {
        var ro = roadOffAt(x), top = GY + ro;
        for (y = Math.max(0, top - 2); y < H; y++) {
          i = y * W + x;
          if (y < top) { buf[i] = U(S.curb); continue; }
          buf[i] = (((x + Math.floor(roadOff)) * 7 + y * 13) % 11 === 0) ? cRoad2 : cRoad;
          if (y === top) buf[i] = cEdge;
        }
        var dy2 = top + 6;
        if (dy2 < H && ((x + Math.floor(roadOff)) % 20) < 10) { buf[dy2 * W + x] = cDash; if (dy2 + 1 < H) buf[(dy2 + 1) * W + x] = cDash; }
      }
      // bayangan & underglow di bawah mobil
      var sx0 = ox + sp.x0 + 2, sx1 = ox + sp.fx - 2;
      for (x = sx0; x <= sx1; x++) {
        if (x < 0 || x >= W) continue;
        var gt = GY + roadOffAt(x), edgeF = Math.min(x - sx0, sx1 - x);
        for (y = gt - 1; y <= gt + 1; y++) if (y >= 0 && y < H) blend(y * W + x, 0, edgeF < 3 ? .25 : (y === gt ? .55 : .35));
        if (S.glow && edgeF > 4) {
          var pulse = .45 + .15 * Math.sin(tAnim * 3 + x * .15);
          if (gt + 2 < H) blend((gt + 2) * W + x, U(S.glow), pulse);
          if (gt + 3 < H && (x + gt) % 2 === 0) blend((gt + 3) * W + x, U(S.glow), pulse * .6);
          if ((x + gt) % 2 === 1) blend(gt * W + x, U(S.glow), .25);
        }
      }
      // lapisan ruang roda (ikut bodi)
      var baseY = GY - 1 - sp.R - sp.cy; // sprite y di layar saat offset 0
      function blit(col, under) {
        for (var sxx = 0; sxx < sp.w; sxx++) {
          var X = ox + sxx; if (X < 0 || X >= W) continue;
          var off = bodyOff(X);
          for (var syy = 0; syy < sp.h; syy++) { var c = col[syy * sp.w + sxx]; if (!c) continue; var Y = baseY + syy + off; if (Y >= 0 && Y < H) buf[Y * W + X] = c; }
        }
      }
      blit(st.wellCol);
      // kantong udara (bellows) antara atas spatbor & atas ban
      var bag1 = U("#4b4f59"), bag2 = U("#2a2d34"), bagHi = U("#6d727e"), rod = U("#b8c0ca");
      [[axR, wR], [axF, wF]].forEach(function (a) {
        var X = a[0], top = baseY + sp.cy - sp.arch + 1 + bodyOff(X), wcY = GY - 1 - sp.R + a[1], bot = wcY - sp.R + 2;
        for (y = top; y < wcY; y++) {
          if (y < 0 || y >= H) continue;
          var inBag = y < bot - 1, t = y - top, wdt = inBag ? ((t % 3 === 1) ? 3 : 2) : 0;
          if (inBag) { for (x = -wdt; x <= wdt; x++) buf[y * W + X + x] = (x === -wdt || x === wdt) ? bag2 : (x === -wdt + 1 ? bagHi : bag1); }
          else buf[y * W + X] = rod;
        }
      });
      // roda
      var n = WSYM[st.wheel] || 10, frame = Math.floor(frac(rot / (360 / n)) * FRAMES) % FRAMES, R = sp.R, ws = wheelSprite(st.wheel, R, frame), S2 = 2 * R + 1;
      [[axR, wR], [axF, wF]].forEach(function (a) {
        var X0 = a[0] - R, Y0 = GY - 1 - R + a[1] - R;
        for (y = 0; y < S2; y++) for (x = 0; x < S2; x++) { var c = ws[y * S2 + x]; if (!c) continue; var X = X0 + x, Y = Y0 + y; if (X >= 0 && X < W && Y >= 0 && Y < H) buf[Y * W + X] = c; }
      });
      // bodi
      blit(st.bodyCol);
      // sorot lampu depan (dither transparan)
      if (S.glow || st.theme === "terang") {
        var hx = ox + sp.head[0] + 1, hy = baseY + sp.head[1] + bodyOff(hx - 1), cw = U("#fff8e0");
        for (x = 1; x < 34; x++) for (y = -Math.floor(x / 5); y <= Math.floor(x / 3); y++) {
          var X = hx + x, Y = hy + y; if (X >= W || Y < 0 || Y >= H) continue;
          if ((X + Y) % 2 === 0) blend(Y * W + X, cw, .28 * (1 - x / 34));
        }
      }
      // kerlip (neon: bintang, anime: sparkle + kelopak)
      if (st.stars) st.stars.forEach(function (s, k) {
        var tw = Math.sin(tAnim * 2.2 + s[2]), X = s[0], Y = s[1];
        if (tw < .2) return;
        var col = st.theme === "anime" ? U(k % 2 ? "#ffffff" : S.petal) : U(k % 3 ? "#cfe9ff" : S.glow);
        buf[Y * W + X] = col;
        if (tw > .75 && st.theme === "anime" && X > 0 && X < W - 1 && Y > 0) { buf[(Y - 1) * W + X] = col; buf[(Y + 1) * W + X] = col; buf[Y * W + X - 1] = col; buf[Y * W + X + 1] = col; }
      });
      lctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(low, 0, 0, W * N, H * N);
      if (opts.labels) {
        ctx.font = "700 " + Math.max(9, Math.round(5.5 * N)) + "px ui-monospace,Menlo,Consolas,monospace"; ctx.textAlign = "center"; ctx.textBaseline = "top";
        var lab = function (t, x, col) { ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillText(t, x * N + N * .5, 3 * N + N * .5); ctx.fillStyle = col; ctx.fillText(t, x * N, 3 * N); };
        lab("BELAKANG " + Math.round(last.r) + " psi", axR, cssVar("--rear", "#c38bff"));
        lab("DEPAN " + Math.round(last.f) + " psi", axF, cssVar("--front", "#3fb8ff"));
      }
    }

    function update(front, rear, speed, dt) {
      last.f = front; last.r = rear;
      var tF = lift(front), tR = lift(rear), i;
      if (!spr || !dt) spr = { f: tF, r: tR, vf: 0, vr: 0 };
      else {
        var s = Math.min(dt, .1), n = Math.ceil(s / .016), h = s / n, k = 90, c = 11;
        for (i = 0; i < n; i++) { spr.vf += (k * (tF - spr.f) - c * spr.vf) * h; spr.f += spr.vf * h; spr.vr += (k * (tR - spr.r) - c * spr.vr) * h; spr.r += spr.vr * h; }
      }
      tAnim += dt || 0;
      rot = (rot + (speed || 0) * (dt || 0) * 14) % 360;
      roadOff = (roadOff + (speed || 0) * (dt || 0) * 1.1) % 2000;
      draw();
    }

    /* ---------- pemilih model / velg / livery / tampilan / warna ---------- */
    function buildPicker() {
      var p = opts.picker; if (!p) return;
      p.classList.add("cx-picker");
      p.innerHTML =
        '<div class="cx-row" data-k="model">' + Object.keys(MODELS).map(function (k) { return '<button data-v="' + k + '"><span>' + MODELS[k].icon + "</span>" + MODELS[k].name + "</button>"; }).join("") + "</div>" +
        '<div class="cx-row" data-k="wheel"><button data-v="">Bawaan</button>' + Object.keys(WHEELS).map(function (k) { return '<button data-v="' + k + '">' + WHEELS[k] + "</button>"; }).join("") + "</div>" +
        '<div class="cx-row" data-k="livery">' + Object.keys(LIVERIES).map(function (k) { return '<button data-v="' + k + '">' + LIVERIES[k] + "</button>"; }).join("") + "</div>" +
        '<div class="cx-row" data-k="view"><button data-v="">🧍 Tampilan: Bodi diam</button><button data-v="ground">🛞 Tampilan: Ban diam</button></div>' +
        '<div class="cx-row cx-colors" data-k="color">' + COLORS.map(function (c) { return '<button data-v="' + c[0] + '" title="' + c[1] + '" aria-label="' + c[1] + '" style="--sw:' + (c[0] === "auto" ? "conic-gradient(var(--accent),var(--accent2),var(--accent))" : c[0] === "" ? "linear-gradient(135deg,#d9dbe0,#9a9ca2 45%,#9c1024 55%,#17181d)" : c[0]) + '"></button>'; }).join("") + "</div>";
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
    window.addEventListener("rzm-theme", function () { build(); });
    window.addEventListener("rzm-car", function (e) { if (e.detail !== cfg) { cfg = load(); build(); } });

    buildPicker(); build(); resize(); update(50, 55, 0, 0);
    return { update: update, rebuild: build, get config() { return cfg; } };
  }

  window.RZMCars = { mount: mount, colors: COLORS, models: MODELS, wheels: WHEELS, liveries: LIVERIES, size: [W, H], _wheel: wheelSprite };
})();
