'use strict';
const E = require('./engine.js');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', msg); }
}
function expectAccept(regex, str, shouldAccept) {
  const { nfa } = E.compile(regex);
  const { accepted } = E.simulate(nfa, str);
  ok(accepted === shouldAccept, `/${regex}/ on "${str}" expected ${shouldAccept} got ${accepted}`);
}
function expectError(regex, label) {
  try { E.compile(regex); ok(false, `${label}: expected error for /${regex}/ but it compiled`); }
  catch (e) { ok(e instanceof E.RegexError, `${label}: /${regex}/ threw non-RegexError`); }
}

/* ---------------- 1. Parser validation ---------------- */
expectError('*a', 'leading star');
expectError('(a', 'unbalanced open paren');
expectError('a)', 'unbalanced close paren');
expectError('|a', 'leading union bar');
expectError('a|', 'trailing union bar');
expectError('', 'empty input');
expectError('a$b', 'illegal character');
expectError('a\\', 'trailing backslash');
expectError('()', 'empty group (no implicit epsilon)');
try { E.compile('(\u03B5)'); ok(true, 'explicit epsilon group compiles'); } catch (e) { ok(false, 'explicit epsilon group should compile: ' + e.message); }

/* ---------------- 2. Structural invariants on NFAs built ---------------- */
[
  'a', 'ab', 'a|b', 'a*', 'a+', 'a?', '(a|b)*abb', 'a(b|c)*d', '0(0|1)*1',
  '(ab)+', '(a|b|c)', 'a?b?c?', '(a|\u03B5)b*', '((a|b)c)*d+',
].forEach(rx => {
  const { nfa } = E.compile(rx);
  ok(nfa.accept.size === 1, `${rx}: exactly one accept state`);
  const outCount = {};
  nfa.edges.forEach(e => { outCount[e.from] = (outCount[e.from] || 0) + 1; });
  const maxOut = Math.max(0, ...Object.values(outCount));
  ok(maxOut <= 2, `${rx}: max out-degree <=2 (got ${maxOut})`);
  const acceptId = [...nfa.accept][0];
  ok(!nfa.edges.some(e => e.from === acceptId), `${rx}: accept state has no outgoing edges`);
  ok(!nfa.edges.some(e => e.to === nfa.start), `${rx}: start state has no incoming edges`);
  nfa.stateIds.forEach(id => ok(!!nfa.positions[id], `${rx}: state ${id} has a position`));
  Object.values(nfa.positions).forEach(p => {
    ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${rx}: finite coordinates`);
  });
});

/* ---------------- 3. Thompson size formula ---------------- */
{
  const { nfa } = E.compile('(a|b)*abb');
  // symbols: a,b (in group) + a + b + b = 5 ; unions:1 ; star:1 => 2*(5+1+1)=14
  ok(nfa.stateCount === 14, `(a|b)*abb has 14 states, got ${nfa.stateCount}`);
}

/* ---------------- 4. Simulator correctness ---------------- */
expectAccept('a', 'a', true);
expectAccept('a', 'b', false);
expectAccept('a', '', false);
expectAccept('a|b', 'a', true);
expectAccept('a|b', 'b', true);
expectAccept('a|b', 'c', false);
expectAccept('ab', 'ab', true);
expectAccept('ab', 'a', false);
expectAccept('a*', '', true);
expectAccept('a*', 'aaaaa', true);
expectAccept('a*', 'aaab', false);
expectAccept('a+', '', false);
expectAccept('a+', 'a', true);
expectAccept('a+', 'aaaa', true);
expectAccept('a?', '', true);
expectAccept('a?', 'a', true);
expectAccept('a?', 'aa', false);
expectAccept('(a|b)*abb', 'abb', true);
expectAccept('(a|b)*abb', 'aababb', true);
expectAccept('(a|b)*abb', 'aab', false);
expectAccept('(a|b)*abb', 'abbb', false); // last 3 chars are "bbb", not "abb"
expectAccept('(a|b)*abb', 'ababb', true);
expectAccept('0(0|1)*1', '01', true);
expectAccept('0(0|1)*1', '0101101', true);
expectAccept('0(0|1)*1', '0110', false);
expectAccept('0(0|1)*1', '1', false);
expectAccept('(ab)+', 'ab', true);
expectAccept('(ab)+', 'abab', true);
expectAccept('(ab)+', 'aba', false);
expectAccept('(ab)+', '', false);
expectAccept('a(\u03B5|b)c', 'ac', true);
expectAccept('a(\u03B5|b)c', 'abc', true);
expectAccept('a(\u03B5|b)c', 'abbc', false);
expectAccept('(a|b|c)*abc', 'abcabcabc', true);
expectAccept('(a|b|c)*abc', 'xyzabc', false);

/* ---------------- 5. Cross-check against native RegExp on random strings ---------------- */
{
  const cases = [
    ['a(b|c)*d', /^a(b|c)*d$/, 'abcd'],
    ['(01)+', /^(01)+$/, '01'],
    ['x?y+z*', /^x?y+z*$/, 'xyz'],
    ['(a|ab)*b', /^(a|ab)*b$/, 'ab'],
  ];
  function randStr(alpha, maxLen) {
    const len = Math.floor(Math.random() * maxLen);
    let s = '';
    for (let i = 0; i < len; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
    return s;
  }
  cases.forEach(([rx, native, alpha]) => {
    const { nfa } = E.compile(rx);
    for (let trial = 0; trial < 300; trial++) {
      const s = randStr(alpha, 8);
      const want = native.test(s);
      const got = E.simulate(nfa, s).accepted;
      ok(got === want, `cross-check /${rx}/ on "${s}": native=${want} engine=${got}`);
    }
  });
}

/* ---------------- 6. Transition table sanity ---------------- */
{
  const { nfa } = E.compile('a|b');
  const table = E.buildTransitionTable(nfa);
  ok(table.alphabet.join(',') === 'a,b', 'alphabet extraction for a|b');
  const startRow = table.rows.find(r => r.isStart);
  ok(!!startRow, 'has a start row');
  ok(startRow.cells[E.EPS_CHAR].length === 2, 'start state of a|b has 2 epsilon moves');
}

/* ---------------- 7. Postfix correctness ---------------- */
{
  const { postfix } = E.compile('(a|b)*abb');
  const seq = postfix.map(t => t.type === 'SYM' ? t.value : t.type);
  ok(seq.join(',') === 'a,b,OR,STAR,a,CONCAT,b,CONCAT,b,CONCAT', `postfix for (a|b)*abb, got ${seq.join(',')}`);
}
{
  const { postfix } = E.compile('ab|c');
  const seq = postfix.map(t => t.type === 'SYM' ? t.value : t.type);
  ok(seq.join(',') === 'a,b,CONCAT,c,OR', `postfix for ab|c, got ${seq.join(',')}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
