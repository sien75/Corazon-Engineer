# Test: 同源 /blobs 路由

助手的 markdown 图是死文本，读不到 `/config.js`，所以它不能带 host:port。web 在同一个 origin 下
把 ai 的 `/blobs/<sha256>` 透出来，页面里写 `![](/blobs/<sha256>)` 就成立。

## Setup

按 dev BOOK 启动 8500（web）/ 8501（ai）。清除 http_proxy / https_proxy，NO_PROXY 与 no_proxy 为 `*`。

数据家里取一个已存的 blob：

```bash
: "${HOME_DIR:?}"
SHA=$(ls "$HOME_DIR/.engineer/uploads" | head -1 | sed 's/\..*$//')
: "${SHA:?数据家里没有 blob，先让一次生图或粘贴图跑一遍}"
```

## Run

1. 同源取到同一份字节，状态 200：

   ```bash
   curl -s -D /tmp/h1 -o /tmp/b1 http://localhost:8500/blobs/$SHA
   curl -s -o /tmp/b2 http://localhost:8501/blobs/$SHA
   head -1 /tmp/h1          # 期待 HTTP/1.1 200 OK
   cmp /tmp/b1 /tmp/b2      # 期待无输出（字节一致）
   grep -i '^content-type' /tmp/h1   # 期待 image/*
   ```

2. 形状严格跟 ai-blobs 一致：只认裸的 64 位十六进制，带扩展名或第二段都是 404
   （ai 的 `findBlobFile` 就是这么判的，web 不能先替它「答应」）：

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8500/blobs/$SHA.png"   # 期待 404
   ```

3. 缓存头按上游给，不跟 web 的 no-store：

   ```bash
   grep -i '^cache-control' /tmp/h1   # 期待 public, max-age=31536000, immutable
   ```

4. 只读：写方法回 405，且带 `Allow`：

   ```bash
   curl -s -o /dev/null -D - -X POST http://localhost:8500/blobs/$SHA | head -3
   # 期待 405 + Allow: GET, HEAD
   ```

5. 形状不合的路径回 404，且不透传到 ai（越权）：

   ```bash
   for p in "" "a/b" "..%2f..%2fetc/passwd" "zzz"; do
     curl -s -o /dev/null -w "%{http_code} $p\n" "http://localhost:8500/blobs/$p"
   done
   # 期待四条都是 404
   ```

6. 页面里真的画得出来：打开任一 sub 会话，在对话里贴一张本地图（或对 agent 说"把 /blobs/<sha> 画出来"），
   正文里的 md 图应显示；点一下开蒙层。

输出每项 pass 与汇总 ok。

## Teardown

`/tmp/h1 /tmp/b1 /tmp/b2` 删掉；dev 栈保持运行。
