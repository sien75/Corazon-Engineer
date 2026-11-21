// The page's channel back to its blueprint: the only API a blueprint's own HTML
// needs. It is served at /b/<slug>/bp.js, injected into every blueprint page, and
// finds its own address from the script tag it was loaded by.
//
// Four calls, because that is the whole of what a page does: it says something
// happened (emit), it draws a table (watch), it listens (on), and it asks the
// database for something a table cannot answer (sql).
(function () {
  var here = document.currentScript && document.currentScript.src;
  var BASE = here ? here.replace(/\/bp\.js.*$/, "") : "";

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
  };
})();