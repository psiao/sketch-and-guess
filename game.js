// ===========================================================================
// game.js  —  Sketch & Guess (host-authoritative, Firebase Realtime Database)
//
// Design: the HOST's browser is the "game master". Only the host runs the
// timer and advances turns/rounds/words. Everyone else reacts to the shared
// game state. This keeps the whole thing on Firebase's FREE Spark plan (no
// Cloud Functions / paid backend needed). The host must keep their tab open.
// ===========================================================================

import { auth, db } from "./firebase-config.js";
import { signInAnonymously, onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  ref, set, update, get, onValue, onChildAdded, push, remove,
  onDisconnect, runTransaction, off
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

import { WORD_PACKS, DEFAULT_PACK_IDS } from "./words.js";

// ---- tiny DOM helpers -----------------------------------------------------
const $ = (id) => document.getElementById(id);
const show = (screen) => {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(screen).classList.add("active");
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- state ----------------------------------------------------------------
let ME = null;          // my uid
let ROOM = null;        // current room code
let IS_HOST = false;
let meta = null;        // latest meta snapshot
let players = {};       // latest players snapshot
let listeners = [];     // { path, ref, event, cb } to detach on leave
let hostTimer = null;   // host-only setInterval
let localWord = null;   // cached word for render decisions
let drawing = { active: false, color: "#111111", size: 6, last: null };

const PALETTE = ["#111111", "#ffffff", "#dc2626", "#ea580c", "#f59e0b",
  "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777"];

// ---------------------------------------------------------------------------
// AUTH — anonymous, persists per browser (this is what gives dropped players
// their same identity + score back on refresh/rejoin).
// ---------------------------------------------------------------------------
onAuthStateChanged(auth, (user) => {
  if (user) {
    ME = user.uid;
    offerRejoin();
  }
});
signInAnonymously(auth).catch((e) => {
  $("join-error").textContent =
    "Couldn't connect to the game server. Check the Firebase config. (" + e.code + ")";
});

// ---------------------------------------------------------------------------
// ROOM CODES
// ---------------------------------------------------------------------------
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
const makeCode = () =>
  Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

// ---------------------------------------------------------------------------
// CREATE / JOIN
// ---------------------------------------------------------------------------
$("btn-create").addEventListener("click", async () => {
  const name = getName(); if (!name) return;
  const code = makeCode();
  const now = Date.now();
  const roomMeta = {
    hostUid: ME,
    lang: $("opt-lang").value,
    totalRounds: Number($("opt-rounds").value),
    turnSeconds: Number($("opt-time").value),
    state: "lobby",
    round: 1,
    turnIndex: 0,
    currentDrawer: "",
    word: "",
    wordLen: 0,
    turnEndsAt: 0,
    createdAt: now,
  };
  try {
    await set(ref(db, `rooms/${code}/meta`), roomMeta);
    await joinRoom(code, name);
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
  await joinRoom(code, name);
});

function getName() {
  const name = ($("name").value || "").trim();
  if (!name) { $("join-error").textContent = "Enter your name first."; }
  return name;
}

async function joinRoom(code, name) {
  $("join-error").textContent = "";
  ROOM = code;
  const pRef = ref(db, `rooms/${code}/players/${ME}`);
  const existing = await get(pRef);
  const prevScore = existing.exists() ? (existing.val().score || 0) : 0;

  const metaSnap = await get(ref(db, `rooms/${code}/meta`));
  IS_HOST = metaSnap.val().hostUid === ME;

  await set(pRef, {
    name,
    score: prevScore,
    connected: true,
    correctThisTurn: false,
    isHost: IS_HOST,
    joinedAt: existing.exists() ? existing.val().joinedAt : Date.now(),
  });
  // mark me offline if the tab closes
  onDisconnect(pRef).update({ connected: false });

  localStorage.setItem("sg_last", JSON.stringify({ code, name }));
  attachRoomListeners(code);
}

// Offer a one-click rejoin if this browser was recently in a game.
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
    b.className = "btn-ghost"; b.style.padding = "4px 10px"; b.style.marginLeft = "6px";
    b.textContent = "Rejoin";
    b.onclick = () => { $("name").value = last.name; joinRoom(last.code, last.name); };
    hint.appendChild(b);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// LISTENERS — react to shared state
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
    meta = snap.val();
    if (!meta) return;
    IS_HOST = meta.hostUid === ME;
    localWord = meta.word || null;
    renderMeta();
    if (IS_HOST) hostTick(); // re-evaluate host duties on every meta change
  });

  listen(`rooms/${code}/players`, "value", (snap) => {
    players = snap.val() || {};
    renderPlayers();
  });

  // drawing strokes stream
  listen(`rooms/${code}/strokes`, "child_added", (snap) => {
    applyStroke(snap.val());
  });

  // chat / guesses
  listen(`rooms/${code}/chat`, "child_added", (snap) => {
    appendChat(snap.val());
  });
}

function detachAll() {
  listeners.forEach(({ r }) => off(r));
  listeners = [];
  if (hostTimer) { clearInterval(hostTimer); hostTimer = null; }
}

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------
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
  } else {
    show("screen-game");
    renderGameHeader();
    setupToolbarVisibility();
  }
}

function renderGameHeader() {
  $("game-round").textContent = `Round ${meta.round} / ${meta.totalRounds}`;
  const amDrawer = meta.currentDrawer === ME;
  if (meta.state === "turnEnd") {
    $("game-word").textContent = meta.word ? meta.word.toUpperCase() : "";
  } else if (amDrawer) {
    $("game-word").textContent = (meta.word || "").toUpperCase();
  } else {
    // blanks: underscore per letter, spaces preserved
    $("game-word").textContent = (meta.word || "")
      .split("").map((ch) => (ch === " " ? "  " : "_")).join(" ");
  }
}

function renderPlayers() {
  // lobby list
  const ll = $("lobby-players");
  if (ll) {
    ll.innerHTML = "";
    Object.entries(players).forEach(([uid, p]) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="dot ${p.connected ? "" : "off"}"></span>${esc(p.name)}` +
        (p.isHost ? `<span class="badge">HOST</span>` : "");
      ll.appendChild(li);
    });
  }
  // game scoreboard
  const gs = $("game-scores");
  if (gs && meta) {
    gs.innerHTML = "";
    Object.entries(players)
      .sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
      .forEach(([uid, p]) => {
        const li = document.createElement("li");
        if (uid === meta.currentDrawer) li.classList.add("drawing");
        if (p.correctThisTurn) li.classList.add("correct");
        li.innerHTML = `<span class="dot ${p.connected ? "" : "off"}"></span>` +
          `<span class="nm">${esc(p.name)}</span><span class="pts">${p.score || 0}</span>`;
        gs.appendChild(li);
      });
  }
}

function renderPodium() {
  const list = $("end-podium");
  list.innerHTML = "";
  Object.values(players)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .forEach((p, i) => {
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
  const connected = Object.entries(players).filter(([, p]) => p.connected);
  if (connected.length < 2) { alert("Need at least 2 connected players to start."); return; }
  startGame();
});

$("btn-again").addEventListener("click", () => { if (IS_HOST) startGame(true); });
$("btn-home").addEventListener("click", leaveGame);
$("btn-leave").addEventListener("click", leaveGame);

async function leaveGame() {
  if (ROOM && ME) {
    try { await update(ref(db, `rooms/${ROOM}/players/${ME}`), { connected: false }); } catch {}
  }
  detachAll();
  ROOM = null; IS_HOST = false; meta = null; players = {};
  show("screen-join");
}

// ===========================================================================
// HOST LOGIC  (runs only in the host's browser)
// ===========================================================================
function currentPack(lang) {
  const ids = DEFAULT_PACK_IDS.filter((id) => WORD_PACKS[id]);
  const pool = [];
  ids.forEach((id) => (WORD_PACKS[id][lang] || []).forEach((w) => pool.push(w)));
  return pool.length ? pool : ["circle", "square", "star"];
}

async function startGame(replay = false) {
  const connectedUids = Object.entries(players)
    .filter(([, p]) => p.connected)
    .map(([uid]) => uid);
  // shuffle draw order
  for (let i = connectedUids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [connectedUids[i], connectedUids[j]] = [connectedUids[j], connectedUids[i]];
  }
  // reset scores + flags
  const updates = {};
  Object.keys(players).forEach((uid) => {
    updates[`rooms/${ROOM}/players/${uid}/score`] = 0;
    updates[`rooms/${ROOM}/players/${uid}/correctThisTurn`] = false;
  });
  await update(ref(db), updates);
  await remove(ref(db, `rooms/${ROOM}/chat`));

  await update(ref(db, `rooms/${ROOM}/meta`), {
    drawOrder: connectedUids,
    round: 1,
    turnIndex: 0,
    state: "starting",
  });
  await beginTurn(1, 0, connectedUids);
}

async function beginTurn(round, turnIndex, order) {
  const drawer = order[turnIndex];
  const lang = meta.lang || "en";
  const pool = currentPack(lang);
  const word = pool[Math.floor(Math.random() * pool.length)];

  // clear canvas + per-turn flags
  await remove(ref(db, `rooms/${ROOM}/strokes`));
  const flagUpdates = {};
  Object.keys(players).forEach((uid) => {
    flagUpdates[`rooms/${ROOM}/players/${uid}/correctThisTurn`] = false;
  });
  await update(ref(db), flagUpdates);

  await update(ref(db, `rooms/${ROOM}/meta`), {
    state: "drawing",
    round, turnIndex,
    currentDrawer: drawer,
    word,
    wordLen: word.length,
    turnEndsAt: Date.now() + (meta.turnSeconds || 80) * 1000,
  });
  await sysMsg(`${players[drawer]?.name || "Someone"} is drawing!`);
}

// evaluate host duties whenever meta changes; also run a 1s ticker
function hostTick() {
  if (!IS_HOST || !meta) return;
  if (!hostTimer) hostTimer = setInterval(hostTick, 1000);

  if (meta.state !== "drawing") return;

  const now = Date.now();
  const timeUp = now >= (meta.turnEndsAt || 0);

  // all connected non-drawers guessed?
  const guessers = Object.entries(players)
    .filter(([uid, p]) => p.connected && uid !== meta.currentDrawer);
  const allGuessed = guessers.length > 0 && guessers.every(([, p]) => p.correctThisTurn);

  if (timeUp || allGuessed) endTurn();
}

let ending = false;
async function endTurn() {
  if (ending) return; ending = true;
  await update(ref(db, `rooms/${ROOM}/meta`), { state: "turnEnd" });
  await sysMsg(`The word was: ${meta.word}`);

  setTimeout(async () => {
    const order = meta.drawOrder || [];
    let round = meta.round;
    let idx = meta.turnIndex + 1;
    if (idx >= order.length) { idx = 0; round += 1; }

    if (round > (meta.totalRounds || 3)) {
      await update(ref(db, `rooms/${ROOM}/meta`), { state: "gameEnd" });
    } else {
      await beginTurn(round, idx, order);
    }
    ending = false;
  }, 3500);
}

async function sysMsg(text) {
  await push(ref(db, `rooms/${ROOM}/chat`), { kind: "system", text, ts: Date.now() });
}

// ===========================================================================
// GUESSING  (any non-drawer). Self-checked client-side, score via transaction.
// Trust-based for v1 — see README "Fair play" note.
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
  if (amDrawer || (me && me.correctThisTurn)) return; // drawer can't guess; no double credit

  const correct = normalize(text) === normalize(meta.word || "");
  if (correct) {
    // points scale with remaining time; drawer gets a flat bonus per correct guess
    const remain = Math.max(0, (meta.turnEndsAt - Date.now()) / 1000);
    const pts = Math.max(10, Math.round((remain / (meta.turnSeconds || 80)) * 100));

    await runTransaction(ref(db, `rooms/${ROOM}/players/${ME}/score`), (s) => (s || 0) + pts);
    await update(ref(db, `rooms/${ROOM}/players/${ME}`), { correctThisTurn: true });
    await runTransaction(ref(db, `rooms/${ROOM}/players/${meta.currentDrawer}/score`), (s) => (s || 0) + 20);

    await push(ref(db, `rooms/${ROOM}/chat`), {
      kind: "correct", text: `${me.name} guessed the word! (+${pts})`, ts: Date.now(),
    });
  } else {
    await push(ref(db, `rooms/${ROOM}/chat`), {
      kind: "guess", who: me?.name || "?", text, ts: Date.now(),
    });
  }
}

function appendChat(m) {
  const log = $("chatlog");
  if (!log) return;
  const div = document.createElement("div");
  div.className = "msg " + (m.kind || "guess");
  if (m.kind === "guess") div.innerHTML = `<span class="who">${esc(m.who)}:</span> ${esc(m.text)}`;
  else div.textContent = m.text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ===========================================================================
// DRAWING
// ===========================================================================
const canvas = $("board");
const ctx = canvas.getContext("2d");

function setupToolbarVisibility() {
  const amDrawer = meta && meta.currentDrawer === ME && meta.state === "drawing";
  $("toolbar").classList.toggle("hidden", !amDrawer);
  canvas.style.cursor = amDrawer ? "crosshair" : "default";
}

// palette + brush UI (built once)
(function buildTools() {
  const box = $("swatches");
  PALETTE.forEach((c, i) => {
    const s = document.createElement("span");
    s.className = "swatch" + (i === 0 ? " sel" : "");
    s.style.background = c;
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

function canDraw() { return meta && meta.currentDrawer === ME && meta.state === "drawing"; }

function pos(e) {
  const r = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
  const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
  return { x: cx / r.width, y: cy / r.height }; // normalized 0..1
}

function startDraw(e) {
  if (!canDraw()) return;
  e.preventDefault();
  drawing.active = true;
  drawing.last = pos(e);
}
function moveDraw(e) {
  if (!drawing.active || !canDraw()) return;
  e.preventDefault();
  const p = pos(e);
  const seg = {
    type: "line",
    x0: drawing.last.x, y0: drawing.last.y, x1: p.x, y1: p.y,
    color: drawing.color, size: drawing.size,
  };
  push(ref(db, `rooms/${ROOM}/strokes`), seg); // broadcast; everyone (incl. me) renders it
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
  // clear canvas when a new turn starts (detected via drawer+round change)
  const key = `${meta?.round}:${meta?.currentDrawer}`;
  if (key !== lastDrawerKey) { ctx.clearRect(0, 0, canvas.width, canvas.height); lastDrawerKey = key; }

  if (s.type === "clear") { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
  if (s.type !== "line") return;
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(s.x0 * canvas.width, s.y0 * canvas.height);
  ctx.lineTo(s.x1 * canvas.width, s.y1 * canvas.height);
  ctx.stroke();
}

// also clear canvas immediately on turn change (in case no strokes arrive yet)
let watchKey = "";
setInterval(() => {
  if (!meta) return;
  const key = `${meta.round}:${meta.currentDrawer}:${meta.state}`;
  if (key !== watchKey) {
    watchKey = key;
    if (meta.state === "drawing") { ctx.clearRect(0, 0, canvas.width, canvas.height); lastDrawerKey = ""; }
  }
}, 300);

// ---------------------------------------------------------------------------
// deep-link: ?room=CODE prefills the join box
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
if (params.get("room")) $("join-code").value = params.get("room").toUpperCase();
