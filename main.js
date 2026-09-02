'use strict';
/* FSD PSI 推演 — Electron 壳
   职责只有三件事：开窗口、选文件夹对话框、读文件夹里的 xlsx/csv 并解析合并。
   解析口径的单一事实源是 FSD-PSI.html 里的 CORE 块（与 test.js 同一抽取方式），
   本文件不复制任何口径逻辑。
   刻意不加单实例锁（knowledge/env-and-infra：单实例锁 = "点图标毫无反应"的标准形态）。 */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let CORE = null, XLSX = null;
function getCore() {
  if (CORE) return CORE;
  const html = fs.readFileSync(path.join(__dirname, 'FSD-PSI.html'), 'utf8');
  const m = html.match(/\/\*CORE-START\*\/([\s\S]*?)\/\*CORE-END\*\//);
  if (!m) throw new Error('CORE block not found in FSD-PSI.html');
  const mod = { exports: {} };
  new Function('module', 'exports', m[1])(mod, mod.exports);
  CORE = mod.exports;
  return CORE;
}
function getXlsx() { return XLSX || (XLSX = require('xlsx')); }

const argOf = (name) => { const a = process.argv.find(x => x.startsWith(name + '=')); return a ? a.slice(name.length + 1) : null; };
const SELFTEST_DIR = argOf('--selftest-dir');
const SELFTEST_RETAIL = argOf('--selftest-retail-dir');
const SELFTEST_AUDIO = argOf('--selftest-audio-dir');
const SHOT_DIR = argOf('--shot-dir');           // 面板截图模式:加载数据后逐页 capturePage 存 PNG
const SHOT_TABS = argOf('--shot-tabs');
const AI_EVAL = argOf('--ai-eval');             // AI 评测:mock(剧本模型,验机制) / live(真模型);需配 --selftest-dir 三夹具
const AI_EVAL_CFG = argOf('--ai-eval-cfg');     // live 模式的 provider 配置 JSON 文件路径
/* 自测/截图跑在隔离 userData:冒烟拍数、演示剧本、夹具文件夹路径一概不许写进真实用户方案 */
if (SELFTEST_DIR || SHOT_DIR) {
  const iso = path.join(require('os').tmpdir(), 'fsd-psi-selftest-profile');
  try { fs.rmSync(iso, { recursive: true, force: true }); } catch (e) {}
  app.setPath('userData', iso);
}

/* ---------- 文件夹扫描 ---------- */
function listSheetFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (/^~\$/.test(name)) continue;                       // Excel 打开时的临时文件
    if (!/\.(xlsx|xlsm|xls|csv|tsv|txt)$/i.test(name)) continue;
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch (e) { continue; }
    if (!st.isFile()) continue;
    out.push({ name, full, mtimeMs: st.mtimeMs, size: st.size });
  }
  out.sort((a, b) => a.mtimeMs - b.mtimeMs);
  return out;
}
function addRep(rep, r) {
  rep.total += r.total; rep.used += r.used;
  rep.badPeriod += r.badPeriod; rep.badPsi += r.badPsi; rep.noKey += r.noKey;
}
function parseOneFile(f, mode) {
  const C = getCore();
  const target = mode === 'target';   // 国家 SO 目标回填表(宽表),与 PSI 长表解析器分流
  const rep = { name: f.name, mtimeMs: f.mtimeMs, size: f.size, sheets: [],
    total: 0, used: 0, badPeriod: 0, badPsi: 0, noKey: 0, error: null };
  let rows = [];
  try {
    if (/\.(csv|tsv|txt)$/i.test(f.name)) {
      const txt = C.decodeSmart(fs.readFileSync(f.full));   // BOM/UTF-16/GB18030 统一嗅探
      const r = target ? C.parseTargetTable(txt) : C.parseTable(txt);
      rows = r.rows; addRep(rep, Object.assign({ badPeriod: 0, badPsi: 0 }, r.report)); rep.sheets.push('(文本)');
    } else {
      const wb = getXlsx().readFile(f.full, { dense: true });
      for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn];
        if (!ws) continue;
        const grid = getXlsx().utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
        if (!grid.length) continue;
        const r = target ? C.parseTargetGrid(grid) : C.parseGrid(grid);
        if (r.rows.length) { rows = rows.concat(r.rows); rep.sheets.push(sn); addRep(rep, Object.assign({ badPeriod: 0, badPsi: 0 }, r.report)); }
      }
      if (!rep.sheets.length) rep.error = target ? '没有识别到 SO 目标表结构的 sheet(需含 产品/国家/渠道 与 9–12月SO目标 列)' : '没有识别到 PSI 表结构的 sheet';
    }
  } catch (e) { rep.error = String(e && e.message || e); }
  return { rep, rows };
}
function readFolder(sender, dir, mode) {
  if (!dir || !fs.existsSync(dir)) return { ok: false, error: '文件夹不存在：' + dir };
  let files;
  try { files = listSheetFiles(dir); }
  catch (e) { return { ok: false, error: '无法读取文件夹：' + (e && e.message || e) }; }
  if (!files.length) return { ok: false, error: '文件夹里没有 xlsx / xls / csv 文件' };
  const perFile = []; const fileRows = [];
  files.forEach((f, i) => {
    if (sender) { try { sender.send('scan-progress', { i: i + 1, n: files.length, file: f.name }); } catch (e) {} }
    const { rep, rows } = parseOneFile(f, mode);
    perFile.push(rep);
    fileRows.push({ name: f.name, mtimeMs: f.mtimeMs, rows });
  });
  if (mode === 'target') {
    /* 目标表按 (国家,渠道,产品) 去重:文件按 mtime 升序,新文件覆盖旧文件 */
    const byKey = new Map();
    fileRows.forEach(fr => fr.rows.forEach(r => byKey.set(r.Drift + '\u0000' + r.channel + '\u0000' + r.product, r)));
    const rows = Array.from(byKey.values());
    return { ok: true, files: perFile, rows: rows, total: rows.length };
  }
  const merged = getCore().mergeFiles(fileRows);
  merged.perFile.forEach((m, i) => { perFile[i].overridden = m.overridden; perFile[i].kept = m.kept; });
  return { ok: true, files: perFile, rows: merged.rows, total: merged.rows.length };
}

/* ---------- 方案持久化：userData 下的 JSON 文件（与 exe 分离,升级换 exe 不丢） ----------
   localStorage 只是兜底;文件为主。原子写(tmp+rename),每天首次写入前留备份(近10天)。 */
function stateFile() { return path.join(app.getPath('userData'), 'fsd-psi-state.json'); }
function dataFile(which) {
  const name = which === 'retail' ? 'retail-data.txt'
    : (which === 'audio' ? 'audio-data.txt'
    : (which === 'target' ? 'target-data.txt' : 'fsd-data.txt'));
  return path.join(app.getPath('userData'), name);
}
function writeFileAtomic(p, content) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, p);
}
function backupStateDaily() {
  try {
    const f = stateFile();
    if (!fs.existsSync(f)) return;
    const d = new Date();
    const tag = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const bdir = path.join(app.getPath('userData'), 'backups');
    fs.mkdirSync(bdir, { recursive: true });
    const bfile = path.join(bdir, 'state-' + tag + '.json');
    if (!fs.existsSync(bfile)) fs.copyFileSync(f, bfile);
    const all = fs.readdirSync(bdir).filter(n => /^state-\d{8}\.json$/.test(n)).sort();
    while (all.length > 10) fs.unlinkSync(path.join(bdir, all.shift()));
  } catch (e) { /* 备份失败不阻塞保存 */ }
}
function writeState(s) {
  try {
    backupStateDaily();
    writeFileAtomic(stateFile(), JSON.stringify(s));
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
ipcMain.handle('state-load', () => {
  try {
    const f = stateFile();
    if (!fs.existsSync(f)) return { ok: false, missing: true };
    return { ok: true, state: JSON.parse(fs.readFileSync(f, 'utf8')) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
ipcMain.handle('state-save', (e, s) => writeState(s));
ipcMain.on('state-save-fire', (e, s) => { writeState(s); });   // beforeunload 时的即发即走
ipcMain.handle('state-clear', () => {
  try {
    const f = stateFile();
    if (fs.existsSync(f)) {
      const bdir = path.join(app.getPath('userData'), 'backups');
      fs.mkdirSync(bdir, { recursive: true });
      fs.copyFileSync(f, path.join(bdir, 'state-cleared-' + Date.now() + '.json'));
      fs.unlinkSync(f);
    }
    ['fsd', 'retail', 'audio', 'target'].forEach(w => { try { fs.unlinkSync(dataFile(w)); } catch (e2) {} });
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
ipcMain.handle('data-save', (e, which, text) => {
  try {
    const f = dataFile(which);
    if (!text) { try { fs.unlinkSync(f); } catch (e2) {} return { ok: true }; }
    writeFileAtomic(f, text);
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
ipcMain.handle('data-load', () => {
  const read = w => { try { return fs.readFileSync(dataFile(w), 'utf8'); } catch (e) { return null; } };
  return { ok: true, fsd: read('fsd'), retail: read('retail'), audio: read('audio'), target: read('target') };
});
ipcMain.handle('get-paths', () => ({ userData: app.getPath('userData') }));

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog({ title: '选择底表文件夹', properties: ['openDirectory'] });
  return (r.canceled || !r.filePaths.length) ? null : r.filePaths[0];
});
ipcMain.handle('read-folder', (e, dir, mode) => readFolder(e.sender, dir, mode));
ipcMain.handle('save-xlsx', async (e, payload) => {
  const r = await dialog.showSaveDialog({ title: '导出 Excel',
    defaultPath: (payload && payload.name) || '导出.xlsx',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try {
    const wb = getXlsx().utils.book_new();
    ((payload && payload.sheets) || []).forEach(function (s) {
      const ws = getXlsx().utils.aoa_to_sheet(s.rows || []);
      /* 公式单元格:{r,c,f,v} 0 基坐标;v 为缓存值(打开即见数,改动后 Excel 按 f 重算) */
      (s.formulas || []).forEach(function (fm) {
        const addr = getXlsx().utils.encode_cell({ r: fm.r, c: fm.c });
        const cell = { f: fm.f };
        if (typeof fm.v === 'number' && isFinite(fm.v)) { cell.t = 'n'; cell.v = fm.v; }
        else if (fm.v != null) { cell.t = 's'; cell.v = String(fm.v); }
        else cell.t = 'n';
        ws[addr] = cell;
      });
      getXlsx().utils.book_append_sheet(wb, ws, (s.name || 'Sheet1').slice(0, 31));
    });
    getXlsx().writeFile(wb, r.filePath);
    return { ok: true, path: r.filePath };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});

/* ---------- 方案版本快照:userData/snapshots,手动保存+恢复前自动留档;保留近 40 份 ---------- */
ipcMain.handle('snap-save', (_e, payload) => {
  try {
    payload = payload || {};
    const dir = path.join(app.getPath('userData'), 'snapshots');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date();
    const pad = n => String(n).padStart(2, '0');
    const stamp = ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) + '-' + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds());
    const safeName = String(payload.name || '').replace(/[^\w一-鿿-]/g, '').slice(0, 24);
    const file = 'snap-' + stamp + (safeName ? ('-' + safeName) : '') + '.json';
    fs.writeFileSync(path.join(dir, file), JSON.stringify({ savedAt: ts.toISOString(), name: safeName, state: payload.state || {} }));
    const all = fs.readdirSync(dir).filter(f => /^snap-.*\.json$/.test(f)).sort();
    while (all.length > 40) { try { fs.unlinkSync(path.join(dir, all.shift())); } catch (e) {} }
    return { ok: true, file };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
ipcMain.handle('snap-list', () => {
  try {
    const dir = path.join(app.getPath('userData'), 'snapshots');
    if (!fs.existsSync(dir)) return { ok: true, list: [] };
    const list = fs.readdirSync(dir).filter(f => /^snap-.*\.json$/.test(f)).sort().reverse().map(f => {
      const st = fs.statSync(path.join(dir, f));
      const m = /^snap-(\d{8}-\d{6})(?:-(.*))?\.json$/.exec(f);
      return { file: f, stamp: m ? m[1] : '', name: m && m[2] ? m[2] : '', size: st.size };
    });
    return { ok: true, list };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
ipcMain.handle('snap-read', (_e, file) => {
  try {
    const safe = String(file || '').replace(/[^\w一-鿿.-]/g, '');
    if (!/^snap-.*\.json$/.test(safe)) return { ok: false, error: '非法文件名' };
    const p = path.join(app.getPath('userData'), 'snapshots', safe);
    if (!fs.existsSync(p)) return { ok: false, error: '快照不存在' };
    return { ok: true, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

/* ---------- AI 助手 LLM 通道(移植自 Salesboard aiChat) ----------
   OpenAI 兼容(LM Studio/DeepSeek/vLLM…) + Anthropic 格式适配 + SSE 流式。
   【不落任何日志】问答含业务数据,本通道绝不写盘;默认端点是本机 LM Studio,数据不出本机。 */
const { net } = require('electron');
ipcMain.handle('ai-chat', async (_e, payload) => {
  payload = payload || {};
  const { key, baseUrl, model, messages } = payload;
  if (!baseUrl) return { error: '未配置 Base URL(设置页 → AI 助手)' };
  const ctrl = new AbortController();
  const timeoutMs = Math.min(300000, Math.max(5000, +payload.timeoutMs || 240000));
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const body = { model: model || 'local-model', messages: messages || [] };
    if (Array.isArray(payload.tools) && payload.tools.length) body.tools = payload.tools;
    if (payload.maxTokens) body.max_tokens = payload.maxTokens;
    if (typeof payload.temperature === 'number') body.temperature = payload.temperature;   // 数字问答必须 0,否则本地模型按默认采样会编数
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = 'Bearer ' + key;

    /* Anthropic(Claude) 格式适配:x-api-key 头、system 顶层、工具 input_schema、响应 content blocks;返回仍是 OpenAI 形状 */
    if (payload.apiFormat === 'anthropic') {
      const sysMsgs = (messages || []).filter(m => m.role === 'system').map(m => String(m.content || '')).join('\n\n');
      const rest = [];
      (messages || []).forEach(m => {
        if (m.role === 'system') return;
        rest.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') });
      });
      const abody = { model: model || 'claude-sonnet-5', max_tokens: +payload.maxTokens || 4096, messages: rest };
      if (sysMsgs) abody.system = sysMsgs;
      if (typeof payload.temperature === 'number') abody.temperature = payload.temperature;
      if (Array.isArray(payload.tools) && payload.tools.length)
        abody.tools = payload.tools.map(x => ({ name: x.function.name, description: x.function.description || '', input_schema: x.function.parameters || { type: 'object', properties: {} } }));
      const ar = await net.fetch(baseUrl, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key || '', 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(abody), signal: ctrl.signal });
      let aj = null; try { aj = await ar.json(); } catch (e) { aj = null; }
      if (!ar.ok) return { error: 'HTTP ' + ar.status + ((aj && aj.error && aj.error.message) ? ('：' + aj.error.message) : '') };
      let text = ''; const tcs = [];
      ((aj && aj.content) || []).forEach(b => {
        if (b.type === 'text') text += (b.text || '');
        else if (b.type === 'tool_use') tcs.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) } });
      });
      if (!text.trim() && !tcs.length) return { error: 'API 返回空内容(stop_reason=' + ((aj && aj.stop_reason) || '无') + ')' };
      return { content: text, toolCalls: tcs.length ? tcs : undefined };
    }

    /* SSE 流式:本地大模型非流式要等整段生成完;流式首 token 几秒即到,增量经 'ai-stream' 发回渲染层按 id 过滤 */
    if (payload.stream && payload.id) {
      body.stream = true;
      const emit = d => { try { _e.sender.send('ai-stream', Object.assign({ id: payload.id }, d)); } catch (e) {} };
      const rs = await net.fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
      if (!rs.ok) { let em = ''; try { em = (await rs.text()).slice(0, 300); } catch (e) {} return { error: 'HTTP ' + rs.status + (em ? ('：' + em) : '') }; }
      let content = '', toolCalls = null, buf = '';
      const dec = new TextDecoder();
      for await (const chunk of rs.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const Garnet = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!Garnet.startsWith('data:')) continue;
          const dat = Garnet.slice(5).trim();
          if (dat === '[DONE]') continue;
          let j = null; try { j = JSON.parse(dat); } catch (e) { continue; }
          const dl = j && j.choices && j.choices[0] && j.choices[0].delta;
          if (!dl) continue;
          if (dl.content) { content += dl.content; emit({ delta: dl.content }); }
          if (dl.tool_calls) {
            toolCalls = toolCalls || [];
            dl.tool_calls.forEach(tc => {
              const idx = tc.index || 0;
              toolCalls[idx] = toolCalls[idx] || { id: tc.id || ('tc' + idx), type: 'function', function: { name: '', arguments: '' } };
              if (tc.function && tc.function.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function && tc.function.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            });
          }
        }
      }
      emit({ done: true });
      if (!content.trim() && !(toolCalls && toolCalls.length)) return { error: '流式返回为空(检查模型是否已在 LM Studio 加载)' };
      return { content, toolCalls: toolCalls && toolCalls.length ? toolCalls.filter(Boolean) : undefined };
    }

    const r = await net.fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    let jj = null; try { jj = await r.json(); } catch (e) { jj = null; }
    if (!r.ok) return { error: 'HTTP ' + r.status + ((jj && jj.error && (jj.error.message || jj.error.type)) ? ('：' + (jj.error.message || jj.error.type)) : '') };
    const ch = jj && jj.choices && jj.choices[0];
    const msg = ch && ch.message;
    if (!msg) return { error: 'API 返回无 choices(检查 Base URL 是否指向 /v1/chat/completions)' };
    return { content: msg.content || '', toolCalls: msg.tool_calls && msg.tool_calls.length ? msg.tool_calls : undefined };
  } catch (e) {
    const m = String((e && e.message) || e);
    return { error: /abort/i.test(m) ? ('请求超时(' + Math.round(timeoutMs / 1000) + 's):本地模型未加载或在冷启动,可去设置页调大超时') : ('请求失败:' + m + '(检查 LM Studio 是否已启动、端口是否正确)') };
  } finally { clearTimeout(t); }
});

/* WeLink CLI 通道(移植自 销售团队 aiChatCli 原样):spawn 外部命令,stdin/file/arg 三种喂词方式;
   Windows 批处理垫片(.cmd)EINVAL 自动经 cmd.exe 重试;prompt 永不进 shell 命令行 */
ipcMain.handle('ai-chat-cli', async (_e, payload) => {
  payload = payload || {};
  const { spawn } = require('child_process');
  const os = require('os');
  const cmd = String(payload.cmd || '').trim();
  if (!cmd) return { error: '未配置 CLI 命令' };
  const mode = ['stdin', 'file', 'arg'].includes(payload.inputMode) ? payload.inputMode : 'stdin';
  const prompt = String(payload.prompt || '');
  const timeoutMs = Math.min(600000, Math.max(10000, +payload.timeoutMs || 180000));
  let args = String(payload.argsTmpl || '').split(/\s+/).filter(Boolean);
  let tmpFile = null;
  try {
    if (mode === 'file') {
      tmpFile = path.join(os.tmpdir(), 'fsd-cli-prompt-' + Date.now() + '.txt');
      fs.writeFileSync(tmpFile, prompt, 'utf8');
      let replaced = false;
      args = args.map(a => { if (a.indexOf('{PROMPT_FILE}') >= 0) { replaced = true; return a.replace('{PROMPT_FILE}', tmpFile); } return a; });
      if (!replaced) args.push(tmpFile);
    } else if (mode === 'arg') {
      args.push(prompt);
    }
    const runOnce = (viaCmdExe) => new Promise((resolve) => {
      let out = '', err = '', done = false;
      const c = viaCmdExe ? (process.env.ComSpec || 'cmd.exe') : cmd;
      const a = viaCmdExe ? ['/d', '/c', cmd].concat(args) : args;
      let child;
      try {
        child = spawn(c, a, { windowsHide: true, shell: false, env: process.env });
      } catch (e) { return resolve({ error: 'SPAWN:' + (e.code || '') + ':' + e.message }); }
      const finish = (r) => { if (!done) { done = true; resolve(r); } };
      const t = setTimeout(() => { try { child.kill(); } catch (e) {} finish({ error: 'CLI 超时(' + Math.round(timeoutMs / 1000) + 's)' }); }, timeoutMs);
      child.stdout.on('data', d => { out += d; });
      child.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-20000); });
      child.on('error', e => { clearTimeout(t); finish({ error: 'SPAWN:' + (e.code || '') + ':' + e.message }); });
      child.on('close', code => {
        clearTimeout(t);
        const text = String(out || '').trim();
        if (!text && code !== 0) return finish({ error: 'CLI 退出码 ' + code + (err ? ': ' + err.slice(0, 400) : '') });
        finish({ content: text });
      });
      if (mode === 'stdin') { try { child.stdin.write(prompt, 'utf8'); child.stdin.end(); } catch (e) {} }
      else { try { child.stdin.end(); } catch (e) {} }
    });
    let r = await runOnce(false);
    if (r && r.error && /^SPAWN:(EINVAL|ENOENT|UNKNOWN)/.test(r.error)) r = await runOnce(true);
    try { if (tmpFile) fs.unlinkSync(tmpFile); } catch (e) {}
    if (r && r.error && r.error.indexOf('SPAWN:') === 0) r = { error: 'CLI 启动失败: ' + r.error.slice(6) + '(检查命令名/PATH;npm 包 CLI 请直接填命令名如 welink-cli)' };
    return r;
  } catch (e) {
    try { if (tmpFile) fs.unlinkSync(tmpFile); } catch (e2) {}
    return { error: String((e && e.message) || e) };
  }
});

/* ---------- 窗口 ---------- */
function createWindow() {
  const win = new BrowserWindow({
    width: 1560, height: 980, show: !SELFTEST_DIR && !SHOT_DIR,
    backgroundColor: '#f4f5f7',   // 与页面浅色底一致,消掉启动白闪
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  win.loadFile('FSD-PSI.html');
  if (SHOT_DIR) {
    win.webContents.on('did-finish-load', async () => {
      try {
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        await win.webContents.executeJavaScript(
          'window.__shotPrep(' + JSON.stringify({ fsd: SELFTEST_DIR, retail: SELFTEST_RETAIL, audio: SELFTEST_AUDIO }) + ')', true);
        /* 诊断:设置页面板清单落盘(排查面板缺失类问题) */
        try {
          const diag = await win.webContents.executeJavaScript(
            '(function(){window.__shotTab("settings");return {h:document.body.scrollHeight,panels:Array.from(document.querySelectorAll("#view-settings .panel h3")).map(function(x){return x.textContent.slice(0,42);})};})()', true);
          fs.writeFileSync(path.join(SHOT_DIR, '_panels.json'), JSON.stringify(diag));
        } catch (e) {}
        const tabs = (SHOT_TABS || 'overview,detail,coef,settings').split(',');
        for (const t of tabs) {
          const ph = await win.webContents.executeJavaScript('window.__shotTab(' + JSON.stringify(t) + ')', true);
          const hh = Math.max(760, Math.min((+ph || 980) + 20, 7000));
          win.setContentSize(1560, hh);
          await new Promise(r => setTimeout(r, 400));
          /* resize 触发重排会重置滚动位置:分段截图(tab@y)在此重新定位 */
          const yOff = +(String(t).split('@')[1] || 0);
          if (yOff > 0) {
            await win.webContents.executeJavaScript('window.scrollTo(0,' + yOff + ');document.documentElement.scrollTop=' + yOff + ';1', true);
            await new Promise(r => setTimeout(r, 200));
          }
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(SHOT_DIR, t.replace(/[^\w-]/g, '_') + '.png'), img.toPNG());
        }
      } catch (e) {
        try { fs.writeFileSync(path.join(SHOT_DIR, '_error.txt'), String(e && e.stack || e)); } catch (e2) {}
      }
      app.exit(0);
    });
    return win;
  }
  if (AI_EVAL && SELFTEST_DIR) {
    win.webContents.on('did-finish-load', async () => {
      let result;
      try {
        await win.webContents.executeJavaScript(
          'window.__shotPrep(' + JSON.stringify({ fsd: SELFTEST_DIR, retail: SELFTEST_RETAIL, audio: SELFTEST_AUDIO }) + ')', true);
        let cfg = null;
        if (AI_EVAL === 'live' && AI_EVAL_CFG) {
          try { cfg = JSON.parse(fs.readFileSync(AI_EVAL_CFG, 'utf8')); } catch (e) { cfg = null; }
        }
        const only = (argOf('--ai-eval-only') || '').split(',').filter(Boolean);
        result = await win.webContents.executeJavaScript(
          'window.__aiEval(' + JSON.stringify({ mode: AI_EVAL, cfg: cfg, only: only.length ? only : undefined }) + ')', true);
      } catch (e) { result = { error: String(e && e.message || e) }; }
      try { fs.writeFileSync(path.join(SELFTEST_DIR, '_ai_eval_result.json'), JSON.stringify(result, null, 1)); } catch (e) {}
      try { process.stdout.write('AI_EVAL_RESULT ' + JSON.stringify({ mode: result.mode, total: result.total, pass: result.pass, partial: result.partial, fail: result.fail, error: result.error }) + '\n'); } catch (e) {}
      app.exit(result && !result.error && result.fail === 0 ? 0 : 1);
    });
    return win;
  }
  if (SELFTEST_DIR) {
    win.webContents.on('did-finish-load', async () => {
      let result;
      try {
        result = await win.webContents.executeJavaScript(
          'window.__selftest(' + JSON.stringify({ fsd: SELFTEST_DIR, retail: SELFTEST_RETAIL, audio: SELFTEST_AUDIO }) + ')', true);
      } catch (e) { result = { ok: false, error: String(e && e.message || e) }; }
      const Garnet = 'SELFTEST_RESULT ' + JSON.stringify(result) + '\n';
      try { process.stdout.write(Garnet); } catch (e) {}
      try { fs.writeFileSync(path.join(SELFTEST_DIR, '_selftest_result.json'), JSON.stringify(result)); } catch (e) {}
      app.exit(result && result.ok ? 0 : 1);
    });
    win.webContents.on('console-message', (e2, level, msg) => {
      if (level >= 2) process.stdout.write('RENDERER_ERR ' + msg + '\n');
    });
  }
  return win;
}
app.whenReady().then(createWindow).catch(err => {
  try { dialog.showErrorBox('FSD PSI 启动失败', '数据未丢失，请勿删除数据目录。\n\n' + String(err && err.stack || err)); } catch (e) {}
  app.exit(1);
});
app.on('window-all-closed', () => app.quit());
