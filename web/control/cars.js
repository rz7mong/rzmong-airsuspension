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
  var MODELS = {
    fd: {
      fx: 404, headY: 117, name: "Civic FD", icon: "🚘", R: 28, rim: 24, xr: 100, xf: 322, sill: 152, arch: 30, wheel: "dishmesh", stance: true, bl: 100,
      start: [22, 152],
      top: "L19 130 C18 120 20 112 24 106 L28 101 C44 99 64 98 80 97 C98 88 126 72 156 66 C182 61 214 61 236 64 C262 72 290 90 318 103 C340 106 366 109 388 114 C400 117 405 124 404 134 L402 146 C401 150 398 152 393 152",
      glass: "M102 98 C122 85 142 74 162 70 C186 67 212 67 232 69 C256 77 280 90 304 102 C236 101 168 100 102 98 Z",
      pillar: "M206 68 L210 101", door: "M210 101 C210 120 211 136 212 148 M300 102 C304 118 303 134 299 142 M128 99 L136 116",
      line: "M28 108 C140 110 270 112 398 123",
      head: "M366 111 C380 112 394 115 401 120 L400 123 C389 121 376 118 362 116 Z", tail: "M20 110 L46 106 C48 108 47 112 44 114 L21 119 Z",
      extra: '<path d="M282 91 L290 102" stroke="#05070c" stroke-width="2.2"/><path d="M26 101 L60 97 L62 95 L28 98.5 Z" class="cx-wing"/>' +
        '<path d="M362 137 L396 135 L394 142 L364 143 Z" class="cx-intake"/><path d="M350 151 L402 148 L404 152 L352 155 Z" class="cx-dark"/>',
      mirror: "M286 93 C292 89 300 89 301 94 L294 97 Z",
    },
    ferio: {
      fx: 402, headY: 114, name: "Ferio EK", icon: "📼", R: 28, rim: 24, xr: 98, xf: 316, sill: 152, arch: 30, wheel: "dishmesh", stance: true, bl: 103,
      start: [18, 152],
      top: "L16 128 C15 118 17 111 24 108 C40 106 66 105 88 104 C102 94 116 82 128 76 C136 72 146 71 156 71 L222 71 C234 71 242 75 252 83 L280 101 C312 103 350 106 384 110 C396 112 402 118 403 128 L402 146 C401 150 398 152 393 152",
      glass: "M102 103 C113 92 124 83 134 79 C140 77 148 76 156 76 L220 76 C230 76 238 80 246 87 L265 102 C210 102 156 102 102 103 Z",
      pillar: "M184 76 L186 102", door: "M186 103 C186 120 187 136 188 148 M270 102 C272 118 272 132 268 140 M122 104 L130 118",
      line: "M24 116 C140 113 280 112 398 119",
      head: "M372 109 C385 109 397 112 401 116 L401 121 C391 120 381 119 370 118 Z", tail: "M16 111 L40 109 L40 119 L16 121 Z",
      extra: '<path d="M22 105 L52 103 L54 100 L24 102 Z" class="cx-wing"/><path d="M132 127 L292 125" class="cx-mold"/><path d="M342 128 L400 127" class="cx-mold"/>' +
        '<path d="M366 136 L396 135 L395 142 L367 143 Z" class="cx-intake"/>',
      mirror: "M258 91 C264 87 272 87 273 92 L266 95 Z",
    },
    ekhatch: {
      fx: 376, headY: 112, name: "Civic EK Hatch", icon: "🚗", R: 28, rim: 24, xr: 96, xf: 296, sill: 152, arch: 30, wheel: "dish5", stance: true, bl: 99,
      start: [42, 152],
      top: "L38 126 C36 114 38 104 42 98 C48 88 56 79 68 71 C76 66 86 65 98 65 L194 65 C208 66 218 71 230 80 L258 99 C290 102 324 105 350 109 C364 112 374 118 376 128 L374 146 C373 150 370 152 366 152",
      glass: "M86 97 C94 87 104 78 114 74 C118 72 122 72 128 72 L192 72 C204 72 214 77 224 85 L244 100 C190 99 138 98 86 97 Z",
      pillar: "M150 72 L154 100", door: "M154 100 C154 118 155 134 156 148 M250 100 C253 114 252 128 248 138",
      line: "M36 114 C130 112 260 110 370 118",
      head: "M344 108 C357 109 369 112 374 116 L374 121 C364 119 353 117 342 116 Z", tail: "M38 105 L47 103 L47 122 L39 123 Z",
      extra: '<path d="M45 97 C51 87 59 78 70 70 L78 68 C68 77 60 87 53 98 Z" class="cx-dark"/><path d="M62 70 L100 62 L102 66 L68 74 Z" class="cx-wing"/><path d="M340 137 L370 135 L369 142 L341 143 Z" class="cx-intake"/>' +
        '<path d="M326 151 L374 148 L376 152 L328 155 Z" class="cx-dark"/><path d="M160 128 L256 126" class="cx-mold"/>',
      mirror: "M236 89 C242 85 250 85 251 90 L244 93 Z",
    },
    mpv: {
      fx: 405, headY: 101, name: "MPV Mewah", icon: "🚐", R: 31, rim: 27, xr: 96, xf: 322, sill: 150, arch: 33, wheel: "dishmesh", stance: true, bl: 88,
      start: [16, 150],
      top: "L13 122 C11 100 11 74 14 56 C16 46 22 40 32 39 L250 37 C262 37 270 41 278 48 C296 64 314 80 330 88 C350 90 372 92 392 96 C402 99 406 106 406 116 L406 142 C406 147 403 150 398 150",
      glass: "M24 81 L24 52 C24 47 28 44 34 44 L248 43 C258 43 264 46 270 52 C286 67 300 79 314 88 L112 88 L100 81 Z",
      pillar: "M100 44 L100 88 M204 43 L204 88", door: "M100 88 L100 146 M204 88 L204 146 M306 88 C304 100 300 106 294 112",
      line: "M18 104 C140 103 280 103 404 112",
      head: "M362 93 C378 94 394 97 403 101 L403 107 C390 105 376 102 360 100 Z", tail: "M12 58 L21 58 L21 102 L12 102 Z",
      extra: '<path d="M24 92 L100 92" class="cx-chrome"/><path d="M24 83 L100 83 L112 90 L312 90.5" class="cx-chrome" fill="none"/><path d="M14 43 L64 39 L64 43 L16 48 Z" class="cx-wing"/>' +
        '<path d="M388 108 L406 110 L406 140 L390 140 Z" class="cx-grille"/><path d="M390 114 L406 115 M390 120 L406 121 M390 126 L406 127 M390 132 L406 133" class="cx-chrome"/>' +
        '<path d="M140 140 L262 140" class="cx-chrome"/><path d="M346 150 L404 148 L405 152 L348 153 Z" class="cx-dark"/>',
      mirror: "M318 80 C324 76 332 76 333 81 L326 84 Z",
    },
    show: {
      fx: 410, headY: 115, name: "Show Car", icon: "🏁", R: 28, rim: 24, xr: 100, xf: 318, sill: 153, arch: 31, wheel: "dish5", stance: true, bl: 100, overf: true, cage: true,
      start: [10, 153],
      top: "L8 134 C8 124 12 116 20 112 L30 106 C50 103 72 102 86 101 C104 90 130 74 158 67 C184 62 214 62 234 66 C260 74 286 90 312 102 C340 105 370 108 392 113 C404 116 410 124 410 136 L410 150 C410 152 408 153 404 153",
      glass: "M106 99 C127 85 147 74 166 71 C188 68 212 68 230 71 C252 79 274 90 296 101 C232 100 168 100 106 99 Z",
      pillar: "M206 69 L208 100", door: "M208 101 C208 120 209 136 210 148 M290 102 C294 112 294 120 290 124",
      line: "M14 110 C140 110 270 111 404 121",
      head: "M370 109 C383 110 396 113 404 118 L403 121 C391 119 379 117 366 115 Z", tail: "M9 116 L32 110 L33 118 L10 124 Z",
      extra: '<path d="M46 103 L40 66 M78 101 L74 63" class="cx-neck"/>' +
        '<path d="M4 60 C24 55 64 53 98 55 L98 63 C64 62 26 64 6 69 Z" class="cx-gt"/><path d="M2 50 L14 50 L15 76 L4 76 Z M90 47 L100 47 L101 70 L91 70 Z" class="cx-wing"/>' +
        '<path d="M384 128 L410 123 L410 127 L388 132 Z M390 139 L412 135 L412 139 L393 142 Z" class="cx-wing"/>' +
        '<path d="M340 152 L416 150 L416 155 L342 157 Z" class="cx-dark"/><path d="M8 145 L42 145 M8 149 L42 149" class="cx-strut"/>' +
        '<path d="M360 136 L398 134 L396 143 L362 144 Z" class="cx-intake"/>',
      mirror: "M282 92 C288 88 296 88 297 93 L290 96 Z",
    },
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
    dishmesh: "Mesh 3-piece", dish5: "5-spoke deep dish", multi: "Multi-spoke", mesh: "Deep-dish mesh", five: "5-spoke", yspoke: "Y-spoke", turbofan: "Turbofan", beadlock: "Beadlock",
  };
  var COLORS = [
    ["auto", "Ikut tema", null], ["#d1122f", "Merah candy", null], ["#0d0f14", "Hitam", null], ["#f3f4f6", "Putih mutiara", null],
    ["#8a9199", "Nardo grey", null], ["#1f5fff", "Biru", null], ["#ffc21a", "Kuning", null], ["#18b26b", "Hijau", null], ["#7c3aed", "Ungu", null], ["#f7b3cc", "Pink pastel", null], ["#a9d8ff", "Biru muda", null], ["#f0a032", "Oranye emas", null],
  ];
  var LIVERIES = { "": "Polos", pin: "Pinstripe", graf: "Graffiti", race: "Racing stripe" };
  var THEME_COLOR = { neon: "#1c2f55", merah: "#c0142f", terang: "#f1f3f7", anime: "#ff9cc4" };

  function load() { try { return Object.assign({ model: "fd", wheel: "", color: "auto", livery: "" }, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { return { model: "fd", wheel: "", color: "auto", livery: "" }; } }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* abaikan */ } }

  /* ---------- velg ---------- */
  function pol(r, deg) { var a = (deg - 90) * Math.PI / 180; return [r * Math.cos(a), r * Math.sin(a)]; }
  function P(r, deg) { var p = pol(r, deg); return p[0].toFixed(2) + " " + p[1].toFixed(2); }
  function spokes(type, r, id) {
    var s = "", i, a;
    var metal = "url(#" + id + "-metal)";
    if (type === "dishmesh") {
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
  var DISH = { dishmesh: .27, dish5: .3, mesh: .2 };
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
      if (wheel !== "mesh") s += '<g class="cx-spin"><circle r="' + (r * (1 - dish) + 1.3).toFixed(2) + '" fill="none" stroke="#3a3f48" stroke-width="1.1" stroke-dasharray=".9 ' + (2 * Math.PI * (r * (1 - dish) + 1.3) / 24 - .9).toFixed(2) + '"/></g>';
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
    var x0 = m.start[0], x1 = m.fx, yb = m.bl, ys = m.sill, h = ys - yb, len = x1 - x0, out = "", i, d = "";
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
  function overfender(m, x, col) {
    var cy = G - m.R, dd = m.sill - cy, ri = m.arch - 1, ro = m.arch + 7;
    var ai = Math.sqrt(ri * ri - dd * dd), ao = Math.sqrt(ro * ro - dd * dd), y = m.sill + 1, s = "";
    s += '<path d="M' + (x - ao).toFixed(1) + " " + y + " A" + ro + " " + ro + " 0 1 1 " + (x + ao).toFixed(1) + " " + y + " L" + (x + ai).toFixed(1) + " " + y + " A" + ri + " " + ri + " 0 1 0 " + (x - ai).toFixed(1) + " " + y + 'Z" fill="' + col + '" stroke="#05070c" stroke-width="1"/>';
    for (var a = -100; a <= 100; a += 25) { var p = pol(m.arch + 3, a); s += '<circle cx="' + (x + p[0]).toFixed(1) + '" cy="' + (cy + p[1]).toFixed(1) + '" r="1.1" fill="#d7dce3" stroke="#222" stroke-width=".4"/>'; }
    return s;
  }
  var uid = 0;
  function mount(svg, opts) {
    opts = opts || {};
    var id = "cx" + (++uid), cfg = load(), refs = {}, rot = 0, roadOff = 0;
    svg.setAttribute("viewBox", "0 0 420 190");
    svg.classList.add("cx");

    function themeColor() { var t = document.documentElement.getAttribute("data-theme") || "neon"; return THEME_COLOR[t] || THEME_COLOR.neon; }
    function build() {
      var m = MODELS[cfg.model] || MODELS.fd, wheel = WHEELS[cfg.wheel] ? cfg.wheel : m.wheel;
      var col = cfg.color === "auto" ? themeColor() : cfg.color;
      var hi = mix(col, "#ffffff", .45), mid = col, lo = mix(col, "#000000", .55);
      var bp = bodyPath(m);
      var defs = '<defs>' +
        '<linearGradient id="' + id + '-paint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + hi + '"/><stop offset=".38" stop-color="' + mid + '"/><stop offset=".72" stop-color="' + mix(col, "#000000", .25) + '"/><stop offset="1" stop-color="' + lo + '"/></linearGradient>' +
        '<linearGradient id="' + id + '-gloss" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="#fff" stop-opacity=".5"/><stop offset=".6" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
        '<linearGradient id="' + id + '-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4b6e"/><stop offset=".55" stop-color="#121a2b"/><stop offset="1" stop-color="#05070c"/></linearGradient>' +
        '<linearGradient id="' + id + '-metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#aab2bd"/><stop offset=".55" stop-color="#eef1f4"/><stop offset="1" stop-color="#5d646e"/></linearGradient>' +
        '<linearGradient id="' + id + '-lip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#b9c1cb"/><stop offset=".5" stop-color="#f7f9fb"/><stop offset=".75" stop-color="#6f7782"/><stop offset="1" stop-color="#dfe4ea"/></linearGradient>' +
        '<radialGradient id="' + id + '-barrel"><stop offset=".6" stop-color="#22252c"/><stop offset=".95" stop-color="#6c737d"/><stop offset="1" stop-color="#2a2d34"/></radialGradient>' +
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
        '<g clip-path="url(#' + id + '-clip)">' + livery(cfg.livery, m, col) +
        '<rect x="0" y="' + (m.sill - 52) + '" width="420" height="16" fill="url(#' + id + '-gloss)" opacity=".55" transform="skewX(-12)"/>' +
        '<path d="' + skirt(m) + '" fill="' + mix(col, "#000000", .7) + '"/>' +
        '<path d="' + m.line + '" stroke="#fff" stroke-opacity=".35" stroke-width="1.2" fill="none"/>' +
        '<path d="' + m.line + '" stroke="#000" stroke-opacity=".25" stroke-width="1" fill="none" transform="translate(0 2)"/>' +
        '<path d="' + m.line + '" class="cx-accent" fill="none" transform="translate(0 22)"/>' +
        "</g>" +
        '<path d="' + m.glass + '" fill="url(#' + id + '-glass)" stroke="#05070c" stroke-width="1.2"/>' +
        (m.cage ? '<g clip-path="url(#' + id + '-gl)" class="cx-cage"><path d="M200 66 L202 104 M202 72 L150 104 M200 70 C230 72 262 86 300 106 M168 72 L160 104"/><path class="hl" d="M200 66 L202 104 M202 72 L150 104" transform="translate(-1 -1)"/></g>' : "") +
        '<g clip-path="url(#' + id + '-gl)"><path d="M120 120 L190 40 L210 40 L140 120 Z M150 120 L220 40 L228 40 L158 120 Z" fill="#fff" opacity=".13"/></g>' +
        '<path d="' + m.glass + '" fill="url(#' + id + '-gloss)" opacity=".35"/>' +
        '<path d="' + m.glass + '" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width=".8" transform="translate(0 .8)"/>' +
        (m.pillar ? '<path d="' + m.pillar + '" stroke="#05070c" stroke-width="5" fill="none"/>' : "") +
        '<path d="' + m.door + '" stroke="#000" stroke-opacity=".45" stroke-width="1" fill="none"/>' +
        handles(m) + m.extra + flares + fenders + (m.overf ? overfender(m, m.xr, 'url(#' + id + '-paint)') + overfender(m, m.xf, 'url(#' + id + '-paint)') : '') +
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
        '<div class="cx-row" data-k="livery">' + Object.keys(LIVERIES).map(function (k) { return '<button data-v="' + k + '">' + LIVERIES[k] + "</button>"; }).join("") + "</div>" +
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

  window.RZMCars = { mount: mount, models: MODELS, wheels: WHEELS, liveries: LIVERIES };
})();
