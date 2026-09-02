// Extracts the /*CORE-START*/ block from the HTML (single source of truth) and tests it.
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'FSD-PSI.html'), 'utf8');
const m = html.match(/\/\*CORE-START\*\/([\s\S]*?)\/\*CORE-END\*\//);
if (!m) { console.error('CORE block not found'); process.exit(1); }
const mod = { exports: {} };
new Function('module', 'exports', m[1])(mod, mod.exports);
const C = mod.exports;

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? '  got=' + JSON.stringify(extra) : '')); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name, a); }

/* ---------- UI 脚本块语法防线:渲染进程语法错误=整软件白屏,必须在出厂前拦截 ---------- */
(function () {
  const blocks = html.match(/<script>[\s\S]*?<\/script>/g) || [];
  ok(blocks.length >= 3, 'html contains script blocks (' + blocks.length + ')');
  blocks.forEach(function (b, i) {
    const src = b.replace(/^<script>/, '').replace(/<\/script>$/, '');
    let good = true, msg = '';
    try { new Function(src); } catch (e) { good = false; msg = String(e.message); }
    ok(good, 'script block ' + i + ' compiles' + (msg ? ' — ' + msg : ''));
  });
})();

/* ---------- ISO weeks ---------- */
eq(C.weeksInISOYear(2025), 52, 'weeksInISOYear 2025 = 52');
eq(C.weeksInISOYear(2026), 53, 'weeksInISOYear 2026 = 53');
eq(C.weeksInISOYear(2020), 53, 'weeksInISOYear 2020 = 53');
eq(C.weekRangeLabel(2026026), '6/22-6/28', 'W26 2026 = 6/22-6/28 (user-confirmed)');
eq(C.addWeeksP(2025052, 1), 2026001, 'addWeeks across 52-week year end');
eq(C.addWeeksP(2026053, 1), 2027001, 'addWeeks across 53-week year end');
eq(C.refPeriodOf(2026053, 2025), 2025052, 'ref of W53 maps to W52 in 52-week year');
eq(C.futureWeeksOf(2026034).length, 19, 'future weeks W35..W53 = 19');

/* ---------- round5 ---------- */
eq(C.round5(7), 5, 'round5(7)=5');
eq(C.round5(9), 10, 'round5(9)=10');
eq(C.round5(2), 0, 'round5(2)=0');
eq(C.round5(13), 15, 'round5(13)=15');
eq(C.round5(12), 10, 'round5(12)=10');

/* ---------- parseTable: user exact header, TSV ---------- */
const tsv = [
  'Management   Country/Region\tManagement Account Name(D)\tProduct Line\tProduct\tProduct Model\tPeriod ID\tPSI Type\tQTY',
  '哥伦比亚\tBoreal Abastos Corp.\t平板\tACME Slate SE 11-inch\tVantor6-W19DP\t2026026\tSell In\t0',
  '哥伦比亚\tBoreal Abastos Corp.\t平板\tACME Slate SE 11-inch\tVantor6-W19DP\t2026026\tSell Out\t47',
  '哥伦比亚\tBoreal Abastos Corp.\t平板\tACME Slate SE 11-inch\tVantor6-W19DP\t2026026\tInventory\t1,957',
  '哥伦比亚\tBoreal Abastos Corp.\t平板\tACME Slate SE 11-inch\tVantor6-W19DP\t2026026\tDOS\t',
  '哥伦比亚\tBoreal Abastos Corp.\t平板\tACME Slate SE 11-inch\tVantor6-W19DP\t2026026\tInventory1\t1587'
].join('\n');
const p1 = C.parseTable(tsv);
eq(p1.report.header, true, 'TSV header recognized');
eq(p1.rows.length, 5, 'TSV 5 rows parsed');
eq(p1.rows[2].psi, 'inv', 'Inventory -> inv');
eq(p1.rows[2].qty, 1957, 'thousand separator parsed');
eq(p1.rows[4].psi, 'inv1', 'Inventory1 -> inv1 (not swallowed by inventory)');
ok(p1.rows[3].qty === null, 'blank DOS qty -> null');
eq(p1.rows[0].period, 2026026, 'period 2026026');

/* markdown table paste */
const md = [
  '| Management   Country/Region | Management Account Name(D) | Product Line | Product | Product Model | Period ID | PSI Type | QTY |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  '| 哥伦比亚 | SED X | 平板 | P | M1 | 2026026 | Sell Out | 47 |'
].join('\n');
const p2 = C.parseTable(md);
eq(p2.rows.length, 1, 'markdown table parsed, separator row skipped');
eq(p2.rows[0].qty, 47, 'markdown qty');

/* headerless positional */
const p3 = C.parseTable('哥伦比亚\tACC\t平板\tP\tM1\t2026030\tSell Out\t12');
eq(p3.report.header, false, 'headerless detected');
eq(p3.rows.length, 1, 'headerless positional parsed');

/* ---------- parseGrid: numeric cells (xlsx path) + empty-row skip ---------- */
const g1 = C.parseGrid([
  ['Management Country/Region', 'Management Account Name(D)', 'Product Line', 'Product', 'Product Model', 'Period ID', 'PSI Type', 'QTY'],
  ['哥伦比亚', 'ACC X', '平板', 'P1', 'M1', 2026026, 'Sell Out', 47],
  ['', '', '', '', '', '', '', ''],
  ['哥伦比亚', 'ACC X', '平板', 'P1', 'M1', 2026026, 'Inventory', 1957.0]
]);
eq(g1.rows.length, 2, 'parseGrid: numeric period/qty cells parsed');
eq(g1.rows[0].period, 2026026, 'parseGrid: numeric period -> 2026026');
eq(g1.rows[1].qty, 1957, 'parseGrid: numeric qty');
eq(g1.report.total, 2, 'parseGrid: fully-empty row not counted');

/* ---------- mergeFiles: newest wins per cell, in-file dupes sum ---------- */
const mkR = (acc, model, period, psi, qty) => ({ Drift: 'CO', account: acc, Garnet: '平板', product: 'P', model, period, psi, qty });
const mg = C.mergeFiles([
  { name: 'new.xlsx', mtimeMs: 2000, rows: [mkR('A', 'M', 2026030, 'so', 47), mkR('A', 'M', 2026031, 'so', 5)] },
  { name: 'old.xlsx', mtimeMs: 1000, rows: [mkR('A', 'M', 2026030, 'so', 100), mkR('A', 'M', 2026029, 'so', 9), mkR('A', 'M', 2026029, 'so', 1)] }
]);
const mgMap = {};
mg.rows.forEach(r => { mgMap[r.period + ':' + r.psi] = r.qty; });
eq(mgMap['2026030:so'], 47, 'mergeFiles: newer file (mtime) wins overlapping cell');
eq(mgMap['2026029:so'], 10, 'mergeFiles: in-file duplicate rows sum (9+1)');
eq(mgMap['2026031:so'], 5, 'mergeFiles: new-only cell kept');
const mgNew = mg.perFile.find(f => f.name === 'new.xlsx');
eq(mgNew.overridden, 1, 'mergeFiles: overridden count = 1');

/* ---------- audio vs non-audio current window ---------- */
function mkRows(Garnet, weeks) { // weeks: [period, so, inv]
  const rows = [];
  weeks.forEach(function (w) {
    rows.push({ Drift: 'CO', account: 'A', Garnet: Garnet, product: 'P', model: 'M', period: w[0], psi: 'so', qty: w[1] });
    if (w[2] != null) rows.push({ Drift: 'CO', account: 'A', Garnet: Garnet, product: 'P', model: 'M', period: w[0], psi: 'inv', qty: w[2] });
  });
  return rows;
}
const wk = [[2026029, 15, null], [2026030, 20, 800], [2026031, 30, null], [2026032, 25, null], [2026033, 0, null], [2026034, 0, 900]];
const sAudio = C.buildStore(mkRows('音频与智能配件', wk));
const uA = sAudio.units.values().next().value;
const curA = C.unitCurrent(uA, { dosWindow: 4 });
eq(curA.windowWeeks, [2026029, 2026030, 2026031, 2026032], 'audio: window = last 4 weeks with SO>0 (tail zeros skipped)');
eq(curA.dosCalc, 280, 'audio DOS = 900/(90/4/7) = 280');
eq(curA.lastSOP, 2026032, 'audio last reported week = W32');
const sTab = C.buildStore(mkRows('平板', wk));
const uT = sTab.units.values().next().value;
const curT = C.unitCurrent(uT, { dosWindow: 4 });
eq(curT.windowWeeks, [2026031, 2026032, 2026033, 2026034], 'non-audio: zeros are real, window = last 4 weeks');
eq(curT.dosCalc, 458, 'non-audio DOS = 900/(55/4/7) = 458');

/* ---------- classify ---------- */
function yearRows(Garnet, year, fromW, toW, so) {
  const rows = [];
  for (let w = fromW; w <= toW; w++) rows.push({ Drift: 'CO', account: 'A', Garnet: Garnet, product: 'P', model: 'MX', period: C.mkPeriod(year, w), psi: 'so', qty: so });
  return rows;
}
const fw = C.futureWeeksOf(2026034); // W35..53
const sAuto = C.buildStore(yearRows('平板', 2025, 1, 52, 10));
const clsAuto = C.classify(sAuto.units.values().next().value, 2025, fw, {});
eq(clsAuto.status, 'auto', 'full last-year history -> auto');
const sPart = C.buildStore(yearRows('平板', 2025, 1, 20, 10));
const clsPart = C.classify(sPart.units.values().next().value, 2025, fw, {});
eq(clsPart.status, 'partial', '20 early weeks only -> partial (no coverage of W35+)');
eq(clsPart.missing, 19, 'partial missing = all 19 future weeks');
const sNew = C.buildStore(yearRows('平板', 2026, 20, 34, 10));
const clsNew = C.classify(sNew.units.values().next().value, 2025, fw, {});
eq(clsNew.status, 'new', '2026-only history -> new');

/* ---------- forecast ---------- */
const sF = C.buildStore(yearRows('平板', 2025, 1, 52, 100));
const uF = sF.units.values().next().value;
const base = { unit: uF, store: sF, futureWeeks: [2026040], refYear: 2025, decision: null, growth: null, kdef: {}, kedit: {}, ovSO: null, cfg: { roundTo: 5 }, cls: { status: 'auto' } };
eq(C.buildForecastForUnit(base)[0], { p: 2026040, so: 100, src: 'ref' }, 'auto self: copy last-year same week');
eq(C.buildForecastForUnit(Object.assign({}, base, { growth: 1.1 }))[0].so, 110, 'growth 1.1 -> 110');
eq(C.buildForecastForUnit(Object.assign({}, base, { kedit: { 40: 1.2 } }))[0].so, 120, 'kedit 1.2 over default 1 -> 120');
eq(C.buildForecastForUnit(Object.assign({}, base, { ovSO: { 2026040: 7 } }))[0], { p: 2026040, so: 7, src: 'override' }, 'override kept exact (no rounding)');
const fcNone = C.buildForecastForUnit(Object.assign({}, base, { cls: { status: 'new' } }));
eq(fcNone[0].src, 'none', 'new without decision -> none (no fabrication)');
const fcBase = C.buildForecastForUnit(Object.assign({}, base, { cls: { status: 'new' }, decision: { mode: 'base', base: 22 } }));
eq(fcBase[0].so, 20, 'base mode 22 -> round5 -> 20');
/* fill: week without last-year data */
const sFill = C.buildStore(yearRows('平板', 2025, 1, 30, 60));
const uFill = sFill.units.values().next().value;
const fcFill = C.buildForecastForUnit({ unit: uFill, store: sFill, futureWeeks: [2026045], refYear: 2025, decision: { mode: 'self' }, growth: null, kdef: {}, kedit: {}, ovSO: null, cfg: { roundTo: 5 }, cls: { status: 'partial' } });
eq(fcFill[0], { p: 2026045, so: 60, src: 'fill' }, 'missing ref week -> mean fill (60)');

/* ---------- simulate ---------- */
const simUnitRows = mkRows('平板', [[2026033, 70, null], [2026034, 70, 1000]]);
const sSim = C.buildStore(simUnitRows);
const uSim = sSim.units.values().next().value;
const curSim = C.unitCurrent(uSim, { dosWindow: 4 });
curSim.curInv1 = 400; // craft: INV1 not in rows
const fcSim = [{ p: 2026035, so: 70, src: 'ref' }, { p: 2026036, so: 70, src: 'ref' }];
const sim = C.simulateUnit({ unit: uSim, cur: curSim, forecast: fcSim, params: { trigger: 90, target: 120, downTarget: 60 }, cfg: { dosWindow: 4, roundTo: 5 }, ovSI: null });
eq(sim.rows[0].si, 0, 'w1: DOS 93 >= trigger 90 -> no SI');
eq(sim.rows[0].st, 70, 'w1: ST tops downstream back to 60d');
eq(sim.rows[1].si, 340, 'w2: DOS 86 < 90 -> SI to 120d = 340');
eq(sim.rows[1].inv, 1200, 'w2: INV = 860+340 = 1200');
eq(sim.rows[1].dos, 120, 'w2: DOS back to 120');
ok(sim.rows.every(r => r.inv1 >= 0 && r.si >= 0 && r.st >= 0), 'invariants: si/st/inv1 >= 0');
const simB = C.simulateUnit({ unit: uSim, cur: curSim, forecast: [{ p: 2026035, so: null, src: 'none' }], params: { trigger: 90, target: 120, downTarget: 60 }, cfg: {}, ovSI: null });
eq(simB.blocked, true, 'unconfirmed forecast blocks simulation');

/* ---------- hist ST derivation ---------- */
const stRows = [
  { Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', model: 'M', period: 2026030, psi: 'inv1', qty: 500 },
  { Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', model: 'M', period: 2026031, psi: 'inv1', qty: 450 },
  { Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', model: 'M', period: 2026031, psi: 'si', qty: 100 }
];
const uST = C.buildStore(stRows).units.values().next().value;
eq(C.deriveHistST(uST).get(2026031), 150, 'hist ST = 500+100-450 = 150');

/* ---------- sample E2E ---------- */
const sampleTSV = C.genSampleTSV();
const ps = C.parseTable(sampleTSV);
eq(ps.report.badPeriod + ps.report.badPsi + ps.report.noKey, 0, 'sample TSV: zero bad rows');
const st = C.buildStore(ps.rows);
eq(st.units.size, 10, 'sample: 10 units');
eq(st.maxPeriod, 2026034, 'sample: data through 2026 W34');
const fw2 = C.futureWeeksOf(st.maxPeriod);
const statuses = {};
st.units.forEach(function (u) { statuses[u.key] = C.classify(u, 2025, fw2, {}).status; });
const count = { auto: 0, partial: 0, new: 0 };
Object.values(statuses).forEach(s => count[s]++);
eq(count, { auto: 6, partial: 1, new: 3 }, 'sample statuses: 6 auto / 1 partial / 3 new');
/* audio distortion: system DOS (zeros included) > our DOS (zeros skipped) */
const seSE3 = st.units.get('哥伦比亚::Boreal Abastos Corp.::Tidal-T20');
ok(!!seSE3, 'sample has SED Tidal-T20');
ok(seSE3.audio, 'Tidal-T20 is audio Garnet');
const curSE3 = C.unitCurrent(seSE3, { dosWindow: 4 });
ok(curSE3.sysDos != null && curSE3.dosCalc != null && curSE3.sysDos > curSE3.dosCalc,
  'audio distortion visible: system DOS ' + curSE3.sysDos + ' > calc DOS ' + curSE3.dosCalc);
eq(curSE3.lastSOP, 2026032, 'SED audio last reported = W32');
/* full pipeline for the big tablet unit */
const uW19 = st.units.get('哥伦比亚::Boreal Abastos Corp.::Vantor6-W19DP');
const layers = C.seasonIndexLayers(st, 2025);
ok(layers.Garnet['平板'] && Object.keys(layers.Garnet['平板']).length >= 40, 'season index built for tablet Garnet');
ok(layers.acctLine['Boreal Abastos Corp.|平板'], 'account-layer index exists');
const klW19 = C.pickKLayer([layers], uW19);
eq(klW19.key, 'CP|Boreal Abastos Corp.|ACME Slate SE 11-inch', 'pickKLayer prefers 渠道×产品 layer (>=16 weeks), account layer next');
ok(!!layers.acctProduct['Boreal Abastos Corp.|ACME Slate SE 11-inch'], 'account×product layer exists for sample unit');
const curW19 = C.unitCurrent(uW19, { dosWindow: 4 });
const clsW19 = C.classify(uW19, 2025, fw2, {});
const fcW19 = C.buildForecastForUnit({ unit: uW19, store: st, futureWeeks: fw2, refYear: 2025, decision: null, growth: null, kdef: klW19.kdef, kedit: {}, ovSO: null, cfg: { roundTo: 5 }, cls: clsW19 });
ok(fcW19.every(f => f.so != null), 'W19DP fully forecast (no gaps)');
ok(fcW19.every(f => f.so % 5 === 0), 'all forecast SO rounded to 5');
const simW19 = C.simulateUnit({ unit: uW19, cur: curW19, forecast: fcW19, params: { trigger: 90, target: 120, downTarget: 60 }, cfg: { dosWindow: 4, roundTo: 5 }, ovSI: null });
ok(!simW19.blocked && simW19.yearEnd && simW19.yearEnd.inv > 0, 'W19DP simulated to year end, INV > 0');
ok(simW19.rows.some(r => r.si > 0), 'replenishment fired at least once');
ok(simW19.rows.every(r => r.si % 5 === 0 && r.st % 5 === 0 || r.st === Math.min(r.st, Number.MAX_SAFE_INTEGER)), 'SI rounded to 5');
/* Kids unit: zero SO forever -> DOS null, sim flat, no replenish */
const uKids = st.units.get('哥伦比亚::Boreal Abastos Corp.::Vantor6-W09BE');
const curKids = C.unitCurrent(uKids, { dosWindow: 4 });
ok(curKids.dosCalc === null, 'Kids: DOS null (no SO ever)');
eq(C.classify(uKids, 2025, fw2, {}).status, 'new', 'Kids: classified new (no SO history)');
const fcKids = C.buildForecastForUnit({ unit: uKids, store: st, futureWeeks: fw2, refYear: 2025, decision: { mode: 'skip' }, growth: null, kdef: {}, kedit: {}, ovSO: null, cfg: {}, cls: { status: 'new' } });
const simKids = C.simulateUnit({ unit: uKids, cur: curKids, forecast: fcKids, params: { trigger: 90, target: 120, downTarget: 60 }, cfg: {}, ovSI: null });
ok(simKids.yearEnd.inv === curKids.curInv && simKids.rows.every(r => r.si === 0), 'Kids skip: INV flat, no SI');

/* ---------- 下游渠道:period W 格式 / Purchase / 渠道映射 ---------- */
const pw = C.parseTable('加拿大\tKEYSTONE (Amazon FBA)_Indirect Retailer\t音频与智能配件\tSonicClip\t音频耳夹德芙产品项目\tLark-T00\t2026W01\tPurchase\t3');
eq(pw.rows.length, 1, 'retail row: 2026W01 + Purchase parsed (headerless 9-col)');
eq(pw.rows[0].period, 2026001, 'period 2026W01 -> 2026001');
eq(pw.rows[0].psi, 'si', 'Purchase -> si');
eq(pw.rows[0].series, '音频耳夹德芙产品项目', 'series column captured');
const gRetail = C.parseGrid([
  ['Purchase   Country/Region', 'Channel Name(R)', 'Product Line', 'Product', 'Product Series', 'Product Model', 'Period ID', 'PSI Type', 'QTY'],
  ['加拿大', 'ANDINA COMERCIO_Indirect Retailer', '音频与智能配件', 'SonicBuds 6i', 'Manta', 'Manta-T100', '2026W01', 'Inventory1', 13],
  ['加拿大', 'ANDINA COMERCIO_Indirect Retailer', '音频与智能配件', 'SonicBuds 6i', 'Manta', 'Manta-T100', '2026W01', 'DOS1', '']
]);
eq(gRetail.report.header, true, 'retail header recognized (Channel Name -> account)');
eq(gRetail.rows[0].psi, 'inv1', 'retail Inventory1 parsed');
ok(gRetail.rows[1].psi === 'dos' && gRetail.rows[1].qty === null, 'DOS1 -> dos, blank qty null');
/* buildStore retail: inv1 落到 inv */
const rRows = gRetail.rows.slice();
C.applyChannelMap(rRows);
ok(rRows[0].unmapped === true && rRows[0].account === 'ANDINA COMERCIO_Indirect Retailer', 'unmapped channel keeps raw name + flag');
const rStore = C.buildStore(rRows, { retail: true });
const rU = rStore.units.values().next().value;
eq(rU.weeks.get(2026001).inv, 13, 'retail store: Inventory1 -> inv field');
/* channel map: FBA/FBM 合并 */
eq(C.mapChannel('KEYSTONE (Amazon FBA)_Indirect Retailer'), 'CA-Amazon', 'map FBA -> CA-Amazon');
eq(C.mapChannel('MERIDIAN RETAIL_Indirect Retailer'), 'CA-Amazon', 'map FBM -> CA-Amazon');
eq(C.mapChannel('SOURCE IS NULL'), 'Others', 'SOURCE IS NULL -> Others');
eq(C.mapChannel('REGIA SUMINISTROS_Indirect Retailer'), 'MX-REGIA SUMINISTROS', 'REGIA SUMINISTROS variant maps');
ok(C.mapChannel('nobody') === null, 'unknown channel -> null');

/* ---------- 月末周 ---------- */
const mes = C.monthEndPeriods(2026034);
eq(mes.map(x => x.p), [2026036, 2026040, 2026044, 2026049, 2026053], 'month-end weeks Aug..Dec 2026');
eq(mes.map(x => x.m), [8, 9, 10, 11, 12], 'month-end months');
eq(mes[4].label, '年底(12月)', 'Dec end = year end (W53)');
ok(mes.some(x => x.m === 10 && x.p === 2026044), 'Oct end = W44 (10/26-11/1 contains 10/31)');
/* 2025 年 12 月底所在 ISO 周属于 2026 -> 回落到 2025W52 */
const mes25 = C.monthEndPeriods(2025050);
eq(mes25[mes25.length - 1].p, 2025052, '2025 Dec-end ISO week belongs to 2026 -> falls back to 2025W52');
/* 数据已到最后一周:月末全在过去,只剩年底占位,不崩 */
const mesFull = C.monthEndPeriods(2026053);
ok(Array.isArray(mesFull) && mesFull.length === 1 && mesFull[0].p === 2026053, 'data at W53: only year-end placeholder, no crash');
/* 一位数周号 2026W1 */
const pw1 = C.parseTable('CA\tCH_X\t平板\tP\tS\tM1\t2026W1\tSell Out\t3');
eq(pw1.rows.length && pw1.rows[0].period, 2026001, 'single-digit 2026W1 parsed');

/* ---------- 下游预测 + 零补货模拟 ---------- */
const rfRows = [];
for (let w = 20; w <= 34; w++) rfRows.push({ Drift: 'CA', account: 'X', Garnet: '平板', product: 'P', series: '', model: 'M', period: C.mkPeriod(2026, w), psi: 'so', qty: 14 });
rfRows.push({ Drift: 'CA', account: 'X', Garnet: '平板', product: 'P', series: '', model: 'M', period: 2026034, psi: 'inv1', qty: 200 });
const rfStore = C.buildStore(rfRows, { retail: true });
const rfU = rfStore.units.values().next().value;
const rfCur = C.unitCurrent(rfU, { dosWindow: 4 });
eq(rfCur.curInv, 200, 'retail current inv from inv1');
const rfFw = [2026035, 2026036];
const rfFc = C.buildRetailForecast({ unit: rfU, futureWeeks: rfFw, refYear: 2025, kdef: {}, kedit: {}, ovSO: null, cfg: { roundTo: 5 }, cur: rfCur });
eq(rfFc[0], { p: 2026035, so: 15, src: 'avg' }, 'retail forecast: no last-year -> avg4 (14->15) x coef');
const rfSim = C.simulateRetail({ unit: rfU, cur: rfCur, forecast: rfFc, cfg: { dosWindow: 4, roundTo: 5 }, ovSI: null });
eq(rfSim.rows[0].inv, 185, 'retail sim: zero-purchase drain 200-15');
eq(rfSim.rows[1].inv, 170, 'retail sim: drain continues');
ok(rfSim.rows[0].buy === 0 && rfSim.rows[0].daily > 0, 'retail sim: buy=0, daily recorded');
/* 库存打到 0 不为负 */
const rfSim2 = C.simulateRetail({ unit: rfU, cur: rfCur, forecast: [{ p: 2026035, so: 500, src: 'override' }], cfg: {}, ovSI: null });
eq(rfSim2.rows[0].inv, 0, 'retail sim: inventory clamped at 0');

/* ---------- CSV 通路:引号逗号渠道名 / 分号分隔 / 编码嗅探 ---------- */
const csvRetail = [
  'Purchase Country/Region,Channel Name(R),Product Line,Product,Product Series,Product Model,Period ID,PSI Type,QTY',
  '哥斯达黎加,"PACIFICA ALMACENES S.A._Indirect Retailer",音频与智能配件,SonicBuds SE 3,低成本TWS耳机,ULC-CT020,2026W10,Inventory1,25',
  '哥斯达黎加,"PACIFICA ALMACENES S.A._Indirect Retailer",音频与智能配件,SonicBuds SE 3,低成本TWS耳机,ULC-CT020,2026W10,Sell Out,5'
].join('\n');
const pcsv = C.parseTable(csvRetail);
eq(pcsv.rows.length, 2, 'retail CSV: rows with quoted comma channel name parsed');
eq(pcsv.rows[0].account, 'PACIFICA ALMACENES S.A._Indirect Retailer', 'CSV quoted account intact');
eq(C.mapChannel(pcsv.rows[0].account), 'CR-UNION', 'quoted CSV channel maps to CR-UNION');
eq(pcsv.rows[0].period, 2026010, 'CSV 2026W10 period');
const psemi = C.parseTable('哥伦比亚;ACC;平板;P;S;M1;2026W05;Sell Out;12');
eq(psemi.rows.length, 1, 'semicolon CSV parsed');
eq(psemi.rows[0].qty, 12, 'semicolon CSV qty');
eq(psemi.report.mode, 'csv;', 'semicolon mode reported');
const Garnet9 = '加拿大\tCH_X\t平板\tP\tS\tM\t2026W02\tSell Out\t7';
eq(C.parseTable(C.decodeSmart(Buffer.from('\ufeff' + Garnet9, 'utf16le'))).rows.length, 1, 'decodeSmart: UTF-16LE with BOM');
eq(C.parseTable(C.decodeSmart(Buffer.from(Garnet9, 'utf16le'))).rows.length, 1, 'decodeSmart: UTF-16LE without BOM (NUL heuristic)');
ok(!C.decodeSmart(Buffer.from('\ufeffabc', 'utf8')).startsWith('\ufeff'), 'decodeSmart: UTF-8 BOM stripped');
ok(C.decodeSmart(Buffer.from('哥伦比亚,平板', 'utf8')) === '哥伦比亚,平板', 'decodeSmart: plain UTF-8 passthrough');

/* ---------- 下游示例 E2E ---------- */
const rsTSV = C.genRetailSampleTSV();
const rsParsed = C.parseTable(rsTSV);
eq(rsParsed.report.badPeriod + rsParsed.report.badPsi + rsParsed.report.noKey, 0, 'retail sample: zero bad rows');
const rsMap = C.applyChannelMap(rsParsed.rows);
const rsStore = C.buildStore(rsParsed.rows, { retail: true });
eq(rsStore.units.size, 7, 'retail sample: 7 units (FBA+FBM merged into CA-Amazon)');
ok(rsStore.units.has('加拿大' + C.SEP + 'CA-Amazon' + C.SEP + 'ULC-CT020'), 'CA-Amazon merged unit exists');
const amz = rsStore.units.get('加拿大' + C.SEP + 'CA-Amazon' + C.SEP + 'ULC-CT020');
eq(amz.rawNames.length, 2, 'CA-Amazon keeps 2 raw names');
ok(rsMap.names.indexOf('ANDINA COMERCIO_Indirect Retailer') >= 0, 'ANDINA COMERCIO reported unmapped');
ok(rsStore.maxPeriod === 2026034, 'retail sample through W34');
const dead = rsStore.units.get('哥伦比亚' + C.SEP + 'CO-Andaria' + C.SEP + 'Aris-B19F');
const deadCur = C.unitCurrent(dead, { dosWindow: 4 });
ok(deadCur.curInv === 40 && deadCur.dosCalc === null, 'dead-stock unit: inv 40, DOS null (no movement)');

/* ---------- pickKLayer 层级优先与回退链 ---------- */
const uX = { account: 'ACC', Garnet: '平板', Drift: 'CO', product: 'P' };
eq(C.pickKLayer([{ acctLine: { 'ACC|平板': { 1: 1 } }, DriftLine: { 'CO|平板': { 1: 1 } }, Garnet: {}, GarnetProduct: {}, global: {} }], uX).key,
  'A|ACC|平板', 'account layer wins over Drift layer');
eq(C.pickKLayer([{ acctLine: {}, DriftLine: {}, GarnetProduct: {}, Garnet: { '平板': { 1: 1 } }, global: {} }], uX).key,
  'L|平板', 'falls to Garnet layer');
eq(C.pickKLayer([{ acctLine: {}, DriftLine: {}, GarnetProduct: {}, Garnet: {}, global: {} },
  { acctLine: { 'ACC|平板': { 2: 1.5 } }, DriftLine: {}, GarnetProduct: {}, Garnet: {}, global: {} }], uX).key,
  'A|ACC|平板', 'second source in chain (FSD fallback) still found');

/* ---------- exemptThreshold 三级优先 ---------- */
const EX = { global: 100, Garnet: { '平板': 50 }, model: { 'M9': 10 } };
eq(C.exemptThreshold(EX, '平板', 'M9'), 10, 'model override wins');
eq(C.exemptThreshold(EX, '平板', 'M1'), 50, 'Garnet default next');
eq(C.exemptThreshold(EX, '手机', 'M1'), 100, 'global last');
eq(C.exemptThreshold({ global: null, Garnet: {}, model: {} }, '平板', 'M1'), null, 'all empty -> null (no exemption)');
eq(C.exemptThreshold({ global: 100, Garnet: { '平板': '' }, model: {} }, '平板', 'M1'), 100, 'empty-string Garnet falls through to global');

/* ---------- learnReplenish: 渠道自己的触发/目标 ---------- */
(function () {
  const rows = [];
  let inv = 1000;
  for (let w = 1; w <= 17; w++) {
    const si = (w === 6 || w === 11 || w === 16) ? 600 : 0;
    inv = inv + si - 70;
    rows.push({ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', model: 'M', period: C.mkPeriod(2026, w), psi: 'so', qty: 70 });
    rows.push({ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', model: 'M', period: C.mkPeriod(2026, w), psi: 'inv', qty: inv });
    if (si) rows.push({ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', model: 'M', period: C.mkPeriod(2026, w), psi: 'si', qty: si });
  }
  const uL = C.buildStore(rows).units.values().next().value;
  const learned = C.learnReplenish(uL, { dosWindow: 4 });
  ok(learned && learned.n === 3, 'learnReplenish: 3 events detected');
  eq(learned.trigger, 90, 'learned trigger = median pre-SI DOS (65/90/115 -> 90)');
  eq(learned.target, 143, 'learned target = median post-SI DOS (118/143/168 -> 143)');
  const uShort = C.buildStore(rows.filter(r => C.periodW(r.period) <= 12)).units.values().next().value;
  ok(C.learnReplenish(uShort, { dosWindow: 4 }) === null, 'fewer than 3 events -> null (use Garnet defaults)');
})();

/* ---------- stPlan: ST 可行性 ---------- */
(function () {
  const hist = new Map();
  for (let w = 10; w <= 19; w++) hist.set(C.mkPeriod(2026, w), 100);
  const okCase = C.stPlan({ histST: hist, curYear: 2026, maxPeriod: 2026034, inv1: 1500, kSum: 19 });
  eq(okCase.avgST, 100, 'stPlan avg = 100/wk');
  eq(okCase.canST, 1900, 'stPlan canST = 100 x 19');
  ok(okCase.endLeft === 0 && okCase.verdict === 'ok', 'stPlan: can clear by year end');
  const part = C.stPlan({ histST: hist, curYear: 2026, maxPeriod: 2026034, inv1: 2500, kSum: 19 });
  ok(part.endLeft === 600 && part.verdict === 'part', 'stPlan: over half digestible -> part, left 600');
  const stuck = C.stPlan({ histST: new Map(), curYear: 2026, maxPeriod: 2026034, inv1: 500, kSum: 19 });
  eq(stuck.verdict, 'stuck', 'stPlan: no ST record -> stuck');
})();

/* ---------- sanityCheck: 相邻月数量级哨兵 ---------- */
(function () {
  const rows = [];
  for (let w = 31; w <= 34; w++) rows.push({ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', model: 'M', period: C.mkPeriod(2026, w), psi: 'so', qty: 100 });
  const uS = C.buildStore(rows).units.values().next().value;
  const curS = C.unitCurrent(uS, { dosWindow: 4 });
  const mkFc = v => { const out = []; for (let w = 35; w <= 42; w++) out.push({ p: C.mkPeriod(2026, w), so: v, src: 'fill' }); return out; };
  const wHigh = C.sanityCheck({ forecast: mkFc(1000), unit: uS, cur: curS, kdef: {}, kedit: {} });
  ok(wHigh.length >= 1 && wHigh[0].type === 'high', 'sanity: 10x jump vs recent actual flagged');
  eq(C.sanityCheck({ forecast: mkFc(100), unit: uS, cur: curS, kdef: {}, kedit: {} }).length, 0, 'sanity: same level -> no warning');
  /* 大促系数放大到 4x 时,4x 推演不报警(系数比抬高限值) */
  const kdefBig = {}; for (let w = 35; w <= 42; w++) kdefBig[w] = 4;
  eq(C.sanityCheck({ forecast: mkFc(400), unit: uS, cur: curS, kdef: kdefBig, kedit: {} }).length, 0, 'sanity: 4x jump allowed when week coef is 4x');
})();

/* ---------- 年末收官:去年月末口径 + 检查点约束 ---------- */
eq(C.monthEndPeriodOf(2026, 10), 2026044, 'monthEndPeriodOf Oct 2026 = W44');
eq(C.monthEndPeriodOf(2025, 12), 2025052, 'monthEndPeriodOf Dec 2025 falls back to W52');
eq(C.medianOf([70, 70, 300, 70, 70]), 70, 'median ignores promo spike');
(function () {
  /* 去年:全年周销70,10月末(2025044)库存900 → 平销DOS=900/(70/7)=90 */
  const rows = [];
  for (let w = 1; w <= 52; w++) {
    rows.push({ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', model: 'M', period: C.mkPeriod(2025, w), psi: 'so', qty: 70 });
    if (w === 44) rows.push({ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', model: 'M', period: C.mkPeriod(2025, w), psi: 'inv', qty: 900 });
    if (w === 49) rows.push({ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', model: 'M', period: C.mkPeriod(2025, w), psi: 'inv', qty: 700 });
    if (w === 52) rows.push({ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', model: 'M', period: C.mkPeriod(2025, w), psi: 'inv', qty: 500 });
  }
  const stLY = C.buildStore(rows);
  const caps = C.lastYearMonthEndCaps(stLY, 2025);
  ok(caps['平板'] && caps['平板'][10] && caps['平板'][10].dos === 90, 'lastYear Oct-end flat DOS = 90');
  eq(caps['平板'][12].dos, 50, 'lastYear Dec-end flat DOS = 50');
})();
(function () {
  /* 大促场景:平销70/周,W45-48爆到280;无约束会在大促期大量补货 → 年底库存高;
     加检查点(12月底 cap50,平销日均10)后年底库存 ≤ 500+取整容差 */
  const rows = [[2026031, 70, null], [2026032, 70, null], [2026033, 70, null], [2026034, 70, 800]];
  const mk = rows.map(function (w) {
    const out = [{ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', model: 'M', period: w[0], psi: 'so', qty: w[1] }];
    if (w[2] != null) out.push({ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', model: 'M', period: w[0], psi: 'inv', qty: w[2] });
    return out;
  }).reduce(function (a, b) { return a.concat(b); }, []);
  const stC = C.buildStore(mk);
  const uC = stC.units.values().next().value;
  const curC = C.unitCurrent(uC, { dosWindow: 4 });
  curC.curInv1 = 300;
  const fw3 = C.futureWeeksOf(2026034);
  const fcC = fw3.map(function (p) { const w = C.periodW(p);
    return { p: p, so: (w >= 45 && w <= 48) ? 280 : 70, src: 'ref' }; });
  const params = { trigger: 90, target: 120, downTarget: 60 };
  const noCap = C.simulateUnit({ unit: uC, cur: curC, forecast: fcC, params: params, cfg: { dosWindow: 4, roundTo: 5 }, ovSI: null });
  const dailyBase = C.medianOf(fcC.map(function (f) { return f.so; })) / 7;
  eq(Math.round(dailyBase * 7), 70, 'dailyBase = median weekly 70 (spike excluded)');
  const cps = [{ p: C.monthEndPeriodOf(2026, 10), idx: fw3.indexOf(C.monthEndPeriodOf(2026, 10)), cap: 100 },
               { p: C.monthEndPeriodOf(2026, 11), idx: fw3.indexOf(C.monthEndPeriodOf(2026, 11)), cap: 70 },
               { p: C.mkPeriod(2026, 53), idx: fw3.indexOf(C.mkPeriod(2026, 53)), cap: 50 }];
  const capped = C.simulateUnit({ unit: uC, cur: curC, forecast: fcC, params: params, cfg: { dosWindow: 4, roundTo: 5 }, ovSI: null, checkpoints: cps, dailyBase: dailyBase });
  ok(noCap.yearEnd.inv > 50 * dailyBase + 10, 'without caps: year-end inv blows past 50-day flat cap (' + noCap.yearEnd.inv + ')');
  ok(capped.yearEnd.inv <= 50 * dailyBase + 5, 'with caps: year-end inv <= 50d x flat daily (+round tol), got ' + capped.yearEnd.inv);
  ok(capped.rows.some(function (r) { return r.si > 0; }), 'with caps: replenishment still happens earlier (stocking not killed)');
  /* 11月底检查点也达标 */
  const r11 = capped.rows.filter(function (r) { return r.p === C.monthEndPeriodOf(2026, 11); })[0];
  ok(r11 && r11.inv <= 70 * dailyBase + 5, 'Nov-end checkpoint also honored, got ' + (r11 && r11.inv));
})();

/* ---------- 渠道别名 + Others 注释 ---------- */
(function () {
  const mkr = function (name) { return { Drift: 'CA', account: name, Garnet: '平板', product: 'P', series: '', model: 'M', period: 2026001, psi: 'so', qty: 1 }; };
  const rows = [mkr('SOURCE IS NULL'), mkr('Weird Channel Co.'), mkr('KEYSTONE (Amazon FBA)_Indirect Retailer')];
  C.applyChannelMap(rows, null);
  eq(rows[0].account, 'Others(SOURCE IS NULL)', 'Others keeps raw name in parentheses');
  ok(rows[1].unmapped === true && rows[1].account === 'Weird Channel Co.', 'unmapped keeps raw');
  eq(rows[2].account, 'CA-Amazon', 'builtin map still works');
  /* 别名优先 + 幂等重放 */
  C.applyChannelMap(rows, { 'Weird Channel Co.': 'CA-WEIRD', 'KEYSTONE (Amazon FBA)_Indirect Retailer': 'CA-Amazon-FBA' });
  eq(rows[1].account, 'CA-WEIRD', 'alias applied on re-run (idempotent via rawAccount)');
  eq(rows[2].account, 'CA-Amazon-FBA', 'alias overrides builtin map');
  C.applyChannelMap(rows, null);
  eq(rows[2].account, 'CA-Amazon', 'clearing alias restores builtin on re-run');
})();

/* ---------- 收尾判定 + 下游库存硬约束 ---------- */
(function () {
  /* 收尾判定:库存/均销 ≤ 阈值周数 */
  ok(C.isTailUnit({ avgWeeklySO: 20, curInv: 100 }, 12) === true, 'tail: 5-week stock <= 12w threshold');
  ok(C.isTailUnit({ avgWeeklySO: 20, curInv: 1000 }, 12) === false, 'not tail: 50-week stock');
  ok(C.isTailUnit({ avgWeeklySO: 0, curInv: 100 }, 12) === false, 'no movement -> not tail (handled by zero-movement flag)');
  /* 收尾预测:平推近4周均量,不乘系数、不参考去年 */
  const rows = [];
  for (let w = 31; w <= 34; w++) rows.push({ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', series: '', model: 'M', period: C.mkPeriod(2026, w), psi: 'so', qty: 20 });
  for (let w = 31; w <= 53; w++) rows.push({ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', series: '', model: 'M', period: C.mkPeriod(2025, w), psi: 'so', qty: 300 });  // 去年正旺
  rows.push({ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', series: '', model: 'M', period: 2026034, psi: 'inv1', qty: 90 });
  const stT = C.buildStore(rows, { retail: true });
  const uT2 = stT.units.values().next().value;
  const curT2 = C.unitCurrent(uT2, { dosWindow: 4 });
  ok(C.isTailUnit(curT2, 12), 'unit with 90 inv / 20 avg = 4.5 weeks -> tail');
  const fwT = [2026035, 2026036, 2026037, 2026038, 2026039, 2026040];
  const kBig = {}; fwT.forEach(function (p) { kBig[C.periodW(p)] = 3; });
  const fcT = C.buildRetailForecast({ unit: uT2, futureWeeks: fwT, refYear: 2025, tail: true, kdef: kBig, kedit: {}, ovSO: null, cfg: { roundTo: 5 }, cur: curT2 });
  ok(fcT.every(function (f) { return f.so === 20 && f.src === 'tail'; }), 'tail forecast: flat avg 20, ignores last-year 300 and 3x coef');
  /* 库存硬约束:90 台只够 20/周卖 4.5 周 → 实际SO [20,20,20,20,10,0],库存不为负,清零后SO=0 */
  const simT = C.simulateRetail({ unit: uT2, cur: curT2, forecast: fcT, cfg: { dosWindow: 4, roundTo: 5 }, ovSI: null });
  eq(simT.rows.map(function (r) { return r.so; }), [20, 20, 20, 20, 10, 0], 'inventory-capped SO: sells down then zero');
  eq(simT.rows.map(function (r) { return r.inv; }), [70, 50, 30, 10, 0, 0], 'inventory drains to 0, never negative');
  ok(simT.rows[4].capped === true && simT.rows[4].soPlan === 20, 'capped week flagged with original plan');
  /* 非收尾单元照旧走 ref(去年×系数) */
  const fcN = C.buildRetailForecast({ unit: uT2, futureWeeks: [2026035], refYear: 2025, tail: false, kdef: {}, kedit: {}, ovSO: null, cfg: { roundTo: 5 }, cur: curT2 });
  eq(fcN[0].src, 'ref', 'non-tail unit still uses last-year reference');
})();

/* ---------- 监控指标与判定（周对周对账） ---------- */
(function () {
  const mk = function (specs) { // specs: [p, so, inv, inv1, si]
    const rows = [];
    specs.forEach(function (s) {
      const base = { Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', series: '', model: 'M' };
      if (s[1] != null) rows.push(Object.assign({}, base, { period: s[0], psi: 'so', qty: s[1] }));
      if (s[2] != null) rows.push(Object.assign({}, base, { period: s[0], psi: 'inv', qty: s[2] }));
      if (s[3] != null) rows.push(Object.assign({}, base, { period: s[0], psi: 'inv1', qty: s[3] }));
      if (s[4] != null) rows.push(Object.assign({}, base, { period: s[0], psi: 'si', qty: s[4] }));
    });
    return C.buildStore(rows).units.values().next().value;
  };
  /* 下游视角:SO 转好(近4周 80 > 前4周 40),DOS 下降 */
  const uGood = mk([[2026027, 10, 800, null, 0], [2026028, 10, 790, null, 0], [2026029, 10, 780, null, 0], [2026030, 10, 770, null, 0],
    [2026031, 15, 755, null, 0], [2026032, 20, 735, null, 0], [2026033, 20, 715, null, 0], [2026034, 25, 690, null, 0]]);
  const mG = C.watchMetrics(uGood, { dosWindow: 4 });
  eq(mG.so4, 80, 'watch: so4 = last 4 weeks sum');
  eq(mG.soPrev4, 40, 'watch: prev4 sum');
  ok(mG.dosNow != null && mG.dosPrev != null && mG.dosNow < mG.dosPrev, 'watch: DOS falling');
  eq(C.watchVerdict(mG, 'retail').code, 'good', 'retail verdict: improving -> good');
  /* 下游:无动销 */
  const uIdle = mk([[2026031, 0, 500, null, 0], [2026032, 0, 500, null, 0], [2026033, 0, 500, null, 0], [2026034, 0, 500, null, 0]]);
  eq(C.watchVerdict(C.watchMetrics(uIdle, {}), 'retail').code, 'bad', 'retail verdict: zero SO -> bad');
  /* FSD 视角:ST 发生(INV1 下降)且无 SI -> 清理中 */
  const uClear = mk([[2026030, 10, 900, 500, 0], [2026031, 10, 880, 450, 0], [2026032, 10, 860, 400, 0], [2026033, 10, 840, 350, 0], [2026034, 10, 820, 300, 0]]);
  const mC = C.watchMetrics(uClear, { dosWindow: 4 });
  ok(mC.st4 > 0 && mC.inv1Delta4 < 0, 'watch: ST detected via INV1 drop');
  eq(C.watchVerdict(mC, 'fsd').code, 'good', 'fsd verdict: clearing -> good');
  /* FSD:边清边进(ST 有但 SI 也有) */
  const uMix = mk([[2026030, 10, 900, 500, 0], [2026031, 10, 900, 460, 60], [2026032, 10, 900, 420, 60], [2026033, 10, 900, 380, 60], [2026034, 10, 900, 340, 60]]);
  eq(C.watchVerdict(C.watchMetrics(uMix, {}), 'fsd').code, 'mid', 'fsd verdict: clearing but still buying -> mid');
  /* FSD:无动作 */
  const uNo = mk([[2026031, 5, 900, 500, 0], [2026032, 5, 900, 500, 0], [2026033, 5, 900, 500, 0], [2026034, 5, 900, 500, 0]]);
  eq(C.watchVerdict(C.watchMetrics(uNo, {}), 'fsd').code, 'bad', 'fsd verdict: no ST no INV1 drop -> bad');
})();

/* ---------- 音频专表示例 E2E（格式=FSD 表,账户=直接渠道客户） ---------- */
(function () {
  const t = C.genAudioSampleTSV();
  const p = C.parseTable(t);
  eq(p.report.badPeriod + p.report.badPsi + p.report.noKey, 0, 'audio sample: zero bad rows');
  const stA = C.buildStore(p.rows);
  eq(stA.units.size, 6, 'audio sample: 6 direct-customer units');
  ok(stA.maxPeriod === 2026034, 'audio sample through W34');
  const sammel = stA.units.get('乌拉圭' + C.SEP + 'Austral Suministros Corp.' + C.SEP + 'ULC-CT010');
  ok(!!sammel && sammel.audio, 'SAMMEL SonicBuds SE 2 unit exists and is audio Garnet');
  const curS = C.unitCurrent(sammel, { dosWindow: 4 });
  eq(curS.lastSOP, 2026030, 'audio sample: last reported week honored (skip-zero window)');
  ok(curS.curInv1 != null && curS.curInv1 >= 0, 'audio sample: INV1 present');
})();

/* ---------- 历史 ST 推导:INV1 缺周时累计间隔内全部 SI ---------- */
(function () {
  const base = { Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', series: '', model: 'M' };
  const rows = [
    Object.assign({}, base, { period: 2026030, psi: 'inv1', qty: 500 }),
    Object.assign({}, base, { period: 2026031, psi: 'si', qty: 100 }),   // W31 无 INV1,SI 不能丢
    Object.assign({}, base, { period: 2026032, psi: 'inv1', qty: 400 }),
    Object.assign({}, base, { period: 2026032, psi: 'si', qty: 50 })
  ];
  const uG = C.buildStore(rows).units.values().next().value;
  eq(C.deriveHistST(uG).get(2026032), 250, 'gap-week ST: 500 + (100+50) - 400 = 250 (mid-gap SI counted)');
})();

/* ---------- 独立朴素实现交叉对拍:当前DOS 口径(不复用 unitCurrent 代码) ---------- */
(function () {
  const t = C.genSampleTSV();
  const parsed = C.parseTable(t);
  const st9 = C.buildStore(parsed.rows);
  /* 朴素实现:直接从解析行重算——最新有 inv 周的库存 ÷ 最近4个有数周(音频 so>0,其余 so 非空)均值/7 */
  const naive = {};
  st9.units.forEach(function (u, key) {
    let invP = 0, inv = null;
    const soPs = [];
    u.periods.forEach(function (p) {
      const w = u.weeks.get(p);
      if (w.inv != null && p >= invP) { invP = p; inv = w.inv; }
      const okSo = u.audio ? (w.so != null && w.so > 0) : (w.so != null);
      if (okSo) soPs.push(p);
    });
    const wnd = soPs.slice(-4);
    let s = 0; wnd.forEach(function (p) { s += u.weeks.get(p).so; });
    const daily = wnd.length ? s / wnd.length / 7 : 0;
    naive[key] = (inv != null && daily > 0) ? Math.round(inv / daily) : null;
  });
  let mismatch = 0;
  st9.units.forEach(function (u, key) {
    const got = C.unitCurrent(u, { dosWindow: 4 }).dosCalc;
    if (JSON.stringify(got) !== JSON.stringify(naive[key])) { mismatch++;
      console.log('  DOS MISMATCH ' + key + ': core=' + got + ' naive=' + naive[key]); }
  });
  eq(mismatch, 0, 'cross-check: independent naive DOS matches unitCurrent for all ' + st9.units.size + ' sample units');
  /* 汇总守恒:所有单元 fc 之和 == 分组聚合之和(以产品线分组手算) */
  const fw9 = C.futureWeeksOf(st9.maxPeriod);
  const layers9 = C.seasonIndexLayers(st9, 2025);
  let totFc = 0; const byLine = {};
  st9.units.forEach(function (u) {
    const cur = C.unitCurrent(u, { dosWindow: 4 });
    const cls = C.classify(u, 2025, fw9, {});
    if (cls.status !== 'auto') return;
    const kl = C.pickKLayer([layers9], u);
    const fc = C.buildForecastForUnit({ unit: u, store: st9, futureWeeks: fw9, refYear: 2025, decision: null, growth: null, kdef: kl.kdef, kedit: {}, ovSO: null, cfg: { roundTo: 5 }, cls: cls });
    let s = 0; fc.forEach(function (f) { if (f.so) s += f.so; });
    totFc += s; byLine[u.Garnet] = (byLine[u.Garnet] || 0) + s;
  });
  let GarnetSum = 0; Object.keys(byLine).forEach(function (k) { GarnetSum += byLine[k]; });
  eq(GarnetSum, totFc, 'aggregation conservation: sum of Garnet groups equals grand total');
})();

/* ---------- 自顶向下分配:守恒 + 权重 + 能力校验 ---------- */
(function () {
  eq(C.distribute(100, [50, 30, 20]), [50, 30, 20], 'distribute: proportional exact');
  const d2 = C.distribute(100, [1, 1, 1]);
  eq(d2.reduce((a, b) => a + b, 0), 100, 'distribute: sum conserved with remainders');
  ok(Math.max.apply(null, d2) - Math.min.apply(null, d2) <= 1, 'distribute: near-equal split');
  eq(C.distribute(90, [0, 0, 0]).reduce((a, b) => a + b, 0), 90, 'distribute: zero weights -> equal split conserved');
  eq(C.distribute(7, [10, 0]), [7, 0], 'distribute: zero-weight leaf gets nothing when others have weight');
  /* leafWeight:去年同月优先 */
  const rows = [];
  for (let w = 40; w <= 44; w++) rows.push({ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', series: '', model: 'M', period: C.mkPeriod(2025, w), psi: 'so', qty: 30 });
  for (let w = 30; w <= 34; w++) rows.push({ Drift: 'CO', account: 'A', Garnet: '平板', product: 'P', series: '', model: 'M', period: C.mkPeriod(2026, w), psi: 'so', qty: 5 });
  const uW = C.buildStore(rows).units.values().next().value;
  ok(C.leafWeight(uW, C.mkPeriod(2026, 42), 2025, {}) >= 90, 'leafWeight: uses last-year same-month sum (Oct)');
  ok(C.leafWeight(uW, C.mkPeriod(2026, 20), 2025, {}) === 115, 'leafWeight: no last-year May -> recent-8-numbered-week sum (3x30+5x5)');
  /* abilityCap:去年同月最大周销×1.5 */
  eq(C.abilityCap(uW, C.mkPeriod(2026, 42), 2025), 45, 'abilityCap: 30 x 1.5 for October');
  ok(C.abilityCap(uW, C.mkPeriod(2026, 20), 2025) === Math.ceil(30 * 1.2), 'abilityCap: no last-year May -> all-time max x 1.2');
})();

/* ---------- 同一账户多国家:必须按 国家×渠道×型号 分开(神州数码巴西/加拿大场景) ---------- */
(function () {
  const mkr = function (c, q) { return { Drift: c, account: '北京神州数码科捷技术服务有限公司龙岗分公司', Garnet: '音频与智能配件', product: 'SonicClip', series: '', model: 'Lark-T00', period: 2026030, psi: 'inv', qty: q }; };
  const st2 = C.buildStore([mkr('巴西', 100), mkr('加拿大', 40)]);
  eq(st2.units.size, 2, 'same account in two countries -> two units');
  eq(st2.units.get('巴西' + C.SEP + '北京神州数码科捷技术服务有限公司龙岗分公司' + C.SEP + 'Lark-T00').weeks.get(2026030).inv, 100, 'Brazil inventory kept separate');
  eq(st2.units.get('加拿大' + C.SEP + '北京神州数码科捷技术服务有限公司龙岗分公司' + C.SEP + 'Lark-T00').weeks.get(2026030).inv, 40, 'Canada inventory kept separate');
  /* mergeFiles 同键含国家:两国同周同指标互不覆盖 */
  const mg2 = C.mergeFiles([{ name: 'f', mtimeMs: 1, rows: [mkr('巴西', 100), mkr('加拿大', 40)] }]);
  eq(mg2.rows.length, 2, 'mergeFiles keeps Drift dimension');
})();

/* ---------- ST→SO 激活效率:电渠(当周–次周) vs 线下(第1–3周铺货期后) ---------- */
(function () {
  const mk = function (list, audio) {
    const u = { audio: !!audio, periods: [], weeks: new Map() };
    list.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: 0, inv1: null }); });
    return u;
  };
  const hs = new Map(); hs.set(2026010, 100);
  const u1 = mk([[2026007, 10], [2026008, 10], [2026009, 10], [2026010, 10], [2026011, 20], [2026012, 30], [2026013, 25], [2026014, 5]]);
  const a1 = C.stActivation(u1, hs, false, 2026014);
  eq(a1.n, 1, 'stActivation offline: one scored event');
  eq(a1.events[0].pre, 10, 'stActivation pre = mean of 3 numbered weeks before ST');
  eq(a1.events[0].post, 25, 'stActivation offline post = mean of weeks +1..+3 (20,30,25)');
  eq(a1.events[0].activated, true, 'stActivation offline activated (25>10)');
  const a2 = C.stActivation(u1, hs, true, 2026014);
  eq(a2.events[0].post, 15, 'stActivation ecom post = mean of weeks +0..+1 (10,20)');
  eq(a2.events[0].activated, true, 'stActivation ecom activated (15>10)');
  /* 响应窗口尚未到齐:计 pending,不计分 */
  const u3 = mk([[2026007, 10], [2026008, 10], [2026009, 10], [2026010, 10]]);
  const a3 = C.stActivation(u3, hs, false, 2026010);
  eq(a3.n, 0, 'stActivation window beyond maxPeriod -> not scored');
  eq(a3.pending, 1, 'stActivation pending counted');
  /* 音频口径:响应窗口内 SO=0 视为未报量跳过 */
  const u4 = mk([[2026007, 10], [2026008, 10], [2026009, 10], [2026010, 10], [2026011, 0], [2026012, 30], [2026013, 0]], true);
  const a4 = C.stActivation(u4, hs, false, 2026013);
  eq(a4.events[0].post, 30, 'stActivation audio skip-zero in response window');
  /* 基准为 0(新品):响应>0 即视为激活 */
  const u5 = mk([[2026008, 0], [2026009, 0], [2026010, 0], [2026011, 0], [2026012, 15], [2026013, 0]]);
  const a5 = C.stActivation(u5, hs, false, 2026013);
  eq(a5.events[0].activated, true, 'stActivation zero-base: post>0 counts as activated');
})();

/* ---------- 纯 Inventory1 库存表(直签渠道库存管控,用户 2026-08-26:「只需要识别出来 Inventory1 就行」) ---------- */
(function () {
  const tsv = ['Country\tManagement Account\tProduct Line\tProduct\tModel\tPeriod\tPSI Type\tQty',
    '墨西哥\tACME DIST\t智能穿戴\tWATCH GT5\tGT5-B19\t2026030\tInventory1\t500',
    '墨西哥\tACME DIST\t智能穿戴\tWATCH GT5\tGT5-B19\t2026031\tInventory1\t450',
    '墨西哥\tACME DIST\t智能穿戴\tWATCH GT5\tGT5-B19\t2026032\tInventory1\t380',
    '智利\tBETA SA\t平板\tSlate Tab 12\tSL12-W09\t2026031\tInventory1\t200',
    '智利\tBETA SA\t平板\tSlate Tab 12\tSL12-W09\t2026032\tInventory1\t210'].join('\n');
  const pr = C.parseTable(tsv);
  eq(pr.rows.length, 5, 'pure-INV1: all rows parsed');
  eq(pr.report.badPsi, 0, 'pure-INV1: no bad psi rows');
  const st = C.buildStore(pr.rows);
  eq(st.units.size, 2, 'pure-INV1: two units');
  const fw = C.futureWeeksOf(st.maxPeriod);
  const u = st.units.get('墨西哥' + C.SEP + 'ACME DIST' + C.SEP + 'GT5-B19');
  eq(C.classify(u, 2025, fw, {}).status, 'stock', 'pure-INV1 unit classified as stock (no SO records at all)');
  const hs = C.deriveHistST(u);
  eq(hs.get(2026031), 50, 'pure-INV1: ST derived 500->450 = 50 (SI absent = 0)');
  eq(hs.get(2026032), 70, 'pure-INV1: ST derived 450->380 = 70');
  const cur = C.unitCurrent(u, { dosWindow: 4 });
  eq(cur.curInv1, 380, 'pure-INV1: latest INV1 kept');
  ok(cur.curInv == null, 'pure-INV1: total channel inventory absent (null, not 0)');
  /* 有 SO 记录(哪怕 0)的单元不是 stock:0 是真实零销/音频未报量,各有既定口径 */
  const rows2 = pr.rows.concat([{ Drift: '墨西哥', account: 'ACME DIST', Garnet: '智能穿戴', product: 'WATCH GT5', model: 'GT5-B19', series: '', period: 2026032, psi: 'so', qty: 0 }]);
  const st2 = C.buildStore(rows2);
  ok(C.classify(st2.units.get('墨西哥' + C.SEP + 'ACME DIST' + C.SEP + 'GT5-B19'), 2025, fw, {}).status !== 'stock',
    'unit with an SO=0 record is NOT stock-only');
})();

/* ---------- 国家 SO 目标回填表:解析 + 月底DOS口径(用样例行锁定) + 映射 ---------- */
(function () {
  /* 口径:月底库存=上月底库存−该月目标;月底DOS=月底库存÷(该月目标/28)。样例行 999/200/150/200/200 */
  const calc = C.targetCalc(999, { 9: 200, 10: 150, 11: 200, 12: 200 });
  eq(calc[0].endInv, 799, 'target: Sep end inv 799');
  eq(calc[0].endDos, 112, 'target: Sep end DOS 112 (799/(200/28))');
  eq(calc[1].endDos, 121, 'target: Oct end DOS 121 (649/(150/28))');
  eq(calc[2].endDos, 63, 'target: Nov end DOS 63');
  eq(calc[3].endInv, 249, 'target: year-end inv 249');
  eq(calc[3].endDos, 35, 'target: year-end DOS 35');
  /* 未填月:库存持平,DOS 无值 */
  const c2 = C.targetCalc(1000, { 9: null, 10: 100, 11: null, 12: null });
  eq(c2[0].endInv, 1000, 'target: unfilled month keeps inventory');
  ok(c2[0].endDos == null, 'target: unfilled month has no DOS');
  eq(c2[1].endDos, Math.round(900 / (100 / 28)), 'target: Oct after unfilled Sep');
  /* 解析:表头识别+全角空格=未填+示例行剔除 */
  const grid = [
    ['产品线', '产品', '国家', '渠道', '原始渠道名', '当前INV', '近4周周均SO', '当前DOS', '9月SO目标', '9月底库存', '9月底DOS', '10月SO目标', '10月底库存', '10月底DOS', '11月SO目标', '11月底库存', '11月底DOS', '12月SO目标', '年底库存', '年底DOS', '备注'],
    ['示例', '示例', '示例', '示例', '示例', 10000, 500, 400, 1500, 8500, 159, 1500, 7000, 131, 2000, 5000, 70, 2000, 3000, 42, '备注'],
    ['音频与智能配件', 'SonicClip 2 耳夹耳机', '阿根廷', 'CARIBE SUMINISTROS S.A.', 'CARIBE SUMINISTROS S.A.', 999, 0, '-', 200, 799, 112, 150, 649, 121, 200, 449, 63, 200, 249, 35, ''],
    ['音频与智能配件', 'SonicBuds SE 2', '巴西', '北京神州数码科捷技术服务有限公司龙岗分公司', '北京神州数码科捷技术服务有限公司龙岗分公司', 23708, 360, 462, '　', 23708, '-', '　', 23708, '-', '　', 23708, '-', '　', 23708, '-', '']
  ];
  const r = C.parseTargetGrid(grid);
  eq(r.rows.length, 2, 'target parse: 2 data rows (example row excluded)');
  eq(r.rows[0].t[9], 200, 'target parse: Sep target 200');
  eq(r.rows[0].t[10], 150, 'target parse: Oct target 150');
  ok(r.rows[1].t[9] == null, 'target parse: fullwidth-space cell = unfilled');
  eq(r.rows[1].rawName, '北京神州数码科捷技术服务有限公司龙岗分公司', 'target parse: raw name kept');
  /* 映射 */
  eq(C.familyOf('SonicClip 2 耳夹耳机').family, '开放式耳机', 'familyOf: SonicClip 2');
  eq(C.familyOf('WATCH FIT 5').family, 'FIT系列', 'familyOf: WATCH FIT 5');
  eq(C.familyOf('nimbus Y74').family, 'nimbus Y系列', 'familyOf: nimbus Y74');
  ok(C.familyOf('不存在的产品') == null, 'familyOf: unknown -> null');
  eq(C.repOf('智利'), '南美洲多国终端业务部', 'repOf: Chile');
  eq(C.repOf('加拿大'), '墨西哥终端业务部', 'repOf: Canada');
  eq(C.repOf('未知国'), '(未归属代表处)', 'repOf: unknown');
})();

/* ---------- V20:周四归属月 / 补货周期天数窗口 / 补货规律回测 ---------- */
(function () {
  /* 2026W40 周一=9/28,周四=10/1 → 归 10 月;2026W36 周一=8/31,周四=9/3 → 归 9 月 */
  eq(C.monthOfP(C.mkPeriod(2026, 40)), 10, 'monthOfP: W40 (Mon 9/28) belongs to Oct by Thursday rule');
  eq(C.monthOfP(C.mkPeriod(2026, 36)), 9, 'monthOfP: W36 (Mon 8/31) belongs to Sep by Thursday rule');
  /* stActivation 接受补货周期天数:14 天 → 第 2–4 周窗口 */
  const mk = function (list, audio) {
    const u = { audio: !!audio, periods: [], weeks: new Map() };
    list.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: x[2] || 0, inv: x[3] != null ? x[3] : null, inv1: null }); });
    return u;
  };
  const hs = new Map(); hs.set(2026010, 100);
  const u1 = mk([[2026007, 10], [2026008, 10], [2026009, 10], [2026010, 10], [2026011, 20], [2026012, 30], [2026013, 25], [2026014, 5]]);
  const a14 = C.stActivation(u1, hs, 14, 2026014);
  eq(a14.lag0, 2, 'stActivation leadDays=14 -> window starts week +2');
  eq(a14.events[0].post, 20, 'stActivation leadDays=14 post = mean weeks +2..+4 (30,25,5)');
  const a0 = C.stActivation(u1, hs, 0, 2026014);
  eq(a0.lag0, 0, 'stActivation leadDays=0 -> window starts week +0');
  eq(a0.events[0].post, 20, 'stActivation leadDays=0 post = mean weeks +0..+2 (10,20,30)');
  /* replenishStats:显著 SI 事件的触发/补到水位 + 一次性铺货判定 */
  const rows2 = [];
  for (let w = 5; w <= 9; w++) rows2.push([C.mkPeriod(2026, w), 10, 0, 200]);
  rows2.push([C.mkPeriod(2026, 10), 10, 100, 280]);
  for (let w = 11; w <= 23; w++) rows2.push([C.mkPeriod(2026, w), 10, 0, 280 - (w - 10) * 10]);
  const u2 = mk(rows2);
  const rs = C.replenishStats(u2, { dosWindow: 4, tailWeeks: 12 });
  eq(rs.n, 1, 'replenishStats: one significant SI event');
  eq(rs.trigger, 140, 'replenishStats: trigger DOS median 140 (200/(10/7))');
  eq(rs.trigInv, 200, 'replenishStats: trigger inventory median 200');
  eq(rs.mode, 'oneshot', 'replenishStats: single SI then 13 quiet selling weeks -> oneshot warning');
  /* 流水补货:3 次显著 SI → flow */
  const rows3 = [];
  for (let w = 5; w <= 30; w++) {
    const si = (w === 10 || w === 16 || w === 22) ? 100 : 0;
    rows3.push([C.mkPeriod(2026, w), 10, si, 200]);
  }
  const u3 = mk(rows3);
  eq(C.replenishStats(u3, { dosWindow: 4, tailWeeks: 12 }).mode, 'flow', 'replenishStats: recurring SI -> flow');
})();

/* ---------- 平销期识别引擎(V23):五类剔除 + 双条件缺货 + Theil-Sen 漂移 + 周历 ---------- */
(function () {
  const mkU = function (rows, audio) {
    const u = { audio: !!audio, periods: [], weeks: new Map() };
    rows.forEach(function (r) { u.periods.push(r[0]); u.weeks.set(r[0], { so: r[1], si: 0, inv: r[2] != null ? r[2] : 500, inv1: null }); });
    return u;
  };
  /* 40 周:前8周首销30;平销10;W20促销25(k=1.5);W24库存被打到5;W25低销3(周初库存5→真缺货);
     W30低销3但周初库存500(大促后回落之类)→按用户拍板的双条件,不算缺货,保留 */
  const rows = [];
  for (let w = 1; w <= 40; w++) {
    let so = 10, inv = 500;
    if (w <= 8) so = 30;
    if (w === 20) so = 25;
    if (w === 24) inv = 5;
    if (w === 25) so = 3;
    if (w === 30) so = 3;
    rows.push([C.mkPeriod(2026, w), so, inv]);
  }
  const bl = C.baselineOf(mkU(rows), { kdef: { 20: 1.5 } });
  eq(bl.excl.launch, 8, 'baseline: first 8 weeks excluded as launch');
  eq(bl.excl.promo, 1, 'baseline: k>1.25 week excluded as promo');
  eq(bl.excl.oos, 1, 'baseline OOS double-condition: only low-stock AND low-sales week removed');
  eq(bl.excl.tail, 0, 'baseline: stable tail NOT excluded (on-sale product keeps recent weeks)');
  eq(bl.base, 10, 'baseline: median flat rate = 10');
  eq(bl.conf, 'high', 'baseline: high confidence (n>=10)');
  /* 大促周历命中剔除 */
  const bl2 = C.baselineOf(mkU(rows), { kdef: {}, isPromo: function (p) { return C.periodW(p) === 20; } });
  eq(bl2.excl.promo, 1, 'baseline: promo-calendar hit excluded');
  /* 尾部真实衰退段剔除 */
  const rows3 = [];
  for (let w = 1; w <= 40; w++) { const so = w <= 8 ? 30 : (w >= 32 ? 3 : 10); rows3.push([C.mkPeriod(2026, w), so, 500]); }
  const bl3 = C.baselineOf(mkU(rows3), { kdef: {} });
  ok(bl3.excl.tail >= 9, 'baseline: real decay tail excluded');
  eq(bl3.base, 10, 'baseline: decay tail does not drag the flat rate down');
  /* 周历默认与用户覆盖 */
  const s = C.promoWeekSet('墨西哥', null);
  ok(!!s[46] && !!s[21] && !s[10], 'promo cal: MX defaults contain Buen Fin W46 / Hot Sale W21');
  const s2 = C.promoWeekSet('墨西哥', { '墨西哥': C.parsePromoSpec('10-11:测试') });
  ok(!!s2[10] && !s2[46], 'promo cal: user override replaces defaults');
  eq(C.parsePromoSpec('21-23:Hot Sale; 46:Buen Fin').length, 2, 'promo spec parse: two ranges');
  eq(C.promoSpecText([{ w1: 21, w2: 23, name: 'Hot Sale' }]), '21-23:Hot Sale', 'promo spec roundtrip');
  /* Theil-Sen */
  const pts = []; for (let i = 0; i < 10; i++) pts.push([i, 100 - 2 * i]);
  eq(C.theilSen(pts), -2, 'theilSen: exact slope on clean Garnet');
  /* 平销模式 forecast */
  const fc = C.buildForecastForUnit({ unit: mkU(rows), store: { units: new Map() }, futureWeeks: [C.mkPeriod(2026, 41), C.mkPeriod(2026, 42)], refYear: 2025, decision: { mode: 'flat' }, growth: 1, kdef: {}, kedit: {}, ovSO: null, cfg: { roundTo: 5 }, cls: { status: 'partial' }, baseline: { base: 10, delta: 0, conf: 'high' } });
  eq(fc[0].so, 10, 'flat mode: base x season x growth');
  eq(fc[0].src, 'flat', 'flat mode: src tag');
  /* retail 平销优先开关:高置信用 flat,低置信回退 */
  const ru = mkU(rows);
  const rfc = C.buildRetailForecast({ unit: ru, futureWeeks: [C.mkPeriod(2026, 41)], refYear: 2025, tail: false, growth: 1, kdef: {}, kedit: {}, ovSO: null, cfg: { roundTo: 5 }, cur: { avgWeeklySO: 8 }, baseline: { base: 10, delta: 0, conf: 'high' }, preferBaseline: true });
  eq(rfc[0].src, 'flat', 'retail preferBaseline: high-confidence unit uses flat');
  const rfc2 = C.buildRetailForecast({ unit: ru, futureWeeks: [C.mkPeriod(2026, 41)], refYear: 2025, tail: false, growth: 1, kdef: {}, kedit: {}, ovSO: null, cfg: { roundTo: 5 }, cur: { avgWeeklySO: 8 }, baseline: { base: 10, delta: 0, conf: 'low' }, preferBaseline: true });
  ok(rfc2[0].src !== 'flat', 'retail preferBaseline: low-confidence falls back to existing chain');
})();

/* ---------- SI/SO 引擎 P2-P4 CORE:渠道大促识别/退市学习/EOL衰减/起量基线/新品模拟 ---------- */
(function () {
  const mku = function (rows, audio) {
    const u = { audio: !!audio, key: 'k', Drift: 'X', account: 'A', Garnet: 'L', product: 'P', model: 'M', periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: x[2] || 0, inv: x[3] != null ? x[3] : null, inv1: null }); });
    return u;
  };
  /* 渠道大促识别:两年同在 W20-21 放量 3 倍 → 建议区间 20-21 */
  (function () {
    const rows = [];
    [2025, 2026].forEach(function (y) {
      for (let w = 10; w <= 40; w++) {
        const so = (w === 20 || w === 21) ? 60 : 20;
        rows.push([C.mkPeriod(y, w), so, 0, 500]);
      }
    });
    const st = { maxPeriod: C.mkPeriod(2026, 40), units: new Map([['k', mku(rows)]]) };
    const sug = C.chanPromoScan(st, {});
    eq(sug.length, 1, 'chanPromoScan: one account suggested');
    eq(sug[0].spans.length, 1, 'chanPromoScan: adjacent weeks merged to one span');
    eq(sug[0].spans[0].w1, 20, 'chanPromoScan: span starts W20');
    eq(sug[0].spans[0].w2, 21, 'chanPromoScan: span ends W21');
    ok(sug[0].spans[0].lift >= 2, 'chanPromoScan: lift recorded');
  })();
  /* EOL 衰减后处理:eolP 之后按 ρ 几何衰减,手工改写不动 */
  (function () {
    const fc = [{ p: 2026040, so: 100, src: 'ref' }, { p: 2026041, so: 100, src: 'ref' },
      { p: 2026042, so: 100, src: 'override' }, { p: 2026043, so: 100, src: 'ref' }];
    C.applyEolDecay(fc, 2026040, 0.9);
    eq(fc[0].so, 100, 'applyEolDecay: weeks before EOL untouched');
    eq(fc[1].so, 90, 'applyEolDecay: first week after EOL = anchor x rho');
    eq(fc[2].so, 100, 'applyEolDecay: override kept verbatim');
    eq(fc[3].so, C.round5(100 * 0.9 * 0.9 * 0.9, 1), 'applyEolDecay: geometric decay continues (default step=1)');
    eq(fc[1].src, 'eol', 'applyEolDecay: source tagged');
  })();
  /* 退市规律学习:活跃期 50/周×53 周(W2 大额 SI),之后 30 周残值期 3/周,库存稳在 120 */
  (function () {
    const rows = [];
    for (let w = 1; w <= 53; w++) rows.push([C.mkPeriod(2025, w), 50, w === 2 ? 500 : 0, 600]);
    for (let w = 1; w <= 30; w++) rows.push([C.mkPeriod(2026, w), 3, 0, 120]);
    const u = mku(rows);
    const st = { maxPeriod: C.mkPeriod(2026, 30), units: new Map([['k', u]]) };
    const learn = C.eolLearn(st, { dosWindow: 4, tailWeeks: 12 }, function () { return { family: 'F' }; });
    eq(learn.items.length, 1, 'eolLearn: retired unit detected');
    if (learn.items.length) {
      eq(learn.items[0].resInv, 120, 'eolLearn: residual inventory = current stock (not zero)');
      ok(learn.global.rho != null && learn.global.rho >= 0.8 && learn.global.rho <= 0.99, 'eolLearn: decay rho learned in bounds');
      ok(learn.byFam.F && learn.byFam.F.n === 1, 'eolLearn: aggregated by family');
    }
  })();
  /* 起量基线:首次显著 SI 在 W10,SO 从 W13 起连续两周 ≥0.8×base → ramp=3 */
  (function () {
    const rows = [];
    for (let w = 5; w <= 9; w++) rows.push([C.mkPeriod(2026, w), 2, 0, 10]);
    rows.push([C.mkPeriod(2026, 10), 5, 300, 300]);
    rows.push([C.mkPeriod(2026, 11), 10, 0, 290]);
    rows.push([C.mkPeriod(2026, 12), 20, 0, 270]);
    rows.push([C.mkPeriod(2026, 13), 45, 0, 225]);
    rows.push([C.mkPeriod(2026, 14), 50, 0, 175]);
    rows.push([C.mkPeriod(2026, 15), 48, 0, 127]);
    const u = mku(rows);
    eq(C.rampOf(u, 50, { dosWindow: 4 }), 3, 'rampOf: first significant SI to sustained 80% of baseline = 3 weeks');
  })();
  /* 新品模拟:首批铺货+爬坡+平销+库存硬约束 */
  (function () {
    const fw = []; for (let w = 30; w <= 45; w++) fw.push(C.mkPeriod(2026, w));
    const sim = C.simNewProduct({ fw: fw, firstP: C.mkPeriod(2026, 33), rampW: 3, base: 70, alpha: 1.4,
      kdef: {}, growth: 1, trigger: 60, target: 90, firstSI: 800 });
    eq(sim.rows[0].so, 0, 'simNewProduct: zero before first SI week');
    eq(sim.rows[3].si >= 800 ? 1 : 0, 1, 'simNewProduct: first batch SI lands on launch week');
    ok(sim.rows[3].so > 0 && sim.rows[3].so < 70, 'simNewProduct: ramp week 1 below baseline');
    const flat = sim.rows[8];
    ok(flat.so >= 65 && flat.so <= 75, 'simNewProduct: reaches baseline after ramp');
    sim.rows.forEach(function (r) { ok(r.inv >= 0, 'simNewProduct: inventory never negative @' + r.p); });
  })();
  /* baselineOf endP 截断:截断点之后的数据不参与 */
  (function () {
    const rows = [];
    for (let w = 1; w <= 40; w++) rows.push([C.mkPeriod(2026, w), w <= 30 ? 10 : 99, 0, 200]);
    const u = mku(rows);
    const bl = C.baselineOf(u, { endP: C.mkPeriod(2026, 30), blHead: 4 });
    eq(bl.base, 10, 'baselineOf endP: cutoff excludes later weeks');
  })();
  /* 爆发系数:大促周(W20/21)均销60 ÷ 平销周均销20 = 3;首销期剔除;区间夹逼[1,10] */
  (function () {
    const rows = [];
    for (let w = 1; w <= 45; w++) rows.push([C.mkPeriod(2026, w), (w === 20 || w === 21) ? 60 : 20, 0, 500]);
    const u = mku(rows);
    const isPromo = function (u2, p) { const w = C.periodW(p); return w === 20 || w === 21; };
    eq(C.burstOf([u], isPromo, 8), 3, 'burstOf: promo mean / flat mean = 3');
    /* 大促样本不足(1周) → null */
    const rows2 = [];
    for (let w = 1; w <= 45; w++) rows2.push([C.mkPeriod(2026, w), w === 20 ? 60 : 20, 0, 500]);
    const isPromo1 = function (u2, p) { return C.periodW(p) === 20; };
    eq(C.burstOf([mku(rows2)], isPromo1, 8), null, 'burstOf: <2 promo samples -> null');
    /* 倍数上限夹到 10 */
    const rows3 = [];
    for (let w = 1; w <= 45; w++) rows3.push([C.mkPeriod(2026, w), (w === 20 || w === 21) ? 900 : 20, 0, 5000]);
    eq(C.burstOf([mku(rows3)], isPromo, 8), 10, 'burstOf: clamp at 10x');
    /* 音频跳零:0 周不算平销分母 */
    const rows4 = [];
    for (let w = 1; w <= 45; w++) rows4.push([C.mkPeriod(2026, w), (w === 20 || w === 21) ? 60 : (w % 2 ? 20 : 0), 0, 500]);
    eq(C.burstOf([mku(rows4, true)], isPromo, 8), 3, 'burstOf: audio zero weeks skipped');
  })();
  /* 锁量 capSO:SO 受 期初库存+当周到货 硬约束,超出即标记断供 */
  (function () {
    const fw = []; for (let w = 36; w <= 40; w++) fw.push(C.mkPeriod(2026, w));
    const fc = fw.map(function (p) { return { p: p, so: 100, src: 'test' }; });
    const u = mku([[C.mkPeriod(2026, 35), 100, 0, 150]]);
    const cur = C.unitCurrent(u, {});
    const sim = C.simulateUnit({ unit: u, cur: cur, forecast: fc, futureWeeks: fw,
      params: { trigger: 21, target: 35, downTarget: 28 }, cfg: {}, noAutoSI: true, capSO: true,
      ovSI: { [fw[2]]: 80 } });
    eq(sim.rows[0].so, 100, 'capSO: within stock, uncapped');
    ok(!sim.rows[0].capped, 'capSO: no cap flag when supply suffices');
    eq(sim.rows[1].so, 50, 'capSO: capped to remaining inventory');
    ok(sim.rows[1].capped, 'capSO: cap flag set on shortage week');
    eq(sim.rows[2].so, 80, 'capSO: incoming SI sellable same week');
    ok(sim.rows[2].capped, 'capSO: flagged when demand > inv+arrival');
    eq(sim.rows[2].inv, 0, 'capSO: inventory floors at zero');
    eq(sim.rows[3].so, 0, 'capSO: nothing left afterwards');
    sim.rows.forEach(function (r) { ok(r.inv >= 0, 'capSO: inventory never negative @' + r.p); });
  })();
})();

/* ---------- 渠道补货策略判型:先学历史再模拟(2026-09-01 用户拍板,禁止全渠道一刀切) ---------- */
(function () {
  const mku = function (rows, audio) {
    const u = { audio: !!audio, key: 'k', Drift: 'X', account: 'A', Garnet: 'L', product: 'P', model: 'M', periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: x[2] || 0, inv: x[3] != null ? x[3] : null, inv1: null }); });
    return u;
  };
  /* 水位型渠道:SO 逐周爬坡(日均一直变),但每次都在库存降到 ~500 台时进货补到 ~1050 */
  (function () {
    const rows = []; let inv = 1050;
    for (let w = 1; w <= 40; w++) {
      const so = 20 + w * 2;
      let si = 0;
      const after = inv - so;
      if (after <= 500) si = 1050 - after;
      inv = inv + si - so;
      rows.push([C.mkPeriod(2026, w), so, si, inv]);
    }
    const pol = C.replenishPolicyOf(mku(rows), {});
    ok(!!pol, 'policy: level-trigger channel learnable');
    eq(pol.type, 'inv', 'policy: detected as inventory-level type');
    ok(pol.triggerInv >= 440 && pol.triggerInv <= 640, 'policy: triggerInv near 500-600, got ' + pol.triggerInv);
    ok(pol.targetInv >= 1000 && pol.targetInv <= 1100, 'policy: targetInv near 1050, got ' + pol.targetInv);
    ok(pol.n >= 3, 'policy: >=3 events');
  })();
  /* DOS 门槛型渠道:每次都在 DOS≈90 天时进货(SO 爬坡 → 触发时的库存台数一路上涨,不集中) */
  (function () {
    const rows = []; let inv = 800; const q = [];
    for (let w = 1; w <= 40; w++) {
      const so = 20 + w * 2;
      q.push(so); while (q.length > 4) q.shift();
      let s = 0; q.forEach(function (v) { s += v; });
      const daily = s / q.length / 7;
      let si = 0;
      const after = inv - so;
      if (daily > 0 && after / daily < 90) si = Math.round(130 * daily - after);
      inv = inv + si - so;
      rows.push([C.mkPeriod(2026, w), so, si, inv]);
    }
    const pol = C.replenishPolicyOf(mku(rows), {});
    ok(!!pol, 'policy: dos-trigger channel learnable');
    eq(pol.type, 'dos', 'policy: detected as DOS-threshold type');
    ok(pol.trigger >= 70 && pol.trigger <= 110, 'policy: trigger near 90 days, got ' + pol.trigger);
    ok(pol.target >= 100 && pol.target <= 160, 'policy: target near 130 days, got ' + pol.target);
  })();
  /* 样本不足(<3 次显著SI)不学,返回 null */
  (function () {
    const rows = [];
    for (let w = 1; w <= 20; w++) rows.push([C.mkPeriod(2026, w), 50, w === 5 ? 400 : 0, 800 - w * 10]);
    eq(C.replenishPolicyOf(mku(rows), {}), null, 'policy: <3 events -> null (fallback to Garnet default)');
  })();
  /* 水位型策略进 simulateRetail:库存穿过触发水位才补,补到目标水位;手拍覆盖优先 */
  (function () {
    const fw = []; for (let w = 36; w <= 40; w++) fw.push(C.mkPeriod(2026, w));
    const fc = fw.map(function (p) { return { p: p, so: 100, src: 'test' }; });
    const u = mku([[C.mkPeriod(2026, 35), 100, 0, 650]]);
    const cur = C.unitCurrent(u, {});
    const sim = C.simulateRetail({ unit: u, cur: cur, forecast: fc, cfg: { roundTo: 1 }, ovSI: {},
      autoBuy: true, params: { type: 'inv', triggerInv: 500, targetInv: 900 } });
    eq(sim.rows[0].buy, 0, 'inv-policy: above trigger level, no buy');
    eq(sim.rows[0].buySrc, 'rule0', 'inv-policy: rule evaluated, not triggered');
    eq(sim.rows[1].buy, 450, 'inv-policy: crossed 500 -> buy up to 900 (900-450)');
    eq(sim.rows[1].buySrc, 'rule', 'inv-policy: rule buy tagged');
    eq(sim.rows[1].inv, 900, 'inv-policy: post-buy inventory at target level');
    const sim2 = C.simulateRetail({ unit: u, cur: cur, forecast: fc, cfg: { roundTo: 1 },
      ovSI: (function () { const o = {}; o[fw[1]] = 77; return o; })(),
      autoBuy: true, params: { type: 'inv', triggerInv: 500, targetInv: 900 } });
    eq(sim2.rows[1].buy, 77, 'inv-policy: manual override wins over rule');
    eq(sim2.rows[1].buySrc, 'override', 'inv-policy: override tagged');
  })();
})();

/* ---------- 年末收官约束进 simulateRetail(2026-09-01 用户实测:下游年末 DOS 被规则补货顶到 100+) ---------- */
(function () {
  const mku = function (rows, audio) {
    const u = { audio: !!audio, key: 'k', Drift: 'X', account: 'A', Garnet: 'L', product: 'P', model: 'M', periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: x[2] || 0, inv: x[3] != null ? x[3] : null, inv1: null }); });
    return u;
  };
  const fw = []; for (let w = 36; w <= 40; w++) fw.push(C.mkPeriod(2026, w));
  const fc = fw.map(function (p) { return { p: p, so: 70, src: 'test' }; });
  const u = mku([[C.mkPeriod(2026, 35), 70, 0, 600]]);
  const cur = C.unitCurrent(u, {});
  const base = { unit: u, cur: cur, forecast: fc, cfg: { roundTo: 1 }, ovSI: {}, autoBuy: true, params: { trigger: 90, target: 120 } };
  const free = C.simulateRetail(base);
  eq(free.rows[0].buy, 670, 'retail cap: no checkpoints -> fill to 120 days (1200-530)');
  const capped = C.simulateRetail(Object.assign({}, base, { dailyBase: 10, checkpoints: [{ idx: 4, cap: 50 }] }));
  eq(capped.rows[0].buy, 250, 'retail cap: checkpoint limits rule buy to cap*dailyBase+SO-to-checkpoint-invStart (500+350-600)');
  eq(capped.rows[0].buySrc, 'rule', 'retail cap: partially capped buy still tagged rule');
  const ovMap = {}; ovMap[fw[0]] = 900;
  const ov = C.simulateRetail(Object.assign({}, base, { dailyBase: 10, checkpoints: [{ idx: 4, cap: 50 }], ovSI: ovMap }));
  eq(ov.rows[0].buy, 900, 'retail cap: manual override never capped');
  const zero = C.simulateRetail(Object.assign({}, base, { dailyBase: 10, checkpoints: [{ idx: 0, cap: 10 }] }));
  eq(zero.rows[0].buy, 0, 'retail cap: fully capped -> 0 buy');
  eq(zero.rows[0].buySrc, 'cap', 'retail cap: tagged cap when zeroed by year-end limit');
  ok(zero.rows[0].inv >= 0, 'retail cap: inventory stays non-negative');
})();

/* ---------- 历史年末画像 + 月末补到位(2026-09-01 用户拍板:不许卡死 DOS,按回测年末水平模拟) ---------- */
(function () {
  const mku = function (rows, audio) {
    const u = { audio: !!audio, key: 'k', Drift: 'X', account: 'A', Garnet: 'L', product: 'P', model: 'M', periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: x[2] || 0, inv: x[3] != null ? x[3] : null, inv1: null }); });
    return u;
  };
  /* 画像学习:2025 全年周销 50(日均 7.14),10/11/12 月末库存 900/640/430 → DOS 126/90/60;2026 只到 W34(其 Q4 未发生,跳过) */
  (function () {
    const me = { 10: C.monthEndPeriodOf(2025, 10), 11: C.monthEndPeriodOf(2025, 11), 12: C.monthEndPeriodOf(2025, 12) };
    const invAt = {}; invAt[me[10]] = 900; invAt[me[11]] = 640; invAt[me[12]] = 430;
    const rows = [];
    for (let w = 10; w <= 52; w++) { const p = C.mkPeriod(2025, w); rows.push([p, 50, 0, invAt[p] != null ? invAt[p] : 800]); }
    for (let w = 1; w <= 34; w++) rows.push([C.mkPeriod(2026, w), 60, 0, 700]);
    const pr = C.yearEndProfileOf(mku(rows), {});
    ok(!!pr, 'yearEndProfile: learnable from one full Q4');
    eq(pr.n, 2, 'monthEndProfile: Jan-Jul have two years (2025+2026), n=max');
    eq(pr.m[12].n, 1, 'monthEndProfile: Dec-end seen in one year only');
    ok(!!pr.m[3], 'monthEndProfile: non-Q4 months learned too');
    eq(pr.m[10].dos, 126, 'yearEndProfile: Oct-end DOS 900/(50/7)=126');
    eq(pr.m[11].dos, 90, 'yearEndProfile: Nov-end DOS 90');
    eq(pr.m[12].dos, 60, 'yearEndProfile: Dec-end DOS 60');
    eq(pr.m[12].inv, 430, 'yearEndProfile: Dec-end absolute inventory kept');
    ok(pr.medDos != null && pr.medDos >= 60 && pr.medDos <= 130, 'monthEndProfile: medDos (typical level) computed, got ' + pr.medDos);
    const rows2 = []; for (let w = 1; w <= 34; w++) rows2.push([C.mkPeriod(2026, w), 60, 0, 700]);
    const pr2 = C.yearEndProfileOf(mku(rows2), {});
    ok(!!(pr2 && pr2.m[7] && !pr2.m[12]), 'monthEndProfile: partial year learns passed month-ends (Jul yes, Dec no)');
    eq(C.yearEndProfileOf(mku([[C.mkPeriod(2026, 30), 60, 0, 700]]), {}), null, 'monthEndProfile: too little history -> null');
  })();
  /* 月末补到位:画像水平 900 台在 idx4,起始 300,每周按剩余周均摊补,检查点当周正好到位 */
  (function () {
    const fw = []; for (let w = 36; w <= 40; w++) fw.push(C.mkPeriod(2026, w));
    const fc = fw.map(function (p) { return { p: p, so: 70, src: 'test' }; });
    const u = mku([[C.mkPeriod(2026, 35), 70, 0, 300]]);
    const cur = C.unitCurrent(u, {});
    const base = { unit: u, cur: cur, forecast: fc, cfg: { roundTo: 1 }, ovSI: {}, autoBuy: true, params: { trigger: 20, target: 30 }, dailyBase: 10 };
    const up = C.simulateRetail(Object.assign({}, base, { checkpoints: [{ idx: 4, level: 900 }] }));
    eq(up.rows[0].buy, 190, 'level: shortfall (900+350-300) spread over 5 weeks = 190');
    eq(up.rows[0].buySrc, 'ye', 'level: steer-up buy tagged ye (year-end profile)');
    eq(up.rows[4].inv, 900, 'level: inventory lands exactly on profile level at checkpoint');
    const down = C.simulateRetail(Object.assign({}, base, { unit: mku([[C.mkPeriod(2026, 35), 70, 0, 2000]]), cur: C.unitCurrent(mku([[C.mkPeriod(2026, 35), 70, 0, 2000]]), {}), params: { trigger: 90, target: 120 }, checkpoints: [{ idx: 4, level: 900 }] }));
    eq(down.rows[0].buy, 0, 'level: above profile -> no buy (cap side)');
    eq(down.rows[4].inv, 1650, 'level: draws down by SO only (2000-350)');
    const ovMap = {}; ovMap[fw[0]] = 5;
    const ov = C.simulateRetail(Object.assign({}, base, { ovSI: ovMap, checkpoints: [{ idx: 4, level: 900 }] }));
    eq(ov.rows[0].buy, 5, 'level: manual override untouched by profile');
    eq(ov.rows[0].buySrc, 'override', 'level: override tag kept');
  })();
})();

/* ---------- 渠道×产品季节层 / 单周进货能力上限 / 取整(2026-09-01 用户拍板:全年规律从回测学,SI 不许脱离渠道能力) ---------- */
(function () {
  const mk = function (key, product, rows) {
    const u = { audio: false, key: key, Drift: 'X', account: 'A', Garnet: 'L', product: product, model: 'M', periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: x[2] || 0, inv: x[3] != null ? x[3] : null, inv1: null }); });
    return u;
  };
  /* 渠道×产品层:P 在 W20/21 大促(100 vs 20),兄弟品 P2 平(30);P3 只 10 周不成层 */
  (function () {
    const r1 = [], r2 = [], r3 = [];
    for (let w = 1; w <= 40; w++) { r1.push([C.mkPeriod(2025, w), (w === 20 || w === 21) ? 100 : 20, 0, 500]); r2.push([C.mkPeriod(2025, w), 30, 0, 500]); }
    for (let w = 1; w <= 10; w++) r3.push([C.mkPeriod(2025, w), 30, 0, 500]);
    const st = { maxPeriod: C.mkPeriod(2025, 40), units: new Map([['a', mk('a', 'P', r1)], ['b', mk('b', 'P2', r2)], ['c', mk('c', 'P3', r3)]]) };
    const L = C.seasonIndexLayers(st, 2025);
    ok(!!(L.acctProduct && L.acctProduct['A|P']), 'cpLayer: 渠道×产品 layer built for product with >=16 weeks');
    ok(!L.acctProduct['A|P3'], 'cpLayer: <16 weeks -> no 渠道×产品 layer (falls back)');
    const k20 = L.acctProduct['A|P'][20], k30 = L.acctProduct['A|P'][30];
    ok(k20 > 1.5 && k20 < 4.2, 'cpLayer: promo week index kept but smoothed/shrunk toward parent, got ' + k20);
    ok(k30 < 1, 'cpLayer: off-season week below 1, got ' + k30);
    const pk = C.pickKLayer([L], st.units.get('a'));
    eq(pk.key, 'CP|A|P', 'pickKLayer: 渠道×产品 is the finest layer');
    eq(C.pickKLayer([L], st.units.get('c')).key, 'A|A|L', 'pickKLayer: falls back to 渠道×产品线 when product layer absent');
  })();
  /* 单周最大进货能力 */
  (function () {
    const rows = []; for (let w = 1; w <= 30; w++) rows.push([C.mkPeriod(2026, w), 50, w === 5 ? 400 : (w % 7 === 0 ? 120 : 0), 800]);
    eq(C.maxWeeklySI(mk('k', 'P', rows)), 400, 'maxWeeklySI: historical max single-week SI');
    const few = []; for (let w = 1; w <= 10; w++) few.push([C.mkPeriod(2026, w), 50, 400, 800]);
    eq(C.maxWeeklySI(mk('k', 'P', few)), null, 'maxWeeklySI: <26 weeks -> null (no cap)');
  })();
  /* 上限进模拟:规则买被压到 maxBuy,手拍不受限;FSD simulateUnit 同款并标 siSrc=cap */
  (function () {
    const fw = []; for (let w = 36; w <= 40; w++) fw.push(C.mkPeriod(2026, w));
    const fc = fw.map(function (p) { return { p: p, so: 70, src: 'test' }; });
    const u = mk('k', 'P', [[C.mkPeriod(2026, 35), 70, 0, 600]]);
    const cur = C.unitCurrent(u, {});
    const r = C.simulateRetail({ unit: u, cur: cur, forecast: fc, cfg: { roundTo: 1 }, ovSI: {}, autoBuy: true, params: { trigger: 90, target: 120 }, maxBuy: 100 });
    eq(r.rows[0].buy, 100, 'maxBuy(retail): rule buy 670 capped to channel capacity 100');
    const ovMap = {}; ovMap[fw[0]] = 900;
    const r2 = C.simulateRetail({ unit: u, cur: cur, forecast: fc, cfg: { roundTo: 1 }, ovSI: ovMap, autoBuy: true, params: { trigger: 90, target: 120 }, maxBuy: 100 });
    eq(r2.rows[0].buy, 900, 'maxBuy(retail): manual override not capped');
    const fcU = fw.map(function (p) { return { p: p, so: 100, src: 'test' }; });
    const uU = mk('k', 'P', [[C.mkPeriod(2026, 35), 100, 0, 150]]);
    const s = C.simulateUnit({ unit: uU, cur: C.unitCurrent(uU, {}), forecast: fcU, futureWeeks: fw, params: { trigger: 90, target: 120, downTarget: 60 }, cfg: { roundTo: 1 }, maxBuy: 200 });
    eq(s.rows[0].si, 200, 'maxBuy(FSD): requisition capped to channel capacity');
    eq(s.rows[0].siSrc, 'cap', 'maxBuy(FSD): tagged cap');
  })();
})();

/* ---------- 前瞻需求护栏:规则日均用平销,不被大促周放大;水位型/画像水位随需求塌陷收缩 ---------- */
(function () {
  const mk = function (rows) {
    const u = { audio: false, key: 'k', Drift: 'X', account: 'A', Garnet: 'L', product: 'P', model: 'M', periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: x[2] || 0, inv: x[3] != null ? x[3] : null, inv1: null }); });
    return u;
  };
  const fw = []; for (let w = 36; w <= 40; w++) fw.push(C.mkPeriod(2026, w));
  const fc = fw.map(function (p) { return { p: p, so: 70, src: 'test' }; });
  /* 上周大促卖了 700:滚动日均 55/日会把补货放大到 120×55;用平销 10/日 → 1200-530=670 */
  const promo = mk([[C.mkPeriod(2026, 35), 700, 0, 600]]);
  const r = C.simulateRetail({ unit: promo, cur: C.unitCurrent(promo, {}), forecast: fc, cfg: { roundTo: 1 }, ovSI: {}, autoBuy: true, params: { trigger: 90, target: 120 }, dailyBase: 10 });
  eq(r.rows[0].buy, 670, 'fwdDemand: rule uses 平销 daily (10/d), not promo-inflated trailing (55/d)');
  /* 水位型:需求塌陷(平销 0.1/日)时,补到水位受 targetDos×需求×1.5 封顶 → 不再回补到 900 */
  const dead = mk([[C.mkPeriod(2026, 35), 5, 0, 400]]);
  const fcD = fw.map(function (p) { return { p: p, so: 1, src: 'test' }; });
  const d = C.simulateRetail({ unit: dead, cur: C.unitCurrent(dead, {}), forecast: fcD, cfg: { roundTo: 1 }, ovSI: {}, autoBuy: true, params: { type: 'inv', triggerInv: 500, targetInv: 900, targetDos: 100 }, dailyBase: 0.1 });
  eq(d.rows[0].buy, 0, 'fwdDemand: inventory-level policy does not restock a dying SKU (cap 100d×0.1/d×1.5=15 < stock)');
  const live = mk([[C.mkPeriod(2026, 35), 70, 0, 400]]);
  const l = C.simulateRetail({ unit: live, cur: C.unitCurrent(live, {}), forecast: fc, cfg: { roundTo: 1 }, ovSI: {}, autoBuy: true, params: { type: 'inv', triggerInv: 500, targetInv: 900, targetDos: 100 }, dailyBase: 10 });
  eq(l.rows[0].buy, 570, 'fwdDemand: with healthy demand the level policy still fills to 900 (900-330)');
})();

/* ---------- 前瞻需求:淡季少补、大促前多补;画像检查点按检查点之后的销量折算 ---------- */
(function () {
  const mk = function (rows) {
    const u = { audio: false, key: 'k', Drift: 'X', account: 'A', Garnet: 'L', product: 'P', model: 'M', periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: x[2] || 0, inv: x[3] != null ? x[3] : null, inv1: null }); });
    return u;
  };
  const fw = []; for (let w = 36; w <= 47; w++) fw.push(C.mkPeriod(2026, w));
  /* 前 8 周淡季 20/周,后 4 周大促 200/周 */
  const fc = fw.map(function (p, i) { return { p: p, so: i < 8 ? 20 : 200, src: 'test' }; });
  const u = mk([[C.mkPeriod(2026, 35), 20, 0, 150]]);
  const cur = C.unitCurrent(u, {});
  const r = C.simulateRetail({ unit: u, cur: cur, forecast: fc, cfg: { roundTo: 1 }, ovSI: {}, autoBuy: true, params: { trigger: 60, target: 90 }, dailyBase: 80 / 7 });
  /* 第0周:前瞻8周均=20/周=2.86/日;pre=130 → DOS 45<60 → 补到 90×2.86=257 → 买 127(不是按全年平销 11.4/日买到 1029) */
  eq(r.rows[0].buy, 127, 'fwd: off-season buy sized by upcoming 8-week SO (90d x 2.86/d), not annual mean');
  /* 第7周:前瞻窗含 4 个大促周 → 需求 (20+200×4... )/8 → 补货显著放大 */
  ok(r.rows[7].buy > r.rows[0].buy * 3, 'fwd: pre-promo buy scales up with upcoming promo demand, got ' + r.rows[7].buy);
  /* 画像检查点:idx 7 处 dos 30,之后 4 周大促 200/周 → 水平=30×28.6=857 而非按平销 */
  const r2 = C.simulateRetail({ unit: u, cur: cur, forecast: fc, cfg: { roundTo: 1 }, ovSI: {}, autoBuy: true, params: { trigger: 5, target: 10 }, dailyBase: 80 / 7, checkpoints: [{ idx: 7, dos: 30, maxDos: 60 }] });
  ok(Math.abs(r2.rows[7].inv - 857) <= 3, 'fwd: month-end level = profile DOS x post-checkpoint demand (30d x 200/7), got ' + r2.rows[7].inv);
  /* 典型水位天花板:maxDos 20 → 水平封到 20×28.6=571 */
  const r3 = C.simulateRetail({ unit: u, cur: cur, forecast: fc, cfg: { roundTo: 1 }, ovSI: {}, autoBuy: true, params: { trigger: 5, target: 10 }, dailyBase: 80 / 7, checkpoints: [{ idx: 7, dos: 30, maxDos: 20 }] });
  ok(Math.abs(r3.rows[7].inv - 571) <= 3, 'fwd: typical-level ceiling (maxDos) caps the profile level, got ' + r3.rows[7].inv);
})();

/* ---------- 累计取整(2026-09-01 用户拍板):每周 5 的倍数,累计总量不丢,手拍不参与进位 ---------- */
(function () {
  const q = C.quantizeSeq([2, 2, 2, 2, 2], 5);
  ok(q.every(function (v) { return v % 5 === 0; }), 'quantizeSeq: every week is a multiple of 5, got ' + q.join(','));
  eq(q.reduce(function (a, b) { return a + b; }, 0), 10, 'quantizeSeq: total preserved (2x5=10), not zeroed');
  const q7 = C.quantizeSeq([7, 7, 7], 5);
  eq(q7.reduce(function (a, b) { return a + b; }, 0), 20, 'quantizeSeq: 21 raw -> 20 (nearest 5 on the cumulative)');
  eq(q7[0], 5, 'quantizeSeq: first week 7 -> 5 (user rule kept for the first value)');
  eq(C.quantizeSeq([7, 7, 7], 1).join(','), '7,7,7', 'quantizeSeq: step 1 = plain rounding');
  const fc = [{ p: 1, so: 7, src: 'flat' }, { p: 2, so: 33, src: 'override' }, { p: 3, so: 7, src: 'flat' }, { p: 4, so: null, src: 'none' }];
  C.quantizeFc(fc, 5);
  eq(fc[1].so, 33, 'quantizeFc: override kept verbatim');
  eq(fc[3].so, null, 'quantizeFc: null (none) untouched');
  eq(fc[0].so + fc[2].so, 15, 'quantizeFc: non-override weeks quantized on their own cumulative (7+7=14 -> 15)');
  /* 引擎级:周销 2 台的单元,推演不再全 0 */
  const u = { audio: false, key: 'k', Drift: 'X', account: 'A', Garnet: 'L', product: 'P', model: 'M', periods: [], weeks: new Map() };
  for (let w = 1; w <= 30; w++) { const p = C.mkPeriod(2026, w); u.periods.push(p); u.weeks.set(p, { so: 2, si: 0, inv: 100, inv1: null }); }
  const fw = []; for (let w = 31; w <= 40; w++) fw.push(C.mkPeriod(2026, w));
  const cur = C.unitCurrent(u, {});
  const fcR = C.buildRetailForecast({ unit: u, futureWeeks: fw, refYear: 2025, growth: 1, kdef: {}, kedit: {}, ovSO: {}, cfg: { roundTo: 5 }, cur: cur });
  const tot = fcR.reduce(function (a, f) { return a + (f.so || 0); }, 0);
  ok(tot >= 15 && tot <= 25, 'cumulative rounding: 2/wk x 10 weeks keeps ~20 total instead of 0, got ' + tot);
  ok(fcR.every(function (f) { return f.so % 5 === 0; }), 'cumulative rounding: every week still a multiple of 5');
})();

/* ---------- 拍数承接 / 正常经营水位(2026-09-01 用户拍板) ---------- */
(function () {
  const mk = function (rows, extra) {
    const u = { audio: false, key: 'k', Drift: 'X', account: 'A', Garnet: 'L', product: 'P', model: 'M', periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: x[2] || 0, inv: x[3] != null ? x[3] : null, inv1: null }); });
    return Object.assign(u, extra || {});
  };
  /* 承接:第2周拍 500(公式≈200) → 之后各周 ≈ 200×2.5=500 而不是 200;拍数周原样;carryEnd=2.5 */
  (function () {
    const hist = []; for (let w = 1; w <= 30; w++) hist.push([C.mkPeriod(2026, w), 200, 0, 1000]);
    const u = mk(hist);
    const fw = []; for (let w = 31; w <= 40; w++) fw.push(C.mkPeriod(2026, w));
    const ov = {}; ov[fw[1]] = 500;
    const cur = C.unitCurrent(u, {});
    const fc = C.buildRetailForecast({ unit: u, futureWeeks: fw, refYear: 2025, growth: 1, kdef: {}, kedit: {}, ovSO: ov, cfg: { roundTo: 5 }, cur: cur, carryTaps: true });
    eq(fc[1].so, 500, 'carry: tapped week kept verbatim');
    eq(fc[1].src, 'override', 'carry: tapped week src override');
    ok(fc[0].so >= 195 && fc[0].so <= 205, 'carry: weeks before the tap untouched, got ' + fc[0].so);
    ok(fc[2].so >= 495 && fc[2].so <= 505, 'carry: week after tap re-based x2.5 (~500), got ' + fc[2].so);
    ok(fc[9].so >= 495 && fc[9].so <= 505, 'carry: carries to the end of horizon, got ' + fc[9].so);
    ok(Math.abs(fc.carryEnd - 2.5) < 0.01, 'carry: carryEnd exposed for next-year handoff, got ' + fc.carryEnd);
    ok(fc[2].carry != null, 'carry: carried weeks flagged');
    const fc0 = C.buildRetailForecast({ unit: u, futureWeeks: fw, refYear: 2025, growth: 1, kdef: {}, kedit: {}, ovSO: ov, cfg: { roundTo: 5 }, cur: cur, carryTaps: false });
    ok(fc0[2].so >= 195 && fc0[2].so <= 205, 'carry: switch off -> point override only, got ' + fc0[2].so);
  })();
  /* 正常经营水位:平销周库存 300 左右,平销 70/周 → 平销DOS=30 */
  (function () {
    const hist = []; for (let w = 1; w <= 30; w++) hist.push([C.mkPeriod(2026, w), 70, 0, 280 + (w % 3) * 20]);
    const u = mk(hist);
    const bl = { base: 70, delta: 0, conf: 'high', usedPeriods: hist.map(function (x) { return x[0]; }) };
    const nl = C.normalLevelOf(u, bl);
    ok(!!nl, 'normalLevel: learnable from baseline weeks');
    ok(nl.inv >= 280 && nl.inv <= 320, 'normalLevel: median inventory ~300, got ' + nl.inv);
    eq(nl.dos, 30, 'normalLevel: 300/(70/7)=30 days');
    eq(C.normalLevelOf(u, { base: 70, usedPeriods: hist.slice(0, 3).map(function (x) { return x[0]; }) }), null, 'normalLevel: <6 weeks -> null');
    /* 引擎:规则想补到 120 天(1170),被正常水位封到 min(300×1.5, 30×1.5×10)=450 → 买 420 */
    const fw = []; for (let w = 36; w <= 40; w++) fw.push(C.mkPeriod(2026, w));
    const fc = fw.map(function (p) { return { p: p, so: 70, src: 'test' }; });
    const u2 = mk([[C.mkPeriod(2026, 35), 70, 0, 100]]);
    const r = C.simulateRetail({ unit: u2, cur: C.unitCurrent(u2, {}), forecast: fc, cfg: { roundTo: 1 }, ovSI: {}, autoBuy: true, params: { trigger: 90, target: 120 }, dailyBase: 10, normal: { inv: 300, dos: 30 } });
    eq(r.rows[0].buy, 420, 'normalLevel(retail): auto buy capped by channel normal level (450-30)');
    const s = C.simulateUnit({ unit: u2, cur: C.unitCurrent(u2, {}), forecast: fc, futureWeeks: fw, params: { trigger: 90, target: 120, downTarget: 60 }, cfg: { roundTo: 1 }, dailyBase: 10, normal: { inv: 300, dos: 30 } });
    eq(s.rows[0].si, 420, 'normalLevel(FSD): requisition capped by channel normal level');
    eq(s.rows[0].siSrc, 'cap', 'normalLevel(FSD): tagged cap');
    const ovMap = {}; ovMap[fw[0]] = 900;
    const r2 = C.simulateRetail({ unit: u2, cur: C.unitCurrent(u2, {}), forecast: fc, cfg: { roundTo: 1 }, ovSI: ovMap, autoBuy: true, params: { trigger: 90, target: 120 }, dailyBase: 10, normal: { inv: 300, dos: 30 } });
    eq(r2.rows[0].buy, 900, 'normalLevel: manual override never capped');
  })();
})();

/* ---------- simulateUnit(FSD/间接渠道):前瞻需求、水位型策略、画像检查点月末补到位 ---------- */
(function () {
  const mk = function (rows) {
    const u = { audio: false, key: 'k', Drift: 'X', account: 'A', Garnet: 'L', product: 'P', model: 'M', periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: x[2] || 0, inv: x[3] != null ? x[3] : null, inv1: x[3] != null ? x[3] : null }); });
    return u;
  };
  const fw = []; for (let w = 36; w <= 40; w++) fw.push(C.mkPeriod(2026, w));
  const fc = fw.map(function (p) { return { p: p, so: 70, src: 'test' }; });
  const u = mk([[C.mkPeriod(2026, 35), 70, 0, 300]]);
  const cur = C.unitCurrent(u, {});
  /* 画像检查点(level):起始 300,idx4 水平 900 → 按剩余周均摊补上,检查点当周正好到位 */
  const up = C.simulateUnit({ unit: u, cur: cur, forecast: fc, futureWeeks: fw, params: { trigger: 20, target: 30, downTarget: 60 }, cfg: { roundTo: 1 }, dailyBase: 10, checkpoints: [{ idx: 4, level: 900 }] });
  eq(up.rows[0].si, 190, 'unit-level: shortfall (900+350-300)/5 = 190');
  eq(up.rows[0].siSrc, 'ye', 'unit-level: steer-up tagged ye');
  eq(up.rows[4].inv, 900, 'unit-level: inventory lands on profile level at checkpoint');
  /* 水位型策略进 FSD 引擎:库存穿过 250 补到 600 */
  const u2 = mk([[C.mkPeriod(2026, 35), 70, 0, 300]]);
  const lv = C.simulateUnit({ unit: u2, cur: C.unitCurrent(u2, {}), forecast: fc, futureWeeks: fw, params: { type: 'inv', triggerInv: 250, targetInv: 600, targetDos: 100, downTarget: 60 }, cfg: { roundTo: 1 }, dailyBase: 10 });
  eq(lv.rows[0].si, 370, 'unit-inv: crossed 250 (230 after SO) -> fill to 600');
  /* 前瞻需求:上周大促 700 不再放大要货(DOS 规则用未来 8 周 10/日) */
  const u3 = mk([[C.mkPeriod(2026, 35), 700, 0, 600]]);
  const fd = C.simulateUnit({ unit: u3, cur: C.unitCurrent(u3, {}), forecast: fc, futureWeeks: fw, params: { trigger: 90, target: 120, downTarget: 60 }, cfg: { roundTo: 1 }, dailyBase: 10 });
  eq(fd.rows[0].si, 670, 'unit-fwd: requisition sized by upcoming SO (1200-530), not promo-inflated trailing');
  /* 收官梯度 cap 语义仍在 */
  const cp = C.simulateUnit({ unit: u3, cur: C.unitCurrent(u3, {}), forecast: fc, futureWeeks: fw, params: { trigger: 90, target: 120, downTarget: 60 }, cfg: { roundTo: 1 }, dailyBase: 10, checkpoints: [{ idx: 4, cap: 50 }] });
  eq(cp.rows[0].si, 250, 'unit-cap: FSD glide cap still limits (500+350-600)');
})();

/* ---------- 锁量已发=生命周期累计(跨年,从首次 SI 起) ---------- */
(function () {
  const u = { audio: false, key: 'k', Drift: 'X', account: 'A', Garnet: 'L', product: 'P', model: 'M', periods: [], weeks: new Map() };
  const put = function (p, si) { u.periods.push(p); u.weeks.set(p, { so: 10, si: si, inv: 100, inv1: 100 }); };
  put(C.mkPeriod(2025, 8), 0); put(C.mkPeriod(2025, 10), 40000); put(C.mkPeriod(2025, 30), 20000); put(C.mkPeriod(2026, 5), 15000); put(C.mkPeriod(2026, 30), 0);
  const lc = C.lifecycleSI(u);
  eq(lc.sent, 75000, 'lifecycleSI: cumulative across years (40000+20000+15000), not this year only');
  eq(lc.firstP, C.mkPeriod(2025, 10), 'lifecycleSI: lifecycle starts at first week with SI>0');
  eq(lc.lastP, C.mkPeriod(2026, 5), 'lifecycleSI: ends at last week with SI>0');
})();

/* ---------- 财经Q表透视(经营数据表输入块) ---------- */
(function () {
  const mkRow = function (Garnet, name, Drift, src, y, m, so, si, inv, rrp) {
    return [Garnet, 'P', name, 'FAM', Drift, 'ACC', src, y, 'Q' + Math.ceil(m / 3), m, so, si, inv, rrp, '', '', '', 'M'];
  };
  const rows = [
    mkRow('手机', 'Astra X7', '墨西哥', 'FSD', 2027, 1, 1000, 500, 200, 48999),
    mkRow('手机', 'Astra X7', '墨西哥', 'FSD', 2027, 12, 3000, 0, 900, 48999),
    mkRow('手机', 'Astra X7', '墨西哥', 'FSD', 2026, 12, 800, 0, 400, 48999),
    mkRow('手机', 'Astra X7', '墨西哥', '下游', 2027, 1, 9999, 9999, 9999, ''),
    mkRow('音频与智能配件', 'SonicBuds 6', '墨西哥', 'FSD', 2027, 2, 5000, 5000, 5000, ''),
    mkRow('音频与智能配件', 'SonicBuds 6', '墨西哥', '音频专表', 2027, 2, 700, 300, 100, 1999)
  ];
  const qv = C.budgetQuarterPivot(rows, 2027);
  eq(qv.rows.length, 2, 'qpivot: one row per BU×传播名×国家 (下游 & FSD-audio rows excluded)');
  const mx = qv.rows.filter(function (r) { return r[1] === 'Astra X7'; })[0];
  eq(mx[3], 0.4, 'qpivot: prior year-end inventory (K) from Dec of endYear-1');
  eq(mx[4], 1, 'qpivot: SO Q1 in K (1000 -> 1.0)');
  eq(mx[7], 3, 'qpivot: SO Q4 in K');
  eq(mx[8], 4, 'qpivot: SO annual total');
  eq(mx[9], 0.5, 'qpivot: SI Q1 in K');
  eq(mx[14], 0.9, 'qpivot: year-end inventory (K) = Dec month-end');
  eq(C.monthDaysOf(2027, 12), 35, 'qpivot: Dec 2027 has 5 Thursday-weeks → 35 days');
  eq(mx[15], Math.round(900 / (3000 / 35)), 'qpivot: year-end DOS = 900 / (3000/12月天数 35) = 11 (was ÷30 → 9)');
  eq(mx[16], 48999, 'qpivot: RRP carried');
  const fb = qv.rows.filter(function (r) { return r[1] === 'SonicBuds 6'; })[0];
  eq(fb[4], 0.7, 'qpivot: audio taken from 专表 only (FSD audio row skipped)');
  eq(qv.headers[3], '26年年底库存(K)', 'qpivot: prior-year header labelled');
})();

/* ---------- 新品模拟的手拍:拍 SO 高于可售 → SI 跟上;拍 SI 原样且当周不叠加规则补货 ---------- */
(function () {
  const fw = []; for (let w = 36; w <= 41; w++) fw.push(C.mkPeriod(2026, w));
  const base = C.simNewProduct({ fw: fw, firstP: fw[0], rampW: 1, base: 70, alpha: 1, kdef: {}, growth: 1, trigger: 60, target: 90, firstSI: 200, roundTo: 5 });
  const ov = {}; ov[fw[2]] = 500;
  const t1 = C.simNewProduct({ fw: fw, firstP: fw[0], rampW: 1, base: 70, alpha: 1, kdef: {}, growth: 1, trigger: 60, target: 90, firstSI: 200, roundTo: 5, ovSO: ov });
  eq(t1.rows[2].so, 500, 'np-tap: tapped SO echoes exactly (not capped by inventory)');
  ok(t1.rows[2].si > base.rows[2].si, 'np-tap: SI rises to cover tapped SO, got ' + t1.rows[2].si + ' vs ' + base.rows[2].si);
  eq(t1.rows[2].soSrc, 'override', 'np-tap: tapped week tagged override');
  const ovI = {}; ovI[fw[1]] = 45;
  const t2 = C.simNewProduct({ fw: fw, firstP: fw[0], rampW: 1, base: 70, alpha: 1, kdef: {}, growth: 1, trigger: 60, target: 90, firstSI: 200, roundTo: 5, ovSI: ovI });
  eq(t2.rows[1].si, 45, 'np-tap: tapped SI kept verbatim (no rule top-up that week)');
  eq(t2.rows[1].buySrc, 'override', 'np-tap: tapped SI tagged override');
})();

/* ---------- 日期→周(新品上市日期选择器) ---------- */
(function () {
  eq(C.periodOfDateStr('2026-09-07'), 2026037, 'periodOfDateStr: Mon 2026-09-07 -> 2026W37');
  eq(C.periodOfDateStr('2026-01-03'), 2026001, 'periodOfDateStr: Sat 2026-01-03 -> 2026W01');
  eq(C.periodOfDateStr('2025-12-29'), 2026001, 'periodOfDateStr: Mon 2025-12-29 belongs to ISO 2026W01');
  eq(C.periodOfDateStr('bad'), null, 'periodOfDateStr: invalid -> null');
})();

/* ---------- 锚品历史平销:2025 年卖完的老品照样能当锚(不看现在卖不卖);新品窗口跨到明年 ---------- */
(function () {
  const mk = function (rows) {
    const u = { audio: false, key: 'k', Drift: 'X', account: 'A', Garnet: 'L', product: 'P', model: 'M', periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: x[2] || 0, inv: x[3] != null ? x[3] : null, inv1: null }); });
    return u;
  };
  /* 老品:25W10 起卖 30 周(爬坡 20/40/60/80 → 平销 ~100 → 尾段 60/40/20),之后 45 周全 0 */
  const rows = []; let p = C.mkPeriod(2025, 10);
  const prof = [20, 40, 60, 80], tail = [60, 40, 20];
  for (let i = 0; i < 30; i++) { const so = i < 4 ? prof[i] : (i >= 27 ? tail[i - 27] : 100 + ((i % 3) - 1) * 5); rows.push([p, so, i === 0 ? 800 : 0, 800 - i * 20]); p = C.addWeeksP(p, 1); }
  for (let i = 0; i < 45; i++) { rows.push([p, 0, 0, 0]); p = C.addWeeksP(p, 1); }
  const u = mk(rows);
  const maxP = rows[rows.length - 1][0];
  const h = C.anchorHistOf(u, { maxPeriod: maxP });
  ok(h.base != null && h.base >= 90 && h.base <= 105, 'anchorHist: EOL anchor base comes from its selling period, got ' + h.base);
  eq(h.active, false, 'anchorHist: EOL anchor flagged inactive (last sale > 8 weeks ago)');
  eq(h.firstP, C.mkPeriod(2025, 10), 'anchorHist: firstP = first SO>0 week');
  eq(h.lifeWeeks, 30, 'anchorHist: lifecycle = 30 selling weeks');
  const blNow = C.baselineOf(u, {});
  ok(h.base > (blNow.base || 0), 'anchorHist: beats the plain full-history baseline (dead tail drags it to ' + blNow.base + ' — why V48 built no channels)');
  /* 仍在售:与看板当前平销同口径 */
  const rows2 = []; let q = C.mkPeriod(2026, 1);
  for (let i = 0; i < 30; i++) { rows2.push([q, 50 + (i % 2) * 5, 0, 300]); q = C.addWeeksP(q, 1); }
  const u2 = mk(rows2);
  const h2 = C.anchorHistOf(u2, { maxPeriod: rows2[rows2.length - 1][0] });
  eq(h2.active, true, 'anchorHist: still-selling anchor flagged active');
  eq(h2.base, C.baselineOf(u2, {}).base, 'anchorHist: active anchor base == current baseline');
  const h0 = C.anchorHistOf(mk([[C.mkPeriod(2026, 1), 0, 0, 0]]), {});
  eq(h0.base, null, 'anchorHist: no sales → null base');
  /* 窗口终止年 */
  eq(C.npWindowEndYear(2026, null, 52), 2027, 'npWindow: default = next year end');
  eq(C.npWindowEndYear(2026, C.mkPeriod(2027, 10), 78), 2028, 'npWindow: launch 27W10 + 78 weeks → 2028');
  eq(C.npWindowEndYear(2026, C.mkPeriod(2026, 40), 20), 2027, 'npWindow: never shorter than next year');
  /* 27 年上市的新品在长窗口里有量,上市前全 0 */
  const fwL = C.futureWeeksTo(C.mkPeriod(2026, 34), 2027);
  const sim = C.simNewProduct({ fw: fwL, firstP: C.mkPeriod(2027, 5), rampW: 2, base: 100, alpha: 1.4, kdef: {}, growth: 1, trigger: 60, target: 90, roundTo: 5 });
  const so27 = sim.rows.filter(function (r) { return C.periodY(r.p) === 2027; }).reduce(function (s, r) { return s + r.so; }, 0);
  ok(so27 > 0, 'npWindow: 2027 launch produces 2027 SO in the long window, got ' + so27);
  ok(sim.rows.filter(function (r) { return C.periodY(r.p) === 2026; }).every(function (r) { return r.so === 0 && r.si === 0; }), 'npWindow: nothing before launch');
})();

/* ---------- 锁量贯通延伸段:月行按预算比例压缩 SI 并重链库存,SO 受期初+SI 硬约束 ---------- */
(function () {
  const mkRow = function (c, a, y, m, so, si, inv) { return ['L', 'P', 'P', 'F', c, a, 'FSD', y, 'Q' + Math.ceil(m / 3), m, so, si, inv, '', '', '', '', 'M']; };
  const rows = [
    mkRow('X', 'A', 2027, 1, 100, 200, 300), mkRow('X', 'A', 2027, 2, 100, 200, 400), mkRow('X', 'A', 2027, 3, 100, 200, 500),
    mkRow('Y', 'B', 2027, 1, 50, 100, 100), mkRow('Y', 'B', 2027, 2, 50, 100, 150)
  ];
  const f = C.squeezeMonthRows(rows, [0, 1, 2, 3, 4], 400, 5, 'lock');
  eq(f, 0.5, 'squeeze: 800 → 400 gives factor 0.5');
  eq(rows[0][11], 100, 'squeeze: unit A month1 SI halved');
  eq(rows[0][12], 200, 'squeeze: unit A month1 inventory re-chained (start 200 + 100 − 100)');
  eq(rows[2][12], 200, 'squeeze: unit A month3 inventory chain continues');
  eq(rows[3][11], 50, 'squeeze: unit B month1 SI halved');
  eq(rows[3][16], 'lock', 'squeeze: note tagged');
  let sum = 0; rows.forEach(function (r) { sum += r[11]; });
  ok(sum <= 400, 'squeeze: total SI within budget, got ' + sum);
  const rows2 = [mkRow('X', 'A', 2027, 1, 100, 100, 0)];   // 期初 = 0−100+100 = 0
  C.squeezeMonthRows(rows2, [0], 5, 5, '');
  eq(rows2[0][11], 5, 'squeeze: SI floored to step within budget');
  eq(rows2[0][10], 5, 'squeeze: SO capped by 期初+SI');
  eq(C.squeezeMonthRows([mkRow('X', 'A', 2027, 1, 10, 50, 40)], [0], 50, 5, ''), null, 'squeeze: within budget → null, untouched');
  const rows3 = [mkRow('X', 'A', 2027, 1, 10, 50, 40)];
  eq(C.squeezeMonthRows(rows3, [0], 0, 5, 'z'), 0, 'squeeze: zero budget → factor 0');
  eq(rows3[0][11], 0, 'squeeze: zero budget → SI 0');
})();

/* ---------- FSD ⇄ 下游 对账:Σ下游SO≈FSD SO;FSD总库存≈INV1+Σ下游库存;共同周窗口;缺边标记;差异分级 ---------- */
(function () {
  const mkU = function (Drift, account, product, model, audio, rows) {
    const u = { key: Drift + '|' + account + '|' + model, Drift: Drift, account: account, Garnet: 'L', product: product, model: model, audio: !!audio, periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: 0, inv: x[2] != null ? x[2] : null, inv1: x[3] != null ? x[3] : null }); });
    return u;
  };
  const P = function (w) { return C.mkPeriod(2026, w); };
  const fsd = new Map(), ds = new Map();
  const add = function (m, u) { m.set(u.key, u); };
  add(fsd, mkU('CO', 'DIST', 'P1', 'M1', false, [[P(1), 100, 1000, 400], [P(2), 100, 1000, 400], [P(3), 100, 1000, 400], [P(4), 100, 1000, 400]]));
  add(fsd, mkU('CO', 'DIST', 'P2', 'M2', false, [[P(1), 50, 500, 500], [P(2), 50, 500, 500], [P(3), 50, 500, 500]]));
  add(ds, mkU('CO', 'R1', 'P1', 'M1', false, [[P(1), 60, 300], [P(2), 60, 300], [P(3), 60, 300]]));
  add(ds, mkU('CO', 'R2', 'P1', 'M1', false, [[P(1), 40, 300], [P(2), 40, 300], [P(3), 40, 300]]));
  add(ds, mkU('MX', 'R3', 'P3', 'M3', false, [[P(1), 10, 50], [P(2), 10, 50], [P(3), 10, 50]]));
  const rec = C.reconcileFsdRetail({ units: fsd }, { units: ds }, { weeks: 8 });
  eq(rec.window.length, 3, 'recon: window = common weeks (3), FSD-only W4 excluded');
  const r1 = rec.rows.filter(function (r) { return r.product === 'P1'; })[0];
  eq(r1.fsdSO, 300, 'recon: FSD SO over window');
  eq(r1.dsSO, 300, 'recon: Σ downstream SO over window');
  eq(r1.status, 'OK', 'recon: SO and inventory reconcile → OK');
  eq(r1.fsdInv, 1000, 'recon: FSD total inventory at last common week');
  eq(r1.inv1 + r1.dsInv, 1000, 'recon: INV1 + Σ downstream inventory equals FSD total');
  eq(rec.rows.filter(function (r) { return r.product === 'P2'; })[0].status, '缺下游', 'recon: FSD product without downstream rows flagged');
  eq(rec.rows.filter(function (r) { return r.product === 'P3'; })[0].status, '缺FSD', 'recon: downstream-only product flagged');
  ok(rec.sum && rec.sum.counts.OK === 1 && rec.sum.counts['缺下游'] === 1 && rec.sum.counts['缺FSD'] === 1, 'recon: summary counts');
  eq(rec.sum.nBoth, 1, 'recon: totals only over products present on both sides');
  const ds2 = new Map(); add(ds2, mkU('CO', 'R1', 'P1', 'M1', false, [[P(1), 80, 600], [P(2), 80, 600], [P(3), 80, 600]]));
  const rec2 = C.reconcileFsdRetail({ units: fsd }, { units: ds2 }, { weeks: 8 });
  const q1 = rec2.rows.filter(function (r) { return r.product === 'P1'; })[0];
  eq(q1.pSO, -0.2, 'recon: pSO = (ds−fsd)/fsd');
  eq(q1.status, '异常', 'recon: 20% SO gap → 异常 even though inventory matches');
  eq(rec2.rows[0].product, 'P1', 'recon: 异常 rows sort first');
  eq(C.latestFieldAt(mkU('CO', 'X', 'P', 'M', false, [[P(1), 1, 10], [P(2), 1, null], [P(3), 1, 30]]), 'inv', P(2)), 10, 'latestFieldAt: falls back to the latest earlier week with a value');
})();

/* ---------- 对账 + 渠道类型/连线:直签型不参与 SO 对账;按直接渠道细分;未连线/国家合计单列 ---------- */
(function () {
  const mkU = function (Drift, account, product, model, audio, rows) {
    const u = { key: Drift + '|' + account + '|' + model, Drift: Drift, account: account, Garnet: 'L', product: product, model: model, audio: !!audio, periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: 0, inv: x[2] != null ? x[2] : null, inv1: x[3] != null ? x[3] : null }); });
    return u;
  };
  const P = function (w) { return C.mkPeriod(2026, w); };
  const add = function (m, u) { m.set(u.key, u); };
  const fsd = new Map(), ds = new Map();
  add(fsd, mkU('CO', 'DIST', 'P1', 'M1', false, [[P(1), 100, 1000, 400], [P(2), 100, 1000, 400], [P(3), 100, 1000, 400]]));
  add(fsd, mkU('CO', 'TELCO', 'P1', 'M1', false, [[P(1), 30, 90, 90], [P(2), 30, 90, 90], [P(3), 30, 90, 90]]));
  add(fsd, mkU('CO', 'TELCO', 'P9', 'M9', false, [[P(1), 5, 20, 20], [P(2), 5, 20, 20], [P(3), 5, 20, 20]]));
  add(ds, mkU('CO', 'R1', 'P1', 'M1', false, [[P(1), 60, 300], [P(2), 60, 300], [P(3), 60, 300]]));
  add(ds, mkU('CO', 'R2', 'P1', 'M1', false, [[P(1), 40, 300], [P(2), 40, 300], [P(3), 40, 300]]));
  add(ds, mkU('MX', 'R3', 'P3', 'M3', false, [[P(1), 10, 50], [P(2), 10, 50], [P(3), 10, 50]]));
  const types = { 'CO||DIST': 'dist', 'CO||TELCO': 'operator' };
  const tree = { CO: { R1: 'DIST', R2: '*' } };
  const rec = C.reconcileFsdRetail({ units: fsd }, { units: ds }, { weeks: 8, types: types, tree: tree });
  const t1 = rec.rows.filter(function (r) { return r.product === 'P1'; })[0];
  eq(t1.fsdSO, 300, 'recon/types: operator SO excluded from the SO comparison');
  eq(t1.directSO, 90, 'recon/types: direct-to-consumer SO reported separately');
  eq(t1.status, 'OK', 'recon/types: still OK after excluding operator (300 vs 300; inv 1090 vs 490+600)');
  eq(rec.rows.filter(function (r) { return r.product === 'P9'; })[0].status, '直达', 'recon/types: product sold only via operator → 直达, not 缺下游');
  const bdD = rec.byDirect.filter(function (r) { return r.account === 'DIST'; })[0];
  eq(bdD.nDs, 1, 'recon/tree: DIST has one wired child');
  eq(bdD.dsSO, 180, 'recon/tree: DIST gets only its wired child R1 (60×3)');
  eq(bdD.status, '异常', 'recon/tree: DIST 300 vs 180 → 异常');
  const bdS = rec.byDirect.filter(function (r) { return r.account === '(国家FSD合计)'; })[0];
  eq(bdS.dsSO, 120, 'recon/tree: * bucket collects R2');
  eq(bdS.status, '国家合计', 'recon/tree: * bucket not judged');
  eq(rec.byDirect.filter(function (r) { return r.account === 'TELCO'; })[0].status, '直达', 'recon/tree: operator flagged 直达');
  const bdU = rec.byDirect.filter(function (r) { return r.account === '(未连线)'; })[0];
  eq(bdU.Drift + '/' + bdU.dsSO, 'MX/30', 'recon/tree: unwired MX R3 lands in the 未连线 bucket');
  eq(rec.byDirect[0].account, 'DIST', 'recon/tree: 异常 sorts first');
  const rec0 = C.reconcileFsdRetail({ units: fsd }, { units: ds }, { weeks: 8 });
  eq(rec0.byDirect.length, 0, 'recon: no tree → no byDirect rows');
  eq(rec0.rows.filter(function (r) { return r.product === 'P1'; })[0].fsdSO, 390, 'recon: no types → every FSD account counts as 分销');
})();

/* ---------- 直接渠道类型按名称猜 + 对账按 国家||产业 键(产业层优先,兼容旧国家键) ---------- */
(function () {
  eq(C.chanTypeGuess('KEYSTONE (Amazon FBA)_Indirect Retailer'), 'online', 'typeGuess: Amazon → 电商·直签');
  eq(C.chanTypeGuess('Colombia_ACME_ESHOP_Indirect Retailer'), 'own', 'typeGuess: ESHOP → 自营·直签');
  eq(C.chanTypeGuess('TELCOM ANDINA S.A.'), 'operator', 'typeGuess: TELCOM → 运营商·直签');
  eq(C.chanTypeGuess('FLUVIAL ALMACENES_DRP'), 'retail', 'typeGuess: _DRP → 直签零售');
  eq(C.chanTypeGuess('Boreal Abastos Corp.'), null, 'typeGuess: distributor name → null (app treats as 分销)');
  const mkU = function (Drift, account, product, model, Garnet, rows) {
    const u = { key: Drift + '|' + account + '|' + model, Drift: Drift, account: account, Garnet: Garnet, product: product, model: model, audio: false, periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: 0, inv: x[2] != null ? x[2] : null, inv1: x[3] != null ? x[3] : null }); });
    return u;
  };
  const P = function (w) { return C.mkPeriod(2026, w); };
  const fsd = new Map(), ds = new Map();
  const add = function (m, u) { m.set(u.key, u); };
  /* 同一账户 X:平板走分销(带下游 R1),手机直签 */
  add(fsd, mkU('CO', 'X', 'PadA', 'M1', '平板', [[P(1), 100, 500, 200], [P(2), 100, 500, 200]]));
  add(fsd, mkU('CO', 'X', 'PhoneB', 'M2', '手机', [[P(1), 50, 80, 80], [P(2), 50, 80, 80]]));
  add(ds, mkU('CO', 'R1', 'PadA', 'M1', '平板', [[P(1), 100, 300], [P(2), 100, 300]]));
  const types = { 'CO||平板||X': 'dist', 'CO||手机||X': 'retail' };
  const tree = { 'CO||平板': { R1: 'X' } };
  const rec = C.reconcileFsdRetail({ units: fsd }, { units: ds }, { weeks: 8, types: types, tree: tree });
  eq(rec.rows.filter(function (r) { return r.product === 'PadA'; })[0].status, 'OK', 'recon/Garnet: 平板 under 分销 reconciles (200 vs 200; inv 500 vs 200+300)');
  eq(rec.rows.filter(function (r) { return r.product === 'PhoneB'; })[0].status, '直达', 'recon/Garnet: same account is 直签 for 手机 → 直达, not 缺下游');
  const bd = rec.byDirect;
  eq(bd.filter(function (r) { return r.account === 'X' && r.Garnet === '平板'; })[0].status, 'OK', 'recon/Garnet: byDirect row per 国家×产业×渠道 (平板 OK)');
  eq(bd.filter(function (r) { return r.account === 'X' && r.Garnet === '手机'; })[0].status, '直达', 'recon/Garnet: byDirect 手机 row is 直达');
  const legacy = C.reconcileFsdRetail({ units: fsd }, { units: ds }, { weeks: 8, types: { 'CO||X': 'dist' }, tree: { CO: { R1: 'X' } } });
  eq(legacy.byDirect.filter(function (r) { return r.account === 'X' && r.Garnet === '平板'; })[0].dsSO, 200, 'recon/Garnet: legacy Drift-level keys still resolve');
})();

/* ---------- 凑数推荐:上游 SO/库存缺口 = 某(几)家未连线下游 → 推荐;直达型上游不推荐 ---------- */
(function () {
  const mkU = function (Drift, account, product, model, Garnet, rows) {
    const u = { key: Drift + '|' + account + '|' + model, Drift: Drift, account: account, Garnet: Garnet, product: product, model: model, audio: false, periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: 0, inv: x[2] != null ? x[2] : null, inv1: x[3] != null ? x[3] : null }); });
    return u;
  };
  const P = function (w) { return C.mkPeriod(2026, w); };
  const add = function (m, u) { m.set(u.key, u); };
  const fsd = new Map(), ds = new Map();
  /* 上游 DIST:窗口 SO 300,总库存 1000,INV1 400 → 下游库存应为 600;已连 R1(SO 150,库存 350) → 缺口 SO 150 / 库存 250 */
  add(fsd, mkU('CO', 'DIST', 'P1', 'M1', 'L', [[P(1), 100, 1000, 400], [P(2), 100, 1000, 400], [P(3), 100, 1000, 400]]));
  add(ds, mkU('CO', 'R1', 'P1', 'M1', 'L', [[P(1), 50, 350], [P(2), 50, 350], [P(3), 50, 350]]));
  add(ds, mkU('CO', 'R2', 'P1', 'M1', 'L', [[P(1), 50, 250], [P(2), 50, 250], [P(3), 50, 250]]));
  add(ds, mkU('CO', 'R3', 'P1', 'M1', 'L', [[P(1), 13, 900], [P(2), 13, 900], [P(3), 14, 900]]));
  const sug = C.suggestWiring({ units: fsd }, { units: ds }, { Drift: 'CO', weeks: 8, tol: 0.15, wired: { R1: 'DIST' }, types: { DIST: 'dist' } });
  eq(sug.length, 1, 'suggest: exactly one suggestion');
  eq(sug[0].parent + '←' + sug[0].ds.join('+'), 'DIST←R2', 'suggest: R2 closes both the SO gap (150) and the inventory gap (250)');
  eq(sug[0].needSO + '/' + sug[0].needInv, '150/250', 'suggest: gaps = 300−150 and 1000−400−350');
  eq(sug[0].errSO + '/' + sug[0].errInv, '0/0', 'suggest: exact fit → zero error');
  /* 组合:R2 拆成 R2a(SO 100,库存 150)+R2b(SO 50,库存 100),单家都不够,两家一起刚好 */
  const ds2 = new Map();
  add(ds2, mkU('CO', 'R1', 'P1', 'M1', 'L', [[P(1), 50, 350], [P(2), 50, 350], [P(3), 50, 350]]));
  add(ds2, mkU('CO', 'R2a', 'P1', 'M1', 'L', [[P(1), 33, 150], [P(2), 33, 150], [P(3), 34, 150]]));
  add(ds2, mkU('CO', 'R2b', 'P1', 'M1', 'L', [[P(1), 17, 100], [P(2), 17, 100], [P(3), 16, 100]]));
  const sug2 = C.suggestWiring({ units: fsd }, { units: ds2 }, { Drift: 'CO', weeks: 8, tol: 0.15, wired: { R1: 'DIST' }, types: { DIST: 'dist' } });
  eq(sug2.length, 1, 'suggest: combo found');
  eq(sug2[0].ds.slice().sort().join('+'), 'R2a+R2b', 'suggest: two channels together close the gap');
  eq(C.suggestWiring({ units: fsd }, { units: ds }, { Drift: 'CO', weeks: 8, tol: 0.15, wired: { R1: 'DIST' }, types: { DIST: 'operator' } }).length, 0, 'suggest: 直达消费者 parent gets no suggestion');
  eq(C.suggestWiring({ units: fsd }, { units: ds }, { Drift: 'CO', weeks: 8, tol: 0, wired: { R1: 'DIST' }, types: { DIST: 'dist' } }).length, 1, 'suggest: exact fit passes tol 0');
  eq(C.suggestWiring({ units: fsd }, { units: ds }, { Drift: 'CO', weeks: 8, tol: 0.15, wired: { R1: 'DIST', R2: 'DIST' }, types: { DIST: 'dist' } }).length, 0, 'suggest: nothing left once R2 is wired (R3 does not fit)');
  eq(C.suggestWiring({ units: fsd }, { units: ds }, { Drift: 'MX', weeks: 8, tol: 0.15 }).length, 0, 'suggest: other Drift → empty');
})();

/* ---------- 同一家(镜像):直达渠道 AMZ 在间接表里也有同名行 → 连上后 SO 计入 FSD 侧、库存按同一家核对不加 INV1;凑数推荐推荐镜像 ---------- */
(function () {
  const mkU = function (Drift, account, product, model, Garnet, rows) {
    const u = { key: Drift + '|' + account + '|' + model, Drift: Drift, account: account, Garnet: Garnet, product: product, model: model, audio: false, periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: 0, inv: x[2] != null ? x[2] : null, inv1: x[3] != null ? x[3] : null }); });
    return u;
  };
  const P = function (w) { return C.mkPeriod(2026, w); };
  const add = function (m, u) { m.set(u.key, u); };
  const fsd = new Map(), ds = new Map();
  add(fsd, mkU('CO', 'AMZ', 'P1', 'M1', 'L', [[P(1), 80, 300, 300], [P(2), 80, 300, 300], [P(3), 80, 300, 300]]));
  add(fsd, mkU('CO', 'DIST', 'P1', 'M1', 'L', [[P(1), 100, 1000, 400], [P(2), 100, 1000, 400], [P(3), 100, 1000, 400]]));
  add(ds, mkU('CO', 'AMZ-ds', 'P1', 'M1', 'L', [[P(1), 80, 300], [P(2), 80, 300], [P(3), 80, 300]]));
  add(ds, mkU('CO', 'R1', 'P1', 'M1', 'L', [[P(1), 100, 600], [P(2), 100, 600], [P(3), 100, 600]]));
  const types = { 'CO||L||AMZ': 'online', 'CO||L||DIST': 'dist' };
  const rec0 = C.reconcileFsdRetail({ units: fsd }, { units: ds }, { weeks: 8, types: types, tree: { 'CO||L': { R1: 'DIST' } } });
  eq(rec0.rows[0].fsdSO + '/' + rec0.rows[0].dsSO, '300/540', 'mirror: before wiring, AMZ SO is 直达 (excluded) while its downstream twin inflates Σ下游');
  const rec = C.reconcileFsdRetail({ units: fsd }, { units: ds }, { weeks: 8, types: types, tree: { 'CO||L': { R1: 'DIST', 'AMZ-ds': 'AMZ' } } });
  const r1 = rec.rows[0];
  eq(r1.fsdSO, 540, 'mirror: wired twin → AMZ SO counted on the FSD side');
  eq(r1.directSO, 0, 'mirror: nothing left as 直达-only');
  eq(r1.inv1, 400, 'mirror: AMZ INV1 excluded (stock counted once via the twin row)');
  eq(r1.status, 'OK', 'mirror: SO 540 vs 540, inventory 1300 vs 400+900 → OK');
  const bdA = rec.byDirect.filter(function (r) { return r.account === 'AMZ'; })[0];
  eq(bdA.mirror, true, 'mirror: byDirect flags AMZ as mirrored');
  eq(bdA.status, 'OK', 'mirror: AMZ vs its twin: SO 240=240, inventory 300=300 (no INV1 added)');
  eq(rec.byDirect.filter(function (r) { return r.account === 'DIST'; })[0].status, 'OK', 'mirror: DIST unaffected');
  const sug = C.suggestWiring({ units: fsd }, { units: ds }, { Drift: 'CO', weeks: 8, tol: 0.1, wired: { R1: 'DIST' }, types: { AMZ: 'online', DIST: 'dist' } });
  const sA = sug.filter(function (s) { return s.parent === 'AMZ'; })[0];
  ok(sA && sA.mirror === true && sA.ds.join() === 'AMZ-ds', 'mirror: suggest AMZ-ds as the same entity of AMZ (SO 240 / inventory 300 both match)');
  eq(C.suggestWiring({ units: fsd }, { units: ds }, { Drift: 'CO', weeks: 8, tol: 0.1, wired: { R1: 'DIST', 'AMZ-ds': 'AMZ' }, types: { AMZ: 'online', DIST: 'dist' } }).filter(function (s) { return s.parent === 'AMZ'; }).length, 0, 'mirror: once wired, no further suggestion for AMZ');
})();

/* ---------- 下游手拍 SO 高于可售:进货补足,拍数不被库存压回;SI 也手拍时不补 ---------- */
(function () {
  const mk = function (rows) {
    const u = { audio: false, key: 'k', Drift: 'X', account: 'A', Garnet: 'L', product: 'P', model: 'M', periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: x[2] || 0, inv: x[3] != null ? x[3] : null, inv1: null }); });
    return u;
  };
  const fw = []; for (let w = 36; w <= 38; w++) fw.push(C.mkPeriod(2026, w));
  const u = mk([[C.mkPeriod(2026, 35), 10, 0, 20]]);   // 期初库存 20
  const fc = [{ p: fw[0], so: 100, src: 'override' }, { p: fw[1], so: 10, src: 'test' }, { p: fw[2], so: 10, src: 'test' }];
  const r = C.simulateRetail({ unit: u, cur: C.unitCurrent(u, {}), forecast: fc, cfg: { roundTo: 5 }, ovSI: {}, autoBuy: false });
  eq(r.rows[0].so, 100, 'tapcover: tapped SO 100 is honored although stock was 20');
  eq(r.rows[0].buy, 80, 'tapcover: Purchase rises by exactly the shortfall');
  eq(r.rows[0].buySrc, 'tapcover', 'tapcover: tagged');
  eq(r.rows[0].capped, false, 'tapcover: not marked capped');
  const r2 = C.simulateRetail({ unit: u, cur: C.unitCurrent(u, {}), forecast: fc, cfg: { roundTo: 5 }, ovSI: { [fw[0]]: 30 }, autoBuy: false });
  eq(r2.rows[0].so, 50, 'tapcover: with SI also tapped (30), SO is clipped to 20+30 and marked capped');
  eq(r2.rows[0].capped, true, 'tapcover: capped flag when both tapped');
  const r3 = C.simulateRetail({ unit: u, cur: C.unitCurrent(u, {}), forecast: [{ p: fw[0], so: 100, src: 'test' }], cfg: { roundTo: 5 }, ovSI: {}, autoBuy: false });
  eq(r3.rows[0].so, 20, 'tapcover: non-tapped plan SO is still capped by stock (no cover)');
})();

/* ---------- 5 台步长:拆数守恒且为步长倍数、补足向上取整、下游锁量预算守恒天花板 ---------- */
(function () {
  const a = C.distribute(3000, [1, 2, 3], 5);
  eq(a.reduce(function (s, v) { return s + v; }, 0), 3000, 'distribute/step: total preserved');
  ok(a.every(function (v) { return v % 5 === 0; }), 'distribute/step: every cell is a multiple of 5, got ' + a.join('/'));
  const b = C.distribute(2997, [1, 1, 1, 1], 5);
  eq(b.reduce(function (s, v) { return s + v; }, 0), 2997, 'distribute/step: non-multiple total still preserved');
  eq(b.filter(function (v) { return v % 5 !== 0; }).length, 1, 'distribute/step: only one cell carries the remainder');
  const c = C.distribute(12, [1, 1, 1, 1], 5);
  eq(c.reduce(function (s, v) { return s + v; }, 0), 12, 'distribute/step: small totals preserved (5+5+0+0 +2)');
  eq(C.distribute(7, [1, 1], 1).join('/'), '4/3', 'distribute: step 1 unchanged');
  eq(C.ceilStep(77, 5), 80, 'ceilStep: 77 → 80');
  eq(C.ceilStep(80, 5), 80, 'ceilStep: exact multiple unchanged');
  eq(C.floorStep(83, 5), 80, 'floorStep: 83 → 80');
  eq(C.floorStep(-3, 5), 0, 'floorStep: negative → 0');
  /* 下游锁量预算:min(INV1+余量, 锁量总量−下游累计Purchase) */
  eq(C.retailLockBudget({ total: 10000, remain: 300, inv1: 2000, lifePurchase: 7700 }), 300, 'retailLockBudget: default strict → Purchase ≤ 剩余待SI (INV1 ignored)');
  eq(C.retailLockBudget({ total: 10000, remain: 300, inv1: 2000, lifePurchase: 7700, useInv1: true }), 2300, 'retailLockBudget: useInv1 → INV1+余量 (=总量−累计 when consistent)');
  eq(C.retailLockBudget({ total: 10000, remain: 300, inv1: 5000, lifePurchase: 7700, useInv1: true }), 2300, 'retailLockBudget: inflated INV1 capped by 总量−累计');
  eq(C.retailLockBudget({ total: 10000, remain: 300, inv1: 500, lifePurchase: 7700, useInv1: true }), 800, 'retailLockBudget: small INV1 → physical flow binds');
  eq(C.retailLockBudget({ total: 10000, remain: 0, inv1: 500, lifePurchase: 10000, useInv1: true }), 0, 'retailLockBudget: downstream already took the whole lock → 0');
  eq(C.retailLockBudget({ total: 10000, remain: 300, inv1: 500, lifePurchase: 9900 }), 100, 'retailLockBudget: strict but lifecycle ceiling tighter than 余量 → 100');
  /* 手拍补足向上取整到 5 */
  const mk = function (rows) {
    const u = { audio: false, key: 'k', Drift: 'X', account: 'A', Garnet: 'L', product: 'P', model: 'M', periods: [], weeks: new Map() };
    rows.forEach(function (x) { u.periods.push(x[0]); u.weeks.set(x[0], { so: x[1], si: x[2] || 0, inv: x[3] != null ? x[3] : null, inv1: null }); });
    return u;
  };
  const p0 = C.mkPeriod(2026, 36);
  const u = mk([[C.mkPeriod(2026, 35), 10, 0, 23]]);
  const r = C.simulateRetail({ unit: u, cur: C.unitCurrent(u, {}), forecast: [{ p: p0, so: 100, src: 'override' }], cfg: { roundTo: 5 }, ovSI: {}, autoBuy: false });
  eq(r.rows[0].buy, 80, 'tapcover/step: shortfall 77 → Purchase 80 (multiple of 5)');
  eq(r.rows[0].so, 100, 'tapcover/step: tapped SO still honored');
})();

/* ---------- 月口径:月天数=周四归属的周数×7;月末DOS=月末库存÷(月SO÷月天数);月SO=实际+推演 ---------- */
(function () {
  eq(C.monthWeeksOf(2026, 8).length, 4, 'month: Aug 2026 has 4 Thursdays (6/13/20/27) → 4 weeks');
  eq(C.monthDaysOf(2026, 8), 28, 'month: Aug 2026 = 28 days');
  eq(C.monthWeeksOf(2026, 10).length, 5, 'month: Oct 2026 has 5 Thursdays (1/8/15/22/29) → 5 weeks');
  eq(C.monthDaysOf(2026, 10), 35, 'month: Oct 2026 = 35 days');
  eq(C.monthWeeksOf(2026, 12).length, 5, 'month: Dec 2026 has 5 Thursdays (3/10/17/24/31) → 5 weeks incl. W53');
  eq(C.monthWeeksOf(2026, 12)[4], C.mkPeriod(2026, 53), 'month: last December week is W53 (Thursday Dec 31)');
  eq(C.monthWeeksOf(2027, 1).length, 4, 'month: Jan 2027 has 4 Thursdays (7/14/21/28)');
  let tot = 0; for (let m = 1; m <= 12; m++) tot += C.monthWeeksOf(2026, m).length;
  eq(tot, 53, 'month: 12 months of 2026 partition all 53 ISO weeks');
  eq(C.monthDos(300, 600, 35), 18, 'monthDos: 300 ÷ (600/35) = 17.5 → 18');
  eq(C.monthDos(300, 600, 28), 14, 'monthDos: same stock and SO over a 4-week month → 14 (denominator matters)');
  eq(C.monthDos(300, 0, 28), Infinity, 'monthDos: SO 0 with stock → ∞');
  eq(C.monthDos(0, 0, 28), null, 'monthDos: no stock, no SO → null');
  eq(C.monthDos(null, 100, 28), null, 'monthDos: inventory unknown → null');
  const u = { weeks: new Map(), periods: [] };
  const wk = C.monthWeeksOf(2026, 8);   // W32..W35
  u.weeks.set(wk[0], { so: 10 }); u.weeks.set(wk[1], { so: 20 }); u.weeks.set(wk[2], { so: 30 });   // 已发生 3 周
  const sim = [{ p: wk[3], so: 40 }, { p: C.mkPeriod(2026, 36), so: 99 }];                        // 推演:W35 + 9 月的一周
  eq(C.unitMonthSO(u, sim, 2026, 8), 100, 'unitMonthSO: Aug = actual 10+20+30 + sim 40 (Sept week excluded)');
  eq(C.unitMonthSO(u, null, 2026, 8), 60, 'unitMonthSO: without sim rows only actual weeks count');
  eq(C.dosText(Infinity), '∞', 'dosText: ∞');
  eq(C.dosText(null), '—', 'dosText: —');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
