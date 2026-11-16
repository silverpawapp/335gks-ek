/* 場面で覚える英単語 */
"use strict";
(function () {
  const APP = "場面で覚える英単語";
  const LS_KEY = "bamen.v1";
  const SCENES_PER_SESSION = 4;
  const MAX_REVIEW = 30;
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
  function nextScenes() { return DATA.scenes.filter((s) => !sceneDone(s)).slice(0, SCENES_PER_SESSION); }

  /* ---------- 表示の部品 ---------- */
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function sceneHTML(en) { // {文字|id} → タップできる語
    return esc(en).replace(/\{([^{}|]+)\|([^{}]+)\}([.,!?;:]*)/g, (m, t, id, p) => `<span class="nw"><button type="button" class="w" data-id="${id}" lang="en">${t}</button>${p}</span>`);
  }
  function checkHTML(en) { return esc(en).replace(/\{([^{}|]+)\}([.,!?;:]*)/g, '<span class="nw"><b>$1</b>$2</span>'); }
  function plain(en) { return en.replace(/\{([^{}|]+)(\|[^{}]+)?\}/g, "$1"); }
  function setTop(text, back, menu) {
    where.textContent = text;
    $("backBtn").hidden = !back; $("backBtn").onclick = back || null;
    $("menuBtn").hidden = !menu; $("menuBtn").onclick = menu || null;
  }
  function setBottom(buttons) {
    bottom.innerHTML = "";
    buttons.forEach((b) => {
      const el = document.createElement("button");
      el.type = "button"; el.className = "big " + (b.cls || ""); el.textContent = b.label; el.onclick = b.onClick;
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
      <div class="row"><button type="button" class="chip" id="sheetSay">🔊 読む</button>
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
        <div class="small muted">${canStart ? `「はじめる」で、復習 → 新しい場面（${Math.min(rest, SCENES_PER_SESSION)}つ）→ 確認 の順に進みます（約15分）。` : "今日の学習はおわりです。また明日！"}</div>
      </div>
      <div class="menu-list">
        <button type="button" id="mScenes">📖 読んだ場面をもう一度見る</button>
        <button type="button" id="mHelp">🔰 はじめての人へ・使い方</button>
        <button type="button" id="mBackup">💾 記録のバックアップ</button>
        <button type="button" id="mAbout">ℹ️ このアプリについて</button>
      </div>`);
    $("mScenes").onclick = sceneList; $("mHelp").onclick = help; $("mBackup").onclick = backup; $("mAbout").onclick = about;
    setBottom(canStart ? [{ label: "はじめる", onClick: startSession }] : []);
  }

  /* ---------- 学習の回 ---------- */
  function startSession() {
    const review = shuffle(dueItems().slice(0, MAX_REVIEW));
    const scenes = nextScenes();
    const steps = [];
    review.forEach((id) => steps.push({ k: "check", phase: 0, id }));
    scenes.forEach((s) => steps.push({ k: "scene", phase: 1, s }));
    shuffle(scenes.flatMap((s) => s.items.map((i) => i.id)).filter((id) => !state.items[id]))
      .forEach((id) => steps.push({ k: "check", phase: 2, id }));
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
    const names = ["復習", "読む", "確認", "まとめ"];
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
    setTop(st.k === "scene" ? st.s.title : st.k === "summary" ? "まとめ" : "意味の確認", null, quit);
    if (st.k === "scene") sceneScreen(st.s, () => next());
    else if (st.k === "check") checkScreen(st);
    else summary();
  }

  /* 場面を読む画面 */
  function sceneScreen(s, onNext, isReview) {
    const conv = s.type === "会話";
    show(`<div class="card">
        <span class="tag">${esc(s.type)}</span><span class="small muted">場面${Number(s.id.slice(1))}</span>
        <div class="row">
          <button type="button" class="chip" id="sayAll">🔊 全部を読む</button>
          <button type="button" class="chip" id="jaBtn" aria-pressed="false">訳を見る</button>
        </div>
        <div>${s.lines.map((l, i) => `<div class="line">
            ${conv ? `<div class="sp ${esc(l.sp)}" aria-label="${esc(l.sp)}さん">${esc(l.sp)}</div>` : ""}
            <div class="body"><div class="en" lang="en">${sceneHTML(l.en)}</div><div class="ja" hidden>${esc(l.ja)}</div></div>
            <button type="button" class="say" data-line="${i}" aria-label="この文を読む">🔊</button></div>`).join("")}</div>
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
    setBottom([{ label: isReview ? "一覧にもどる" : "次へ", onClick: onNext }]);
  }

  /* 意味の確認の画面 */
  function checkScreen(st) {
    const it = ITEMS[st.id];
    show(`<div class="card">
        <div class="small muted">太字の語は、どんな意味？ 考えてから「意味を見る」を押そう。</div>
        <div class="q-en" lang="en">${checkHTML(it.check.en)}</div>
        <div class="row"><button type="button" class="chip" id="sayQ">🔊 読む</button></div>
        <div id="ans"></div>
      </div>`);
    $("sayQ").onclick = () => speak(plain(it.check.en));
    setBottom([{ label: "意味を見る", onClick: reveal }]);
    function reveal() {
      $("ans").innerHTML = `<div class="ans">
          <div class="small muted">${esc(it.pos)}${it.src === "おまけ" ? '　<span class="tag">おまけ</span>' : ""}</div>
          <div class="word" lang="en">${esc(it.word)}</div>
          <div class="mean">${esc(it.ja)}</div>
          <div class="ja">${esc(it.check.ja)}</div>
          <div class="small muted" style="margin-top:6px">わかったかどうか、自分で選ぼう。</div></div>`;
      $("ans").scrollIntoView({ behavior: "smooth", block: "nearest" });
      setBottom([{ label: "× わからない", cls: "ng", onClick: () => answer(false) },
                 { label: "○ わかった", cls: "ok", onClick: () => answer(true) }]);
    }
    function answer(ok) {
      if (!st.retry && !session.answered[st.id]) { record(st.id, ok); session.answered[st.id] = ok ? "ok" : "ng"; }
      if (!ok && !session.retried[st.id]) {
        session.retried[st.id] = true;
        if (!session.wrong.includes(st.id)) session.wrong.push(st.id);
        const sumIdx = session.steps.findIndex((s) => s.k === "summary");
        session.steps.splice(sumIdx, 0, { k: "check", phase: 2, id: st.id, retry: true });
      }
      next();
    }
  }

  function summary() {
    const ok = Object.values(session.answered).filter((v) => v === "ok").length;
    const all = Object.keys(session.answered).length;
    const wrong = session.wrong.map((id) => ITEMS[id]);
    show(`<h2>おつかれさま！</h2>
      <div class="card"><div class="stats">
        <div class="stat"><div class="k">わかった</div><div class="v">${ok}<span class="small">／${all}語</span></div></div>
        <div class="stat"><div class="k">読んだ場面</div><div class="v">${session.scenes.length}<span class="small">場面</span></div></div>
      </div>
      <div class="small muted">わからなかった語は、明日の復習に出ます。わかった語は、日をあけてまた出ます。</div></div>
      ${wrong.length ? `<div class="card"><h2>単語ノートに書こう</h2><ul class="list">${wrong.map((w) =>
        `<li><span class="lw" lang="en">${esc(w.word)}</span>　<span class="small muted">${esc(w.pos)}</span><br>${esc(w.ja)}</li>`).join("")}</ul></div>` : ""}`);
    setTop("まとめ", null, null);
    setBottom([{ label: "メニューへ", onClick: menu }]);
  }

  /* ---------- そのほかの画面 ---------- */
  function sceneList() {
    progress.hidden = true;
    setTop("読んだ場面", menu, null);
    show(`<div class="small muted" style="margin-bottom:8px">確認まで終えた場面を、もう一度読めます。</div>` +
      DATA.scenes.map((s) => {
        const done = sceneDone(s);
        return `<button type="button" class="scene-btn" data-s="${s.id}" ${done ? "" : "disabled"}>
          <span>${Number(s.id.slice(1))}. ${esc(s.title)}</span><span class="small muted">${done ? esc(s.type) : "まだ"}</span></button>`;
      }).join(""));
    main.querySelectorAll(".scene-btn:not([disabled])").forEach((b) => (b.onclick = () => {
      const s = DATA.scenes.find((x) => x.id === b.dataset.s);
      setTop(s.title, sceneList, null);
      sceneScreen(s, sceneList, true);
    }));
    setBottom([]);
  }
  function help() {
    setTop("はじめての人へ", menu, null);
    show(`<div class="card"><h2>1. 場面を読む</h2>会話・メール・お知らせなどの短い英文を読みます。<b>色のついた語</b>をタップすると意味が出ます。🔊で読み上げ、「訳を見る」で日本語訳が出ます。💡には、日本語では同じ意味になる語の使い分けなどを書いています。</div>
      <div class="card"><h2>2. 意味を確かめる</h2>場面とはちがう短い文で、さっきの語が出ます。意味を考えてから「意味を見る」を押し、<b>自分で「○ わかった」「× わからない」</b>を選びます。正直に選ぶほど、よく覚えられます。</div>
      <div class="card"><h2>3. 毎日つづける</h2>わからなかった語は翌日に、わかった語は 1日→3日→7日→14日→30日 と間をあけて、また出ます。1回は約15分です。</div>
      <div class="card"><h2>ホーム画面に入れる</h2><b>Android（Chrome）</b>：右上の「⋮」→「アプリをインストール」（または「ホーム画面に追加」）。<br><b>iPhone（Safari）</b>：共有ボタン（□↑）→「ホーム画面に追加」。<br>入れたあとは、電波がなくても使えます。</div>
      <div class="card"><h2>記録について</h2>記録はこの端末の中だけに保存されます。ブラウザのデータを消すと記録も消えるので、ときどき「記録のバックアップ」をしておきましょう。</div>`);
    setBottom([{ label: "メニューへ", onClick: menu }]);
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
    show(`<div class="card"><h2>書き出す</h2><div class="small muted">下の文字をコピーして、メモなどに貼り付けて保存します。</div>
        <textarea id="outTxt" readonly>${esc(txt)}</textarea>
        <div class="row"><button type="button" class="chip" id="copyBtn">コピーする</button></div></div>
      <div class="card"><h2>読み込む</h2><div class="small muted">保存しておいた文字を貼り付けて「読み込む」を押すと、今の記録と入れかわります。</div>
        <textarea id="inTxt" placeholder="ここに貼り付け"></textarea>
        <div class="row"><button type="button" class="chip" id="loadBtn">読み込む</button></div></div>`);
    $("copyBtn").onclick = async () => {
      try { await navigator.clipboard.writeText(txt); toast("コピーしました"); }
      catch (e) { const t = $("outTxt"); t.focus(); t.select(); toast("選んだ文字を長押ししてコピーしてください"); }
    };
    $("loadBtn").onclick = () => {
      let s; try { s = JSON.parse($("inTxt").value); } catch (e) { toast("文字の形がちがいます"); return; }
      if (!s || typeof s.items !== "object") { toast("このアプリの記録ではありません"); return; }
      modal("今の記録を、読み込んだ記録と入れかえますか？", [
        { label: "入れかえる", onClick: () => { state = s; saveState(); toast("読み込みました"); menu(); } },
        { label: "やめる", cls: "sub" }]);
    };
    setBottom([{ label: "メニューへ", onClick: menu }]);
  }

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ---------- 起動 ---------- */
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeSheet(); } });
  fetch("data/scenes.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => {
    DATA = d;
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
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
    });
  }
})();
