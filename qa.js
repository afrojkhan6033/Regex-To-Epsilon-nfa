'use strict';
// Browser-level QA: runs the real page in jsdom.  Usage:  node qa.js [path-to-html]
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const defaultHtml = fs.existsSync(path.join(__dirname, 'index.html'))
  ? path.join(__dirname, 'index.html')
  : path.join(__dirname, 'thompson-construction-lab.html');
const htmlPath = process.argv[2] || defaultHtml;
const html = fs.readFileSync(htmlPath, 'utf-8');
let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; failures.push(msg); } }

async function withPage(run) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.org/lab.html' });
  const { window } = dom;
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 900; } });
  window.navigator.clipboard = { writeText: async () => {} };
  const errors = [];
  window.addEventListener('error', e => errors.push(e.error || e.message));
  await new Promise(res => setTimeout(res, 60));
  try { await run(window, dom); } finally { window.close(); }
  return errors;
}

(async () => {
  // ---- 1. default load builds (a|b)*abb immediately ----
  {
    const errors = await withPage(async (window) => {
      const d = window.document;
      ok(d.getElementById('statStates').textContent === '14', 'default hero demo builds 14-state NFA, got ' + d.getElementById('statStates').textContent);
      ok(d.getElementById('postfixBody').children.length > 0, 'postfix table populated on load');
      ok(d.getElementById('stepSvg').children.length > 0, 'step SVG has content on load');
      ok(d.getElementById('finalSvg').children.length > 0, 'final SVG has content on load');
      ok(d.getElementById('transTable').innerHTML.includes('<thead>'), 'transition table populated on load');
      ok(d.getElementById('accordion').children.length === 5, 'accordion has 5 sections');
      ok(d.getElementById('footGrid').children.length === 3, 'footer has 3 columns');
    });
    ok(errors.length === 0, 'no uncaught window errors on default load: ' + errors.map(String).join(' | '));
  }

  // ---- 2. step through every step of several regexes ----
  const regexes = ['a', 'a|b', 'a*', 'a+', 'a?', '(a|b)*abb', 'a(b|c)*d', '0(0|1)*1', '(ab)+', '(a|\u03B5)b*', 'a?b?c?', '((a|b)c)*d+', '(a|b|c)'];
  for (const rx of regexes) {
    const errors = await withPage(async (window) => {
      const d = window.document;
      d.getElementById('regexInput').value = rx;
      window.runBuild();
      const totalMatch = d.getElementById('stepPill').textContent.match(/step \d+ \/ (\d+)/);
      const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;
      ok(total > 0, `${rx}: has steps (pill="${d.getElementById('stepPill').textContent}")`);
      for (let i = 0; i < total; i++) {
        window.goStep(i);
        const svg = d.getElementById('stepSvg');
        ok(svg.querySelectorAll('circle').length > 0, `${rx} step ${i}: has circles`);
        const drawnIds = new Set([...svg.querySelectorAll('text')].map(t => t.textContent).filter(t => /^q/.test(t)));
        ok(drawnIds.size > 0, `${rx} step ${i}: has state labels`);
        [...svg.querySelectorAll('path')].forEach((p, pi) => ok(!/NaN/.test(p.getAttribute('d') || ''), `${rx} step ${i} edge ${pi}: path has no NaN`));
      }
      window.goStep(total - 1);
      window.renderFinalSection();
      const finalSvg = d.getElementById('finalSvg');
      const circles = finalSvg.querySelectorAll('circle');
      const stateCount = parseInt(d.getElementById('statStates').textContent, 10);
      ok(circles.length === stateCount + 1, `${rx}: final svg has exactly one double-ring accept (circles=${circles.length}, states=${stateCount})`);
      [...finalSvg.querySelectorAll('path')].forEach((p, pi) => ok(!/NaN/.test(p.getAttribute('d') || ''), `${rx} final edge ${pi}: path has no NaN`));
      const bodyRows = d.getElementById('transTable').querySelectorAll('tbody tr').length;
      ok(bodyRows === stateCount, `${rx}: transition table has ${stateCount} rows, got ${bodyRows}`);
    });
    ok(errors.length === 0, `${rx}: no uncaught errors while stepping: ` + errors.map(String).join(' | '));
  }

  // ---- 3. simulator end to end ----
  {
    const errors = await withPage(async (window) => {
      const d = window.document;
      d.getElementById('regexInput').value = '(a|b)*abb';
      window.runBuild();
      for (const s of ['abb', 'aababb', 'aab', '', 'xyz']) {
        d.getElementById('simInput').value = s;
        window.runSimulation();
        const verdict = d.getElementById('verdict');
        ok(verdict.classList.contains('show'), `simulate "${s}": verdict shown`);
        ok(verdict.classList.contains('accept') || verdict.classList.contains('reject'), `simulate "${s}": verdict is accept or reject`);
      }
    });
    ok(errors.length === 0, 'no uncaught errors during simulation: ' + errors.map(String).join(' | '));
  }

  // ---- 4. theme toggle ----
  {
    const errors = await withPage(async (window) => {
      const d = window.document;
      window.toggleTheme();
      const t = d.documentElement.getAttribute('data-theme');
      ok(t === 'dark' || t === 'light', 'theme attribute set after toggle');
      window.toggleTheme();
      window.toggleTheme();
    });
    ok(errors.length === 0, 'no uncaught errors during theme toggling: ' + errors.map(String).join(' | '));
  }

  // ---- 5. malformed regex -> clear error, then recovery ----
  {
    const bad = ['*a', '(a', 'a)', '|a', 'a|', '', 'a$b'];
    const errors = await withPage(async (window) => {
      const d = window.document;
      for (const rx of bad) {
        d.getElementById('regexInput').value = rx;
        window.runBuild();
        ok(d.getElementById('errBox').classList.contains('show'), `"${rx}": error box shown`);
        ok(d.getElementById('errMsg').textContent.length > 0, `"${rx}": error message non-empty`);
      }
      d.getElementById('regexInput').value = 'a|b';
      window.runBuild();
      ok(!d.getElementById('errBox').classList.contains('show'), 'error box hidden after a valid rebuild');
      ok(d.getElementById('statStates').textContent !== '\u2014', 'stats populate again after recovering from an error');
    });
    ok(errors.length === 0, 'no uncaught errors while handling malformed regexes: ' + errors.map(String).join(' | '));
  }

  // ---- 6. exports with no downloads capability -> graceful, no throw ----
  {
    const errors = await withPage(async (window) => {
      await window.exportSvg(); await window.exportCsv(); await window.exportReport(); await window.copyTable();
      ok(true, 'export handlers ran without a downloads capability present');
    });
    ok(errors.length === 0, 'no uncaught errors from export handlers without capability: ' + errors.map(String).join(' | '));
  }

  // ---- 7. exports WITH a mocked downloads capability; SVG export must be self-contained ----
  {
    const errors = await withPage(async (window) => {
      const d = window.document;
      const saved = [];
      window.claude = { use: async (name) => name === 'downloads' ? { save: async (req) => { saved.push(req); return { status: 'saved' }; } } : null };
      d.getElementById('regexInput').value = '(a|b)*abb';
      window.runBuild();
      await window.initCapabilities();
      await window.exportSvg(); await window.exportCsv(); await window.exportReport();
      ok(saved.length === 3, 'all three exports called downloads.save, got ' + saved.length);
      const svgReq = saved.find(s => s.filename.endsWith('.svg'));
      ok(svgReq && svgReq.data.includes('<svg'), 'svg export contains svg markup');
      ok(svgReq && !/var\(--/.test(svgReq.data), 'svg export has no CSS var() references (self-contained)');
      const csvReq = saved.find(s => s.filename.endsWith('.csv'));
      ok(csvReq && csvReq.data.split('\n').length > 1, 'csv export has multiple lines');
      const mdReq = saved.find(s => s.filename.endsWith('.md'));
      ok(mdReq && mdReq.data.includes('# Thompson'), 'markdown export has a title');
    });
    ok(errors.length === 0, 'no uncaught errors from export handlers with capability: ' + errors.map(String).join(' | '));
  }

  // ---- 8. geometric regression guard: no edge may pass through a state circle it is not incident to ----
  function parsePathD(d) {
    const nums = d.match(/-?\d+\.?\d*(?:e[-+]?\d+)?/gi);
    if (!nums) return null;
    const n = nums.map(Number);
    if (d.includes(' C ')) {
      return [{ type: 'cubic', p0: { x: n[0], y: n[1] }, c1: { x: n[2], y: n[3] }, c2: { x: n[4], y: n[5] }, p1: { x: n[6], y: n[7] } }];
    }
    const pts = [];
    for (let i = 0; i + 1 < n.length; i += 2) pts.push({ x: n[i], y: n[i + 1] });
    const segs = [];
    for (let i = 0; i + 1 < pts.length; i++) segs.push({ type: 'line', p0: pts[i], p1: pts[i + 1] });
    return segs;
  }
  function sampleSeg(seg, t) {
    if (seg.type === 'line') return { x: seg.p0.x + (seg.p1.x - seg.p0.x) * t, y: seg.p0.y + (seg.p1.y - seg.p0.y) * t };
    const u = 1 - t;
    return {
      x: u * u * u * seg.p0.x + 3 * u * u * t * seg.c1.x + 3 * u * t * t * seg.c2.x + t * t * t * seg.p1.x,
      y: u * u * u * seg.p0.y + 3 * u * u * t * seg.c1.y + 3 * u * t * t * seg.c2.y + t * t * t * seg.p1.y,
    };
  }
  {
    const stress = ['a', 'a|b', 'a*', 'a+', 'a?', '(a|b)*abb', 'a(b|c)*d', '0(0|1)*1', '(ab)+',
      'a?b?c?', '((a|b)c)*d+', '(a|b|c)', '(a|b|c|d|e)*xyz+', '((a*b+)?c|d)*', '((a*b+)?c|d)*e'];
    const errors = await withPage(async (window) => {
      const d = window.document;
      const R = 22; // ENGINE.LAYOUT.R
      for (const rx of stress) {
        d.getElementById('regexInput').value = rx;
        window.runBuild();
        window.renderFinalSection();
        const svg = d.getElementById('finalSvg');
        const circles = [...svg.querySelectorAll('circle')].map(c => ({ x: parseFloat(c.getAttribute('cx')), y: parseFloat(c.getAttribute('cy')) }));
        const centers = [];
        circles.forEach(c => { if (!centers.some(o => Math.hypot(o.x - c.x, o.y - c.y) < 1)) centers.push(c); });
        const paths = [...svg.querySelectorAll('path')].map(p => parsePathD(p.getAttribute('d'))).filter(Boolean);
        let violations = 0;
        paths.forEach(segs => {
          const ends = [segs[0].p0, segs[segs.length - 1].p1];
          centers.forEach(c => {
            if (ends.some(e => Math.hypot(e.x - c.x, e.y - c.y) < R + 3)) return; // incident edge
            segs.forEach(seg => {
              for (let i = 0; i <= 24; i++) {
                const pt = sampleSeg(seg, i / 24);
                if (Math.hypot(pt.x - c.x, pt.y - c.y) < R - 1) { violations++; return; }
              }
            });
          });
        });
        ok(violations === 0, `${rx}: ${violations} edge-through-unrelated-state clearance violation(s)`);
      }
    });
    ok(errors.length === 0, 'no uncaught errors during geometric clearance check: ' + errors.map(String).join(' | '));
  }

  // ---- 9. live simulation highlighting on the final diagram ----
  {
    const errors = await withPage(async (window) => {
      const d = window.document;
      d.getElementById('regexInput').value = '(a|b)*abb';
      window.runBuild();
      d.getElementById('simInput').value = 'abb';
      window.runSimulation();
      ok(d.querySelectorAll('#finalSvg g.sim-active').length > 0, 'running a simulation highlights at least one state on the final diagram');
      const firstChip = d.querySelector('.char-chip[data-step="1"]');
      ok(!!firstChip, 'first character chip is clickable (has data-step)');
      firstChip.click();
      const afterClick = [...d.querySelectorAll('#finalSvg g.sim-active')].map(g => g.getAttribute('data-state'));
      ok(afterClick.length > 0, 'clicking a character chip re-highlights the diagram');
      ok(d.querySelector('.trace-row.active[data-step="1"]'), 'the matching trace row is marked active after clicking the chip');
      window.toggleTheme();
      const afterTheme = [...d.querySelectorAll('#finalSvg g.sim-active')].map(g => g.getAttribute('data-state')).sort();
      ok(JSON.stringify(afterTheme) === JSON.stringify([...afterClick].sort()), 'simulation highlight survives a theme toggle (SVG rebuild)');
      d.getElementById('regexInput').value = 'a|b';
      window.runBuild();
      ok(d.querySelectorAll('#finalSvg g.sim-active').length === 0, 'rebuilding clears any previous simulation highlight');
    });
    ok(errors.length === 0, 'no uncaught errors during simulation-highlight interaction: ' + errors.map(String).join(' | '));
  }

  // ---- 10. no diagram is clipped by its panel: the wrapper box must equal the SCALED svg size ----
  {
    const errors = await withPage(async (window) => {
      const d = window.document;
      const scaleOf = svg => { const m = /scale\(([\d.]+)\)/.exec(svg.style.transform || ''); return m ? parseFloat(m[1]) : NaN; };
      const checkPanel = (label, svgId, innerId) => {
        const svg = d.getElementById(svgId), inner = d.getElementById(innerId);
        const w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height')), z = scaleOf(svg);
        ok(Number.isFinite(z) && z > 0, `${label}: svg has a scale transform`);
        ok(Math.abs(parseFloat(inner.style.width) - w * z) < 0.6, `${label}: wrapper width ${inner.style.width} == svg ${w} x ${z}`);
        ok(Math.abs(parseFloat(inner.style.height) - h * z) < 0.6, `${label}: wrapper height ${inner.style.height} == svg ${h} x ${z}`);
      };
      ok(!/height:\s*\d+px/.test(d.getElementById('finalViewport').getAttribute('style') || ''), 'final panel has no fixed pixel height');
      for (const rx of ['a', '(a|b)*abb', '(a|b|c|d|e)*xyz+', '((a*b+)?c|d)*e']) {
        d.getElementById('regexInput').value = rx;
        window.runBuild();
        window.renderFinalSection();
        checkPanel(`${rx} final`, 'finalSvg', 'finalCanvasInner');
        const total = parseInt(d.getElementById('stepPill').textContent.match(/\/ (\d+)/)[1], 10);
        for (let i = 0; i < total; i++) { window.goStep(i); checkPanel(`${rx} step ${i}`, 'stepSvg', 'stepCanvasInner'); }
      }
    });
    ok(errors.length === 0, 'no uncaught errors during panel-size check: ' + errors.map(String).join(' | '));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log('\nFailures:\n' + failures.map(f => ' - ' + f).join('\n'));
  process.exit(fail ? 1 : 0);
})();
