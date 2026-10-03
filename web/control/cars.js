/* RZMONG Airsuspension — ilustrasi mobil stance (SVG) dengan pilihan model, velg, dan warna.
 * Dipakai landing & kontroler (dan aplikasi Android lewat UI yang sama).
 *   const car = RZMCars.mount(svgEl, { picker: divEl, labels: true });
 *   car.update(frontPsi, rearPsi, speedKmh, dtDetik);
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
  var MODELS = {
    sport: {
      fx: 404, headY: 113, name: "Sport", icon: "🏎️", R: 32, rim: 26, xr: 100, xf: 318, sill: 151, arch: 36, wheel: "multi", stance: true,
      start: [20, 151],
      top: "L20 131 C20 121 25 115 38 113 L70 109 C100 105 130 84 170 70 C198 61 238 60 258 66 C273 71 290 85 305 96 C332 99 366 103 389 110 C401 114 405 122 404 132 L401 146 C400 149 397 151 393 151",
      glass: "M122 104 C146 90 172 76 200 71 C224 67 246 68 257 73 C268 79 281 90 289 99 C250 99 172 101 122 104 Z",
      pillar: "M226 69 L230 100", door: "M168 104 C166 120 168 136 172 146 M262 99 C262 116 260 134 258 146",
      line: "M40 121 C130 114 270 108 396 121",
      head: "M372 108 C383 109 394 112 399 116 L396 120 C386 118 376 116 369 114 Z", tail: "M20 118 L36 115 L36 121 L20 124 Z",
      extra: '<path d="M26 103 L70 99 L71 105 L28 109 Z" class="cx-wing"/><path d="M40 108 L42 113 M60 106 L62 111" class="cx-strut"/>' +
        '<path d="M360 136 L392 134 L390 142 L362 143 Z" class="cx-intake"/>',
      mirror: "M282 92 C288 88 296 88 297 93 L290 96 Z",
    },
    hyper: {
      fx: 409, headY: 119, name: "Hyper Sport", icon: "🚀", R: 32, rim: 27, xr: 104, xf: 322, sill: 154, arch: 36, wheel: "turbofan", stance: true,
      start: [14, 154],
      top: "L14 132 C15 120 25 113 44 111 L88 107 C120 103 152 86 196 76 C220 70 250 70 266 75 C286 84 301 94 317 103 C345 105 373 111 397 119 C407 123 411 131 409 139 L405 149 C403 152 399 154 395 154",
      glass: "M152 103 C172 90 198 79 222 76 C244 74 259 76 269 81 C285 90 297 98 305 104 C262 102 196 102 152 103 Z",
      pillar: "", door: "M244 102 C246 120 246 136 244 150",
      line: "M50 124 C140 120 280 112 400 126",
      head: "M378 113 C390 115 400 119 405 124 L403 127 C392 124 382 121 374 119 Z", tail: "M14 118 L44 114 L44 119 L14 123 Z",
      extra: '<path d="M156 124 C178 116 204 114 222 117 C212 122 200 128 190 134 C176 132 164 131 156 130 Z" class="cx-intake"/>' +
        '<path d="M6 88 L72 84 L72 92 L8 97 Z" class="cx-wing"/><path d="M30 95 L34 110 M58 92 L60 108" class="cx-strut"/>' +
        '<path d="M16 144 L40 144 M16 149 L40 149" class="cx-strut"/><path d="M366 140 L398 138 L396 147 L368 148 Z" class="cx-intake"/>',
      mirror: "M286 94 C292 90 300 90 301 95 L294 98 Z",
    },
    sedan: {
      fx: 404, headY: 115, name: "Sedan JDM", icon: "🚘", R: 32, rim: 26, xr: 98, xf: 318, sill: 151, arch: 36, wheel: "mesh", stance: true,
      start: [16, 151],
      top: "L16 123 C16 113 22 109 34 108 L88 105 C100 95 120 77 150 71 L226 69 C244 69 256 75 270 85 L292 99 C324 101 362 105 388 111 C400 114 404 121 404 131 L402 147 C401 150 398 151 394 151",
      glass: "M106 103 C122 87 138 78 156 76 L223 75 C239 75 251 81 263 91 L277 101 C220 101 160 102 106 103 Z",
      pillar: "M188 75 L190 102", door: "M190 103 C190 120 191 136 192 147 M276 101 C276 118 274 134 272 147 M112 104 C114 120 116 136 118 147",
      line: "M30 120 C140 114 280 110 396 122",
      head: "M370 110 C382 111 394 114 400 118 L398 122 C388 120 377 118 367 116 Z", tail: "M16 112 L40 110 L40 118 L16 120 Z",
      extra: '<path d="M18 108 L44 106 L40 101 L20 103 Z" class="cx-wing"/><path d="M366 138 L394 136 L393 143 L367 144 Z" class="cx-intake"/>',
      mirror: "M272 90 C278 86 286 86 287 91 L280 94 Z",
    },
    hatch: {
      fx: 380, headY: 111, name: "Hatchback", icon: "🚗", R: 31, rim: 25, xr: 96, xf: 302, sill: 151, arch: 35, wheel: "five", stance: true,
      start: [26, 151],
      top: "L26 108 C26 100 28 94 34 88 L72 64 C78 60 84 59 92 59 L198 59 C218 59 232 65 246 75 L276 95 C308 99 342 103 364 109 C376 113 380 121 380 131 L378 147 C377 150 374 151 370 151",
      glass: "M50 92 L80 68 C84 66 88 66 94 66 L196 67 C212 67 224 73 236 83 L254 97 C190 97 110 98 50 98 Z",
      pillar: "M150 67 L150 98 M102 66 L98 98", door: "M150 99 C150 118 151 134 152 147 M254 97 C254 116 252 132 250 147",
      line: "M32 118 C130 112 260 108 372 120",
      head: "M348 106 C360 107 372 110 378 114 L376 118 C366 116 355 114 345 112 Z", tail: "M26 102 L34 100 L34 118 L26 119 Z",
      extra: '<path d="M64 61 L102 55 L103 61 L70 67 Z" class="cx-wing"/><path d="M346 136 L374 134 L373 142 L347 143 Z" class="cx-intake"/>',
      mirror: "M256 88 C262 84 270 84 271 89 L264 92 Z",
    },
    suv: {
      fx: 406, headY: 104, name: "SUV", icon: "🚙", R: 37, rim: 27, xr: 102, xf: 318, sill: 141, arch: 41, wheel: "yspoke", stance: false,
      start: [16, 141],
      top: "L16 104 C16 92 22 86 34 84 L52 82 C70 62 90 52 120 50 L252 50 C270 50 282 56 294 66 L314 86 C342 90 372 94 392 102 C402 106 406 114 406 124 L404 136 C403 139 400 141 396 141",
      glass: "M62 84 C78 66 96 58 122 57 L250 57 C264 57 274 62 284 72 L300 86 C220 86 140 85 62 84 Z",
      pillar: "M150 57 L150 86 M214 57 L216 86", door: "M150 86 C150 106 150 124 151 141 M216 86 C216 106 216 124 216 141 M298 87 C298 106 296 124 294 141",
      line: "M24 108 C140 104 280 102 400 110",
      head: "M378 98 C388 100 398 104 403 108 L401 113 C391 110 381 107 374 105 Z", tail: "M16 92 L28 92 L28 112 L16 112 Z",
      extra: '<path d="M90 45 L250 45 M100 45 L100 50 M240 45 L240 50" class="cx-rail"/>' +
        '<path d="M150 134 L272 134" class="cx-chrome"/>',
      mirror: "M296 80 C302 76 310 76 311 81 L304 84 Z",
    },
    offroad: {
      fx: 397, headY: 86, name: "4x4", icon: "🛻", R: 43, rim: 24, xr: 104, xf: 318, sill: 124, arch: 49, wheel: "beadlock", stance: false, lifted: true,
      start: [20, 124],
      top: "L20 76 C20 70 24 66 30 66 L62 66 L74 40 C76 36 80 34 86 34 L238 34 C244 34 248 36 250 40 L268 70 L368 74 C382 75 392 80 394 88 L397 112 C397 120 393 124 387 124",
      glass: "M80 64 L90 42 L160 42 L160 64 Z M168 42 L236 42 L251 66 L168 66 Z",
      pillar: "", door: "M164 66 L164 124 M254 68 L256 124",
      line: "M24 84 C140 82 280 80 394 90",
      head: "M380 80 C388 81 394 84 396 88 L396 94 C390 92 384 90 380 90 Z", tail: "M20 72 L30 72 L30 92 L20 92 Z",
      extra: '<path d="M70 28 L246 28 M84 28 L84 34 M232 28 L232 34" class="cx-rail"/><rect x="120" y="22" width="80" height="6" rx="3" class="cx-lightbar"/>' +
        '<path d="M278 74 L262 42 C260 38 257 36 252 36" class="cx-snorkel"/>' +
        '<path d="M150 128 L270 128" class="cx-slider"/><path d="M392 108 L404 108 L404 120 L392 120" class="cx-dark"/>',
      mirror: "M262 62 C268 58 276 58 277 63 L270 66 Z",
      flares: true,
    },
  };
  var WHEELS = {
    multi: "Multi-spoke", mesh: "Deep-dish mesh", five: "5-spoke", yspoke: "Y-spoke", turbofan: "Turbofan", beadlock: "Beadlock",
  };
  var COLORS = [
    ["auto", "Ikut tema", null], ["#d1122f", "Merah candy", null], ["#0d0f14", "Hitam", null], ["#f3f4f6", "Putih mutiara", null],
    ["#8a9199", "Nardo grey", null], ["#1f5fff", "Biru", null], ["#ffc21a", "Kuning", null], ["#18b26b", "Hijau", null], ["#7c3aed", "Ungu", null], ["#ff8fbf", "Pink", null],
  ];
  var THEME_COLOR = { neon: "#1c2f55", merah: "#c0142f", terang: "#f1f3f7", anime: "#ff9cc4" };

  function load() { try { return Object.assign({ model: "sport", wheel: "", color: "auto" }, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { return { model: "sport", wheel: "", color: "auto" }; } }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* abaikan */ } }

  /* ---------- velg ---------- */
  function pol(r, deg) { var a = (deg - 90) * Math.PI / 180; return [r * Math.cos(a), r * Math.sin(a)]; }
  function P(r, deg) { var p = pol(r, deg); return p[0].toFixed(2) + " " + p[1].toFixed(2); }
  function spokes(type, r, id) {
    var s = "", i, a;
    var metal = "url(#" + id + "-metal)";
    if (type === "multi") {
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
  function wheelSVG(m, wheel, id) {
    var R = m.R, r = m.rim, s = "";
    // ban
    s += '<circle r="' + R + '" fill="#0f1014"/>';
    s += '<circle r="' + (R - 1.2) + '" fill="url(#' + id + '-tire)"/>';
    if (m.lifted) {
      s += '<circle r="' + (R - 2.5) + '" fill="none" stroke="#1c1e24" stroke-width="5" stroke-dasharray="6 4.2"/>';
      s += '<circle r="' + (R - 9) + '" fill="none" stroke="#24272e" stroke-width="1.5" stroke-dasharray="3 5"/>';
    } else if (m.stance) {
      s += '<circle r="' + (r + 2.6) + '" fill="none" stroke="#2a2d34" stroke-width="1.2"/>'; // ban stretch tipis
    }
    // laras velg + cakram rem + kaliper (diam)
    s += '<circle r="' + r + '" fill="#15171c"/>';
    s += '<circle r="' + (r * .78) + '" fill="url(#' + id + '-disc)"/>';
    s += '<g class="cx-spin">' + spokes(wheel, r, id) + "</g>";
    s += '<path d="M' + P(r * .74, 210) + " A" + (r * .74) + " " + (r * .74) + " 0 0 1 " + P(r * .74, 260) + " L" + P(r * .5, 254) + " A" + (r * .5) + " " + (r * .5) + " 0 0 0 " + P(r * .5, 216) + 'Z" fill="var(--cx-caliper)" opacity=".95"/>';
    // bibir velg (lip) mengkilap
    s += '<circle r="' + (r - .8) + '" fill="none" stroke="url(#' + id + '-metal)" stroke-width="' + (wheel === "mesh" ? 4.5 : 2.4) + '"/>';
    s += '<circle r="' + (r - .8) + '" fill="none" stroke="var(--accent)" stroke-width=".7" opacity=".55"/>';
    // kilau
    s += '<path d="M' + P(r * .95, -60) + " A" + (r * .95) + " " + (r * .95) + ' 0 0 1 ' + P(r * .95, 10) + '" stroke="#fff" stroke-width="1.4" fill="none" opacity=".45" stroke-linecap="round"/>';
    return s;
  }

  /* ---------- geometri bodi ---------- */
  function bodyPath(m) {
    var cy = G - m.R, d = m.sill - cy, ax = Math.sqrt(m.arch * m.arch - d * d), large = d > 0 ? 1 : 0;
    return "M" + m.start[0] + " " + m.start[1] + " " + m.top +
      " L" + (m.xf + ax).toFixed(2) + " " + m.sill + " A" + m.arch + " " + m.arch + " 0 " + large + " 0 " + (m.xf - ax).toFixed(2) + " " + m.sill +
      " L" + (m.xr + ax).toFixed(2) + " " + m.sill + " A" + m.arch + " " + m.arch + " 0 " + large + " 0 " + (m.xr - ax).toFixed(2) + " " + m.sill + " Z";
  }
  function skirt(m) {
    var cy = G - m.R, d = m.sill - cy, ax = Math.sqrt(m.arch * m.arch - d * d), x0 = m.xr + ax + 2, x1 = m.xf - ax - 2, y = m.sill;
    return "M" + x0 + " " + (y - 9) + " L" + x1 + " " + (y - 9) + " L" + (x1 + 2) + " " + y + " L" + (x0 - 2) + " " + y + " Z";
  }
  function flare(m, x) {
    var cy = G - m.R, r = m.arch + 3;
    return "M" + (x - r) + " " + (m.sill + 2) + " A" + r + " " + r + " 0 0 1 " + (x + r) + " " + (m.sill + 2);
  }

  function handles(m) {
    var out = "", re = /M(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g, x, mm, n = 0;
    while ((mm = re.exec(m.door)) && n < 2) { x = parseFloat(mm[1]); out += '<rect x="' + (x + 8) + '" y="' + (parseFloat(mm[2]) + 8) + '" width="12" height="3" rx="1.5" class="cx-handle"/>'; n++; }
    return out;
  }
  var uid = 0;
  function mount(svg, opts) {
    opts = opts || {};
    var id = "cx" + (++uid), cfg = load(), refs = {}, rot = 0, roadOff = 0;
    svg.setAttribute("viewBox", "0 0 420 190");
    svg.classList.add("cx");

    function themeColor() { var t = document.documentElement.getAttribute("data-theme") || "neon"; return THEME_COLOR[t] || THEME_COLOR.neon; }
    function build() {
      var m = MODELS[cfg.model] || MODELS.sport, wheel = WHEELS[cfg.wheel] ? cfg.wheel : m.wheel;
      var col = cfg.color === "auto" ? themeColor() : cfg.color;
      var hi = mix(col, "#ffffff", .45), mid = col, lo = mix(col, "#000000", .55);
      var bp = bodyPath(m);
      var defs = '<defs>' +
        '<linearGradient id="' + id + '-paint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + hi + '"/><stop offset=".38" stop-color="' + mid + '"/><stop offset=".72" stop-color="' + mix(col, "#000000", .25) + '"/><stop offset="1" stop-color="' + lo + '"/></linearGradient>' +
        '<linearGradient id="' + id + '-gloss" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="#fff" stop-opacity=".5"/><stop offset=".6" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
        '<linearGradient id="' + id + '-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4b6e"/><stop offset=".55" stop-color="#121a2b"/><stop offset="1" stop-color="#05070c"/></linearGradient>' +
        '<linearGradient id="' + id + '-metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#aab2bd"/><stop offset=".55" stop-color="#eef1f4"/><stop offset="1" stop-color="#5d646e"/></linearGradient>' +
        '<radialGradient id="' + id + '-tire"><stop offset=".7" stop-color="#16181d"/><stop offset=".92" stop-color="#262930"/><stop offset="1" stop-color="#0d0e11"/></radialGradient>' +
        '<radialGradient id="' + id + '-disc"><stop offset="0" stop-color="#4a4f58"/><stop offset=".8" stop-color="#8b929c"/><stop offset="1" stop-color="#3b4048"/></radialGradient>' +
        '<radialGradient id="' + id + '-shadow"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="' + id + '-beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
        '<filter id="' + id + '-glow" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
        '<filter id="' + id + '-soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>' +
        '<clipPath id="' + id + '-clip"><path d="' + bp + '"/></clipPath>' +
        '<clipPath id="' + id + '-well"><rect x="0" y="0" width="420" height="' + m.sill + '"/></clipPath>' +
        '<clipPath id="' + id + '-gl"><path d="' + m.glass + '"/></clipPath>' +
        '<radialGradient id="' + id + '-under"><stop offset="0" stop-color="var(--accent)" stop-opacity=".75"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></radialGradient>' +
        "</defs>";
      var cyR = G - m.R;
      var wheelHTML = function (x) { return '<g class="cx-wheel" transform="translate(' + x + " " + cyR + ')">' + wheelSVG(m, wheel, id) + "</g>"; };
      var lip = function (x) { var r = m.arch + 1.5, cy = G - m.R, d = m.sill - cy, ax = Math.sqrt(r * r - d * d); return "M" + (x - ax).toFixed(1) + " " + m.sill + " A" + r + " " + r + " 0 " + (d > 0 ? 1 : 0) + " 1 " + (x + ax).toFixed(1) + " " + m.sill; };
      var fenders = m.flares ? "" : '<path d="' + lip(m.xr) + '" class="cx-lip" stroke="' + mix(col, "#000000", .65) + '"/><path d="' + lip(m.xf) + '" class="cx-lip" stroke="' + mix(col, "#000000", .65) + '"/>' +
        '<path d="' + lip(m.xr) + '" class="cx-lip2" transform="translate(0 -2.2)"/><path d="' + lip(m.xf) + '" class="cx-lip2" transform="translate(0 -2.2)"/>';
      var beam = '<path class="cx-beam" d="M' + (m.fx - 4) + " " + (m.headY) + " L" + (m.fx + 60) + " " + (m.headY - 9) + " L" + (m.fx + 60) + " " + (m.headY + 16) + ' Z" fill="url(#' + id + '-beam)"/>';
      var flares = m.flares ? '<path d="' + flare(m, m.xr) + '" class="cx-flare"/><path d="' + flare(m, m.xf) + '" class="cx-flare"/>' : "";
      var decal = '<g class="cx-decal" transform="translate(' + ((m.xr + m.xf) / 2 - 10) + " " + (m.sill - 26) + ')"><path d="M8 3 C8 0 3 0 3 4 C3 7 8 10 8 10 C8 10 13 7 13 4 C13 0 8 0 8 3Z" fill="#fff" opacity=".9"/><circle cx="20" cy="4" r="2.4" fill="#fff" opacity=".8"/><circle cx="26" cy="8" r="1.5" fill="#fff" opacity=".7"/></g>';
      svg.innerHTML = defs +
        '<g class="cx-road"><rect x="0" y="' + G + '" width="420" height="20" fill="var(--cx-road)"/><line class="cx-dash" x1="0" y1="' + (G + 11) + '" x2="420" y2="' + (G + 11) + '"/></g>' +
        '<ellipse class="cx-shadow" cx="' + ((m.xr + m.xf) / 2) + '" cy="' + (G + 1) + '" rx="' + ((m.xf - m.xr) / 2 + 92) + '" ry="9" fill="url(#' + id + '-shadow)"/>' +
        '<ellipse class="cx-under" cx="' + ((m.xr + m.xf) / 2) + '" cy="' + (G - 2) + '" rx="' + ((m.xf - m.xr) / 2 + 40) + '" ry="7" fill="url(#' + id + '-under)"/>' +
        '<g class="cx-body-back" clip-path="url(#' + id + '-well)"><circle cx="' + m.xr + '" cy="' + cyR + '" r="' + (m.arch - .5) + '" fill="#06070a"/><circle cx="' + m.xf + '" cy="' + cyR + '" r="' + (m.arch - .5) + '" fill="#06070a"/></g>' +
        wheelHTML(m.xr) + wheelHTML(m.xf) +
        '<g class="cx-body">' +
        '<path d="' + bp + '" fill="url(#' + id + '-paint)" stroke="' + mix(col, "#000000", .6) + '" stroke-width="1"/>' +
        '<g clip-path="url(#' + id + '-clip)">' +
        '<rect x="0" y="' + (m.sill - 52) + '" width="420" height="16" fill="url(#' + id + '-gloss)" opacity=".55" transform="skewX(-12)"/>' +
        '<path d="' + skirt(m) + '" fill="' + mix(col, "#000000", .7) + '"/>' +
        '<path d="' + m.line + '" stroke="#fff" stroke-opacity=".35" stroke-width="1.2" fill="none"/>' +
        '<path d="' + m.line + '" stroke="#000" stroke-opacity=".25" stroke-width="1" fill="none" transform="translate(0 2)"/>' +
        '<path d="' + m.line + '" class="cx-accent" fill="none" transform="translate(0 22)"/>' +
        "</g>" +
        '<path d="' + m.glass + '" fill="url(#' + id + '-glass)" stroke="#05070c" stroke-width="1.2"/>' +
        '<g clip-path="url(#' + id + '-gl)"><path d="M120 120 L190 40 L210 40 L140 120 Z M150 120 L220 40 L228 40 L158 120 Z" fill="#fff" opacity=".13"/></g>' +
        '<path d="' + m.glass + '" fill="url(#' + id + '-gloss)" opacity=".35"/>' +
        '<path d="' + m.glass + '" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width=".8" transform="translate(0 .8)"/>' +
        (m.pillar ? '<path d="' + m.pillar + '" stroke="#05070c" stroke-width="5" fill="none"/>' : "") +
        '<path d="' + m.door + '" stroke="#000" stroke-opacity=".45" stroke-width="1" fill="none"/>' +
        handles(m) + m.extra + flares + fenders +
        '<path d="' + m.mirror + '" fill="url(#' + id + '-paint)" stroke="#000" stroke-opacity=".4" stroke-width=".8"/>' +
        '<path d="' + m.head + '" class="cx-head" filter="url(#' + id + '-glow)"/>' + beam +
        '<path d="M' + (m.fx - 34) + " " + (m.sill - 1) + " L" + (m.fx + 2) + " " + (m.sill - 2) + " L" + (m.fx - 2) + " " + (m.sill + 2) + " L" + (m.fx - 34) + " " + (m.sill + 2) + 'Z" class="cx-dark"/>' +
        '<path d="M' + (m.start[0] - 1) + " " + (m.sill - 6) + " L" + (m.start[0] + 30) + " " + (m.sill - 6) + " L" + (m.start[0] + 30) + " " + (m.sill + 1) + " L" + (m.start[0] + 2) + " " + (m.sill + 1) + 'Z" class="cx-dark"/>' +
        '<path d="' + m.tail + '" class="cx-tail" filter="url(#' + id + '-glow)"/>' +
        decal +
        "</g>" +
        (opts.labels ? '<text class="cx-lbl cx-lr" x="' + m.xr + '" y="18" text-anchor="middle"></text><text class="cx-lbl cx-lf" x="' + m.xf + '" y="18" text-anchor="middle"></text>' : "");
      refs = {
        m: m, body: svg.querySelector(".cx-body"), back: svg.querySelector(".cx-body-back"), shadow: svg.querySelector(".cx-shadow"),
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
        '<div class="cx-row cx-colors" data-k="color">' + COLORS.map(function (c) { return '<button data-v="' + c[0] + '" title="' + c[1] + '" aria-label="' + c[1] + '" style="--sw:' + (c[0] === "auto" ? "conic-gradient(var(--accent),var(--accent2),var(--accent))" : c[0]) + '"></button>'; }).join("") + "</div>";
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
    function update(front, rear, speed, dt) {
      var m = refs.m, dyF = lift(front), dyR = lift(rear);
      var ang = Math.atan2(dyF - dyR, m.xf - m.xr) * 180 / Math.PI, mx = (m.xr + m.xf) / 2;
      var t = "translate(0 " + ((dyF + dyR) / 2).toFixed(2) + ") rotate(" + ang.toFixed(2) + " " + mx + " " + (G - m.R) + ")";
      refs.body.setAttribute("transform", t); refs.back.setAttribute("transform", t);
      var avg = (dyF + dyR) / 2;
      refs.shadow.setAttribute("opacity", clamp(1 - (10 - avg) / 40, .35, 1).toFixed(2));
      refs.shadow.setAttribute("ry", (9 - (10 - avg) * .12).toFixed(1));
      rot = (rot + (speed || 0) * (dt || 0) * 14) % 360;
      for (var i = 0; i < refs.spins.length; i++) refs.spins[i].setAttribute("transform", "rotate(" + rot.toFixed(1) + ")");
      roadOff = (roadOff + (speed || 0) * (dt || 0) * 2.2) % 40;
      refs.dash.setAttribute("stroke-dashoffset", (-roadOff).toFixed(1));
      if (refs.lf) { refs.lf.textContent = "DEPAN " + Math.round(front) + " psi"; refs.lr.textContent = "BELAKANG " + Math.round(rear) + " psi"; }
    }

    buildPicker(); build(); update(50, 55, 0, 0);
    return { update: update, rebuild: build, get config() { return cfg; } };
  }

  window.RZMCars = { mount: mount, models: MODELS, wheels: WHEELS };
})();
