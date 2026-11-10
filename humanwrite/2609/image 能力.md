# image 能力

## 目标

- web 端支持图片，无需 CDN / 对象存储：图片 base64 内联进请求，服务端落本地。
- 输入方式只做**粘贴**：不加上传按钮，粘贴图片即在光标处插入 `[image]` 位置标记。
- 图片进 pi 时转 base64；磁盘只存原始字节，`[image]` 作为文本里的位置标记。

## 一、交互（web）

- 输入框监听 `paste`，剪贴板里有 `image/*` 时拦截，压缩后插入字面量 `[image]`。
- `[image]` 是位置标记：发送时按它切分文本，token 与图片按顺序配对，因此**文本 / 图片可混排**。
- `[image]` 在输入框里是**原子 token**：光标不能进入其内部，Backspace/Delete 整体删除（删除 token 时同步移除对应图片），选中也不会切到一半。
- 压缩在前端做（`canvas`，长边 ≤ 1568，PNG 保留、其余 JPEG q0.85），保证上传体积、落盘字节、喂给模型的字节三者一致。
- 用户气泡按 blocks 渲染（显示真实图片，不显示 `[image]` 字面量）；历史复原时图片走 `/blobs/<sha>`。

## 二、数据模型

有序 blocks 是真相源；`content` 是扁平投影，图片占位为 `[image]`：

```yaml
content: 看这张 [image] 再对比 [image]
blocks:
  - { type: text,  text: "看这张 " }
  - { type: image, sha256: 9f2c..., mimeType: image/png, size: 183422 }
  - { type: text,  text: " 再对比 " }
  - { type: image, sha256: a1b2..., mimeType: image/png, size: 204817 }
```

- 旧数据无 `blocks`：读取端回退 `[{ type: text, text: content }]`，保持兼容。
- 前端有图片时消费 `blocks`，不消费 `content`；`content` 只给预览 / 搜索用。

## 三、存储

- 目录：`.corazon/uploads/<sha256>.<ext>`（内容寻址，同名去重，tmp + rename 原子写）。
- 只存原始字节，不存 base64；`sha256` / `mimeType` / `size` 记进 blocks。
- 实现：`workspace/ai/src/blobs.ts`。

## 四、接口

`POST /ai/ask`（替换原 `prompt` + `images`）：

```yaml
id: s_ab12
blocks:
  - { type: text,  text: "看这张 " }
  - { type: image, data: "<base64>", mimeType: image/png }
  - { type: text,  text: " 再对比" }
```

- 服务端遍历 blocks：text 拼接进 `content`，image 落盘后换成 `sha256` 引用。
- `GET /blobs/<sha256>`：返回图片字节，`Cache-Control: immutable`（内容寻址，可长缓存）。

## 五、喂给 pi

- pi 的 `prompt(text, { images })` 固定「先文本后图片」，**不支持图文交错**。
- 因此文本直接带 `[image]` 标记、图片按序附在 `prompt` 之后；模型靠文本里的标记与图片顺序对齐。
- resume 时按 `blocks` 的 `sha256` 读文件转 base64，重建 `ImageContent`：`{ type: image, data, mimeType }`。
- 注意：`prompt({ images })` **不会**压缩；压缩必须在前端完成。

## 六、sqlite（log 服务）

- 表结构不变（`records`，`payload` 为 YAML TEXT），只是 conversation 的 payload 多一个 `blocks` 字段。
- `content` 保留，继续服务 `ListSessions` 预览与 `Search`。
- `store.go` 的 `SessionMessages` 解析 `blocks` 一并返回；`log/session-detail` 原样带出。
- 不建 blob 表：图片元数据在 payload 里，文件在 `.corazon/uploads`，量小无需额外索引。真要按图查 / 级联清理时再加。

## 七、pi 的视觉能力声明（踩坑）

- pi 的 `openai-completions` 适配器只在该模型 `input` 含 `"image"` 时才发送图片，否则**静默丢弃**（`pi-ai: openai-completions.js`）。
- pi 自带模型目录把 `deepseek-flash` 标成 `input: ["text"]`，但 DeepSeek 文档明确 `deepseek-flash` 支持 Vision。
- 处理：`registry.ts` 的 `patchVisionCapability()` 在解析出模型后，给 `deepseek-flash` 补上 `"image"`。
- 若换用其它目录声明有误的视觉模型，同样在这里补声明。

## 八、遗留

- 删除会话不清理 `.corazon/uploads` 里的文件（无引用计数）。
- 手动输入 `[image]` 但没有对应图片时，token 会被忽略。
