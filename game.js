// ===========================================================================
// game.js  —  Sketch & Guess  (v2)
//
// Host-authoritative game master (host's browser runs the clock + scoring).
// Stays on Firebase's FREE Spark plan (no Cloud Functions needed).
//
// v2 changes:
//  - FAIR SCORING: points are awarded by the HOST, ranked by the order correct
//    guesses reach the server (Firebase serverTimestamp / child-added order),
//    NOT by each device's local clock. First correct = most points.
//  - PLAYER vs OBSERVER roles. Observers watch + chat but don't draw or score.
//  - Sound effects (Web Audio, no files) with a mute toggle.
//  - Live countdown timer with last-10s urgency + ticks.
//  - Palette swatches fixed (CSS).
// ===========================================================================

import { auth, db } from "./firebase-config.js";
import { signInAnonymously, onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  ref, set, update, get, onValue, onChildAdded, push, remove,
  onDisconnect, runTransaction, serverTimestamp, off
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

import { WORDS, DEFAULT_DIFFICULTY } from "./words.js?v=4";

// ---- DOM helpers ----------------------------------------------------------
const $ = (id) => document.getElementById(id);
const show = (screen) => {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(screen).classList.add("active");
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ===========================================================================
// SOUND  (Web Audio, no asset files)
// ===========================================================================
const Sound = (() => {
  let ctx;
  let muted = localStorage.getItem("sg_muted") === "1";
  function ensure() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
    if (ctx && ctx.state === "suspended") ctx.resume();
  }
  function beep(f, start, dur, type = "sine", gain = 0.14) {
    if (muted || !ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime + start;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.03);
  }
  const seq = (notes) => { ensure(); notes.forEach((n) => beep(n.f, n.t, n.d, n.type || "sine", n.g)); };
  return {
    ensure,
    toggle() { muted = !muted; localStorage.setItem("sg_muted", muted ? "1" : "0"); return muted; },
    isMuted() { return muted; },
    correct() { seq([{ f: 659, t: 0, d: 0.12 }, { f: 988, t: 0.10, d: 0.18 }]); },
    mine()    { seq([{ f: 784, t: 0, d: 0.11 }, { f: 1175, t: 0.10, d: 0.16 }, { f: 1568, t: 0.20, d: 0.2 }]); },
    turnStart(){ seq([{ f: 523, t: 0, d: 0.10 }, { f: 784, t: 0.09, d: 0.14 }]); },
    tick()    { seq([{ f: 900, t: 0, d: 0.05, g: 0.07 }]); },
    turnEnd() { seq([{ f: 440, t: 0, d: 0.14 }, { f: 330, t: 0.12, d: 0.2 }]); },
    gameEnd() { seq([{ f: 523, t: 0, d: 0.14 }, { f: 659, t: 0.13, d: 0.14 }, { f: 784, t: 0.26, d: 0.14 }, { f: 1046, t: 0.39, d: 0.34 }]); },
  };
})();
// unlock audio + set button state on first interaction
document.addEventListener("click", () => Sound.ensure(), { once: true });
document.addEventListener("keydown", () => Sound.ensure(), { once: true });

// ---- state ----------------------------------------------------------------
let ME = null, ROOM = null, IS_HOST = false;
let meta = null, players = {}, listeners = [];
let hostTimer = null;
let myRole = "player";
let myGuessedKey = "";          // per-turn local guard so I only submit one correct guess
// host scoring state
let hostTurnKey = "", hostRank = 0, hostScored = new Set();

let drawing = { active: false, color: "#111111", size: 6, last: null };
const PALETTE = ["#111111", "#ffffff", "#e11d48", "#ea580c", "#f59e0b",
  "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777", "#78350f", "#9ca3af"];

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------
onAuthStateChanged(auth, (user) => { if (user) { ME = user.uid; offerRejoin(); } });
signInAnonymously(auth).catch((e) => {
  $("join-error").textContent =
    "Couldn't connect to the game server. Check the Firebase config. (" + e.code + ")";
});

// ---- room codes -----------------------------------------------------------
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from({ length: 4 }, () =>
  CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

// ---------------------------------------------------------------------------
// CREATE / JOIN
// ---------------------------------------------------------------------------
$("btn-create").addEventListener("click", async () => {
  const name = getName(); if (!name) return;
  const code = makeCode();
  const roomMeta = {
    hostUid: ME, lang: $("opt-lang").value,
    totalRounds: Number($("opt-rounds").value),
    turnSeconds: Number($("opt-time").value),
    difficulty: Number(($("opt-diff") && $("opt-diff").value) || DEFAULT_DIFFICULTY),
    state: "lobby", round: 1, turnIndex: 0,
    currentDrawer: "", word: "", wordLen: 0, turnEndsAt: 0, createdAt: Date.now(),
  };
  try {
    await set(ref(db, `rooms/${code}/meta`), roomMeta);
    await joinRoom(code, name, "player"); // host is always a player
  } catch (e) {
    $("join-error").textContent = "Could not create the game (" + (e.code || e.message) + ").";
  }
});

$("btn-join").addEventListener("click", async () => {
  const name = getName(); if (!name) return;
  const code = ($("join-code").value || "").trim().toUpperCase();
  if (code.length !== 4) { $("join-error").textContent = "Enter the 4-letter room code."; return; }
  const snap = await get(ref(db, `rooms/${code}/meta`));
  if (!snap.exists()) { $("join-error").textContent = "No game found with that code."; return; }
  const role = $("opt-role") ? $("opt-role").value : "player";
  await joinRoom(code, name, role);
});

function getName() {
  const name = ($("name").value || "").trim();
  if (!name) $("join-error").textContent = "Enter your name first.";
  return name;
}

async function joinRoom(code, name, role) {
  $("join-error").textContent = "";
  ROOM = code; myRole = role;
  const pRef = ref(db, `rooms/${code}/players/${ME}`);
  const existing = await get(pRef);
  const prevScore = existing.exists() ? (existing.val().score || 0) : 0;
  const metaSnap = await get(ref(db, `rooms/${code}/meta`));
  IS_HOST = metaSnap.val().hostUid === ME;

  await set(pRef, {
    name, role, score: prevScore, connected: true, correctThisTurn: false,
    isHost: IS_HOST, joinedAt: existing.exists() ? existing.val().joinedAt : Date.now(),
  });
  onDisconnect(pRef).update({ connected: false });
  localStorage.setItem("sg_last", JSON.stringify({ code, name, role }));
  attachRoomListeners(code);
}

async function offerRejoin() {
  try {
    const last = JSON.parse(localStorage.getItem("sg_last") || "null");
    if (!last) return;
    const snap = await get(ref(db, `rooms/${last.code}/meta`));
    if (!snap.exists()) { localStorage.removeItem("sg_last"); return; }
    const hint = $("rejoin-hint");
    hint.style.display = "block";
    hint.innerHTML = `Rejoin game <b>${esc(last.code)}</b> as <b>${esc(last.name)}</b>? `;
    const b = document.createElement("button");
    b.className = "btn-ghost mini"; b.textContent = "Rejoin";
    b.onclick = () => { $("name").value = last.name; joinRoom(last.code, last.name, last.role || "player"); };
    hint.appendChild(b);
  } catch {}
}

// ---------------------------------------------------------------------------
// LISTENERS
// ---------------------------------------------------------------------------
function listen(path, event, cb) {
  const r = ref(db, path);
  if (event === "value") onValue(r, cb);
  else if (event === "child_added") onChildAdded(r, cb);
  listeners.push({ r });
}
function attachRoomListeners(code) {
  detachAll();
  listen(`rooms/${code}/meta`, "value", (snap) => {
    meta = snap.val(); if (!meta) return;
    IS_HOST = meta.hostUid === ME;
    renderMeta();
    if (IS_HOST) hostTick();
  });
  listen(`rooms/${code}/players`, "value", (snap) => {
    players = snap.val() || {}; renderPlayers();
  });
  listen(`rooms/${code}/strokes`, "child_added", (snap) => applyStroke(snap.val()));
  listen(`rooms/${code}/chat`, "child_added", (snap) => appendChat(snap.val()));
  // host-only scoring feed (harmless for non-hosts; they ignore it)
  listen(`rooms/${code}/correct`, "child_added", (snap) => hostScore(snap.key, snap.val()));
}
function detachAll() {
  listeners.forEach(({ r }) => off(r));
  listeners = [];
  if (hostTimer) { clearInterval(hostTimer); hostTimer = null; }
}

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------
let soundTurnKey = "", soundEndedKey = "";
function renderMeta() {
  if (!meta) return;
  if (meta.state === "lobby") {
    show("screen-lobby");
    $("lobby-code").textContent = ROOM;
    $("btn-start").style.display = IS_HOST ? "block" : "none";
    $("lobby-hint").style.display = IS_HOST ? "none" : "block";
  } else if (meta.state === "gameEnd") {
    show("screen-end");
    renderPodium();
    $("btn-again").style.display = IS_HOST ? "block" : "none";
    $("end-hint").textContent = IS_HOST ? "" : "Waiting for the host…";
    if (soundEndedKey !== "end") { soundEndedKey = "end"; Sound.gameEnd(); }
  } else {
    soundEndedKey = "";
    show("screen-game");
    renderGameHeader();
    setupToolbarVisibility();
    const key = `${meta.round}:${meta.turnIndex}`;
    if (meta.state === "drawing" && soundTurnKey !== key) { soundTurnKey = key; Sound.turnStart(); }
  }
}

function renderGameHeader() {
  $("game-round").textContent = `Round ${meta.round} / ${meta.totalRounds}`;
  const amDrawer = meta.currentDrawer === ME;
  const reveal = meta.state === "turnEnd";
  const word = meta.word || "";
  const box = $("game-word");
  box.innerHTML = "";
  word.split("").forEach((ch) => {
    if (ch === " ") { const sp = document.createElement("span"); sp.className = "wsp"; box.appendChild(sp); return; }
    const tile = document.createElement("span");
    tile.className = "tile";
    if (amDrawer || reveal) tile.textContent = ch.toUpperCase();
    box.appendChild(tile);
  });
  // role banner
  const banner = $("role-banner");
  if (myRole === "observer") { banner.textContent = "👁 You're observing"; banner.style.display = "block"; }
  else if (amDrawer && meta.state === "drawing") { banner.textContent = "✏️ Your turn to draw!"; banner.style.display = "block"; }
  else banner.style.display = "none";
}

function playerEntries() {
  return Object.entries(players);
}
function renderPlayers() {
  // lobby
  const ll = $("lobby-players");
  if (ll) {
    ll.innerHTML = "";
    playerEntries().forEach(([uid, p]) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="dot ${p.connected ? "" : "off"}"></span>` +
        `<span class="nm">${esc(p.name)}</span>` +
        (p.isHost ? `<span class="badge host">HOST</span>` : "") +
        (p.role === "observer" ? `<span class="badge obs">OBSERVER</span>` : `<span class="badge play">PLAYER</span>`);
      ll.appendChild(li);
    });
    const nPlayers = playerEntries().filter(([, p]) => p.role !== "observer").length;
    $("lobby-count").textContent = `${nPlayers} player${nPlayers !== 1 ? "s" : ""} · ` +
      `${playerEntries().length - nPlayers} observer${playerEntries().length - nPlayers !== 1 ? "s" : ""}`;
  }
  // in-game scoreboard (players ranked) + observers listed
  const gs = $("game-scores");
  if (gs && meta) {
    const ranked = playerEntries().filter(([, p]) => p.role !== "observer")
      .sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
    gs.innerHTML = "";
    ranked.forEach(([uid, p], i) => {
      const li = document.createElement("li");
      if (uid === meta.currentDrawer) li.classList.add("drawing");
      if (p.correctThisTurn) li.classList.add("correct");
      const medal = i < 3 ? `medal m${i + 1}` : "";
      li.innerHTML = `<span class="rank ${medal}">${i + 1}</span>` +
        `<span class="dot ${p.connected ? "" : "off"}"></span>` +
        `<span class="nm">${esc(p.name)}</span>` +
        (uid === meta.currentDrawer ? `<span class="pencil">✏️</span>` : "") +
        `<span class="pts">${p.score || 0}</span>`;
      gs.appendChild(li);
    });
    const obs = playerEntries().filter(([, p]) => p.role === "observer");
    const obsWrap = $("game-observers");
    if (obs.length) {
      obsWrap.style.display = "block";
      $("obs-list").innerHTML = obs.map(([, p]) =>
        `<span class="obs-chip"><span class="dot ${p.connected ? "" : "off"}"></span>${esc(p.name)}</span>`).join("");
    } else obsWrap.style.display = "none";
  }
}

function renderPodium() {
  const list = $("end-podium");
  list.innerHTML = "";
  playerEntries().filter(([, p]) => p.role !== "observer")
    .sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
    .forEach(([, p], i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="rank">${i + 1}</span>` +
        `<span class="nm">${esc(p.name)}</span><span class="pts">${p.score || 0}</span>`;
      list.appendChild(li);
    });
}

// ---------------------------------------------------------------------------
// LOBBY actions
// ---------------------------------------------------------------------------
$("btn-copy").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}?room=${ROOM}`;
  try { await navigator.clipboard.writeText(url); $("btn-copy").textContent = "Copied!"; }
  catch { prompt("Copy this invite link:", url); }
  setTimeout(() => ($("btn-copy").textContent = "Copy invite link"), 1500);
});
$("btn-start").addEventListener("click", () => {
  if (!IS_HOST) return;
  const connectedPlayers = playerEntries().filter(([, p]) => p.connected && p.role !== "observer");
  if (connectedPlayers.length < 2) { alert("Need at least 2 connected players (not observers) to start."); return; }
  startGame();
});
$("btn-again").addEventListener("click", () => { if (IS_HOST) startGame(); });
$("btn-home").addEventListener("click", leaveGame);
$("btn-leave").addEventListener("click", leaveGame);
$("btn-mute").addEventListener("click", () => {
  const muted = Sound.toggle();
  $("btn-mute").textContent = muted ? "🔇" : "🔊";
});

async function leaveGame() {
  if (ROOM && ME) { try { await update(ref(db, `rooms/${ROOM}/players/${ME}`), { connected: false }); } catch {} }
  detachAll();
  ROOM = null; IS_HOST = false; meta = null; players = {};
  show("screen-join");
}

// ===========================================================================
// HOST LOGIC
// ===========================================================================
function currentPool(lang, level) {
  const byLang = WORDS[lang] || WORDS.en || {};
  const list = byLang[level] || byLang[DEFAULT_DIFFICULTY] || [];
  return list.length ? list.slice() : ["circle", "square", "star"];
}

// Host-side draw deck: guarantees no word repeats until the whole level list
// has been used once. Lives only in the host's browser (not written to
// Firebase), so upcoming words aren't exposed to guessers.
let hostDeck = [];
function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function refillHostDeck() {
  hostDeck = shuffleInPlace(currentPool(meta.lang || "en", meta.difficulty || DEFAULT_DIFFICULTY));
}
function nextWord() {
  if (!hostDeck.length) refillHostDeck();
  return hostDeck.pop();
}

async function startGame() {
  const order = playerEntries().filter(([, p]) => p.connected && p.role !== "observer").map(([uid]) => uid);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const updates = {};
  Object.keys(players).forEach((uid) => {
    updates[`rooms/${ROOM}/players/${uid}/score`] = 0;
    updates[`rooms/${ROOM}/players/${uid}/correctThisTurn`] = false;
  });
  await update(ref(db), updates);
  await remove(ref(db, `rooms/${ROOM}/chat`));
  refillHostDeck(); // fresh no-repeat word deck for this game
  await update(ref(db, `rooms/${ROOM}/meta`), { drawOrder: order, round: 1, turnIndex: 0, state: "starting" });
  await beginTurn(1, 0, order);
}

async function beginTurn(round, turnIndex, order) {
  const drawer = order[turnIndex];
  const word = nextWord();
  await remove(ref(db, `rooms/${ROOM}/strokes`));
  await remove(ref(db, `rooms/${ROOM}/correct`)); // reset per-turn correct feed
  hostTurnKey = `${round}:${turnIndex}`; hostRank = 0; hostScored = new Set();
  const flags = {};
  Object.keys(players).forEach((uid) => { flags[`rooms/${ROOM}/players/${uid}/correctThisTurn`] = false; });
  await update(ref(db), flags);
  await update(ref(db, `rooms/${ROOM}/meta`), {
    state: "drawing", round, turnIndex, currentDrawer: drawer,
    word, wordLen: word.length, turnEndsAt: Date.now() + (meta.turnSeconds || 80) * 1000,
  });
  await sysMsg(`${players[drawer]?.name || "Someone"} is drawing!`);
}

function hostTick() {
  if (!IS_HOST || !meta) return;
  if (!hostTimer) hostTimer = setInterval(hostTick, 1000);
  if (meta.state !== "drawing") return;
  const timeUp = Date.now() >= (meta.turnEndsAt || 0);
  const guessers = playerEntries().filter(([uid, p]) => p.connected && p.role !== "observer" && uid !== meta.currentDrawer);
  const allGuessed = guessers.length > 0 && guessers.every(([, p]) => p.correctThisTurn);
  if (timeUp || allGuessed) endTurn();
}

// HOST awards points by the ORDER correct guesses arrive at the server.
async function hostScore(uid, val) {
  if (!IS_HOST || !meta || meta.state !== "drawing") return;
  const turnKey = `${meta.round}:${meta.turnIndex}`;
  if (turnKey !== hostTurnKey) { hostTurnKey = turnKey; hostRank = 0; hostScored = new Set(); }
  if (uid === meta.currentDrawer || hostScored.has(uid)) return;
  hostScored.add(uid);
  const rank = ++hostRank;
  const pts = Math.max(20, 100 - (rank - 1) * 15); // 1st=100, 2nd=85, 3rd=70, … floor 20
  await runTransaction(ref(db, `rooms/${ROOM}/players/${uid}/score`), (s) => (s || 0) + pts);
  await runTransaction(ref(db, `rooms/${ROOM}/players/${meta.currentDrawer}/score`), (s) => (s || 0) + 20);
  await update(ref(db, `rooms/${ROOM}/players/${uid}`), { correctThisTurn: true });
  const ord = rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : `${rank}th`;
  await push(ref(db, `rooms/${ROOM}/chat`), {
    kind: "correct", text: `${val.name} got it (${ord}, +${pts})`, ts: Date.now(),
  });
}

let ending = false;
async function endTurn() {
  if (ending) return; ending = true;
  await update(ref(db, `rooms/${ROOM}/meta`), { state: "turnEnd" });
  await sysMsg(`The word was: ${meta.word}`);
  setTimeout(async () => {
    const order = meta.drawOrder || [];
    let round = meta.round, idx = meta.turnIndex + 1;
    if (idx >= order.length) { idx = 0; round += 1; }
    if (round > (meta.totalRounds || 3)) await update(ref(db, `rooms/${ROOM}/meta`), { state: "gameEnd" });
    else await beginTurn(round, idx, order);
    ending = false;
  }, 3500);
}
async function sysMsg(text) { await push(ref(db, `rooms/${ROOM}/chat`), { kind: "system", text, ts: Date.now() }); }

// ===========================================================================
// GUESSING
// ===========================================================================
$("guess-send").addEventListener("click", sendGuess);
$("guess-input").addEventListener("keydown", (e) => { if (e.key === "Enter") sendGuess(); });
const normalize = (s) => (s || "").toLowerCase().trim().replace(/\s+/g, " ");

async function sendGuess() {
  const input = $("guess-input");
  const text = input.value.trim();
  if (!text || !meta || meta.state !== "drawing") return;
  input.value = "";
  const me = players[ME];
  const amDrawer = meta.currentDrawer === ME;
  const correct = normalize(text) === normalize(meta.word || "");

  // Observers: can chat, but never score. Hide it if they happen to type the word.
  if (myRole === "observer") {
    if (correct) return; // don't spoil
    await push(ref(db, `rooms/${ROOM}/chat`), { kind: "guess", who: me?.name || "?", text, ts: Date.now() });
    return;
  }
  if (amDrawer) return; // drawer can't guess

  if (correct) {
    const turnKey = `${meta.round}:${meta.turnIndex}`;
    if (myGuessedKey === turnKey || (me && me.correctThisTurn)) return; // already got it
    myGuessedKey = turnKey;
    Sound.mine();
    // Report to the host with a server timestamp; the HOST decides rank + points.
    await set(ref(db, `rooms/${ROOM}/correct/${ME}`), { name: me?.name || "?", at: serverTimestamp() });
  } else {
    await push(ref(db, `rooms/${ROOM}/chat`), { kind: "guess", who: me?.name || "?", text, ts: Date.now() });
  }
}

function appendChat(m) {
  const log = $("chatlog"); if (!log) return;
  const div = document.createElement("div");
  div.className = "msg " + (m.kind || "guess");
  if (m.kind === "guess") div.innerHTML = `<span class="who">${esc(m.who)}:</span> ${esc(m.text)}`;
  else div.textContent = m.text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  if (m.kind === "correct") Sound.correct();
}

// ===========================================================================
// DRAWING
// ===========================================================================
const canvas = $("board");
const ctx = canvas.getContext("2d");
function setupToolbarVisibility() {
  const amDrawer = meta && meta.currentDrawer === ME && meta.state === "drawing" && myRole !== "observer";
  $("toolbar").classList.toggle("hidden", !amDrawer);
  canvas.style.cursor = amDrawer ? "crosshair" : "default";
}
(function buildTools() {
  const box = $("swatches");
  PALETTE.forEach((c, i) => {
    const s = document.createElement("span");
    s.className = "swatch" + (i === 0 ? " sel" : "");
    s.style.background = c;
    if (c === "#ffffff") s.style.boxShadow = "0 0 0 1px var(--line)";
    s.onclick = () => {
      drawing.color = c;
      document.querySelectorAll(".swatch").forEach((x) => x.classList.remove("sel"));
      s.classList.add("sel");
    };
    box.appendChild(s);
  });
  $("brush").addEventListener("input", (e) => (drawing.size = Number(e.target.value)));
  $("btn-clear").addEventListener("click", async () => {
    if (meta.currentDrawer !== ME) return;
    await push(ref(db, `rooms/${ROOM}/strokes`), { type: "clear" });
  });
})();
function canDraw() { return meta && meta.currentDrawer === ME && meta.state === "drawing" && myRole !== "observer"; }
function pos(e) {
  const r = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
  const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
  return { x: cx / r.width, y: cy / r.height };
}
function startDraw(e) { if (!canDraw()) return; e.preventDefault(); drawing.active = true; drawing.last = pos(e); }
function moveDraw(e) {
  if (!drawing.active || !canDraw()) return; e.preventDefault();
  const p = pos(e);
  push(ref(db, `rooms/${ROOM}/strokes`), {
    type: "line", x0: drawing.last.x, y0: drawing.last.y, x1: p.x, y1: p.y, color: drawing.color, size: drawing.size,
  });
  drawing.last = p;
}
function endDraw() { drawing.active = false; drawing.last = null; }
canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", moveDraw);
window.addEventListener("mouseup", endDraw);
canvas.addEventListener("touchstart", startDraw, { passive: false });
canvas.addEventListener("touchmove", moveDraw, { passive: false });
canvas.addEventListener("touchend", endDraw);

let lastDrawerKey = "";
function applyStroke(s) {
  if (!s) return;
  const key = `${meta?.round}:${meta?.currentDrawer}`;
  if (key !== lastDrawerKey) { ctx.clearRect(0, 0, canvas.width, canvas.height); lastDrawerKey = key; }
  if (s.type === "clear") { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
  if (s.type !== "line") return;
  ctx.strokeStyle = s.color; ctx.lineWidth = s.size; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(s.x0 * canvas.width, s.y0 * canvas.height);
  ctx.lineTo(s.x1 * canvas.width, s.y1 * canvas.height);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// TIMER + urgency ticks (all clients)
// ---------------------------------------------------------------------------
let watchKey = "", lastTickSec = -1;
setInterval(() => {
  if (!meta) return;
  const turnKey = `${meta.round}:${meta.currentDrawer}:${meta.state}`;
  if (turnKey !== watchKey) {
    watchKey = turnKey; lastTickSec = -1;
    if (meta.state === "drawing") { ctx.clearRect(0, 0, canvas.width, canvas.height); lastDrawerKey = ""; }
  }
  const timerEl = $("game-timer");
  if (!timerEl) return;
  if (meta.state === "drawing" && meta.turnEndsAt) {
    const secs = Math.max(0, Math.ceil((meta.turnEndsAt - Date.now()) / 1000));
    timerEl.textContent = secs;
    timerEl.classList.toggle("urgent", secs <= 10);
    if (secs <= 10 && secs >= 1 && secs !== lastTickSec) { lastTickSec = secs; Sound.tick(); }
  } else {
    timerEl.textContent = meta.state === "turnEnd" ? "⏱" : "–";
    timerEl.classList.remove("urgent");
  }
}, 200);

// set initial mute button label
$("btn-mute").textContent = Sound.isMuted() ? "🔇" : "🔊";

// deep link ?room=CODE
const params = new URLSearchParams(location.search);
if (params.get("room")) $("join-code").value = params.get("room").toUpperCase();

// ===========================================================================
// FEEDBACK  →  Firebase  (an Apps Script syncs it into the Google Sheet)
// ===========================================================================
let fbRating = 0;
function openFeedback() {
  $("feedback-modal").style.display = "flex";
  $("fb-form").style.display = "block";
  $("fb-thanks").style.display = "none";
}
function closeFeedback() { $("feedback-modal").style.display = "none"; }
["btn-feedback", "btn-feedback-end"].forEach((id) => {
  const el = $(id); if (el) el.addEventListener("click", openFeedback);
});
if ($("fb-close")) $("fb-close").addEventListener("click", closeFeedback);
if ($("feedback-modal")) $("feedback-modal").addEventListener("click", (e) => {
  if (e.target.id === "feedback-modal") closeFeedback();
});
document.querySelectorAll("#fb-stars span").forEach((s) => {
  s.addEventListener("click", () => {
    fbRating = Number(s.dataset.v);
    document.querySelectorAll("#fb-stars span").forEach((x) =>
      x.classList.toggle("on", Number(x.dataset.v) <= fbRating));
  });
});
if ($("fb-send")) $("fb-send").addEventListener("click", async () => {
  const comment = $("fb-comment").value.trim();
  if (!fbRating && !comment) return;
  const code = ROOM || "lobby";
  try {
    await push(ref(db, "feedback/" + code), {
      game: "Skwibble",
      name: (players[ME] && players[ME].name) || "",
      rating: fbRating || "",
      comment,
      gameDate: new Date((meta && meta.createdAt) || Date.now()).toISOString().slice(0, 10),
      ts: Date.now(),
    });
  } catch (e) {}
  $("fb-form").style.display = "none";
  $("fb-thanks").style.display = "block";
  fbRating = 0; $("fb-comment").value = "";
  document.querySelectorAll("#fb-stars span").forEach((x) => x.classList.remove("on"));
  setTimeout(closeFeedback, 1800);
});
