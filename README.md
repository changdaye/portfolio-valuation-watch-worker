# portfolio-valuation-watch-worker

一个基于 **Cloudflare Workers + D1 + KV + Workers AI** 的投资组合主题板块估值 / 宏观观察日报项目。

## 当前能力

- 每周一到周六 **22:30（Asia/Shanghai）** 生成一条日报
- 主题板块按持仓合并后观察，并在飞书消息与详细报告中明确标注**关联持仓**
- 宏观观察覆盖：`DXY`、`USD/CNH`、`USD/JPY`、黄金、`WTI`、布伦特
- 估值 / 价格统一按**近 5 年分位**观察
- 进入 **10% / 90% 极端区间**时额外提醒
- 详细版 HTML 报告上传腾讯云 COS，可在浏览器直接打开
- `/admin/trigger` 返回 `messagePreview`，便于部署后核对飞书消息样式

## 已确认范围

- 主题板块：按持仓合并后的主题板块观察
- 宏观观察：DXY、USD/CNH、USD/JPY、黄金、WTI、布伦特
- 推送方式：每日一条日报 + 极端区间额外提醒
- 分位窗口：近 5 年
- 极端阈值：10% / 90%
- 运行时间：每周一到周六 22:30（Asia/Shanghai）

## 设计与计划文档

- `docs/superpowers/specs/2026-04-25-portfolio-valuation-watch-worker-design.md`
- `docs/superpowers/plans/2026-04-25-portfolio-valuation-watch-worker.md`

## 本地开发

```bash
npm install
npm run check
npx wrangler dev
```

健康检查：

```bash
curl http://127.0.0.1:8787/health
```

## Admin 接口

### 手动触发日报

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_MANUAL_TRIGGER_TOKEN" \
  https://<your-worker>/admin/trigger
```

返回示例：

```json
{
  "ok": true,
  "tradeDate": "2026-04-25",
  "reportUrl": "https://.../portfolio-valuation-watch-worker/20260425104027.html",
  "headline": "...",
  "messagePreview": "...",
  "alertPreviews": []
}
```

### 查看当前观察对象

```bash
curl \
  -H "Authorization: Bearer YOUR_MANUAL_TRIGGER_TOKEN" \
  https://<your-worker>/admin/watch-items
```

### 重新装载默认观察对象

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_MANUAL_TRIGGER_TOKEN" \
  https://<your-worker>/admin/watch-items/reseed-defaults
```

## 环境变量

敏感信息通过 `.dev.vars` 或 Cloudflare secrets 注入；不要提交到公开仓库。

参见：
- `.dev.vars.example`
- `wrangler.jsonc`

## 风险说明

- 免费公开数据源存在结构变动与可用性波动风险
- 部分主题在公开免费源上只能稳定获取 PE，PB 会按可得性降级展示
- 纳斯达克100 主题当前使用价格分位代理，未强行伪造 PE / PB
- 个别宏观对象在上游源失效时会临时显示为 unavailable
- 飞书短消息当前使用富文本 post 结构包装“详细版报告”链接，不再裸露完整 URL
