# PDF小助手

轻量 PDF 页面处理工具。电脑浏览器、手机浏览器、微信内置浏览器都可以用。文件在本地处理，不上传服务器。

核心理念：不用打开 WPS，几秒钟把 PDF 改好。

## 怎么用

```bash
npm install
npm run dev
```

浏览器打开提示的本地地址。手机和电脑访问同一套页面。

```bash
npm run build
npm run preview
```

静态资源可部署到任意静态托管（Nginx、Cloudflare Pages、GitHub Pages、对象存储）。

## 已实现（真实 PDF 操作）

- 上传 / 拖入 PDF
- 合并多个 PDF
- 页面预览（pdf.js 真实渲染）
- 删除、旋转、拖拽调整顺序
- 添加图片页（contain / cover / original，默认 contain，不拉伸变形）
- 添加另一个 PDF 的指定页（全选 / 多选，插到当前页前或后）
- 添加空白页（当前页尺寸，纵向 / 横向）
- 手写签名、添加文字，可移动、缩放、删除
- 撤销 / 重做
- 导出新的 PDF

## 尚未实现

- 网页转 PDF：需要后端 Playwright / Chromium，前端不能完整渲染任意网页
- 修改 PDF 里原有文字
- 广告解锁 / 付费：只预留了 `src/core/quota.ts` 接口，第一阶段不接广告

## 技术

| 端 | 方案 |
| --- | --- |
| 电脑 / 手机浏览器 / 微信里打开链接 | Vite + React，本仓库 `src/` |
| 微信小程序正式上架 | `miniprogram/` 原生壳，后续把同一套 PDF 引擎接进去 |

PDF 修改用 `pdf-lib`，预览用 `pdf.js`。不要从零解析 PDF。

## 微信小程序

`miniprogram/` 是原生小程序脚手架，可用微信开发者工具打开本仓库。小程序审核和 appid 需要你自己的微信账号。多端日常使用以 Web 为准，不依赖微信审核也能先上线。
