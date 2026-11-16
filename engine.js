'use strict';
/* ============================================================================
   REGEX -> ε-NFA ENGINE (Thompson's Construction)
   Pure logic, no DOM. Testable directly under Node.
   ============================================================================ */

/* ---------- layout constants (pixels, local fragment frame) ---------- */
const LAYOUT = {
  R: 22,                 // state circle radius
  SYMBOL_GAP: 130,        // width of a base symbol/epsilon fragment
  H_GAP: 70,              // horizontal gap inserted by concatenation
  V_GAP: 84,              // vertical gap between union branches
  UNION_STUB: 60,         // horizontal stub before/after union branches
  STAR_STUB: 60,          // horizontal stub before/after a starred fragment
  // Loop/bypass curve clearance above whatever fragment is being wrapped.
  // These are *margins added on top of the wrapped fragment's own measured
  // height* (A.aboveSpine), not fixed pixel offsets — so a star/plus/optional
  // wrapped around a small symbol and one wrapped around a large, deeply
  // nested sub-expression both get curves that correctly clear their contents.
  LOOP_CLEARANCE: 26,     // how far the "repeat" curve sits above the wrapped fragment's own top
  BYPASS_CLEARANCE: 58,   // how far the "skip" curve sits above the wrapped fragment's own top (further out than the loop)
  CURVE_LABEL_PAD: 26,    // extra canvas headroom reserved above the highest curve, for its label
};

/* ---------- small utilities ---------- */
const SUB_DIGITS = { '0':'\u2080','1':'\u2081','2':'\u2082','3':'\u2083','4':'\u2084',
                      '5':'\u2085','6':'\u2086','7':'\u2087','8':'\u2088','9':'\u2089' };
function toSubscript(n) { return String(n).split('').map(d => SUB_DIGITS[d] !== undefined ? SUB_DIGITS[d] : d).join(''); }
function stateLabel(id) { return 'q' + toSubscript(id); }

class RegexError extends Error {
  constructor(message, index) { super(message); this.name = 'RegexError'; this.index = index; }
}

/* ============================================================================
   1. TOKENIZER
   ============================================================================ */
const EPS_CHAR = '\u03B5'; // ε

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    if (ch === '\\') {
      if (i + 1 >= src.length) throw new RegexError("A '\\' at the end of the pattern has nothing to escape.", i);
      tokens.push({ type: 'SYM', value: src[i + 1], at: i });
      i += 2; continue;
    }
    if (ch === EPS_CHAR) { tokens.push({ type: 'EPS', value: EPS_CHAR, at: i }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'LP', at: i }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RP', at: i }); i++; continue; }
    if (ch === '|') { tokens.push({ type: 'OR', at: i }); i++; continue; }
    if (ch === '*') { tokens.push({ type: 'STAR', at: i }); i++; continue; }
    if (ch === '+') { tokens.push({ type: 'PLUS', at: i }); i++; continue; }
    if (ch === '?') { tokens.push({ type: 'QMARK', at: i }); i++; continue; }
    if (/[a-zA-Z0-9]/.test(ch)) { tokens.push({ type: 'SYM', value: ch, at: i }); i++; continue; }
    throw new RegexError(`'${ch}' is not a symbol this tool recognises. Use letters, digits, | * + ? ( ) or ε (escape a literal operator with \\).`, i);
  }
  return tokens;
}

/* ============================================================================
   2. VALIDATOR  (recursive-descent grammar check; no tree built)
      union  := concat ('|' concat)*
      concat := repeat+
      repeat := atom ('*' | '+' | '?')*
      atom   := SYM | EPS | '(' union ')'
   ============================================================================ */
function validate(tokens, src) {
  let p = 0;
  function peek() { return tokens[p]; }
  function atEnd() { return p >= tokens.length; }
  function posOf(tok) { return tok ? tok.at : src.length; }

  function parseAtom() {
    const t = peek();
    if (!t) throw new RegexError('Expected a symbol, ε, or ( here.', src.length);
    if (t.type === 'SYM' || t.type === 'EPS') { p++; return; }
    if (t.type === 'LP') {
      p++;
      parseUnion();
      const close = peek();
      if (!close || close.type !== 'RP') throw new RegexError("Missing a closing ')' for this group.", posOf(close));
      p++; return;
    }
    throw new RegexError(`Unexpected '${tokenText(t)}' here \u2014 expected a symbol, ε, or (.`, t.at);
  }
  function parseRepeat() {
    parseAtom();
    while (!atEnd() && ['STAR', 'PLUS', 'QMARK'].includes(peek().type)) p++;
  }
  function parseConcat() {
    parseRepeat();
    while (!atEnd() && ['SYM', 'EPS', 'LP'].includes(peek().type)) parseRepeat();
  }
  function parseUnion() {
    parseConcat();
    while (!atEnd() && peek().type === 'OR') {
      p++;
      if (atEnd() || peek().type === 'RP') throw new RegexError("Expected an expression after '|'.", posOf(peek()));
      parseConcat();
    }
  }
  function tokenText(t) {
    if (t.type === 'SYM') return t.value;
    if (t.type === 'EPS') return EPS_CHAR;
    return { LP: '(', RP: ')', OR: '|', STAR: '*', PLUS: '+', QMARK: '?' }[t.type];
  }

  if (tokens.length === 0) throw new RegexError('Type a regular expression to begin.', 0);
  const first = peek();
  if (['STAR', 'PLUS', 'QMARK'].includes(first.type)) {
    throw new RegexError(`'${tokenText(first)}' needs something before it to repeat.`, first.at);
  }
  parseUnion();
  if (!atEnd()) {
    const t = peek();
    if (t.type === 'RP') throw new RegexError("This ')' has no matching '('.", t.at);
    throw new RegexError(`Unexpected '${tokenText(t)}' here \u2014 maybe a missing operator?`, t.at);
  }
}

/* ============================================================================
   3. CONCATENATION INSERTION + SHUNTING-YARD -> POSTFIX
   ============================================================================ */
function insertConcat(tokens) {
  const out = [];
  const startsAtom = t => t.type === 'SYM' || t.type === 'EPS' || t.type === 'LP';
  const endsAtom = t => t.type === 'SYM' || t.type === 'EPS' || t.type === 'RP' ||
                         t.type === 'STAR' || t.type === 'PLUS' || t.type === 'QMARK';
  for (let i = 0; i < tokens.length; i++) {
    out.push(tokens[i]);
    const next = tokens[i + 1];
    if (next && endsAtom(tokens[i]) && startsAtom(next)) out.push({ type: 'CONCAT', implicit: true });
  }
  return out;
}

const PRECEDENCE = { OR: 1, CONCAT: 2, STAR: 3, PLUS: 3, QMARK: 3 };
const UNARY = new Set(['STAR', 'PLUS', 'QMARK']);
const BINARY = new Set(['OR', 'CONCAT']);

function symbolFor(tok) {
  if (tok.type === 'SYM') return tok.value;
  if (tok.type === 'EPS') return EPS_CHAR;
  return { OR: '|', CONCAT: '\u00B7', STAR: '*', PLUS: '+', QMARK: '?', LP: '(', RP: ')' }[tok.type];
}

/** Returns { postfix, trace } where trace is a step-by-step shunting-yard log. */
function toPostfix(tokensWithConcat) {
  const output = [];
  const opstack = [];
  const trace = [];

  function snapshot(tok, action) {
    trace.push({
      token: symbolFor(tok),
      action,
      output: output.map(symbolFor),
      opstack: opstack.map(symbolFor),
    });
  }

  for (const tok of tokensWithConcat) {
    if (tok.type === 'SYM' || tok.type === 'EPS') {
      output.push(tok);
      snapshot(tok, 'Push operand to output');
    } else if (tok.type === 'LP') {
      opstack.push(tok);
      snapshot(tok, 'Push ( to operator stack');
    } else if (tok.type === 'RP') {
      while (opstack.length && opstack[opstack.length - 1].type !== 'LP') output.push(opstack.pop());
      opstack.pop(); // discard '('
      snapshot(tok, 'Pop operators until ( , then discard the parentheses');
    } else if (UNARY.has(tok.type)) {
      output.push(tok);
      snapshot(tok, 'Postfix unary operator \u2014 push straight to output');
    } else if (BINARY.has(tok.type)) {
      while (opstack.length && opstack[opstack.length - 1].type !== 'LP' &&
             PRECEDENCE[opstack[opstack.length - 1].type] >= PRECEDENCE[tok.type]) {
        output.push(opstack.pop());
      }
      opstack.push(tok);
      snapshot(tok, `Pop \u2265-precedence operators, then push ${symbolFor(tok)}`);
    }
  }
  while (opstack.length) output.push(opstack.pop());
  trace.push({ token: '\u2014', action: 'Drain remaining operators to output', output: output.map(symbolFor), opstack: [] });
  return { postfix: output, trace };
}

/* ============================================================================
   4. THOMPSON CONSTRUCTION (stack machine over the postfix stream)
      Global position map: positions[stateId] = {x, y}
      Invariant: every fragment at rest has entry.y === exit.y ("the spine").
   ============================================================================ */
function buildNFA(postfix) {
  const L = LAYOUT;
  let counter = 0;
  const positions = {};
  const newState = () => { const id = counter++; positions[id] = { x: 0, y: 0 }; return id; };
  const translate = (frag, dx, dy) => { frag.stateIds.forEach(id => { positions[id].x += dx; positions[id].y += dy; }); };

  function computeExtents(frag) {
    const spineY = positions[frag.entryId].y;
    let minY = Infinity, maxY = -Infinity;
    frag.stateIds.forEach(id => { const p = positions[id]; minY = Math.min(minY, p.y - L.R); maxY = Math.max(maxY, p.y + L.R); });
    minY -= (frag.extraTop || 0);
    maxY += (frag.extraBottom || 0);
    frag.aboveSpine = spineY - minY;
    frag.belowSpine = maxY - spineY;
  }

  function bbox(frag) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    frag.stateIds.forEach(id => {
      const p = positions[id];
      minX = Math.min(minX, p.x - L.R); maxX = Math.max(maxX, p.x + L.R);
      minY = Math.min(minY, p.y - L.R); maxY = Math.max(maxY, p.y + L.R);
    });
    minY -= (frag.extraTop || 0); maxY += (frag.extraBottom || 0);
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  }

  function buildSymbol(sym) {
    const a = newState(), b = newState();
    positions[a] = { x: 0, y: 0 }; positions[b] = { x: L.SYMBOL_GAP, y: 0 };
    const frag = {
      stateIds: [a, b],
      edges: [{ from: a, to: b, symbol: sym, bend: 0 }],
      entryId: a, exitId: b, extraTop: 0, extraBottom: 0,
    };
    computeExtents(frag);
    return frag;
  }

  function buildConcat(A, B) {
    const dx = (positions[A.exitId].x + L.H_GAP) - positions[B.entryId].x;
    const dy = positions[A.exitId].y - positions[B.entryId].y;
    translate(B, dx, dy);
    const frag = {
      stateIds: A.stateIds.concat(B.stateIds),
      edges: A.edges.concat(B.edges, [{ from: A.exitId, to: B.entryId, symbol: null, bend: 0 }]),
      entryId: A.entryId, exitId: B.exitId,
      extraTop: Math.max(A.extraTop, B.extraTop), extraBottom: Math.max(A.extraBottom, B.extraBottom),
    };
    computeExtents(frag);
    return frag;
  }

  function buildUnion(A, B) {
    const s = newState(), f = newState();
    const gap = L.V_GAP;
    const dyA = -(A.belowSpine + gap / 2) - positions[A.entryId].y;
    const dyB = (B.aboveSpine + gap / 2) - positions[B.entryId].y;
    const dxA = L.UNION_STUB - positions[A.entryId].x;
    const dxB = L.UNION_STUB - positions[B.entryId].x;
    translate(A, dxA, dyA); translate(B, dxB, dyB);
    positions[s] = { x: 0, y: 0 };
    const spanA = positions[A.exitId].x - positions[A.entryId].x;
    const spanB = positions[B.exitId].x - positions[B.entryId].x;
    positions[f] = { x: L.UNION_STUB + Math.max(spanA, spanB) + L.UNION_STUB, y: 0 };
    const frag = {
      stateIds: [s, f].concat(A.stateIds, B.stateIds),
      edges: A.edges.concat(B.edges, [
        { from: s, to: A.entryId, symbol: null, bend: 0 },
        { from: s, to: B.entryId, symbol: null, bend: 0 },
        { from: A.exitId, to: f, symbol: null, bend: 0 },
        { from: B.exitId, to: f, symbol: null, bend: 0 },
      ]),
      entryId: s, exitId: f,
      extraTop: Math.max(A.extraTop, B.extraTop), extraBottom: Math.max(A.extraBottom, B.extraBottom),
    };
    computeExtents(frag);
    return frag;
  }

  function buildStar(A) {
    const s = newState(), f = newState();
    const dx = L.STAR_STUB - positions[A.entryId].x;
    translate(A, dx, 0);
    positions[s] = { x: 0, y: positions[A.entryId].y };
    positions[f] = { x: positions[A.exitId].x + L.STAR_STUB, y: positions[A.exitId].y };
    // Bend magnitudes scale with A's own measured height above its spine, so a
    // star wrapped around a deeply-nested fragment still clears it correctly.
    const loopBend = -(A.aboveSpine + L.LOOP_CLEARANCE);
    const bypassBend = -(A.aboveSpine + L.BYPASS_CLEARANCE);
    const frag = {
      stateIds: [s, f].concat(A.stateIds),
      edges: A.edges.concat([
        { from: s, to: A.entryId, symbol: null, bend: 0 },
        { from: s, to: f, symbol: null, bend: bypassBend },
        { from: A.exitId, to: A.entryId, symbol: null, bend: loopBend },
        { from: A.exitId, to: f, symbol: null, bend: 0 },
      ]),
      entryId: s, exitId: f,
      extraTop: Math.max(A.extraTop, -bypassBend + L.CURVE_LABEL_PAD), extraBottom: A.extraBottom,
    };
    computeExtents(frag);
    return frag;
  }

  function buildPlus(A) {
    const s = newState(), f = newState();
    const dx = L.STAR_STUB - positions[A.entryId].x;
    translate(A, dx, 0);
    positions[s] = { x: 0, y: positions[A.entryId].y };
    positions[f] = { x: positions[A.exitId].x + L.STAR_STUB, y: positions[A.exitId].y };
    const loopBend = -(A.aboveSpine + L.LOOP_CLEARANCE);
    const frag = {
      stateIds: [s, f].concat(A.stateIds),
      edges: A.edges.concat([
        { from: s, to: A.entryId, symbol: null, bend: 0 },
        { from: A.exitId, to: A.entryId, symbol: null, bend: loopBend },
        { from: A.exitId, to: f, symbol: null, bend: 0 },
      ]),
      entryId: s, exitId: f,
      extraTop: Math.max(A.extraTop, -loopBend + L.CURVE_LABEL_PAD), extraBottom: A.extraBottom,
    };
    computeExtents(frag);
    return frag;
  }

  function buildOptional(A) {
    const s = newState(), f = newState();
    const dx = L.STAR_STUB - positions[A.entryId].x;
    translate(A, dx, 0);
    positions[s] = { x: 0, y: positions[A.entryId].y };
    positions[f] = { x: positions[A.exitId].x + L.STAR_STUB, y: positions[A.exitId].y };
    const bypassBend = -(A.aboveSpine + L.BYPASS_CLEARANCE);
    const frag = {
      stateIds: [s, f].concat(A.stateIds),
      edges: A.edges.concat([
        { from: s, to: A.entryId, symbol: null, bend: 0 },
        { from: s, to: f, symbol: null, bend: bypassBend },
        { from: A.exitId, to: f, symbol: null, bend: 0 },
      ]),
      entryId: s, exitId: f,
      extraTop: Math.max(A.extraTop, -bypassBend + L.CURVE_LABEL_PAD), extraBottom: A.extraBottom,
    };
    computeExtents(frag);
    return frag;
  }

  const RULES = {
    OR:   { name: 'Union (Alternation)', symbol: '|',
            formula: 'q\u2080 \u2013\u03B5\u2192 q\u2081 , q\u2080 \u2013\u03B5\u2192 q\u2082  \u00B7\u00B7\u00B7  f\u2081 \u2013\u03B5\u2192 f , f\u2082 \u2013\u03B5\u2192 f',
            explain: 'A new start state ε-branches into both operands; both operands ε-join into one new final state. L(r\u200a|\u200as) = L(r) ∪ L(s).' },
    CONCAT: { name: 'Concatenation', symbol: '\u00B7',
            formula: 'f\u2081 \u2013\u03B5\u2192 q\u2082',
            explain: 'The final state of the left fragment gets a single ε-edge into the start state of the right fragment. L(rs) = L(r)\u00B7L(s).' },
    STAR: { name: 'Kleene Star', symbol: '*',
            formula: 'q\u2080\u2013\u03B5\u2192q\u2081 , q\u2080\u2013\u03B5\u2192f , f\u2081\u2013\u03B5\u2192q\u2081 , f\u2081\u2013\u03B5\u2192f',
            explain: 'A new start/final pair is added. The start can skip straight to the final (zero repetitions) or enter the operand; the operand\u2019s exit can loop back for another repetition or finish. L(r*) = ∪\u2096 L(r)\u1d4f, k\u2265\u20090.' },
    PLUS: { name: 'Plus (one-or-more)', symbol: '+',
            formula: 'q\u2080\u2013\u03B5\u2192q\u2081 , f\u2081\u2013\u03B5\u2192q\u2081 , f\u2081\u2013\u03B5\u2192f',
            explain: 'Same as star but without the skip edge \u2014 the operand must be traversed at least once. r+ = r\u00B7r*.' },
    QMARK: { name: 'Optional', symbol: '?',
            formula: 'q\u2080\u2013\u03B5\u2192q\u2081 , q\u2080\u2013\u03B5\u2192f , f\u2081\u2013\u03B5\u2192f',
            explain: 'Same as star but without the loop-back edge \u2014 the operand runs zero or one times. r? = r\u200a|\u200aε.' },
  };

  const stack = [];
  const steps = [];
  const allStateIds = () => stack.reduce((acc, f) => acc.concat(f.stateIds), []);
  const snapshotPositions = ids => { const m = {}; ids.forEach(id => { m[id] = { x: positions[id].x, y: positions[id].y }; }); return m; };
  const cloneStack = () => stack.map(f => ({ stateIds: f.stateIds, edges: f.edges, entryId: f.entryId, exitId: f.exitId, aboveSpine: f.aboveSpine, belowSpine: f.belowSpine, extraTop: f.extraTop, extraBottom: f.extraBottom }));

  postfix.forEach((tok, i) => {
    let rule, before = stack.length, beforeIds = new Set(allStateIds()), token;
    if (tok.type === 'SYM' || tok.type === 'EPS') {
      const isEps = tok.type === 'EPS';
      const frag = isEps ? buildSymbol(null) : buildSymbol(tok.value);
      stack.push(frag);
      token = isEps ? EPS_CHAR : tok.value;
      rule = isEps
        ? { name: 'Epsilon', symbol: EPS_CHAR, formula: 'q\u1d62 \u2013\u03B5\u2192 q\u2c7c', explain: 'Two new states joined by a single ε-move. L(ε) = {ε}.' }
        : { name: 'Symbol', symbol: tok.value, formula: `q\u1d62 \u2013${tok.value}\u2192 q\u2c7c`, explain: `Two new states joined by a single move on the input symbol '${tok.value}'. L(${tok.value}) = {${tok.value}}.` };
    } else {
      const r = RULES[tok.type];
      rule = r; token = r.symbol;
      if (UNARY.has(tok.type)) {
        const A = stack.pop();
        const built = tok.type === 'STAR' ? buildStar(A) : tok.type === 'PLUS' ? buildPlus(A) : buildOptional(A);
        stack.push(built);
      } else {
        const B = stack.pop(), A = stack.pop();
        stack.push(tok.type === 'OR' ? buildUnion(A, B) : buildConcat(A, B));
      }
    }
    const afterIds = allStateIds();
    const newIds = afterIds.filter(id => !beforeIds.has(id));
    steps.push({
      index: i, token, rule: rule.name, formula: rule.formula, explain: rule.explain,
      stack: cloneStack(),
      positions: snapshotPositions(afterIds),
      newStateIds: newIds,
      fragmentsBefore: before, fragmentsAfter: stack.length,
    });
  });

  if (stack.length !== 1) throw new RegexError('Internal error: construction did not reduce to a single fragment.', 0);
  const final = stack[0];
  return {
    steps,
    start: final.entryId,
    accept: new Set([final.exitId]),
    stateIds: final.stateIds,
    edges: final.edges,
    positions: snapshotPositions(final.stateIds),
    stateCount: final.stateIds.length,
    transitionCount: final.edges.length,
    extraTop: final.extraTop || 0,
    extraBottom: final.extraBottom || 0,
  };
}

/* ============================================================================
   5. PIPELINE ENTRY POINT
   ============================================================================ */
function compile(src) {
  const tokens = tokenize(src);
  validate(tokens, src);
  const withConcat = insertConcat(tokens);
  const { postfix, trace } = toPostfix(withConcat);
  const nfa = buildNFA(postfix);
  return { tokens, withConcat, postfix, postfixTrace: trace, nfa };
}

/* ============================================================================
   6. SIMULATION (ε-closure based)
   ============================================================================ */
function epsilonClosure(edges, states) {
  const stack = [...states];
  const closure = new Set(states);
  const epsAdj = {};
  edges.forEach(e => { if (e.symbol === null) { (epsAdj[e.from] = epsAdj[e.from] || []).push(e.to); } });
  while (stack.length) {
    const s = stack.pop();
    (epsAdj[s] || []).forEach(t => { if (!closure.has(t)) { closure.add(t); stack.push(t); } });
  }
  return closure;
}
function move(edges, states, sym) {
  const result = new Set();
  edges.forEach(e => { if (e.symbol === sym && states.has(e.from)) result.add(e.to); });
  return result;
}
function alphabetOf(edges) {
  const set = new Set();
  edges.forEach(e => { if (e.symbol !== null) set.add(e.symbol); });
  return [...set].sort();
}

function simulate(nfa, input) {
  const trace = [];
  let current = epsilonClosure(nfa.edges, new Set([nfa.start]));
  trace.push({ step: 0, symbol: null, moved: null, current: [...current].sort((a, b) => a - b) });
  const alphabet = new Set(alphabetOf(nfa.edges));
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const moved = move(nfa.edges, current, ch);
    if (moved.size === 0) {
      trace.push({ step: i + 1, symbol: ch, moved: [], current: [], stuck: true, outOfAlphabet: !alphabet.has(ch) });
      current = moved;
      break;
    }
    const closed = epsilonClosure(nfa.edges, moved);
    trace.push({ step: i + 1, symbol: ch, moved: [...moved].sort((a, b) => a - b), current: [...closed].sort((a, b) => a - b) });
    current = closed;
  }
  const consumedAll = trace.length === input.length + 1;
  const accepted = consumedAll && [...current].some(id => nfa.accept.has(id));
  return { trace, accepted, consumedAll };
}

/* ============================================================================
   7. TRANSITION TABLE
   ============================================================================ */
function buildTransitionTable(nfa) {
  const alphabet = alphabetOf(nfa.edges);
  const states = [...nfa.stateIds].sort((a, b) => a - b);
  const rows = states.map(id => {
    const row = { id, isStart: id === nfa.start, isAccept: nfa.accept.has(id), cells: {} };
    alphabet.forEach(sym => {
      row.cells[sym] = nfa.edges.filter(e => e.from === id && e.symbol === sym).map(e => e.to).sort((a, b) => a - b);
    });
    row.cells[EPS_CHAR] = nfa.edges.filter(e => e.from === id && e.symbol === null).map(e => e.to).sort((a, b) => a - b);
    return row;
  });
  return { alphabet, rows };
}

/* ---------- exports (Node testing) / attach to window (browser) ---------- */
const ENGINE = {
  LAYOUT, EPS_CHAR, RegexError,
  toSubscript, stateLabel,
  tokenize, validate, insertConcat, toPostfix, buildNFA, compile,
  epsilonClosure, move, alphabetOf, simulate, buildTransitionTable,
};
if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
if (typeof window !== 'undefined') window.ENGINE = ENGINE;
