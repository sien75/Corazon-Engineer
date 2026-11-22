# Test: core-blueprint-init

蓝图里唯一能发事件的是 **init 脚本**（`<script type="blueprint/init.js">`，至多一个，没有 `id`）：
它跟着运行时起，不是跟着页面起；它的 stdout 每行是一个事件 `{"emit":…,"data":…}`，以
`source: init` 上总线；不是事件的行走 `log`。它没有超时（长驻就是它的用途），崩溃只记一条 log、
不自动重启；重启/刷新时先杀掉旧进程再起新的 —— 否则监听会变成两份。

这一条用例验证：没人打开页面 prod 也在跑、init 的事件能驱动 flow 写库、非 JSON 行走 log、
进程被杀后不残留、重载后速率不变（不翻倍）。

Source of truth：`workspace/blueprint/`（`parse.go` 识别 init、`exec.go` 起停与读 stdout、
`runtime.go` 的 emit 与 op）。

## Setup

前置：Go、Bun 在 `PATH` 上。

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.blueprint-init-test"
HOME_DIR="$ROOT/home"
BPS="$ROOT/blueprints"
rm -rf "$ROOT" && mkdir -p "$HOME_DIR" "$BPS"

: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-storage --home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-blueprint.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8970 8971 8972; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

printf 'projects:\n  - id: demo\n    path: %s\nforeground: demo\n' "$BPS" >"$HOME_DIR/config.yaml"

cat >"$BPS/listen.html" <<'HTML'
<!doctype html>
<title>Listener</title>
<meta id="test.init">

<script type="blueprint/sql">
CREATE TABLE IF NOT EXISTS ticks (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT);
</script>

<script type="blueprint/flow">
  - on: sys.tick
    steps:
      - sql: INSERT INTO ticks(at) VALUES(:at)
        with:
          at: ${{ event.data.at }}
</script>

<script type="blueprint/init.js">
const timer = setInterval(() => {
  console.log(JSON.stringify({ emit: "sys.tick", data: { at: new Date().toISOString() } }));
}, 400);
// a line that is not an event is a log line, not an error
setInterval(() => console.log("init: listening on nothing in particular"), 900);
export default async () => await new Promise(() => {});
</script>

<body><p>listener</p></body>
HTML

# an init that dies at once: it must be logged and not restarted
cat >"$BPS/crash.html" <<'HTML'
<!doctype html>
<title>Crash</title>
<meta id="test.crash">
<script type="blueprint/init.js">
// 3 秒后才崩：reload 会把订阅旧运行时的流关掉，所以要先 reload 再订阅，
// 这个延迟就是留给"订阅赶得上崩溃"的窗口
await new Promise((r) => setTimeout(r, 3000));
throw new Error("init gave up");
</script>
<body><p>crash</p></body>
HTML

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-storage --home "$HOME_DIR" --bind 127.0.0.1 --port 8971 >/tmp/init-storage.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8971/log/session/list -d 'pageNum: 1' && break
  sleep 1
done

(cd workspace/ai && exec nohup bun src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 8970 --stub \
  --storage http://localhost:8971 >/tmp/init-ai.log 2>&1 </dev/null) &
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8970/ai/new -d 'cwd: /tmp' && break
  sleep 1
done

# no --blueprints: the folder comes from the data home's config.yaml
/tmp/engineer serve-blueprint --bind 127.0.0.1 --port 8972 \
  --agents "$ROOTDIR/agents" \
  --engineer-home "$ROOTDIR" \
  --home "$HOME_DIR" \
  --cwd "$ROOTDIR" \
  --storage http://localhost:8971 --ai http://localhost:8970 \
  >/tmp/init-blueprint.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 http://localhost:8972/bp && break
  sleep 1
done
sleep 2
```

Expected：蓝图画好了、服务起来了。

## Run

### 1. 没人打开页面，prod 的 init 也在跑（curl + sqlite）

```bash
BASE=http://localhost:8972
DB="$HOME_DIR/projects/demo/blueprints/test.init.prod.sqlite"

# 从头到尾没有请求过 /bp/demo/listen
rows() { python3 -c "import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute('select count(*) from ticks').fetchone()[0])" "$DB"; }
rows
# → 大于 0：init 的事件驱动 flow 写了库
```

### 2. init 的事件在总线上，source 是 init；非 JSON 行是 log（curl）

事件流只推**订阅之后**的事件（没有历史回放），所以这里先订阅，再看。

```bash
curl -s -N --max-time 5 "$BASE/bp/demo/listen/events" >/tmp/init-events.txt || true
grep -o '"source":"init"' /tmp/init-events.txt | head -1
# → "source":"init"
grep -o 'init: listening on nothing in particular' /tmp/init-events.txt | head -1
# → 那行不是 JSON，被当成 log
grep -c 'script:init' /tmp/init-events.txt
```

### 3. 只有一个 init 进程（pgrep）

```bash
pgrep -f "$HOME_DIR/projects/demo/.work/test.init.prod/" | wc -l
# → 1
```

### 4. 重载：旧进程被杀，速率不翻倍（curl + sqlite）

```bash
OLD=$(pgrep -f "$HOME_DIR/projects/demo/.work/test.init.prod/" | head -1)
rate() { a=$(rows); sleep 3; b=$(rows); echo $((b-a)); }
BEFORE=$(rate)                       # 3 秒内新增的行数（约 7~8）
curl -s -X POST "$BASE/bp/demo/listen/op" -d '{"op":"reload"}'
# → {"ok":true,"reloaded":true,...}
sleep 1
NEW=$(pgrep -f "$HOME_DIR/projects/demo/.work/test.init.prod/" | head -1)
[ "$OLD" != "$NEW" ] && echo "pid changed: $OLD -> $NEW"
pgrep -f "$HOME_DIR/projects/demo/.work/test.init.prod/" | wc -l
# → 1（旧进程没留下）
AFTER=$(rate)
echo "before=$BEFORE after=$AFTER"
# → after 与 before 同一量级，不是两倍
```

### 5. 崩溃的 init：一条 log，不重启（curl）

先 reload 再订阅 —— reload 会换掉运行时，旧的流随之关闭；崩溃放在 3 秒之后，订阅来得及。

```bash
curl -s -X POST "$BASE/bp/demo/crash/op" -d '{"op":"reload"}'
sleep 1
curl -s -N --max-time 6 "$BASE/bp/demo/crash/events" >/tmp/crash-events.txt || true
grep -o 'init script exited' /tmp/crash-events.txt | head -1
# → 一条 log
sleep 2
pgrep -f "$HOME_DIR/projects/demo/.work/test.crash.prod/" | wc -l
# → 0（没有自动重启）
curl -s -N --max-time 2 "$BASE/bp/demo/crash/events" | grep -c 'init script exited'
# → 0（也没有再来一遍）
```

## Teardown

```bash
pkill -f "serve-storage --home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-blueprint.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "$HOME_DIR/blueprints/.work" 2>/dev/null || true
for p in 8970 8972; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
rm -rf "$ROOT"
```