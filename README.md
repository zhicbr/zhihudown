# 知乎下载器

油猴脚本：在知乎回答 / 文章 / 想法上复制为 Markdown，或连同图片、视频打成 zip。本仓库在上游停更后还原了 TypeScript 源码，并加上评论下载。

基于 [Howardzhangdqs/zhihu-copy-as-markdown](https://github.com/Howardzhangdqs/zhihu-copy-as-markdown)（MIT）。原脚本：[Greasy Fork 478608](https://greasyfork.org/zh-CN/scripts/478608)。

## 能做什么

- 每个回答、想法、文章左上角：`复制为Markdown`、`下载全文为Zip`
- 问题标题上：`批量下载`（当前页已加载的回答打成一个 zip）
- Zip 含 `index.md`、`info.json`、`assets/` 素材，以及 `comments.md`（一级评论 + 楼中楼）
- 复制 Markdown 时，正文后会追加评论

拉取评论时页面顶部有进度条。请在已登录的知乎页使用；只给自己平时看到的内容做备份即可。

改代码请编辑 `src/`，不要改 `code.js`（那是压缩后的旧快照）。

## 开发

```bash
pnpm i
pnpm bundle
```

`dist/tampermonkey-script.js` 复制进 Tampermonkey。若已安装原版 Greasy Fork 脚本，用这份覆盖本地那条，并关掉自动更新，避免被线上旧版盖回去。

```bash
pnpm dev     # 用 test/ 里的旧页面做本地调试
pnpm build   # 会把 package.json 版本号 +1，日常打包请用 bundle
```

## 原理

1. 找到页面里的富文本 `DOM`
2. `src/core/lexer.ts` 转成 Lex，`src/core/parser.ts` 转成 Markdown
3. 点击导出时再请求知乎评论接口（失败则解析已展开的评论区）

## 致谢

- 原作者 [HowardZhangdqs](https://github.com/Howardzhangdqs)
- 后续社区实现可参考 [zhihu-backup-collect](https://github.com/qtqz/zhihu-backup-collect)
