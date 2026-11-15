// =====================================================================
// TRICK TALK — card tables (live games at video tables + Teach me)
// © 2026 Parallel Construction LLC. All rights reserved.
// =====================================================================
import * as G from "./games.js?v=1";

const FN = "tt-game";
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TT = () => window.TT || {};
const RED = { H: 1, D: 1 };
const SYM = G.SUIT_SYM;

/* ------------------------------- styles ------------------------------- */
const css = `
.gm { --cw: 54px; --ch: 78px; display: grid; gap: 12px; }
.gm.big { --cw: 70px; --ch: 100px; }
.gm-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.gm-head h3 { margin: 0; font: 800 20px/1.1 var(--display); }
.gm-head .sub { color: var(--muted); font-size: 13px; }
.gm-tools { display: flex; gap: 6px; flex-wrap: wrap; }
.gm-tools .btn { padding: 6px 10px; font-size: 13px; }
.gm-board { position: relative; border-radius: 22px; padding: 14px; background: radial-gradient(ellipse at center, #14503b 0%, var(--felt) 70%);
  border: 10px solid var(--rail); box-shadow: inset 0 0 40px rgba(0,0,0,.45), 0 0 0 2px var(--rail-edge); display: grid; gap: 10px; min-width: 0; }
.gm-seats { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 8px; }
.gm-seat { background: rgba(0,0,0,.28); border: 2px solid transparent; border-radius: 10px; padding: 7px 9px; min-width: 0; font-size: 13px; display: grid; gap: 3px; }
.gm-seat.turn { border-color: var(--brass); box-shadow: 0 0 0 3px rgba(201,162,74,.25); }
.gm-seat.me { background: rgba(201,162,74,.12); }
.gm-seat .nm { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gm-seat .st { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.gm-seat .team { font: 600 10px var(--body); letter-spacing: .08em; text-transform: uppercase; color: var(--brass); }
.gm-center { min-height: calc(var(--ch) + 30px); display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; align-items: center; text-align: center; }
.gm-center .lbl { width: 100%; color: var(--muted); font-size: 13px; }
.gm-hand { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; padding-top: 6px; }
.gm-row { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; align-items: flex-end; }
.card { width: var(--cw); height: var(--ch); border-radius: 7px; background: #fbf8f0; color: #1b1a17; border: 1px solid #cdbf9f;
  display: inline-grid; grid-template-rows: auto 1fr; padding: 4px 5px; font: 700 calc(var(--cw) * .32)/1 var(--body); position: relative; user-select: none;
  box-shadow: 0 2px 4px rgba(0,0,0,.35); flex: none; transition: transform .12s ease, box-shadow .12s ease; }
.card .r { text-align: left; } .card .s { font-size: calc(var(--cw) * .55); align-self: center; justify-self: center; line-height: 1; }
.card.red { color: #b9262f; } .card.joker { color: #6b2fa3; } .card.joker .s { font-size: calc(var(--cw) * .42); }
.card.back { background: repeating-linear-gradient(45deg, #7b1c25 0 6px, #8f2530 6px 12px); border-color: #4e1117; }
.card.sm { --cw: 34px; --ch: 48px; }
.card.btn-card { cursor: pointer; } .card.dim { opacity: .45; filter: grayscale(.35); }
.card.sel { transform: translateY(-12px); box-shadow: 0 0 0 3px var(--brass), 0 6px 12px rgba(0,0,0,.4); }
.card.hint { box-shadow: 0 0 0 3px #5fbf8a, 0 0 16px rgba(95,191,138,.7); }
.card.wild-tag::after { content: "wild"; position: absolute; right: 3px; bottom: 2px; font: 700 9px var(--body); color: #6b2fa3; }
.card.up-tag::after { content: "up"; position: absolute; right: 3px; bottom: 2px; font: 600 9px var(--body); color: #6a655a; }
.gm-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; align-items: center; }
.gm-actions .btn { min-height: 44px; padding: 9px 16px; font-size: 15px; }
.gm-actions .btn.hintbtn { outline: 3px solid #5fbf8a; outline-offset: 1px; }
.gm-actions input[type=range] { width: min(260px, 70vw); }
.gm-err { color: #f3b3b7; text-align: center; min-height: 1.2em; font-size: 14px; }
.coach { background: var(--card); color: var(--ink); border-radius: 12px; padding: 12px 14px; display: grid; gap: 8px; font-size: 15px; line-height: 1.45; }
.coach h4 { margin: 0; font: 800 15px/1.2 var(--display); display: flex; align-items: center; gap: 8px; }
.coach .why { color: #4f4b42; font-size: 14px; border-left: 3px solid #5fbf8a; padding-left: 10px; }
.coach .btn { color: var(--ink); border-color: #cfc7b3; padding: 6px 12px; }
.coach .btn.primary { background: var(--felt); color: var(--card); border-color: var(--felt); }
.gm-log { font-size: 12px; color: var(--muted); display: grid; gap: 2px; max-height: 92px; overflow-y: auto; }
.gm-result { background: var(--card); color: var(--ink); border-radius: 12px; padding: 14px 16px; display: grid; gap: 6px; text-align: center; }
.gm-result h4 { margin: 0; font: 800 22px/1.2 var(--display); }
.gm-result div { font-size: 14px; }
.gm-result .btn.primary { background: var(--felt); color: var(--card); border-color: var(--felt); justify-self: center; margin-top: 6px; }
.melds { display: grid; gap: 6px; width: 100%; }
.melds .team-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: center; }
.melds .tname { font: 600 11px var(--body); letter-spacing: .08em; text-transform: uppercase; color: var(--brass); width: 100%; }
.meld-chip { background: rgba(0,0,0,.3); border: 1px solid var(--line); border-radius: 8px; padding: 4px 8px; font-size: 13px; cursor: default; }
.meld-chip.canasta { border-color: var(--brass); background: rgba(201,162,74,.18); }
.meld-chip.pick { cursor: pointer; border-style: dashed; }
.chip-row { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.chip { width: 48px; height: 48px; border-radius: 50%; border: 4px dashed rgba(255,255,255,.55); display: grid; place-items: center; font: 700 13px var(--body); cursor: pointer; color: #fff; }
.chip.c10 { background: #2b6cb0; } .chip.c25 { background: #2f855a; } .chip.c50 { background: #b7791f; } .chip.c100 { background: #1a1a1a; }
.gm-pick { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
.gm-pick button { text-align: left; background: var(--card); color: var(--ink); border: 0; border-radius: 10px; padding: 12px 14px; cursor: pointer; display: grid; gap: 4px; }
.gm-pick button strong { font: 800 17px/1.2 var(--display); }
.gm-pick button span { font-size: 13px; color: #5b574d; }
.gm-pick button:hover { outline: 2px solid var(--brass); }
.gm-lobby { display: grid; gap: 10px; }
.gm-lobby .seatlist { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.gm-lobby .seatbox { background: rgba(0,0,0,.28); border-radius: 10px; padding: 10px; display: grid; gap: 6px; }
.rules-box { background: var(--card); color: var(--ink); border-radius: 12px; padding: 12px 16px; }
.rules-box ul { margin: 6px 0 0; padding-left: 1.2em; } .rules-box li { margin: 3px 0; }
.rules-box .btn { color: var(--ink); border-color: #cfc7b3; }
.teach-overlay { position: fixed; inset: 0; z-index: 35; background: var(--felt-deep); overflow-y: auto;
  padding: max(12px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) 24px max(16px, env(safe-area-inset-left, 0px)); }
.teach-overlay .inner { max-width: 1000px; margin: 0 auto; display: grid; gap: 12px; }
.room.gaming .seats { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
.room.gaming .felt { min-height: 0; padding: 8px; border-width: 6px; }
.stake { font: 600 12px var(--body); color: var(--brass); }
@media (max-width: 520px) { .gm { --cw: 42px; --ch: 62px; } .gm.big { --cw: 54px; --ch: 78px; } .gm-board { padding: 8px; border-width: 6px; } }
@media (prefers-reduced-motion: reduce) { .card { transition: none; } }
`;
document.head.append(Object.assign(document.createElement("style"), { textContent: css }));

/* ----------------------------- card drawing ----------------------------- */
function cardEl(c, opts = {}) {
  const d = el("div", "card" + (opts.sm ? " sm" : ""));
  if (!c || c.hidden) { d.classList.add("back"); d.setAttribute("aria-label", "face-down card"); return d; }
  if (c.r === "W") { d.classList.add("joker"); d.append(el("span", "r", "JK"), el("span", "s", "★")); d.setAttribute("aria-label", "Joker"); return d; }
  if (RED[c.s]) d.classList.add("red");
  d.append(el("span", "r", c.r), el("span", "s", SYM[c.s]));
  d.setAttribute("aria-label", G.cardLabel(c));
  if (c.up) d.classList.add("up-tag");
  if (opts.wild) d.classList.add("wild-tag");
  return d;
}
const row = (cards, sm) => { const r = el("div", "gm-row"); cards.forEach((c) => r.append(cardEl(c, { sm }))); return r; };
const btn = (label, cls, fn) => { const b = el("button", "btn " + (cls || ""), label); b.type = "button"; b.onclick = fn; return b; };
let bigCards = false; try { bigCards = localStorage.getItem("tt-big-cards") === "1"; } catch (_) {}

/* ======================================================================
   Controller: one instance for a live table, one for Teach me practice
   ====================================================================== */
class Controller {
  constructor(root, mode) { this.root = root; this.mode = mode; this.sel = []; this.groups = []; this.coachOn = mode === "practice"; this.err = ""; this.busy = false; this.showRules = mode === "practice"; this.flash = null; }
  get v() { return this.view; }
  async send(action) {
    const err = this.view ? G.validate(this.view, action) : null;
    if (err && action.type !== "next") { this.err = err; this.render(); return; }
    this.err = ""; this.sel = []; this.groups = [];
    try { await this.doAct(action); } catch (e) { this.err = e.message || String(e); this.render(); }
  }
  async doAct() {}
  render() {
    const v = this.view; const r = this.root; r.replaceChildren();
    if (!v) return;
    const g = G.GAMES[v.game];
    const wrap = el("div", "gm" + (bigCards ? " big" : ""));
    // header
    const head = el("div", "gm-head"); const ht = el("div");
    ht.append(el("h3", null, g.name), el("div", "sub", this.statusLine(v)));
    const tools = el("div", "gm-tools");
    tools.append(btn(this.coachOn ? "Coach: on" : "Coach: off", this.coachOn ? "on" : "", () => { this.coachOn = !this.coachOn; this.render(); }));
    tools.append(btn("How to play", "", () => { this.showRules = !this.showRules; this.render(); }));
    tools.append(btn(bigCards ? "Normal cards" : "Bigger cards", "", () => { bigCards = !bigCards; try { localStorage.setItem("tt-big-cards", bigCards ? "1" : "0"); } catch (_) {} this.render(); }));
    if (this.extraTools) this.extraTools(tools);
    head.append(ht, tools); wrap.append(head);
    if (this.showRules) {
      const rb = el("div", "rules-box"); rb.append(el("strong", null, `How to play ${g.name}`));
      const ul = el("ul"); g.rules.forEach((x) => ul.append(el("li", null, x))); rb.append(ul);
      rb.append(btn("Got it", "", () => { this.showRules = false; this.render(); })); wrap.append(rb);
    }
    // coach
    const coach = this.coachOn && v.me >= 0 ? G.coach(v) : null;
    this.hint = coach && coach.suggest ? coach.suggest : null;
    // board
    const board = el("div", "gm-board");
    board.append(this.seatsEl(v));
    const center = el("div", "gm-center"); this.centerEl(v, center); board.append(center);
    if (v.me >= 0) board.append(this.handEl(v));
    wrap.append(board);
    const errEl = el("div", "gm-err", this.err); wrap.append(errEl);
    if (v.phase === "scored" || v.phase === "over") wrap.append(this.resultEl(v));
    else if (v.me >= 0) wrap.append(this.actionsEl(v));
    if (coach && coach.say) {
      const c = el("div", "coach"); const h = el("h4"); h.append(el("span", null, "♠ Coach")); c.append(h, el("div", null, coach.say));
      if (coach.why) { const w = el("div", "why", "Suggested: " + this.describe(v, coach.suggest) + ". " + coach.why); c.append(w); }
      if (coach.suggest && (v.phase !== "scored")) c.append(btn("Do the suggested move", "primary", () => this.send(coach.suggest)));
      wrap.append(c);
    }
    const log = el("div", "gm-log"); (v.log || []).slice(-6).forEach((x) => log.append(el("div", null, x))); wrap.append(log);
    r.append(wrap);
  }
  describe(v, a) {
    if (!a) return "";
    switch (a.type) {
      case "play": case "discard": return `${a.type} ${G.cardLabel((v.hand || []).find((c) => c.id === a.id))}`;
      case "pass": return v.game === "hearts" ? "pass " + a.ids.map((id) => G.cardLabel(v.hand.find((c) => c.id === id))).join(", ") : "pass";
      case "bid": return v.game === "spades" ? `bid ${a.n === 0 ? "nil" : a.n}` : `bid ${a.amount}`;
      case "trump": return `name ${G.SUIT_NAME[a.suit]} trump`;
      case "meld": return "meld " + a.groups.map((g) => g.ids.map((id) => G.cardLabel(v.hand.find((c) => c.id === id))).join(" ")).join(" + ");
      case "take": return "take the pile";
      case "raise": return `raise to ${a.to}`;
      default: return a.type;
    }
  }
  statusLine(v) {
    const g = G.GAMES[v.game];
    if (v.phase === "over") return "Game over";
    if (g.teams && v.scores) return `Score: ${v.players[0]} & ${v.players[2]} ${v.scores[0]} · ${v.players[1]} & ${v.players[3]} ${v.scores[1]}`;
    if (v.scores) return "Score: " + v.players.map((p, i) => `${p} ${v.scores[i]}`).join(" · ");
    if (v.stacks) return `Hand ${v.handNo + 1} · your chips: ${v.me >= 0 ? v.stacks[v.me] : "—"}`;
    return "";
  }
  seatsEl(v) {
    const box = el("div", "gm-seats"); const g = G.GAMES[v.game];
    const order = []; for (let k = 1; k <= v.n; k++) order.push(((v.me >= 0 ? v.me : 0) + k) % v.n);
    for (const p of order) {
      const s = el("div", "gm-seat" + ((v.toAct || []).includes(p) && v.phase !== "scored" ? " turn" : "") + (p === v.me ? " me" : ""));
      if (g.teams) s.append(el("div", "team", p % 2 === (v.me >= 0 ? v.me % 2 : 0) ? "Your team" : "Opponents"));
      s.append(el("div", "nm", (p === v.me ? "You" : v.players[p]) + (v.bots[p] ? " · bot" : "")));
      s.append(el("div", "st", this.seatStatus(v, p)));
      if (v.game === "holdem" || v.game === "omaha" || v.game === "stud") { if (p !== v.me && v.cards && v.cards[p]) s.append(row(v.cards[p], true)); }
      if (v.game === "blackjack" && p !== v.me && v.hands && v.hands[p]) for (const h of v.hands[p]) s.append(row(h.cards, true), el("div", "st", `${G.bjTotal(h.cards).total} · bet ${h.bet}`));
      box.append(s);
    }
    return box;
  }
  seatStatus(v, p) {
    switch (v.game) {
      case "hearts": return `${v.counts[p]} cards · ${v.taken[p]} pts this hand`;
      case "spades": return `bid ${v.bids[p] === null ? "—" : v.bids[p] === 0 ? "nil" : v.bids[p]} · took ${v.tricks[p]}`;
      case "pinochle": {
        const parts = [`${v.counts[p]} cards`];
        if (v.phase === "bid" || v.bidLog[p] !== null) parts.push(v.bidLog[p] === "pass" ? "passed" : v.bidLog[p] ? `bid ${v.bidLog[p]}` : "");
        if (v.melds) parts.push(`meld ${v.melds[p].total}`);
        if (v.bidder === p && v.trump) parts.push("won bid");
        return parts.filter(Boolean).join(" · ");
      }
      case "canasta": return `${v.counts[p]} cards`;
      case "blackjack": return `${v.stacks[p]} chips${v.bets[p] !== null && v.phase === "bet" ? ` · bet ${v.bets[p]}` : ""}`;
      default: return `${v.stacks[p]} chips${v.bets[p] ? ` · in ${v.bets[p]}` : ""}${v.folded[p] ? " · folded" : ""}${v.allIn[p] ? " · all in" : ""}${v.dealer === p && v.game !== "stud" ? " · dealer" : ""}`;
    }
  }
  centerEl(v, c) {
    const fam = G.GAMES[v.game].family;
    if (fam === "trick") {
      if (v.game === "pinochle" && v.trump) c.append(el("div", "lbl", `Trump: ${SYM[v.trump]} ${G.SUIT_NAME[v.trump]} · bid ${v.bid} by ${v.bidder === v.me ? "you" : v.players[v.bidder]} · counters ${v.counters[v.me % 2]} us / ${v.counters[1 - (v.me % 2)]} them`));
      if (v.game === "spades") c.append(el("div", "lbl", "Spades are trump" + (v.spadesBroken ? " · broken" : "")));
      if (v.game === "hearts") c.append(el("div", "lbl", v.phase === "pass" ? `Pass 3 cards ${v.passDirName} · ${v.passedCount}/4 ready` : (v.heartsBroken ? "Hearts broken" : "Hearts not broken yet")));
      const showLast = !v.trick.length && v.lastTrick && this.flash === v.lastTrick;
      const tr = showLast ? v.lastTrick.cards : v.trick;
      for (const t of tr) { const box = el("div"); box.append(cardEl(t.card), el("div", "lbl", t.seat === v.me ? "you" : v.players[t.seat])); c.append(box); }
      if (showLast) c.append(el("div", "lbl", `${v.lastTrick.winner === v.me ? "You" : v.players[v.lastTrick.winner]} took the trick`));
      if (!tr.length) c.append(el("div", "lbl", v.phase === "play" ? ((v.turn === v.me) ? "Your lead." : `${v.players[v.turn]} leads.`) : ""));
      if (v.game === "pinochle" && v.melds && v.phase === "play" && v.counts[0] === 12) {
        const m = el("div", "melds");
        v.melds.forEach((md, p) => { if (!md.total) return; const rr = el("div", "team-row"); rr.append(el("span", "tname", `${p === v.me ? "Your" : v.players[p] + "'s"} meld: ${md.total} (${md.items.map((x) => x[0]).join(", ")})`)); rr.append(row(md.cards, true)); m.append(rr); });
        c.append(m);
      }
      return;
    }
    if (v.game === "canasta") {
      const pile = el("div"); pile.append(cardEl({ hidden: true }), el("div", "lbl", `Stock ${v.stockCount}`));
      const top = el("div"); top.append(v.pileTop ? cardEl(v.pileTop) : el("div", "lbl", "empty"), el("div", "lbl", `Pile ${v.pileSize}${v.pileFrozen ? " · frozen" : ""}`));
      c.append(pile, top);
      const m = el("div", "melds");
      for (const t of [v.myTeam, 1 - v.myTeam]) {
        const rr = el("div", "team-row"); rr.append(el("span", "tname", `${t === v.myTeam ? "Your team" : "Opponents"} · red 3s: ${v.red3[t].length}`));
        if (!v.melds[t].length) rr.append(el("span", "lbl", "No melds yet"));
        for (const md of v.melds[t]) {
          const wild = md.cards.filter(G.isWild).length; const chip = el("span", "meld-chip" + (md.cards.length >= 7 ? " canasta" : ""), `${md.rank === "3" ? "3" : md.rank} ×${md.cards.length}${wild ? ` (${wild} wild)` : ""}${md.cards.length >= 7 ? (wild ? " mixed canasta" : " natural canasta") : ""}`);
          if (t === v.myTeam && this.sel.length && this.sel.every((id) => G.isWild(v.hand.find((x) => x.id === id)))) { chip.classList.add("pick"); chip.title = "Add the selected wild cards here"; chip.onclick = () => { this.groups.push({ ids: this.sel.slice(), rank: md.rank }); this.sel = []; this.render(); }; }
          rr.append(chip);
        }
        m.append(rr);
      }
      c.append(m);
      if (this.groups.length) c.append(el("div", "lbl", "Ready to lay down: " + this.groups.map((g) => g.ids.map((id) => G.cardLabel(v.hand.find((x) => x.id === id))).join(" ")).join("  |  ")));
      return;
    }
    if (v.game === "blackjack") {
      const d = el("div"); d.append(row(v.dealerCards), el("div", "lbl", `Dealer${v.dealerTotal ? ` shows ${v.dealerTotal}` : ""}`)); c.append(d);
      return;
    }
    // poker
    if (v.game !== "stud") { c.append(v.board.length ? row(v.board) : el("div", "lbl", "No cards on the table yet")); }
    c.append(el("div", "lbl", `Pot ${v.pot || v.potWon || 0}${v.currentBet ? ` · current bet ${v.currentBet}` : ""}`));
  }
  handEl(v) {
    const h = el("div", "gm-hand");
    let cards = v.hand || [];
    if (v.cards) cards = v.cards[v.me] || [];
    if (v.game === "blackjack") { const hs = v.hands[v.me] || []; hs.forEach((x, i) => { const box = el("div"); box.append(row(x.cards), el("div", "stake", `${G.bjTotal(x.cards).total}${hs.length > 1 && i === v.active && v.turn === v.me ? " · playing" : ""} · bet ${x.bet}`)); h.append(box); }); return h; }
    const allowed = G.legalCards(v);
    const used = new Set(this.groups.flatMap((g) => g.ids));
    const hintIds = new Set(this.hint ? (this.hint.id != null ? [this.hint.id] : this.hint.ids || (this.hint.groups ? this.hint.groups.flatMap((g) => g.ids) : [])) : []);
    for (const c of cards) {
      if (used.has(c.id)) continue;
      const d = cardEl(c, { wild: v.game === "canasta" && c.r === "2" }); d.classList.add("btn-card"); d.tabIndex = 0;
      if (allowed && allowed.length && !allowed.includes(c.id)) d.classList.add("dim");
      if (this.sel.includes(c.id)) d.classList.add("sel");
      if (hintIds.has(c.id)) d.classList.add("hint");
      const pick = () => this.tapCard(v, c);
      d.onclick = pick; d.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } };
      h.append(d);
    }
    if (v.cards && v.myBest) { const box = el("div", "lbl"); box.textContent = `You have: ${v.myBest}`; h.append(box); }
    return h;
  }
  tapCard(v, c) {
    this.err = "";
    const single = (v.phase === "play" && G.GAMES[v.game].family === "trick");
    if (single) {
      if (this.sel[0] === c.id) return this.send({ type: "play", id: c.id });
      this.sel = [c.id]; return this.render();
    }
    if (G.GAMES[v.game].family === "poker") return;
    const i = this.sel.indexOf(c.id); if (i >= 0) this.sel.splice(i, 1); else this.sel.push(c.id);
    if (v.game === "hearts" && this.sel.length > 3) this.sel.shift();
    this.render();
  }
  actionsEl(v) {
    const a = el("div", "gm-actions"); const hint = this.hint; const mine = (v.toAct || []).includes(v.me);
    const isHint = (x) => hint && JSON.stringify(hint) === JSON.stringify(x);
    const add = (label, action, cls) => { const b = btn(label, (cls || "") + (isHint(action) ? " hintbtn" : ""), () => this.send(action)); a.append(b); return b; };
    if (!mine) { a.append(el("div", "lbl", v.turn != null && v.turn >= 0 ? `Waiting for ${v.players[v.turn]}…` : "Waiting for the others…")); return a; }
    switch (v.game) {
      case "hearts":
        if (v.phase === "pass") { const b = add(`Pass ${this.sel.length}/3 ${v.passDirName}`, { type: "pass", ids: this.sel.slice() }, "primary"); b.disabled = this.sel.length !== 3; a.append(el("div", "lbl", "Tap 3 cards to pass.")); }
        else this.playBtn(a, v);
        break;
      case "spades":
        if (v.phase === "bid") { for (let n = 0; n <= 13; n++) add(n === 0 ? "Nil" : String(n), { type: "bid", n }); }
        else this.playBtn(a, v);
        break;
      case "pinochle":
        if (v.phase === "bid") {
          this.bidAmt = Math.max(this.bidAmt || 0, v.minBid);
          const amt = el("strong", null, String(this.bidAmt));
          a.append(btn("−10", "", () => { this.bidAmt = Math.max(v.minBid, this.bidAmt - 10); this.render(); }), amt, btn("+10", "", () => { this.bidAmt += 10; this.render(); }));
          add(`Bid ${this.bidAmt}`, { type: "bid", amount: this.bidAmt }, "primary"); add("Pass", { type: "pass" });
          a.append(el("div", "lbl", "Your meld if trump were: " + ["S", "H", "D", "C"].map((s) => `${SYM[s]} ${v.myMeldBySuit[s]}`).join("  ")));
        } else if (v.phase === "trump") { for (const s of ["S", "H", "D", "C"]) add(`${SYM[s]} ${G.SUIT_NAME[s]} (meld ${v.myMeldBySuit[s]})`, { type: "trump", suit: s }); }
        else this.playBtn(a, v);
        break;
      case "canasta":
        if (v.phase === "draw") {
          add("Draw a card", { type: "draw" }, "primary");
          const tk = { type: "take", ids: this.sel.slice() }; if (!v.teamMelded && this.groups.length) tk.extra = this.groups.slice();
          add(this.sel.length ? `Take the pile with ${this.sel.length} card${this.sel.length > 1 ? "s" : ""}` : "Take the pile", tk);
          a.append(el("div", "lbl", "To take the pile, tap the cards from your hand that match the top card first."));
        } else {
          if (this.sel.length) a.append(btn("Set aside as a meld", "", () => { this.groups.push({ ids: this.sel.slice() }); this.sel = []; this.render(); }));
          const groups = this.groups.concat(this.sel.length ? [{ ids: this.sel.slice() }] : []);
          if (groups.length) add(`Lay down ${groups.length > 1 ? groups.length + " melds" : "meld"}`, { type: "meld", groups }, "primary");
          if (this.groups.length) a.append(btn("Undo", "", () => { this.groups = []; this.render(); }));
          if (this.sel.length === 1) add("Discard this card", { type: "discard", id: this.sel[0] });
          if (!this.sel.length && !this.groups.length) a.append(el("div", "lbl", "Tap cards to meld them, or tap one card to discard and end your turn. To add wild cards to a meld, tap them, then tap the meld."));
        }
        break;
      case "blackjack":
        if (v.phase === "bet") {
          const chips = el("div", "chip-row");
          for (const amt of [10, 25, 50, 100]) { const ch = el("div", `chip c${amt}`, String(amt)); ch.tabIndex = 0; ch.setAttribute("role", "button"); ch.onclick = () => this.send({ type: "bet", amount: amt }); if (isHint({ type: "bet", amount: amt })) ch.style.outline = "3px solid #5fbf8a"; chips.append(ch); }
          a.append(el("div", "lbl", "Tap a chip to bet:"), chips);
        } else {
          add("Hit", { type: "hit" }, "primary"); add("Stand", { type: "stand" });
          const h = v.hands[v.me][v.active];
          if (h && h.cards.length === 2 && v.stacks[v.me] >= h.bet) add("Double", { type: "double" });
          if (h && h.cards.length === 2 && v.hands[v.me].length === 1 && G.bjTotal([h.cards[0]]).total === G.bjTotal([h.cards[1]]).total && v.stacks[v.me] >= h.bet) add("Split", { type: "split" });
        }
        break;
      default: {
        add("Fold", { type: "fold" });
        if (v.toCall) add(`Call ${v.toCall}`, { type: "call" }, "primary"); else add("Check", { type: "check" }, "primary");
        if (v.canRaise && v.maxTo > v.currentBet) {
          this.raiseTo = Math.min(v.maxTo, Math.max(v.minTo, this.raiseTo || v.minTo));
          if (v.minTo < v.maxTo) {
            const rng = el("input"); rng.type = "range"; rng.min = v.minTo; rng.max = v.maxTo; rng.step = 5; rng.value = this.raiseTo; rng.setAttribute("aria-label", "Raise amount");
            const lab = el("strong", null, String(this.raiseTo)); rng.oninput = () => { this.raiseTo = +rng.value; lab.textContent = rng.value; };
            a.append(rng, lab);
          }
          a.append(btn(v.currentBet ? "Raise" : "Bet", hint && hint.type === "raise" ? "hintbtn" : "", () => this.send({ type: "raise", to: v.minTo === v.maxTo ? v.maxTo : this.raiseTo })));
          if (v.minTo < v.maxTo) add(`All in (${v.maxTo})`, { type: "raise", to: v.maxTo });
        }
      }
    }
    return a;
  }
  playBtn(a, v) {
    if (v.phase !== "play") return;
    const b = btn(this.sel.length ? `Play ${G.cardLabel(v.hand.find((c) => c.id === this.sel[0]))}` : "Tap a card, then tap it again to play", "primary", () => this.sel.length && this.send({ type: "play", id: this.sel[0] }));
    b.disabled = !this.sel.length; a.append(b);
  }
  resultEl(v) {
    const r = el("div", "gm-result"); const res = v.result || { title: "Hand over", lines: [] };
    r.append(el("h4", null, res.title)); (res.lines || []).forEach((x) => r.append(el("div", null, x)));
    if (v.phase === "scored" && v.me >= 0) r.append(btn("Next hand", "primary", () => this.send({ type: "next" })));
    if (v.phase === "over" && this.onGameOver) this.onGameOver(r);
    return r;
  }
}

/* ============================ Teach me (local) ============================ */
class Practice extends Controller {
  constructor(root, gameId, name) {
    super(root, "practice");
    const g = G.GAMES[gameId]; const n = g.min === g.max ? g.max : Math.min(g.max, 4);
    const bots = ["Ace", "Duke", "Lady", "Jack", "Ten"];
    this.state = G.newGame(gameId, Array.from({ length: n }, (_, i) => (i === 0 ? { name: name || "You", bot: false } : { name: `Bot ${bots[i - 1]}`, bot: true })));
    this.refresh(); this.render(); this.botLoop();
  }
  refresh() { this.view = G.view(this.state, 0); }
  async doAct(action) {
    G.act(this.state, 0, action); this.refresh(); this.render(); await this.botLoop();
  }
  async botLoop() {
    if (this.running) return; this.running = true;
    try {
      while (!this.state.over && this.state.phase !== "scored") {
        const seats = G.toAct(this.state).filter((p) => this.state.players[p].bot);
        if (!seats.length || G.toAct(this.state).includes(0) && this.state.phase !== "pass" && this.state.phase !== "bet") break;
        if (!seats.length) break;
        const before = this.state.lastTrick;
        await sleep(this.state.phase === "pass" || this.state.phase === "bet" ? 150 : 650);
        const p = seats[0]; G.act(this.state, p, G.bot(G.view(this.state, p)));
        this.refresh();
        if (this.state.lastTrick && this.state.lastTrick !== before) { this.flash = this.view.lastTrick; this.render(); await sleep(1100); this.flash = null; }
        this.render();
      }
    } finally { this.running = false; this.render(); }
  }
  extraTools(tools) { tools.append(btn("Leave practice", "", () => closeTeach())); }
}

let teachCtl = null;
function closeTeach() { const o = $("teach-overlay"); if (o) o.remove(); teachCtl = null; }
export function openTeach() {
  closeTeach();
  const o = el("div", "teach-overlay"); o.id = "teach-overlay";
  const inner = el("div", "inner"); o.append(inner);
  const head = el("div", "gm-head"); const t = el("div");
  t.append(el("h3", null, "Teach me"), el("div", "sub", "Practice against friendly bots. A coach explains every step and only you can see it."));
  head.append(t, btn("Close", "", closeTeach)); inner.append(head);
  const pick = el("div", "gm-pick");
  for (const g of G.GAME_LIST) {
    const b = el("button"); b.type = "button"; b.append(el("strong", null, g.name), el("span", null, g.blurb));
    b.onclick = () => { pick.remove(); const area = el("div"); inner.append(area); const nm = (TT().myName && TT().myName()) || "You"; teachCtl = new Practice(area, g.id, nm); };
    pick.append(b);
  }
  inner.append(pick);
  document.body.append(o);
}

/* ============================ Live table games ============================ */
class Live extends Controller {
  constructor(root, table) { super(root, "live"); this.table = table; this.game = null; }
  async call(body) {
    const { data, error } = await TT().sb.functions.invoke(FN, { body });
    if (error) { let msg = error.message; try { msg = (await error.context.json()).error || msg; } catch (_) {} throw new Error(msg); }
    return data;
  }
  async load() {
    const { data } = await TT().sb.from("tt_games").select("*").eq("table_id", this.table.id).neq("status", "ended").order("created_at", { ascending: false }).limit(1);
    const g = data && data[0];
    if (!g) { this.game = null; this.view = null; return this.renderIdle(); }
    if (g.status === "lobby") { this.game = g; this.view = null; return this.renderLobby(); }
    const res = await this.call({ op: "view", gameId: g.id }).catch((e) => { this.err = e.message; return null; });
    if (res) this.apply(res);
  }
  apply(res) {
    this.game = res.game;
    if (res.game.status === "lobby") { this.view = null; return this.renderLobby(); }
    if (res.game.status === "ended" || !res.view) { this.view = null; return this.load(); }
    const prev = this.view; this.view = res.view;
    if (prev && res.view.lastTrick && (!prev.lastTrick || JSON.stringify(prev.lastTrick) !== JSON.stringify(res.view.lastTrick)) && !res.view.trick.length) {
      this.flash = res.view.lastTrick; setTimeout(() => { if (this.flash === res.view.lastTrick) { this.flash = null; this.render(); } }, 1800);
    }
    document.querySelector(".room")?.classList.add("gaming");
    this.render();
  }
  async doAct(action) { this.apply(await this.call({ op: "act", gameId: this.game.id, action })); }
  extraTools(tools) {
    tools.append(btn("Leave game", "", async () => { try { await this.call({ op: "leave", gameId: this.game.id }); } catch (e) { this.err = e.message; } this.load(); }));
    const myId = TT().me && TT().me().id;
    if (this.game && (this.game.host_id === myId || TT().isAdmin?.())) tools.append(btn("End game", "danger", async () => { await this.call({ op: "end", gameId: this.game.id }).catch(() => {}); this.load(); }));
  }
  renderIdle() {
    document.querySelector(".room")?.classList.remove("gaming");
    const r = this.root; r.replaceChildren();
    const head = el("div", "gm-head"); const t = el("div");
    t.append(el("h3", null, "Play cards at this table"), el("div", "sub", "Pick a game. Everyone at the table can take a seat; bots fill the rest."));
    head.append(t); r.append(head);
    if (this.err) r.append(el("div", "gm-err", this.err));
    const pick = el("div", "gm-pick");
    for (const g of G.GAME_LIST) {
      const b = el("button"); b.type = "button"; b.append(el("strong", null, g.name), el("span", null, g.blurb));
      b.onclick = async () => { try { this.err = ""; this.apply(await this.call({ op: "create", tableId: this.table.id, game: g.id })); } catch (e) { this.err = e.message; this.renderIdle(); } };
      pick.append(b);
    }
    r.append(pick);
  }
  renderLobby() {
    document.querySelector(".room")?.classList.remove("gaming");
    const g = this.game; const spec = G.GAMES[g.game]; const r = this.root; r.replaceChildren();
    const myId = TT().me().id; const isHost = g.host_id === myId || TT().isAdmin?.();
    const box = el("div", "gm-lobby");
    const head = el("div", "gm-head"); const t = el("div");
    t.append(el("h3", null, `${spec.name}: take your seats`), el("div", "sub", spec.teams ? "Partners sit across from each other: seats 1 & 3 are a team, 2 & 4 are a team." : spec.blurb));
    head.append(t); box.append(head);
    if (this.err) box.append(el("div", "gm-err", this.err));
    const list = el("div", "seatlist");
    g.seats.forEach((x, i) => {
      const sb = el("div", "seatbox"); sb.append(el("strong", null, `Seat ${i + 1}${spec.teams ? (i % 2 ? " · Team B" : " · Team A") : ""}`));
      if (x) { sb.append(el("div", null, x.user_id === myId ? "You" : x.name)); if (x.user_id === myId) sb.append(btn("Stand up", "", () => this.lobbyOp({ op: "stand", gameId: g.id }))); }
      else { sb.append(el("div", "st", "Open (a bot plays if empty)")); sb.append(btn("Sit here", "", () => this.lobbyOp({ op: "sit", gameId: g.id, seat: i }))); }
      list.append(sb);
    });
    box.append(list);
    const acts = el("div", "gm-actions");
    if (isHost) {
      let players = spec.min === spec.max ? spec.max : Math.max(spec.min, Math.min(spec.max, Math.max(4, g.seats.filter(Boolean).length)));
      if (spec.min !== spec.max) {
        const lab = el("span", null, `Players: ${players}`);
        acts.append(btn("−", "", () => { players = Math.max(spec.min, players - 1); lab.textContent = `Players: ${players}`; }), lab, btn("+", "", () => { players = Math.min(spec.max, players + 1); lab.textContent = `Players: ${players}`; }));
      }
      acts.append(btn("Deal the cards", "primary", () => this.lobbyOp({ op: "start", gameId: g.id, players })));
      acts.append(btn("Cancel", "", () => this.lobbyOp({ op: "end", gameId: g.id })));
    } else acts.append(el("div", "lbl", "Waiting for the host to deal…"));
    box.append(acts);
    r.append(box);
  }
  async lobbyOp(body) { try { this.err = ""; const res = await this.call(body); if (res.game.status === "ended") return this.load(); this.apply(res); } catch (e) { this.err = e.message; this.renderLobby(); } }
}

let live = null, channel = null;
export async function enterTable(table) {
  exitTable();
  const area = $("game-area"); if (!area) return;
  area.hidden = false; live = new Live(area, table);
  live.onGameOver = (r) => r.append(btn("Deal another game", "primary", async () => { await live.call({ op: "end", gameId: live.game.id }).catch(() => {}); live.load(); }));
  channel = TT().sb.channel("games-" + table.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "tt_games", filter: "table_id=eq." + table.id }, () => { if (live && !live.busy) live.load(); })
    .subscribe();
  await live.load();
}
export function exitTable() {
  if (channel) { TT().sb.removeChannel(channel); channel = null; }
  live = null; const area = $("game-area"); if (area) { area.replaceChildren(); area.hidden = true; }
  document.querySelector(".room")?.classList.remove("gaming");
}
window.TTGames = { enterTable, exitTable, openTeach };
window.dispatchEvent(new Event("ttgames-ready"));
