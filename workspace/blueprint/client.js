// The page's channel back to its blueprint: the only API a blueprint's own HTML
// needs. It is served at /bp/<slug>/bp.js (/bp-dev/<slug>/bp.js for a dev page), injected into every blueprint page, and
// finds its own address from the script tag it was loaded by.
//
// Five calls, because that is the whole of what a page does: it says something
// happened (emit), it draws a table (watch), it listens (on), it asks the database
// for something a table cannot answer (sql), and it reloads the blueprint
// (reload) — the only way a change to the file takes effect.
//
// It also puts a reload button in the page's corner: a blueprint is reloaded by
// asking for it, and the button is where a person asks.
(function () {
  var here = document.currentScript && document.currentScript.src;
  var BASE = here ? here.replace(/\/bp\.js.*$/, "") : "";
  var DEV = /\/bp-dev\//.test(BASE);

  var handlers = Object.create(null); // event type -> [callback]
  var watchers = Object.create(null); // table -> [callback]
  var source = null;

  function open() {
    if (source || !BASE || typeof EventSource === "undefined") return;
    source = new EventSource(BASE + "/events");
    source.onmessage = function (frame) {
      var msg;
      try {
        msg = JSON.parse(frame.data);
      } catch (e) {
        return;
      }
      if (msg.op === "event") {
        var list = handlers[msg.type] || [];
        for (var i = 0; i < list.length; i++) {
          try {
            list[i](msg.data, msg);
          } catch (err) {
            console.error(err);
          }
        }
        return;
      }
      if (msg.op === "change") {
        var cbs = watchers[msg.table] || [];
        for (var j = 0; j < cbs.length; j++) {
          try {
            cbs[j](msg.rows);
          } catch (err) {
            console.error(err);
          }
        }
      }
    };
    // EventSource reconnects on its own; a page that was reloaded gets a new one
    // anyway, because a page open is what (re)loads the runtime.
  }

  function op(payload) {
    return fetch(BASE + "/op", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok || body.error) throw new Error(body.error || "blueprint: " + res.status);
        return body;
      });
    });
  }

  function add(map, key, cb) {
    (map[key] = map[key] || []).push(cb);
    return function () {
      map[key] = (map[key] || []).filter(function (item) {
        return item !== cb;
      });
    };
  }

  window.bp = {
    // An event on the blueprint's bus: flows that listen for `type` start now.
    emit: function (type, data) {
      return op({ op: "emit", type: type, data: data });
    },

    // Listen to the bus. Filters by type on this side: the stream carries every
    // event the blueprint produces, including its own emits and script logs.
    on: function (type, cb) {
      var off = add(handlers, type, cb);
      open();
      return off;
    },

    // Draw a table. The callback is called once with the current rows and again,
    // with the whole table, after every write to it.
    watch: function (table, cb) {
      var off = add(watchers, table, cb);
      open();
      op({ op: "watch", table: table }).then(function (body) {
        cb(body.rows || []);
      });
      return off;
    },

    // Anything a watch cannot express. A read answers with rows; a write answers
    // with {ok:true} and pushes the change to every watcher.
    sql: function (sql, params) {
      return op({ op: "sql", sql: sql, params: params }).then(function (body) {
        return body.rows || [];
      });
    },

    // Reload the blueprint from its file: the init script is killed, the file is
    // parsed, its schema applied, and it starts over. The page then reloads itself,
    // because the runtime it was talking to is gone.
    reload: function () {
      return op({ op: DEV ? "restart" : "reload" }).then(function (body) {
        location.reload();
        return body;
      });
    },

    // "prod" or "dev", from the address this page was served at.
    mode: DEV ? "dev" : "prod",
  };

  // The reload button. Low-key on purpose: it lives in the corner of every
  // blueprint page because no page would think to add it itself.
  function button() {
    if (!document.body) return;
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = DEV ? "restart" : "reload";
    b.title = DEV
      ? "restart this blueprint on the dev database"
      : "reload this blueprint from its file";
    b.style.cssText = [
      "position:fixed", "right:14px", "bottom:14px", "z-index:2147483647",
      "font:12px/1 -apple-system,system-ui,sans-serif", "padding:7px 11px",
      "border-radius:14px", "border:1px solid rgba(0,0,0,.18)",
      "background:rgba(255,255,255,.92)", "color:#444", "cursor:pointer",
      "box-shadow:0 1px 4px rgba(0,0,0,.12)", "opacity:.75",
    ].join(";");
    b.onmouseenter = function () { b.style.opacity = "1"; };
    b.onmouseleave = function () { b.style.opacity = ".75"; };
    b.onclick = function () {
      b.disabled = true;
      b.textContent = DEV ? "restarting…" : "reloading…";
      window.bp.reload().catch(function (err) {
        b.disabled = false;
        b.textContent = String(err.message || err);
        b.style.color = "#b00";
      });
    };
    document.body.appendChild(b);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", button);
  } else {
    button();
  }
})();