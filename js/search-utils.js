// 搜索结果相关性处理：过滤 + 排序 + 跨源去重
// 背景：苹果CMS采集站的 wd 搜索多为分词/子串模糊匹配（如暴风资源搜“奥本海默”
// 会返回 total=2000、含大量不相干影片，前端若照单全收并翻页放大，结果页就被噪音淹没。
// 这里统一做“标题必须含完整查询词”的硬过滤，再按相关度排序、跨源去重。
// 供 js/app.js 与 js/api.js 两条搜索路径共用（本文件须在它们之前加载）。

// 归一化：转小写，仅保留中文/字母/数字，去掉空格与标点，便于宽松比对
function normalizeSearchText(text) {
    return (text == null ? '' : String(text))
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

// 相关度打分：标题完全相等 > 以查询词开头 > 包含查询词 > 不相关(0)
// normalizedQuery 为空时返回中性分 1（不做过滤）
function scoreRelevance(title, normalizedQuery) {
    if (!normalizedQuery) return 1;
    const t = normalizeSearchText(title);
    if (!t) return 0;
    if (t === normalizedQuery) return 100;
    if (t.startsWith(normalizedQuery)) return 80;
    if (t.includes(normalizedQuery)) return 60;
    return 0;
}

// 过滤 + 排序 + 去重
// - 过滤：标题归一化后不含完整查询词的条目直接丢弃
// - 排序：相关度降序 → 年份新→旧 → 标题
// - 去重：仅去除"同源同 id"的翻页重复；不同采集站的结果各自保留为独立卡片
//     (多源聚合的意义就是让用户能挑选不同源播放，不做跨源合并)
function filterSortDedup(results, query) {
    if (!Array.isArray(results)) return [];
    const q = normalizeSearchText(query);

    const scored = [];
    for (const item of results) {
        if (!item) continue;
        const score = scoreRelevance(item.vod_name, q);
        if (q && score === 0) continue;
        scored.push({ item, score, year: parseInt(item.vod_year, 10) || 0 });
    }

    scored.sort((a, b) =>
        b.score - a.score ||
        b.year - a.year ||
        normalizeSearchText(a.item.vod_name).localeCompare(normalizeSearchText(b.item.vod_name))
    );

    const out = [];
    const seenSourceId = new Set();
    for (const { item } of scored) {
        const srcId = `${item.source_code || ''}_${item.vod_id || ''}`;
        if (seenSourceId.has(srcId)) continue;
        seenSourceId.add(srcId);
        out.push(item);
    }
    return out;
}