#!/usr/bin/env node
/* R4:按 src/manifest.json 把 src/*.part 拼回单文件 FSD-PSI.html(发布形态不变:单文件 + 便携 exe)。
   源码真相在 src/,FSD-PSI.html 是构建产物(仍入库,给 electron-builder 与自检用)。
   用法: node scripts/build.js          拼回并覆盖 FSD-PSI.html
         node scripts/build.js --check  只比对:FSD-PSI.html 是否与 src/ 拼出的一致(pre-commit 用) */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'FSD-PSI.html');
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
const out = manifest.map(m => fs.readFileSync(path.join(SRC, m.file), 'utf8')).join('');
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur === out) { console.log('build --check OK (' + sha(out) + ', ' + manifest.length + ' parts)'); process.exit(0); }
  console.log('build --check FAIL: FSD-PSI.html 与 src/ 不一致 (' + sha(cur) + ' vs ' + sha(out) + ')。请改 src/ 后 node scripts/build.js,不要直接改 FSD-PSI.html');
  process.exit(1);
}
fs.writeFileSync(OUT, out);
console.log('built FSD-PSI.html from ' + manifest.length + ' parts, sha256 ' + sha(out) + ', ' + out.length + ' chars');
