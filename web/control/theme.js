/* RZMON-G — pengatur tema bersama (landing, kontroler, flash, aplikasi Android).
 * Muat di <head> TANPA defer supaya tema terpasang sebelum halaman tergambar.
 * Tema: neon (default) | merah | terang | anime. API: window.RZMTheme
 */
(function () {
  "use strict";
  var KEY = "rzm.uitheme";
  var THEMES = [
    { id: "neon", name: "Futuristik Neon", sw: "linear-gradient(135deg,#22f3ff,#ff2bd6)", meta: "#05070d" },
    { id: "merah", name: "Cyber Merah", sw: "linear-gradient(135deg,#ff2a4a,#ffb547)", meta: "#0a0306" },
    { id: "terang", name: "Terang", sw: "linear-gradient(135deg,#ffffff,#9cc3ff)", meta: "#eef3fb" },
    { id: "anime", name: "Anime Sakura ✿", sw: "linear-gradient(135deg,#ffd1e3,#b5a8ff)", meta: "#fff5fa" },
  ];
  var root = document.documentElement;
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* mode privat */ } } };
  var theme = ls.get(KEY);
  if (!THEMES.some(function (t) { return t.id === theme; })) theme = "neon";
  root.setAttribute("data-theme", theme);
  var prefs = { sound: ls.get("rzm.sound") !== "0", mascot: ls.get("rzm.mascot") !== "0" };

  /* ---------- set ikon lucu (stroke bulat, isi pastel) ---------- */
  var BG = function (c) { return '<rect x="2.5" y="2.5" width="19" height="19" rx="7" fill="' + c + '" stroke="none"/>'; };
  var ICONS = {
    pump: '<rect x="3" y="8" width="13" height="10" rx="4" fill="#ffe1ee"/><circle cx="9.5" cy="13" r="2.5"/><path d="M16 11h3a2 2 0 0 1 0 4h-3M6 18v2M13 18v2"/>',
    tank: '<rect x="6" y="4" width="12" height="17" rx="6" fill="#e3f3ff"/><path d="M9.5 10h5M9.5 14h5M12 4V2"/>',
    valve: '<rect x="3.5" y="10" width="17" height="8" rx="4" fill="#fff2d2"/><path d="M12 10V5M9 5h6"/><circle cx="8" cy="14" r=".8" fill="currentColor"/><circle cx="12" cy="14" r=".8" fill="currentColor"/><circle cx="16" cy="14" r=".8" fill="currentColor"/>',
    bagF: '<path d="M6 7c0-2 12-2 12 0c2 1 2 3 0 4.5c2 1 2 3 0 4.5c0 2-12 2-12 0c-2-1.5-2-3.5 0-4.5c-2-1.5-2-3.5 0-4.5z" fill="#d9efff"/><path d="M5 3.5h14M5 20.5h14"/>',
    bagR: '<path d="M6 7c0-2 12-2 12 0c2 1 2 3 0 4.5c2 1 2 3 0 4.5c0 2-12 2-12 0c-2-1.5-2-3.5 0-4.5c-2-1.5-2-3.5 0-4.5z" fill="#ece2ff"/><path d="M5 3.5h14M5 20.5h14"/>',
    park: BG("#e6fff3") + '<path d="M10 17V7h3.2a3 3 0 0 1 0 6H10"/>',
    road: BG("#fff2d2") + '<path d="M8.5 19.5L10.5 4.5M15.5 19.5L13.5 4.5M12 7v1.5M12 11v1.5M12 15v1.5"/>',
    high: BG("#eee8ff") + '<path d="M5 18l4.5-7 3 4 2-3 4.5 6z" fill="#fff"/><circle cx="16.5" cy="7.5" r="1.4"/>',
    up: '<circle cx="12" cy="12" r="9.5" fill="#e6fff3"/><path d="M7.5 13.5L12 9l4.5 4.5"/>',
    down: '<circle cx="12" cy="12" r="9.5" fill="#fff0e0"/><path d="M7.5 10.5L12 15l4.5-4.5"/>',
    ble: '<circle cx="12" cy="12" r="10" fill="#e3f3ff" stroke="none"/><path d="M8 8.5l8 7-4 3.5V5l4 3.5-8 7" stroke="#4f86e8"/>',
    wifi: '<path d="M3 9.5a13 13 0 0 1 18 0M6 13a8.5 8.5 0 0 1 12 0M9 16.5a4 4 0 0 1 6 0"/><circle cx="12" cy="19.5" r="1.3" fill="currentColor"/>',
    settings: '<circle cx="12" cy="12" r="3.5" fill="#ffe1ee"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    theme: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.4-1-2.4S14 15 15 15h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" fill="#ffe1ee"/><circle cx="7.8" cy="11" r="1.3" fill="#ff6fa8" stroke="none"/><circle cx="11.5" cy="7.5" r="1.3" fill="#9b8cff" stroke="none"/><circle cx="16" cy="9.5" r="1.3" fill="#56b6ff" stroke="none"/>',
    hud: '<path d="M3.5 16.5a8.5 8.5 0 1 1 17 0z" fill="#ffe1ee"/><path d="M12 16.5l4-5"/><circle cx="12" cy="16.5" r="1.4" fill="currentColor"/>',
    car: '<path d="M2.5 16v-3.5l2.5-4.5h9.5l4.5 4.5h2.5V16z" fill="#ffe1ee"/><circle cx="7" cy="16.5" r="2.2" fill="#fff"/><circle cx="17" cy="16.5" r="2.2" fill="#fff"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" fill="#ffd1e3"/>',
    stop: BG("#ffe1e6") + '<rect x="9" y="9" width="6" height="6" rx="1.6"/>',
    sensor: '<circle cx="12" cy="13" r="7.5" fill="#e6fff3"/><path d="M12 13l3.2-3.2M12 3.5v2"/>',
    esp: '<rect x="6" y="6" width="12" height="12" rx="3.5" fill="#e3f3ff"/><path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3"/>',
    key: '<circle cx="8" cy="12" r="4.2" fill="#fff2d2"/><path d="M12.2 12H21M18 12v3M21 12v2.2"/>',
    flash: '<path d="M13.5 2L5 14h6.5L10.5 22 19 10h-6.5z" fill="#fff2d2"/>',
    star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" fill="#fff2d2"/>',
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.star) + "</svg>";
  }
  function fillIcons(scope) {
    (scope || document).querySelectorAll(".ico[data-ico]:not([data-done])").forEach(function (e) { e.innerHTML = icon(e.getAttribute("data-ico")); e.setAttribute("data-done", "1"); });
  }

  /* ---------- maskot: "Rina", mekanik chibi berheadphone (desain orisinal) ---------- */
  var MASCOT_SVG = '<svg viewBox="0 0 120 140" aria-hidden="true">' +
    '<ellipse cx="60" cy="136" rx="26" ry="4" fill="rgba(200,80,140,.18)"/>' +
    '<g class="m-all">' +
    // kuncir belakang + pita
    '<circle cx="24" cy="50" r="11" fill="#5a3d78"/><circle cx="96" cy="50" r="11" fill="#5a3d78"/>' +
    '<path d="M20 40l-6-5 2 8zM100 40l6-5-2 8z" fill="#ff6fa8"/>' +
    // kaki + sepatu
    '<rect x="47" y="112" width="10" height="16" rx="5" fill="#7d8cf0"/><rect x="63" y="112" width="10" height="16" rx="5" fill="#7d8cf0"/>' +
    '<ellipse cx="51" cy="129" rx="8" ry="4.5" fill="#ff6fa8"/><ellipse cx="69" cy="129" rx="8" ry="4.5" fill="#ff6fa8"/>' +
    // badan: kaos + overall
    '<path d="M40 92q20-10 40 0l4 22q-24 8-48 0z" fill="#ffffff" stroke="#f3c9db" stroke-width="1.5"/>' +
    '<path d="M44 100h32l3 15q-19 6-38 0z" fill="#8f9cff"/><path d="M47 100l-3-8M73 100l3-8" stroke="#8f9cff" stroke-width="4" stroke-linecap="round"/>' +
    '<rect x="54" y="104" width="12" height="7" rx="2.5" fill="#b9c2ff"/><path d="M57 107.5h6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>' +
    // lengan turun + kunci pas
    '<g class="m-arms"><path d="M41 95q-8 8-6 16" stroke="#ffe4d6" stroke-width="7" stroke-linecap="round" fill="none"/>' +
    '<path d="M79 95q8 6 9 14" stroke="#ffe4d6" stroke-width="7" stroke-linecap="round" fill="none"/>' +
    '<g transform="rotate(-30 90 110)"><rect x="88" y="98" width="4.5" height="20" rx="2" fill="#b8c2d8"/><path d="M85 98a5.5 5.5 0 1 1 10.5 0l-2.5 2h-5.5z" fill="#b8c2d8"/></g></g>' +
    // lengan naik (pose angkat)
    '<g class="m-arms-up"><path d="M41 95q-10-12-8-26" stroke="#ffe4d6" stroke-width="7" stroke-linecap="round" fill="none"/>' +
    '<path d="M79 95q10-12 8-26" stroke="#ffe4d6" stroke-width="7" stroke-linecap="round" fill="none"/>' +
    '<circle cx="33" cy="67" r="4.5" fill="#ffe4d6"/><circle cx="87" cy="67" r="4.5" fill="#ffe4d6"/>' +
    '<path d="M28 58l2-5 2 5M88 58l2-5 2 5" stroke="#ff9cc4" stroke-width="2" stroke-linecap="round" fill="none"/></g>' +
    // kepala
    '<circle cx="60" cy="54" r="35" fill="#5a3d78"/>' +
    '<ellipse cx="60" cy="61" rx="28" ry="26" fill="#ffe4d6"/>' +
    '<path d="M30 52q4-26 30-27q26 1 30 27q-8-10-16-12q-2 7-8 9q2-6 0-10q-6 9-17 11q4-5 4-10q-10 4-23 12z" fill="#6b4a8c"/>' +
    '<path d="M44 34q6-4 12-4" stroke="#ff9cc4" stroke-width="2.5" stroke-linecap="round" fill="none"/>' +
    // headphone
    '<path d="M24 56q0-38 36-38t36 38" stroke="#ff6fa8" stroke-width="6" fill="none" stroke-linecap="round"/>' +
    '<rect x="17" y="50" width="14" height="22" rx="7" fill="#ff6fa8"/><rect x="89" y="50" width="14" height="22" rx="7" fill="#ff6fa8"/>' +
    '<circle cx="24" cy="61" r="3.5" fill="#fff"/><circle cx="96" cy="61" r="3.5" fill="#fff"/>' +
    // jepit bintang
    '<path d="M80 34l1.6 3.4 3.7.4-2.8 2.5.8 3.6-3.3-1.9-3.3 1.9.8-3.6-2.8-2.5 3.7-.4z" fill="#ffd36f"/>' +
    // mata
    '<g class="m-eye"><ellipse cx="49" cy="62" rx="5.6" ry="7.2" fill="#3b2340"/><ellipse cx="49" cy="64.5" rx="3.6" ry="3.8" fill="#8a6cff"/><circle cx="47" cy="59" r="2" fill="#fff"/><circle cx="51" cy="66" r="1" fill="#fff"/></g>' +
    '<g class="m-eye"><ellipse cx="71" cy="62" rx="5.6" ry="7.2" fill="#3b2340"/><ellipse cx="71" cy="64.5" rx="3.6" ry="3.8" fill="#8a6cff"/><circle cx="69" cy="59" r="2" fill="#fff"/><circle cx="73" cy="66" r="1" fill="#fff"/></g>' +
    '<g class="m-happy-eye" stroke="#3b2340" stroke-width="2.6" stroke-linecap="round" fill="none"><path d="M43.5 63q5.5-7 11 0"/><path d="M65.5 63q5.5-7 11 0"/></g>' +
    // pipi + mulut
    '<ellipse cx="41" cy="72" rx="5" ry="3" fill="#ff9cc4" opacity=".65"/><ellipse cx="79" cy="72" rx="5" ry="3" fill="#ff9cc4" opacity=".65"/>' +
    '<path class="m-mouth-s" d="M56 74q4 4 8 0" stroke="#c2456f" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
    '<path class="m-mouth-o" d="M55.5 73.5q4.5 8 9 0z" fill="#c2456f"/>' +
    '<path class="m-mouth-w" d="M55 76q2.5-2.5 5 0t5 0" stroke="#c2456f" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<path class="m-sweat" d="M88 38q4 6 0 9q-4-3 0-9z" fill="#9fdcff"/>' +
    "</g></svg>";
  var TAPS = [
    ["Hai~! Aku Rina, mekanik suspensimu ✿", "happy"], ["Cek tekanan tangki dulu ya~", "wiggle"], ["Preset Parkir cuma buat foto, nya!", "worry"],
    ["Balonnya empuk~ ☁️", "happy"], ["Jangan lupa sekering & relief valve!", "wiggle"], ["Ganbatte! Mobilmu makin keren ✨", "happy"],
    ["Tahan tombol ▲ untuk isi, ▼ untuk buang~", "wiggle"], ["Kyaa~ geli! 🙈", "happy"],
  ];
  var mascotEl = null, bubbleEl = null, moodTimer = 0, bubbleTimer = 0;
  function buildMascot() {
    if (mascotEl) return;
    mascotEl = document.createElement("div");
    mascotEl.className = "mascot"; mascotEl.setAttribute("role", "button"); mascotEl.setAttribute("aria-label", "Maskot Rina");
    mascotEl.innerHTML = MASCOT_SVG;
    bubbleEl = document.createElement("div"); bubbleEl.className = "m-bubble"; bubbleEl.setAttribute("aria-live", "polite");
    document.body.appendChild(mascotEl); document.body.appendChild(bubbleEl);
    mascotEl.addEventListener("click", function () { var t = TAPS[Math.floor(Math.random() * TAPS.length)]; say(t[0], t[1], 1600); });
  }
  function mood(m, ms) {
    if (!mascotEl) return;
    mascotEl.classList.remove("happy", "lift", "crouch", "worry", "wiggle");
    void mascotEl.offsetWidth;
    if (m && m !== "idle") mascotEl.classList.add(m);
    clearTimeout(moodTimer);
    if (ms) moodTimer = setTimeout(function () { mood("idle"); }, ms);
  }
  function say(text, m, ms) {
    if (theme !== "anime" || !prefs.mascot || !mascotEl) return;
    if (m) mood(m, ms || 2200);
    bubbleEl.textContent = text; bubbleEl.classList.add("show");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubbleEl.classList.remove("show"); }, Math.max(2200, text.length * 70));
  }

  /* ---------- sakura ---------- */
  var sakuraEl = null;
  function buildSakura() {
    if (sakuraEl) return;
    sakuraEl = document.createElement("div"); sakuraEl.className = "sakura"; sakuraEl.setAttribute("aria-hidden", "true");
    var n = window.innerWidth < 600 ? 12 : 20, html = "";
    for (var i = 0; i < n; i++) {
      var s = 8 + Math.random() * 9, d = 8 + Math.random() * 9;
      html += '<i class="petal" style="left:' + (Math.random() * 100).toFixed(1) + "%;width:" + s.toFixed(1) + "px;height:" + (s * .78).toFixed(1) + "px;animation-duration:" + d.toFixed(1) + "s," + (2 + Math.random() * 2).toFixed(1) + "s;animation-delay:-" + (Math.random() * d).toFixed(1) + 's"></i>';
    }
    sakuraEl.innerHTML = html;
    document.body.appendChild(sakuraEl);
  }

  /* ---------- suara lembut, getar, partikel ---------- */
  var actx = null;
  function pop() {
    if (!prefs.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = "sine"; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1500, t + .07);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.05, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + .14);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + .15);
    } catch (e) { /* tanpa audio */ }
  }
  var SPARK = ["✿", "♡", "✦", "★", "❀"];
  function sparkle(x, y) {
    for (var i = 0; i < 7; i++) {
      var s = document.createElement("span"), a = Math.random() * Math.PI * 2, r = 26 + Math.random() * 30;
      s.className = "spark"; s.textContent = SPARK[i % SPARK.length];
      s.style.left = x - 7 + "px"; s.style.top = y - 7 + "px";
      s.style.color = ["#ff6fa8", "#9b8cff", "#56b6ff", "#ffb86b"][i % 4];
      s.style.setProperty("--dx", (Math.cos(a) * r).toFixed(0) + "px"); s.style.setProperty("--dy", (Math.sin(a) * r - 10).toFixed(0) + "px");
      document.body.appendChild(s);
      setTimeout(function (el) { return function () { el.remove(); }; }(s), 720);
    }
  }
  document.addEventListener("pointerdown", function (e) {
    if (theme !== "anime") return;
    var t = e.target.closest && e.target.closest("button, a.btn, .preset, .hold, .chip, .toggle, .tp-btn, .mascot, .hit");
    if (!t) return;
    sparkle(e.clientX, e.clientY); pop();
    if (navigator.vibrate) navigator.vibrate(10);
  }, true);

  /* ---------- pemilih tema ---------- */
  var pickers = [];
  function buildPicker(host) {
    var w = document.createElement("div"); w.className = "tp";
    var opts = THEMES.map(function (t) { return '<button class="tp-opt" data-t="' + t.id + '"><span class="tp-sw" style="background:' + t.sw + '"></span>' + t.name + "</button>"; }).join("");
    w.innerHTML = '<button class="tp-btn" aria-haspopup="true" aria-label="Ganti tema" title="Ganti tema">' + icon("theme") + "</button>" +
      '<div class="tp-menu" role="menu"><small>TEMA TAMPILAN</small>' + opts +
      '<div class="tp-anime"><small>MODE ANIME</small><div class="tp-row"><button data-p="sound">🔊 Suara</button><button data-p="mascot">🧸 Maskot</button></div></div></div>';
    host.appendChild(w);
    w.querySelector(".tp-btn").addEventListener("click", function (e) { e.stopPropagation(); w.classList.toggle("open"); });
    w.querySelectorAll(".tp-opt").forEach(function (b) { b.addEventListener("click", function () { apply(b.getAttribute("data-t")); w.classList.remove("open"); }); });
    w.querySelectorAll("[data-p]").forEach(function (b) {
      b.addEventListener("click", function () { var k = b.getAttribute("data-p"); prefs[k] = !prefs[k]; ls.set("rzm." + k, prefs[k] ? "1" : "0"); sync(); });
    });
    pickers.push(w);
  }
  document.addEventListener("click", function () { pickers.forEach(function (p) { p.classList.remove("open"); }); });
  function sync() {
    pickers.forEach(function (p) {
      p.querySelectorAll(".tp-opt").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-t") === theme); });
      p.querySelector(".tp-anime").style.display = theme === "anime" ? "" : "none";
      p.querySelectorAll("[data-p]").forEach(function (b) { b.classList.toggle("on", !!prefs[b.getAttribute("data-p")]); });
    });
    var anime = theme === "anime";
    if (anime) {
      if (!document.getElementById("rzm-anime-font")) {
        var l = document.createElement("link"); l.id = "rzm-anime-font"; l.rel = "stylesheet";
        l.href = "https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;700;800&display=swap";
        document.head.appendChild(l);
      }
      buildSakura(); buildMascot();
    }
    if (sakuraEl) sakuraEl.style.display = anime ? "" : "none";
    if (mascotEl) { mascotEl.style.display = anime && prefs.mascot ? "" : "none"; bubbleEl.style.display = mascotEl.style.display; }
    var meta = document.querySelector('meta[name="theme-color"]');
    var t = THEMES.filter(function (x) { return x.id === theme; })[0];
    if (meta && t) meta.setAttribute("content", t.meta);
  }
  function apply(id) {
    if (!THEMES.some(function (t) { return t.id === id; })) return;
    theme = id; root.setAttribute("data-theme", id); ls.set(KEY, id); sync();
    if (id === "anime") setTimeout(function () { say("Mode anime aktif~! Ketuk aku kapan saja ✿", "happy", 1800); }, 300);
    try { window.dispatchEvent(new CustomEvent("rzm-theme", { detail: id })); } catch (e) { /* lama */ }
  }

  /* ---------- onboarding sekali ---------- */
  function onboard(key, steps) {
    if (ls.get("rzm.ob." + key) || !steps.length) return;
    var i = 0, card = document.createElement("div"), focused = null;
    card.className = "ob-card"; card.setAttribute("role", "dialog");
    document.body.appendChild(card);
    function done() { ls.set("rzm.ob." + key, "1"); if (focused) focused.classList.remove("ob-focus"); card.remove(); }
    function show() {
      var s = steps[i]; if (focused) focused.classList.remove("ob-focus");
      focused = s.sel ? document.querySelector(s.sel) : null;
      if (focused) { focused.classList.add("ob-focus"); focused.scrollIntoView({ block: "center", behavior: "smooth" }); }
      card.innerHTML = "<b>" + s.title + "</b><p>" + s.text + '</p><div class="ob-row"><span>' + (i + 1) + "/" + steps.length +
        '</span><button class="skip">Lewati</button><button class="go">' + (i === steps.length - 1 ? "Siap!" : "Lanjut") + "</button></div>";
      card.querySelector(".skip").onclick = done;
      card.querySelector(".go").onclick = function () { if (++i >= steps.length) done(); else show(); };
      say(s.title, "wiggle", 1500);
    }
    show();
  }

  function init() {
    var hosts = document.querySelectorAll("[data-theme-picker]");
    if (hosts.length) hosts.forEach(buildPicker);
    else { var f = document.createElement("div"); f.className = "tp-float"; document.body.appendChild(f); buildPicker(f); }
    fillIcons();
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  window.RZMTheme = {
    apply: apply, get theme() { return theme; }, themes: THEMES, icon: icon, fillIcons: fillIcons, onboard: onboard,
    mascot: { say: say, mood: function (m, ms) { if (theme === "anime") mood(m, ms); } },
  };
})();
