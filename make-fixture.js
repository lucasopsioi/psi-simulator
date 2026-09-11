// 生成测试夹具:把内置示例 TSV 拆成两个 xlsx(时间上旧/新,W30-W34 重叠且新文件数值+1)
// 用于验证:文件夹扫描、xlsx 解析、多文件 mtime 覆盖合并。输出目录由 argv[2] 指定。
'use strict';
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const html = fs.readFileSync(path.join(__dirname, 'FSD-PSI.html'), 'utf8');
const m = html.match(/\/\*CORE-START\*\/([\s\S]*?)\/\*CORE-END\*\//);
const mod = { exports: {} };
new Function('module', 'exports', m[1])(mod, mod.exports);
const C = mod.exports;

const outDir = process.argv[2];
if (!outDir) { console.error('usage: node make-fixture.js <outDir>'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const tsv = C.genSampleTSV();
const lines = tsv.split('\n');
const header = lines[0].split('\t');
const rows = lines.slice(1).map(l => l.split('\t'));

const periodOf = r => parseInt(String(r[5]).slice(0, 4) + String(r[5]).slice(4), 10); // yyyywww as int
const oldRows = rows.filter(r => periodOf(r) <= 2026034);            // 全量(旧文件)
const newRows = rows.filter(r => periodOf(r) >= 2026030)             // 新文件:W30起,数值+1(库存类)
  .map(r => { const q = r[7] === '' ? '' : String(parseFloat(r[7]) + 1); return [r[0], r[1], r[2], r[3], r[4], r[5], r[6], q]; });

function writeXlsx(file, dataRows) {
  const aoa = [header].concat(dataRows.map(r => r.map((c, i) => (i === 5 || i === 7) && c !== '' ? parseFloat(c) : c)));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PSI');
  XLSX.writeFile(wb, file);
}
const f1 = path.join(outDir, 'psi_export_old.xlsx');
const f2 = path.join(outDir, 'psi_export_new.xlsx');
writeXlsx(f1, oldRows);
writeXlsx(f2, newRows);
// mtime: 旧文件设为 1 天前
const now = Date.now();
fs.utimesSync(f1, new Date(now - 86400000), new Date(now - 86400000));
fs.utimesSync(f2, new Date(now), new Date(now));
// 附带一个 csv(旧,只含一个单元,验证 csv 通路+引号转义) — 内容取 Kids 行(产品名里带双引号)
const BOM = String.fromCharCode(0xFEFF);
const csvCellFor = delim => c => (new RegExp('["' + delim + ']').test(c)) ? '"' + c.replace(/"/g, '""') + '"' : c;
const kidsLines = [lines[0]].concat(lines.slice(1).filter(l => l.includes('Vantor6-W09BE')));
const toCsv = delim => kidsLines.map(l => l.split('\t').map(csvCellFor(delim)).join(delim)).join('\n');
/* 多 CSV 混编码:同一份 kids 数据三种存法(值相同,合并幂等) —— 模拟用户"多个 csv 文件"场景 */
const csvPath = path.join(outDir, 'psi_kids.csv');                       // UTF-8 + BOM, 逗号
fs.writeFileSync(csvPath, BOM + toCsv(','), 'utf8');
fs.utimesSync(csvPath, new Date(now - 2 * 86400000), new Date(now - 2 * 86400000));
const csv16 = path.join(outDir, 'psi_kids_utf16.csv');                   // UTF-16LE + BOM, 逗号
fs.writeFileSync(csv16, Buffer.from(BOM + toCsv(','), 'utf16le'));
fs.utimesSync(csv16, new Date(now - 3 * 86400000), new Date(now - 3 * 86400000));
const csvSemi = path.join(outDir, 'psi_kids_semi.csv');                  // UTF-8 无 BOM, 分号
fs.writeFileSync(csvSemi, toCsv(';'), 'utf8');
fs.utimesSync(csvSemi, new Date(now - 4 * 86400000), new Date(now - 4 * 86400000));
console.log(JSON.stringify({ outDir, oldRows: oldRows.length, newRows: newRows.length, files: [f1, f2, csvPath, csv16, csvSemi] }));
