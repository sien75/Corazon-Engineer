const http = require("http");
const fs = require("fs");
const path = require("path");

// args: [port] [--root <dir>] [--static <url>] [--ai <url>] [--log <url>]
// --root defaults to the script's own directory; it matters when compiled
// (bun build --compile) and assets live elsewhere. The three *-url flags are
// the runtime addresses the frontend should call; they are handed down by the
// launcher (which owns port selection) and served back as /config.js.
const args = process.argv.slice(2);
let root = __dirname;
let port = 7500;
const runtime = {
  static: "http://localhost:7502",
  ai: "http://localhost:7501",
  log: "http://localhost:7503",
};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--root" && args[i + 1]) root = path.resolve(args[++i]);
  else if (args[i] === "--static" && args[i + 1]) runtime.static = args[++i];
  else if (args[i] === "--ai" && args[i + 1]) runtime.ai = args[++i];
  else if (args[i] === "--log" && args[i + 1]) runtime.log = args[++i];
  else if (/^\d+$/.test(args[i])) port = Number(args[i]);
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/favicon.ico") {
      res.writeHead(404);
      res.end();
      return;
    }
    if (urlPath === "/config.js") {
      res.writeHead(200, { "Content-Type": types[".js"] });
      res.end(`window.CORAZON = ${JSON.stringify(runtime)};\n`);
      return;
    }
    let file = path.join(root, urlPath);
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (urlPath.endsWith("/")) file = path.join(file, "index.html");
    fs.readFile(file, (err, data) => {
      if (err) {
        fs.readFile(path.join(root, "index.html"), (e2, html) => {
          if (e2) {
            res.writeHead(404);
            res.end("not found");
            return;
          }
          res.writeHead(200, { "Content-Type": types[".html"] });
          res.end(html);
        });
        return;
      }
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(port, () => console.log(`corazon web: http://localhost:${port}`));
