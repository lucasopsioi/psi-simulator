#!/usr/bin/env node
/* R4(2026-09-15 FDE 评审):把单文件 FSD-PSI.html 按现有分节注释物理切成 src/*.part,顺序写进 src/manifest.json。
   只切不改:scripts/build.js 按 manifest 原样拼回,拼回结果必须与切之前逐字节相同(用 --check 校验)。
   切点:文件头 / CORE 引擎 / 页面脚本里每个 `/* =====` 分节 / 「计算」「渲染」两个大段 / 文件尾。
   用法: node scripts/split.js        (会覆盖 src/;切之前先确认 FSD-PSI.html 是你要的版本) */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const html = fs.readFileSync(path.join(ROOT, 'FSD-PSI.html'), 'utf8');
const lines = html.split('\n');   // 仓库统一 LF;最后一个元素是末尾换行后的空串,拼回时 join('\n') 原样还原
const n = lines.length;
const at = (re) => { const i = lines.findIndex(l => re.test(l)); if (i < 0) throw new Error('marker not found: ' + re); return i; };
const coreOpen = at(/^\/\*CORE-START\*\//);          // CORE 第一行
const coreClose = at(/^\/\*CORE-END\*\//);           // CORE 最后一行
const pageOpen = (() => { for (let i = coreClose; i < n; i++) if (/^<script>$/.test(lines[i])) return i; throw new Error('page <script> not found'); })();
const pageClose = (() => { for (let i = n - 1; i > pageOpen; i--) if (/^<\/script>$/.test(lines[i])) return i; throw new Error('page </script> not found'); })();
const cuts = new Set([0, coreOpen - 1, coreOpen, coreClose + 1, pageOpen, pageClose]);   // 头 / CORE 的 <script> 行单独 / CORE / CORE 之后 / 页面脚本 / 尾
for (let i = pageOpen + 1; i < pageClose; i++) {
  if (/^\/\* ={5,}/.test(lines[i]) || /^\/\* -{10} (计算|渲染|锁量约束|性能:数据层缓存|新品规划|国家 SO 目标跟踪) /.test(lines[i])) cuts.add(i);
}
for (let i = coreOpen + 1; i < coreClose; i++) { if (/^\/\* ={5,}/.test(lines[i])) cuts.add(i); }
const idx = Array.from(cuts).sort((a, b) => a - b);
const slug = (l) => {
  const m = l.match(/^\/\*\s*[=-]+\s*(.*?)\s*(?:[=-]{3,}\s*\*\/|$)/);
  let t = (m ? m[1] : l).replace(/\(.*$/, '').replace(/[:：,，;；·（(].*$/, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return t.slice(0, 24) || 'part';
};
fs.rmSync(SRC, { recursive: true, force: true }); fs.mkdirSync(SRC);
const manifest = [];
for (let k = 0; k < idx.length; k++) {
  const a = idx[k], b = (k + 1 < idx.length) ? idx[k + 1] : n;
  const chunk = lines.slice(a, b);
  const first = lines[a];
  let name;
  if (a === 0) name = 'head';
  else if (a === coreOpen - 1) name = 'core-open';
  else if (a === coreOpen) name = 'core';
  else if (a >= coreOpen && a < coreClose) name = 'core-' + slug(first);
  else if (a === coreClose + 1) name = 'core-close';
  else if (a === pageOpen) name = 'page-open';
  else if (a === pageClose) name = 'tail';
  else name = 'page-' + slug(first);
  const file = String(k).padStart(2, '0') + '-' + name + '.part';
  fs.writeFileSync(path.join(SRC, file), chunk.join('\n') + (b < n ? '\n' : ''));
  manifest.push({ file, lines: [a + 1, b], first: first.slice(0, 80) });
}
fs.writeFileSync(path.join(SRC, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('split into ' + manifest.length + ' parts; total lines ' + n);
