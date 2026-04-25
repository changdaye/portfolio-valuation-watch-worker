# portfolio-valuation-watch-worker

一个基于 **Cloudflare Workers + D1 + KV + Workers AI** 的投资组合主题板块估值 / 宏观观察日报项目。

当前仓库已完成：
- 新项目仓库初始化
- 基础工程骨架
- 设计文档沉淀

当前尚未开始正式功能实现；下一步会在 design/spec 审阅通过后进入 implementation plan。

## 已确认范围

- 主题板块：按持仓合并后的主题板块观察
- 宏观观察：DXY、USD/CNH、USD/JPY、黄金、WTI、布伦特
- 推送方式：每日一条日报 + 极端区间额外提醒
- 分位窗口：近 5 年
- 极端阈值：10% / 90%
- 运行时间：每周一到周六 22:30（Asia/Shanghai）

## 设计文档

- `docs/superpowers/specs/2026-04-25-portfolio-valuation-watch-worker-design.md`

## 本地开发

```bash
npm install
npm run check
npx wrangler dev
```

## 环境变量

敏感信息通过 `.dev.vars` 或 Cloudflare secrets 注入；不要提交到公开仓库。

参见：
- `.dev.vars.example`
- `wrangler.jsonc`
