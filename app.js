/* 場面で覚える英単語 */
"use strict";
(function () {
  const APP = "場面で覚える英単語";
  const LS_KEY = "bamen.v1";
  const MAX_NEW = 10;    // 1回に新しく覚える単語は10まで
  const MAX_SETS = 3;    // 新しい単語を学ぶのは1日3セットまで（そのあとは復習だけ）
  const MAX_TOTAL = 25;  // 1回に確認する単語は、復習と新しい単語をあわせて25まで（新しい単語の枠（最大10）をとっておき、残りを復習に）
  const INTERVALS = [1, 3, 7, 30]; // Got it! が続いたときの次の復習までの日数。30日後の復習でも Got it! なら、もう復習に出さない（done）
  const NEVER = "9999-12-31";
  const $ = (id) => document.getElementById(id);
  const main = $("main"), bottom = $("bottom"), where = $("where"), progress = $("progress");
  let DATA = null, ITEMS = {}, ITEM_SCENE = {}, ORDER = [];
  let state = loadState();
  let session = null;

  /* ---------- 記録 ---------- */
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (s && typeof s === "object" && s.items) return migrate(clean(s));
    } catch (e) {}
    return { v: 1, items: {} };
  }
  // 記録の中身を確かめて、決まった形の値だけを使う（読みこんだバックアップに変な値が入っていても、画面に出さない）
  function clean(s) {
    const DATE = /^\d{4}-\d{2}-\d{2}$/, ID = /^[A-Za-z0-9_]{1,80}$/;
    const num = (x, max) => (Number.isInteger(x) && x >= 0 && x <= max ? x : 0);
    const date = (x) => (typeof x === "string" && DATE.test(x) ? x : undefined);
    const out = { v: 1, items: {} };
    if (s && typeof s.items === "object" && !Array.isArray(s.items)) {
      Object.keys(s.items).forEach((id) => {
        const r = s.items[id];
        if (!ID.test(id) || id === "__proto__" || id === "constructor" || id === "prototype" || !r || typeof r !== "object") return;
        const o = { box: num(r.box, 10), ok: num(r.ok, 1e6), ng: num(r.ng, 1e6), due: date(r.due) || today() };
        if (date(r.last)) o.last = r.last;
        if (date(r.first)) o.first = r.first;
        if (r.done === true) o.done = true;
        if (r.manual === true) o.manual = true;
        out.items[id] = o;
      });
    }
    if (s && s.sets && date(s.sets.date)) out.sets = { date: s.sets.date, n: num(s.sets.n, 99) };
    return out;
  }
  // 以前の間隔（1・3・7・14・30日）の記録を、今の間隔（1・3・7・30日）に合わせる
  function migrate(s) {
    Object.values(s.items).forEach((r) => { if (!r.done && r.box > INTERVALS.length) r.box = INTERVALS.length; });
    return s;
  }
  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
    catch (e) { toast("記録を保存できませんでした"); }
  }
  function today() { return dayStr(new Date()); }
  function dayStr(d) {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function addDays(n) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return dayStr(d); }
  function record(id, ok) {
    const r = state.items[id] || { box: 0, ok: 0, ng: 0, first: today() }; // first：はじめて学習した日
    if (ok) {
      if (r.done || r.box >= INTERVALS.length) { r.done = true; r.due = NEVER; } // 30日後の復習も Got it! → 卒業
      else { r.box++; r.due = addDays(INTERVALS[r.box - 1]); }
      r.ok++;
    } else { r.box = 0; r.done = false; r.due = addDays(1); r.ng++; }
    r.last = today();
    state.items[id] = r;
    saveState();
  }
  // 今日 Not yet にした単語を、同じ日のやり直し（もう一度・もう一回）で Got it! にできたら、Got it! の状態にする
  function upgradeToday(id) {
    const r = state.items[id];
    if (!r || r.done || r.box !== 0 || r.last !== today()) return;
    r.box = 1; r.due = addDays(INTERVALS[0]); r.ok++;
    saveState();
  }
  // 「もう復習に出さない」にする／もどす
  function setSkip(id, on) {
    const r = state.items[id]; if (!r) return;
    if (on) { r.done = true; r.manual = true; r.due = NEVER; }
    else { r.done = false; r.manual = false; r.box = Math.max(1, Math.min(r.box, INTERVALS.length - 1)); r.due = addDays(1); }
    saveState();
  }
  function dueItems() {
    const t = today();
    return Object.keys(state.items).filter((id) => ITEMS[id] && state.items[id].due <= t)
      .sort((a, b) => state.items[a].due < state.items[b].due ? -1 : 1);
  }
  function sceneDone(s) { return s.items.every((it) => state.items[it.id]); }
  // 今回の復習の単語（古い順に、最大 MAX_TOTAL）
  // 今回の復習の単語：新しい単語の枠（最大10）をとっておき、残り（25−新しい単語の数）を古い順に
  function reviewToday() { const n = newCount(nextScenes()); return dueItems().slice(0, MAX_TOTAL - n); }
  const newCount = (scenes) => scenes.reduce((a, s) => a + s.items.filter((i) => !state.items[i.id]).length, 0);
  // 今日、新しい単語を学んだセットの数
  function setsToday() { return state.sets && state.sets.date === today() ? state.sets.n : 0; }
  function countSet() { state.sets = { date: today(), n: setsToday() + 1 }; saveState(); }
  const setsDone = () => setsToday() >= MAX_SETS;
  const hasNew = (s) => s.items.some((i) => !state.items[i.id]);
  function nextScenes() { // 新しい単語が MAX_NEW（10）をこえない数だけ、順に場面を選ぶ（3セット後は選ばない）
    const limit = setsDone() ? 0 : MAX_NEW; // 3セットが残っていれば、復習が多くても新しい場面の枠をとっておく
    const out = []; let n = 0;
    if (limit <= 0) return out;
    for (const s of ORDER) {
      if (sceneDone(s)) continue;
      const k = s.items.filter((i) => !state.items[i.id]).length;
      if (n + k > limit && (out.length || limit < MAX_NEW)) break;
      out.push(s); n += k;
      if (n >= limit) break;
    }
    return out;
  }

  /* ---------- 表示の部品 ---------- */
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function sceneHTML(en) { // {文字|id} → タップできる単語
    return esc(en).replace(/\{([^{}|]+)\|([^{}]+)\}([.,!?;:]*)/g, (m, t, id, p) => `<span class="nw"><button type="button" class="w" data-id="${id}" lang="en">${t}</button>${p}</span>`);
  }
  // 会話（A: … B: …）は、話す人ごとに改行する
  function ab(html) {
    if (!/^A[:：]/.test(html)) return html; // 「A:」で始まる会話の文だけ
    return html.replace(/[\s\u3000]+([AB])([:：])\s*/g, (m, w, c) => `<br>${w}${c}${c === ":" ? " " : ""}`);
  }
  function checkHTML(en) { return ab(esc(en).replace(/\{([^{}|]+)\}([.,!?;:]*)/g, '<span class="nw"><b>$1</b>$2</span>')); }
  function plain(en) { return en.replace(/\{([^{}|]+)(\|[^{}]+)?\}/g, "$1"); }
  function setTop(text, back, menu, icon) {
    where.innerHTML = (icon || "") + esc(text);
    $("backBtn").hidden = !back; $("backBtn").onclick = back || null;
    $("menuBtn").hidden = !menu; $("menuBtn").onclick = menu || null; $("menuBtn").textContent = "メニュー"; $("menuBtn").classList.remove("primary");
  }
  function setBottom(buttons) {
    bottom.innerHTML = "";
    buttons.forEach((b) => {
      if (b.hint) { const h = document.createElement("div"); h.className = "hint"; h.textContent = b.hint; bottom.appendChild(h); return; }
      if (b.spacer) { const s = document.createElement("div"); s.className = "spacer"; bottom.appendChild(s); return; }
      const el = document.createElement("button");
      el.type = "button"; el.className = "big " + (b.cls || ""); el.textContent = b.label;
      el.onclick = () => { if (b.sfx) sfx(b.sfx); b.onClick(); };
      if (b.delay) { el.disabled = true; setTimeout(() => (el.disabled = false), b.delay); } // 連打でうっかり押さないように
      bottom.appendChild(el);
    });
  }
  function show(html) { main.innerHTML = html; main.scrollTop = 0; main.focus({ preventScroll: true }); }
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.tm); toast.tm = setTimeout(() => (t.hidden = true), 2600); }
  function modal(text, buttons) {
    const m = $("modal");
    m.innerHTML = `<div class="box"><div>${text}</div><div class="btns"></div></div>`;
    const box = m.querySelector(".btns");
    buttons.forEach((b) => {
      const el = document.createElement("button");
      el.type = "button"; el.className = "big " + (b.cls || ""); el.textContent = b.label;
      el.onclick = () => { m.hidden = true; b.onClick && b.onClick(); };
      box.appendChild(el);
    });
    m.hidden = false; box.querySelector("button").focus();
  }

  /* ---------- アイコン（線だけのシンプルな形） ---------- */
  const SVG = (d) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    speak: SVG('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9a4.5 4.5 0 0 1 0 6"/><path d="M19.5 6a8.5 8.5 0 0 1 0 12"/>'),
    "会話": SVG('<path d="M3 4h12v8H8l-4 3v-3H3z"/><path d="M15 8h6v8h-1v3l-3.5-3H11v-2"/>'),
    "メッセージ": SVG('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M9.5 9h5M9.5 12.5h5"/><path d="M11 18.5h2"/>'),
    "メール": SVG('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6 8.5-6"/>'),
    "お知らせ": SVG('<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'),
    check: SVG('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M7.5 12.5l3 3 6-6.5"/>'),
    menuScenes: SVG('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
    menuHelp: SVG('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17.5v.01"/>'),
    menuBackup: SVG('<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
    menuToday: SVG('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/><path d="M9 15l2 2 4-4"/>'),
    menuSettings: SVG('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
    menuSearch: SVG('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
    menuAbout: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.01"/>'),
    "記事": SVG('<path d="M4 5h12v14H6a2 2 0 0 1-2-2z"/><path d="M16 9h4v8a2 2 0 0 1-2 2h-2"/><path d="M7 9h6M7 12.5h6M7 16h4"/>'),
  };
  const typeIcon = (t) => ICON[t] || "";
  const CAT_ICON = {
    home: SVG('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>'),
    school1: SVG('<path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z"/><path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/>'),
    school2: SVG('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 20h8"/>'),
    hobby: SVG('<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/>'),
    shop: SVG('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
    travel: SVG('<path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>'),
    health: SVG('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/><path d="M12 10v4M10 12h4"/>'),
    contact: SVG('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>'),
    town: SVG('<path d="M3 20h18"/><path d="M5 20V9l5-3v14"/><path d="M10 20V4h9v16"/><path d="M13 8h3M13 12h3M13 16h3"/>'),
  };

  /* ---------- 効果音（設定でOFFにできる） ---------- */
  const SET_KEY = "bamen.settings";
  let settings = { sound: true };
  try { // 決まった設定だけを読む
    const s = JSON.parse(localStorage.getItem(SET_KEY) || "{}");
    if (typeof s.sound === "boolean") settings.sound = s.sound;
    if (typeof s.lastBackup === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.lastBackup)) settings.lastBackup = s.lastBackup;
  } catch (e) {}
  function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) {} }
  // 効果音は小さめの音量で、Web Audio を使って鳴らす。
  // iPhone・iPad（Safari 16.4以降）は "ambient" にして、消音スイッチがONのときは鳴らないようにする。
  const SFX_NAMES = ["tap", "gotit", "notyet", "great", "genius"];
  const SFX_VOL = 0.3;
  try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (e) {}
  let actx = null, gain = null; const BUF = {}, FALLBACK = {};
  function initAudio() {
    if (actx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { SFX_NAMES.forEach((n) => { const a = new Audio("sound/" + n + ".mp3"); a.preload = "auto"; a.volume = SFX_VOL; FALLBACK[n] = a; }); actx = "none"; return; }
    actx = new AC(); gain = actx.createGain(); gain.gain.value = SFX_VOL; gain.connect(actx.destination);
    SFX_NAMES.forEach((n) => fetch("sound/" + n + ".mp3").then((r) => r.arrayBuffer()).then((b) => new Promise((ok, ng) => actx.decodeAudioData(b, ok, ng))).then((buf) => (BUF[n] = buf)).catch(() => {}));
  }
  // 最初にさわったときに準備する（ブラウザの決まりで、さわる前は音を鳴らせない）
  ["pointerdown", "keydown"].forEach((ev) => window.addEventListener(ev, () => { if (settings.sound) initAudio(); if (actx && actx !== "none" && actx.state === "suspended") actx.resume(); }, { capture: true }));
  function sfx(name) {
    if (!settings.sound) return;
    initAudio();
    try {
      if (actx === "none") { const a = FALLBACK[name].cloneNode(); a.volume = SFX_VOL; a.play().catch(() => {}); return; }
      if (!BUF[name]) return;
      const src = actx.createBufferSource(); src.buffer = BUF[name]; src.connect(gain); src.start();
    } catch (e) {}
  }

  /* ---------- 読み上げ ---------- */
  let voice = null;
  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    const vs = speechSynthesis.getVoices();
    voice = vs.find((v) => v.lang === "en-US" && /Samantha|Google US|Aria|Jenny/i.test(v.name)) || vs.find((v) => v.lang === "en-US") || vs.find((v) => /^en/.test(v.lang)) || null;
  }
  if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speak(text) {
    if (!("speechSynthesis" in window)) { toast("この端末では読み上げできません"); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/—/g, ","));
    u.lang = "en-US"; if (voice) u.voice = voice; u.rate = 0.95;
    speechSynthesis.speak(u);
  }

  /* ---------- 単語の説明（下から出るシート） ---------- */
  function openSheet(id) {
    const it = ITEMS[id]; if (!it) return;
    const sh = $("sheet");
    sh.innerHTML = `<div class="small muted">${esc(it.pos)}</div>
      <div class="word" id="sheetWord" lang="en">${esc(it.word)}</div>
      <div class="mean">${esc(it.ja)}</div>
      ${it.forms ? `<div class="forms"><b>不規則動詞の活用</b><span lang="en">${esc(it.forms)}</span><div class="small muted">原形 – 過去形 – 過去分詞</div></div>` : ""}
      ${it.other ? `<div class="other"><b>ほかの意味</b>${esc(it.other)}</div>` : ""}
      ${state.items[id] && state.items[id].done ? `<div class="skip-note small">この単語は、もう復習に出ません。<button type="button" class="chip" id="sheetBack">復習にもどす</button></div>` : ""}
      <div class="row"><button type="button" class="chip" id="sheetSay">${ICON.speak}読む</button>
      <button type="button" class="chip" id="sheetClose">とじる</button></div>`;
    sh.hidden = false;
    $("sheetSay").onclick = () => speak(it.word.replace(/～/g, "").replace(/\.\.\.,/g, ""));
    $("sheetClose").onclick = closeSheet;
    if ($("sheetBack")) $("sheetBack").onclick = () => { sfx("tap"); setSkip(id, false); openSheet(id); main.querySelectorAll(`.skip-row input[data-id="${id}"], .today-skip[data-id="${id}"]`).forEach((c) => (c.checked = false)); };
    $("sheetClose").focus();
  }
  function closeSheet() { $("sheet").hidden = true; }
  main.addEventListener("click", (e) => {
    const w = e.target.closest(".w"); if (w) openSheet(w.dataset.id);
  });

  /* ---------- メニュー ---------- */
  function menu() {
    session = null; progress.hidden = true; closeSheet();
    setTop(APP, null, null);
    const due = dueItems().length, rest = DATA.scenes.filter((s) => !sceneDone(s)).length;
    const learned = Object.keys(state.items).filter((id) => ITEMS[id]).length;
    const canStart = due > 0 || (rest > 0 && !setsDone());
    show(`<div class="card">
        <span class="tag">準2級</span>
        <div class="stats">
          <div class="stat"><div class="k">残りの場面</div><div class="v">${rest}<span class="small">／${DATA.scenes.length}</span></div></div>
          <div class="stat"><div class="k">これまで学んだ単語</div><div class="v">${learned}<span class="small">／${Object.keys(ITEMS).length}</span></div></div>
        </div>
        <div class="small muted">${canStart ? `${nextScenes().length ? "「新しい場面をはじめる」" : "「予定の復習問題をはじめる」"}で、${nextScenes().length ? `新しい場面を読む（${nextScenes().length}つ）→ ` : ""}${nextScenes().length ? "意味の確認 → " : ""}${due ? `今日の復習問題（${reviewToday().length}問）→ ` : ""}Not yet の単語をもう一度 の順に進みます。確認と復習問題は、あわせて1回25問までです。` : setsDone() ? "1日に学習できる新しい場面は3セットまでです。また明日！" + (todayReviewIds().length ? "<br>「今日の単語の復習問題」は、何回でもできます。" : "") : "今日の学習はおわりです。また明日！"}</div>
        <div class="small muted">今日の新しい場面：${setsToday()}／${MAX_SETS}セット${setsDone() && due ? "（あとは復習だけできます）" : ""}</div>
      </div>
      ${todayIds().length ? `<div class="menu-list"><button type="button" id="mToday">${ICON.menuToday}今日の単語を見る<span class="cnt">${todayIds().length}</span></button></div>` : ""}
      <div class="menu-grid">
        <button type="button" id="mScenes">${ICON.menuScenes}場面を選ぶ</button>
        <button type="button" id="mSearch">${ICON.menuSearch}単語をさがす</button>
        <button type="button" id="mHelp">${ICON.menuHelp}使い方</button>
        <button type="button" id="mBackup">${ICON.menuBackup}バックアップ</button>
        <button type="button" id="mSettings">${ICON.menuSettings}設定</button>
        <button type="button" id="mAbout">${ICON.menuAbout}アプリについて</button>
      </div>`);
    if ($("mToday")) $("mToday").onclick = () => { sfx("tap"); todayList(); };
    const go = (f) => () => { sfx("tap"); f(); };
    $("mScenes").onclick = go(categoryList); $("mSearch").onclick = go(() => search()); $("mHelp").onclick = go(help); $("mBackup").onclick = go(backup); $("mSettings").onclick = go(settingsScreen); $("mAbout").onclick = go(about);
    // 下のボタン：①新しい場面（予定の復習問題もふくむ）②今日の単語の復習問題（何回でもできる練習）
    const btns = [];
    if (canStart) btns.push({ label: nextScenes().length ? "新しい場面をはじめる" : "予定の復習問題をはじめる", cls: "wide", sfx: "tap", onClick: () => startSession() });
    if (todayReviewIds().length) btns.push({ label: "今日の単語の復習問題", cls: "wide sub", sfx: "tap", onClick: startTodayReview });
    setBottom(btns);
  }

  /* ---------- 学習の回 ---------- */
  function startSession(chosen, practice) { // chosen：メニューで選んだ場面（なければ順番に）。practice：「もう一回」の練習（記録しない）
    const scenes = chosen || nextScenes();
    const newIds = chosen ? scenes.flatMap((s) => s.items.map((i) => i.id)) : scenes.flatMap((s) => s.items.map((i) => i.id)).filter((id) => !state.items[id]);
    const review = chosen ? [] : dueItems().filter((id) => !newIds.includes(id)).slice(0, MAX_TOTAL - newIds.length);
    const steps = [];
    scenes.forEach((s) => steps.push({ k: "scene", phase: 0, s }));
    shuffle(newIds.slice()).forEach((id) => steps.push({ k: "check", phase: 1, id })); // 新しい単語：英語→日本語（Got it / Not yet）
    if (review.length) { // 復習の単語：区切りの画面のあと、日本語→英語の4択（選択肢のない単語は英語→日本語）
      steps.push({ k: "intro", phase: 2 });
      shuffle(review.slice()).forEach((id) => steps.push({ k: "check", phase: 2, id, cz: !!ITEMS[id].cz }));
    }
    steps.push({ k: "summary", phase: 4 });
    session = { newSet: !practice && newIds.some((id) => !state.items[id]), counted: false, review: new Set(review), steps, i: 0, wrong: [], answered: {}, retried: {}, scenes: scenes.map((s) => s.id), practice: !!practice };
    step();
  }
  // 今日の単語をもう一度復習する（何回でもできる練習。復習の予定は変えない。Not yet だった単語を Got it! にすると「済」になる）
  const todayReviewIds = () => todayIds().filter((id) => !state.items[id].done);
  function startTodayReview() {
    const ids = todayReviewIds();
    const ng = shuffle(ids.filter((id) => state.items[id].box === 0)), ok = shuffle(ids.filter((id) => state.items[id].box > 0));
    const list = ng.concat(ok).slice(0, MAX_TOTAL); // Not yet の単語を先に、25問まで
    const steps = list.map((id) => ({ k: "check", phase: 2, id, cz: !!ITEMS[id].cz })); // 日本語→英語の4択（選択肢のない単語は英語→日本語）
    steps.push({ k: "summary", phase: 4 });
    session = { newSet: false, counted: false, review: new Set(list), steps, i: 0, wrong: [], answered: {}, retried: {}, scenes: [], practice: true, todayReview: true };
    step();
  }
  function quit() {
    modal("やめますか？<br><span class='small muted'>答えた単語の記録は残ります。読んだだけで確認していない場面は、次にもう一度出ます。</span>", [
      { label: "やめる", cls: "sub", onClick: menu }, { label: "つづける" }]);
  }
  function showProgress() {
    const st = session.steps[session.i];
    const names = ["読む", "確認", "復習問題", "もう一度", "まとめ"];
    const has = [0, 1, 2, 3, 4].filter((p) => session.steps.some((s) => s.phase === p));
    const same = session.steps.filter((s) => s.phase === st.phase && s.k !== "summary" && s.k !== "intro");
    const n = same.indexOf(st) + 1;
    progress.innerHTML = `<div class="steps">${has.map((p) => `<span class="${p === st.phase ? (p === 4 ? "now last" : "now") : p < st.phase ? "done" : ""}">${p < st.phase ? ICON.check : ""}${names[p]}</span>`).join("")}</div>` +
      (same.length && st.k !== "intro" ? `<div class="count">${n}／${same.length}${st.retry ? "（もう一度）" : ""}</div>` : "");
    progress.hidden = false;
  }
  function next() { session.i++; step(); }
  function step() {
    closeSheet();
    const st = session.steps[session.i];
    showProgress();
    setTop(st.k === "scene" ? st.s.title : st.k === "summary" ? "まとめ" : session.todayReview ? "今日の単語の復習問題" : st.k === "intro" || st.cz ? "今日の復習問題" : "意味の確認", null, quit, st.k === "scene" ? typeIcon(st.s.type) : "");
    const prevScene = session.i > 0 && session.steps[session.i - 1].k === "scene";
    if (st.k === "scene") sceneScreen(st.s, () => next(), false, null, prevScene ? () => { session.i--; step(); } : null);
    else if (st.k === "intro") introScreen();
    else if (st.k === "check" && st.cz) czScreen(st);
    else if (st.k === "check") checkScreen(st);
    else summary();
  }

  /* 場面を読む画面 */
  function sceneScreen(s, onNext, isReview, backLabel, onPrev) {
    const conv = s.type === "会話";
    show(`<div class="card">
        <span class="tag">${typeIcon(s.type)}${esc(s.type)}</span><span class="small muted">${s.code}</span>
        <div class="row">
          <button type="button" class="chip" id="sayAll">${ICON.speak}全部を読む</button>
          <button type="button" class="chip" id="jaBtn" aria-pressed="false">訳を見る</button>
          <button type="button" class="chip" id="clozeBtn" aria-pressed="false">穴うめ</button>
        </div>
        <div class="small muted" id="clozeHint" hidden>日本語訳を見て、空いているところに入る英語を考えよう。空欄をタップすると答えが出ます。</div>
        <div id="lines">${s.lines.map((l, i) => `<div class="line">
            ${conv ? `<div class="sp ${esc(l.sp)}" aria-label="${esc(l.sp)}さん">${esc(l.sp)}</div>` : ""}
            <div class="body"><div class="en" lang="en">${sceneHTML(l.en)}</div><div class="ja" hidden>${esc(l.ja)}</div></div>
            <button type="button" class="say" data-line="${i}" aria-label="この文を読む">${ICON.speak}</button></div>`).join("")}</div>
      </div>
      <div class="small muted">色のついた単語をタップすると、意味が出ます。</div>
      <div class="note"><b>💡 ポイント</b>${esc(s.note)}</div>
      <div class="gram"><b>📘 文法：${esc(s.grammar.name)}</b>${esc(s.grammar.text)}</div>`);
    $("sayAll").onclick = () => speak(s.lines.map((l) => plain(l.en)).join(" "));
    main.querySelectorAll(".say").forEach((b) => (b.onclick = () => speak(plain(s.lines[b.dataset.line].en))));
    let jaOn = false, cloze = false;
    const drawJa = () => main.querySelectorAll("#lines .ja").forEach((j) => (j.hidden = !(jaOn || cloze)));
    $("jaBtn").onclick = function () {
      jaOn = !jaOn;
      this.setAttribute("aria-pressed", jaOn); this.textContent = jaOn ? "訳をかくす" : "訳を見る";
      drawJa();
    };
    $("clozeBtn").onclick = function () {
      cloze = !cloze;
      this.setAttribute("aria-pressed", cloze);
      $("lines").classList.toggle("cloze", cloze);
      $("clozeHint").hidden = !cloze;
      main.querySelectorAll("#lines .w").forEach((w) => { w.classList.remove("open"); w.setAttribute("aria-label", cloze ? "空欄（タップで答え）" : ""); if (!cloze) w.removeAttribute("aria-label"); });
      drawJa();
    };
    // 穴うめ中は、空欄をタップすると答えを出す（もう一度タップで意味の説明）
    $("lines").addEventListener("click", (e) => {
      const w = e.target.closest(".w"); if (!w || !cloze || w.classList.contains("open")) return;
      e.stopPropagation(); w.classList.add("open"); w.removeAttribute("aria-label");
    }, true);
    const nextBtn = { label: backLabel || (isReview ? "一覧にもどる" : "次へ"), sfx: "tap", onClick: onNext };
    setBottom(onPrev ? [{ label: "もどる", cls: "sub back", sfx: "tap", onClick: onPrev }, nextBtn] : [nextBtn]); // 2つ目からの場面は、前の場面にもどれる
  }

  /* 意味の確認の画面 */
  function checkScreen(st) {
    const it = ITEMS[st.id];
    show(`<div class="card">
        ${session.review.has(st.id) ? '<span class="tag review">復習</span>' : ""}<div class="small muted">太字の単語は、どんな意味？ 考えてから「意味を見る」を押そう。</div>
        <div class="q-en" lang="en">${checkHTML(it.check.en)}</div>
        <div class="row"><button type="button" class="chip" id="sayQ">${ICON.speak}読む</button></div>
        <div id="ans"></div>
      </div>`);
    $("sayQ").onclick = () => speak(plain(it.check.en));
    setBottom([{ label: "意味を見る", sfx: "tap", onClick: reveal }]);
    function reveal() {
      $("ans").innerHTML = `<div class="ans">
          <div class="small muted">${esc(it.pos)}</div>
          <div class="word" lang="en">${esc(it.word)}</div>
          <div class="mean">${esc(it.ja)}</div>
          <div class="ja">${ab(esc(it.check.ja))}</div>
          ${it.forms ? `<div class="forms"><b>不規則動詞の活用</b><span lang="en">${esc(it.forms)}</span><div class="small muted">原形 – 過去形 – 過去分詞</div></div>` : ""}
          ${it.other ? `<div class="other"><b>ほかの意味</b>${esc(it.other)}</div>` : ""}
</div>`;
      $("ans").scrollIntoView({ behavior: "smooth", block: "nearest" });
      setBottom([{ hint: "わかったら「Got it!」、まだなら「Not yet」を選ぼう。" }, { label: "Not yet", cls: "ng", sfx: "notyet", onClick: () => answer(false) },
                 { label: "Got it!", cls: "ok", sfx: "gotit", onClick: () => answer(true) }]);
    }
    function answer(ok) { mark(st, ok); next(); }
  }

  // 答えを記録する（英語→日本語でも、4択でも同じ）
  function mark(st, ok) {
    {
      const first = !st.retry && !session.answered[st.id];
      if (first) session.answered[st.id] = ok ? "ok" : "ng";
      if (first && !session.practice) {
        if (session.newSet && !session.counted && !state.items[st.id] && !session.review.has(st.id)) { countSet(); session.counted = true; } // 新しい単語に答えたら1セット
        record(st.id, ok);
      }
      else if (ok) upgradeToday(st.id); // やり直し（もう一度・もう一回）で Got it! → 今日の Not yet を Got it! にする
      if (!ok && !session.retried[st.id]) {
        session.retried[st.id] = true;
        if (!session.wrong.includes(st.id)) session.wrong.push(st.id);
        const sumIdx = session.steps.findIndex((s) => s.k === "summary");
        session.steps.splice(sumIdx, 0, { k: "check", phase: 3, id: st.id, retry: true, cz: st.cz }); // 最後にもう一度（同じ形式で）
      }
    }
  }

  /* 今日の復習問題：区切りの画面（いきなり形式が変わって連打でまちがえないように） */
  function introScreen() {
    const n = session.steps.filter((s) => s.phase === 2 && s.k === "check").length;
    show(`<div class="card intro">
        <div class="intro-ico">${ICON.menuToday}</div>
        <h2>ここからは 今日の復習問題です</h2>
        <p><b>${n}問</b>あります。日本語の意味に合う英語を、4つの中から選ぼう。</p>
        <p class="small muted">わからないときは「わからない」を押そう。答えを選んだら、正しい答えをよく見てから「次へ」を押そう。</p>
      </div>`);
    setBottom([{ label: "復習問題をはじめる", sfx: "tap", delay: 1000, onClick: next }]);
  }

  /* 今日の復習問題：日本語→英語の4択穴うめ */
  function czScreen(st) {
    const it = ITEMS[st.id], cz = it.cz;
    const join = (segs) => segs.join(" … ");
    // 誤答3つ：学習ずみの単語を優先して、ランダムに選ぶ
    const pool = shuffle(cz.c.slice()), learned = pool.filter((c) => state.items[c[0]]), other = pool.filter((c) => !state.items[c[0]]);
    const wrongs = learned.concat(other).slice(0, 3).map((c) => join(c[1]));
    const answerText = join(cz.a);
    const choices = shuffle([answerText].concat(wrongs));
    let k = 0;
    const blanked = ab(esc(it.check.en)).replace(/\{([^}]*)\}/g, (m, w) => `<span class="blank" data-k="${k++}">${"&nbsp;".repeat(Math.max(6, w.length + 2))}</span>`);
    show(`<div class="card">
        <span class="tag review">復習問題</span><div class="small muted">日本語の意味に合う英語を選ぼう。</div>
        <div class="cz-ja">${ab(esc(it.check.ja))}</div>
        <div class="q-en" lang="en" id="czQ">${blanked}</div>
        <div class="cz-choices">${choices.map((c, n) => `<button type="button" class="cz-btn" data-n="${n}" lang="en">${esc(c)}</button>`).join("")}</div>
        <div class="cz-dk"><button type="button" class="linkbtn" id="czDk">わからない</button></div>
        <div id="ans"></div>
      </div>`);
    setBottom([]);
    let done = false;
    const choose = (n) => {
      if (done) return; done = true;
      const ok = n !== null && choices[n] === answerText;
      sfx(ok ? "gotit" : "notyet");
      main.querySelectorAll(".cz-btn").forEach((b) => {
        b.disabled = true;
        if (choices[+b.dataset.n] === answerText) b.classList.add("right");
        else if (+b.dataset.n === n) b.classList.add("wrong");
      });
      $("czDk").disabled = true;
      // 空欄に正しい答えを入れて、文を読めるようにする
      main.querySelectorAll("#czQ .blank").forEach((b) => { b.textContent = cz.a[+b.dataset.k]; b.classList.add("filled"); });
      const base = it.word.replace(/[.!?]$/, "");
      $("ans").innerHTML = `<div class="ans">
          <div class="cz-result ${ok ? "ok" : "ng"}">${ok ? "正解！" : n === null ? "答えはこれ" : "ざんねん！ 正しい答えはこれ"}</div>
          <div class="row"><button type="button" class="chip" id="sayQ">${ICON.speak}読む</button></div>
          <div class="small muted">${esc(it.pos)}</div>
          <div class="word" lang="en">${esc(it.word)}</div>
          ${answerText.toLowerCase() !== base.toLowerCase() ? `<div class="small">この文では <b lang="en">${esc(answerText)}</b> の形</div>` : ""}
          <div class="mean">${esc(it.ja)}</div>
          ${it.forms ? `<div class="forms"><b>不規則動詞の活用</b><span lang="en">${esc(it.forms)}</span><div class="small muted">原形 – 過去形 – 過去分詞</div></div>` : ""}
          ${it.other ? `<div class="other"><b>ほかの意味</b>${esc(it.other)}</div>` : ""}
        </div>`;
      $("sayQ").onclick = () => speak(plain(it.check.en));
      $("ans").scrollIntoView({ behavior: "smooth", block: "nearest" });
      mark(st, ok);
      setBottom([{ label: "次へ", sfx: "tap", delay: 600, onClick: next }]);
    };
    main.querySelectorAll(".cz-btn").forEach((b) => (b.onclick = () => choose(+b.dataset.n)));
    $("czDk").onclick = () => choose(null);
  }

  function summary() {
    const ok = Object.values(session.answered).filter((v) => v === "ok").length;
    const all = Object.keys(session.answered).length;
    const wrong = session.wrong.map((id) => ITEMS[id]);
    const genius = all > 0 && ok === all;
    const ids = Object.keys(session.answered), isRev = (id) => session.review.has(id);
    const revAll = ids.filter(isRev).length, revOk = ids.filter((id) => isRev(id) && session.answered[id] === "ok").length;
    const newAll = all - revAll, newOk = ok - revOk;
    // Got it! の状態になっている単語（やり直しで Got it! にした単語もふくむ）
    const okIds = Object.keys(session.answered).filter((id) => state.items[id] && (state.items[id].box > 0 || state.items[id].manual) && (!state.items[id].done || state.items[id].manual));
    sfx(genius ? "genius" : "great");
    show(`<div class="cheer${genius ? " genius" : ""}">${genius ? "天才！？" : "すごい！頑張ったね！"}</div>
      ${genius ? `<div class="small muted" style="text-align:center;margin-bottom:10px">全部正解でクリア！</div>` : ""}
      <div class="card"><div class="stats">
        ${newAll ? `<div class="stat"><div class="k">新しい単語 Got it!</div><div class="v">${newOk}<span class="small">／${newAll}単語</span></div></div>` : ""}
        ${revAll ? `<div class="stat"><div class="k">復習問題 正解</div><div class="v">${revOk}<span class="small">／${revAll}問</span></div></div>` : ""}
        ${session.scenes.length ? `<div class="stat"><div class="k">読んだ場面</div><div class="v">${session.scenes.length}<span class="small">場面</span></div></div>` : ""}
      </div>
      <div class="small muted">${session.todayReview ? "今日の単語の復習問題は、何回でもできます。復習の予定は変わりません（Not yet だった単語に正解すると「済」になります）。" : session.practice ? "「もう一回」の練習は、記録には入りません。" : "「Not yet」の単語は、明日からの確認にまぜて出ます。「Got it!」の単語は、日をあけてまた出ます。"}</div></div>
      ${wrong.length ? `<div class="card"><h2>Not yet の単語（単語ノートに書こう）</h2><ul class="list">${wrong.map((w) =>
        `<li><span class="lw" lang="en">${esc(w.word)}</span>　<span class="small muted">${esc(w.pos)}</span><br>${esc(w.ja)}</li>`).join("")}</ul></div>` : ""}
      ${okIds.length ? `<div class="card"><h2>もう復習に出さない単語</h2>
        <div class="small muted" style="margin-bottom:6px">ぜったいに忘れない単語だけ、チェックしよう。チェックした単語は、もう復習に出ません（単語の説明から、復習にもどせます）。</div>
        ${okIds.map((id) => `<label class="skip-row"><input type="checkbox" data-id="${id}"${state.items[id].manual ? " checked" : ""}><span lang="en" class="tw-en">${esc(ITEMS[id].word)}</span><span class="tw-ja">${esc(ITEMS[id].ja)}</span></label>`).join("")}</div>` : ""}`);
    main.querySelectorAll(".skip-row input").forEach((c) => (c.onchange = () => setSkip(c.dataset.id, c.checked)));
    setTop("まとめ", null, () => { sfx("tap"); menu(); }); $("menuBtn").textContent = "メニューへ"; $("menuBtn").classList.add("primary");
    const again = session.scenes.map((id) => DATA.scenes.find((s) => s.id === id)).filter(Boolean);
    setBottom([{ label: "もう一回", cls: "sub", sfx: "tap", delay: 1000, onClick: () => (session.todayReview ? startTodayReview() : startSession(again, true)) }, { spacer: true }]);
  }

  /* ---------- そのほかの画面 ---------- */
  /* 場面を選ぶ：カテゴリー → 場面 */
  function categoryList() {
    progress.hidden = true;
    setTop("場面を選ぶ", menu, null);
    show(`<div class="small muted" style="margin-bottom:8px">カテゴリーを選ぶと、その中の場面が出ます。</div>` +
      DATA.categories.map((c) => {
        const list = DATA.scenes.filter((s) => s.cat === c.id);
        const done = list.filter(sceneDone).length;
        return `<button type="button" class="scene-btn" data-c="${c.id}" ${list.length ? "" : "disabled"}>
          <span>${CAT_ICON[c.id] || ""}${esc(c.name)}</span><span class="small muted">${done}／${list.length}場面</span></button>`;
      }).join(""));
    main.querySelectorAll(".scene-btn:not([disabled])").forEach((b) => (b.onclick = () => { sfx("tap"); sceneList(b.dataset.c); }));
    setBottom([]);
  }
  function sceneList(catId) {
    const c = DATA.categories.find((x) => x.id === catId);
    progress.hidden = true;
    setTop(c.name, categoryList, null, CAT_ICON[c.id]);
    const wordHTML = (it) => {
      const r = state.items[it.id];
      const cls = !r ? "wd" : r.box === 0 ? "wd weak" : "wd done";
      return `<span class="${cls}" lang="en">${esc(it.word)}</span>`;
    };
    show(`<div class="small muted" style="margin-bottom:8px">場面を選ぶと、その場面を読んで、意味の確認をします。<br>
      <span class="wd done">緑の字</span>＝Got it!　<span class="wd weak">赤の字</span>＝Not yet　<span class="wd">灰色</span>＝まだ学んでいない</div>` +
      DATA.scenes.filter((s) => s.cat === catId).map((s) => {
        const done = sceneDone(s);
        return `<button type="button" class="scene-btn scene-item" data-s="${s.id}">
          <span class="sc-top"><span><span class="sc-no">${s.code}</span>${typeIcon(s.type)}${esc(s.title)}</span><span class="small ${done ? "done-mark" : "muted"}">${done ? "済" : "まだ"}</span></span>
          <span class="sc-words">${s.items.map(wordHTML).join('<span class="sep"> / </span>')}</span></button>`;
      }).join(""));
    main.querySelectorAll(".scene-btn").forEach((b) => (b.onclick = () => { sfx("tap"); const s = DATA.scenes.find((x) => x.id === b.dataset.s);
      if (hasNew(s) && setsDone()) { modal("1日に学習できる新しい場面は3セットまでです。<br><span class='small muted'>まだ学習していない場面は、明日えらんでね。学習ずみの場面は、今日も練習できます。</span>", [{ label: "OK" }]); return; }
      startSession([s]); }));
    setBottom([]);
  }

  /* 単語をさがす（英語で）：結果をタップすると、その場面を開いて単語の所へ移動する */
  let lastQuery = "";
  const norm = (s) => s.toLowerCase().replace(/[～…]/g, " ").replace(/\s+/g, " ").trim();
  function search() {
    progress.hidden = true;
    setTop("単語をさがす", menu, null);
    show(`<div class="card">
        <input type="search" id="q" class="search" placeholder="英語で入力（例：borrow）" autocomplete="off" autocapitalize="off" spellcheck="false" lang="en" value="${esc(lastQuery)}">
        <div class="small muted">はじめの数文字だけでも見つかります。過去形などでもさがせます（例：went → go）。</div>
      </div><div id="res"></div>`);
    const q = $("q");
    const draw = () => {
      lastQuery = q.value; const k = norm(q.value);
      if (!k) { $("res").innerHTML = ""; return; }
      const hits = [];
      // 過去形・過去分詞で入力したときは原形でもさがす（went → go、broke into → break into）
      const IRR = DATA.irregular || {};
      const ks = k.split(" "), alt = IRR[ks[0]] ? [IRR[ks[0]]].concat(ks.slice(1)).join(" ") : null;
      Object.values(ITEMS).forEach((it) => {
        const w = norm(it.word), f = norm(it.forms || "");
        const words = w.split(" ");
        const rank = w.startsWith(k) ? 0 : words.some((x) => x.startsWith(k)) ? 1 : f.split(/[\s–/]+/).some((x) => x && x.startsWith(k)) ? 2 :
          alt && words.some((x, i) => { const r = words.slice(i).join(" "); return r === alt || r.startsWith(alt + " "); }) ? 2 : w.includes(k) ? 3 : -1;
        if (rank >= 0) hits.push({ it, rank });
      });
      hits.sort((a, b) => a.rank - b.rank || a.it.word.localeCompare(b.it.word));
      $("res").innerHTML = hits.length ? `<div class="small muted" style="margin:4px 0 8px">${hits.length}件${hits.length > 50 ? "（はじめの50件）" : ""}</div>` + hits.slice(0, 50).map(({ it }) => {
        const s = DATA.scenes.find((x) => x.id === ITEM_SCENE[it.id]), r = state.items[it.id];
        const st = !r ? '<span class="small muted">まだ</span>' : r.box === 0 ? '<span class="wd weak small">Not yet</span>' : '<span class="small done-mark">済</span>';
        return `<button type="button" class="scene-btn scene-item hit-btn" data-id="${it.id}">
            <span class="sc-top"><span lang="en">${esc(it.word)}</span>${st}</span>
            <span class="small">${esc(it.ja)}</span>
            <span class="small muted"><span class="sc-no">${s.code}</span>${esc(s.title)}</span></button>`;
      }).join("") : '<div class="small muted">見つかりませんでした。つづりを確かめてみてね。</div>';
      main.querySelectorAll(".hit-btn").forEach((b) => (b.onclick = () => { sfx("tap"); openFromSearch(b.dataset.id); }));
    };
    q.oninput = draw; draw();
    setTimeout(() => q.focus(), 50);
    setBottom([]);
  }
  /* 今日の単語：今日答えた単語を、新しく学んだ単語・復習した単語に分け、場面ごとに並べる */
  function todayIds() { const t = today(); return Object.keys(state.items).filter((id) => ITEMS[id] && state.items[id].last === t); }
  function todayList() {
    progress.hidden = true; closeSheet();
    setTop("今日の単語", menu, null);
    const t = today(), ids = todayIds();
    const isNew = (r) => (r.first ? r.first === t : r.ok + r.ng <= 1);
    const group = (list) => DATA.scenes.map((s) => ({ s, its: s.items.filter((i) => list.includes(i.id)) })).filter((g) => g.its.length);
    const block = (title, list) => !list.length ? "" : `<h2 class="today-h">${title}<span class="small muted">（${list.length}単語）</span></h2>` +
      group(list).map(({ s, its }) => `<div class="card today-sc">
        <div class="sc-top"><span><span class="sc-no">${s.code}</span>${typeIcon(s.type)}${esc(s.title)}</span>
          <button type="button" class="chip" data-scene="${s.id}">場面を見る</button></div>
        ${its.map((i) => { const r = state.items[i.id], ng = r.box === 0 && !r.done; return `<div class="today-row">
          ${ng ? '<span class="cb-space"></span>' : `<input type="checkbox" class="today-skip" data-id="${i.id}" aria-label="${esc(i.word)} を復習に出さない"${r.done ? " checked" : ""}>`}
          <button type="button" class="today-w" data-id="${i.id}">
          <span lang="en" class="tw-en">${esc(i.word)}</span><span class="tw-ja">${esc(i.ja)}</span>
          ${ng ? '<span class="wd weak small">Not yet</span>' : '<span class="small done-mark">済</span>'}</button></div>`; }).join("")}
      </div>`).join("");
    show((ids.length ? `<div class="small muted" style="margin:4px 2px">左のチェック：チェックした単語は、もう復習に出ません。外すと、また復習に出ます。「Not yet」の単語には、チェックは出ません。</div>` : "") + block("新しく学んだ単語", ids.filter((id) => isNew(state.items[id]))) + block("復習した単語", ids.filter((id) => !isNew(state.items[id]))) +
      (ids.length ? "" : '<div class="card small muted">今日はまだ学習していません。</div>'));
    main.querySelectorAll(".today-w").forEach((b) => (b.onclick = () => { sfx("tap"); openSheet(b.dataset.id); }));
    main.querySelectorAll(".today-skip").forEach((c) => (c.onchange = () => setSkip(c.dataset.id, c.checked))); // チェックした瞬間に保存
    main.querySelectorAll("[data-scene]").forEach((b) => (b.onclick = () => {
      sfx("tap");
      const s = DATA.scenes.find((x) => x.id === b.dataset.scene);
      setTop(s.title, todayList, null, typeIcon(s.type));
      sceneScreen(s, todayList, true, "今日の単語にもどる");
    }));
    setBottom(todayReviewIds().length ? [{ label: "今日の単語の復習問題", sfx: "tap", onClick: startTodayReview }] : []);
  }
  function openFromSearch(id) {
    const s = DATA.scenes.find((x) => x.id === ITEM_SCENE[id]);
    progress.hidden = true;
    setTop(s.title, () => search(), null, typeIcon(s.type));
    sceneScreen(s, () => search(), true, "さがす画面にもどる");
    const w = main.querySelector(`#lines .w[data-id="${id}"]`);
    if (w) { w.classList.add("hit"); setTimeout(() => w.scrollIntoView({ behavior: "smooth", block: "center" }), 100); }
  }

  function help() {
    setTop("はじめての人へ", menu, null);
    show(`<div class="card"><h2>1. 場面を読む</h2>会話・メール・お知らせなどの短い英文を読みます。<b>色のついた単語</b>をタップすると意味が出ます。スピーカーのボタンで読み上げ、「訳を見る」で日本語訳が出ます。「穴うめ」を押すと、覚える単語が空欄になって日本語訳が出るので、入る英語を考えてから空欄をタップして答えを確かめよう。💡には、日本語では同じ意味になる単語の使い分けなどを書いています。</div>
      <div class="card"><h2>2. 意味を確かめる</h2>場面とはちがう短い文で、さっきの単語が出ます。意味を考えてから「意味を見る」を押し、<b>自分で「Got it!」（わかった）か「Not yet」（まだ）</b>を選びます。正直に選ぶほど、よく覚えられます。「Not yet」の単語は、その回の最後にもう一度出ます。</div>
      <div class="card"><h2>3. 今日の復習問題</h2>前に学んだ単語は、復習問題で出ます。日本語の意味を見て、英文の空いているところに入る英語を4つの中から選びます。正解なら Got it!、まちがえたときや「わからない」を押したときは Not yet と同じあつかいです。</div>
      <div class="card"><h2>4. 毎日つづける</h2>「Not yet」の単語は翌日に、「Got it!」の単語は 1日→3日→7日→30日 と間をあけて、また出ます。30日後にも「Got it!」なら、もう復習には出ません。1日に学習できる新しい場面は3セット（新しい単語は30まで）です。たくさんやるより、毎日少しずつのほうが覚えられます。1回は約15分です。</div>
      <div class="card"><h2>ホーム画面に入れる</h2><b>Android（Chrome）</b>：右上の「⋮」→「アプリをインストール」（または「ホーム画面に追加」）。<br><b>iPhone（Safari）</b>：共有ボタン（□↑）→「ホーム画面に追加」。<br>入れたあとは、電波がなくても使えます。</div>
      <div class="card"><h2>記録について</h2>記録はこの端末の中だけに保存されます。ブラウザのデータを消すと記録も消えるので、ときどき「バックアップ」をしておきましょう。</div>`);
    setBottom([{ label: "メニューへ", onClick: menu }]);
  }
  function settingsScreen() {
    progress.hidden = true;
    setTop("設定", menu, null);
    const draw = () => {
      show(`<div class="card"><h2>効果音</h2>
        <div class="small muted">ボタンを押したときや、練習が終わったときの音です。</div>
        <div class="row">
          <button type="button" class="chip" id="sOn" aria-pressed="${settings.sound}">ON</button>
          <button type="button" class="chip" id="sOff" aria-pressed="${!settings.sound}">OFF</button>
        </div>
        <div class="small muted">効果音は小さめの音で鳴ります。iPhone・iPad は、消音（マナー）モードのときは鳴りません。Android は、アプリから消音モードかどうかがわからないため、マナーモードでも鳴ることがあります。鳴らしたくないときは OFF にしてください。</div></div>`);
      $("sOn").onclick = () => { settings.sound = true; saveSettings(); sfx("tap"); draw(); };
      $("sOff").onclick = () => { settings.sound = false; saveSettings(); draw(); };
    };
    draw();
    setBottom([{ label: "メニューへ", sfx: "tap", onClick: menu }]);
  }
  function about() {
    setTop("アプリについて", menu, null);
    show(`<div class="card"><h2>${APP}</h2>
      <p>英検準2級〜2級の範囲を目安にしています。日本英語検定協会とは関係ありません。</p>
      <p>覚える単語は、英検準2級向けの単語・熟語・会話表現から選んでいます。使い分けを知るために、少しだけほかの単語も加えています。</p>
      <p>英文と和訳はすべてこのアプリのために作ったものです。読み上げは端末の機能を使います。</p>
      <p class="small muted">アプリVer：<span id="appVer">確認中…</span><br>データVer：${esc(DATA.version)}（準2級 場面1〜${DATA.scenes.length}）</p></div>`);
    setBottom([{ label: "メニューへ", onClick: menu }]);
    // 今動いている版を、電波なしで使うしくみ（sw.js）にたずねる
    const put = (v) => { const el = $("appVer"); if (el) el.textContent = v; };
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!sw) { put("わかりません（ブラウザで開いているか、はじめて開いたところです）"); return; }
    const ch = new MessageChannel(); ch.port1.onmessage = (e) => put(e.data);
    sw.postMessage("version", [ch.port2]);
    setTimeout(() => { const el = $("appVer"); if (el && el.textContent === "確認中…") put("2026-11-20j より前の版"); }, 1500);
  }
  function backup() {
    setTop("バックアップ", menu, null);
    const txt = JSON.stringify(state);
    const fname = "bamen-kiroku-" + today() + ".json";
    const canShare = (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File(["{}"], "a.json", { type: "application/json" })] })); } catch (e) { return false; } })();
    show(`<div class="card"><h2>記録の守り</h2><div class="small" id="persistMsg">確かめています…</div></div>
      <div class="card"><h2>ファイルに保存する</h2>
        <div class="small muted">記録をファイルにして保存します。スマホを買いかえるときや、ブラウザのデータを消す前に使います。月に1回くらい保存しておくと安心です。</div>
        <div class="row"><button type="button" class="chip" id="dlBtn">ファイルに保存</button>
        ${canShare ? `<button type="button" class="chip" id="shareBtn">Googleドライブなどに保存</button>` : ""}</div>
        <div class="small muted">前回の保存：<span id="lastBk">${settings.lastBackup ? esc(settings.lastBackup) : "まだ"}</span></div></div>
      <div class="card"><h2>ファイルから読み込む</h2>
        <div class="small muted">保存したファイルを選ぶと、今の記録と入れかわります。</div>
        <div class="row"><label class="chip filebtn">ファイルを選ぶ<input type="file" id="fileIn" accept=".json,application/json" hidden></label></div></div>
      <div class="card"><h2>文字で保存・読み込み</h2>
        <div class="small muted">ファイルが使えないときは、下の文字をコピーして、メモなどに貼り付けて保存します。</div>
        <textarea id="outTxt" readonly>${esc(txt)}</textarea>
        <div class="row"><button type="button" class="chip" id="copyBtn">コピーする</button></div>
        <div class="small muted">保存しておいた文字を貼り付けて「読み込む」を押すと、今の記録と入れかわります。</div>
        <textarea id="inTxt" placeholder="ここに貼り付け"></textarea>
        <div class="row"><button type="button" class="chip" id="loadBtn">読み込む</button></div></div>`);
    persistStatus().then((m) => { const el = $("persistMsg"); if (el) el.innerHTML = m; });
    const saved = () => { settings.lastBackup = today(); saveSettings(); const el = $("lastBk"); if (el) el.textContent = settings.lastBackup; };
    $("dlBtn").onclick = () => {
      const url = URL.createObjectURL(new Blob([txt], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      saved(); toast("保存しました（「ダウンロード」に入ります）");
    };
    if (canShare) $("shareBtn").onclick = async () => {
      try { await navigator.share({ files: [new File([txt], fname, { type: "application/json" })], title: "場面で覚える英単語の記録" }); saved(); toast("保存しました"); }
      catch (e) { if (e && e.name !== "AbortError") toast("保存できませんでした"); }
    };
    $("copyBtn").onclick = async () => {
      try { await navigator.clipboard.writeText(txt); saved(); toast("コピーしました"); }
      catch (e) { const t = $("outTxt"); t.focus(); t.select(); toast("選んだ文字を長押ししてコピーしてください"); }
    };
    const load = (text) => {
      let s; try { s = JSON.parse(text); } catch (e) { toast("このアプリの記録ではありません"); return; }
      if (!s || typeof s.items !== "object") { toast("このアプリの記録ではありません"); return; }
      modal("今の記録を、読み込んだ記録と入れかえますか？", [
        { label: "入れかえる", onClick: () => { state = migrate(clean(s)); saveState(); toast("読み込みました"); menu(); } },
        { label: "やめる", cls: "sub" }]);
    };
    $("fileIn").onchange = (ev) => { const f = ev.target.files[0]; if (!f) return; f.text().then(load); ev.target.value = ""; };
    $("loadBtn").onclick = () => load($("inTxt").value);
    setBottom([{ label: "メニューへ", sfx: "tap", onClick: menu }]);
  }


  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ---------- 記録を自動で消さないよう、ブラウザにたのむ ---------- */
  async function askPersist() {
    try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch (e) {}
  }
  async function persistStatus() {
    try {
      if (navigator.storage && navigator.storage.persisted) {
        if (await navigator.storage.persisted()) return "✓ この端末では、記録を<b>自動で消さない</b>設定になっています。ただし、ブラウザのデータを自分で消したときや、スマホを買いかえたときは消えるので、ファイルにも保存しておきましょう。";
        await askPersist();
        if (await navigator.storage.persisted()) return "✓ この端末では、記録を<b>自動で消さない</b>設定になりました。";
        return "この端末では、記録を自動で消さない設定にできませんでした。ホーム画面にアプリを入れると、できることがあります。ファイルにも保存しておきましょう。";
      }
    } catch (e) {}
    return "この端末では、記録を守る設定は使えません。ファイルに保存しておきましょう。";
  }

  /* ---------- 起動 ---------- */
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeSheet(); } });
  fetch("data/scenes.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => {
    DATA = d;
    // 場面の番号：カテゴリーの順にアルファベット（A〜）＋カテゴリー内の連番（001〜）
    d.categories.forEach((c, ci) => {
      const L = String.fromCharCode(65 + ci);
      const list = d.scenes.filter((s) => s.cat === c.id);
      list.forEach((s, i) => { s.code = L + String(i + 1).padStart(3, "0"); s.mix = (i + 0.5) / list.length; });
    });
    // 「はじめる」で選ぶ順番：どのカテゴリーも同じ割合で進むように、カテゴリー内の順番を保ったまま、まぜて並べる
    ORDER = d.scenes.slice().sort((a, b) => a.mix - b.mix || d.categories.findIndex((c) => c.id === a.cat) - d.categories.findIndex((c) => c.id === b.cat));
    askPersist();
    d.scenes.forEach((s) => s.items.forEach((it) => { ITEMS[it.id] = it; ITEM_SCENE[it.id] = s.id; }));
    menu();
  }).catch(() => {
    setTop(APP, null, null);
    show(`<div class="card">データを読み込めませんでした。電波のあるところで、もう一度開いてください。</div>`);
  });

  /* 電波なしで使うしくみと、新しい版の知らせ */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        const tell = (w) => { $("update").hidden = false; $("updateBtn").onclick = () => w.postMessage("skip"); };
        if (reg.waiting && navigator.serviceWorker.controller) tell(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) tell(w); });
        });
      }).catch(() => {});
      let reloaded = false;
      const hadController = !!navigator.serviceWorker.controller; // はじめて開いたときは開き直さない
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    });
  }
})();
