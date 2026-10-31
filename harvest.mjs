#!/usr/bin/env node
/**
 * harvest-qist-sources.mjs
 *
 * 从 https://github.com/qist/tvbox 的各份 TVBox 配置里，自动挖出「type=1 的苹果CMS采集站」，
 * 归一化成 LibreTV 的 API_SITES 结构，并同时产出可直接喂给自建 /tvbox 聚合服务的 TVBOX_SITES 片段。
 *
 * 用法：
 *   node harvest-qist-sources.mjs [选项]
 *
 * 选项：
 *   --repo <owner/name>   源仓库，默认 qist/tvbox
 *   --ref <branch>        分支，默认 master
 *   --configs a,b.json    只解析指定配置文件（默认自动发现根目录全部 *.json）
 *   --token <ghp_xxx>     GitHub token（提高速率限制，可选）
 *   --proxy <url>         raw.githubusercontent 加速前缀，如 https://github.moeyy.xyz
 *   --health              逐个探活（?ac=videolist&pg=1），标记 OK/DEAD
 *   --only-alive          配合 --health：只输出存活源
 *   --include-adult       保留成人源（默认剔除）
 *   --out <dir>           输出目录，默认 ./harvest-out
 *
 * 产出：
 *   harvest-out/qist-sites.json            归一化结果（含元信息）
 *   harvest-out/qist-sites.libretv.js      可粘贴进 js/config.js 的 API_SITES 片段
 *   harvest-out/qist-sites.tvbox.mjs       可替换 tvbox-sites.mjs 里 TVBOX_SITES 的片段
 */

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);

const REPO = opt('repo', 'qist/tvbox');
const REF = opt('ref', 'master');
const TOKEN = opt('token', process.env.GITHUB_TOKEN || '');
const PROXY = opt('proxy', '');
const OUT_DIR = opt('out', 'harvest-out');
const HEALTH = flag('health');
const ONLY_ALIVE = flag('only-alive');
const INCLUDE_ADULT = flag('include-adult');
const ONLY_CONFIGS = opt('configs', '').split(',').map(s => s.trim()).filter(Boolean);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ===== 工具函数 =====

function ghHeaders(accept) {
  const h = { 'User-Agent': UA, Accept: accept || 'application/vnd.github+json' };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

/** 拉取仓库内文件原始内容：优先 GitHub API（最稳），失败再退 raw / 代理 */
async function fetchRaw(path) {
  const tries = [];
  tries.push({ url: `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(path)}?ref=${REF}`, accept: 'application/vnd.github.raw+json' });
  tries.push({ url: `https://raw.githubusercontent.com/${REPO}/${REF}/${path}`, accept: undefined });
  if (PROXY) tries.push({ url: `${PROXY.replace(/\/+$/, '')}/https://raw.githubusercontent.com/${REPO}/${REF}/${path}`, accept: undefined });

  let lastErr = null;
  for (const t of tries) {
    try {
      const res = await fetch(t.url, { headers: ghHeaders(t.accept), signal: AbortSignal.timeout(30000) });
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status} ${t.url}`); continue; }
      const text = await res.text();
      if (text && text.trim().startsWith('<')) { lastErr = new Error('拿到的是 HTML 页面，非原始文件'); continue; }
      return text;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('全部取源方式失败');
}

/** 容错解析 JSON：去 BOM、去 // 与 /* *\/ 注释、去尾逗号 */
function parseTolerant(text) {
  let s = text.replace(/^\uFEFF/, '').trim();
  try { return JSON.parse(s); } catch (e) { /* 继续清洗 */ }

  // 逐字符剥离字符串外的注释与尾逗号（简单状态机，避免误伤字符串内的 //）
  let out = '', inStr = false, esc = false, i = 0;
  while (i < s.length) {
    const c = s[i], c2 = s[i + 1];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      i++; continue;
    }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === '/' && c2 === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && c2 === '*') { const end = s.indexOf('*/', i + 2); i = end === -1 ? s.length : end + 2; continue; }
    out += c; i++;
  }
  out = out.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(out);
}

/** 列仓库根目录的 *.json（走 git trees API） */
async function listRootJson() {
  if (ONLY_CONFIGS.length) return ONLY_CONFIGS;
  const url = `https://api.github.com/repos/${REPO}/git/trees/${REF}?recursive=1`;
  const res = await fetch(url, { headers: ghHeaders(), signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`列目录失败 HTTP ${res.status}`);
  const data = await res.json();
  return (data.tree || [])
    .filter(x => x.type === 'blob' && !x.path.includes('/') && x.path.endsWith('.json'))
    .map(x => x.path);
}

const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
// 顺带清掉 TVBox 源名里常见的方框分隔符 ┃ │ ┊ ∟ 等
const BOX_RE = /[┃│┊∟┆┇┋━─═‖|]/g;
const cleanName = (s) => (s || '').replace(EMOJI_RE, '').replace(BOX_RE, ' ').replace(/\s+/g, ' ').trim();

// 成人源特征：名称关键词 + 已知成人采集域名（含 LibreTV config.js 自标 adult 的那批）
// 这是启发式过滤，不保证 100% 召回；需要全量时用 --include-adult
const ADULT_HOST = new RegExp([
  // LibreTV 自身标记为 adult 的域名
  'ckzy1', 'jkunzyapi', 'bwzym3u8', 'souavzy', '155api', 'apilsbzy', 'hsckzy', 'yutuzy',
  // 常见成人采集站
  'maozyapi', 'apittzy', 'kkzy\\.me', 'shayuapi', 'apilyzy', 'jinchancaiji', 'fhapi9',
  'madouse', 'semaozy', 'jingpinx', '91md', 'bt4\\.cc', 'mdm3u8', 'lbapi9', 'slapibf',
  'ddapi\\.cc', 'vnzyz', 'apilj\\.com', '91cam', 'jable', 'mdream', 'duaid', 'sese',
  'jt121', 'gaoaa', 'api13', 'jcjsp', 'pytds', 'madou', 'cengjinlu', 'caiji888',
  'sugoish', 'nanami', 'xxjk', 'kk15', 'av01', 'jpg\\.in', 'inapow', 'pg68', 'caomi',
  'ruoxi', 'naizi', 'baibai', '91xp', 'xxpp', 'porn', 'onlyfans', 'sao\\.pro',
].join('|'), 'i');
const ADULT_WORD = /(成人|福利|色猫|老色|麻豆|废柴|乐播|森林|滴滴|越南|黑桃|蜜桃|草莓|香蕉|果冻|无码|一本道|萝莉|丝袜|同城|约啪|一级|嫩|骚|鲍|啪|伦理|黄|国模|楼凤|车模|slut|porn)/i;

/** 裸 IP 的采集接口多为临时/灰色站点，默认剔除 */
const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function isAdult(entry, name, api) {
  if (INCLUDE_ADULT) return false;
  if (entry.adult === true) return true;
  if (ADULT_WORD.test(name || '')) return true;
  if (ADULT_HOST.test((api || '') + ' ' + (entry.api || '') + ' ' + (entry.key || ''))) return true;
  try { if (IP_RE.test(new URL(api).hostname)) return true; } catch { /* 忽略 */ }
  return false;
}

/**
 * 把 api 归一化成"纯接口地址"：补协议、剥掉原有 query、去尾斜杠。
 * 关键：LibreTV / TVBox 会自己拼 ?ac=videolist&wd=...，
 * 若保留源里的 ?ac=list 会拼出双问号，导致请求失效。
 */
function normApi(api) {
  let a = (api || '').trim().replace(/^`+|`+$/g, '');
  if (!a) return '';
  if (!/^https?:\/\//i.test(a)) return '';      // 相对路径 ./xxx、纯 js 引用等不是 CMS 直连接口
  a = a.replace(/\s+/g, '');
  a = a.split('?')[0];                          // 剥掉原 query，避免与客户端拼接冲突
  a = a.replace(/#.*$/, '');
  return a.replace(/\/+$/, '');
}

/** 从主机名取一个好读的标识：api.apibdzy.com -> apibdzy */
function hostSlug(hostname) {
  const junk = /^(api|www|cj|inc|com|net|org|tv|cc|me|vip|cn|xyz|top|club)$/i;
  const labels = hostname.split('.').filter(Boolean);
  const pick = labels.find(l => !junk.test(l) && /[a-z]/i.test(l)) || labels[0] || 'site';
  return pick.replace(/[^a-zA-Z0-9]/g, '');
}

/** key 必须是合法 JS 标识符且不重复 */
function makeKey(raw, hostname, used) {
  let base = String(raw || '').replace(/[^a-zA-Z0-9_]/g, '').replace(/^[^a-zA-Z]+/, '');
  if (!base || base.length < 3 || /[\u4e00-\u9fa5]/.test(raw || '')) {
    base = hostSlug(hostname);                  // 源里的 key 多是中文/符号，改用域名缩写
  }
  base = base.slice(0, 20);
  if (!/^[a-zA-Z]/.test(base)) base = 's' + base;
  let k = base, n = 2;
  while (used.has(k)) k = `${base}${n++}`;
  used.add(k);
  return k;
}

/** 探活：标准苹果CMS列表接口 */
async function probe(entry) {
  const url = `${entry.api}${entry.api.includes('?') ? '&' : '?'}ac=videolist&pg=1`;
  try {
    const t0 = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(9000) });
    const ms = Date.now() - t0;
    if (!res.ok) return { alive: false, status: res.status, ms };
    const txt = await res.text();
    let json = null;
    try { json = JSON.parse(txt); } catch { return { alive: false, status: res.status, ms, reason: '非JSON(可能防盗链/被墙)' }; }
    return { alive: !!(json && Array.isArray(json.list) && json.list.length > 0), status: res.status, ms, count: json?.list?.length || 0 };
  } catch (e) {
    return { alive: false, ms: 0, reason: e.name === 'TimeoutError' ? '超时' : e.message };
  }
}

// ===== 主流程 =====

async function main() {
  console.log(`\n源仓库: ${REPO}@${REF}   探活: ${HEALTH ? '开' : '关'}   含成人源: ${INCLUDE_ADULT ? '是' : '否'}\n`);

  let files;
  try { files = await listRootJson(); }
  catch (e) { console.error('列目录失败：', e.message); process.exit(1); }
  console.log(`发现配置文件 ${files.length} 个：${files.join(', ')}\n`);

  const used = new Set();
  const collected = new Map();   // api -> entry（按接口去重）
  const jars = new Set();
  const report = [];

  for (const f of files) {
    let cfg;
    try {
      cfg = parseTolerant(await fetchRaw(f));
    } catch (e) {
      report.push({ file: f, ok: false, note: `解析失败：${e.message.slice(0, 80)}` });
      console.log(`  ✗ ${f.padEnd(14)} ${e.message.slice(0, 70)}`);
      continue;
    }

    if (cfg.spider && /^https?:\/\//i.test(cfg.spider)) jars.add(cfg.spider.split(';')[0]);
    const sites = Array.isArray(cfg.sites) ? cfg.sites : [];
    let t1 = 0, added = 0;

    for (const s of sites) {
      if (String(s.type) !== '1') continue;
      t1++;
      const api = normApi(s.api);
      if (!api) continue;
      const name = cleanName(s.name) || s.key || '';
      if (!name || /example\.com|测试|testSource/i.test(api) || /空内容|示例/.test(name)) continue;
      if (isAdult(s, name, api)) continue;

      const host = (() => { try { return new URL(api).hostname; } catch { return 'host'; } })();
      if (collected.has(api)) continue;
      collected.set(api, {
        key: makeKey(s.key, host, used),
        name,
        api,
        host,
        from: f,
      });
      added++;
    }

    const total = sites.length;
    report.push({ file: f, ok: true, sites: total, type1: t1, newAdded: added });
    console.log(`  ✓ ${f.padEnd(14)} 站点 ${String(total).padStart(4)} | type1 ${String(t1).padStart(3)} | 本文件新增 ${added}`);
  }

  let entries = [...collected.values()];
  console.log(`\n合计去重后 type-1 采集站：${entries.length} 个\n`);

  if (HEALTH) {
    console.log('开始探活……');
    const results = await mapLimit(entries, 8, async (e) => ({ ...e, ...(await probe(e)) }));
    entries = results;
    const alive = entries.filter(e => e.alive);
    entries.sort((a, b) => (b.alive - a.alive) || (a.ms - b.ms));
    console.log(`探活结果：存活 ${alive.length} / ${entries.length}\n`);
    for (const e of entries) {
      console.log(`  ${e.alive ? 'OK  ' : 'DEAD'} ${String(e.ms).padStart(5)}ms  ${(e.name || '').padEnd(16)} ${e.api}`);
    }
    if (ONLY_ALIVE) entries = entries.filter(e => e.alive);
  }

  // ===== 输出 =====
  const fs = await import('fs');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  fs.writeFileSync(`${OUT_DIR}/qist-sites.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    repo: `${REPO}@${REF}`,
    configsParsed: report.filter(r => r.ok).map(r => r.file),
    configsFailed: report.filter(r => !r.ok),
    jars: [...jars],
    count: entries.length,
    sites: entries,
  }, null, 2));

  // LibreTV config.js 的 API_SITES 片段
  const libretv = [
    '// 由 harvest-qist-sources.mjs 自动生成，粘贴进 js/config.js 替换/追加 API_SITES',
    'const API_SITES = {',
    ...entries.map(e => `    ${e.key}: {\n        api: '${e.api}',\n        name: '${e.name}',\n    },`),
    '};',
  ].join('\n') + '\n';
  fs.writeFileSync(`${OUT_DIR}/qist-sites.libretv.js`, libretv);

  // 自建聚合服务用的 TVBOX_SITES 片段
  const tvbox = [
    '// 由 harvest-qist-sources.mjs 自动生成，替换 tvbox-sites.mjs 中的 TVBOX_SITES',
    'export const TVBOX_SITES = [',
    ...entries.map(e => `  { key: '${e.key}', name: '${e.name}', api: '${e.api}' },`),
    '];',
  ].join('\n') + '\n';
  fs.writeFileSync(`${OUT_DIR}/qist-sites.tvbox.mjs`, tvbox);

  console.log(`\n已输出：`);
  console.log(`  ${OUT_DIR}/qist-sites.json          完整结果（含探活/来源/失败清单）`);
  console.log(`  ${OUT_DIR}/qist-sites.libretv.js    LibreTV API_SITES 片段`);
  console.log(`  ${OUT_DIR}/qist-sites.tvbox.mjs     自建 /tvbox 的 TVBOX_SITES 片段`);
  if (jars.size) console.log(`\n发现 jar 包地址 ${jars.size} 个（type-3 源需要，见 json 里 jars 字段）`);
}

/** 并发限流的 map */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cur = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cur < items.length) { const i = cur++; out[i] = await fn(items[i]); }
  });
  await Promise.all(workers);
  return out;
}

main().catch(e => { console.error('运行失败：', e); process.exit(1); });

