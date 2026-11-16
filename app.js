/* 場面で覚える英単語 */
"use strict";
(function () {
  const APP = "場面で覚える英単語";
  const LS_KEY = "bamen.v1";
  const MAX_NEW = 10;    // 1回に新しく覚える語は10まで
  const MAX_REVIEW = 10; // 1回にまぜる復習の語は10まで
  const INTERVALS = [1, 3, 7, 14, 30]; // ○が続いたときの次の復習までの日数
  const $ = (id) => document.getElementById(id);
  const main = $("main"), bottom = $("bottom"), where = $("where"), progress = $("progress");
  let DATA = null, ITEMS = {}, ITEM_SCENE = {};
  let state = loadState();
  let session = null;

  /* ---------- 記録 ---------- */
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (s && typeof s === "object" && s.items) return s;
    } catch (e) {}
    return { v: 1, items: {} };
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
    const r = state.items[id] || { box: 0, ok: 0, ng: 0 };
    if (ok) { r.box = Math.min(r.box + 1, INTERVALS.length); r.due = addDays(INTERVALS[r.box - 1]); r.ok++; }
    else { r.box = 0; r.due = addDays(1); r.ng++; }
    r.last = today();
    state.items[id] = r;
    saveState();
  }
  function dueItems() {
    const t = today();
    return Object.keys(state.items).filter((id) => ITEMS[id] && state.items[id].due <= t)
      .sort((a, b) => state.items[a].due < state.items[b].due ? -1 : 1);
  }
  function sceneDone(s) { return s.items.every((it) => state.items[it.id]); }
  function nextScenes() { // 新しい語が MAX_NEW をこえない数だけ、順に場面を選ぶ
    const out = []; let n = 0;
    for (const s of DATA.scenes) {
      if (sceneDone(s)) continue;
      const k = s.items.filter((i) => !state.items[i.id]).length;
      if (out.length && n + k > MAX_NEW) break;
      out.push(s); n += k;
      if (n >= MAX_NEW) break;
    }
    return out;
  }

  /* ---------- 表示の部品 ---------- */
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function sceneHTML(en) { // {文字|id} → タップできる語
    return esc(en).replace(/\{([^{}|]+)\|([^{}]+)\}([.,!?;:]*)/g, (m, t, id, p) => `<span class="nw"><button type="button" class="w" data-id="${id}" lang="en">${t}</button>${p}</span>`);
  }
  function checkHTML(en) { return esc(en).replace(/\{([^{}|]+)\}([.,!?;:]*)/g, '<span class="nw"><b>$1</b>$2</span>'); }
  function plain(en) { return en.replace(/\{([^{}|]+)(\|[^{}]+)?\}/g, "$1"); }
  function setTop(text, back, menu, icon) {
    where.innerHTML = (icon || "") + esc(text);
    $("backBtn").hidden = !back; $("backBtn").onclick = back || null;
    $("menuBtn").hidden = !menu; $("menuBtn").onclick = menu || null;
  }
  function setBottom(buttons) {
    bottom.innerHTML = "";
    buttons.forEach((b) => {
      const el = document.createElement("button");
      el.type = "button"; el.className = "big " + (b.cls || ""); el.textContent = b.label;
      el.onclick = () => { if (b.sfx) sfx(b.sfx); b.onClick(); };
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
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY) || "{}")); } catch (e) {}
  function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) {} }
  const SFX = {};
  ["tap", "gotit", "notyet", "great", "genius"].forEach((n) => { const a = new Audio("sound/" + n + ".mp3"); a.preload = "auto"; SFX[n] = a; });
  function sfx(name) {
    if (!settings.sound || !SFX[name]) return;
    try { const a = SFX[name].cloneNode(); a.play().catch(() => {}); } catch (e) {}
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

  /* ---------- 語の説明（下から出るシート） ---------- */
  function openSheet(id) {
    const it = ITEMS[id]; if (!it) return;
    const sh = $("sheet");
    sh.innerHTML = `<div class="small muted">${esc(it.pos)}${it.src === "おまけ" ? '　<span class="tag">おまけ</span>' : ""}</div>
      <div class="word" id="sheetWord" lang="en">${esc(it.word)}</div>
      <div class="mean">${esc(it.ja)}</div>
      <div class="row"><button type="button" class="chip" id="sheetSay">${ICON.speak}読む</button>
      <button type="button" class="chip" id="sheetClose">とじる</button></div>`;
    sh.hidden = false;
    $("sheetSay").onclick = () => speak(it.word.replace(/～/g, "").replace(/\.\.\.,/g, ""));
    $("sheetClose").onclick = closeSheet;
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
    const strong = Object.keys(state.items).filter((id) => ITEMS[id] && state.items[id].box >= 3).length;
    const canStart = due > 0 || rest > 0;
    show(`<div class="card">
        <span class="tag">準2級</span><span class="tag">試作版</span>
        <div class="stats">
          <div class="stat"><div class="k">今日の復習</div><div class="v">${due}<span class="small">語</span></div></div>
          <div class="stat"><div class="k">残りの場面</div><div class="v">${rest}<span class="small">／${DATA.scenes.length}</span></div></div>
          <div class="stat"><div class="k">学んだ語</div><div class="v">${learned}<span class="small">／${Object.keys(ITEMS).length}</span></div></div>
          <div class="stat"><div class="k">よく覚えている語</div><div class="v">${strong}<span class="small">語</span></div></div>
        </div>
        <div class="small muted">${canStart ? `「はじめる」で、${rest ? `新しい場面を読む（${nextScenes().length}つ）→ ` : ""}意味の確認${due && rest ? "（復習の語もまぜて出ます）" : ""} → Not yet の語をもう一度 の順に進みます。` : "今日の学習はおわりです。また明日！"}</div>
      </div>
      <div class="menu-list">
        <button type="button" id="mScenes">📖 場面を選ぶ</button>
        <button type="button" id="mHelp">🔰 はじめての人へ・使い方</button>
        <button type="button" id="mBackup">💾 記録のバックアップ</button>
        <button type="button" id="mSettings">⚙️ 設定（効果音）</button>
        <button type="button" id="mAbout">ℹ️ このアプリについて</button>
      </div>`);
    const go = (f) => () => { sfx("tap"); f(); };
    $("mScenes").onclick = go(categoryList); $("mHelp").onclick = go(help); $("mBackup").onclick = go(backup); $("mSettings").onclick = go(settingsScreen); $("mAbout").onclick = go(about);
    setBottom(canStart ? [{ label: "はじめる", sfx: "tap", onClick: () => startSession() }] : []);
  }

  /* ---------- 学習の回 ---------- */
  function startSession(chosen) { // chosen：メニューで選んだ場面（なければ順番に）
    const scenes = chosen || nextScenes();
    const newIds = chosen ? scenes.flatMap((s) => s.items.map((i) => i.id)) : scenes.flatMap((s) => s.items.map((i) => i.id)).filter((id) => !state.items[id]);
    const review = chosen ? [] : dueItems().filter((id) => !newIds.includes(id)).slice(0, MAX_REVIEW);
    const steps = [];
    scenes.forEach((s) => steps.push({ k: "scene", phase: 0, s }));
    shuffle(newIds.concat(review)).forEach((id) => steps.push({ k: "check", phase: 1, id })); // 新しい語と復習の語をまぜる
    steps.push({ k: "summary", phase: 3 });
    session = { steps, i: 0, wrong: [], answered: {}, retried: {}, scenes: scenes.map((s) => s.id) };
    step();
  }
  function quit() {
    modal("やめますか？<br><span class='small muted'>答えた語の記録は残ります。読んだだけで確認していない場面は、次にもう一度出ます。</span>", [
      { label: "やめる", cls: "sub", onClick: menu }, { label: "つづける" }]);
  }
  function showProgress() {
    const st = session.steps[session.i];
    const names = ["読む", "確認", "もう一度", "まとめ"];
    const has = [0, 1, 2, 3].filter((p) => session.steps.some((s) => s.phase === p));
    const same = session.steps.filter((s) => s.phase === st.phase && s.k !== "summary");
    const n = same.indexOf(st) + 1;
    progress.innerHTML = `<div class="steps">${has.map((p) => `<span class="${p === st.phase ? "now" : p < st.phase ? "done" : ""}">${names[p]}</span>`).join("")}</div>` +
      (same.length ? `<div class="count">${n}／${same.length}${st.retry ? "（もう一度）" : ""}</div>` : "");
    progress.hidden = false;
  }
  function next() { session.i++; step(); }
  function step() {
    closeSheet();
    const st = session.steps[session.i];
    showProgress();
    setTop(st.k === "scene" ? st.s.title : st.k === "summary" ? "まとめ" : "意味の確認", null, quit, st.k === "scene" ? typeIcon(st.s.type) : "");
    if (st.k === "scene") sceneScreen(st.s, () => next());
    else if (st.k === "check") checkScreen(st);
    else summary();
  }

  /* 場面を読む画面 */
  function sceneScreen(s, onNext, isReview) {
    const conv = s.type === "会話";
    show(`<div class="card">
        <span class="tag">${typeIcon(s.type)}${esc(s.type)}</span><span class="small muted">場面${Number(s.id.slice(1))}</span>
        <div class="row">
          <button type="button" class="chip" id="sayAll">${ICON.speak}全部を読む</button>
          <button type="button" class="chip" id="jaBtn" aria-pressed="false">訳を見る</button>
        </div>
        <div>${s.lines.map((l, i) => `<div class="line">
            ${conv ? `<div class="sp ${esc(l.sp)}" aria-label="${esc(l.sp)}さん">${esc(l.sp)}</div>` : ""}
            <div class="body"><div class="en" lang="en">${sceneHTML(l.en)}</div><div class="ja" hidden>${esc(l.ja)}</div></div>
            <button type="button" class="say" data-line="${i}" aria-label="この文を読む">${ICON.speak}</button></div>`).join("")}</div>
      </div>
      <div class="small muted">色のついた語をタップすると、意味が出ます。</div>
      <div class="note"><b>💡 ポイント</b>${esc(s.note)}</div>
      <div class="gram"><b>📘 文法：${esc(s.grammar.name)}</b>${esc(s.grammar.text)}</div>`);
    $("sayAll").onclick = () => speak(s.lines.map((l) => plain(l.en)).join(" "));
    main.querySelectorAll(".say").forEach((b) => (b.onclick = () => speak(plain(s.lines[b.dataset.line].en))));
    $("jaBtn").onclick = function () {
      const on = this.getAttribute("aria-pressed") !== "true";
      this.setAttribute("aria-pressed", on); this.textContent = on ? "訳をかくす" : "訳を見る";
      main.querySelectorAll(".ja").forEach((j) => (j.hidden = !on));
    };
    setBottom([{ label: isReview ? "一覧にもどる" : "次へ", sfx: "tap", onClick: onNext }]);
  }

  /* 意味の確認の画面 */
  function checkScreen(st) {
    const it = ITEMS[st.id];
    show(`<div class="card">
        <div class="small muted">太字の語は、どんな意味？ 考えてから「意味を見る」を押そう。</div>
        <div class="q-en" lang="en">${checkHTML(it.check.en)}</div>
        <div class="row"><button type="button" class="chip" id="sayQ">${ICON.speak}読む</button></div>
        <div id="ans"></div>
      </div>`);
    $("sayQ").onclick = () => speak(plain(it.check.en));
    setBottom([{ label: "意味を見る", sfx: "tap", onClick: reveal }]);
    function reveal() {
      $("ans").innerHTML = `<div class="ans">
          <div class="small muted">${esc(it.pos)}${it.src === "おまけ" ? '　<span class="tag">おまけ</span>' : ""}</div>
          <div class="word" lang="en">${esc(it.word)}</div>
          <div class="mean">${esc(it.ja)}</div>
          <div class="ja">${esc(it.check.ja)}</div>
          <div class="small muted" style="margin-top:6px">わかったら「Got it!」、まだなら「Not yet」を選ぼう。</div></div>`;
      $("ans").scrollIntoView({ behavior: "smooth", block: "nearest" });
      setBottom([{ label: "Not yet", cls: "ng", sfx: "notyet", onClick: () => answer(false) },
                 { label: "Got it!", cls: "ok", sfx: "gotit", onClick: () => answer(true) }]);
    }
    function answer(ok) {
      if (!st.retry && !session.answered[st.id]) { record(st.id, ok); session.answered[st.id] = ok ? "ok" : "ng"; }
      if (!ok && !session.retried[st.id]) {
        session.retried[st.id] = true;
        if (!session.wrong.includes(st.id)) session.wrong.push(st.id);
        const sumIdx = session.steps.findIndex((s) => s.k === "summary");
        session.steps.splice(sumIdx, 0, { k: "check", phase: 2, id: st.id, retry: true }); // 最後にもう一度
      }
      next();
    }
  }

  function summary() {
    const ok = Object.values(session.answered).filter((v) => v === "ok").length;
    const all = Object.keys(session.answered).length;
    const wrong = session.wrong.map((id) => ITEMS[id]);
    const genius = all > 0 && ok === all;
    sfx(genius ? "genius" : "great");
    show(`<div class="cheer${genius ? " genius" : ""}">${genius ? "天才！？" : "すごい！頑張ったね！"}</div>
      ${genius ? `<div class="small muted" style="text-align:center;margin-bottom:10px">全部 Got it! でクリア！</div>` : ""}
      <div class="card"><div class="stats">
        <div class="stat"><div class="k">Got it!</div><div class="v">${ok}<span class="small">／${all}語</span></div></div>
        <div class="stat"><div class="k">読んだ場面</div><div class="v">${session.scenes.length}<span class="small">場面</span></div></div>
      </div>
      <div class="small muted">「Not yet」の語は、明日からの確認にまぜて出ます。「Got it!」の語は、日をあけてまた出ます。</div></div>
      ${wrong.length ? `<div class="card"><h2>Not yet の語（単語ノートに書こう）</h2><ul class="list">${wrong.map((w) =>
        `<li><span class="lw" lang="en">${esc(w.word)}</span>　<span class="small muted">${esc(w.pos)}</span><br>${esc(w.ja)}</li>`).join("")}</ul></div>` : ""}`);
    setTop("まとめ", null, null);
    setBottom([{ label: "メニューへ", onClick: menu }]);
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
    show(`<div class="small muted" style="margin-bottom:8px">場面を選ぶと、その場面を読んで、意味の確認をします。</div>` +
      DATA.scenes.filter((s) => s.cat === catId).map((s) => {
        const done = sceneDone(s);
        return `<button type="button" class="scene-btn" data-s="${s.id}">
          <span>${typeIcon(s.type)}${esc(s.title)}</span><span class="small ${done ? "done-mark" : "muted"}">${done ? "済" : "まだ"}</span></button>`;
      }).join(""));
    main.querySelectorAll(".scene-btn").forEach((b) => (b.onclick = () => { sfx("tap"); startSession([DATA.scenes.find((x) => x.id === b.dataset.s)]); }));
    setBottom([]);
  }
  function help() {
    setTop("はじめての人へ", menu, null);
    show(`<div class="card"><h2>1. 場面を読む</h2>会話・メール・お知らせなどの短い英文を読みます。<b>色のついた語</b>をタップすると意味が出ます。スピーカーのボタンで読み上げ、「訳を見る」で日本語訳が出ます。💡には、日本語では同じ意味になる語の使い分けなどを書いています。</div>
      <div class="card"><h2>2. 意味を確かめる</h2>場面とはちがう短い文で、さっきの語が出ます。意味を考えてから「意味を見る」を押し、<b>自分で「Got it!」（わかった）か「Not yet」（まだ）</b>を選びます。正直に選ぶほど、よく覚えられます。「Not yet」の語は、その回の最後にもう一度出ます。</div>
      <div class="card"><h2>3. 毎日つづける</h2>「Not yet」の語は翌日に、「Got it!」の語は 1日→3日→7日→14日→30日 と間をあけて、また出ます。1回は約15分です。</div>
      <div class="card"><h2>ホーム画面に入れる</h2><b>Android（Chrome）</b>：右上の「⋮」→「アプリをインストール」（または「ホーム画面に追加」）。<br><b>iPhone（Safari）</b>：共有ボタン（□↑）→「ホーム画面に追加」。<br>入れたあとは、電波がなくても使えます。</div>
      <div class="card"><h2>記録について</h2>記録はこの端末の中だけに保存されます。ブラウザのデータを消すと記録も消えるので、ときどき「記録のバックアップ」をしておきましょう。</div>`);
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
        <div class="small muted">端末の音量が0のときや、マナーモードのときは、ONでも鳴らないことがあります。</div></div>`);
      $("sOn").onclick = () => { settings.sound = true; saveSettings(); sfx("tap"); draw(); };
      $("sOff").onclick = () => { settings.sound = false; saveSettings(); draw(); };
    };
    draw();
    setBottom([{ label: "メニューへ", sfx: "tap", onClick: menu }]);
  }
  function about() {
    setTop("このアプリについて", menu, null);
    show(`<div class="card"><h2>${APP}</h2>
      <p>英検準2級〜2級の範囲を目安にしています。日本英語検定協会とは関係ありません。</p>
      <p>覚える語は、英検準2級向けの単語・熟語・会話表現から選んでいます。「おまけ」の印がある語は、使い分けを知るために加えた語です。</p>
      <p>英文と和訳はすべてこのアプリのために作ったものです。読み上げは端末の機能を使います。</p>
      <p class="small muted">版：${esc(DATA.version)}（試作版・準2級 場面1〜${DATA.scenes.length}）</p></div>`);
    setBottom([{ label: "メニューへ", onClick: menu }]);
  }
  function backup() {
    setTop("記録のバックアップ", menu, null);
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
        { label: "入れかえる", onClick: () => { state = s; saveState(); toast("読み込みました"); menu(); } },
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
