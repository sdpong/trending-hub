import fetch from 'node-fetch';
import { withRegions } from './platform-regions.js';
import { fetchChineseTopics } from './chinese-topics.js';
import { fetchTwitterTrends, mergeTwitterSnapshot } from './x-trends.js';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

// RSSHub 实例列表 (可替换为自建实例)
const RSSHUB_INSTANCES = [
  'https://rsshub.pseudoyu.com',
  'https://rsshub.app',
  'https://rss.fatpandac.com'
];

// 通用请求头
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
};

// 获取可用的 RSSHub 实例
async function getWorkingRSSHub() {
  for (const instance of RSSHUB_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${instance}/`, { 
        signal: controller.signal,
        headers: HEADERS
      });
      clearTimeout(timeoutId);
      if (res.ok) return instance;
    } catch (e) {
      continue;
    }
  }
  return RSSHUB_INSTANCES[0];
}

// 通用 RSS 解析函数
async function fetchRSS(url, maxItems = 20) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const res = await fetch(url, {
      headers: HEADERS,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    
    const items = [];
    $('item').slice(0, maxItems).each((i, el) => {
      items.push({
        title: $(el).find('title').text().trim(),
        link: $(el).find('link').text().trim(),
        description: $(el).find('description').text().trim().slice(0, 200),
        pubDate: $(el).find('pubDate').text().trim()
      });
    });
    return items;
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error.message);
    return [];
  }
}

// 抓取微博热搜
async function fetchWeibo(rssHub) {
  // 先尝试 RSSHub
  let items = await fetchRSS(`${rssHub}/weibo/search/hot`);
  
  // 备用：直接抓取微博热搜页面
  if (items.length === 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const res = await fetch('https://weibo.com/ajax/side/hotSearch', {
        headers: HEADERS,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const data = await res.json();
      if (data?.data?.realtime) {
        return data.data.realtime.slice(0, 30).map((item, index) => ({
          rank: index + 1,
          title: item.word || item.note,
          url: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word || item.note)}`,
          hot: item.num ? `${Math.floor(item.num / 10000)}万` : '',
          platform: 'weibo'
        }));
      }
    } catch (e) {
      console.error('Weibo fallback failed:', e.message);
    }
  }
  
  return items.map((item, index) => ({
    rank: index + 1,
    title: item.title,
    url: item.link,
    hot: '',
    platform: 'weibo'
  }));
}

// 抓取 Bilibili 热门
async function fetchBilibili(rssHub) {
  // 尝试多个路由
  let items = await fetchRSS(`${rssHub}/bilibili/hot-search`);
  if (items.length === 0) {
    items = await fetchRSS(`${rssHub}/bilibili/ranking/0/3/1`);
  }
  
  // 备用：直接抓取 B站 API
  if (items.length === 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const res = await fetch('https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all', {
        headers: HEADERS,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const data = await res.json();
      if (data?.data?.list) {
        return data.data.list.slice(0, 20).map((item, index) => ({
          rank: index + 1,
          title: item.title,
          url: `https://www.bilibili.com/video/${item.bvid}`,
          hot: item.stat?.view ? `${Math.floor(item.stat.view / 10000)}万播放` : '',
          platform: 'bilibili'
        }));
      }
    } catch (e) {
      console.error('Bilibili fallback failed:', e.message);
    }
  }
  
  return items.map((item, index) => ({
    rank: index + 1,
    title: item.title,
    url: item.link,
    hot: '',
    platform: 'bilibili'
  }));
}

// 抓取知乎热榜
async function fetchZhihu(rssHub) {
  let items = await fetchRSS(`${rssHub}/zhihu/hot`);
  
  // 备用：知乎热榜 API
  if (items.length === 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const res = await fetch('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=30', {
        headers: {
          ...HEADERS,
          'x-api-version': '3.0.40'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const data = await res.json();
      if (data?.data) {
        return data.data.slice(0, 30).map((item, index) => ({
          rank: index + 1,
          title: item.target?.title || item.title,
          url: item.target?.url || `https://www.zhihu.com/question/${item.target?.id}`,
          hot: item.detail_text || '',
          platform: 'zhihu'
        }));
      }
    } catch (e) {
      console.error('Zhihu fallback failed:', e.message);
    }
  }
  
  return items.map((item, index) => ({
    rank: index + 1,
    title: item.title,
    url: item.link,
    hot: '',
    platform: 'zhihu'
  }));
}

// 抓取抖音热点
async function fetchDouyin(rssHub) {
  let items = await fetchRSS(`${rssHub}/douyin/trending`);
  
  // 备用：抖音热点 API
  if (items.length === 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const res = await fetch('https://www.douyin.com/aweme/v1/web/hot/search/list/', {
        headers: HEADERS,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const data = await res.json();
      if (data?.data?.word_list) {
        return data.data.word_list.slice(0, 20).map((item, index) => ({
          rank: index + 1,
          title: item.word,
          url: `https://www.douyin.com/search/${encodeURIComponent(item.word)}`,
          hot: item.hot_value ? `${Math.floor(item.hot_value / 10000)}万` : '',
          platform: 'douyin'
        }));
      }
    } catch (e) {
      console.error('Douyin fallback failed:', e.message);
    }
  }
  
  return items.map((item, index) => ({
    rank: index + 1,
    title: item.title,
    url: item.link,
    hot: '',
    platform: 'douyin'
  }));
}

// 抓取 TikTok 趋势
async function fetchTikTokTrends() {
  try {
    // 尝试 exolyt 热门
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const res = await fetch('https://exolyt.com/trending', {
      headers: HEADERS,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    const trends = [];
    $('a[href*="/hashtag/"]').slice(0, 20).each((i, el) => {
      const title = $(el).text().trim();
      if (title && !trends.find(t => t.title === title)) {
        trends.push({
          rank: trends.length + 1,
          title: title.startsWith('#') ? title : `#${title}`,
          url: `https://www.tiktok.com/tag/${encodeURIComponent(title.replace('#', ''))}`,
          hot: '',
          platform: 'tiktok'
        });
      }
    });
    
    return trends;
  } catch (error) {
    console.error('Failed to fetch TikTok trends:', error.message);
    // 返回一些通用热门标签作为降级
    return [
      { rank: 1, title: '#fyp', url: 'https://www.tiktok.com/tag/fyp', hot: '', platform: 'tiktok' },
      { rank: 2, title: '#viral', url: 'https://www.tiktok.com/tag/viral', hot: '', platform: 'tiktok' },
      { rank: 3, title: '#trending', url: 'https://www.tiktok.com/tag/trending', hot: '', platform: 'tiktok' }
    ];
  }
}

// 抓取 YouTube 趋势
async function fetchYouTubeTrends(rssHub) {
  // 先尝试 RSSHub
  let items = await fetchRSS(`${rssHub}/youtube/trending/US`);
  
  if (items.length === 0) {
    items = await fetchRSS(`${rssHub}/youtube/trending`);
  }
  
  // 备用：抓取 YouTube 热门页面
  if (items.length === 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const res = await fetch('https://www.youtube.com/feed/trending', {
        headers: HEADERS,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const html = await res.text();
      // YouTube 使用 JS 渲染，这里只能获取有限数据
      const $ = cheerio.load(html);
      
      const trends = [];
      $('script').each((i, el) => {
        const text = $(el).html();
        if (text && text.includes('var ytInitialData')) {
          try {
            const match = text.match(/var ytInitialData = ({.+?});/);
            if (match) {
              const data = JSON.parse(match[1]);
              // 解析视频数据（简化处理）
              const videos = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
              videos.forEach(section => {
                const items = section?.itemSectionRenderer?.contents || [];
                items.forEach(item => {
                  const video = item?.videoRenderer;
                  if (video) {
                    trends.push({
                      rank: trends.length + 1,
                      title: video.title?.runs?.[0]?.text || '',
                      url: `https://www.youtube.com/watch?v=${video.videoId}`,
                      hot: video.viewCountText?.simpleText || '',
                      platform: 'youtube'
                    });
                  }
                });
              });
            }
          } catch (e) {}
        }
      });
      
      if (trends.length > 0) return trends.slice(0, 20);
    } catch (e) {
      console.error('YouTube fallback failed:', e.message);
    }
  }
  
  return items.map((item, index) => ({
    rank: index + 1,
    title: item.title,
    url: item.link,
    hot: '',
    platform: 'youtube'
  }));
}

// 抓取 Instagram 热门标签
async function fetchInstagramTrends() {
  // Instagram 限制较多，使用预设热门标签
  const popularTags = [
    'love', 'instagood', 'fashion', 'photooftheday', 'photography',
    'beautiful', 'art', 'picoftheday', 'nature', 'happy',
    'follow', 'travel', 'style', 'instadaily', 'reels',
    'like', 'fitness', 'life', 'beauty', 'food'
  ];
  
  return popularTags.map((tag, index) => ({
    rank: index + 1,
    title: `#${tag}`,
    url: `https://www.instagram.com/explore/tags/${tag}/`,
    hot: '',
    platform: 'instagram'
  }));
}

// 抓取百度热搜
async function fetchBaidu() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const res = await fetch('https://top.baidu.com/board?tab=realtime', {
      headers: HEADERS,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    const trends = [];
    
    // 尝试多种选择器
    $('.c-single-text-ellipsis').slice(0, 30).each((i, el) => {
      const title = $(el).text().trim();
      if (title && !trends.find(t => t.title === title)) {
        trends.push({
          rank: trends.length + 1,
          title: title,
          url: `https://www.baidu.com/s?wd=${encodeURIComponent(title)}`,
          hot: '',
          platform: 'baidu'
        });
      }
    });
    
    // 备用选择器
    if (trends.length === 0) {
      $('[class*="title"]').each((i, el) => {
        const title = $(el).text().trim();
        if (title && title.length > 2 && title.length < 50 && !trends.find(t => t.title === title)) {
          trends.push({
            rank: trends.length + 1,
            title: title,
            url: `https://www.baidu.com/s?wd=${encodeURIComponent(title)}`,
            hot: '',
            platform: 'baidu'
          });
        }
      });
    }
    
    return trends.slice(0, 30);
  } catch (error) {
    console.error('Failed to fetch Baidu trends:', error.message);
    return [];
  }
}

// 抓取今日头条热榜
async function fetchToutiao() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const res = await fetch('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', {
      headers: HEADERS,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const data = await res.json();
    if (data?.data) {
      return data.data.slice(0, 30).map((item, index) => ({
        rank: index + 1,
        title: item.Title,
        url: item.Url || `https://www.toutiao.com/search?keyword=${encodeURIComponent(item.Title)}`,
        hot: item.HotValue ? `${Math.floor(item.HotValue / 10000)}万` : '',
        platform: 'toutiao'
      }));
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch Toutiao trends:', error.message);
    return [];
  }
}

// 主函数
async function main() {
  console.log('🚀 Starting to fetch trending topics...');
  console.log(`📅 ${new Date().toISOString()}`);
  
  // 确保数据目录存在
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  let previous = {};
  try {
    previous = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'trending.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  // 获取可用的 RSSHub
  const rssHub = await getWorkingRSSHub();
  console.log(`📡 Using RSSHub: ${rssHub}`);
  
  // 并行抓取所有平台
  const [
    twitter,
    chinese,
    bilibili,
    instagram,
    zhihu,
    baidu,
    toutiao
  ] = await Promise.all([
    fetchTwitterTrends({ env: {} }),
    fetchChineseTopics(),
    fetchBilibili(rssHub),
    fetchInstagramTrends(),
    fetchZhihu(rssHub),
    fetchBaidu(),
    fetchToutiao()
  ]);
  
  const data = {
    lastUpdated: new Date().toISOString(),
    platforms: {
      twitter: { name: 'X 趋势', icon: '𝕏', ...mergeTwitterSnapshot(twitter, previous.platforms?.twitter, previous.lastUpdated) },
      bilibili: { name: 'Bilibili', icon: '📺', items: bilibili },
      instagram: { name: 'Instagram', icon: '📷', items: instagram },
      zhihu: { name: '知乎', icon: '💡', items: zhihu },
      baidu: { name: '百度热搜', icon: '🔍', items: baidu },
      toutiao: { name: '今日头条', icon: '📰', items: toutiao }
    }
  };
  
  withRegions(data.platforms, chinese, previous.platforms, previous.lastUpdated);

  // 写入 JSON 文件
  const outputPath = path.join(DATA_DIR, 'trending.json');
  await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  
  console.log(`\n✅ Data saved to ${outputPath}`);
  console.log('📊 Summary:');
  Object.entries(data.platforms).forEach(([key, platform]) => {
    console.log(`   ${platform.icon} ${platform.name}: ${platform.items.length} items`);
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
