# Test: core-docs-gen

`how-to/deploy/gen-docs.ts <project> <out>` 生成接口文档：

- 输入：`<project>/structure/atoms/*.yaml`（接口的 `id` / `path` / `method`）、
  `<project>/structure/contracts/<id>.yaml`（说明 / 请求 / 响应 / 错误）；
- 输出：每个接口一个 `<out>/<id>.md`。**`README.md` 不由它生成**（总述由人 / agent 维护），
  它只检查 README 是否列全了所有接口；
- 每次运行先清掉上一次生成的 `.md`（`README.md` 除外），再重写，并打印这次**新增 / 删除 / 变化**了哪些接口，
  用来据此修订 README。

用例钉住：

- 每个 contract 都有对应的 `<id>.md`，没有多余文件，`README.md` 原样保留；
- 再跑一次没有任何变化；改一个 contract 后报告里只有它是 `changed`；
- 接口文件里有 `METHOD path`、请求、响应、错误；
- 不一致就失败（非零退出并点出名字）：contract 没有 atom 提供、atom 的接口没有 contract、
  README 漏列了接口、README 链到不存在的接口；
- 仓库里提交的 `structure/docs` 本身是最新的（生成一次后 `git diff` 为空）。

不需要服务，也不需要模型。

## Setup

```bash
ROOTDIR="$PWD"
W="$ROOTDIR/.engineer/.docs-gen"
rm -rf "$W" && mkdir -p "$W/structure"
cp -R structure/atoms structure/contracts structure/docs "$W/structure/"
```

## 1. 生成：一个 contract 一个文件，README 原样

```bash
cp "$W/structure/docs/README.md" "$W/README.before"
bun how-to/deploy/gen-docs.ts "$W" "$W/structure/docs"; echo "exit=$?"
ls structure/contracts | sed 's/\.yaml$//' | sort > "$W/contracts"
ls "$W/structure/docs" | grep -v '^README.md$' | sed 's/\.md$//' | sort > "$W/files"
diff "$W/contracts" "$W/files" && echo SAME
diff "$W/README.before" "$W/structure/docs/README.md" && echo README_UNTOUCHED
```

Expected: `exit=0`；输出里没有 `added` / `removed` / `changed`（拷过来的本来就是最新的）；`SAME`；`README_UNTOUCHED`。

## 2. 报告变化

```bash
rm "$W/structure/docs/log-session-on.md"
echo "stale" > "$W/structure/docs/old-interface.md"
sed -i.bak 's/^description: Close sessions/description: Close some sessions/' "$W/structure/contracts/log-session-off.yaml"
bun how-to/deploy/gen-docs.ts "$W" "$W/structure/docs"; echo "exit=$?"
ls "$W/structure/docs/old-interface.md" 2>&1 | head -1
```

Expected: `exit=0`；输出 `added: log-session-on`、`removed: old-interface`、`changed: log-session-off`（改了 contract 的描述）、没有别的；`old-interface.md` 已不存在。
再跑一次：没有任何变化行。

## 3. 接口文件的内容

```bash
cat "$W/structure/docs/log-session-on.md"
head -1 "$W/structure/docs/ai-new.md" "$W/structure/docs/ai-blobs.md" "$W/structure/docs/log-workspace-stream.md"
```

Expected: `log-session-on.md` 含标题 `POST /log/session/on`、说明、请求里的 `sessionIds` / `index`、
响应里的 `openSessions`、错误里的 `400`；`ai-new.md` 首行 `POST /ai/new`；`ai-blobs.md` 首行 `GET /blobs/{sha256}`；`log-workspace-stream.md` 首行 `POST /log/workspace/stream`。

## 4. 不一致就失败

```bash
cp -R "$W/structure" "$W/bad" 2>/dev/null; B="$W/bad"
# a contract nothing provides
cp structure/contracts/log-session-on.yaml "$B/contracts/orphan-contract.yaml"
sed -i.bak 's/^id: log-session-on/id: orphan-contract/' "$B/contracts/orphan-contract.yaml"
mkdir -p "$W/p1" && cp -R "$B" "$W/p1/structure"
bun how-to/deploy/gen-docs.ts "$W/p1" "$W/p1/structure/docs" 2>&1 | tail -2; echo "exit=${PIPESTATUS[0]}"
# an interface without a contract
mkdir -p "$W/p2" && cp -R "$W/structure" "$W/p2/structure" && rm "$W/p2/structure/contracts/log-session-off.yaml"
bun how-to/deploy/gen-docs.ts "$W/p2" "$W/p2/structure/docs" 2>&1 | tail -2; echo "exit=${PIPESTATUS[0]}"
# README misses an interface
mkdir -p "$W/p3" && cp -R "$W/structure" "$W/p3/structure"
sed -i.bak '/(log-session-off.md)/d' "$W/p3/structure/docs/README.md"
bun how-to/deploy/gen-docs.ts "$W/p3" "$W/p3/structure/docs" 2>&1 | tail -2; echo "exit=${PIPESTATUS[0]}"
# README links something that is not an interface
mkdir -p "$W/p4" && cp -R "$W/structure" "$W/p4/structure"
printf '%s\n' '- [ghost](ghost.md)' >> "$W/p4/structure/docs/README.md"
bun how-to/deploy/gen-docs.ts "$W/p4" "$W/p4/structure/docs" 2>&1 | tail -2; echo "exit=${PIPESTATUS[0]}"
```

Expected: 四次都非零退出；输出里分别有 `orphan-contract`、`log-session-off`（没有 contract）、
`README.md does not list log-session-off`、`README.md links ghost`。

## 5. 仓库里提交的 docs 是最新的

```bash
bun how-to/deploy/gen-docs.ts . structure/docs; echo "exit=$?"
```

Expected: `exit=0`，输出只有 `gen-docs: 35 interfaces -> …` 一行，没有 `added` / `removed` / `changed`
（提交的 docs 与 contracts 一致；有变化行就说明有人改了 contract 没重新生成）。

## Teardown

```bash
rm -rf "$W"
```
