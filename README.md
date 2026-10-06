# Trending Hub 🔥

![Build Status](https://github.com/zxc76o/trending-hub/actions/workflows/fetch-trending.yml/badge.svg)

多平台社交媒体热点聚合工具，支持 X/Twitter、TikTok、Bilibili、YouTube、Instagram、微博、知乎、百度、抖音等平台。

## 特性

- 🔄 **每30分钟自动更新** - 通过 GitHub Actions 定时抓取
- 🌐 **多平台支持** - 覆盖国内外主流社交媒体
- 📱 **响应式设计** - 支持桌面和移动端
- 🆓 **完全免费** - 使用 GitHub Pages 托管
- 🔓 **开源** - 可自定义和扩展

## 支持的平台

| 平台 | 数据源 | 状态 |
|------|--------|------|
| X (Twitter) | trends24.in | ✅ |
| TikTok | tokboard.com | ✅ |
| Bilibili | RSSHub | ✅ |
| YouTube | RSSHub | ✅ |
| Instagram | top-hashtags.com | ✅ |
| 微博 | RSSHub | ✅ |
| 知乎 | 官方网页热榜 API（匿名读取，失败保留缓存） | ✅ |
| 百度热搜 | 百度 API | ✅ |
| 抖音 | RSSHub | ✅ |

## 快速开始

### 1. Fork 本仓库

点击右上角 Fork 按钮

### 2. 启用 GitHub Pages

1. 进入仓库 Settings → Pages
2. Source 选择 "GitHub Actions"

### 3. 启用 Actions

1. 进入仓库 Actions 页面
2. 点击 "I understand my workflows, go ahead and enable them"

### 4. 手动触发首次运行

1. 进入 Actions → "Fetch Trending Topics"
2. 点击 "Run workflow"

几分钟后，访问 `https://你的用户名.github.io/trending-hub/` 查看效果。

## 本地开发

```bash
# 克隆仓库
git clone https://github.com/你的用户名/trending-hub.git
cd trending-hub

# 安装依赖
npm install

# 抓取数据
npm run fetch

# 构建 HTML
npm run build

# 本地预览
npm run dev
```

## 项目结构

```
trending-hub/
├── .github/
│   └── workflows/
│       └── fetch-trending.yml  # GitHub Actions 工作流
├── scripts/
│   ├── fetch-trending.js       # 数据抓取脚本
│   └── build-html.js           # HTML 生成脚本
├── data/
│   └── trending.json           # 抓取的热点数据
├── public/
│   └── index.html              # 生成的网页
├── package.json
└── README.md
```

## 自定义配置

### 修改 RSSHub 实例

编辑 `scripts/fetch-trending.js` 中的 `RSSHUB_INSTANCES` 数组：

```javascript
const RSSHUB_INSTANCES = [
  'https://rsshub.app',
  'https://你的自建实例.com',
];
```

### 添加新平台

在 `scripts/fetch-trending.js` 中添加抓取函数，然后在 `main()` 函数中调用。

### 修改更新频率

编辑 `.github/workflows/fetch-trending.yml` 中的 cron 表达式：

```yaml
schedule:
  - cron: '*/30 * * * *'  # 每30分钟
  # - cron: '0 * * * *'   # 每小时
  # - cron: '0 */2 * * *' # 每2小时
```

## API 使用

抓取的数据存储在 `data/trending.json`，可通过以下 URL 访问：

```
https://你的用户名.github.io/trending-hub/data/trending.json
```

JSON 结构：

```json
{
  "lastUpdated": "2024-01-01T00:00:00.000Z",
  "platforms": {
    "twitter": {
      "name": "X (Twitter)",
      "icon": "𝕏",
      "items": [
        {
          "rank": 1,
          "title": "热门话题",
          "url": "https://...",
          "hot": "",
          "platform": "twitter"
        }
      ]
    }
  }
}
```

## 注意事项

1. **请求频率限制** - 部分数据源可能有访问限制，建议使用自建 RSSHub 实例
2. **数据准确性** - 热点数据来自第三方，可能存在延迟或不完整
3. **GitHub Actions 限制** - 免费账户每月有 2000 分钟限制

## License

MIT License

## X 免费话题源与内容范围

三个平台提供“中区 · 中文 / 全球”切换，分别记住选择。

- **X 全球**：GetDayTrends 当前全球趋势，最多 30 条。
- **X 中文**：蓝不住公开话题 JSON → SoPilot 公开话题 HTML → 上次成功缓存。无需 X Token 或 Cookie，不调用付费 X 接口。展示标题、来源原有排名、曝光和帖数，点击直达 X 原帖；不转载话题长摘要。来源统计口径不同，不混合分数，也不宣称为 X 全站热榜。
- **Bilibili 中区**：国内全站榜。全球选项明确显示没有独立全球榜。
- **Instagram**：全球与简繁体中文精选标签导航，不是实时热榜。

中文来源：

- https://lanbuzhu.org/data/topics
- https://sopilot.net/zh/rank/topic

每次定时运行先获取话题榜，再以最多 3 个并发读取话题详情；蓝不住选爆款范本中曝光最高的一条，SoPilot 选页面首条正文关联推文。每个话题直链缓存 2 小时，蓝不住来源更新时间变化时提前刷新。拿不到直链时可沿用该话题已有原帖缓存，否则不展示；全部失败再降级另一来源。
蓝不住来源时间缺失、超过 24 小时或明显处于未来时会降级。
全部来源失败时保留同区域上次成功的数据和来源信息；全球数据不会替代中文缓存。
页面区分抓取成功时间与上游提供的来源更新时间。公开页面和接口可能变动，
当前无需密钥并不等同于长期服务承诺。

旧的 X_BEARER_TOKEN、X_ZH_QUERY、X_WOEID、X_GETDAYTRENDS_REGION 配置不再用于定时抓取。
底层 x-trends.js 保留可选官方 Trends 适配器，只有显式传入配置调用该模块才会使用。

本地验证（macOS / Linux，Node.js 20+）：

```bash
npm ci
npm test
npm start
```

中国网络环境需确保 Node.js 进程可以连接这些来源。

Bilibili 全球入口读取国际版创作中心 Trending Videos 的默认地区榜单（多语言，不代表全球总榜）。本机可能受地区限制，GitHub Actions 已验证可匿名抓取；失败时保留上次成功数据。
