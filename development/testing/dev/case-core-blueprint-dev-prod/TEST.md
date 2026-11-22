# Test: core-blueprint-dev-prod

蓝图住在**项目**里：一个项目就是一个导入的蓝图目录。导入即运行（prod 载入、建表、起 init），
之后在不在前台都在跑；角落的切换按钮只决定 `/bp` 列哪个项目。删掉项目才停，而目录和库都留在原处。

**使用**和**开发**也是分开的：`/bp/<project>/<slug>` 是 prod，`/bp-dev/<project>/<slug>` 是 dev，
两个库；都不因文件改动而重载，只有页面上的刷新 / 重启按钮重载。

地址带项目，是因为 slug 只在目录内唯一：两个项目里各有一个 `counter.html` 时，它们必须是两个页面、
两份数据。

Source of truth：`workspace/blueprint/project.go`（项目表、导入/删除/前台）、`serve.go`（路由、
`/config/projects`）、`runtime.go`（每个项目一套 prod/dev 注册表）、`store.go`（库落在项目目录下）、
`shell/app.js`（选目录对话框 + 切换菜单）。

## Setup

前置：Go、Bun、`ego-browser` 在 `PATH` 上。

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.blueprint-modes-test"
HOME_DIR="$ROOT/home"
A="$ROOT/a"      # 第一个项目目录
B="$ROOT/b"      # 第二个项目目录
rm -rf "$ROOT" && mkdir -p "$HOME_DIR" "$A" "$B"
export HOME_DIR A B

: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-storage --home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-blueprint.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8980 8981 8982; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

# 两个项目里各一个同名 counter.html，<meta id> 也故意相同：库必须按项目分开
for dir in "$A" "$B"; do
cat >"$dir/counter.html" <<'HTML'
<!doctype html>
<title>Counter</title>
<meta id="test.counter">

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
export default async () => await new Promise(() => {});
</script>

<body><p>counter</p></body>
HTML
done

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-storage --home "$HOME_DIR" --bind 127.0.0.1 --port 8981 >/tmp/modes-storage.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8981/log/session/list -d 'pageNum: 1' && break
  sleep 1
done

(cd workspace/ai && exec nohup bun src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 8980 --stub \
  --storage http://localhost:8981 >/tmp/modes-ai.log 2>&1 </dev/null) &
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8980/ai/new -d 'cwd: /tmp' && break
  sleep 1
done

start_blueprint() {
  /tmp/engineer serve-blueprint --bind 127.0.0.1 --port 8982 \
    --agents "$ROOTDIR/agents" \
    --engineer-home "$ROOTDIR" \
    --home "$HOME_DIR" \
    --cwd "$ROOTDIR" \
    --storage http://localhost:8981 --ai http://localhost:8980 \
    >>/tmp/modes-blueprint.log 2>&1 &
  for i in $(seq 1 30); do if curl -s -o /dev/null -m 2 http://localhost:8982/bp; then break; fi; sleep 1; done
}
: >/tmp/modes-blueprint.log
start_blueprint          # 注意：没有 config.yaml —— 没有任何项目
```

## Run

### 1. 没有项目：什么都加载不了（curl）

```bash
BASE=http://localhost:8982
curl -s "$BASE/config/projects"
# → {"foreground":"","projects":null}
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/bp/anything/counter"
# → 404
curl -s "$BASE/bp" | grep -o "no project imported yet"
grep -o "no project yet" /tmp/modes-blueprint.log
```

### 2. 导入一个目录：立刻开始跑（curl + sqlite）

```bash
curl -s -X POST "$BASE/config/projects" -H 'Content-Type: application/json' -d "{\"path\":\"$A\"}"
# → {"id":"a","path":".../a"} —— id 取目录名
cat "$HOME_DIR/config.yaml"
# → projects: [...id: a, path: .../a] + foreground: a
curl -s "$BASE/config/projects"
curl -s "$BASE/bp" | grep -c 'href="/bp/a/counter"'
# → 1

相对路径、以及把文件当目录，都要被拒
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/config/projects" -H 'Content-Type: application/json' -d '{"path":"relative/path"}'
# → 400
touch /tmp/not-a-folder-e2e
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/config/projects" -H 'Content-Type: application/json' -d "{\"path\":\"/tmp/not-a-folder-e2e\"}"
# → 400
rm -f /tmp/not-a-folder-e2e

# 重复导入同一个目录 = 幂等
curl -s -X POST "$BASE/config/projects" -H 'Content-Type: application/json' -d "{\"path\":\"$A\"}"

# 不打开任何页面，prod 已经在跑（导入即运行）
sleep 2
python3 -c "import sqlite3;print(sqlite3.connect('$HOME_DIR/projects/a/blueprints/test.counter.prod.sqlite').execute('select count(*) from ticks').fetchone()[0])"
# → 大于 0
```

### 3. 第二个项目、同名 slug、同一份 `<meta id>`：数据互不相干（curl + sqlite）

```bash
curl -s -X POST "$BASE/config/projects" -H 'Content-Type: application/json' -d "{\"path\":\"$B\"}"
# → {"id":"b", ...}
sleep 2

# 前台还是 a，但两个项目的 init 都在跑
pgrep -f "$HOME_DIR/projects/a/.work/test.counter.prod/" | wc -l   # → 1
pgrep -f "$HOME_DIR/projects/b/.work/test.counter.prod/" | wc -l   # → 1

python3 - <<'PY'
import os, sqlite3
home = os.environ["HOME_DIR"]
for p in ("a", "b"):
    n = sqlite3.connect(f"{home}/projects/{p}/blueprints/test.counter.prod.sqlite").execute("select count(*) from ticks").fetchone()[0]
    print(p, n)
PY
# → 两行都大于 0，各自的行只在自己的库里

# 两个页面都在、都是各自己的项目
curl -s -o /dev/null -w "a:%{http_code} " "$BASE/bp/a/counter"
curl -s -o /dev/null -w "b:%{http_code}\n" "$BASE/bp/b/counter"
# → a:200 b:200
# 没导入的项目 id → 404
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/bp/zzz/counter"
# → 404
```

### 4. 切前台：只换视图，不启不停（curl + pgrep）

```bash
PIDS_A=$(pgrep -f "$HOME_DIR/projects/a/.work/test.counter.prod/" | sort | tr '\n' ' ')
PIDS_B=$(pgrep -f "$HOME_DIR/projects/b/.work/test.counter.prod/" | sort | tr '\n' ' ')

curl -s -X POST "$BASE/config/projects/foreground" -H 'Content-Type: application/json' -d '{"id":"b"}'
# → foreground: b
curl -s "$BASE/bp" | grep -c 'href="/bp/b/counter"'
# → 1（列表换成前台的）
curl -s "$BASE/config/projects" | grep -o 'foreground: b'

[ "$PIDS_A" = "$(pgrep -f "$HOME_DIR/projects/a/.work/test.counter.prod/" | sort | tr '\n' ' ')" ] && echo "a untouched"
[ "$PIDS_B" = "$(pgrep -f "$HOME_DIR/projects/b/.work/test.counter.prod/" | sort | tr '\n' ' ')" ] && echo "b untouched"

# 不存在的项目 → 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/config/projects/foreground" -H 'Content-Type: application/json' -d '{"id":"zzz"}'
# → 400
```

### 5. dev 只在打开时加载，库是另一份（curl + sqlite）

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/bp-dev/a/counter"
# → 200
sleep 2
ls "$HOME_DIR/projects/a/blueprints/" | grep -o 'test.counter.dev.sqlite' | head -1
python3 - <<'PY'
import os, sqlite3
home = os.environ["HOME_DIR"]
prod = sqlite3.connect(f"{home}/projects/a/blueprints/test.counter.prod.sqlite").execute("select count(*) from ticks").fetchone()[0]
dev = sqlite3.connect(f"{home}/projects/a/blueprints/test.counter.dev.sqlite").execute("select count(*) from ticks").fetchone()[0]
print("a prod", prod, "a dev", dev)
PY
# → 两个都大于 0，数值互不相干
```

### 6. 打开页面不重载；只有 reload / restart 重载（curl + pgrep）

```bash
pidof() { pgrep -f "$HOME_DIR/projects/$1/.work/test.counter.$2/" | head -1; }
P1=$(pidof a prod)
curl -s -o /dev/null "$BASE/bp/a/counter"; curl -s -o /dev/null "$BASE/bp/a/counter"
[ "$P1" = "$(pidof a prod)" ] && echo "prod init untouched by page opens: $P1"

D1=$(pidof a dev)
curl -s -o /dev/null "$BASE/bp-dev/a/counter"
[ "$D1" = "$(pidof a dev)" ] && echo "dev init untouched by page opens: $D1"

# 改文件不重载
python3 - <<'PY'
import os
p = os.environ["A"] + "/counter.html"
s = open(p).read()                       # read first: opening "w" truncates
open(p, "w").write(s.replace("<p>counter</p>", "<p>counter reloaded</p>"))
PY
curl -s "$BASE/bp/a/counter" | grep -c 'counter reloaded'
# → 0

curl -s -X POST "$BASE/bp/a/counter/op" -d '{"op":"reload"}'
# → {"ok":true,"reloaded":true,"mode":"prod"}
curl -s "$BASE/bp/a/counter" | grep -c 'counter reloaded'
# → 1

curl -s -X POST "$BASE/bp-dev/a/counter/op" -d '{"op":"restart"}'
# → {"mode":"dev","ok":true,"reloaded":true}
pgrep -f "$HOME_DIR/projects/a/.work/test.counter.dev/" | wc -l
# → 1

# 坏文件重载：500，旧运行时还在
cp "$A/counter.html" /tmp/counter.good
printf '<!doctype html><title>Broken</title><body>x</body>\n' >"$A/counter.html"
curl -s -o /tmp/reload-error.json -w "%{http_code}\n" -X POST "$BASE/bp/a/counter/op" -d '{"op":"reload"}'
# → 500，回答是 JSON（{error:…}），不是错误页
grep -o 'meta id' /tmp/reload-error.json | head -1
curl -s "$BASE/bp/a/counter" | grep -c 'counter reloaded'
# → 1：老运行时还在伺服
cp /tmp/counter.good "$A/counter.html"
curl -s -X POST "$BASE/bp/a/counter/op" -d '{"op":"reload"}' >/dev/null
```

### 7. 删项目：停掉它，别的不动（curl + pgrep + sqlite）

```bash
curl -s -X DELETE "$BASE/config/projects?id=b"
# → projects 里没有 b 了；删的是前台时，前台落到下一个，否则不变
sleep 1
pgrep -f "$HOME_DIR/projects/b/.work/" | wc -l
# → 0：b 的 init 都没了
[ -d "$B" ] && echo "the folder is still there"
ls "$HOME_DIR/projects/b/blueprints/" | grep -c 'test.counter.prod.sqlite'
# → 1：库也留着
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/bp/b/counter"
# → 404

# a 不受影响
pgrep -f "$HOME_DIR/projects/a/.work/test.counter.prod/" | wc -l
# → 1

# 最后删掉 a：前台变空
curl -s -X DELETE "$BASE/config/projects?id=a"
curl -s "$BASE/config/projects"
# → {"foreground":"","projects":[]}
pgrep -f "$HOME_DIR/projects/a/.work/" | wc -l
# → 0
```

### 8. shell：首次的对话框 + 角落的切换菜单（ego-browser）

分两次跑，因为"导入之后页面自己刷新"正好撞在 ego 的导航生命周期上（`Inspected target navigated or closed`）——
不是应用的问题，是脚本在被导航掉的页面上继续 await。第一次做对话框和导入，第二次（页面已在）做切换菜单。

```bash
BASE=http://localhost:8982
mv "$HOME_DIR/config.yaml" /tmp/cfg.bak 2>/dev/null || true
pkill -f "serve-blueprint.*--home $HOME_DIR"; sleep 1
start_blueprint
```

**第一次：没有项目 → 对话框 → 导入第一个项目**

```bash
ego-browser nodejs <<EOF2
const BASE = "$BASE", A = "$A";
const space = await taskSpace("core-blueprint-dev-prod");
const page = space.page("p1");
const checks = [];
const check = (n, p, i) => checks.push({ name: n, pass: !!p, ...(i ? { info: i } : {}) });
const cfg = async () => (await (await fetch(BASE + "/config/projects")).json());

await page.goto(BASE + "/");
await page.waitForSelector("input[name=\'path\']", { state: "visible", timeout: 20000 });
check("no project: the shell asks for a folder first",
  await page.evaluate(() => !document.querySelector("engineer-chat")));

await page.fill("input[name=\'path\']", "relative/path");
await page.click("button[type=\'submit\']");
await page.waitForFunction(() => (document.querySelector("[data-role=\'error\']")?.textContent || "").length > 0, undefined, { timeout: 15000 });
const err = await page.evaluate(() => document.querySelector("[data-role=\'error\']").textContent);
check("a relative path is refused, in the dialog", /absolute/i.test(err), { err });

await page.fill("input[name=\'path\']", A);
await page.click("button[type=\'submit\']");
await page.waitForFunction(() => !!document.querySelector("engineer-chat"), undefined, { timeout: 30000 });
check("importing the first project draws the conversation", true);
check("the server has the project", (await cfg()).projects.length === 1);
console.log(JSON.stringify({ ok: checks.every((c) => c.pass), checks }, null, 2));
EOF2
```

**第二次：切换菜单（切前台、加第二个项目、删除）**

```bash
ego-browser nodejs <<EOF3
const BASE = "$BASE", B = "$B";
const space = await taskSpace("core-blueprint-dev-prod");
const page = space.page("p1");
const checks = [];
const check = (n, p, i) => checks.push({ name: n, pass: !!p, ...(i ? { info: i } : {}) });
const cfg = async () => (await (await fetch(BASE + "/config/projects")).json());

await page.goto(BASE + "/");
await page.waitForSelector("engineer-chat", { state: "visible", timeout: 30000 });
const bar = await page.evaluate(() => {
  const t = document.getElementById("projects-toggle"), th = document.getElementById("theme-toggle");
  return { name: document.getElementById("projects-name").textContent,
           leftOfTheme: !!(t && th) && t.getBoundingClientRect().right <= th.getBoundingClientRect().left,
           noDialog: !document.querySelector("input[name=\'path\']") };
});
check("the switcher shows the front project", bar.name === "a", bar);
check("the switcher sits left of the theme button", bar.leftOfTheme, bar);
check("no dialog once a project exists", bar.noDialog, bar);

// add folder…
await page.click("#projects-toggle");
check("the menu has add folder…", await page.evaluate(() => !!document.querySelector("#projects-menu .project-add")));
await page.evaluate(() => document.querySelector("#projects-menu .project-add").click());
await page.waitForSelector("input[name=\'path\']", { state: "visible", timeout: 20000 });
await page.fill("input[name=\'path\']", B);
await page.click("button[type=\'submit\']");
await page.waitForFunction(() => !!document.querySelector("engineer-chat"), undefined, { timeout: 30000 });
check("adding a second project works", (await cfg()).projects.length === 2);

// 切换前台
await page.click("#projects-toggle");
const names = await page.evaluate(() => [...document.querySelectorAll("#projects-menu .project-row .project-id")].map(n => n.textContent));
check("both projects are in the menu", names.length === 2, { names });
await page.evaluate(() => {
  [...document.querySelectorAll("#projects-menu .project-row")]
    .find(r => r.querySelector(".project-id").textContent === "b").click();
});
await page.waitForFunction(() => document.getElementById("projects-name").textContent === "b", undefined, { timeout: 15000 });
check("switching the front renames the corner", true);
check("the front is remembered", (await cfg()).foreground === "b");

// 删除（confirm 打桩）
await page.click("#projects-toggle");
await page.evaluate(() => { window.confirm = () => true; });
await page.evaluate(() => {
  [...document.querySelectorAll("#projects-menu .project-row")]
    .find(r => r.querySelector(".project-id").textContent === "b").querySelector(".project-remove").click();
});
let left = await cfg();
for (let i = 0; i < 40 && left.projects.length > 1; i++) { await new Promise(r => setTimeout(r, 250)); left = await cfg(); }
check("removing from the menu drops the project", left.projects.length === 1 && left.foreground === "a", left);

// 菜单重画过：先关再开，否则读到的是关掉之前那份
await page.evaluate(() => { document.getElementById("projects-menu").hidden = true; });
await page.click("#projects-toggle");
const menuAfter = await page.evaluate(() => [...document.querySelectorAll("#projects-menu .project-row .project-id")].map(n => n.textContent));
check("the menu was redrawn without it", menuAfter.length === 1 && menuAfter[0] === "a", { menuAfter });

console.log(JSON.stringify({ ok: checks.every((c) => c.pass), checks }, null, 2));
EOF3
```

Expected：两段都是 `{"ok": true, ...}`。跑过的实际结果是：第一段 4/4、第二段 9/9（最后一项要"先关再开"才读到重画后的菜单）。

## Teardown

```bash
pkill -f "serve-storage --home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-blueprint.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
pkill -f "$HOME_DIR/projects" 2>/dev/null || true
for p in 8980 8982; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
rm -rf "$ROOT"
```