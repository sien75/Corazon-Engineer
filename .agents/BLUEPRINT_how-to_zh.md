# Blueprint 写法

怎么写一个 Blueprint:两个文件、页面的 `<title>`、外壳主题、最小入口模板。

## 只有两个文件

blueprint 就是目录 `.agents/blueprints/<slug>/`,里面只有 `README.md` + `index.html`,不能有别的。多一个文件,实例化就会以 `400 bad_request` 失败。

- `README.md` —— 由这个 Blueprint 实例化出来的 Agent 的**开场上下文**(追加在 system prompt 最后)。写它是给 Agent 看的:这个 Agent 是什么、它的 UI 用来做什么、该怎么驱动它。
- `index.html` —— UI 本身,必须**自包含**:css / js 全部内联,不要同级文件。

## 页面

- 文档的 `<title>` 就是用户看到的名字。
- 副本由 `/agent/<sessionId>/` 提供,与外壳同源,因此页面可以链外壳的样式表、调用各服务。
- 跟随外壳主题:链 `/theme.css`、用它色板里的 `var(--*)` 变量,并在首帧前给 `<html>` 设好 `data-theme`,避免闪出错误配色。

最小入口:

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <title>一个可读的名字</title>
  <script>
    document.documentElement.setAttribute(
      "data-theme", localStorage.getItem("engineer.theme") || "light");
  </script>
  <link rel="stylesheet" href="/theme.css">
  <style>
    body { margin: 0; padding: 24px; font-size: 13px; }
  </style>
</head>
<body>
  ...
</body>
</html>
```
