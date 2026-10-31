// tvbox-sites.mjs
// TVBox 采集源的单一数据源 + 相关工具函数。
// 说明：这里是 js/config.js 里 API_SITES 的“非成人源”镜像。之所以单独抽一份，
// 是因为 config.js 用的是浏览器全局 const（没有 export），Node 端无法直接 import。
// 增删源只改这里即可，/tvbox/config 会自动生成对应的 TVBox 配置。

// 失效的API站点配置
const DISABLED_API_SITES = [
  { key: 'dyttzy',    name: '电影天堂资源', api: 'http://caiji.dyttzyapi.com/api.php/provide/vod' },
  { key: 'ruyi',      name: '如意资源',     api: 'https://cj.rycjapi.com/api.php/provide/vod' },
  { key: 'tyyszy',    name: '天涯资源',     api: 'https://tyyszy.com/api.php/provide/vod' },
  { key: 'xiaomaomi', name: '小猫咪资源',   api: 'https://zy.xiaomaomi.cc/api.php/provide/vod' },
  { key: 'heimuer',   name: '黑木耳',       api: 'https://json.heimuer.xyz/api.php/provide/vod' },
  { key: 'wolong',    name: '卧龙资源',     api: 'https://wolongzyw.com/api.php/provide/vod' },
  { key: 'hwba',      name: '华为吧资源',   api: 'https://cjhwba.com/api.php/provide/vod' },
  { key: 'dbzy',      name: '豆瓣资源',     api: 'https://dbzy.com/api.php/provide/vod' },
  { key: 'mozhua',    name: '魔爪资源',     api: 'https://mozhuazy.com/api.php/provide/vod' },
  { key: 'yinghua',   name: '樱花资源',     api: 'https://m3u8.apiyhzy.com/api.php/provide/vod' },
  { key: 'wujin',     name: '无尽资源',     api: 'https://api.wujinapi.me/api.php/provide/vod' },
  { key: 'wwzy',      name: '旺旺短剧',     api: 'https://wwzy.tv/api.php/provide/vod' },
  { key: 'ikun',      name: 'iKun资源',     api: 'https://ikunzyapi.com/api.php/provide/vod' },
  { key: 'haiwaikan', name: '海外看 采集', api: 'https://haiwaikan.com/api.php/provide/vod' },
  { key: 'suoniapi', name: '索尼 采集', api: 'https://suoniapi.com/api.php/provide/vod' },
  { key: 'kuaifan', name: '快帆 采集', api: 'https://api.kuaifan.tv/api.php/provide/vod' },
  { key: 'leshiapi', name: '乐视', api: 'https://leshiapi.com/api.php/provide/vod' },
  { key: 'tyyszy', name: '影视 • 天涯', api: 'http://tyyszy.com/api.php/provide/vod' },
  { key: 'ffzy', name: '影视 • 非凡[直连]', api: 'http://ffzy.tv/api.php/provide/vod' },
  { key: 'wolongzyw', name: '影视 • 卧龙资源[直连]', api: 'https://wolongzyw.com/api.php/provide/vod' },
  { key: 'ukuapi', name: '影视 • 尤酷[直连]', api: 'https://api.ukuapi.com/api.php/provide/vod' },
  { key: 'vs', name: '影视 • 小绵阳', api: 'https://vs.okcdn100.top/api.php/provide/vod' },

  // 以下是重复的
  { key: 'bfzyapi', name: '暴風 采集', api: 'https://bfzyapi.com/api.php/provide/vod' },
  { key: 'jszyapi', name: '影视 • 极速[直连]', api: 'https://jszyapi.com/api.php/provide/vod' },
  { key: 'apibdzy', name: '百度 采集', api: 'https://api.apibdzy.com/api.php/provide/vod' },
];

// 21 个常规采集站（均为苹果CMS协议：/api.php/provide/vod）
// ["bfzy","ffzy","zy360","iqiyi","jisu","mdzy","zuid","baidu","lziapi","ffzyapi","ffzytv","juliang","caiji"]
export const TVBOX_SITES = [
  { key: 'bfzy',      name: '暴风资源',     api: 'https://bfzyapi.com/api.php/provide/vod' },
  { key: 'ffzy',      name: '非凡影视',     api: 'http://ffzy5.tv/api.php/provide/vod' },
  { key: 'zy360',     name: '360资源',      api: 'https://360zy.com/api.php/provide/vod' },
  { key: 'iqiyi',     name: '爱奇艺资源',   api: 'https://www.iqiyizyapi.com/api.php/provide/vod' },
  { key: 'jisu',      name: '极速资源',     api: 'https://jszyapi.com/api.php/provide/vod' },
  { key: 'mdzy',      name: '魔都资源',     api: 'https://www.mdzyapi.com/api.php/provide/vod' },
  { key: 'zuid',      name: '最大资源',     api: 'https://api.zuidapi.com/api.php/provide/vod' },
  { key: 'baidu',     name: '百度云资源',   api: 'https://api.apibdzy.com/api.php/provide/vod' },
  // 从 https://github.com/qist/tvbox 同步的 CMS 源
  // ------------- 开始 -------------
  { key: 'lziapi', name: '量子', api: 'https://cj.lziapi.com/api.php/provide/vod' },
  { key: 'ffzyapi', name: '非凡', api: 'http://cj.ffzyapi.com/api.php/provide/vod' },
  { key: 'ffzytv', name: '非凡2', api: 'https://ffzy.tv/api.php/provide/vod' },
  { key: 'juliang', name: '巨量 • 影视', api: 'https://api.juliang.live/api/provide/vod' },
  { key: 'caiji', name: '影视 • 电影天堂', api: 'http://caiji.dyttzyapi.com/api.php/provide/vod' },
  // ------------- 结束 -------------
];

// TVBox 播放器内核（ijk）常用默认参数，软/硬解码各一组
const IJK_DEFAULT = [
  { group: '软解码', options: [
    { category: 4, name: 'opensles', value: '0' },
    { category: 4, name: 'overlay-format', value: '842225234' },
    { category: 4, name: 'framedrop', value: '1' },
    { category: 4, name: 'soundtouch', value: '1' },
    { category: 4, name: 'start-on-prepared', value: '1' },
    { category: 1, name: 'http-detect-range-support', value: '0' },
    { category: 4, name: 'enable-accurate-seek', value: '0' },
    { category: 4, name: 'mediacodec', value: '0' },
    { category: 4, name: 'mediacodec-auto-rotate', value: '0' },
    { category: 4, name: 'mediacodec-handle-resolution-change', value: '0' },
    { category: 4, name: 'mediacodec-hevc', value: '0' },
  ]},
  { group: '硬解码', options: [
    { category: 4, name: 'opensles', value: '0' },
    { category: 4, name: 'overlay-format', value: '842225234' },
    { category: 4, name: 'framedrop', value: '1' },
    { category: 4, name: 'soundtouch', value: '1' },
    { category: 4, name: 'start-on-prepared', value: '1' },
    { category: 1, name: 'http-detect-range-support', value: '0' },
    { category: 4, name: 'enable-accurate-seek', value: '0' },
    { category: 4, name: 'mediacodec', value: '1' },
    { category: 4, name: 'mediacodec-auto-rotate', value: '1' },
    { category: 4, name: 'mediacodec-handle-resolution-change', value: '1' },
    { category: 4, name: 'mediacodec-hevc', value: '1' },
  ]},
];

const FLAGS_DEFAULT = ['youku', 'qq', 'iqiyi', 'qiyi', 'letv', 'sohu', 'tudou', 'pptv', 'mgtv', 'wasu', 'bilibili'];
const ADS_DEFAULT = ['wan.51img1.com', 'iqiyi.hbuioo.com', 'vip.ffzyad.com'];

/**
 * 推导对外可访问的基础地址（TVBox 设备要能访问到）。
 * 优先用显式配置的 TVBOX_PUBLIC_BASE；否则从请求头推断（反代场景需正确设置 X-Forwarded-*）。
 * @param {object} req Express 请求对象
 * @param {string} envBase 环境变量里配置的对外基础地址（可空）
 * @returns {string} 形如 http://tvbox.liuyonglang.cn（无末尾斜杠）
 */
export function resolvePublicBase(req, envBase) {
  if (envBase) return envBase.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

/**
 * 把一个绝对 URL 包装成走本机 /proxy/ 的地址。
 * 与 server.mjs 里 /proxy/:encodedUrl 的解码约定一致（整体 encodeURIComponent 一次）。
 */
export function toProxyUrl(base, targetUrl) {
  return `${base}/proxy/${encodeURIComponent(targetUrl)}`;
}

// 匹配 vod_play_url 中的 m3u8 直链。
// 注意：vod_play_url 用 $ (名称/地址分隔)、# (分集)、$$$ (分线路) 作结构分隔符，
// 因此字符类必须排除 $ 和 #，否则会跨集/跨线路过度匹配，把多个地址吞成一个。
const M3U8_URL_RE = /https?:\/\/[^"'\\\s#$]+?\.m3u8(?:\?[^"'\\\s#$]*)?/gi;

/**
 * 改写 vod_play_url 里的 m3u8 直链为代理地址。
 * vod_play_url 结构：名称$url#名称$url$$$名称$url...（$$$ 分线路，# 分集，$ 分名称与地址）
 * 只替换其中的 http(s) m3u8 部分，分隔符原样保留。
 */
export function rewritePlayUrl(playUrl, base) {
  if (!playUrl || typeof playUrl !== 'string') return playUrl;
  return playUrl.replace(M3U8_URL_RE, (m) => toProxyUrl(base, m));
}

/**
 * 生成一份完整的 TVBox 配置 JSON：把每个采集源映射成指向本机 /tvbox/:key 的 type-1 源。
 * @param {string} base 对外基础地址
 */
export function buildTvboxConfig(base) {
  return {
    spider: '',
    wallpaper: '',
    sites: TVBOX_SITES.map((s) => ({
      key: s.key,
      name: s.name,
      type: 1,
      api: `${base}/tvbox/${s.key}`,
      searchable: 1,
      quickSearch: 1,
      filterable: 1,
    })),
    lives: [],
    parses: [],
    flags: FLAGS_DEFAULT,
    ijk: IJK_DEFAULT,
    ads: ADS_DEFAULT,
  };
}

