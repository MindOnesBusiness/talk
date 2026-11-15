// =====================================================================
// TRICK TALK — card game engine
// © 2026 Parallel Construction LLC. All rights reserved.
//
// One rules engine for every game. It runs in two places:
//   • on the server (Supabase Edge Function) for live tables, where it
//     deals, keeps every hand secret and checks each move;
//   • in the browser for "Teach me" practice hands against bots.
//
// Each game provides: init, view (what one seat may see), validate
// (checks a move using only that seat's view), apply, toAct (who may
// move now), next (start the next hand), bot (a move from a view) and
// coach (a hint + explanation from a view).
// =====================================================================

export const ENGINE_VERSION = 1;

/* ---------------------------- helpers ---------------------------- */
export const SUIT_SYM = { S: "♠", H: "♥", D: "♦", C: "♣", "*": "★" };
export const SUIT_NAME = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
const SUITS = ["S", "H", "D", "C"];
const STD_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const STD_VAL = Object.fromEntries(STD_RANKS.map((r, i) => [r, i + 2]));

function rand() {
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0] / 4294967296;
  }
  return Math.random();
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function makeDeck({ ranks = STD_RANKS, suits = SUITS, copies = 1, jokers = 0 } = {}) {
  const d = []; let id = 0;
  for (let c = 0; c < copies; c++) for (const s of suits) for (const r of ranks) d.push({ id: id++, r, s });
  for (let j = 0; j < jokers; j++) d.push({ id: id++, r: "W", s: "*" });
  return shuffle(d);
}
export function cardLabel(c) { return c ? (c.r === "W" ? "Joker" : c.r + SUIT_SYM[c.s]) : "?"; }
const clone = (o) => JSON.parse(JSON.stringify(o));
const nextSeat = (s, n, k = 1) => (s + k) % n;
function addLog(s, text) { s.log.push(text); if (s.log.length > 40) s.log.splice(0, s.log.length - 40); }
function takeIds(hand, ids) {
  const out = [];
  for (const id of ids) { const i = hand.findIndex((c) => c.id === id); if (i < 0) throw new Error("That card isn't in your hand."); out.push(hand.splice(i, 1)[0]); }
  return out;
}
const hasIds = (hand, ids) => new Set(ids).size === ids.length && ids.every((id) => hand.some((c) => c.id === id));
const byId = (hand, id) => hand.find((c) => c.id === id);
function sortHand(hand, suitOrder, rankVal) {
  return hand.sort((a, b) => (suitOrder.indexOf(a.s) - suitOrder.indexOf(b.s)) || (rankVal[b.r] - rankVal[a.r]) || (a.id - b.id));
}
const teamOf = (seat) => seat % 2;
const names = (s) => s.players.map((p) => p.name);
function baseView(s, seat) {
  return {
    game: s.game, me: seat, n: s.n, players: names(s), bots: s.players.map((p) => !!p.bot),
    phase: s.phase, turn: s.turn, toAct: toActOf(s), log: s.log.slice(-12), handNo: s.handNo,
    dealer: s.dealer, over: !!s.over, result: s.result || null,
  };
}
function toActOf(s) { return GAMES[s.game].toAct(s); }

/* ======================= trick-taking helpers ====================== */
function trickWinner(trick, ledSuit, trump, val) {
  let best = trick[0];
  for (const t of trick.slice(1)) {
    const c = t.card, b = best.card;
    if (c.s === b.s) { if (val[c.r] > val[b.r]) best = t; }
    else if (trump && c.s === trump && b.s !== trump) best = t;
  }
  return best.seat;
}

/* =============================== HEARTS =============================== */
const PASS_DIRS = ["left", "right", "across", "none"];
const hearts = {
  id: "hearts", name: "Hearts", seats: 4, min: 4, max: 4, family: "trick",
  blurb: "Avoid hearts and the Queen of Spades. Lowest score wins.",
  init(players) {
    const s = { game: "hearts", n: 4, players, dealer: 0, handNo: 0, scores: [0, 0, 0, 0], log: [], version: 0 };
    hearts.deal(s); return s;
  },
  deal(s) {
    const d = makeDeck(); s.hands = [0, 1, 2, 3].map((i) => sortHand(d.slice(i * 13, i * 13 + 13), ["C", "D", "S", "H"], STD_VAL));
    s.passDir = s.handNo % 4; s.passed = [null, null, null, null];
    s.trick = []; s.taken = [0, 0, 0, 0]; s.heartsBroken = false; s.firstTrick = true; s.lastTrick = null; s.result = null;
    if (s.passDir === 3) hearts.startPlay(s); else { s.phase = "pass"; s.turn = null; addLog(s, `Hand ${s.handNo + 1}: pass 3 cards ${PASS_DIRS[s.passDir]}.`); }
  },
  startPlay(s) {
    s.phase = "play";
    s.turn = s.hands.findIndex((h) => h.some((c) => c.r === "2" && c.s === "C"));
    s.leader = s.turn; addLog(s, `${s.players[s.turn].name} leads the 2♣.`);
  },
  toAct(s) {
    if (s.over) return [];
    if (s.phase === "pass") return [0, 1, 2, 3].filter((i) => !s.passed[i]);
    if (s.phase === "play") return [s.turn];
    if (s.phase === "scored") return [0, 1, 2, 3];
    return [];
  },
  allowed(v) {
    const hand = v.hand, trick = v.trick;
    if (v.phase !== "play" || v.turn !== v.me) return [];
    if (!trick.length) {
      if (v.firstTrick) return hand.filter((c) => c.r === "2" && c.s === "C").map((c) => c.id);
      const nonH = hand.filter((c) => c.s !== "H");
      return (v.heartsBroken || !nonH.length ? hand : nonH).map((c) => c.id);
    }
    const led = trick[0].card.s; const follow = hand.filter((c) => c.s === led);
    if (follow.length) return follow.map((c) => c.id);
    if (v.firstTrick) { const safe = hand.filter((c) => c.s !== "H" && !(c.s === "S" && c.r === "Q")); if (safe.length) return safe.map((c) => c.id); }
    return hand.map((c) => c.id);
  },
  view(s, seat) {
    return { ...baseView(s, seat), hand: s.hands[seat] || [], counts: s.hands.map((h) => h.length), trick: s.trick,
      leader: s.leader, heartsBroken: s.heartsBroken, firstTrick: s.firstTrick, taken: s.taken, scores: s.scores,
      passDir: s.passDir, passDirName: PASS_DIRS[s.passDir], iPassed: !!s.passed[seat], passedCount: s.passed.filter(Boolean).length,
      lastTrick: s.lastTrick };
  },
  validate(v, a) {
    if (a.type === "pass") {
      if (v.phase !== "pass") return "It isn't time to pass cards.";
      if (v.iPassed) return "You already passed.";
      if (!Array.isArray(a.ids) || a.ids.length !== 3) return "Pick exactly 3 cards to pass.";
      if (!hasIds(v.hand, a.ids)) return "Pick 3 different cards from your hand.";
      return null;
    }
    if (a.type === "play") {
      if (v.phase !== "play") return "It isn't time to play a card.";
      if (v.turn !== v.me) return "It's not your turn.";
      if (!byId(v.hand, a.id)) return "That card isn't in your hand.";
      if (!hearts.allowed(v).includes(a.id)) {
        if (!v.trick.length && v.firstTrick) return "The first trick must start with the 2♣.";
        if (!v.trick.length) return "Hearts haven't been broken yet. Lead another suit.";
        const led = v.trick[0].card.s;
        if (v.hand.some((c) => c.s === led)) return `You have to follow suit: play a ${SUIT_NAME[led].slice(0, -1)}.`;
        return "No hearts or Q♠ on the first trick unless you have nothing else.";
      }
      return null;
    }
    return "That move isn't part of Hearts.";
  },
  apply(s, seat, a) {
    if (a.type === "pass") {
      s.passed[seat] = a.ids.slice();
      if (s.passed.every(Boolean)) {
        const moved = [0, 1, 2, 3].map((i) => takeIds(s.hands[i], s.passed[i]));
        const shift = [1, 3, 2][s.passDir];
        moved.forEach((cards, i) => s.hands[(i + shift) % 4].push(...cards));
        s.hands.forEach((h) => sortHand(h, ["C", "D", "S", "H"], STD_VAL));
        addLog(s, "Cards passed."); hearts.startPlay(s);
      }
      return;
    }
    const [card] = takeIds(s.hands[seat], [a.id]);
    s.trick.push({ seat, card });
    if (card.s === "H" && !s.heartsBroken) { s.heartsBroken = true; addLog(s, "Hearts are broken."); }
    if (s.trick.length < 4) { s.turn = nextSeat(seat, 4); return; }
    const led = s.trick[0].card.s; const w = trickWinner(s.trick, led, null, STD_VAL);
    const pts = s.trick.reduce((t, x) => t + (x.card.s === "H" ? 1 : 0) + (x.card.s === "S" && x.card.r === "Q" ? 13 : 0), 0);
    s.taken[w] += pts; s.lastTrick = { cards: s.trick, winner: w };
    addLog(s, `${s.players[w].name} takes the trick${pts ? ` (+${pts})` : ""}.`);
    s.trick = []; s.leader = s.turn = w; s.firstTrick = false;
    if (s.hands[0].length === 0) hearts.score(s);
  },
  score(s) {
    const moon = s.taken.findIndex((t) => t === 26);
    if (moon >= 0) { s.scores = s.scores.map((x, i) => x + (i === moon ? 0 : 26)); addLog(s, `${s.players[moon].name} shot the moon! Everyone else +26.`); }
    else s.scores = s.scores.map((x, i) => x + s.taken[i]);
    s.result = { title: moon >= 0 ? `${s.players[moon].name} shot the moon` : "Hand over", lines: s.players.map((p, i) => `${p.name}: +${moon >= 0 ? (i === moon ? 0 : 26) : s.taken[i]} (total ${s.scores[i]})`) };
    s.turn = null;
    if (Math.max(...s.scores) >= 100) {
      const low = Math.min(...s.scores); const w = s.scores.indexOf(low);
      s.over = true; s.phase = "over"; s.result.title = `${s.players[w].name} wins with ${low}!`; addLog(s, s.result.title);
    } else s.phase = "scored";
  },
  next(s) { s.handNo++; s.dealer = nextSeat(s.dealer, 4); hearts.deal(s); },
  bot(v) {
    if (v.phase === "pass") {
      const danger = (c) => (c.s === "S" && ["Q", "K", "A"].includes(c.r) ? 40 + STD_VAL[c.r] : 0) + (c.s === "H" ? 20 + STD_VAL[c.r] : 0) + STD_VAL[c.r];
      return { type: "pass", ids: v.hand.slice().sort((a, b) => danger(b) - danger(a)).slice(0, 3).map((c) => c.id) };
    }
    if (v.phase === "scored") return { type: "next" };
    const ok = hearts.allowed(v).map((id) => byId(v.hand, id));
    const val = (c) => STD_VAL[c.r];
    if (!v.trick.length) { const sorted = ok.slice().sort((a, b) => (a.s === "H") - (b.s === "H") || val(a) - val(b)); return { type: "play", id: sorted[0].id }; }
    const led = v.trick[0].card.s;
    const winCard = v.trick.find((t) => t.seat === trickWinner(v.trick, led, null, STD_VAL)).card;
    if (ok[0].s === led) {
      const under = ok.filter((c) => val(c) < val(winCard.r === winCard.r ? winCard : winCard)).sort((a, b) => val(b) - val(a));
      if (under.length) return { type: "play", id: under[0].id };
      const pts = v.trick.some((t) => t.card.s === "H" || (t.card.s === "S" && t.card.r === "Q"));
      const sorted = ok.slice().sort((a, b) => val(a) - val(b));
      if (v.trick.length === 3 && !pts) return { type: "play", id: sorted[sorted.length - 1].id };
      return { type: "play", id: sorted[0].id };
    }
    const qs = ok.find((c) => c.s === "S" && c.r === "Q"); if (qs) return { type: "play", id: qs.id };
    const sorted = ok.slice().sort((a, b) => (b.s === "H") - (a.s === "H") || val(b) - val(a));
    return { type: "play", id: sorted[0].id };
  },
  coach(v) {
    if (v.phase === "pass") {
      if (v.iPassed) return { say: "Waiting for everyone else to pass." };
      const sug = hearts.bot(v);
      return { say: `Pick 3 cards to pass ${v.passDirName}. Tap them, then tap Pass.`, suggest: sug,
        why: "Passing away the Q♠, the A♠ and K♠ (which can catch the queen), and high hearts keeps points out of your hand." };
    }
    if (v.phase === "play") {
      if (v.turn !== v.me) return { say: `Waiting for ${v.players[v.turn]}.` };
      const sug = hearts.bot(v); const c = byId(v.hand, sug.id);
      let say;
      if (!v.trick.length) say = v.firstTrick ? "You hold the 2♣, so you lead it to start." : (v.heartsBroken ? "You lead. Any card is allowed." : "You lead. You can't lead hearts until a heart has been played.");
      else { const led = v.trick[0].card.s; say = v.hand.some((c) => c.s === led) ? `You must follow suit with a ${SUIT_NAME[led].slice(0, -1)}. Your allowed cards are lit up.` : `You have no ${SUIT_NAME[led]}, so you can throw any card. This is your chance to dump points on someone else.`; }
      return { say, suggest: sug, why: `${cardLabel(c)}: ${v.trick.length ? "playing under the winning card keeps you from taking the trick, and dumping high cards when you're out of a suit gets rid of danger." : "leading low cards makes someone else take the trick."}` };
    }
    if (v.phase === "scored") return { say: "Hand over. Each heart is 1 point and the Q♠ is 13. Lowest score wins at 100." };
    return { say: "" };
  },
  rules: [
    "4 players, 13 cards each. Low score wins. The game ends when someone reaches 100.",
    "Before each hand, pass 3 cards: left, right, across, then no pass.",
    "The 2♣ leads first. Follow suit if you can. Highest card of the suit led takes the trick.",
    "Each heart you take is 1 point. The Q♠ is 13. You can't lead hearts until one is played.",
    "Take all 26 points and you 'shoot the moon': everyone else gets 26 instead.",
  ],
};

/* =============================== SPADES =============================== */
const spades = {
  id: "spades", name: "Spades", seats: 4, min: 4, max: 4, family: "trick", teams: true,
  blurb: "Partners bid how many tricks they'll take. Spades are always trump.",
  init(players) {
    const s = { game: "spades", n: 4, players, dealer: 0, handNo: 0, scores: [0, 0], bags: [0, 0], log: [], version: 0 };
    spades.deal(s); return s;
  },
  deal(s) {
    const d = makeDeck(); s.hands = [0, 1, 2, 3].map((i) => sortHand(d.slice(i * 13, i * 13 + 13), ["S", "H", "C", "D"], STD_VAL));
    s.bids = [null, null, null, null]; s.tricks = [0, 0, 0, 0]; s.trick = []; s.spadesBroken = false; s.lastTrick = null; s.result = null;
    s.phase = "bid"; s.turn = nextSeat(s.dealer, 4); addLog(s, `Hand ${s.handNo + 1}: bidding starts with ${s.players[s.turn].name}.`);
  },
  toAct(s) { if (s.over) return []; if (s.phase === "scored") return [0, 1, 2, 3]; return s.phase === "bid" || s.phase === "play" ? [s.turn] : []; },
  allowed(v) {
    if (v.phase !== "play" || v.turn !== v.me) return [];
    const hand = v.hand;
    if (!v.trick.length) { const non = hand.filter((c) => c.s !== "S"); return (v.spadesBroken || !non.length ? hand : non).map((c) => c.id); }
    const led = v.trick[0].card.s; const f = hand.filter((c) => c.s === led);
    return (f.length ? f : hand).map((c) => c.id);
  },
  view(s, seat) {
    return { ...baseView(s, seat), hand: s.hands[seat] || [], counts: s.hands.map((h) => h.length), trick: s.trick, bids: s.bids,
      tricks: s.tricks, scores: s.scores, bags: s.bags, spadesBroken: s.spadesBroken, lastTrick: s.lastTrick, trump: "S" };
  },
  validate(v, a) {
    if (a.type === "bid") {
      if (v.phase !== "bid") return "Bidding is over."; if (v.turn !== v.me) return "It's not your turn to bid.";
      if (!Number.isInteger(a.n) || a.n < 0 || a.n > 13) return "Bid between 0 (nil) and 13."; return null;
    }
    if (a.type === "play") {
      if (v.phase !== "play") return "It isn't time to play."; if (v.turn !== v.me) return "It's not your turn.";
      if (!byId(v.hand, a.id)) return "That card isn't in your hand.";
      if (!spades.allowed(v).includes(a.id)) {
        if (!v.trick.length) return "Spades haven't been broken yet. Lead another suit.";
        return `You have to follow suit: play a ${SUIT_NAME[v.trick[0].card.s].slice(0, -1)}.`;
      }
      return null;
    }
    return "That move isn't part of Spades.";
  },
  apply(s, seat, a) {
    if (a.type === "bid") {
      s.bids[seat] = a.n; addLog(s, `${s.players[seat].name} bids ${a.n === 0 ? "nil" : a.n}.`);
      if (s.bids.every((b) => b !== null)) { s.phase = "play"; s.turn = nextSeat(s.dealer, 4); }
      else s.turn = nextSeat(seat, 4);
      return;
    }
    const [card] = takeIds(s.hands[seat], [a.id]); s.trick.push({ seat, card });
    if (card.s === "S" && !s.spadesBroken) { s.spadesBroken = true; addLog(s, "Spades are broken."); }
    if (s.trick.length < 4) { s.turn = nextSeat(seat, 4); return; }
    const w = trickWinner(s.trick, s.trick[0].card.s, "S", STD_VAL);
    s.tricks[w]++; s.lastTrick = { cards: s.trick, winner: w }; s.trick = []; s.turn = w;
    addLog(s, `${s.players[w].name} takes the trick.`);
    if (!s.hands[0].length) spades.score(s);
  },
  score(s) {
    const lines = [];
    for (const t of [0, 1]) {
      const seats = [t, t + 2]; let pts = 0; const nm = `${s.players[t].name} & ${s.players[t + 2].name}`;
      let contract = 0, got = 0;
      for (const p of seats) {
        if (s.bids[p] === 0) { if (s.tricks[p] === 0) { pts += 100; lines.push(`${s.players[p].name} made nil: +100`); } else { pts -= 100; lines.push(`${s.players[p].name} broke nil: −100`); s.bags[t] += s.tricks[p]; } }
        else { contract += s.bids[p]; got += s.tricks[p]; }
      }
      if (contract > 0) {
        if (got >= contract) { const over = got - contract; pts += contract * 10 + over; s.bags[t] += over; lines.push(`${nm}: bid ${contract}, took ${got}: +${contract * 10 + over}`); }
        else { pts -= contract * 10; lines.push(`${nm}: bid ${contract}, took ${got}: −${contract * 10}`); }
      }
      if (s.bags[t] >= 10) { pts -= 100; s.bags[t] -= 10; lines.push(`${nm}: 10 bags, −100`); }
      s.scores[t] += pts;
    }
    s.result = { title: "Hand over", lines: [...lines, `Score: ${s.scores[0]} to ${s.scores[1]}`] }; s.turn = null;
    const done = s.scores.some((x) => x >= 500 || x <= -200);
    if (done && s.scores[0] !== s.scores[1]) {
      const w = s.scores[0] > s.scores[1] ? 0 : 1; s.over = true; s.phase = "over";
      s.result.title = `${s.players[w].name} & ${s.players[w + 2].name} win!`; addLog(s, s.result.title);
    } else s.phase = "scored";
  },
  next(s) { s.handNo++; s.dealer = nextSeat(s.dealer, 4); spades.deal(s); },
  estimate(hand) {
    let t = 0; const bySuit = (su) => hand.filter((c) => c.s === su);
    const sp = bySuit("S");
    for (const c of sp) if (["A", "K", "Q"].includes(c.r)) t += c.r === "Q" && sp.length < 3 ? 0.5 : 1;
    t += Math.max(0, sp.length - 3) * 0.8;
    for (const su of ["H", "D", "C"]) {
      const cs = bySuit(su);
      if (cs.some((c) => c.r === "A")) t += 1;
      if (cs.some((c) => c.r === "K") && cs.length >= 2) t += 0.7;
      if (sp.length >= 3 && cs.length === 0) t += 1; else if (sp.length >= 3 && cs.length === 1) t += 0.5;
    }
    return Math.max(1, Math.min(13, Math.round(t)));
  },
  bot(v) {
    if (v.phase === "scored") return { type: "next" };
    if (v.phase === "bid") return { type: "bid", n: spades.estimate(v.hand) };
    const ok = spades.allowed(v).map((id) => byId(v.hand, id)); const val = (c) => STD_VAL[c.r];
    const low = (arr) => arr.slice().sort((a, b) => (a.s === "S") - (b.s === "S") || val(a) - val(b))[0];
    if (!v.trick.length) {
      const aces = ok.filter((c) => c.r === "A" && c.s !== "S"); if (aces.length) return { type: "play", id: aces[0].id };
      return { type: "play", id: low(ok).id };
    }
    const led = v.trick[0].card.s; const ws = trickWinner(v.trick, led, "S", STD_VAL); const wc = v.trick.find((t) => t.seat === ws).card;
    const partnerWinning = teamOf(ws) === teamOf(v.me);
    const beats = (c) => (c.s === wc.s ? val(c) > val(wc) : c.s === "S" && wc.s !== "S");
    if (partnerWinning) return { type: "play", id: low(ok).id };
    const winners = ok.filter(beats).sort((a, b) => (a.s === "S") - (b.s === "S") || val(a) - val(b));
    if (winners.length) return { type: "play", id: winners[0].id };
    return { type: "play", id: low(ok).id };
  },
  coach(v) {
    if (v.phase === "bid") {
      if (v.turn !== v.me) return { say: `Waiting for ${v.players[v.turn]} to bid.` };
      const n = spades.estimate(v.hand);
      return { say: "Bid how many tricks you think you'll take. Your bid and your partner's are added together.", suggest: { type: "bid", n },
        why: `Count about 1 trick for each ace, high spades (A, K, Q), and extra spades past 3. Short suits help too, because you can trump them. That comes to about ${n}.` };
    }
    if (v.phase === "play") {
      if (v.turn !== v.me) return { say: `Waiting for ${v.players[v.turn]}.` };
      const sug = spades.bot(v); const c = byId(v.hand, sug.id);
      let say = !v.trick.length ? (v.spadesBroken ? "You lead. Any card is allowed." : "You lead. You can't lead spades until a spade has been played.")
        : (v.hand.some((x) => x.s === v.trick[0].card.s) ? "Follow suit if you can. Your allowed cards are lit up." : "You're out of that suit, so you can trump with a spade or throw anything.");
      const need = (v.bids[v.me] || 0) + (v.bids[(v.me + 2) % 4] || 0); const have = v.tricks[v.me] + v.tricks[(v.me + 2) % 4];
      return { say: `${say} Your team bid ${need} and has ${have}.`, suggest: sug, why: `${cardLabel(c)}: ${v.trick.length ? "win cheaply when the other team is winning, or play low when your partner already has it." : "lead winners first, then low cards."}` };
    }
    if (v.phase === "scored") return { say: "Hand over. Making your bid scores 10 per trick. Every extra trick is a 'bag', and 10 bags cost 100 points." };
    return { say: "" };
  },
  rules: [
    "4 players in 2 teams. Partners sit across. 13 cards each.",
    "Everyone bids how many tricks they'll take. Partners' bids add up. A bid of 0 is 'nil' (+100 if you take none).",
    "Follow suit if you can. Spades always trump. You can't lead spades until one is played.",
    "Make your team bid for 10 points per trick, plus 1 per extra trick. Miss it and lose 10 per trick bid.",
    "Every 10 extra tricks (bags) costs 100. First team to 500 wins.",
  ],
};

/* ============================== PINOCHLE ============================== */
const PN_RANKS = ["9", "J", "Q", "K", "10", "A"];
const PN_VAL = { "9": 0, J: 1, Q: 2, K: 3, "10": 4, A: 5 };
function pinochleMeld(hand, trump) {
  const cnt = (r, s) => hand.filter((c) => c.r === r && c.s === s).length;
  const items = [];
  if (trump) {
    const runs = Math.min(...["A", "10", "K", "Q", "J"].map((r) => cnt(r, trump)));
    if (runs === 2) items.push(["Double run", 1500]); else if (runs === 1) items.push(["Run in trump", 150]);
    const royals = Math.min(cnt("K", trump), cnt("Q", trump)) - runs;
    for (let i = 0; i < royals; i++) items.push(["Royal marriage", 40]);
    for (let i = 0; i < cnt("9", trump); i++) items.push([`Dix (9${SUIT_SYM[trump]})`, 10]);
  }
  for (const su of SUITS) if (su !== trump) { const m = Math.min(cnt("K", su), cnt("Q", su)); for (let i = 0; i < m; i++) items.push([`Marriage in ${SUIT_NAME[su]}`, 20]); }
  const around = [["A", "Aces", 100, 1000], ["K", "Kings", 80, 800], ["Q", "Queens", 60, 600], ["J", "Jacks", 40, 400]];
  for (const [r, nm, one, two] of around) { const m = Math.min(...SUITS.map((su) => cnt(r, su))); if (m === 2) items.push([`Double ${nm.toLowerCase()} around`, two]); else if (m === 1) items.push([`${nm} around`, one]); }
  const pin = Math.min(cnt("Q", "S"), cnt("J", "D")); if (pin === 2) items.push(["Double pinochle", 300]); else if (pin === 1) items.push(["Pinochle", 40]);
  return { items, total: items.reduce((t, x) => t + x[1], 0) };
}
function pinochleAllowed(hand, trick, trump) {
  if (!trick.length) return hand.map((c) => c.id);
  const led = trick[0].card.s; const ws = trickWinner(trick, led, trump, PN_VAL); const w = trick.find((t) => t.seat === ws).card;
  const follow = hand.filter((c) => c.s === led);
  if (follow.length) {
    if (w.s !== led) return follow.map((c) => c.id); // trick already trumped: just follow
    const beat = follow.filter((c) => PN_VAL[c.r] > PN_VAL[w.r]); return (beat.length ? beat : follow).map((c) => c.id);
  }
  const tr = hand.filter((c) => c.s === trump);
  if (tr.length) {
    if (w.s === trump) { const beat = tr.filter((c) => PN_VAL[c.r] > PN_VAL[w.r]); return (beat.length ? beat : tr).map((c) => c.id); }
    return tr.map((c) => c.id);
  }
  return hand.map((c) => c.id);
}
const pinochle = {
  id: "pinochle", name: "Pinochle", seats: 4, min: 4, max: 4, family: "trick", teams: true,
  blurb: "Bid, name trump, show your meld, then take tricks with your partner. First team to 1500.",
  init(players) {
    const s = { game: "pinochle", n: 4, players, dealer: 0, handNo: 0, scores: [0, 0], log: [], version: 0 };
    pinochle.deal(s); return s;
  },
  deal(s) {
    const d = makeDeck({ ranks: PN_RANKS, copies: 2 });
    s.hands = [0, 1, 2, 3].map((i) => sortHand(d.slice(i * 12, i * 12 + 12), ["S", "H", "C", "D"], PN_VAL));
    s.bid = null; s.bidder = null; s.passed = [false, false, false, false]; s.bidLog = [null, null, null, null];
    s.trump = null; s.melds = null; s.trick = []; s.counters = [0, 0]; s.tricksWon = [0, 0]; s.lastTrick = null; s.result = null;
    s.phase = "bid"; s.turn = nextSeat(s.dealer, 4); addLog(s, `Hand ${s.handNo + 1}: bidding opens at 250 with ${s.players[s.turn].name}.`);
  },
  toAct(s) { if (s.over) return []; if (s.phase === "scored") return [0, 1, 2, 3]; return ["bid", "trump", "play"].includes(s.phase) ? [s.turn] : []; },
  view(s, seat) {
    return { ...baseView(s, seat), hand: s.hands[seat] || [], counts: s.hands.map((h) => h.length), trick: s.trick, bid: s.bid, bidder: s.bidder,
      passed: s.passed, bidLog: s.bidLog, trump: s.trump, melds: s.melds, counters: s.counters, tricksWon: s.tricksWon, scores: s.scores,
      lastTrick: s.lastTrick, minBid: s.bid ? s.bid + 10 : 250,
      myMeldBySuit: Object.fromEntries(SUITS.map((su) => [su, pinochleMeld(s.hands[seat] || [], su).total])) };
  },
  allowed(v) { return v.phase === "play" && v.turn === v.me ? pinochleAllowed(v.hand, v.trick, v.trump) : []; },
  validate(v, a) {
    if (a.type === "bid" || a.type === "pass") {
      if (v.phase !== "bid") return "Bidding is over."; if (v.turn !== v.me) return "It's not your turn to bid.";
      if (a.type === "bid" && (!Number.isInteger(a.amount) || a.amount < v.minBid || a.amount % 10)) return `Bid at least ${v.minBid}, in steps of 10.`;
      return null;
    }
    if (a.type === "trump") { if (v.phase !== "trump" || v.turn !== v.me) return "You don't get to name trump."; if (!SUITS.includes(a.suit)) return "Pick a suit."; return null; }
    if (a.type === "play") {
      if (v.phase !== "play") return "It isn't time to play."; if (v.turn !== v.me) return "It's not your turn.";
      if (!byId(v.hand, a.id)) return "That card isn't in your hand.";
      if (!pinochle.allowed(v).includes(a.id)) {
        const led = v.trick[0].card.s;
        if (v.hand.some((c) => c.s === led)) return "You must follow suit and beat the winning card if you can.";
        return `You're out of ${SUIT_NAME[led]}, so you must play trump (${SUIT_NAME[v.trump]}), and beat any trump already played if you can.`;
      }
      return null;
    }
    return "That move isn't part of Pinochle.";
  },
  apply(s, seat, a) {
    if (a.type === "bid" || a.type === "pass") {
      if (a.type === "bid") { s.bid = a.amount; s.bidder = seat; s.bidLog[seat] = a.amount; addLog(s, `${s.players[seat].name} bids ${a.amount}.`); }
      else { s.passed[seat] = true; s.bidLog[seat] = "pass"; addLog(s, `${s.players[seat].name} passes.`); }
      const left = [0, 1, 2, 3].filter((i) => !s.passed[i]);
      if (left.length === 1 && (s.bidder === left[0] || s.bidder === null)) {
        if (s.bidder === null) { s.bidder = left[0]; s.bid = 250; addLog(s, `${s.players[left[0]].name} is stuck with the bid at 250.`); }
        s.phase = "trump"; s.turn = s.bidder; return;
      }
      if (left.length === 0) { s.bidder = s.dealer; s.bid = 250; s.phase = "trump"; s.turn = s.dealer; addLog(s, `Everyone passed. ${s.players[s.dealer].name} takes it at 250.`); return; }
      let t = nextSeat(seat, 4); while (s.passed[t]) t = nextSeat(t, 4); s.turn = t; return;
    }
    if (a.type === "trump") {
      s.trump = a.suit; addLog(s, `${s.players[seat].name} names ${SUIT_NAME[a.suit]} trump (bid ${s.bid}).`);
      s.melds = s.hands.map((h) => { const m = pinochleMeld(h, a.suit); return { ...m, cards: pinochleMeldCards(h, a.suit) }; });
      s.melds.forEach((m, i) => { if (m.total) addLog(s, `${s.players[i].name} melds ${m.total}.`); });
      s.phase = "play"; s.turn = s.bidder; return;
    }
    const [card] = takeIds(s.hands[seat], [a.id]); s.trick.push({ seat, card });
    if (s.trick.length < 4) { s.turn = nextSeat(seat, 4); return; }
    const w = trickWinner(s.trick, s.trick[0].card.s, s.trump, PN_VAL);
    const pts = s.trick.filter((t) => ["A", "10", "K"].includes(t.card.r)).length * 10;
    s.counters[teamOf(w)] += pts; s.tricksWon[teamOf(w)]++;
    s.lastTrick = { cards: s.trick, winner: w }; s.trick = []; s.turn = w;
    addLog(s, `${s.players[w].name} takes the trick${pts ? ` (${pts})` : ""}.`);
    if (!s.hands[0].length) { s.counters[teamOf(w)] += 10; addLog(s, `${s.players[w].name} gets 10 for the last trick.`); pinochle.score(s); }
  },
  score(s) {
    const lines = []; const bt = teamOf(s.bidder);
    for (const t of [0, 1]) {
      const meld = s.melds[t].total + s.melds[t + 2].total; const tookTrick = s.tricksWon[t] > 0;
      const total = (tookTrick ? meld : 0) + s.counters[t]; const nm = `${s.players[t].name} & ${s.players[t + 2].name}`;
      if (t === bt) {
        if (total >= s.bid) { s.scores[t] += total; lines.push(`${nm} made their ${s.bid} bid: meld ${meld} + tricks ${s.counters[t]} = +${total}`); }
        else { s.scores[t] -= s.bid; lines.push(`${nm} went set: needed ${s.bid}, got ${total}. −${s.bid}`); }
      } else { s.scores[t] += total; lines.push(`${nm}: meld ${tookTrick ? meld : 0}${tookTrick ? "" : " (no trick, meld lost)"} + tricks ${s.counters[t]} = +${total}`); }
    }
    s.result = { title: "Hand over", lines: [...lines, `Score: ${s.scores[0]} to ${s.scores[1]}`] }; s.turn = null;
    const reached = [0, 1].filter((t) => s.scores[t] >= 1500);
    if (reached.length) {
      const w = reached.length === 2 ? bt : reached[0]; s.over = true; s.phase = "over";
      s.result.title = `${s.players[w].name} & ${s.players[w + 2].name} win!`; addLog(s, s.result.title);
    } else s.phase = "scored";
  },
  next(s) { s.handNo++; s.dealer = nextSeat(s.dealer, 4); pinochle.deal(s); },
  strength(hand) {
    let best = { su: "S", val: -1 };
    for (const su of SUITS) {
      const m = pinochleMeld(hand, su).total; const tr = hand.filter((c) => c.s === su).length;
      const aces = hand.filter((c) => c.r === "A").length;
      const val = m + tr * 15 + aces * 10;
      if (val > best.val) best = { su, val, meld: m };
    }
    return best;
  },
  bot(v) {
    if (v.phase === "scored") return { type: "next" };
    if (v.phase === "bid") {
      const st = pinochle.strength(v.hand); const max = Math.floor((st.val + 150) / 10) * 10;
      return v.minBid <= max ? { type: "bid", amount: v.minBid } : { type: "pass" };
    }
    if (v.phase === "trump") return { type: "trump", suit: pinochle.strength(v.hand).su };
    const ok = pinochle.allowed(v).map((id) => byId(v.hand, id)); const val = (c) => PN_VAL[c.r];
    const counter = (c) => ["A", "10", "K"].includes(c.r);
    if (!v.trick.length) {
      const aces = ok.filter((c) => c.r === "A" && c.s !== v.trump); if (aces.length) return { type: "play", id: aces[0].id };
      const non = ok.filter((c) => c.s !== v.trump && !counter(c)).sort((a, b) => val(a) - val(b)); if (non.length) return { type: "play", id: non[0].id };
      return { type: "play", id: ok.slice().sort((a, b) => val(a) - val(b))[0].id };
    }
    const ws = trickWinner(v.trick, v.trick[0].card.s, v.trump, PN_VAL); const wc = v.trick.find((t) => t.seat === ws).card;
    const beats = (c) => (c.s === wc.s ? val(c) > val(wc) : c.s === v.trump && wc.s !== v.trump);
    if (teamOf(ws) === teamOf(v.me) && (wc.r === "A" || wc.s === v.trump || v.trick.length === 3)) {
      const give = ok.filter((c) => counter(c) && c.r !== "A").sort((a, b) => val(b) - val(a));
      if (give.length) return { type: "play", id: give[0].id };
    }
    const win = ok.filter(beats).sort((a, b) => val(a) - val(b));
    if (win.length && teamOf(ws) !== teamOf(v.me)) return { type: "play", id: win[0].id };
    const junk = ok.filter((c) => !counter(c)).sort((a, b) => val(a) - val(b));
    return { type: "play", id: (junk[0] || ok.slice().sort((a, b) => val(a) - val(b))[0]).id };
  },
  coach(v) {
    if (v.phase === "bid") {
      if (v.turn !== v.me) return { say: `Waiting for ${v.players[v.turn]} to bid.` };
      const st = pinochle.strength(v.hand); const sug = pinochle.bot(v);
      const meldLine = SUITS.map((su) => `${SUIT_SYM[su]} ${v.myMeldBySuit[su]}`).join(", ");
      return { say: `Bid what your team can make: your meld plus the points you'll win in tricks (A, 10, K are 10 each, 250 in all). Your meld if trump were … ${meldLine}.`,
        suggest: sug, why: sug.type === "pass" ? `Your best suit is ${SUIT_NAME[st.su]}, but the bid is already higher than your hand can safely carry.` : `${SUIT_NAME[st.su][0].toUpperCase() + SUIT_NAME[st.su].slice(1)} looks like your best trump: ${st.meld} meld and ${v.hand.filter((c) => c.s === st.su).length} cards. Partners usually add some meld and you'll win counters, so ${v.minBid} is a fair bid.` };
    }
    if (v.phase === "trump") {
      if (v.turn !== v.me) return { say: `${v.players[v.turn]} is choosing trump.` };
      const st = pinochle.strength(v.hand);
      return { say: "You won the bid. Name trump: pick the suit where you have the most meld and the most cards.", suggest: { type: "trump", suit: st.su }, why: `${SUIT_NAME[st.su]} gives you ${st.meld} meld and the longest trump suit.` };
    }
    if (v.phase === "play") {
      if (v.turn !== v.me) return { say: `Waiting for ${v.players[v.turn]}.` };
      const sug = pinochle.bot(v); const c = byId(v.hand, sug.id); const myT = teamOf(v.me);
      const need = myT === teamOf(v.bidder) ? ` Your team needs ${Math.max(0, v.bid - (v.melds[myT].total + v.melds[myT + 2].total) - v.counters[myT])} more points from tricks to make the bid.` : "";
      const say = !v.trick.length ? "You lead. Leading aces in side suits usually wins the trick." : "Follow suit and beat the winning card if you can. If you're out of the suit, you must trump. Your allowed cards are lit up.";
      return { say: say + need, suggest: sug, why: `${cardLabel(c)}: ${!v.trick.length ? "aces win tricks safely before anyone runs out of the suit." : "give points (10s, kings) when your partner is winning; otherwise win cheaply or throw a non-counter."}` };
    }
    if (v.phase === "scored") return { say: "Hand over. Meld only counts if your team takes at least one trick. If the bidders fall short, they lose their whole bid." };
    return { say: "" };
  },
  rules: [
    "4 players in 2 teams, partners across. 48 cards (9 through ace, two of each). 12 cards each.",
    "Card order: A, 10, K, Q, J, 9. Aces, 10s and kings are 'counters' worth 10 each. Last trick +10.",
    "Bid starts at 250 and goes up by 10. The high bidder names trump.",
    "Meld is scored for you: run 150, royal marriage 40, marriage 20, pinochle (Q♠ J♦) 40, aces around 100, kings 80, queens 60, jacks 40, 9 of trump 10.",
    "Follow suit and beat the winning card if you can. If you're out of the suit, you must trump.",
    "Bidders must reach their bid with meld + counters or lose the bid. First team to 1500 wins.",
  ],
};
function pinochleMeldCards(hand, trump) {
  // Which cards are shown on the table for meld (display only).
  const show = new Set(); const add = (r, s, n) => { let k = 0; for (const c of hand) if (c.r === r && c.s === s && k < n && !show.has(c.id)) { show.add(c.id); k++; } };
  const cnt = (r, s) => hand.filter((c) => c.r === r && c.s === s).length;
  const runs = Math.min(...["A", "10", "K", "Q", "J"].map((r) => cnt(r, trump)));
  if (runs) for (const r of ["A", "10", "K", "Q", "J"]) add(r, trump, runs);
  const royals = Math.min(cnt("K", trump), cnt("Q", trump)); if (royals) { add("K", trump, royals); add("Q", trump, royals); }
  add("9", trump, cnt("9", trump));
  for (const su of SUITS) if (su !== trump) { const m = Math.min(cnt("K", su), cnt("Q", su)); if (m) { add("K", su, m); add("Q", su, m); } }
  for (const r of ["A", "K", "Q", "J"]) { const m = Math.min(...SUITS.map((su) => cnt(r, su))); if (m) for (const su of SUITS) add(r, su, m); }
  const pin = Math.min(cnt("Q", "S"), cnt("J", "D")); if (pin) { add("Q", "S", pin); add("J", "D", pin); }
  return hand.filter((c) => show.has(c.id));
}

/* =============================== CANASTA =============================== */
const isWild = (c) => c.r === "W" || c.r === "2";
const isRed3 = (c) => c.r === "3" && (c.s === "H" || c.s === "D");
const isBlack3 = (c) => c.r === "3" && (c.s === "S" || c.s === "C");
function cVal(c) { if (c.r === "W") return 50; if (c.r === "2" || c.r === "A") return 20; if (["K", "Q", "J", "10", "9", "8"].includes(c.r)) return 10; return 5; }
const CN_ORDER = ["W", "2", "A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3"];
function cnSort(h) { return h.sort((a, b) => CN_ORDER.indexOf(a.r) - CN_ORDER.indexOf(b.r) || SUITS.indexOf(a.s) - SUITS.indexOf(b.s) || a.id - b.id); }
function minMeld(score) { return score < 0 ? 15 : score < 1500 ? 50 : score < 3000 ? 90 : 120; }
function meldInfo(cards) {
  const wild = cards.filter(isWild).length, nat = cards.length - wild;
  return { wild, nat, size: cards.length, canasta: cards.length >= 7, natural: wild === 0 };
}
// Check a group of cards (optionally joining an existing team meld) — returns {rank} or error string
function checkGroup(cards, rank, existing, goingOut) {
  const naturals = cards.filter((c) => !isWild(c));
  if (naturals.some(isRed3)) return "Red threes can't be melded; they're laid down automatically.";
  const ranks = [...new Set(naturals.map((c) => c.r))];
  if (ranks.length > 1) return "A meld must be all the same rank (plus wild cards).";
  const r = ranks[0] || rank;
  if (!r) return "Wild cards need a meld to join. Pick the meld you're adding to.";
  if (r === "3") {
    if (!goingOut) return "Black threes can only be melded when you go out.";
    if (cards.some(isWild)) return "Black threes can't be melded with wild cards.";
  }
  const all = existing ? existing.concat(cards) : cards;
  const inf = meldInfo(all);
  if (inf.size < 3) return "A new meld needs at least 3 cards.";
  if (inf.nat < 2) return "A meld needs at least 2 natural (non-wild) cards.";
  if (inf.wild > 3) return "A meld can have at most 3 wild cards.";
  return { rank: r };
}
const canasta = {
  id: "canasta", name: "Canasta", seats: 4, min: 4, max: 4, family: "meld", teams: true,
  blurb: "Partners build melds of the same rank. Seven cards make a canasta. First team to 5000.",
  init(players) {
    const s = { game: "canasta", n: 4, players, dealer: 0, handNo: 0, scores: [0, 0], log: [], version: 0 };
    canasta.deal(s); return s;
  },
  deal(s) {
    s.stock = makeDeck({ copies: 2, jokers: 4 });
    s.hands = [[], [], [], []]; s.red3 = [[], []]; s.melds = [[], []]; s.pile = []; s.pileFrozen = false; s.wentOut = null; s.result = null;
    for (let i = 0; i < 11; i++) for (let p = 0; p < 4; p++) s.hands[p].push(s.stock.pop());
    for (let p = 0; p < 4; p++) canasta.layRed3(s, p);
    let up = s.stock.pop(); s.pile.push(up);
    while (isWild(up) || isRed3(up)) { s.pileFrozen = true; up = s.stock.pop(); s.pile.push(up); }
    s.hands.forEach(cnSort); s.phase = "draw"; s.turn = nextSeat(s.dealer, 4); s.turnMelded = false;
    addLog(s, `Hand ${s.handNo + 1}: ${s.players[s.turn].name} goes first.`);
  },
  layRed3(s, p) {
    let r3;
    while ((r3 = s.hands[p].find(isRed3))) {
      s.hands[p].splice(s.hands[p].indexOf(r3), 1); s.red3[teamOf(p)].push(r3); addLog(s, `${s.players[p].name} lays down a red three.`);
      if (s.stock.length) s.hands[p].push(s.stock.pop());
    }
  },
  toAct(s) { if (s.over) return []; if (s.phase === "scored") return [0, 1, 2, 3]; return s.phase === "draw" || s.phase === "play" ? [s.turn] : []; },
  view(s, seat) {
    const t = teamOf(seat);
    return { ...baseView(s, seat), hand: s.hands[seat] || [], counts: s.hands.map((h) => h.length), stockCount: s.stock.length,
      pileTop: s.pile[s.pile.length - 1] || null, pileSize: s.pile.length, pileFrozen: s.pileFrozen, melds: s.melds, red3: s.red3,
      scores: s.scores, myTeam: t, teamMelded: s.melds[t].length > 0, teamCanasta: s.melds[t].some((m) => m.cards.length >= 7),
      minMeld: minMeld(s.scores[t]), turnMelded: s.turn === seat ? s.turnMelded : false };
  },
  // Validate a list of groups ({ids, rank?}) against hand + team melds. Returns {err} or {plan, points, remaining}
  planGroups(v, groups, extraHand, goingOutCheck = true) {
    const hand = v.hand.concat(extraHand || []); const used = new Set(); const plan = []; let points = 0; const newRanks = new Set();
    const teamMelds = v.melds[v.myTeam]; const working = {}; for (const m of teamMelds) working[m.rank] = m.cards.slice();
    for (const g of groups) {
      if (!g.ids || !g.ids.length) return { err: "Pick some cards for each meld." };
      for (const id of g.ids) { if (used.has(id)) return { err: "A card can only be used once." }; used.add(id); }
      const cards = g.ids.map((id) => hand.find((c) => c.id === id)); if (cards.some((c) => !c)) return { err: "That card isn't in your hand." };
      const natRank = (cards.find((c) => !isWild(c)) || {}).r || g.rank;
      const existing = teamMelds.find((m) => m.rank === natRank);
      if (!existing && newRanks.has(natRank)) return { err: "Put all cards of one rank in a single meld." };
      const remaining = hand.length - used.size;
      const res = checkGroup(cards, g.rank, existing ? working[natRank] : null, remaining === 0);
      if (typeof res === "string") return { err: res };
      if (!existing) newRanks.add(res.rank); else working[natRank] = working[natRank].concat(cards);
      plan.push({ rank: res.rank, cards, existing: !!existing });
      points += cards.reduce((t, c) => t + cVal(c), 0);
    }
    const remaining = hand.length - used.size;
    if (goingOutCheck) {
      const willHaveCanasta = v.teamCanasta || Object.values(working).some((c) => c.length >= 7) || plan.some((p) => !p.existing && p.cards.length >= 7);
      if (remaining === 0 && !willHaveCanasta) return { err: "You can't go out until your team has a canasta (7 cards in one meld)." };
      if (remaining === 1 && !willHaveCanasta) return { err: "Keep at least 2 cards: you'd have to discard your last card, and you can't go out without a canasta." };
    }
    return { plan, points, remaining };
  },
  takeCheck(v, a) {
    const top = v.pileTop; if (!top) return "The discard pile is empty.";
    if (isWild(top)) return "You can't take the pile when a wild card is on top.";
    if (isBlack3(top)) return "A black three on top blocks the pile this turn.";
    const frozen = v.pileFrozen || !v.teamMelded;
    const ids = a.ids || []; if (!hasIds(v.hand, ids)) return "Pick cards from your hand.";
    const cards = ids.map((id) => byId(v.hand, id));
    const existing = v.melds[v.myTeam].find((m) => m.rank === top.r);
    const naturalMatch = cards.filter((c) => c.r === top.r && !isWild(c)).length;
    if (frozen && naturalMatch < 2) return v.teamMelded ? "The pile is frozen. To take it you need a natural pair matching the top card." : "Your team hasn't melded yet, so you need a natural pair matching the top card (and enough points for your first meld).";
    if (!frozen && !existing && naturalMatch < 1) return "You need cards matching the top card (a pair, or one plus a wild).";
    if (cards.some((c) => !isWild(c) && c.r !== top.r)) return "Only matching cards and wilds can go with the top card. Make other melds after you take the pile.";
    const res = checkGroup([top, ...cards], top.r, existing ? existing.cards : null, false);
    if (typeof res === "string") return res;
    if (!v.teamMelded) {
      const extra = canasta.planGroups(v, a.extra || [], [], false); if (extra.err) return extra.err;
      if ((a.extra || []).some((g) => g.ids.some((id) => ids.includes(id)))) return "A card can only be used once.";
      const pts = [top, ...cards].reduce((t, c) => t + cVal(c), 0) + extra.points;
      if (pts < v.minMeld) return `Your first meld must be worth at least ${v.minMeld} points (this is ${pts}).`;
    }
    return null;
  },
  validate(v, a) {
    if (v.turn !== v.me && a.type !== "next") return "It's not your turn.";
    if (a.type === "draw") return v.phase === "draw" ? null : "You've already drawn this turn.";
    if (a.type === "take") return v.phase === "draw" ? canasta.takeCheck(v, a) : "You've already drawn this turn.";
    if (a.type === "meld") {
      if (v.phase !== "play") return "Draw a card or take the pile first.";
      const p = canasta.planGroups(v, a.groups || []); if (p.err) return p.err;
      if (!v.teamMelded && p.points < v.minMeld) return `Your team's first meld must be worth at least ${v.minMeld} points (this is ${p.points}). Cards count: joker 50, 2s and aces 20, K through 8 count 10, 7 through 4 count 5.`;
      return null;
    }
    if (a.type === "discard") {
      if (v.phase !== "play") return "Draw a card or take the pile first.";
      if (!byId(v.hand, a.id)) return "That card isn't in your hand.";
      if (v.hand.length === 1 && !v.teamCanasta) return "Discarding your last card would be going out, and your team needs a canasta first.";
      return null;
    }
    return "That move isn't part of Canasta.";
  },
  apply(s, seat, a) {
    const t = teamOf(seat);
    if (a.type === "draw") {
      if (!s.stock.length) { addLog(s, "The stock is empty. The hand is over."); return canasta.score(s); }
      const c = s.stock.pop(); s.hands[seat].push(c); canasta.layRed3(s, seat); cnSort(s.hands[seat]);
      addLog(s, `${s.players[seat].name} draws.`); s.phase = "play"; return;
    }
    if (a.type === "take") {
      const top = s.pile.pop(); const cards = takeIds(s.hands[seat], a.ids || []);
      let m = s.melds[t].find((x) => x.rank === top.r);
      if (m) m.cards.push(top, ...cards); else s.melds[t].push({ rank: top.r, cards: [top, ...cards] });
      for (const g of a.extra || []) canasta.addGroup(s, seat, g);
      s.hands[seat].push(...s.pile); addLog(s, `${s.players[seat].name} takes the pile (${s.pile.length + 1} cards).`);
      s.pile = []; s.pileFrozen = false; canasta.layRed3(s, seat); cnSort(s.hands[seat]); s.phase = "play"; s.turnMelded = true; return;
    }
    if (a.type === "meld") {
      for (const g of a.groups) canasta.addGroup(s, seat, g);
      s.turnMelded = true; addLog(s, `${s.players[seat].name} melds.`);
      if (!s.hands[seat].length) { s.wentOut = seat; addLog(s, `${s.players[seat].name} goes out!`); return canasta.score(s); }
      return;
    }
    if (a.type === "discard") {
      const [c] = takeIds(s.hands[seat], [a.id]); s.pile.push(c); if (isWild(c)) s.pileFrozen = true;
      addLog(s, `${s.players[seat].name} discards ${cardLabel(c)}.`);
      if (!s.hands[seat].length) { s.wentOut = seat; addLog(s, `${s.players[seat].name} goes out!`); return canasta.score(s); }
      s.turn = nextSeat(seat, 4); s.phase = "draw"; s.turnMelded = false;
      if (!s.stock.length && !canasta.canTakeAny(s, s.turn)) { addLog(s, "The stock is empty. The hand is over."); canasta.score(s); }
    }
  },
  canTakeAny(s, seat) {
    const v = canasta.view(s, seat); const top = v.pileTop; if (!top) return false;
    const nat = v.hand.filter((c) => c.r === top.r && !isWild(c)).map((c) => c.id);
    return [[], nat.slice(0, 2)].some((ids) => !canasta.takeCheck(v, { ids }));
  },
  addGroup(s, seat, g) {
    const t = teamOf(seat); const cards = takeIds(s.hands[seat], g.ids);
    const r = (cards.find((c) => !isWild(c)) || {}).r || g.rank;
    const m = s.melds[t].find((x) => x.rank === r);
    if (m) m.cards.push(...cards); else s.melds[t].push({ rank: r, cards });
  },
  score(s) {
    const lines = [];
    for (const t of [0, 1]) {
      let pts = 0; const nm = `${s.players[t].name} & ${s.players[t + 2].name}`;
      const melded = s.melds[t].reduce((x, m) => x + m.cards.reduce((y, c) => y + cVal(c), 0), 0);
      let bonus = 0; for (const m of s.melds[t]) if (m.cards.length >= 7) bonus += m.cards.some(isWild) ? 300 : 500;
      let r3 = s.red3[t].length === 4 ? 800 : s.red3[t].length * 100; if (!s.melds[t].length) r3 = -r3;
      const out = s.wentOut !== null && teamOf(s.wentOut) === t ? 100 : 0;
      const inHand = [t, t + 2].reduce((x, p) => x + s.hands[p].reduce((y, c) => y + cVal(c), 0), 0);
      pts = melded + bonus + r3 + out - inHand; s.scores[t] += pts;
      lines.push(`${nm}: melds ${melded}, canastas ${bonus}, red 3s ${r3}${out ? ", going out 100" : ""}, cards left −${inHand} = ${pts >= 0 ? "+" : ""}${pts}`);
    }
    s.result = { title: "Hand over", lines: [...lines, `Score: ${s.scores[0]} to ${s.scores[1]}`] }; s.turn = null;
    if (s.scores.some((x) => x >= 5000)) {
      const w = s.scores[0] >= s.scores[1] ? 0 : 1; s.over = true; s.phase = "over";
      s.result.title = `${s.players[w].name} & ${s.players[w + 2].name} win!`; addLog(s, s.result.title);
    } else s.phase = "scored";
  },
  next(s) { s.handNo++; s.dealer = nextSeat(s.dealer, 4); canasta.deal(s); },
  botMeld(v) {
    const hand = v.hand; const groups = []; const used = new Set();
    const byRank = {}; for (const c of hand) if (!isWild(c) && !isBlack3(c)) (byRank[c.r] = byRank[c.r] || []).push(c);
    const team = v.melds[v.myTeam];
    for (const [r, cs] of Object.entries(byRank)) {
      const ex = team.find((m) => m.rank === r);
      if (ex || cs.length >= 3) { groups.push({ ids: cs.map((c) => c.id) }); cs.forEach((c) => used.add(c.id)); }
    }
    const wilds = hand.filter(isWild);
    if (v.teamMelded) {
      // use a wild to start a meld from a natural pair, and to push melds toward a canasta
      for (const [r, cs] of Object.entries(byRank)) if (cs.length === 2 && !team.find((m) => m.rank === r) && wilds.length > 1) {
        const w = wilds.pop(); groups.push({ ids: [...cs.map((c) => c.id), w.id] });
      }
      for (const m of team) if (m.cards.length >= 5 && m.cards.length < 7 && wilds.length && meldInfo(m.cards).wild < 3) {
        const w = wilds.pop(); groups.push({ ids: [w.id], rank: m.rank });
      }
    }
    // First meld: if naturals alone fall short of the minimum, lend wild cards to pairs and triples
    if (!v.teamMelded) {
      const pts = (gs) => gs.reduce((t, g) => t + g.ids.reduce((x, id) => x + cVal(byId(hand, id)), 0), 0);
      const spare = hand.filter(isWild).filter((w) => !groups.some((g) => g.ids.includes(w.id)));
      for (const [r, cs] of Object.entries(byRank)) {
        if (pts(groups) >= v.minMeld || !spare.length) break;
        if (cs.length === 2) groups.push({ ids: [...cs.map((c) => c.id), spare.pop().id] });
      }
      for (const g of groups) { while (pts(groups) < v.minMeld && spare.length && g.ids.filter((id) => isWild(byId(hand, id))).length < 2 && g.ids.length >= 3) g.ids.push(spare.pop().id); }
    }
    // Try full set, then drop groups until one validates
    let gs = groups.slice();
    while (gs.length) {
      const err = canasta.validate(v, { type: "meld", groups: gs });
      if (!err) return { type: "meld", groups: gs };
      gs = gs.slice(0, -1);
    }
    return null;
  },
  botDiscard(v) {
    const opp = v.melds[1 - v.myTeam].map((m) => m.rank); const mine = v.melds[v.myTeam].map((m) => m.rank);
    const cnt = (r) => v.hand.filter((c) => c.r === r).length;
    const score = (c) => (isWild(c) ? 1000 : 0) + (isBlack3(c) ? -100 : 0) + (opp.includes(c.r) ? 200 : 0) + (mine.includes(c.r) ? 150 : 0) + cnt(c.r) * 40 + cVal(c);
    return { type: "discard", id: v.hand.slice().sort((a, b) => score(a) - score(b))[0].id };
  },
  bot(v) {
    if (v.phase === "scored") return { type: "next" };
    if (v.phase === "draw") {
      const top = v.pileTop;
      if (top && v.pileSize >= 3 && !isWild(top) && !isBlack3(top)) {
        const nat = v.hand.filter((c) => c.r === top.r && !isWild(c)).map((c) => c.id);
        const tries = [[], nat.slice(0, 2), nat.slice(0, 1).concat(v.hand.filter(isWild).slice(0, 1).map((c) => c.id))];
        for (const ids of tries) {
          let a = { type: "take", ids };
          if (!v.teamMelded) {
            const byRank = {}; for (const c of v.hand) if (!isWild(c) && !isBlack3(c) && !ids.includes(c.id) && c.r !== top.r) (byRank[c.r] = byRank[c.r] || []).push(c);
            a.extra = Object.values(byRank).filter((cs) => cs.length >= 3).map((cs) => ({ ids: cs.map((c) => c.id) }));
          }
          if (!canasta.validate(v, a)) return a;
        }
      }
      return { type: "draw" };
    }
    const m = canasta.botMeld(v); if (m) return m;
    return canasta.botDiscard(v);
  },
  coach(v) {
    if (v.phase === "draw") {
      if (v.turn !== v.me) return { say: `Waiting for ${v.players[v.turn]}.` };
      const sug = canasta.bot(v);
      return { say: `Start your turn: draw from the stock, or take the whole discard pile if you can use its top card in a meld.${v.teamMelded ? "" : ` Your team hasn't melded yet: the first meld must be worth ${v.minMeld}.`}`,
        suggest: sug, why: sug.type === "take" ? "Taking the pile gives you lots of cards to build melds and canastas." : "You can't use the top card in a meld, so draw from the stock." };
    }
    if (v.phase === "play") {
      if (v.turn !== v.me) return { say: `Waiting for ${v.players[v.turn]}.` };
      const sug = canasta.bot(v);
      const say = sug.type === "meld" ? "You can meld now: lay down 3 or more of a rank (wild 2s and jokers can help, max 3 wilds per meld). Then discard one card to end your turn."
        : "Now discard one card to end your turn. Avoid giving the other team a card they've melded.";
      return { say, suggest: sug, why: sug.type === "meld" ? "Melding scores points and works toward a canasta (7 cards), which your team needs to go out." : `Discarding ${cardLabel(byId(v.hand, sug.id))} is safest: it doesn't help the other team's melds.` };
    }
    if (v.phase === "scored") return { say: "Hand over. Canastas are worth 500 (natural) or 300 (mixed). Cards left in your hand count against you." };
    return { say: "" };
  },
  rules: [
    "4 players in 2 teams. Two decks plus 4 jokers. 11 cards each.",
    "On your turn: draw 1 card (or take the whole discard pile), meld if you can, then discard 1.",
    "A meld is 3+ cards of the same rank. Jokers and 2s are wild; a meld needs 2+ natural cards and at most 3 wilds.",
    "Your team's first meld needs a minimum point value (50 to start). Cards: joker 50, 2/ace 20, K–8 10, 7–4 5.",
    "7 cards in a meld is a canasta: 500 if natural, 300 if mixed. You need one to go out.",
    "Red 3s are laid down automatically for 100 each. Black 3s block the pile. First team to 5000 wins.",
  ],
};

/* ================================ POKER ================================ */
function pv(c) { return STD_VAL[c.r]; }
function eval5(cards) {
  const vals = cards.map(pv).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0].s);
  const uniq = [...new Set(vals)];
  let straightHigh = 0;
  if (uniq.length === 5) { if (vals[0] - vals[4] === 4) straightHigh = vals[0]; else if (vals.join() === "14,5,4,3,2") straightHigh = 5; }
  const counts = {}; vals.forEach((x) => (counts[x] = (counts[x] || 0) + 1));
  const groups = Object.entries(counts).map(([v, n]) => [n, +v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][0] === 4) return [7, groups[0][1], groups[1][1]];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, groups[0][1], groups[1][1]];
  if (flush) return [5, ...vals];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][0] === 3) return [3, groups[0][1], ...groups.slice(1).map((g) => g[1])];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, groups[0][1], groups[1][1], groups[2][1]];
  if (groups[0][0] === 2) return [1, groups[0][1], ...groups.slice(1).map((g) => g[1])];
  return [0, ...vals];
}
function evalPartial(cards) { // for stud up-cards (fewer than 5)
  if (cards.length >= 5) return eval5(cards.slice(0, 5));
  const vals = cards.map(pv); const counts = {}; vals.forEach((x) => (counts[x] = (counts[x] || 0) + 1));
  const groups = Object.entries(counts).map(([v, n]) => [n, +v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const cat = groups[0][0] === 4 ? 7 : groups[0][0] === 3 ? 3 : groups[0][0] === 2 && groups[1] && groups[1][0] === 2 ? 2 : groups[0][0] === 2 ? 1 : 0;
  return [cat, ...groups.map((g) => g[1])];
}
function cmpScore(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; }
function combos(arr, k) { const out = []; const rec = (st, acc) => { if (acc.length === k) { out.push(acc.slice()); return; } for (let i = st; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); } }; rec(0, []); return out; }
export function bestHand(hole, board, omaha) {
  let best = null;
  if (omaha) { for (const h of combos(hole, 2)) for (const b of combos(board, 3)) { const sc = eval5(h.concat(b)); if (!best || cmpScore(sc, best) > 0) best = sc; } }
  else { const all = hole.concat(board); if (all.length < 5) return evalPartial(all); for (const c of combos(all, 5)) { const sc = eval5(c); if (!best || cmpScore(sc, best) > 0) best = sc; } }
  return best;
}
const RANK_WORD = { 2: "twos", 3: "threes", 4: "fours", 5: "fives", 6: "sixes", 7: "sevens", 8: "eights", 9: "nines", 10: "tens", 11: "jacks", 12: "queens", 13: "kings", 14: "aces" };
const RANK_ONE = { 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "jack", 12: "queen", 13: "king", 14: "ace" };
export function handName(sc) {
  if (!sc) return "";
  switch (sc[0]) {
    case 8: return sc[1] === 14 ? "Royal flush" : `Straight flush, ${RANK_ONE[sc[1]]} high`;
    case 7: return `Four ${RANK_WORD[sc[1]]}`;
    case 6: return `Full house, ${RANK_WORD[sc[1]]} over ${RANK_WORD[sc[2]]}`;
    case 5: return `Flush, ${RANK_ONE[sc[1]]} high`;
    case 4: return `Straight, ${RANK_ONE[sc[1]]} high`;
    case 3: return `Three ${RANK_WORD[sc[1]]}`;
    case 2: return `Two pair, ${RANK_WORD[sc[1]]} and ${RANK_WORD[sc[2]]}`;
    case 1: return `Pair of ${RANK_WORD[sc[1]]}`;
    default: return `${RANK_ONE[sc[1]] ? RANK_ONE[sc[1]][0].toUpperCase() + RANK_ONE[sc[1]].slice(1) : ""} high`;
  }
}
function makePoker(id, name, kind) {
  const isStud = kind === "stud", isOmaha = kind === "omaha";
  const SB = 5, BB = 10, ANTE = 2, BRING = 5, SMALL = 10, BIG = 20, START = 1000;
  const g = {
    id, name, seats: 6, min: 2, max: 6, family: "poker", chips: true,
    blurb: isStud ? "Seven cards each, some face up. Best five-card hand wins. Free chips only."
      : isOmaha ? "Four hole cards, five on the table. Use exactly two of yours. Free chips only."
      : "Two hole cards, five on the table. Best five-card hand wins. Free chips only.",
    init(players) {
      const n = players.length;
      const s = { game: id, n, players, dealer: 0, handNo: 0, stacks: players.map(() => START), log: [], version: 0 };
      g.deal(s); return s;
    },
    deal(s) {
      const n = s.n; s.deck = makeDeck(); s.board = []; s.result = null; s.shown = null;
      s.stacks = s.stacks.map((x) => (x <= 0 ? START : x)); // free rebuy
      s.hole = s.players.map(() => []); s.up = s.players.map(() => []); // stud: up flags per card
      s.folded = s.players.map(() => false); s.allIn = s.players.map(() => false);
      s.bets = s.players.map(() => 0); s.contrib = s.players.map(() => 0); s.street = 0; s.raises = 0;
      const post = (p, amt) => { const a = Math.min(amt, s.stacks[p]); s.stacks[p] -= a; s.bets[p] += a; s.contrib[p] += a; if (!s.stacks[p]) s.allIn[p] = true; return a; };
      if (isStud) {
        for (let p = 0; p < n; p++) { const a = Math.min(ANTE, s.stacks[p]); s.stacks[p] -= a; s.contrib[p] += a; if (!s.stacks[p]) s.allIn[p] = true; }
        for (let p = 0; p < n; p++) { s.hole[p].push(s.deck.pop(), s.deck.pop(), s.deck.pop()); s.up[p] = [false, false, true]; }
        // lowest up card brings in (ties broken by suit: clubs lowest)
        const so = ["C", "D", "H", "S"]; let low = 0;
        for (let p = 1; p < n; p++) { const a = s.hole[p][2], b = s.hole[low][2]; if (pv(a) < pv(b) || (pv(a) === pv(b) && so.indexOf(a.s) < so.indexOf(b.s))) low = p; }
        post(low, BRING); s.currentBet = BRING; s.minRaise = SMALL - BRING; s.turn = nextSeat(low, n);
        s.need = new Set([...Array(n).keys()].filter((p) => !s.allIn[p])); s.need.delete(low); s.need.add(low);
        addLog(s, `Hand ${s.handNo + 1}: ${s.players[low].name} brings it in for ${BRING}.`);
      } else {
        const k = isOmaha ? 4 : 2; for (let i = 0; i < k; i++) for (let p = 0; p < n; p++) s.hole[p].push(s.deck.pop());
        const sb = n === 2 ? s.dealer : nextSeat(s.dealer, n), bb = nextSeat(sb, n);
        post(sb, SB); post(bb, BB); s.currentBet = BB; s.minRaise = BB; s.turn = nextSeat(bb, n);
        s.need = new Set([...Array(n).keys()].filter((p) => !s.allIn[p]));
        addLog(s, `Hand ${s.handNo + 1}: blinds ${SB}/${BB}.`);
      }
      s.need = [...s.need]; s.phase = "bet"; g.skipToActor(s);
    },
    actorOk(s, p) { return !s.folded[p] && !s.allIn[p]; },
    skipToActor(s) {
      const live = s.players.map((_, p) => p).filter((p) => !s.folded[p]);
      if (live.length === 1) return g.award(s, [[live[0]]]);
      s.need = s.need.filter((p) => g.actorOk(s, p));
      if (!s.need.length) return g.endStreet(s);
      let t = s.turn, guard = 0; while (!s.need.includes(t) && guard++ < 20) t = nextSeat(t, s.n); s.turn = t;
    },
    endStreet(s) {
      s.bets = s.bets.map(() => 0); s.currentBet = 0; s.raises = 0; s.minRaise = isStud ? 0 : BB; s.street++;
      const lastStreet = isStud ? 4 : 3;
      if (s.street > lastStreet) return g.showdown(s);
      const n = s.n; const live = s.players.map((_, p) => p).filter((p) => !s.folded[p]);
      if (isStud) { for (const p of live) { s.hole[p].push(s.deck.pop()); s.up[p].push(s.street < 4); } }
      else if (s.street === 1) s.board.push(s.deck.pop(), s.deck.pop(), s.deck.pop()); else s.board.push(s.deck.pop());
      const actors = live.filter((p) => !s.allIn[p]);
      if (actors.length <= 1) return g.endStreet(s); // everyone all in: run it out
      if (isStud) {
        let best = actors[0], bs = null;
        for (const p of actors) { const sc = evalPartial(s.hole[p].filter((_, i) => s.up[p][i])); if (!bs || cmpScore(sc, bs) > 0) { bs = sc; best = p; } }
        s.turn = best;
      } else { s.turn = nextSeat(s.dealer, n); }
      s.need = actors.slice(); g.skipToActor(s);
      addLog(s, isStud ? `${["", "4th", "5th", "6th", "7th"][s.street]} street.` : ["", "The flop.", "The turn.", "The river."][s.street]);
    },
    showdown(s) {
      const live = s.players.map((_, p) => p).filter((p) => !s.folded[p]);
      const scores = {}; for (const p of live) scores[p] = bestHand(s.hole[p], s.board, isOmaha);
      s.shown = live; s.handScores = scores;
      const levels = [...new Set(s.contrib.filter((x) => x > 0))].sort((a, b) => a - b);
      let prev = 0; const pots = [];
      for (const L of levels) {
        const amount = s.contrib.reduce((t, c) => t + Math.max(0, Math.min(c, L) - prev), 0);
        const elig = live.filter((p) => s.contrib[p] >= L); prev = L;
        if (amount) { if (elig.length) pots.push({ amount, elig }); else if (pots.length) pots[pots.length - 1].amount += amount; }
      }
      const winnersAll = new Set(); const lines = [];
      for (const pot of pots) {
        let best = null, ws = [];
        for (const p of pot.elig) { const c = best ? cmpScore(scores[p], best) : 1; if (c > 0) { best = scores[p]; ws = [p]; } else if (c === 0) ws.push(p); }
        const share = Math.floor(pot.amount / ws.length); let rem = pot.amount - share * ws.length;
        for (const w of ws) { s.stacks[w] += share + (rem-- > 0 ? 1 : 0); winnersAll.add(w); }
        lines.push(`${ws.map((w) => s.players[w].name).join(" & ")} win${ws.length > 1 ? "" : "s"} ${pot.amount} with ${handName(best).toLowerCase()}`);
      }
      for (const p of live) lines.push(`${s.players[p].name}: ${handName(scores[p])}`);
      s.result = { title: `${[...winnersAll].map((w) => s.players[w].name).join(" & ")} win${winnersAll.size > 1 ? "" : "s"}`, lines };
      addLog(s, lines[0]); s.potWon = s.contrib.reduce((x, y) => x + y, 0); s.contrib = s.contrib.map(() => 0); s.phase = "scored"; s.turn = null;
    },
    award(s, groups) {
      const total = s.contrib.reduce((a, b) => a + b, 0); const w = groups[0][0]; s.stacks[w] += total;
      s.result = { title: `${s.players[w].name} wins ${total}`, lines: ["Everyone else folded."] }; s.shown = [];
      addLog(s, `${s.players[w].name} wins ${total}.`); s.potWon = total; s.contrib = s.contrib.map(() => 0); s.phase = "scored"; s.turn = null;
    },
    toAct(s) { if (s.phase === "scored") return s.players.map((_, i) => i); return s.phase === "bet" ? [s.turn] : []; },
    view(s, seat) {
      const reveal = s.phase === "scored" && s.shown ? s.shown : [];
      const others = s.players.map((_, p) => {
        if (p === seat || reveal.includes(p)) return s.hole[p].map((c, i) => ({ ...c, up: isStud ? s.up[p][i] : false }));
        if (isStud) return s.hole[p].map((c, i) => (s.up[p][i] ? { ...c, up: true } : { hidden: true }));
        return s.hole[p].map(() => ({ hidden: true }));
      });
      const pot = s.contrib.reduce((a, b) => a + b, 0);
      const toCall = Math.max(0, s.currentBet - s.bets[seat]);
      let minTo = s.currentBet + Math.max(s.minRaise || 0, isStud ? 0 : BB), maxTo = s.bets[seat] + s.stacks[seat];
      if (isStud) { const size = s.street >= 2 ? BIG : SMALL; minTo = s.currentBet < size && s.street === 0 ? size : s.currentBet + size; maxTo = Math.min(maxTo, minTo); }
      if (isOmaha) maxTo = Math.min(maxTo, s.currentBet + pot + toCall);
      return { ...baseView(s, seat), cards: others, board: s.board, pot, bets: s.bets, stacks: s.stacks, folded: s.folded, allIn: s.allIn,
        potWon: s.phase === "scored" ? s.potWon : 0, currentBet: s.currentBet, toCall: Math.min(toCall, s.stacks[seat]), minTo: Math.min(minTo, maxTo), maxTo, canRaise: (isStud ? s.raises < 4 : true) && s.stacks[seat] > toCall,
        street: s.street, kind, dealer: s.dealer, handScores: s.phase === "scored" ? s.handScores : null,
        myBest: s.hole[seat] && s.hole[seat].length ? handName(bestHand(s.hole[seat], s.board, isOmaha && s.board.length >= 3)) : "" };
    },
    validate(v, a) {
      if (v.phase !== "bet") return "The hand is over.";
      if (v.turn !== v.me) return "It's not your turn.";
      if (a.type === "fold") return null;
      if (a.type === "check") return v.toCall ? `You can't check: it's ${v.toCall} to call.` : null;
      if (a.type === "call") return v.toCall ? null : "There's nothing to call. Check instead.";
      if (a.type === "raise") {
        if (!v.canRaise) return "You can't raise now.";
        if (!Number.isInteger(a.to)) return "Pick an amount.";
        if (a.to > v.maxTo) return `The most you can bet is ${v.maxTo}.`;
        if (a.to < v.minTo && a.to !== v.maxTo) return `Raise to at least ${v.minTo}.`;
        if (a.to <= v.currentBet) return "That doesn't raise the bet.";
        return null;
      }
      return "That move isn't part of poker.";
    },
    apply(s, p, a) {
      const nm = s.players[p].name;
      if (a.type === "fold") { s.folded[p] = true; addLog(s, `${nm} folds.`); }
      else if (a.type === "check") addLog(s, `${nm} checks.`);
      else if (a.type === "call") { const amt = Math.min(s.currentBet - s.bets[p], s.stacks[p]); s.stacks[p] -= amt; s.bets[p] += amt; s.contrib[p] += amt; if (!s.stacks[p]) s.allIn[p] = true; addLog(s, `${nm} calls ${amt}.`); }
      else if (a.type === "raise") {
        const amt = a.to - s.bets[p]; s.stacks[p] -= amt; s.bets[p] = a.to; s.contrib[p] += amt; if (!s.stacks[p]) s.allIn[p] = true;
        const inc = a.to - s.currentBet; if (inc > (s.minRaise || 0)) s.minRaise = inc; s.currentBet = a.to; s.raises++;
        s.need = s.players.map((_, i) => i).filter((i) => i !== p && g.actorOk(s, i));
        addLog(s, `${nm} ${s.currentBet === a.to && inc === a.to ? "bets" : "raises to"} ${a.to}${s.allIn[p] ? " (all in)" : ""}.`);
      }
      s.need = s.need.filter((i) => i !== p);
      s.turn = nextSeat(p, s.n); g.skipToActor(s);
    },
    next(s) { s.handNo++; s.dealer = nextSeat(s.dealer, s.n); g.deal(s); },
    equity(v, sims = 160) {
      const mine = v.cards[v.me]; const known = new Set(); const seen = [];
      v.cards.forEach((h) => h.forEach((c) => { if (!c.hidden) { known.add(c.r + c.s); seen.push(c); } }));
      v.board.forEach((c) => known.add(c.r + c.s));
      const rest = []; for (const su of SUITS) for (const r of STD_RANKS) if (!known.has(r + su)) rest.push({ r, s: su });
      const opps = v.cards.map((_, p) => p).filter((p) => p !== v.me && !v.folded[p]);
      if (!opps.length) return 1;
      let win = 0;
      for (let i = 0; i < sims; i++) {
        const deck = shuffle(rest.slice()); let k = 0;
        const board = v.board.slice(); while (!isStud && board.length < 5) board.push(deck[k++]);
        const fill = (h, total) => { const out = h.filter((c) => !c.hidden).map((c) => ({ r: c.r, s: c.s })); while (out.length < total) out.push(deck[k++]); return out; };
        const total = isStud ? 7 : isOmaha ? 4 : 2;
        const me = bestHand(fill(mine, total), board, isOmaha);
        let best = 1;
        for (const o of opps) { const sc = bestHand(fill(v.cards[o], total), board, isOmaha); const c = cmpScore(me, sc); if (c < 0) { best = 0; break; } if (c === 0) best = Math.min(best, 0.5); }
        win += best;
      }
      return win / sims;
    },
    bot(v) {
      if (v.phase === "scored") return { type: "next" };
      const eq = g.equity(v, isOmaha ? 60 : 80); const pot = v.pot; const odds = v.toCall / Math.max(1, pot + v.toCall);
      const jitter = (rand() - 0.5) * 0.08;
      if (eq + jitter > 0.72 && v.canRaise) { const want = Math.max(v.minTo, Math.min(v.maxTo, v.currentBet + Math.round(pot * 0.7))); return { type: "raise", to: want }; }
      if (!v.toCall) return { type: "check" };
      if (eq + jitter >= odds + 0.04 || v.toCall <= 2) return { type: "call" };
      return { type: "fold" };
    },
    coach(v) {
      if (v.phase === "scored") return { say: "Hand over. Tap Next hand when you're ready. Out of chips? You get a free 1,000 automatically." };
      if (v.turn !== v.me) return { say: `Waiting for ${v.players[v.turn]}.${v.myBest ? ` You have: ${v.myBest}.` : ""}` };
      const eq = g.equity(v, 200); const need = v.toCall / Math.max(1, v.pot + v.toCall); const sug = g.bot(v);
      const pct = Math.round(eq * 100), needPct = Math.round(need * 100);
      return { say: `You have ${v.myBest ? v.myBest.toLowerCase() : "your starting cards"}. Against ${v.folded.filter((f, i) => !f && i !== v.me).length} player(s) you'll win about ${pct}% of the time.${v.toCall ? ` Calling costs ${v.toCall} to win a ${v.pot} pot, so you need to win about ${needPct}% to make calling worth it.` : " It costs nothing to stay in, so you can check."}`,
        suggest: sug, why: sug.type === "raise" ? "Your hand is strong. Betting makes the others pay to keep playing." : sug.type === "fold" ? "Your chance to win is lower than the price of calling. Save your chips." : "The price is fair for your chance to win." };
    },
    rules: isStud ? [
      "2–6 players. Everyone antes 2. Free chips only: no real money.",
      "You get 2 cards down and 1 up. The lowest up card must bet 5 to start (the 'bring-in').",
      "Then 3 more up cards and 1 down card, with a betting round after each. Bets are 10 on early streets, 20 later.",
      "Make your best 5-card hand from your 7 cards. Highest hand wins the pot.",
      "Hands from high to low: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, pair, high card.",
    ] : [
      `2–6 players. Blinds are ${SB} and ${BB}. Free chips only: no real money.`,
      isOmaha ? "You get 4 private cards. You must use exactly 2 of them with exactly 3 from the table." : "You get 2 private cards. Use any combination with the 5 shared cards.",
      "Betting rounds: before the flop, after the flop (3 cards), after the turn (4th), after the river (5th).",
      isOmaha ? "Pot-limit: the most you can raise is the size of the pot." : "No-limit: you can bet any amount up to all your chips.",
      "Hands from high to low: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, pair, high card.",
    ],
  };
  return g;
}
const holdem = makePoker("holdem", "Texas Hold'em", "holdem");
const omaha = makePoker("omaha", "Omaha", "omaha");
const stud = makePoker("stud", "Seven-Card Stud", "stud");

/* ============================== BLACKJACK ============================== */
function bjTotal(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { if (c.r === "A") { aces++; t += 11; } else if (["K", "Q", "J", "10"].includes(c.r)) t += 10; else t += +c.r; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 };
}
const bjv = (c) => (c.r === "A" ? 11 : ["K", "Q", "J", "10"].includes(c.r) ? 10 : +c.r);
function basicStrategy(cards, up, canDouble, canSplit) {
  const d = bjv(up); const { total, soft } = bjTotal(cards);
  if (canSplit && cards.length === 2 && bjv(cards[0]) === bjv(cards[1])) {
    const p = bjv(cards[0]);
    if (p === 11 || p === 8) return ["split", p === 11 ? "Always split aces." : "Always split 8s: 16 is the worst total."];
    if (p === 9 && ![7, 10, 11].includes(d)) return ["split", "Split 9s unless the dealer shows 7, 10 or ace."];
    if ([2, 3, 7].includes(p) && d <= 7) return ["split", "Split small pairs against a weak dealer card."];
    if (p === 6 && d <= 6) return ["split", "Split 6s against a dealer 2 through 6."];
  }
  if (soft) {
    if (total >= 19) return ["stand", "Soft 19 or more is strong. Stand."];
    if (total === 18) return d >= 9 ? ["hit", "Soft 18 against a 9, 10 or ace: hit. You can't bust."] : (canDouble && d >= 3 && d <= 6 ? ["double", "Soft 18 against a weak dealer card: double down."] : ["stand", "Soft 18 is good here. Stand."]);
    if (canDouble && d >= 4 && d <= 6 && total >= 15) return ["double", "Soft hand against a weak dealer card: double down."];
    return ["hit", "A soft hand can't bust with one more card. Hit."];
  }
  if (total >= 17) return ["stand", "17 or more: stand."];
  if (total >= 13) return d <= 6 ? ["stand", `The dealer shows a ${d === 11 ? "ace" : d}, a weak card. Stand and let the dealer risk busting.`] : ["hit", "The dealer shows a strong card. Hit to improve."];
  if (total === 12) return d >= 4 && d <= 6 ? ["stand", "12 against a 4, 5 or 6: stand."] : ["hit", "12 against this dealer card: hit."];
  if (total === 11 && canDouble) return ["double", "11 is the best double: any 10-value card makes 21."];
  if (total === 10 && canDouble && d <= 9) return ["double", "10 against a dealer 2 through 9: double down."];
  if (total === 9 && canDouble && d >= 3 && d <= 6) return ["double", "9 against a weak dealer card: double down."];
  return ["hit", "You can't bust with one more card. Hit."];
}
const blackjack = {
  id: "blackjack", name: "Blackjack", seats: 5, min: 1, max: 5, family: "casino", chips: true, dealerBot: true,
  blurb: "Everyone plays their own hand against the dealer. Get closer to 21 without going over. Free chips only.",
  init(players) {
    const s = { game: "blackjack", n: players.length, players, dealer: -1, handNo: 0, stacks: players.map(() => 1000), log: [], version: 0 };
    s.shoe = makeDeck({ copies: 6 }); blackjack.startBets(s); return s;
  },
  startBets(s) {
    if (s.shoe.length < 80) { s.shoe = makeDeck({ copies: 6 }); addLog(s, "New shoe shuffled."); }
    s.stacks = s.stacks.map((x) => (x < 10 ? 1000 : x));
    s.bets = s.players.map(() => null); s.hands = s.players.map(() => []); s.dealerCards = []; s.result = null;
    s.phase = "bet"; s.turn = null; addLog(s, `Hand ${s.handNo + 1}: place your bets.`);
  },
  toAct(s) {
    if (s.phase === "bet") return s.players.map((_, i) => i).filter((i) => s.bets[i] === null);
    if (s.phase === "play") return [s.turn];
    if (s.phase === "scored") return s.players.map((_, i) => i);
    return [];
  },
  view(s, seat) {
    const hideHole = s.phase === "play" || s.phase === "bet";
    return { ...baseView(s, seat), stacks: s.stacks, bets: s.bets, hands: s.hands,
      dealerCards: s.dealerCards.map((c, i) => (i === 1 && hideHole ? { hidden: true } : c)),
      dealerTotal: hideHole ? (s.dealerCards[0] ? bjv(s.dealerCards[0]) : 0) : bjTotal(s.dealerCards).total, active: s.active };
  },
  myHand(v) { return v.hands[v.me] && v.hands[v.me][v.active] && !v.hands[v.me][v.active].done ? v.hands[v.me][v.active] : null; },
  validate(v, a) {
    if (a.type === "bet") {
      if (v.phase !== "bet") return "Betting is closed."; if (v.bets[v.me] !== null) return "You've already bet.";
      if (!Number.isInteger(a.amount) || a.amount < 10 || a.amount > Math.min(500, v.stacks[v.me])) return `Bet between 10 and ${Math.min(500, v.stacks[v.me])}.`;
      return null;
    }
    if (v.phase !== "play" || v.turn !== v.me) return "It's not your turn.";
    const h = blackjack.myHand(v); if (!h) return "You have no hand to play.";
    if (a.type === "hit" || a.type === "stand") return null;
    if (a.type === "double") return h.cards.length === 2 && v.stacks[v.me] >= h.bet ? null : "You can double only on your first two cards, with enough chips.";
    if (a.type === "split") return h.cards.length === 2 && bjv(h.cards[0]) === bjv(h.cards[1]) && v.hands[v.me].length === 1 && v.stacks[v.me] >= h.bet ? null : "You can split only a matching pair, once.";
    return "That move isn't part of Blackjack.";
  },
  apply(s, p, a) {
    const nm = s.players[p].name;
    if (a.type === "bet") {
      s.bets[p] = a.amount; s.stacks[p] -= a.amount; addLog(s, `${nm} bets ${a.amount}.`);
      if (s.bets.every((b) => b !== null)) blackjack.dealRound(s); return;
    }
    const h = s.hands[p][s.active];
    if (a.type === "hit") { h.cards.push(s.shoe.pop()); const t = bjTotal(h.cards).total; addLog(s, `${nm} hits: ${t}.`); if (t >= 21) { h.done = true; if (t > 21) addLog(s, `${nm} busts.`); } }
    else if (a.type === "stand") { h.done = true; addLog(s, `${nm} stands on ${bjTotal(h.cards).total}.`); }
    else if (a.type === "double") { s.stacks[p] -= h.bet; h.bet *= 2; h.cards.push(s.shoe.pop()); h.done = true; addLog(s, `${nm} doubles: ${bjTotal(h.cards).total}.`); }
    else if (a.type === "split") {
      s.stacks[p] -= h.bet; const second = { cards: [h.cards.pop()], bet: h.bet, done: false };
      h.cards.push(s.shoe.pop()); second.cards.push(s.shoe.pop()); s.hands[p].push(second); addLog(s, `${nm} splits.`);
      if (h.cards[0].r === "A") { h.done = true; second.done = true; }
    }
    blackjack.advance(s);
  },
  dealRound(s) {
    for (const p of s.players.keys()) s.hands[p] = [{ cards: [s.shoe.pop()], bet: s.bets[p], done: false }];
    s.dealerCards = [s.shoe.pop()];
    for (const p of s.players.keys()) s.hands[p][0].cards.push(s.shoe.pop());
    s.dealerCards.push(s.shoe.pop());
    const dealerBJ = bjTotal(s.dealerCards).total === 21;
    for (const p of s.players.keys()) if (bjTotal(s.hands[p][0].cards).total === 21) { s.hands[p][0].done = true; s.hands[p][0].natural = true; }
    if (dealerBJ) { addLog(s, "Dealer has blackjack."); return blackjack.settle(s); }
    s.phase = "play"; s.turn = -1; s.active = 0; blackjack.advance(s);
  },
  advance(s) {
    // find next unfinished hand (current seat first)
    for (let p = Math.max(0, s.turn); p < s.n; p++) {
      const hs = s.hands[p];
      for (let i = p === s.turn ? s.active : 0; i < hs.length; i++) if (!hs[i].done) { s.turn = p; s.active = i; return; }
    }
    blackjack.dealerPlay(s);
  },
  dealerPlay(s) {
    const anyLive = s.hands.some((hs) => hs.some((h) => bjTotal(h.cards).total <= 21 && !h.natural));
    if (anyLive) while (bjTotal(s.dealerCards).total < 17) s.dealerCards.push(s.shoe.pop());
    addLog(s, `Dealer has ${bjTotal(s.dealerCards).total}${bjTotal(s.dealerCards).total > 21 ? " and busts" : ""}.`);
    blackjack.settle(s);
  },
  settle(s) {
    const d = bjTotal(s.dealerCards).total; const dBJ = d === 21 && s.dealerCards.length === 2; const lines = [];
    s.players.forEach((pl, p) => {
      let net = 0;
      for (const h of s.hands[p]) {
        const t = bjTotal(h.cards).total; let pay = 0;
        if (h.natural && s.hands[p].length === 1 && !dBJ) pay = h.bet + Math.floor(h.bet * 1.5);
        else if (t > 21) pay = 0;
        else if (dBJ) pay = h.natural ? h.bet : 0;
        else if (d > 21 || t > d) pay = h.bet * 2;
        else if (t === d) pay = h.bet;
        s.stacks[p] += pay; net += pay - h.bet;
      }
      lines.push(`${pl.name}: ${net > 0 ? "won " + net : net < 0 ? "lost " + -net : "push"}`);
    });
    s.result = { title: `Dealer ${d > 21 ? "busts" : "has " + d}`, lines }; s.phase = "scored"; s.turn = null;
  },
  next(s) { s.handNo++; blackjack.startBets(s); },
  bot(v) {
    if (v.phase === "scored") return { type: "next" };
    if (v.phase === "bet") return { type: "bet", amount: Math.min(25, v.stacks[v.me]) >= 10 ? Math.min(25, v.stacks[v.me]) : 10 };
    const h = blackjack.myHand(v);
    const [mv] = basicStrategy(h.cards, v.dealerCards[0], h.cards.length === 2 && v.stacks[v.me] >= h.bet, v.hands[v.me].length === 1 && v.stacks[v.me] >= h.bet);
    return { type: mv };
  },
  coach(v) {
    if (v.phase === "bet") return v.bets[v.me] === null ? { say: "Place a bet to start the hand. These are free chips: try 25.", suggest: { type: "bet", amount: 25 }, why: "Small bets let you play many hands while you learn." } : { say: "Waiting for everyone to bet." };
    if (v.phase === "play") {
      if (v.turn !== v.me) return { say: `Waiting for ${v.players[v.turn]}.` };
      const h = blackjack.myHand(v); const t = bjTotal(h.cards);
      const [mv, why] = basicStrategy(h.cards, v.dealerCards[0], h.cards.length === 2 && v.stacks[v.me] >= h.bet, v.hands[v.me].length === 1 && v.stacks[v.me] >= h.bet);
      return { say: `You have ${t.soft ? "soft " : ""}${t.total}. The dealer shows ${cardLabel(v.dealerCards[0])}. Hit takes a card, stand keeps your total, double doubles your bet for one more card.`, suggest: { type: mv }, why };
    }
    if (v.phase === "scored") return { say: "Hand over. Blackjack pays 3 to 2. Out of chips? You get a free 1,000." };
    return { say: "" };
  },
  rules: [
    "1–5 players, each against the dealer. 6-deck shoe. Free chips only: no real money.",
    "Cards 2–10 count as their number, face cards 10, aces 1 or 11. Get closer to 21 than the dealer without going over.",
    "Hit for another card, stand to stop, double to double your bet and take exactly one card, split a matching pair into two hands.",
    "The dealer hits until 17 or more. Blackjack (ace + 10-value card) pays 3 to 2.",
  ],
};

/* ============================== registry ============================== */
export const GAMES = { pinochle, canasta, hearts, spades, holdem, omaha, stud, blackjack };
export const GAME_LIST = Object.values(GAMES).map((g) => ({ id: g.id, name: g.name, min: g.min, max: g.max, seats: g.seats, family: g.family, teams: !!g.teams, chips: !!g.chips, blurb: g.blurb, rules: g.rules }));

export function newGame(id, players) {
  const g = GAMES[id]; if (!g) throw new Error("Unknown game.");
  if (players.length < g.min || players.length > g.max) throw new Error(`${g.name} needs ${g.min === g.max ? g.min : g.min + "–" + g.max} players.`);
  return g.init(players.map((p) => ({ name: p.name || "Player", bot: !!p.bot, id: p.id || null })));
}
export function view(s, seat) { return GAMES[s.game].view(s, seat); }
export function toAct(s) { return GAMES[s.game].toAct(s); }
export function act(s, seat, a) {
  const g = GAMES[s.game];
  if (!a || typeof a.type !== "string") throw new Error("Unknown move.");
  if (a.type === "next") {
    if (s.phase !== "scored") throw new Error("The hand isn't over yet.");
    g.next(s); s.version++; return s;
  }
  if (!g.toAct(s).includes(seat)) throw new Error("It's not your turn.");
  const err = g.validate(g.view(s, seat), a); if (err) throw new Error(err);
  g.apply(s, seat, a); s.version++; return s;
}
export function legalCards(v) { const g = GAMES[v.game]; return g.allowed ? g.allowed(v) : null; }
export function validate(v, a) { return GAMES[v.game].validate(v, a); }
export function bot(v) { return GAMES[v.game].bot(v); }
export function coach(v) { try { return GAMES[v.game].coach(v) || { say: "" }; } catch (e) { return { say: "" }; } }
// Let bots move until a human must act. Bots never advance past a scored hand while humans are seated.
export function runBots(s, limit = 600) {
  const g = GAMES[s.game]; const humans = s.players.some((p) => !p.bot);
  for (let i = 0; i < limit; i++) {
    if (s.over) return s;
    if (s.phase === "scored") { if (humans) return s; act(s, 0, { type: "next" }); continue; }
    const seats = g.toAct(s).filter((p) => s.players[p] && s.players[p].bot);
    if (!seats.length) return s;
    const p = seats[0]; act(s, p, g.bot(g.view(s, p)));
  }
  return s;
}
export { pinochleMeld, bjTotal, isWild, meldInfo, cVal, minMeld };
