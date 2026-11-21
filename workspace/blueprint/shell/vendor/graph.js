var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e2) {
    throw mod = 0, e2;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/intersects/circle-point.js
var require_circle_point = __commonJS({
  "node_modules/intersects/circle-point.js"(exports, module) {
    "use strict";
    module.exports = function circlePoint(x1, y1, r1, x2, y2) {
      var x3 = x2 - x1;
      var y3 = y2 - y1;
      return x3 * x3 + y3 * y3 <= r1 * r1;
    };
  }
});

// node_modules/intersects/circle-circle.js
var require_circle_circle = __commonJS({
  "node_modules/intersects/circle-circle.js"(exports, module) {
    "use strict";
    module.exports = function circleCircle(x1, y1, r1, x2, y2, r2) {
      var x3 = x1 - x2;
      var y3 = y2 - y1;
      var radii = r1 + r2;
      return x3 * x3 + y3 * y3 <= radii * radii;
    };
  }
});

// node_modules/intersects/line-circle.js
var require_line_circle = __commonJS({
  "node_modules/intersects/line-circle.js"(exports, module) {
    "use strict";
    module.exports = function lineCircle(x1, y1, x2, y2, xc, yc, rc) {
      var ac = [xc - x1, yc - y1];
      var ab = [x2 - x1, y2 - y1];
      var ab2 = dot(ab, ab);
      var acab = dot(ac, ab);
      var t2 = acab / ab2;
      t2 = t2 < 0 ? 0 : t2;
      t2 = t2 > 1 ? 1 : t2;
      var h2 = [ab[0] * t2 + x1 - xc, ab[1] * t2 + y1 - yc];
      var h22 = dot(h2, h2);
      return h22 <= rc * rc;
    };
    function dot(v1, v2) {
      return v1[0] * v2[0] + v1[1] * v2[1];
    }
  }
});

// node_modules/intersects/circle-line.js
var require_circle_line = __commonJS({
  "node_modules/intersects/circle-line.js"(exports, module) {
    "use strict";
    var lineCircle = require_line_circle();
    module.exports = function circleLine(xc, yc, rc, x1, y1, x2, y2) {
      return lineCircle(x1, y1, x2, y2, xc, yc, rc);
    };
  }
});

// node_modules/intersects/box-circle.js
var require_box_circle = __commonJS({
  "node_modules/intersects/box-circle.js"(exports, module) {
    "use strict";
    module.exports = function boxCircle(xb, yb, wb, hb, xc, yc, rc) {
      var hw = wb / 2;
      var hh = hb / 2;
      var distX = Math.abs(xc - (xb + wb / 2));
      var distY = Math.abs(yc - (yb + hb / 2));
      if (distX > hw + rc || distY > hh + rc) {
        return false;
      }
      if (distX <= hw || distY <= hh) {
        return true;
      }
      var x2 = distX - hw;
      var y2 = distY - hh;
      return x2 * x2 + y2 * y2 <= rc * rc;
    };
  }
});

// node_modules/intersects/circle-box.js
var require_circle_box = __commonJS({
  "node_modules/intersects/circle-box.js"(exports, module) {
    "use strict";
    var boxCircle = require_box_circle();
    module.exports = function circleBox(xc, yc, rc, xb, yb, wb, hb) {
      return boxCircle(xb, yb, wb, hb, xc, yc, rc);
    };
  }
});

// node_modules/intersects/line-point.js
var require_line_point = __commonJS({
  "node_modules/intersects/line-point.js"(exports, module) {
    "use strict";
    function distanceSquared(x1, y1, x2, y2) {
      return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
    }
    module.exports = function linePoint(x1, y1, x2, y2, xp, yp, tolerance) {
      tolerance = tolerance || 1;
      return Math.abs(distanceSquared(x1, y1, x2, y2) - (distanceSquared(x1, y1, xp, yp) + distanceSquared(x2, y2, xp, yp))) <= tolerance;
    };
  }
});

// node_modules/intersects/polygon-point.js
var require_polygon_point = __commonJS({
  "node_modules/intersects/polygon-point.js"(exports, module) {
    "use strict";
    var linePoint = require_line_point();
    module.exports = function polygonPoint(points, x2, y2, tolerance) {
      var length = points.length;
      var c2 = false;
      var i2, j2;
      for (i2 = 0, j2 = length - 2; i2 < length; i2 += 2) {
        if (points[i2 + 1] > y2 !== points[j2 + 1] > y2 && x2 < (points[j2] - points[i2]) * (y2 - points[i2 + 1]) / (points[j2 + 1] - points[i2 + 1]) + points[i2]) {
          c2 = !c2;
        }
        j2 = i2;
      }
      if (c2) {
        return true;
      }
      for (i2 = 0; i2 < length; i2 += 2) {
        var p1x = points[i2];
        var p1y = points[i2 + 1];
        var p2x, p2y;
        if (i2 === length - 2) {
          p2x = points[0];
          p2y = points[1];
        } else {
          p2x = points[i2 + 2];
          p2y = points[i2 + 3];
        }
        if (linePoint(p1x, p1y, p2x, p2y, x2, y2, tolerance)) {
          return true;
        }
      }
      return false;
    };
  }
});

// node_modules/intersects/polygon-circle.js
var require_polygon_circle = __commonJS({
  "node_modules/intersects/polygon-circle.js"(exports, module) {
    var polygonPoint = require_polygon_point();
    var lineCircle = require_line_circle();
    module.exports = function polygonCircle(points, xc, yc, rc, tolerance) {
      if (polygonPoint(points, xc, yc, tolerance)) {
        return true;
      }
      var count = points.length;
      for (var i2 = 0; i2 < count - 2; i2 += 2) {
        if (lineCircle(points[i2], points[i2 + 1], points[i2 + 2], points[i2 + 3], xc, yc, rc)) {
          return true;
        }
      }
      return lineCircle(points[0], points[1], points[count - 2], points[count - 1], xc, yc, rc);
    };
  }
});

// node_modules/intersects/circle-polygon.js
var require_circle_polygon = __commonJS({
  "node_modules/intersects/circle-polygon.js"(exports, module) {
    "use strict";
    var polygonCircle = require_polygon_circle();
    module.exports = function circlePolygon(xc, yc, rc, points, tolerance) {
      return polygonCircle(points, xc, yc, rc, tolerance);
    };
  }
});

// node_modules/intersects/ellipse-helper.js
var require_ellipse_helper = __commonJS({
  "node_modules/intersects/ellipse-helper.js"(exports, module) {
    var MAX_ITERATIONS = 10;
    var innerPolygonCoef;
    var outerPolygonCoef;
    var initialized;
    function initialize() {
      innerPolygonCoef = [];
      outerPolygonCoef = [];
      for (var t2 = 0; t2 <= MAX_ITERATIONS; t2++) {
        var numNodes = 4 << t2;
        innerPolygonCoef[t2] = 0.5 / Math.cos(4 * Math.acos(0) / numNodes);
        outerPolygonCoef[t2] = 0.5 / (Math.cos(2 * Math.acos(0) / numNodes) * Math.cos(2 * Math.acos(0) / numNodes));
      }
      initialized = true;
    }
    function iterate(x2, y2, c0x, c0y, c2x, c2y, rr) {
      for (var t2 = 1; t2 <= MAX_ITERATIONS; t2++) {
        var c1x = (c0x + c2x) * innerPolygonCoef[t2];
        var c1y = (c0y + c2y) * innerPolygonCoef[t2];
        var tx = x2 - c1x;
        var ty = y2 - c1y;
        if (tx * tx + ty * ty <= rr) {
          return true;
        }
        var t2x = c2x - c1x;
        var t2y = c2y - c1y;
        if (tx * t2x + ty * t2y >= 0 && tx * t2x + ty * t2y <= t2x * t2x + t2y * t2y && (ty * t2x - tx * t2y >= 0 || rr * (t2x * t2x + t2y * t2y) >= (ty * t2x - tx * t2y) * (ty * t2x - tx * t2y))) {
          return true;
        }
        var t0x = c0x - c1x;
        var t0y = c0y - c1y;
        if (tx * t0x + ty * t0y >= 0 && tx * t0x + ty * t0y <= t0x * t0x + t0y * t0y && (ty * t0x - tx * t0y <= 0 || rr * (t0x * t0x + t0y * t0y) >= (ty * t0x - tx * t0y) * (ty * t0x - tx * t0y))) {
          return true;
        }
        var c3x = (c0x + c1x) * outerPolygonCoef[t2];
        var c3y = (c0y + c1y) * outerPolygonCoef[t2];
        if ((c3x - x2) * (c3x - x2) + (c3y - y2) * (c3y - y2) < rr) {
          c2x = c1x;
          c2y = c1y;
          continue;
        }
        var c4x = c1x - c3x + c1x;
        var c4y = c1y - c3y + c1y;
        if ((c4x - x2) * (c4x - x2) + (c4y - y2) * (c4y - y2) < rr) {
          c0x = c1x;
          c0y = c1y;
          continue;
        }
        var t3x = c3x - c1x;
        var t3y = c3y - c1y;
        if (ty * t3x - tx * t3y <= 0 || rr * (t3x * t3x + t3y * t3y) > (ty * t3x - tx * t3y) * (ty * t3x - tx * t3y)) {
          if (tx * t3x + ty * t3y > 0) {
            if (Math.abs(tx * t3x + ty * t3y) <= t3x * t3x + t3y * t3y || (x2 - c3x) * (c0x - c3x) + (y2 - c3y) * (c0y - c3y) >= 0) {
              c2x = c1x;
              c2y = c1y;
              continue;
            }
          } else if (-(tx * t3x + ty * t3y) <= t3x * t3x + t3y * t3y || (x2 - c4x) * (c2x - c4x) + (y2 - c4y) * (c2y - c4y) >= 0) {
            c0x = c1x;
            c0y = c1y;
            continue;
          }
        }
        return false;
      }
      return false;
    }
    function ellipseEllipse(x0, y0, w0, h0, x1, y1, w1, h1) {
      if (!initialized) {
        initialize();
      }
      var x2 = Math.abs(x1 - x0) * h1;
      var y2 = Math.abs(y1 - y0) * w1;
      w0 *= h1;
      h0 *= w1;
      var r2 = w1 * h1;
      if (x2 * x2 + (h0 - y2) * (h0 - y2) <= r2 * r2 || (w0 - x2) * (w0 - x2) + y2 * y2 <= r2 * r2 || x2 * h0 + y2 * w0 <= w0 * h0 || (x2 * h0 + y2 * w0 - w0 * h0) * (x2 * h0 + y2 * w0 - w0 * h0) <= r2 * r2 * (w0 * w0 + h0 * h0) && x2 * w0 - y2 * h0 >= -h0 * h0 && x2 * w0 - y2 * h0 <= w0 * w0) {
        return true;
      } else {
        if ((x2 - w0) * (x2 - w0) + (y2 - h0) * (y2 - h0) <= r2 * r2 || x2 <= w0 && y2 - r2 <= h0 || y2 <= h0 && x2 - r2 <= w0) {
          return iterate(x2, y2, w0, 0, 0, h0, r2 * r2);
        }
        return false;
      }
    }
    function ellipseCircle(x0, y0, w2, h2, x1, y1, r2) {
      if (!initialized) {
        initialize();
      }
      var x2 = Math.abs(x1 - x0);
      var y2 = Math.abs(y1 - y0);
      if (x2 * x2 + (h2 - y2) * (h2 - y2) <= r2 * r2 || (w2 - x2) * (w2 - x2) + y2 * y2 <= r2 * r2 || x2 * h2 + y2 * w2 <= w2 * h2 || (x2 * h2 + y2 * w2 - w2 * h2) * (x2 * h2 + y2 * w2 - w2 * h2) <= r2 * r2 * (w2 * w2 + h2 * h2) && x2 * w2 - y2 * h2 >= -h2 * h2 && x2 * w2 - y2 * h2 <= w2 * w2) {
        return true;
      } else {
        if ((x2 - w2) * (x2 - w2) + (y2 - h2) * (y2 - h2) <= r2 * r2 || x2 <= w2 && y2 - r2 <= h2 || y2 <= h2 && x2 - r2 <= w2) {
          return iterate(x2, y2, w2, 0, 0, h2, r2 * r2);
        }
        return false;
      }
    }
    module.exports = {
      ellipseCircle,
      ellipseEllipse
    };
  }
});

// node_modules/intersects/ellipse-circle.js
var require_ellipse_circle = __commonJS({
  "node_modules/intersects/ellipse-circle.js"(exports, module) {
    var ellipseHelper = require_ellipse_helper();
    module.exports = function ellipseCircle(xe, ye, rex, rey, xc, yc, rc) {
      return ellipseHelper.ellipseCircle(xe, ye, rex, rey, xc, yc, rc);
    };
  }
});

// node_modules/intersects/circle-ellipse.js
var require_circle_ellipse = __commonJS({
  "node_modules/intersects/circle-ellipse.js"(exports, module) {
    var ellipseCircle = require_ellipse_circle();
    module.exports = function circleEllipse(xc, yc, rc, xe, ye, rex, rey) {
      return ellipseCircle(xe, ye, rex, rey, xc, yc, rc);
    };
  }
});

// node_modules/intersects/circleOutline-box.js
var require_circleOutline_box = __commonJS({
  "node_modules/intersects/circleOutline-box.js"(exports, module) {
    var circlePoint = require_circle_point();
    var boxCircle = require_box_circle();
    module.exports = function circleOutlineBox(xc, yc, rc, x2, y2, width, height, thickness) {
      thickness = thickness || 1;
      var count = 0;
      count += circlePoint(xc, yc, rc, x2, y2) ? 1 : 0;
      count += circlePoint(xc, yc, rc, x2 + width, y2) ? 1 : 0;
      count += circlePoint(xc, yc, rc, x2, y2 + height) ? 1 : 0;
      count += circlePoint(xc, yc, rc, x2 + width, y2 + height) ? 1 : 0;
      if (count === 0) {
        return boxCircle(x2, y2, width, height, xc, yc, rc);
      }
      if (count >= 1 && count <= 3) {
        return true;
      }
      if (count === 4) {
        return !circlePoint(xc, yc, rc - thickness, x2, y2) || !circlePoint(xc, yc, rc - thickness, x2 + width, y2) || !circlePoint(xc, yc, rc - thickness, x2, y2 + height) || !circlePoint(xc, yc, rc - thickness, x2 + width, y2 + height);
      }
    };
  }
});

// node_modules/intersects/circleOutline-line.js
var require_circleOutline_line = __commonJS({
  "node_modules/intersects/circleOutline-line.js"(exports, module) {
    var lineCircle = require_line_circle();
    var circlePoint = require_circle_point();
    module.exports = function circleOutlineLine(xc, yc, rc, x1, y1, x2, y2, thickness) {
      thickness = thickness || 1;
      return lineCircle(x1, y1, x2, y2, xc, yc, rc) && !(circlePoint(xc, yc, rc - thickness, x1, y1) && circlePoint(xc, yc, rc - thickness, x2, y2));
    };
  }
});

// node_modules/intersects/circleOutline-point.js
var require_circleOutline_point = __commonJS({
  "node_modules/intersects/circleOutline-point.js"(exports, module) {
    var circlePoint = require_circle_point();
    module.exports = function circleOutlinePoint(xc, yc, rc, x2, y2, thickness) {
      thickness = thickness || 1;
      return circlePoint(xc, yc, rc, x2, y2) && !circlePoint(xc, yc, rc - thickness, x2, y2);
    };
  }
});

// node_modules/intersects/lineToLine.js
var require_lineToLine = __commonJS({
  "node_modules/intersects/lineToLine.js"(exports, module) {
    "use strict";
    module.exports = function lineToLine(x1, y1, x2, y2, x3, y3, x4, y4) {
      var s1_x = x2 - x1;
      var s1_y = y2 - y1;
      var s2_x = x4 - x3;
      var s2_y = y4 - y3;
      var s2 = (-s1_y * (x1 - x3) + s1_x * (y1 - y3)) / (-s2_x * s1_y + s1_x * s2_y);
      var t2 = (s2_x * (y1 - y3) - s2_y * (x1 - x3)) / (-s2_x * s1_y + s1_x * s2_y);
      return s2 >= 0 && s2 <= 1 && t2 >= 0 && t2 <= 1;
    };
  }
});

// node_modules/intersects/line-polygon.js
var require_line_polygon = __commonJS({
  "node_modules/intersects/line-polygon.js"(exports, module) {
    var polygonPoint = require_polygon_point();
    var lineLine = require_lineToLine();
    module.exports = function linePolygon(x1, y1, x2, y2, points, tolerance) {
      var length = points.length;
      if (polygonPoint(points, x1, y1, tolerance)) {
        return true;
      }
      for (var i2 = 0; i2 < length; i2 += 2) {
        var j2 = (i2 + 2) % length;
        if (lineLine(x1, y1, x2, y2, points[i2], points[i2 + 1], points[j2], points[j2 + 1])) {
          return true;
        }
      }
      return false;
    };
  }
});

// node_modules/intersects/polygon-line.js
var require_polygon_line = __commonJS({
  "node_modules/intersects/polygon-line.js"(exports, module) {
    var linePolygon = require_line_polygon();
    module.exports = function polygonLine(points, x1, y1, x2, y2, tolerance) {
      return linePolygon(x1, y1, x2, y2, points, tolerance);
    };
  }
});

// node_modules/intersects/polygon-polygon.js
var require_polygon_polygon = __commonJS({
  "node_modules/intersects/polygon-polygon.js"(exports, module) {
    "use strict";
    module.exports = function polygonPolygon(points1, points2) {
      var a2 = points1;
      var b2 = points2;
      var polygons = [a2, b2];
      var minA, maxA, projected, minB, maxB, j2;
      for (var i2 = 0; i2 < polygons.length; i2++) {
        var polygon = polygons[i2];
        for (var i1 = 0; i1 < polygon.length; i1 += 2) {
          var i22 = (i1 + 2) % polygon.length;
          var normal = { x: polygon[i22 + 1] - polygon[i1 + 1], y: polygon[i1] - polygon[i22] };
          minA = maxA = null;
          for (j2 = 0; j2 < a2.length; j2 += 2) {
            projected = normal.x * a2[j2] + normal.y * a2[j2 + 1];
            if (minA === null || projected < minA) {
              minA = projected;
            }
            if (maxA === null || projected > maxA) {
              maxA = projected;
            }
          }
          minB = maxB = null;
          for (j2 = 0; j2 < b2.length; j2 += 2) {
            projected = normal.x * b2[j2] + normal.y * b2[j2 + 1];
            if (minB === null || projected < minB) {
              minB = projected;
            }
            if (maxB === null || projected > maxB) {
              maxB = projected;
            }
          }
          if (maxA < minB || maxB < minA) {
            return false;
          }
        }
      }
      return true;
    };
  }
});

// node_modules/intersects/polygon-box.js
var require_polygon_box = __commonJS({
  "node_modules/intersects/polygon-box.js"(exports, module) {
    "use strict";
    var polygonPolygon = require_polygon_polygon();
    module.exports = function polygonBox(points, x2, y2, w2, h2) {
      var points2 = [x2, y2, x2 + w2, y2, x2 + w2, y2 + h2, x2, y2 + h2];
      return polygonPolygon(points, points2);
    };
  }
});

// node_modules/intersects/ellipse-line.js
var require_ellipse_line = __commonJS({
  "node_modules/intersects/ellipse-line.js"(exports, module) {
    module.exports = function ellipseLine(xe, ye, rex, rey, x1, y1, x2, y2) {
      x1 -= xe;
      x2 -= xe;
      y1 -= ye;
      y2 -= ye;
      var A = Math.pow(x2 - x1, 2) / rex / rex + Math.pow(y2 - y1, 2) / rey / rey;
      var B = 2 * x1 * (x2 - x1) / rex / rex + 2 * y1 * (y2 - y1) / rey / rey;
      var C = x1 * x1 / rex / rex + y1 * y1 / rey / rey - 1;
      var D = B * B - 4 * A * C;
      if (D === 0) {
        var t2 = -B / 2 / A;
        return t2 >= 0 && t2 <= 1;
      } else if (D > 0) {
        var sqrt = Math.sqrt(D);
        var t1 = (-B + sqrt) / 2 / A;
        var t22 = (-B - sqrt) / 2 / A;
        return t1 >= 0 && t1 <= 1 || t22 >= 0 && t22 <= 1;
      } else {
        return false;
      }
    };
  }
});

// node_modules/intersects/line-ellipse.js
var require_line_ellipse = __commonJS({
  "node_modules/intersects/line-ellipse.js"(exports, module) {
    var ellipseLine = require_ellipse_line();
    module.exports = function lineEllipse(x1, y1, x2, y2, xe, ye, rex, rey) {
      return ellipseLine(xe, ye, rex, rey, x1, y1, x2, y2);
    };
  }
});

// node_modules/intersects/polygon-ellipse.js
var require_polygon_ellipse = __commonJS({
  "node_modules/intersects/polygon-ellipse.js"(exports, module) {
    var polygonPoint = require_polygon_point();
    var lineEllipse = require_line_ellipse();
    module.exports = function polygonEllipse(points, xe, ye, rex, rey) {
      if (polygonPoint(points, xe, ye)) {
        return true;
      }
      var count = points.length;
      for (var i2 = 0; i2 < count - 2; i2 += 2) {
        if (lineEllipse(points[i2], points[i2 + 1], points[i2 + 2], points[i2 + 3], xe, ye, rex, rey)) {
          return true;
        }
      }
      return lineEllipse(points[0], points[1], points[count - 2], points[count - 1], xe, ye, rex, rey);
    };
  }
});

// node_modules/intersects/box-point.js
var require_box_point = __commonJS({
  "node_modules/intersects/box-point.js"(exports, module) {
    "use strict";
    module.exports = function boxPoint(x1, y1, w1, h1, x2, y2) {
      return x2 >= x1 && x2 <= x1 + w1 && y2 >= y1 && y2 <= y1 + h1;
    };
  }
});

// node_modules/intersects/box-box.js
var require_box_box = __commonJS({
  "node_modules/intersects/box-box.js"(exports, module) {
    "use strict";
    module.exports = function boxBox(x1, y1, w1, h1, x2, y2, w2, h2) {
      return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
    };
  }
});

// node_modules/intersects/lineToPolygon.js
var require_lineToPolygon = __commonJS({
  "node_modules/intersects/lineToPolygon.js"(exports, module) {
    "use strict";
    module.exports = function lineToPolygon(x1, y1, x2, y2, thickness) {
      const angle = Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2;
      const half = thickness / 2;
      const cos = Math.cos(angle) * half;
      const sin = Math.sin(angle) * half;
      return [
        x1 - cos,
        y1 - sin,
        x2 - cos,
        y2 - sin,
        x2 + cos,
        y2 + sin,
        x1 + cos,
        y1 + sin
      ];
    };
  }
});

// node_modules/intersects/line-line.js
var require_line_line = __commonJS({
  "node_modules/intersects/line-line.js"(exports, module) {
    "use strict";
    var lineToPolygon = require_lineToPolygon();
    var polygonPolygon = require_polygon_polygon();
    var linePolygon = require_line_polygon();
    var lineToLine = require_lineToLine();
    module.exports = function lineLine(x1, y1, x2, y2, x3, y3, x4, y4, thickness1, thickness2) {
      if (thickness1 || thickness2) {
        return lineLineThickness(x1, y1, x2, y2, x3, y3, x4, y4, thickness1, thickness2);
      } else {
        return lineToLine(x1, y1, x2, y2, x3, y3, x4, y4);
      }
    };
    function lineLineThickness(x1, y1, x2, y2, x3, y3, x4, y4, thickness1, thickness2) {
      if (thickness1 && thickness2) {
        return polygonPolygon(lineToPolygon(x1, y1, x2, y2, thickness1), lineToPolygon(x3, y3, x4, y4, thickness2));
      } else if (thickness1) {
        return linePolygon(x3, y3, x4, y4, lineToPolygon(x1, y1, x2, y2, thickness1));
      } else if (thickness2) {
        return linePolygon(x1, y1, x2, y2, lineToPolygon(x3, y3, x4, y4, thickness1));
      }
    }
  }
});

// node_modules/intersects/line-box.js
var require_line_box = __commonJS({
  "node_modules/intersects/line-box.js"(exports, module) {
    "use strict";
    var boxPoint = require_box_point();
    var lineLine = require_line_line();
    module.exports = function lineBox(x1, y1, x2, y2, xb, yb, wb, hb) {
      if (boxPoint(xb, yb, wb, hb, x1, y1) || boxPoint(xb, yb, wb, hb, x2, y2)) {
        return true;
      }
      return lineLine(x1, y1, x2, y2, xb, yb, xb + wb, yb) || lineLine(x1, y1, x2, y2, xb + wb, yb, xb + wb, yb + hb) || lineLine(x1, y1, x2, y2, xb, yb + hb, xb + wb, yb + hb) || lineLine(x1, y1, x2, y2, xb, yb, xb, yb + hb);
    };
  }
});

// node_modules/intersects/box-line.js
var require_box_line = __commonJS({
  "node_modules/intersects/box-line.js"(exports, module) {
    "use strict";
    var lineBox = require_line_box();
    module.exports = function boxLine(xb, yb, wb, hb, x1, y1, x2, y2) {
      return lineBox(x1, y1, x2, y2, xb, yb, wb, hb);
    };
  }
});

// node_modules/intersects/box-polygon.js
var require_box_polygon = __commonJS({
  "node_modules/intersects/box-polygon.js"(exports, module) {
    "use strict";
    var polygonBox = require_polygon_box();
    module.exports = function boxPolygon(xb, yb, wb, hb, points) {
      return polygonBox(points, xb, yb, wb, hb);
    };
  }
});

// node_modules/intersects/ellipse-box.js
var require_ellipse_box = __commonJS({
  "node_modules/intersects/ellipse-box.js"(exports, module) {
    var ellipseLine = require_ellipse_line();
    var boxPoint = require_box_point();
    module.exports = function ellipseBox(xe, ye, rex, rey, xb, yb, wb, hb) {
      return boxPoint(xb, yb, wb, hb, xe, ye) || ellipseLine(xe, ye, rex, rey, xb, yb, xb + wb, yb) || ellipseLine(xe, ye, rex, rey, xb, yb + hb, xb + wb, yb + hb) || ellipseLine(xe, ye, rex, rey, xb, yb, xb, yb + hb) || ellipseLine(xe, ye, rex, rey, xb + wb, yb, xb + wb, yb + hb);
    };
  }
});

// node_modules/intersects/box-ellipse.js
var require_box_ellipse = __commonJS({
  "node_modules/intersects/box-ellipse.js"(exports, module) {
    var ellipseBox = require_ellipse_box();
    module.exports = function boxEllipse(xb, yb, wb, hb, xe, ye, rex, rey) {
      return ellipseBox(xe, ye, rex, rey, xb, yb, wb, hb);
    };
  }
});

// node_modules/intersects/box-circleOutline.js
var require_box_circleOutline = __commonJS({
  "node_modules/intersects/box-circleOutline.js"(exports, module) {
    var circleOutlineBox = require_circleOutline_box();
    module.exports = function boxCircleOutline(x2, y2, width, height, xc, yc, rc, thickness) {
      return circleOutlineBox(xc, yc, rc, x2, y2, width, height, thickness);
    };
  }
});

// node_modules/intersects/point-box.js
var require_point_box = __commonJS({
  "node_modules/intersects/point-box.js"(exports, module) {
    "use strict";
    var boxPoint = require_box_point();
    module.exports = function pointBox(x1, y1, xb, yb, wb, hb) {
      return boxPoint(xb, yb, wb, hb, x1, y1);
    };
  }
});

// node_modules/intersects/point-polygon.js
var require_point_polygon = __commonJS({
  "node_modules/intersects/point-polygon.js"(exports, module) {
    "use strict";
    var polygonPoint = require_polygon_point();
    module.exports = function pointPolygon(x1, y1, points, tolerance) {
      return polygonPoint(points, x1, y1, tolerance);
    };
  }
});

// node_modules/intersects/point-circle.js
var require_point_circle = __commonJS({
  "node_modules/intersects/point-circle.js"(exports, module) {
    "use strict";
    var circlePoint = require_circle_point();
    module.exports = function pointCircle(x1, y1, xc, yc, rc) {
      return circlePoint(xc, yc, rc, x1, y1);
    };
  }
});

// node_modules/intersects/point-line.js
var require_point_line = __commonJS({
  "node_modules/intersects/point-line.js"(exports, module) {
    "use strict";
    var linePoint = require_line_point();
    module.exports = function pointLine(xp, yp, x1, y1, x2, y2) {
      return linePoint(x1, y1, x2, y2, xp, yp);
    };
  }
});

// node_modules/intersects/ellipse-point.js
var require_ellipse_point = __commonJS({
  "node_modules/intersects/ellipse-point.js"(exports, module) {
    module.exports = function ellipsePoint(xe, ye, rex, rey, x1, y1) {
      var x2 = Math.pow(x1 - xe, 2) / (rex * rex);
      var y2 = Math.pow(y1 - ye, 2) / (rey * rey);
      return x2 + y2 <= 1;
    };
  }
});

// node_modules/intersects/point-ellipse.js
var require_point_ellipse = __commonJS({
  "node_modules/intersects/point-ellipse.js"(exports, module) {
    var ellipsePoint = require_ellipse_point();
    module.exports = function pointEllipse(x1, y1, xe, ye, rex, rey) {
      return ellipsePoint(xe, ye, rex, rey, x1, y1);
    };
  }
});

// node_modules/intersects/point-circleOutline.js
var require_point_circleOutline = __commonJS({
  "node_modules/intersects/point-circleOutline.js"(exports, module) {
    var circleOutlinePoint = require_circleOutline_point();
    module.exports = function pointCircleOutline(x2, y2, xc, yc, rc, thickness) {
      return circleOutlinePoint(x2, y2, xc, yc, rc, thickness);
    };
  }
});

// node_modules/intersects/line-circleOutline.js
var require_line_circleOutline = __commonJS({
  "node_modules/intersects/line-circleOutline.js"(exports, module) {
    var circleOutlineLine = require_circleOutline_line();
    module.exports = function lineCircleOutline(x1, y1, x2, y2, xc, yc, rc, thickness) {
      return circleOutlineLine(xc, yc, rc, x1, y1, x2, y2, thickness);
    };
  }
});

// node_modules/intersects/ellipse-ellipse.js
var require_ellipse_ellipse = __commonJS({
  "node_modules/intersects/ellipse-ellipse.js"(exports, module) {
    var ellipseHelper = require_ellipse_helper();
    module.exports = function ellipseEllipse(x1, y1, r1x, r1y, x2, y2, r2x, r2y) {
      return ellipseHelper.ellipseEllipse(x1, y1, r1x, r1y, x2, y2, r2x, r2y);
    };
  }
});

// node_modules/intersects/ellipse-polygon.js
var require_ellipse_polygon = __commonJS({
  "node_modules/intersects/ellipse-polygon.js"(exports, module) {
    var polygonEllipse = require_polygon_ellipse();
    module.exports = function ellipsePolygon(xe, ye, rex, rey, points) {
      return polygonEllipse(points, xe, ye, rex, rey);
    };
  }
});

// node_modules/intersects/index.js
var require_intersects = __commonJS({
  "node_modules/intersects/index.js"(exports, module) {
    module.exports = {
      circlePoint: require_circle_point(),
      circleCircle: require_circle_circle(),
      circleLine: require_circle_line(),
      circleBox: require_circle_box(),
      circlePolygon: require_circle_polygon(),
      circleEllipse: require_circle_ellipse(),
      // circleCircleOutline: require('./circle-circleOutline'),
      circleOutlineBox: require_circleOutline_box(),
      circleOutlineLine: require_circleOutline_line(),
      circleOutlinePoint: require_circleOutline_point(),
      // circleOutlineCircle: require('./circleOutline-circle'),
      polygonPoint: require_polygon_point(),
      polygonLine: require_polygon_line(),
      polygonPolygon: require_polygon_polygon(),
      polygonBox: require_polygon_box(),
      polygonCircle: require_polygon_circle(),
      polygonEllipse: require_polygon_ellipse(),
      boxPoint: require_box_point(),
      boxBox: require_box_box(),
      boxLine: require_box_line(),
      boxPolygon: require_box_polygon(),
      boxCircle: require_box_circle(),
      boxEllipse: require_box_ellipse(),
      boxCircleOutline: require_box_circleOutline(),
      pointBox: require_point_box(),
      pointPolygon: require_point_polygon(),
      pointCircle: require_point_circle(),
      pointLine: require_point_line(),
      pointEllipse: require_point_ellipse(),
      pointCircleOutline: require_point_circleOutline(),
      lineLine: require_line_line(),
      lineBox: require_line_box(),
      linePolygon: require_line_polygon(),
      lineCircle: require_line_circle(),
      linePoint: require_line_point(),
      lineEllipse: require_line_ellipse(),
      lineCircleOutline: require_line_circleOutline(),
      ellipsePoint: require_ellipse_point(),
      ellipseLine: require_ellipse_line(),
      ellipseBox: require_ellipse_box(),
      ellipseCircle: require_ellipse_circle(),
      ellipseEllipse: require_ellipse_ellipse(),
      ellipsePolygon: require_ellipse_polygon()
    };
  }
});

// node_modules/lodash/_listCacheClear.js
var require_listCacheClear = __commonJS({
  "node_modules/lodash/_listCacheClear.js"(exports, module) {
    function listCacheClear() {
      this.__data__ = [];
      this.size = 0;
    }
    module.exports = listCacheClear;
  }
});

// node_modules/lodash/eq.js
var require_eq = __commonJS({
  "node_modules/lodash/eq.js"(exports, module) {
    function eq(value, other) {
      return value === other || value !== value && other !== other;
    }
    module.exports = eq;
  }
});

// node_modules/lodash/_assocIndexOf.js
var require_assocIndexOf = __commonJS({
  "node_modules/lodash/_assocIndexOf.js"(exports, module) {
    var eq = require_eq();
    function assocIndexOf(array, key) {
      var length = array.length;
      while (length--) {
        if (eq(array[length][0], key)) {
          return length;
        }
      }
      return -1;
    }
    module.exports = assocIndexOf;
  }
});

// node_modules/lodash/_listCacheDelete.js
var require_listCacheDelete = __commonJS({
  "node_modules/lodash/_listCacheDelete.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    var arrayProto = Array.prototype;
    var splice = arrayProto.splice;
    function listCacheDelete(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        return false;
      }
      var lastIndex = data.length - 1;
      if (index == lastIndex) {
        data.pop();
      } else {
        splice.call(data, index, 1);
      }
      --this.size;
      return true;
    }
    module.exports = listCacheDelete;
  }
});

// node_modules/lodash/_listCacheGet.js
var require_listCacheGet = __commonJS({
  "node_modules/lodash/_listCacheGet.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheGet(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      return index < 0 ? void 0 : data[index][1];
    }
    module.exports = listCacheGet;
  }
});

// node_modules/lodash/_listCacheHas.js
var require_listCacheHas = __commonJS({
  "node_modules/lodash/_listCacheHas.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheHas(key) {
      return assocIndexOf(this.__data__, key) > -1;
    }
    module.exports = listCacheHas;
  }
});

// node_modules/lodash/_listCacheSet.js
var require_listCacheSet = __commonJS({
  "node_modules/lodash/_listCacheSet.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheSet(key, value) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        ++this.size;
        data.push([key, value]);
      } else {
        data[index][1] = value;
      }
      return this;
    }
    module.exports = listCacheSet;
  }
});

// node_modules/lodash/_ListCache.js
var require_ListCache = __commonJS({
  "node_modules/lodash/_ListCache.js"(exports, module) {
    var listCacheClear = require_listCacheClear();
    var listCacheDelete = require_listCacheDelete();
    var listCacheGet = require_listCacheGet();
    var listCacheHas = require_listCacheHas();
    var listCacheSet = require_listCacheSet();
    function ListCache(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    ListCache.prototype.clear = listCacheClear;
    ListCache.prototype["delete"] = listCacheDelete;
    ListCache.prototype.get = listCacheGet;
    ListCache.prototype.has = listCacheHas;
    ListCache.prototype.set = listCacheSet;
    module.exports = ListCache;
  }
});

// node_modules/lodash/_stackClear.js
var require_stackClear = __commonJS({
  "node_modules/lodash/_stackClear.js"(exports, module) {
    var ListCache = require_ListCache();
    function stackClear() {
      this.__data__ = new ListCache();
      this.size = 0;
    }
    module.exports = stackClear;
  }
});

// node_modules/lodash/_stackDelete.js
var require_stackDelete = __commonJS({
  "node_modules/lodash/_stackDelete.js"(exports, module) {
    function stackDelete(key) {
      var data = this.__data__, result = data["delete"](key);
      this.size = data.size;
      return result;
    }
    module.exports = stackDelete;
  }
});

// node_modules/lodash/_stackGet.js
var require_stackGet = __commonJS({
  "node_modules/lodash/_stackGet.js"(exports, module) {
    function stackGet(key) {
      return this.__data__.get(key);
    }
    module.exports = stackGet;
  }
});

// node_modules/lodash/_stackHas.js
var require_stackHas = __commonJS({
  "node_modules/lodash/_stackHas.js"(exports, module) {
    function stackHas(key) {
      return this.__data__.has(key);
    }
    module.exports = stackHas;
  }
});

// node_modules/lodash/_freeGlobal.js
var require_freeGlobal = __commonJS({
  "node_modules/lodash/_freeGlobal.js"(exports, module) {
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    module.exports = freeGlobal;
  }
});

// node_modules/lodash/_root.js
var require_root = __commonJS({
  "node_modules/lodash/_root.js"(exports, module) {
    var freeGlobal = require_freeGlobal();
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    module.exports = root;
  }
});

// node_modules/lodash/_Symbol.js
var require_Symbol = __commonJS({
  "node_modules/lodash/_Symbol.js"(exports, module) {
    var root = require_root();
    var Symbol2 = root.Symbol;
    module.exports = Symbol2;
  }
});

// node_modules/lodash/_getRawTag.js
var require_getRawTag = __commonJS({
  "node_modules/lodash/_getRawTag.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var nativeObjectToString = objectProto.toString;
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    function getRawTag(value) {
      var isOwn = hasOwnProperty.call(value, symToStringTag), tag = value[symToStringTag];
      try {
        value[symToStringTag] = void 0;
        var unmasked = true;
      } catch (e2) {
      }
      var result = nativeObjectToString.call(value);
      if (unmasked) {
        if (isOwn) {
          value[symToStringTag] = tag;
        } else {
          delete value[symToStringTag];
        }
      }
      return result;
    }
    module.exports = getRawTag;
  }
});

// node_modules/lodash/_objectToString.js
var require_objectToString = __commonJS({
  "node_modules/lodash/_objectToString.js"(exports, module) {
    var objectProto = Object.prototype;
    var nativeObjectToString = objectProto.toString;
    function objectToString(value) {
      return nativeObjectToString.call(value);
    }
    module.exports = objectToString;
  }
});

// node_modules/lodash/_baseGetTag.js
var require_baseGetTag = __commonJS({
  "node_modules/lodash/_baseGetTag.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var getRawTag = require_getRawTag();
    var objectToString = require_objectToString();
    var nullTag = "[object Null]";
    var undefinedTag = "[object Undefined]";
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    function baseGetTag(value) {
      if (value == null) {
        return value === void 0 ? undefinedTag : nullTag;
      }
      return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
    }
    module.exports = baseGetTag;
  }
});

// node_modules/lodash/isObject.js
var require_isObject = __commonJS({
  "node_modules/lodash/isObject.js"(exports, module) {
    function isObject3(value) {
      var type = typeof value;
      return value != null && (type == "object" || type == "function");
    }
    module.exports = isObject3;
  }
});

// node_modules/lodash/isFunction.js
var require_isFunction = __commonJS({
  "node_modules/lodash/isFunction.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isObject3 = require_isObject();
    var asyncTag = "[object AsyncFunction]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var proxyTag = "[object Proxy]";
    function isFunction(value) {
      if (!isObject3(value)) {
        return false;
      }
      var tag = baseGetTag(value);
      return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
    }
    module.exports = isFunction;
  }
});

// node_modules/lodash/_coreJsData.js
var require_coreJsData = __commonJS({
  "node_modules/lodash/_coreJsData.js"(exports, module) {
    var root = require_root();
    var coreJsData = root["__core-js_shared__"];
    module.exports = coreJsData;
  }
});

// node_modules/lodash/_isMasked.js
var require_isMasked = __commonJS({
  "node_modules/lodash/_isMasked.js"(exports, module) {
    var coreJsData = require_coreJsData();
    var maskSrcKey = (function() {
      var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
      return uid ? "Symbol(src)_1." + uid : "";
    })();
    function isMasked(func) {
      return !!maskSrcKey && maskSrcKey in func;
    }
    module.exports = isMasked;
  }
});

// node_modules/lodash/_toSource.js
var require_toSource = __commonJS({
  "node_modules/lodash/_toSource.js"(exports, module) {
    var funcProto = Function.prototype;
    var funcToString = funcProto.toString;
    function toSource(func) {
      if (func != null) {
        try {
          return funcToString.call(func);
        } catch (e2) {
        }
        try {
          return func + "";
        } catch (e2) {
        }
      }
      return "";
    }
    module.exports = toSource;
  }
});

// node_modules/lodash/_baseIsNative.js
var require_baseIsNative = __commonJS({
  "node_modules/lodash/_baseIsNative.js"(exports, module) {
    var isFunction = require_isFunction();
    var isMasked = require_isMasked();
    var isObject3 = require_isObject();
    var toSource = require_toSource();
    var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    var reIsHostCtor = /^\[object .+?Constructor\]$/;
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var reIsNative = RegExp(
      "^" + funcToString.call(hasOwnProperty).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    );
    function baseIsNative(value) {
      if (!isObject3(value) || isMasked(value)) {
        return false;
      }
      var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
      return pattern.test(toSource(value));
    }
    module.exports = baseIsNative;
  }
});

// node_modules/lodash/_getValue.js
var require_getValue = __commonJS({
  "node_modules/lodash/_getValue.js"(exports, module) {
    function getValue(object, key) {
      return object == null ? void 0 : object[key];
    }
    module.exports = getValue;
  }
});

// node_modules/lodash/_getNative.js
var require_getNative = __commonJS({
  "node_modules/lodash/_getNative.js"(exports, module) {
    var baseIsNative = require_baseIsNative();
    var getValue = require_getValue();
    function getNative(object, key) {
      var value = getValue(object, key);
      return baseIsNative(value) ? value : void 0;
    }
    module.exports = getNative;
  }
});

// node_modules/lodash/_Map.js
var require_Map = __commonJS({
  "node_modules/lodash/_Map.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var Map2 = getNative(root, "Map");
    module.exports = Map2;
  }
});

// node_modules/lodash/_nativeCreate.js
var require_nativeCreate = __commonJS({
  "node_modules/lodash/_nativeCreate.js"(exports, module) {
    var getNative = require_getNative();
    var nativeCreate = getNative(Object, "create");
    module.exports = nativeCreate;
  }
});

// node_modules/lodash/_hashClear.js
var require_hashClear = __commonJS({
  "node_modules/lodash/_hashClear.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    function hashClear() {
      this.__data__ = nativeCreate ? nativeCreate(null) : {};
      this.size = 0;
    }
    module.exports = hashClear;
  }
});

// node_modules/lodash/_hashDelete.js
var require_hashDelete = __commonJS({
  "node_modules/lodash/_hashDelete.js"(exports, module) {
    function hashDelete(key) {
      var result = this.has(key) && delete this.__data__[key];
      this.size -= result ? 1 : 0;
      return result;
    }
    module.exports = hashDelete;
  }
});

// node_modules/lodash/_hashGet.js
var require_hashGet = __commonJS({
  "node_modules/lodash/_hashGet.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function hashGet(key) {
      var data = this.__data__;
      if (nativeCreate) {
        var result = data[key];
        return result === HASH_UNDEFINED ? void 0 : result;
      }
      return hasOwnProperty.call(data, key) ? data[key] : void 0;
    }
    module.exports = hashGet;
  }
});

// node_modules/lodash/_hashHas.js
var require_hashHas = __commonJS({
  "node_modules/lodash/_hashHas.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function hashHas(key) {
      var data = this.__data__;
      return nativeCreate ? data[key] !== void 0 : hasOwnProperty.call(data, key);
    }
    module.exports = hashHas;
  }
});

// node_modules/lodash/_hashSet.js
var require_hashSet = __commonJS({
  "node_modules/lodash/_hashSet.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    function hashSet(key, value) {
      var data = this.__data__;
      this.size += this.has(key) ? 0 : 1;
      data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED : value;
      return this;
    }
    module.exports = hashSet;
  }
});

// node_modules/lodash/_Hash.js
var require_Hash = __commonJS({
  "node_modules/lodash/_Hash.js"(exports, module) {
    var hashClear = require_hashClear();
    var hashDelete = require_hashDelete();
    var hashGet = require_hashGet();
    var hashHas = require_hashHas();
    var hashSet = require_hashSet();
    function Hash(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    Hash.prototype.clear = hashClear;
    Hash.prototype["delete"] = hashDelete;
    Hash.prototype.get = hashGet;
    Hash.prototype.has = hashHas;
    Hash.prototype.set = hashSet;
    module.exports = Hash;
  }
});

// node_modules/lodash/_mapCacheClear.js
var require_mapCacheClear = __commonJS({
  "node_modules/lodash/_mapCacheClear.js"(exports, module) {
    var Hash = require_Hash();
    var ListCache = require_ListCache();
    var Map2 = require_Map();
    function mapCacheClear() {
      this.size = 0;
      this.__data__ = {
        "hash": new Hash(),
        "map": new (Map2 || ListCache)(),
        "string": new Hash()
      };
    }
    module.exports = mapCacheClear;
  }
});

// node_modules/lodash/_isKeyable.js
var require_isKeyable = __commonJS({
  "node_modules/lodash/_isKeyable.js"(exports, module) {
    function isKeyable(value) {
      var type = typeof value;
      return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
    }
    module.exports = isKeyable;
  }
});

// node_modules/lodash/_getMapData.js
var require_getMapData = __commonJS({
  "node_modules/lodash/_getMapData.js"(exports, module) {
    var isKeyable = require_isKeyable();
    function getMapData(map, key) {
      var data = map.__data__;
      return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
    }
    module.exports = getMapData;
  }
});

// node_modules/lodash/_mapCacheDelete.js
var require_mapCacheDelete = __commonJS({
  "node_modules/lodash/_mapCacheDelete.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheDelete(key) {
      var result = getMapData(this, key)["delete"](key);
      this.size -= result ? 1 : 0;
      return result;
    }
    module.exports = mapCacheDelete;
  }
});

// node_modules/lodash/_mapCacheGet.js
var require_mapCacheGet = __commonJS({
  "node_modules/lodash/_mapCacheGet.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheGet(key) {
      return getMapData(this, key).get(key);
    }
    module.exports = mapCacheGet;
  }
});

// node_modules/lodash/_mapCacheHas.js
var require_mapCacheHas = __commonJS({
  "node_modules/lodash/_mapCacheHas.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheHas(key) {
      return getMapData(this, key).has(key);
    }
    module.exports = mapCacheHas;
  }
});

// node_modules/lodash/_mapCacheSet.js
var require_mapCacheSet = __commonJS({
  "node_modules/lodash/_mapCacheSet.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheSet(key, value) {
      var data = getMapData(this, key), size = data.size;
      data.set(key, value);
      this.size += data.size == size ? 0 : 1;
      return this;
    }
    module.exports = mapCacheSet;
  }
});

// node_modules/lodash/_MapCache.js
var require_MapCache = __commonJS({
  "node_modules/lodash/_MapCache.js"(exports, module) {
    var mapCacheClear = require_mapCacheClear();
    var mapCacheDelete = require_mapCacheDelete();
    var mapCacheGet = require_mapCacheGet();
    var mapCacheHas = require_mapCacheHas();
    var mapCacheSet = require_mapCacheSet();
    function MapCache(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    MapCache.prototype.clear = mapCacheClear;
    MapCache.prototype["delete"] = mapCacheDelete;
    MapCache.prototype.get = mapCacheGet;
    MapCache.prototype.has = mapCacheHas;
    MapCache.prototype.set = mapCacheSet;
    module.exports = MapCache;
  }
});

// node_modules/lodash/_stackSet.js
var require_stackSet = __commonJS({
  "node_modules/lodash/_stackSet.js"(exports, module) {
    var ListCache = require_ListCache();
    var Map2 = require_Map();
    var MapCache = require_MapCache();
    var LARGE_ARRAY_SIZE = 200;
    function stackSet(key, value) {
      var data = this.__data__;
      if (data instanceof ListCache) {
        var pairs = data.__data__;
        if (!Map2 || pairs.length < LARGE_ARRAY_SIZE - 1) {
          pairs.push([key, value]);
          this.size = ++data.size;
          return this;
        }
        data = this.__data__ = new MapCache(pairs);
      }
      data.set(key, value);
      this.size = data.size;
      return this;
    }
    module.exports = stackSet;
  }
});

// node_modules/lodash/_Stack.js
var require_Stack = __commonJS({
  "node_modules/lodash/_Stack.js"(exports, module) {
    var ListCache = require_ListCache();
    var stackClear = require_stackClear();
    var stackDelete = require_stackDelete();
    var stackGet = require_stackGet();
    var stackHas = require_stackHas();
    var stackSet = require_stackSet();
    function Stack(entries) {
      var data = this.__data__ = new ListCache(entries);
      this.size = data.size;
    }
    Stack.prototype.clear = stackClear;
    Stack.prototype["delete"] = stackDelete;
    Stack.prototype.get = stackGet;
    Stack.prototype.has = stackHas;
    Stack.prototype.set = stackSet;
    module.exports = Stack;
  }
});

// node_modules/lodash/_arrayEach.js
var require_arrayEach = __commonJS({
  "node_modules/lodash/_arrayEach.js"(exports, module) {
    function arrayEach(array, iteratee) {
      var index = -1, length = array == null ? 0 : array.length;
      while (++index < length) {
        if (iteratee(array[index], index, array) === false) {
          break;
        }
      }
      return array;
    }
    module.exports = arrayEach;
  }
});

// node_modules/lodash/_defineProperty.js
var require_defineProperty = __commonJS({
  "node_modules/lodash/_defineProperty.js"(exports, module) {
    var getNative = require_getNative();
    var defineProperty = (function() {
      try {
        var func = getNative(Object, "defineProperty");
        func({}, "", {});
        return func;
      } catch (e2) {
      }
    })();
    module.exports = defineProperty;
  }
});

// node_modules/lodash/_baseAssignValue.js
var require_baseAssignValue = __commonJS({
  "node_modules/lodash/_baseAssignValue.js"(exports, module) {
    var defineProperty = require_defineProperty();
    function baseAssignValue(object, key, value) {
      if (key == "__proto__" && defineProperty) {
        defineProperty(object, key, {
          "configurable": true,
          "enumerable": true,
          "value": value,
          "writable": true
        });
      } else {
        object[key] = value;
      }
    }
    module.exports = baseAssignValue;
  }
});

// node_modules/lodash/_assignValue.js
var require_assignValue = __commonJS({
  "node_modules/lodash/_assignValue.js"(exports, module) {
    var baseAssignValue = require_baseAssignValue();
    var eq = require_eq();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function assignValue(object, key, value) {
      var objValue = object[key];
      if (!(hasOwnProperty.call(object, key) && eq(objValue, value)) || value === void 0 && !(key in object)) {
        baseAssignValue(object, key, value);
      }
    }
    module.exports = assignValue;
  }
});

// node_modules/lodash/_copyObject.js
var require_copyObject = __commonJS({
  "node_modules/lodash/_copyObject.js"(exports, module) {
    var assignValue = require_assignValue();
    var baseAssignValue = require_baseAssignValue();
    function copyObject(source, props, object, customizer) {
      var isNew = !object;
      object || (object = {});
      var index = -1, length = props.length;
      while (++index < length) {
        var key = props[index];
        var newValue = customizer ? customizer(object[key], source[key], key, object, source) : void 0;
        if (newValue === void 0) {
          newValue = source[key];
        }
        if (isNew) {
          baseAssignValue(object, key, newValue);
        } else {
          assignValue(object, key, newValue);
        }
      }
      return object;
    }
    module.exports = copyObject;
  }
});

// node_modules/lodash/_baseTimes.js
var require_baseTimes = __commonJS({
  "node_modules/lodash/_baseTimes.js"(exports, module) {
    function baseTimes(n2, iteratee) {
      var index = -1, result = Array(n2);
      while (++index < n2) {
        result[index] = iteratee(index);
      }
      return result;
    }
    module.exports = baseTimes;
  }
});

// node_modules/lodash/isObjectLike.js
var require_isObjectLike = __commonJS({
  "node_modules/lodash/isObjectLike.js"(exports, module) {
    function isObjectLike(value) {
      return value != null && typeof value == "object";
    }
    module.exports = isObjectLike;
  }
});

// node_modules/lodash/_baseIsArguments.js
var require_baseIsArguments = __commonJS({
  "node_modules/lodash/_baseIsArguments.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isObjectLike = require_isObjectLike();
    var argsTag = "[object Arguments]";
    function baseIsArguments(value) {
      return isObjectLike(value) && baseGetTag(value) == argsTag;
    }
    module.exports = baseIsArguments;
  }
});

// node_modules/lodash/isArguments.js
var require_isArguments = __commonJS({
  "node_modules/lodash/isArguments.js"(exports, module) {
    var baseIsArguments = require_baseIsArguments();
    var isObjectLike = require_isObjectLike();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var isArguments = baseIsArguments(/* @__PURE__ */ (function() {
      return arguments;
    })()) ? baseIsArguments : function(value) {
      return isObjectLike(value) && hasOwnProperty.call(value, "callee") && !propertyIsEnumerable.call(value, "callee");
    };
    module.exports = isArguments;
  }
});

// node_modules/lodash/isArray.js
var require_isArray = __commonJS({
  "node_modules/lodash/isArray.js"(exports, module) {
    var isArray = Array.isArray;
    module.exports = isArray;
  }
});

// node_modules/lodash/stubFalse.js
var require_stubFalse = __commonJS({
  "node_modules/lodash/stubFalse.js"(exports, module) {
    function stubFalse() {
      return false;
    }
    module.exports = stubFalse;
  }
});

// node_modules/lodash/isBuffer.js
var require_isBuffer = __commonJS({
  "node_modules/lodash/isBuffer.js"(exports, module) {
    var root = require_root();
    var stubFalse = require_stubFalse();
    var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
    var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var Buffer2 = moduleExports ? root.Buffer : void 0;
    var nativeIsBuffer = Buffer2 ? Buffer2.isBuffer : void 0;
    var isBuffer = nativeIsBuffer || stubFalse;
    module.exports = isBuffer;
  }
});

// node_modules/lodash/_isIndex.js
var require_isIndex = __commonJS({
  "node_modules/lodash/_isIndex.js"(exports, module) {
    var MAX_SAFE_INTEGER = 9007199254740991;
    var reIsUint = /^(?:0|[1-9]\d*)$/;
    function isIndex(value, length) {
      var type = typeof value;
      length = length == null ? MAX_SAFE_INTEGER : length;
      return !!length && (type == "number" || type != "symbol" && reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
    }
    module.exports = isIndex;
  }
});

// node_modules/lodash/isLength.js
var require_isLength = __commonJS({
  "node_modules/lodash/isLength.js"(exports, module) {
    var MAX_SAFE_INTEGER = 9007199254740991;
    function isLength(value) {
      return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
    }
    module.exports = isLength;
  }
});

// node_modules/lodash/_baseIsTypedArray.js
var require_baseIsTypedArray = __commonJS({
  "node_modules/lodash/_baseIsTypedArray.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isLength = require_isLength();
    var isObjectLike = require_isObjectLike();
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var funcTag = "[object Function]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var objectTag = "[object Object]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var weakMapTag = "[object WeakMap]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var float32Tag = "[object Float32Array]";
    var float64Tag = "[object Float64Array]";
    var int8Tag = "[object Int8Array]";
    var int16Tag = "[object Int16Array]";
    var int32Tag = "[object Int32Array]";
    var uint8Tag = "[object Uint8Array]";
    var uint8ClampedTag = "[object Uint8ClampedArray]";
    var uint16Tag = "[object Uint16Array]";
    var uint32Tag = "[object Uint32Array]";
    var typedArrayTags = {};
    typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
    typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dataViewTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
    function baseIsTypedArray(value) {
      return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
    }
    module.exports = baseIsTypedArray;
  }
});

// node_modules/lodash/_baseUnary.js
var require_baseUnary = __commonJS({
  "node_modules/lodash/_baseUnary.js"(exports, module) {
    function baseUnary(func) {
      return function(value) {
        return func(value);
      };
    }
    module.exports = baseUnary;
  }
});

// node_modules/lodash/_nodeUtil.js
var require_nodeUtil = __commonJS({
  "node_modules/lodash/_nodeUtil.js"(exports, module) {
    var freeGlobal = require_freeGlobal();
    var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
    var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var freeProcess = moduleExports && freeGlobal.process;
    var nodeUtil = (function() {
      try {
        var types = freeModule && freeModule.require && freeModule.require("util").types;
        if (types) {
          return types;
        }
        return freeProcess && freeProcess.binding && freeProcess.binding("util");
      } catch (e2) {
      }
    })();
    module.exports = nodeUtil;
  }
});

// node_modules/lodash/isTypedArray.js
var require_isTypedArray = __commonJS({
  "node_modules/lodash/isTypedArray.js"(exports, module) {
    var baseIsTypedArray = require_baseIsTypedArray();
    var baseUnary = require_baseUnary();
    var nodeUtil = require_nodeUtil();
    var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;
    var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;
    module.exports = isTypedArray;
  }
});

// node_modules/lodash/_arrayLikeKeys.js
var require_arrayLikeKeys = __commonJS({
  "node_modules/lodash/_arrayLikeKeys.js"(exports, module) {
    var baseTimes = require_baseTimes();
    var isArguments = require_isArguments();
    var isArray = require_isArray();
    var isBuffer = require_isBuffer();
    var isIndex = require_isIndex();
    var isTypedArray = require_isTypedArray();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function arrayLikeKeys(value, inherited) {
      var isArr = isArray(value), isArg = !isArr && isArguments(value), isBuff = !isArr && !isArg && isBuffer(value), isType = !isArr && !isArg && !isBuff && isTypedArray(value), skipIndexes = isArr || isArg || isBuff || isType, result = skipIndexes ? baseTimes(value.length, String) : [], length = result.length;
      for (var key in value) {
        if ((inherited || hasOwnProperty.call(value, key)) && !(skipIndexes && // Safari 9 has enumerable `arguments.length` in strict mode.
        (key == "length" || // Node.js 0.10 has enumerable non-index properties on buffers.
        isBuff && (key == "offset" || key == "parent") || // PhantomJS 2 has enumerable non-index properties on typed arrays.
        isType && (key == "buffer" || key == "byteLength" || key == "byteOffset") || // Skip index properties.
        isIndex(key, length)))) {
          result.push(key);
        }
      }
      return result;
    }
    module.exports = arrayLikeKeys;
  }
});

// node_modules/lodash/_isPrototype.js
var require_isPrototype = __commonJS({
  "node_modules/lodash/_isPrototype.js"(exports, module) {
    var objectProto = Object.prototype;
    function isPrototype(value) {
      var Ctor = value && value.constructor, proto = typeof Ctor == "function" && Ctor.prototype || objectProto;
      return value === proto;
    }
    module.exports = isPrototype;
  }
});

// node_modules/lodash/_overArg.js
var require_overArg = __commonJS({
  "node_modules/lodash/_overArg.js"(exports, module) {
    function overArg(func, transform) {
      return function(arg) {
        return func(transform(arg));
      };
    }
    module.exports = overArg;
  }
});

// node_modules/lodash/_nativeKeys.js
var require_nativeKeys = __commonJS({
  "node_modules/lodash/_nativeKeys.js"(exports, module) {
    var overArg = require_overArg();
    var nativeKeys = overArg(Object.keys, Object);
    module.exports = nativeKeys;
  }
});

// node_modules/lodash/_baseKeys.js
var require_baseKeys = __commonJS({
  "node_modules/lodash/_baseKeys.js"(exports, module) {
    var isPrototype = require_isPrototype();
    var nativeKeys = require_nativeKeys();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function baseKeys(object) {
      if (!isPrototype(object)) {
        return nativeKeys(object);
      }
      var result = [];
      for (var key in Object(object)) {
        if (hasOwnProperty.call(object, key) && key != "constructor") {
          result.push(key);
        }
      }
      return result;
    }
    module.exports = baseKeys;
  }
});

// node_modules/lodash/isArrayLike.js
var require_isArrayLike = __commonJS({
  "node_modules/lodash/isArrayLike.js"(exports, module) {
    var isFunction = require_isFunction();
    var isLength = require_isLength();
    function isArrayLike(value) {
      return value != null && isLength(value.length) && !isFunction(value);
    }
    module.exports = isArrayLike;
  }
});

// node_modules/lodash/keys.js
var require_keys = __commonJS({
  "node_modules/lodash/keys.js"(exports, module) {
    var arrayLikeKeys = require_arrayLikeKeys();
    var baseKeys = require_baseKeys();
    var isArrayLike = require_isArrayLike();
    function keys(object) {
      return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
    }
    module.exports = keys;
  }
});

// node_modules/lodash/_baseAssign.js
var require_baseAssign = __commonJS({
  "node_modules/lodash/_baseAssign.js"(exports, module) {
    var copyObject = require_copyObject();
    var keys = require_keys();
    function baseAssign(object, source) {
      return object && copyObject(source, keys(source), object);
    }
    module.exports = baseAssign;
  }
});

// node_modules/lodash/_nativeKeysIn.js
var require_nativeKeysIn = __commonJS({
  "node_modules/lodash/_nativeKeysIn.js"(exports, module) {
    function nativeKeysIn(object) {
      var result = [];
      if (object != null) {
        for (var key in Object(object)) {
          result.push(key);
        }
      }
      return result;
    }
    module.exports = nativeKeysIn;
  }
});

// node_modules/lodash/_baseKeysIn.js
var require_baseKeysIn = __commonJS({
  "node_modules/lodash/_baseKeysIn.js"(exports, module) {
    var isObject3 = require_isObject();
    var isPrototype = require_isPrototype();
    var nativeKeysIn = require_nativeKeysIn();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function baseKeysIn(object) {
      if (!isObject3(object)) {
        return nativeKeysIn(object);
      }
      var isProto = isPrototype(object), result = [];
      for (var key in object) {
        if (!(key == "constructor" && (isProto || !hasOwnProperty.call(object, key)))) {
          result.push(key);
        }
      }
      return result;
    }
    module.exports = baseKeysIn;
  }
});

// node_modules/lodash/keysIn.js
var require_keysIn = __commonJS({
  "node_modules/lodash/keysIn.js"(exports, module) {
    var arrayLikeKeys = require_arrayLikeKeys();
    var baseKeysIn = require_baseKeysIn();
    var isArrayLike = require_isArrayLike();
    function keysIn(object) {
      return isArrayLike(object) ? arrayLikeKeys(object, true) : baseKeysIn(object);
    }
    module.exports = keysIn;
  }
});

// node_modules/lodash/_baseAssignIn.js
var require_baseAssignIn = __commonJS({
  "node_modules/lodash/_baseAssignIn.js"(exports, module) {
    var copyObject = require_copyObject();
    var keysIn = require_keysIn();
    function baseAssignIn(object, source) {
      return object && copyObject(source, keysIn(source), object);
    }
    module.exports = baseAssignIn;
  }
});

// node_modules/lodash/_cloneBuffer.js
var require_cloneBuffer = __commonJS({
  "node_modules/lodash/_cloneBuffer.js"(exports, module) {
    var root = require_root();
    var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
    var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var Buffer2 = moduleExports ? root.Buffer : void 0;
    var allocUnsafe = Buffer2 ? Buffer2.allocUnsafe : void 0;
    function cloneBuffer(buffer, isDeep) {
      if (isDeep) {
        return buffer.slice();
      }
      var length = buffer.length, result = allocUnsafe ? allocUnsafe(length) : new buffer.constructor(length);
      buffer.copy(result);
      return result;
    }
    module.exports = cloneBuffer;
  }
});

// node_modules/lodash/_copyArray.js
var require_copyArray = __commonJS({
  "node_modules/lodash/_copyArray.js"(exports, module) {
    function copyArray(source, array) {
      var index = -1, length = source.length;
      array || (array = Array(length));
      while (++index < length) {
        array[index] = source[index];
      }
      return array;
    }
    module.exports = copyArray;
  }
});

// node_modules/lodash/_arrayFilter.js
var require_arrayFilter = __commonJS({
  "node_modules/lodash/_arrayFilter.js"(exports, module) {
    function arrayFilter(array, predicate) {
      var index = -1, length = array == null ? 0 : array.length, resIndex = 0, result = [];
      while (++index < length) {
        var value = array[index];
        if (predicate(value, index, array)) {
          result[resIndex++] = value;
        }
      }
      return result;
    }
    module.exports = arrayFilter;
  }
});

// node_modules/lodash/stubArray.js
var require_stubArray = __commonJS({
  "node_modules/lodash/stubArray.js"(exports, module) {
    function stubArray() {
      return [];
    }
    module.exports = stubArray;
  }
});

// node_modules/lodash/_getSymbols.js
var require_getSymbols = __commonJS({
  "node_modules/lodash/_getSymbols.js"(exports, module) {
    var arrayFilter = require_arrayFilter();
    var stubArray = require_stubArray();
    var objectProto = Object.prototype;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var nativeGetSymbols = Object.getOwnPropertySymbols;
    var getSymbols = !nativeGetSymbols ? stubArray : function(object) {
      if (object == null) {
        return [];
      }
      object = Object(object);
      return arrayFilter(nativeGetSymbols(object), function(symbol) {
        return propertyIsEnumerable.call(object, symbol);
      });
    };
    module.exports = getSymbols;
  }
});

// node_modules/lodash/_copySymbols.js
var require_copySymbols = __commonJS({
  "node_modules/lodash/_copySymbols.js"(exports, module) {
    var copyObject = require_copyObject();
    var getSymbols = require_getSymbols();
    function copySymbols(source, object) {
      return copyObject(source, getSymbols(source), object);
    }
    module.exports = copySymbols;
  }
});

// node_modules/lodash/_arrayPush.js
var require_arrayPush = __commonJS({
  "node_modules/lodash/_arrayPush.js"(exports, module) {
    function arrayPush(array, values) {
      var index = -1, length = values.length, offset = array.length;
      while (++index < length) {
        array[offset + index] = values[index];
      }
      return array;
    }
    module.exports = arrayPush;
  }
});

// node_modules/lodash/_getPrototype.js
var require_getPrototype = __commonJS({
  "node_modules/lodash/_getPrototype.js"(exports, module) {
    var overArg = require_overArg();
    var getPrototype = overArg(Object.getPrototypeOf, Object);
    module.exports = getPrototype;
  }
});

// node_modules/lodash/_getSymbolsIn.js
var require_getSymbolsIn = __commonJS({
  "node_modules/lodash/_getSymbolsIn.js"(exports, module) {
    var arrayPush = require_arrayPush();
    var getPrototype = require_getPrototype();
    var getSymbols = require_getSymbols();
    var stubArray = require_stubArray();
    var nativeGetSymbols = Object.getOwnPropertySymbols;
    var getSymbolsIn = !nativeGetSymbols ? stubArray : function(object) {
      var result = [];
      while (object) {
        arrayPush(result, getSymbols(object));
        object = getPrototype(object);
      }
      return result;
    };
    module.exports = getSymbolsIn;
  }
});

// node_modules/lodash/_copySymbolsIn.js
var require_copySymbolsIn = __commonJS({
  "node_modules/lodash/_copySymbolsIn.js"(exports, module) {
    var copyObject = require_copyObject();
    var getSymbolsIn = require_getSymbolsIn();
    function copySymbolsIn(source, object) {
      return copyObject(source, getSymbolsIn(source), object);
    }
    module.exports = copySymbolsIn;
  }
});

// node_modules/lodash/_baseGetAllKeys.js
var require_baseGetAllKeys = __commonJS({
  "node_modules/lodash/_baseGetAllKeys.js"(exports, module) {
    var arrayPush = require_arrayPush();
    var isArray = require_isArray();
    function baseGetAllKeys(object, keysFunc, symbolsFunc) {
      var result = keysFunc(object);
      return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
    }
    module.exports = baseGetAllKeys;
  }
});

// node_modules/lodash/_getAllKeys.js
var require_getAllKeys = __commonJS({
  "node_modules/lodash/_getAllKeys.js"(exports, module) {
    var baseGetAllKeys = require_baseGetAllKeys();
    var getSymbols = require_getSymbols();
    var keys = require_keys();
    function getAllKeys(object) {
      return baseGetAllKeys(object, keys, getSymbols);
    }
    module.exports = getAllKeys;
  }
});

// node_modules/lodash/_getAllKeysIn.js
var require_getAllKeysIn = __commonJS({
  "node_modules/lodash/_getAllKeysIn.js"(exports, module) {
    var baseGetAllKeys = require_baseGetAllKeys();
    var getSymbolsIn = require_getSymbolsIn();
    var keysIn = require_keysIn();
    function getAllKeysIn(object) {
      return baseGetAllKeys(object, keysIn, getSymbolsIn);
    }
    module.exports = getAllKeysIn;
  }
});

// node_modules/lodash/_DataView.js
var require_DataView = __commonJS({
  "node_modules/lodash/_DataView.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var DataView = getNative(root, "DataView");
    module.exports = DataView;
  }
});

// node_modules/lodash/_Promise.js
var require_Promise = __commonJS({
  "node_modules/lodash/_Promise.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var Promise2 = getNative(root, "Promise");
    module.exports = Promise2;
  }
});

// node_modules/lodash/_Set.js
var require_Set = __commonJS({
  "node_modules/lodash/_Set.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var Set2 = getNative(root, "Set");
    module.exports = Set2;
  }
});

// node_modules/lodash/_WeakMap.js
var require_WeakMap = __commonJS({
  "node_modules/lodash/_WeakMap.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var WeakMap2 = getNative(root, "WeakMap");
    module.exports = WeakMap2;
  }
});

// node_modules/lodash/_getTag.js
var require_getTag = __commonJS({
  "node_modules/lodash/_getTag.js"(exports, module) {
    var DataView = require_DataView();
    var Map2 = require_Map();
    var Promise2 = require_Promise();
    var Set2 = require_Set();
    var WeakMap2 = require_WeakMap();
    var baseGetTag = require_baseGetTag();
    var toSource = require_toSource();
    var mapTag = "[object Map]";
    var objectTag = "[object Object]";
    var promiseTag = "[object Promise]";
    var setTag = "[object Set]";
    var weakMapTag = "[object WeakMap]";
    var dataViewTag = "[object DataView]";
    var dataViewCtorString = toSource(DataView);
    var mapCtorString = toSource(Map2);
    var promiseCtorString = toSource(Promise2);
    var setCtorString = toSource(Set2);
    var weakMapCtorString = toSource(WeakMap2);
    var getTag = baseGetTag;
    if (DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag || Map2 && getTag(new Map2()) != mapTag || Promise2 && getTag(Promise2.resolve()) != promiseTag || Set2 && getTag(new Set2()) != setTag || WeakMap2 && getTag(new WeakMap2()) != weakMapTag) {
      getTag = function(value) {
        var result = baseGetTag(value), Ctor = result == objectTag ? value.constructor : void 0, ctorString = Ctor ? toSource(Ctor) : "";
        if (ctorString) {
          switch (ctorString) {
            case dataViewCtorString:
              return dataViewTag;
            case mapCtorString:
              return mapTag;
            case promiseCtorString:
              return promiseTag;
            case setCtorString:
              return setTag;
            case weakMapCtorString:
              return weakMapTag;
          }
        }
        return result;
      };
    }
    module.exports = getTag;
  }
});

// node_modules/lodash/_initCloneArray.js
var require_initCloneArray = __commonJS({
  "node_modules/lodash/_initCloneArray.js"(exports, module) {
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function initCloneArray(array) {
      var length = array.length, result = new array.constructor(length);
      if (length && typeof array[0] == "string" && hasOwnProperty.call(array, "index")) {
        result.index = array.index;
        result.input = array.input;
      }
      return result;
    }
    module.exports = initCloneArray;
  }
});

// node_modules/lodash/_Uint8Array.js
var require_Uint8Array = __commonJS({
  "node_modules/lodash/_Uint8Array.js"(exports, module) {
    var root = require_root();
    var Uint8Array2 = root.Uint8Array;
    module.exports = Uint8Array2;
  }
});

// node_modules/lodash/_cloneArrayBuffer.js
var require_cloneArrayBuffer = __commonJS({
  "node_modules/lodash/_cloneArrayBuffer.js"(exports, module) {
    var Uint8Array2 = require_Uint8Array();
    function cloneArrayBuffer(arrayBuffer) {
      var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
      new Uint8Array2(result).set(new Uint8Array2(arrayBuffer));
      return result;
    }
    module.exports = cloneArrayBuffer;
  }
});

// node_modules/lodash/_cloneDataView.js
var require_cloneDataView = __commonJS({
  "node_modules/lodash/_cloneDataView.js"(exports, module) {
    var cloneArrayBuffer = require_cloneArrayBuffer();
    function cloneDataView(dataView, isDeep) {
      var buffer = isDeep ? cloneArrayBuffer(dataView.buffer) : dataView.buffer;
      return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
    }
    module.exports = cloneDataView;
  }
});

// node_modules/lodash/_cloneRegExp.js
var require_cloneRegExp = __commonJS({
  "node_modules/lodash/_cloneRegExp.js"(exports, module) {
    var reFlags = /\w*$/;
    function cloneRegExp(regexp) {
      var result = new regexp.constructor(regexp.source, reFlags.exec(regexp));
      result.lastIndex = regexp.lastIndex;
      return result;
    }
    module.exports = cloneRegExp;
  }
});

// node_modules/lodash/_cloneSymbol.js
var require_cloneSymbol = __commonJS({
  "node_modules/lodash/_cloneSymbol.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolValueOf = symbolProto ? symbolProto.valueOf : void 0;
    function cloneSymbol(symbol) {
      return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {};
    }
    module.exports = cloneSymbol;
  }
});

// node_modules/lodash/_cloneTypedArray.js
var require_cloneTypedArray = __commonJS({
  "node_modules/lodash/_cloneTypedArray.js"(exports, module) {
    var cloneArrayBuffer = require_cloneArrayBuffer();
    function cloneTypedArray(typedArray, isDeep) {
      var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
      return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
    }
    module.exports = cloneTypedArray;
  }
});

// node_modules/lodash/_initCloneByTag.js
var require_initCloneByTag = __commonJS({
  "node_modules/lodash/_initCloneByTag.js"(exports, module) {
    var cloneArrayBuffer = require_cloneArrayBuffer();
    var cloneDataView = require_cloneDataView();
    var cloneRegExp = require_cloneRegExp();
    var cloneSymbol = require_cloneSymbol();
    var cloneTypedArray = require_cloneTypedArray();
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var symbolTag = "[object Symbol]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var float32Tag = "[object Float32Array]";
    var float64Tag = "[object Float64Array]";
    var int8Tag = "[object Int8Array]";
    var int16Tag = "[object Int16Array]";
    var int32Tag = "[object Int32Array]";
    var uint8Tag = "[object Uint8Array]";
    var uint8ClampedTag = "[object Uint8ClampedArray]";
    var uint16Tag = "[object Uint16Array]";
    var uint32Tag = "[object Uint32Array]";
    function initCloneByTag(object, tag, isDeep) {
      var Ctor = object.constructor;
      switch (tag) {
        case arrayBufferTag:
          return cloneArrayBuffer(object);
        case boolTag:
        case dateTag:
          return new Ctor(+object);
        case dataViewTag:
          return cloneDataView(object, isDeep);
        case float32Tag:
        case float64Tag:
        case int8Tag:
        case int16Tag:
        case int32Tag:
        case uint8Tag:
        case uint8ClampedTag:
        case uint16Tag:
        case uint32Tag:
          return cloneTypedArray(object, isDeep);
        case mapTag:
          return new Ctor();
        case numberTag:
        case stringTag:
          return new Ctor(object);
        case regexpTag:
          return cloneRegExp(object);
        case setTag:
          return new Ctor();
        case symbolTag:
          return cloneSymbol(object);
      }
    }
    module.exports = initCloneByTag;
  }
});

// node_modules/lodash/_baseCreate.js
var require_baseCreate = __commonJS({
  "node_modules/lodash/_baseCreate.js"(exports, module) {
    var isObject3 = require_isObject();
    var objectCreate = Object.create;
    var baseCreate = /* @__PURE__ */ (function() {
      function object() {
      }
      return function(proto) {
        if (!isObject3(proto)) {
          return {};
        }
        if (objectCreate) {
          return objectCreate(proto);
        }
        object.prototype = proto;
        var result = new object();
        object.prototype = void 0;
        return result;
      };
    })();
    module.exports = baseCreate;
  }
});

// node_modules/lodash/_initCloneObject.js
var require_initCloneObject = __commonJS({
  "node_modules/lodash/_initCloneObject.js"(exports, module) {
    var baseCreate = require_baseCreate();
    var getPrototype = require_getPrototype();
    var isPrototype = require_isPrototype();
    function initCloneObject(object) {
      return typeof object.constructor == "function" && !isPrototype(object) ? baseCreate(getPrototype(object)) : {};
    }
    module.exports = initCloneObject;
  }
});

// node_modules/lodash/_baseIsMap.js
var require_baseIsMap = __commonJS({
  "node_modules/lodash/_baseIsMap.js"(exports, module) {
    var getTag = require_getTag();
    var isObjectLike = require_isObjectLike();
    var mapTag = "[object Map]";
    function baseIsMap(value) {
      return isObjectLike(value) && getTag(value) == mapTag;
    }
    module.exports = baseIsMap;
  }
});

// node_modules/lodash/isMap.js
var require_isMap = __commonJS({
  "node_modules/lodash/isMap.js"(exports, module) {
    var baseIsMap = require_baseIsMap();
    var baseUnary = require_baseUnary();
    var nodeUtil = require_nodeUtil();
    var nodeIsMap = nodeUtil && nodeUtil.isMap;
    var isMap = nodeIsMap ? baseUnary(nodeIsMap) : baseIsMap;
    module.exports = isMap;
  }
});

// node_modules/lodash/_baseIsSet.js
var require_baseIsSet = __commonJS({
  "node_modules/lodash/_baseIsSet.js"(exports, module) {
    var getTag = require_getTag();
    var isObjectLike = require_isObjectLike();
    var setTag = "[object Set]";
    function baseIsSet(value) {
      return isObjectLike(value) && getTag(value) == setTag;
    }
    module.exports = baseIsSet;
  }
});

// node_modules/lodash/isSet.js
var require_isSet = __commonJS({
  "node_modules/lodash/isSet.js"(exports, module) {
    var baseIsSet = require_baseIsSet();
    var baseUnary = require_baseUnary();
    var nodeUtil = require_nodeUtil();
    var nodeIsSet = nodeUtil && nodeUtil.isSet;
    var isSet = nodeIsSet ? baseUnary(nodeIsSet) : baseIsSet;
    module.exports = isSet;
  }
});

// node_modules/lodash/_baseClone.js
var require_baseClone = __commonJS({
  "node_modules/lodash/_baseClone.js"(exports, module) {
    var Stack = require_Stack();
    var arrayEach = require_arrayEach();
    var assignValue = require_assignValue();
    var baseAssign = require_baseAssign();
    var baseAssignIn = require_baseAssignIn();
    var cloneBuffer = require_cloneBuffer();
    var copyArray = require_copyArray();
    var copySymbols = require_copySymbols();
    var copySymbolsIn = require_copySymbolsIn();
    var getAllKeys = require_getAllKeys();
    var getAllKeysIn = require_getAllKeysIn();
    var getTag = require_getTag();
    var initCloneArray = require_initCloneArray();
    var initCloneByTag = require_initCloneByTag();
    var initCloneObject = require_initCloneObject();
    var isArray = require_isArray();
    var isBuffer = require_isBuffer();
    var isMap = require_isMap();
    var isObject3 = require_isObject();
    var isSet = require_isSet();
    var keys = require_keys();
    var keysIn = require_keysIn();
    var CLONE_DEEP_FLAG = 1;
    var CLONE_FLAT_FLAG = 2;
    var CLONE_SYMBOLS_FLAG = 4;
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var objectTag = "[object Object]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var symbolTag = "[object Symbol]";
    var weakMapTag = "[object WeakMap]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var float32Tag = "[object Float32Array]";
    var float64Tag = "[object Float64Array]";
    var int8Tag = "[object Int8Array]";
    var int16Tag = "[object Int16Array]";
    var int32Tag = "[object Int32Array]";
    var uint8Tag = "[object Uint8Array]";
    var uint8ClampedTag = "[object Uint8ClampedArray]";
    var uint16Tag = "[object Uint16Array]";
    var uint32Tag = "[object Uint32Array]";
    var cloneableTags = {};
    cloneableTags[argsTag] = cloneableTags[arrayTag] = cloneableTags[arrayBufferTag] = cloneableTags[dataViewTag] = cloneableTags[boolTag] = cloneableTags[dateTag] = cloneableTags[float32Tag] = cloneableTags[float64Tag] = cloneableTags[int8Tag] = cloneableTags[int16Tag] = cloneableTags[int32Tag] = cloneableTags[mapTag] = cloneableTags[numberTag] = cloneableTags[objectTag] = cloneableTags[regexpTag] = cloneableTags[setTag] = cloneableTags[stringTag] = cloneableTags[symbolTag] = cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] = cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
    cloneableTags[errorTag] = cloneableTags[funcTag] = cloneableTags[weakMapTag] = false;
    function baseClone(value, bitmask, customizer, key, object, stack) {
      var result, isDeep = bitmask & CLONE_DEEP_FLAG, isFlat = bitmask & CLONE_FLAT_FLAG, isFull = bitmask & CLONE_SYMBOLS_FLAG;
      if (customizer) {
        result = object ? customizer(value, key, object, stack) : customizer(value);
      }
      if (result !== void 0) {
        return result;
      }
      if (!isObject3(value)) {
        return value;
      }
      var isArr = isArray(value);
      if (isArr) {
        result = initCloneArray(value);
        if (!isDeep) {
          return copyArray(value, result);
        }
      } else {
        var tag = getTag(value), isFunc = tag == funcTag || tag == genTag;
        if (isBuffer(value)) {
          return cloneBuffer(value, isDeep);
        }
        if (tag == objectTag || tag == argsTag || isFunc && !object) {
          result = isFlat || isFunc ? {} : initCloneObject(value);
          if (!isDeep) {
            return isFlat ? copySymbolsIn(value, baseAssignIn(result, value)) : copySymbols(value, baseAssign(result, value));
          }
        } else {
          if (!cloneableTags[tag]) {
            return object ? value : {};
          }
          result = initCloneByTag(value, tag, isDeep);
        }
      }
      stack || (stack = new Stack());
      var stacked = stack.get(value);
      if (stacked) {
        return stacked;
      }
      stack.set(value, result);
      if (isSet(value)) {
        value.forEach(function(subValue) {
          result.add(baseClone(subValue, bitmask, customizer, subValue, value, stack));
        });
      } else if (isMap(value)) {
        value.forEach(function(subValue, key2) {
          result.set(key2, baseClone(subValue, bitmask, customizer, key2, value, stack));
        });
      }
      var keysFunc = isFull ? isFlat ? getAllKeysIn : getAllKeys : isFlat ? keysIn : keys;
      var props = isArr ? void 0 : keysFunc(value);
      arrayEach(props || value, function(subValue, key2) {
        if (props) {
          key2 = subValue;
          subValue = value[key2];
        }
        assignValue(result, key2, baseClone(subValue, bitmask, customizer, key2, value, stack));
      });
      return result;
    }
    module.exports = baseClone;
  }
});

// node_modules/lodash/cloneDeep.js
var require_cloneDeep = __commonJS({
  "node_modules/lodash/cloneDeep.js"(exports, module) {
    var baseClone = require_baseClone();
    var CLONE_DEEP_FLAG = 1;
    var CLONE_SYMBOLS_FLAG = 4;
    function cloneDeep6(value) {
      return baseClone(value, CLONE_DEEP_FLAG | CLONE_SYMBOLS_FLAG);
    }
    module.exports = cloneDeep6;
  }
});

// node_modules/rbush/rbush.min.js
var require_rbush_min = __commonJS({
  "node_modules/rbush/rbush.min.js"(exports, module) {
    !(function(t2, i2) {
      "object" == typeof exports && "undefined" != typeof module ? module.exports = i2() : "function" == typeof define && define.amd ? define(i2) : (t2 = t2 || self).RBush = i2();
    })(exports, function() {
      "use strict";
      function t2(t3, r3, e3, a3, h3) {
        !(function t4(n3, r4, e4, a4, h4) {
          for (; a4 > e4; ) {
            if (a4 - e4 > 600) {
              var o3 = a4 - e4 + 1, s3 = r4 - e4 + 1, l3 = Math.log(o3), f3 = 0.5 * Math.exp(2 * l3 / 3), u3 = 0.5 * Math.sqrt(l3 * f3 * (o3 - f3) / o3) * (s3 - o3 / 2 < 0 ? -1 : 1), m3 = Math.max(e4, Math.floor(r4 - s3 * f3 / o3 + u3)), c3 = Math.min(a4, Math.floor(r4 + (o3 - s3) * f3 / o3 + u3));
              t4(n3, r4, m3, c3, h4);
            }
            var p3 = n3[r4], d3 = e4, x2 = a4;
            for (i2(n3, e4, r4), h4(n3[a4], p3) > 0 && i2(n3, e4, a4); d3 < x2; ) {
              for (i2(n3, d3, x2), d3++, x2--; h4(n3[d3], p3) < 0; ) d3++;
              for (; h4(n3[x2], p3) > 0; ) x2--;
            }
            0 === h4(n3[e4], p3) ? i2(n3, e4, x2) : i2(n3, ++x2, a4), x2 <= r4 && (e4 = x2 + 1), r4 <= x2 && (a4 = x2 - 1);
          }
        })(t3, r3, e3 || 0, a3 || t3.length - 1, h3 || n2);
      }
      function i2(t3, i3, n3) {
        var r3 = t3[i3];
        t3[i3] = t3[n3], t3[n3] = r3;
      }
      function n2(t3, i3) {
        return t3 < i3 ? -1 : t3 > i3 ? 1 : 0;
      }
      var r2 = function(t3) {
        void 0 === t3 && (t3 = 9), this._maxEntries = Math.max(4, t3), this._minEntries = Math.max(2, Math.ceil(0.4 * this._maxEntries)), this.clear();
      };
      function e2(t3, i3, n3) {
        if (!n3) return i3.indexOf(t3);
        for (var r3 = 0; r3 < i3.length; r3++) if (n3(t3, i3[r3])) return r3;
        return -1;
      }
      function a2(t3, i3) {
        h2(t3, 0, t3.children.length, i3, t3);
      }
      function h2(t3, i3, n3, r3, e3) {
        e3 || (e3 = p2(null)), e3.minX = 1 / 0, e3.minY = 1 / 0, e3.maxX = -1 / 0, e3.maxY = -1 / 0;
        for (var a3 = i3; a3 < n3; a3++) {
          var h3 = t3.children[a3];
          o2(e3, t3.leaf ? r3(h3) : h3);
        }
        return e3;
      }
      function o2(t3, i3) {
        return t3.minX = Math.min(t3.minX, i3.minX), t3.minY = Math.min(t3.minY, i3.minY), t3.maxX = Math.max(t3.maxX, i3.maxX), t3.maxY = Math.max(t3.maxY, i3.maxY), t3;
      }
      function s2(t3, i3) {
        return t3.minX - i3.minX;
      }
      function l2(t3, i3) {
        return t3.minY - i3.minY;
      }
      function f2(t3) {
        return (t3.maxX - t3.minX) * (t3.maxY - t3.minY);
      }
      function u2(t3) {
        return t3.maxX - t3.minX + (t3.maxY - t3.minY);
      }
      function m2(t3, i3) {
        return t3.minX <= i3.minX && t3.minY <= i3.minY && i3.maxX <= t3.maxX && i3.maxY <= t3.maxY;
      }
      function c2(t3, i3) {
        return i3.minX <= t3.maxX && i3.minY <= t3.maxY && i3.maxX >= t3.minX && i3.maxY >= t3.minY;
      }
      function p2(t3) {
        return { children: t3, height: 1, leaf: true, minX: 1 / 0, minY: 1 / 0, maxX: -1 / 0, maxY: -1 / 0 };
      }
      function d2(i3, n3, r3, e3, a3) {
        for (var h3 = [n3, r3]; h3.length; ) if (!((r3 = h3.pop()) - (n3 = h3.pop()) <= e3)) {
          var o3 = n3 + Math.ceil((r3 - n3) / e3 / 2) * e3;
          t2(i3, o3, n3, r3, a3), h3.push(n3, o3, o3, r3);
        }
      }
      return r2.prototype.all = function() {
        return this._all(this.data, []);
      }, r2.prototype.search = function(t3) {
        var i3 = this.data, n3 = [];
        if (!c2(t3, i3)) return n3;
        for (var r3 = this.toBBox, e3 = []; i3; ) {
          for (var a3 = 0; a3 < i3.children.length; a3++) {
            var h3 = i3.children[a3], o3 = i3.leaf ? r3(h3) : h3;
            c2(t3, o3) && (i3.leaf ? n3.push(h3) : m2(t3, o3) ? this._all(h3, n3) : e3.push(h3));
          }
          i3 = e3.pop();
        }
        return n3;
      }, r2.prototype.collides = function(t3) {
        var i3 = this.data;
        if (!c2(t3, i3)) return false;
        for (var n3 = []; i3; ) {
          for (var r3 = 0; r3 < i3.children.length; r3++) {
            var e3 = i3.children[r3], a3 = i3.leaf ? this.toBBox(e3) : e3;
            if (c2(t3, a3)) {
              if (i3.leaf || m2(t3, a3)) return true;
              n3.push(e3);
            }
          }
          i3 = n3.pop();
        }
        return false;
      }, r2.prototype.load = function(t3) {
        if (!t3 || !t3.length) return this;
        if (t3.length < this._minEntries) {
          for (var i3 = 0; i3 < t3.length; i3++) this.insert(t3[i3]);
          return this;
        }
        var n3 = this._build(t3.slice(), 0, t3.length - 1, 0);
        if (this.data.children.length) if (this.data.height === n3.height) this._splitRoot(this.data, n3);
        else {
          if (this.data.height < n3.height) {
            var r3 = this.data;
            this.data = n3, n3 = r3;
          }
          this._insert(n3, this.data.height - n3.height - 1, true);
        }
        else this.data = n3;
        return this;
      }, r2.prototype.insert = function(t3) {
        return t3 && this._insert(t3, this.data.height - 1), this;
      }, r2.prototype.clear = function() {
        return this.data = p2([]), this;
      }, r2.prototype.remove = function(t3, i3) {
        if (!t3) return this;
        for (var n3, r3, a3, h3 = this.data, o3 = this.toBBox(t3), s3 = [], l3 = []; h3 || s3.length; ) {
          if (h3 || (h3 = s3.pop(), r3 = s3[s3.length - 1], n3 = l3.pop(), a3 = true), h3.leaf) {
            var f3 = e2(t3, h3.children, i3);
            if (-1 !== f3) return h3.children.splice(f3, 1), s3.push(h3), this._condense(s3), this;
          }
          a3 || h3.leaf || !m2(h3, o3) ? r3 ? (n3++, h3 = r3.children[n3], a3 = false) : h3 = null : (s3.push(h3), l3.push(n3), n3 = 0, r3 = h3, h3 = h3.children[0]);
        }
        return this;
      }, r2.prototype.toBBox = function(t3) {
        return t3;
      }, r2.prototype.compareMinX = function(t3, i3) {
        return t3.minX - i3.minX;
      }, r2.prototype.compareMinY = function(t3, i3) {
        return t3.minY - i3.minY;
      }, r2.prototype.toJSON = function() {
        return this.data;
      }, r2.prototype.fromJSON = function(t3) {
        return this.data = t3, this;
      }, r2.prototype._all = function(t3, i3) {
        for (var n3 = []; t3; ) t3.leaf ? i3.push.apply(i3, t3.children) : n3.push.apply(n3, t3.children), t3 = n3.pop();
        return i3;
      }, r2.prototype._build = function(t3, i3, n3, r3) {
        var e3, h3 = n3 - i3 + 1, o3 = this._maxEntries;
        if (h3 <= o3) return a2(e3 = p2(t3.slice(i3, n3 + 1)), this.toBBox), e3;
        r3 || (r3 = Math.ceil(Math.log(h3) / Math.log(o3)), o3 = Math.ceil(h3 / Math.pow(o3, r3 - 1))), (e3 = p2([])).leaf = false, e3.height = r3;
        var s3 = Math.ceil(h3 / o3), l3 = s3 * Math.ceil(Math.sqrt(o3));
        d2(t3, i3, n3, l3, this.compareMinX);
        for (var f3 = i3; f3 <= n3; f3 += l3) {
          var u3 = Math.min(f3 + l3 - 1, n3);
          d2(t3, f3, u3, s3, this.compareMinY);
          for (var m3 = f3; m3 <= u3; m3 += s3) {
            var c3 = Math.min(m3 + s3 - 1, u3);
            e3.children.push(this._build(t3, m3, c3, r3 - 1));
          }
        }
        return a2(e3, this.toBBox), e3;
      }, r2.prototype._chooseSubtree = function(t3, i3, n3, r3) {
        for (; r3.push(i3), !i3.leaf && r3.length - 1 !== n3; ) {
          for (var e3 = 1 / 0, a3 = 1 / 0, h3 = void 0, o3 = 0; o3 < i3.children.length; o3++) {
            var s3 = i3.children[o3], l3 = f2(s3), u3 = (m3 = t3, c3 = s3, (Math.max(c3.maxX, m3.maxX) - Math.min(c3.minX, m3.minX)) * (Math.max(c3.maxY, m3.maxY) - Math.min(c3.minY, m3.minY)) - l3);
            u3 < a3 ? (a3 = u3, e3 = l3 < e3 ? l3 : e3, h3 = s3) : u3 === a3 && l3 < e3 && (e3 = l3, h3 = s3);
          }
          i3 = h3 || i3.children[0];
        }
        var m3, c3;
        return i3;
      }, r2.prototype._insert = function(t3, i3, n3) {
        var r3 = n3 ? t3 : this.toBBox(t3), e3 = [], a3 = this._chooseSubtree(r3, this.data, i3, e3);
        for (a3.children.push(t3), o2(a3, r3); i3 >= 0 && e3[i3].children.length > this._maxEntries; ) this._split(e3, i3), i3--;
        this._adjustParentBBoxes(r3, e3, i3);
      }, r2.prototype._split = function(t3, i3) {
        var n3 = t3[i3], r3 = n3.children.length, e3 = this._minEntries;
        this._chooseSplitAxis(n3, e3, r3);
        var h3 = this._chooseSplitIndex(n3, e3, r3), o3 = p2(n3.children.splice(h3, n3.children.length - h3));
        o3.height = n3.height, o3.leaf = n3.leaf, a2(n3, this.toBBox), a2(o3, this.toBBox), i3 ? t3[i3 - 1].children.push(o3) : this._splitRoot(n3, o3);
      }, r2.prototype._splitRoot = function(t3, i3) {
        this.data = p2([t3, i3]), this.data.height = t3.height + 1, this.data.leaf = false, a2(this.data, this.toBBox);
      }, r2.prototype._chooseSplitIndex = function(t3, i3, n3) {
        for (var r3, e3, a3, o3, s3, l3, u3, m3 = 1 / 0, c3 = 1 / 0, p3 = i3; p3 <= n3 - i3; p3++) {
          var d3 = h2(t3, 0, p3, this.toBBox), x2 = h2(t3, p3, n3, this.toBBox), v2 = (e3 = d3, a3 = x2, o3 = void 0, s3 = void 0, l3 = void 0, u3 = void 0, o3 = Math.max(e3.minX, a3.minX), s3 = Math.max(e3.minY, a3.minY), l3 = Math.min(e3.maxX, a3.maxX), u3 = Math.min(e3.maxY, a3.maxY), Math.max(0, l3 - o3) * Math.max(0, u3 - s3)), M = f2(d3) + f2(x2);
          v2 < m3 ? (m3 = v2, r3 = p3, c3 = M < c3 ? M : c3) : v2 === m3 && M < c3 && (c3 = M, r3 = p3);
        }
        return r3 || n3 - i3;
      }, r2.prototype._chooseSplitAxis = function(t3, i3, n3) {
        var r3 = t3.leaf ? this.compareMinX : s2, e3 = t3.leaf ? this.compareMinY : l2;
        this._allDistMargin(t3, i3, n3, r3) < this._allDistMargin(t3, i3, n3, e3) && t3.children.sort(r3);
      }, r2.prototype._allDistMargin = function(t3, i3, n3, r3) {
        t3.children.sort(r3);
        for (var e3 = this.toBBox, a3 = h2(t3, 0, i3, e3), s3 = h2(t3, n3 - i3, n3, e3), l3 = u2(a3) + u2(s3), f3 = i3; f3 < n3 - i3; f3++) {
          var m3 = t3.children[f3];
          o2(a3, t3.leaf ? e3(m3) : m3), l3 += u2(a3);
        }
        for (var c3 = n3 - i3 - 1; c3 >= i3; c3--) {
          var p3 = t3.children[c3];
          o2(s3, t3.leaf ? e3(p3) : p3), l3 += u2(s3);
        }
        return l3;
      }, r2.prototype._adjustParentBBoxes = function(t3, i3, n3) {
        for (var r3 = n3; r3 >= 0; r3--) o2(i3[r3], t3);
      }, r2.prototype._condense = function(t3) {
        for (var i3 = t3.length - 1, n3 = void 0; i3 >= 0; i3--) 0 === t3[i3].children.length ? i3 > 0 ? (n3 = t3[i3 - 1].children).splice(n3.indexOf(t3[i3]), 1) : this.clear() : a2(t3[i3], this.toBBox);
      }, r2;
    });
  }
});

// node_modules/lodash/memoize.js
var require_memoize = __commonJS({
  "node_modules/lodash/memoize.js"(exports, module) {
    var MapCache = require_MapCache();
    var FUNC_ERROR_TEXT = "Expected a function";
    function memoize2(func, resolver) {
      if (typeof func != "function" || resolver != null && typeof resolver != "function") {
        throw new TypeError(FUNC_ERROR_TEXT);
      }
      var memoized = function() {
        var args = arguments, key = resolver ? resolver.apply(this, args) : args[0], cache3 = memoized.cache;
        if (cache3.has(key)) {
          return cache3.get(key);
        }
        var result = func.apply(this, args);
        memoized.cache = cache3.set(key, result) || cache3;
        return result;
      };
      memoized.cache = new (memoize2.Cache || MapCache)();
      return memoized;
    }
    memoize2.Cache = MapCache;
    module.exports = memoize2;
  }
});

// node_modules/lodash/_assignMergeValue.js
var require_assignMergeValue = __commonJS({
  "node_modules/lodash/_assignMergeValue.js"(exports, module) {
    var baseAssignValue = require_baseAssignValue();
    var eq = require_eq();
    function assignMergeValue(object, key, value) {
      if (value !== void 0 && !eq(object[key], value) || value === void 0 && !(key in object)) {
        baseAssignValue(object, key, value);
      }
    }
    module.exports = assignMergeValue;
  }
});

// node_modules/lodash/_createBaseFor.js
var require_createBaseFor = __commonJS({
  "node_modules/lodash/_createBaseFor.js"(exports, module) {
    function createBaseFor(fromRight) {
      return function(object, iteratee, keysFunc) {
        var index = -1, iterable = Object(object), props = keysFunc(object), length = props.length;
        while (length--) {
          var key = props[fromRight ? length : ++index];
          if (iteratee(iterable[key], key, iterable) === false) {
            break;
          }
        }
        return object;
      };
    }
    module.exports = createBaseFor;
  }
});

// node_modules/lodash/_baseFor.js
var require_baseFor = __commonJS({
  "node_modules/lodash/_baseFor.js"(exports, module) {
    var createBaseFor = require_createBaseFor();
    var baseFor = createBaseFor();
    module.exports = baseFor;
  }
});

// node_modules/lodash/isArrayLikeObject.js
var require_isArrayLikeObject = __commonJS({
  "node_modules/lodash/isArrayLikeObject.js"(exports, module) {
    var isArrayLike = require_isArrayLike();
    var isObjectLike = require_isObjectLike();
    function isArrayLikeObject(value) {
      return isObjectLike(value) && isArrayLike(value);
    }
    module.exports = isArrayLikeObject;
  }
});

// node_modules/lodash/isPlainObject.js
var require_isPlainObject = __commonJS({
  "node_modules/lodash/isPlainObject.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var getPrototype = require_getPrototype();
    var isObjectLike = require_isObjectLike();
    var objectTag = "[object Object]";
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var objectCtorString = funcToString.call(Object);
    function isPlainObject(value) {
      if (!isObjectLike(value) || baseGetTag(value) != objectTag) {
        return false;
      }
      var proto = getPrototype(value);
      if (proto === null) {
        return true;
      }
      var Ctor = hasOwnProperty.call(proto, "constructor") && proto.constructor;
      return typeof Ctor == "function" && Ctor instanceof Ctor && funcToString.call(Ctor) == objectCtorString;
    }
    module.exports = isPlainObject;
  }
});

// node_modules/lodash/_safeGet.js
var require_safeGet = __commonJS({
  "node_modules/lodash/_safeGet.js"(exports, module) {
    function safeGet(object, key) {
      if (key === "constructor" && typeof object[key] === "function") {
        return;
      }
      if (key == "__proto__") {
        return;
      }
      return object[key];
    }
    module.exports = safeGet;
  }
});

// node_modules/lodash/toPlainObject.js
var require_toPlainObject = __commonJS({
  "node_modules/lodash/toPlainObject.js"(exports, module) {
    var copyObject = require_copyObject();
    var keysIn = require_keysIn();
    function toPlainObject(value) {
      return copyObject(value, keysIn(value));
    }
    module.exports = toPlainObject;
  }
});

// node_modules/lodash/_baseMergeDeep.js
var require_baseMergeDeep = __commonJS({
  "node_modules/lodash/_baseMergeDeep.js"(exports, module) {
    var assignMergeValue = require_assignMergeValue();
    var cloneBuffer = require_cloneBuffer();
    var cloneTypedArray = require_cloneTypedArray();
    var copyArray = require_copyArray();
    var initCloneObject = require_initCloneObject();
    var isArguments = require_isArguments();
    var isArray = require_isArray();
    var isArrayLikeObject = require_isArrayLikeObject();
    var isBuffer = require_isBuffer();
    var isFunction = require_isFunction();
    var isObject3 = require_isObject();
    var isPlainObject = require_isPlainObject();
    var isTypedArray = require_isTypedArray();
    var safeGet = require_safeGet();
    var toPlainObject = require_toPlainObject();
    function baseMergeDeep(object, source, key, srcIndex, mergeFunc, customizer, stack) {
      var objValue = safeGet(object, key), srcValue = safeGet(source, key), stacked = stack.get(srcValue);
      if (stacked) {
        assignMergeValue(object, key, stacked);
        return;
      }
      var newValue = customizer ? customizer(objValue, srcValue, key + "", object, source, stack) : void 0;
      var isCommon = newValue === void 0;
      if (isCommon) {
        var isArr = isArray(srcValue), isBuff = !isArr && isBuffer(srcValue), isTyped = !isArr && !isBuff && isTypedArray(srcValue);
        newValue = srcValue;
        if (isArr || isBuff || isTyped) {
          if (isArray(objValue)) {
            newValue = objValue;
          } else if (isArrayLikeObject(objValue)) {
            newValue = copyArray(objValue);
          } else if (isBuff) {
            isCommon = false;
            newValue = cloneBuffer(srcValue, true);
          } else if (isTyped) {
            isCommon = false;
            newValue = cloneTypedArray(srcValue, true);
          } else {
            newValue = [];
          }
        } else if (isPlainObject(srcValue) || isArguments(srcValue)) {
          newValue = objValue;
          if (isArguments(objValue)) {
            newValue = toPlainObject(objValue);
          } else if (!isObject3(objValue) || isFunction(objValue)) {
            newValue = initCloneObject(srcValue);
          }
        } else {
          isCommon = false;
        }
      }
      if (isCommon) {
        stack.set(srcValue, newValue);
        mergeFunc(newValue, srcValue, srcIndex, customizer, stack);
        stack["delete"](srcValue);
      }
      assignMergeValue(object, key, newValue);
    }
    module.exports = baseMergeDeep;
  }
});

// node_modules/lodash/_baseMerge.js
var require_baseMerge = __commonJS({
  "node_modules/lodash/_baseMerge.js"(exports, module) {
    var Stack = require_Stack();
    var assignMergeValue = require_assignMergeValue();
    var baseFor = require_baseFor();
    var baseMergeDeep = require_baseMergeDeep();
    var isObject3 = require_isObject();
    var keysIn = require_keysIn();
    var safeGet = require_safeGet();
    function baseMerge(object, source, srcIndex, customizer, stack) {
      if (object === source) {
        return;
      }
      baseFor(source, function(srcValue, key) {
        stack || (stack = new Stack());
        if (isObject3(srcValue)) {
          baseMergeDeep(object, source, key, srcIndex, baseMerge, customizer, stack);
        } else {
          var newValue = customizer ? customizer(safeGet(object, key), srcValue, key + "", object, source, stack) : void 0;
          if (newValue === void 0) {
            newValue = srcValue;
          }
          assignMergeValue(object, key, newValue);
        }
      }, keysIn);
    }
    module.exports = baseMerge;
  }
});

// node_modules/lodash/identity.js
var require_identity = __commonJS({
  "node_modules/lodash/identity.js"(exports, module) {
    function identity(value) {
      return value;
    }
    module.exports = identity;
  }
});

// node_modules/lodash/_apply.js
var require_apply = __commonJS({
  "node_modules/lodash/_apply.js"(exports, module) {
    function apply(func, thisArg, args) {
      switch (args.length) {
        case 0:
          return func.call(thisArg);
        case 1:
          return func.call(thisArg, args[0]);
        case 2:
          return func.call(thisArg, args[0], args[1]);
        case 3:
          return func.call(thisArg, args[0], args[1], args[2]);
      }
      return func.apply(thisArg, args);
    }
    module.exports = apply;
  }
});

// node_modules/lodash/_overRest.js
var require_overRest = __commonJS({
  "node_modules/lodash/_overRest.js"(exports, module) {
    var apply = require_apply();
    var nativeMax = Math.max;
    function overRest(func, start, transform) {
      start = nativeMax(start === void 0 ? func.length - 1 : start, 0);
      return function() {
        var args = arguments, index = -1, length = nativeMax(args.length - start, 0), array = Array(length);
        while (++index < length) {
          array[index] = args[start + index];
        }
        index = -1;
        var otherArgs = Array(start + 1);
        while (++index < start) {
          otherArgs[index] = args[index];
        }
        otherArgs[start] = transform(array);
        return apply(func, this, otherArgs);
      };
    }
    module.exports = overRest;
  }
});

// node_modules/lodash/constant.js
var require_constant = __commonJS({
  "node_modules/lodash/constant.js"(exports, module) {
    function constant(value) {
      return function() {
        return value;
      };
    }
    module.exports = constant;
  }
});

// node_modules/lodash/_baseSetToString.js
var require_baseSetToString = __commonJS({
  "node_modules/lodash/_baseSetToString.js"(exports, module) {
    var constant = require_constant();
    var defineProperty = require_defineProperty();
    var identity = require_identity();
    var baseSetToString = !defineProperty ? identity : function(func, string) {
      return defineProperty(func, "toString", {
        "configurable": true,
        "enumerable": false,
        "value": constant(string),
        "writable": true
      });
    };
    module.exports = baseSetToString;
  }
});

// node_modules/lodash/_shortOut.js
var require_shortOut = __commonJS({
  "node_modules/lodash/_shortOut.js"(exports, module) {
    var HOT_COUNT = 800;
    var HOT_SPAN = 16;
    var nativeNow = Date.now;
    function shortOut(func) {
      var count = 0, lastCalled = 0;
      return function() {
        var stamp = nativeNow(), remaining = HOT_SPAN - (stamp - lastCalled);
        lastCalled = stamp;
        if (remaining > 0) {
          if (++count >= HOT_COUNT) {
            return arguments[0];
          }
        } else {
          count = 0;
        }
        return func.apply(void 0, arguments);
      };
    }
    module.exports = shortOut;
  }
});

// node_modules/lodash/_setToString.js
var require_setToString = __commonJS({
  "node_modules/lodash/_setToString.js"(exports, module) {
    var baseSetToString = require_baseSetToString();
    var shortOut = require_shortOut();
    var setToString = shortOut(baseSetToString);
    module.exports = setToString;
  }
});

// node_modules/lodash/_baseRest.js
var require_baseRest = __commonJS({
  "node_modules/lodash/_baseRest.js"(exports, module) {
    var identity = require_identity();
    var overRest = require_overRest();
    var setToString = require_setToString();
    function baseRest(func, start) {
      return setToString(overRest(func, start, identity), func + "");
    }
    module.exports = baseRest;
  }
});

// node_modules/lodash/_isIterateeCall.js
var require_isIterateeCall = __commonJS({
  "node_modules/lodash/_isIterateeCall.js"(exports, module) {
    var eq = require_eq();
    var isArrayLike = require_isArrayLike();
    var isIndex = require_isIndex();
    var isObject3 = require_isObject();
    function isIterateeCall(value, index, object) {
      if (!isObject3(object)) {
        return false;
      }
      var type = typeof index;
      if (type == "number" ? isArrayLike(object) && isIndex(index, object.length) : type == "string" && index in object) {
        return eq(object[index], value);
      }
      return false;
    }
    module.exports = isIterateeCall;
  }
});

// node_modules/lodash/_createAssigner.js
var require_createAssigner = __commonJS({
  "node_modules/lodash/_createAssigner.js"(exports, module) {
    var baseRest = require_baseRest();
    var isIterateeCall = require_isIterateeCall();
    function createAssigner(assigner) {
      return baseRest(function(object, sources) {
        var index = -1, length = sources.length, customizer = length > 1 ? sources[length - 1] : void 0, guard = length > 2 ? sources[2] : void 0;
        customizer = assigner.length > 3 && typeof customizer == "function" ? (length--, customizer) : void 0;
        if (guard && isIterateeCall(sources[0], sources[1], guard)) {
          customizer = length < 3 ? void 0 : customizer;
          length = 1;
        }
        object = Object(object);
        while (++index < length) {
          var source = sources[index];
          if (source) {
            assigner(object, source, index, customizer);
          }
        }
        return object;
      });
    }
    module.exports = createAssigner;
  }
});

// node_modules/lodash/merge.js
var require_merge = __commonJS({
  "node_modules/lodash/merge.js"(exports, module) {
    var baseMerge = require_baseMerge();
    var createAssigner = require_createAssigner();
    var merge3 = createAssigner(function(object, source, srcIndex) {
      baseMerge(object, source, srcIndex);
    });
    module.exports = merge3;
  }
});

// node_modules/lodash/_arrayAggregator.js
var require_arrayAggregator = __commonJS({
  "node_modules/lodash/_arrayAggregator.js"(exports, module) {
    function arrayAggregator(array, setter, iteratee, accumulator) {
      var index = -1, length = array == null ? 0 : array.length;
      while (++index < length) {
        var value = array[index];
        setter(accumulator, value, iteratee(value), array);
      }
      return accumulator;
    }
    module.exports = arrayAggregator;
  }
});

// node_modules/lodash/_baseForOwn.js
var require_baseForOwn = __commonJS({
  "node_modules/lodash/_baseForOwn.js"(exports, module) {
    var baseFor = require_baseFor();
    var keys = require_keys();
    function baseForOwn(object, iteratee) {
      return object && baseFor(object, iteratee, keys);
    }
    module.exports = baseForOwn;
  }
});

// node_modules/lodash/_createBaseEach.js
var require_createBaseEach = __commonJS({
  "node_modules/lodash/_createBaseEach.js"(exports, module) {
    var isArrayLike = require_isArrayLike();
    function createBaseEach(eachFunc, fromRight) {
      return function(collection, iteratee) {
        if (collection == null) {
          return collection;
        }
        if (!isArrayLike(collection)) {
          return eachFunc(collection, iteratee);
        }
        var length = collection.length, index = fromRight ? length : -1, iterable = Object(collection);
        while (fromRight ? index-- : ++index < length) {
          if (iteratee(iterable[index], index, iterable) === false) {
            break;
          }
        }
        return collection;
      };
    }
    module.exports = createBaseEach;
  }
});

// node_modules/lodash/_baseEach.js
var require_baseEach = __commonJS({
  "node_modules/lodash/_baseEach.js"(exports, module) {
    var baseForOwn = require_baseForOwn();
    var createBaseEach = require_createBaseEach();
    var baseEach = createBaseEach(baseForOwn);
    module.exports = baseEach;
  }
});

// node_modules/lodash/_baseAggregator.js
var require_baseAggregator = __commonJS({
  "node_modules/lodash/_baseAggregator.js"(exports, module) {
    var baseEach = require_baseEach();
    function baseAggregator(collection, setter, iteratee, accumulator) {
      baseEach(collection, function(value, key, collection2) {
        setter(accumulator, value, iteratee(value), collection2);
      });
      return accumulator;
    }
    module.exports = baseAggregator;
  }
});

// node_modules/lodash/_setCacheAdd.js
var require_setCacheAdd = __commonJS({
  "node_modules/lodash/_setCacheAdd.js"(exports, module) {
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    function setCacheAdd(value) {
      this.__data__.set(value, HASH_UNDEFINED);
      return this;
    }
    module.exports = setCacheAdd;
  }
});

// node_modules/lodash/_setCacheHas.js
var require_setCacheHas = __commonJS({
  "node_modules/lodash/_setCacheHas.js"(exports, module) {
    function setCacheHas(value) {
      return this.__data__.has(value);
    }
    module.exports = setCacheHas;
  }
});

// node_modules/lodash/_SetCache.js
var require_SetCache = __commonJS({
  "node_modules/lodash/_SetCache.js"(exports, module) {
    var MapCache = require_MapCache();
    var setCacheAdd = require_setCacheAdd();
    var setCacheHas = require_setCacheHas();
    function SetCache(values) {
      var index = -1, length = values == null ? 0 : values.length;
      this.__data__ = new MapCache();
      while (++index < length) {
        this.add(values[index]);
      }
    }
    SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
    SetCache.prototype.has = setCacheHas;
    module.exports = SetCache;
  }
});

// node_modules/lodash/_arraySome.js
var require_arraySome = __commonJS({
  "node_modules/lodash/_arraySome.js"(exports, module) {
    function arraySome(array, predicate) {
      var index = -1, length = array == null ? 0 : array.length;
      while (++index < length) {
        if (predicate(array[index], index, array)) {
          return true;
        }
      }
      return false;
    }
    module.exports = arraySome;
  }
});

// node_modules/lodash/_cacheHas.js
var require_cacheHas = __commonJS({
  "node_modules/lodash/_cacheHas.js"(exports, module) {
    function cacheHas(cache3, key) {
      return cache3.has(key);
    }
    module.exports = cacheHas;
  }
});

// node_modules/lodash/_equalArrays.js
var require_equalArrays = __commonJS({
  "node_modules/lodash/_equalArrays.js"(exports, module) {
    var SetCache = require_SetCache();
    var arraySome = require_arraySome();
    var cacheHas = require_cacheHas();
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG, arrLength = array.length, othLength = other.length;
      if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
        return false;
      }
      var arrStacked = stack.get(array);
      var othStacked = stack.get(other);
      if (arrStacked && othStacked) {
        return arrStacked == other && othStacked == array;
      }
      var index = -1, result = true, seen = bitmask & COMPARE_UNORDERED_FLAG ? new SetCache() : void 0;
      stack.set(array, other);
      stack.set(other, array);
      while (++index < arrLength) {
        var arrValue = array[index], othValue = other[index];
        if (customizer) {
          var compared = isPartial ? customizer(othValue, arrValue, index, other, array, stack) : customizer(arrValue, othValue, index, array, other, stack);
        }
        if (compared !== void 0) {
          if (compared) {
            continue;
          }
          result = false;
          break;
        }
        if (seen) {
          if (!arraySome(other, function(othValue2, othIndex) {
            if (!cacheHas(seen, othIndex) && (arrValue === othValue2 || equalFunc(arrValue, othValue2, bitmask, customizer, stack))) {
              return seen.push(othIndex);
            }
          })) {
            result = false;
            break;
          }
        } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
          result = false;
          break;
        }
      }
      stack["delete"](array);
      stack["delete"](other);
      return result;
    }
    module.exports = equalArrays;
  }
});

// node_modules/lodash/_mapToArray.js
var require_mapToArray = __commonJS({
  "node_modules/lodash/_mapToArray.js"(exports, module) {
    function mapToArray(map) {
      var index = -1, result = Array(map.size);
      map.forEach(function(value, key) {
        result[++index] = [key, value];
      });
      return result;
    }
    module.exports = mapToArray;
  }
});

// node_modules/lodash/_setToArray.js
var require_setToArray = __commonJS({
  "node_modules/lodash/_setToArray.js"(exports, module) {
    function setToArray(set2) {
      var index = -1, result = Array(set2.size);
      set2.forEach(function(value) {
        result[++index] = value;
      });
      return result;
    }
    module.exports = setToArray;
  }
});

// node_modules/lodash/_equalByTag.js
var require_equalByTag = __commonJS({
  "node_modules/lodash/_equalByTag.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var Uint8Array2 = require_Uint8Array();
    var eq = require_eq();
    var equalArrays = require_equalArrays();
    var mapToArray = require_mapToArray();
    var setToArray = require_setToArray();
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var symbolTag = "[object Symbol]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolValueOf = symbolProto ? symbolProto.valueOf : void 0;
    function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
      switch (tag) {
        case dataViewTag:
          if (object.byteLength != other.byteLength || object.byteOffset != other.byteOffset) {
            return false;
          }
          object = object.buffer;
          other = other.buffer;
        case arrayBufferTag:
          if (object.byteLength != other.byteLength || !equalFunc(new Uint8Array2(object), new Uint8Array2(other))) {
            return false;
          }
          return true;
        case boolTag:
        case dateTag:
        case numberTag:
          return eq(+object, +other);
        case errorTag:
          return object.name == other.name && object.message == other.message;
        case regexpTag:
        case stringTag:
          return object == other + "";
        case mapTag:
          var convert = mapToArray;
        case setTag:
          var isPartial = bitmask & COMPARE_PARTIAL_FLAG;
          convert || (convert = setToArray);
          if (object.size != other.size && !isPartial) {
            return false;
          }
          var stacked = stack.get(object);
          if (stacked) {
            return stacked == other;
          }
          bitmask |= COMPARE_UNORDERED_FLAG;
          stack.set(object, other);
          var result = equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
          stack["delete"](object);
          return result;
        case symbolTag:
          if (symbolValueOf) {
            return symbolValueOf.call(object) == symbolValueOf.call(other);
          }
      }
      return false;
    }
    module.exports = equalByTag;
  }
});

// node_modules/lodash/_equalObjects.js
var require_equalObjects = __commonJS({
  "node_modules/lodash/_equalObjects.js"(exports, module) {
    var getAllKeys = require_getAllKeys();
    var COMPARE_PARTIAL_FLAG = 1;
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG, objProps = getAllKeys(object), objLength = objProps.length, othProps = getAllKeys(other), othLength = othProps.length;
      if (objLength != othLength && !isPartial) {
        return false;
      }
      var index = objLength;
      while (index--) {
        var key = objProps[index];
        if (!(isPartial ? key in other : hasOwnProperty.call(other, key))) {
          return false;
        }
      }
      var objStacked = stack.get(object);
      var othStacked = stack.get(other);
      if (objStacked && othStacked) {
        return objStacked == other && othStacked == object;
      }
      var result = true;
      stack.set(object, other);
      stack.set(other, object);
      var skipCtor = isPartial;
      while (++index < objLength) {
        key = objProps[index];
        var objValue = object[key], othValue = other[key];
        if (customizer) {
          var compared = isPartial ? customizer(othValue, objValue, key, other, object, stack) : customizer(objValue, othValue, key, object, other, stack);
        }
        if (!(compared === void 0 ? objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack) : compared)) {
          result = false;
          break;
        }
        skipCtor || (skipCtor = key == "constructor");
      }
      if (result && !skipCtor) {
        var objCtor = object.constructor, othCtor = other.constructor;
        if (objCtor != othCtor && ("constructor" in object && "constructor" in other) && !(typeof objCtor == "function" && objCtor instanceof objCtor && typeof othCtor == "function" && othCtor instanceof othCtor)) {
          result = false;
        }
      }
      stack["delete"](object);
      stack["delete"](other);
      return result;
    }
    module.exports = equalObjects;
  }
});

// node_modules/lodash/_baseIsEqualDeep.js
var require_baseIsEqualDeep = __commonJS({
  "node_modules/lodash/_baseIsEqualDeep.js"(exports, module) {
    var Stack = require_Stack();
    var equalArrays = require_equalArrays();
    var equalByTag = require_equalByTag();
    var equalObjects = require_equalObjects();
    var getTag = require_getTag();
    var isArray = require_isArray();
    var isBuffer = require_isBuffer();
    var isTypedArray = require_isTypedArray();
    var COMPARE_PARTIAL_FLAG = 1;
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var objectTag = "[object Object]";
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
      var objIsArr = isArray(object), othIsArr = isArray(other), objTag = objIsArr ? arrayTag : getTag(object), othTag = othIsArr ? arrayTag : getTag(other);
      objTag = objTag == argsTag ? objectTag : objTag;
      othTag = othTag == argsTag ? objectTag : othTag;
      var objIsObj = objTag == objectTag, othIsObj = othTag == objectTag, isSameTag = objTag == othTag;
      if (isSameTag && isBuffer(object)) {
        if (!isBuffer(other)) {
          return false;
        }
        objIsArr = true;
        objIsObj = false;
      }
      if (isSameTag && !objIsObj) {
        stack || (stack = new Stack());
        return objIsArr || isTypedArray(object) ? equalArrays(object, other, bitmask, customizer, equalFunc, stack) : equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
      }
      if (!(bitmask & COMPARE_PARTIAL_FLAG)) {
        var objIsWrapped = objIsObj && hasOwnProperty.call(object, "__wrapped__"), othIsWrapped = othIsObj && hasOwnProperty.call(other, "__wrapped__");
        if (objIsWrapped || othIsWrapped) {
          var objUnwrapped = objIsWrapped ? object.value() : object, othUnwrapped = othIsWrapped ? other.value() : other;
          stack || (stack = new Stack());
          return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
        }
      }
      if (!isSameTag) {
        return false;
      }
      stack || (stack = new Stack());
      return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
    }
    module.exports = baseIsEqualDeep;
  }
});

// node_modules/lodash/_baseIsEqual.js
var require_baseIsEqual = __commonJS({
  "node_modules/lodash/_baseIsEqual.js"(exports, module) {
    var baseIsEqualDeep = require_baseIsEqualDeep();
    var isObjectLike = require_isObjectLike();
    function baseIsEqual(value, other, bitmask, customizer, stack) {
      if (value === other) {
        return true;
      }
      if (value == null || other == null || !isObjectLike(value) && !isObjectLike(other)) {
        return value !== value && other !== other;
      }
      return baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual, stack);
    }
    module.exports = baseIsEqual;
  }
});

// node_modules/lodash/_baseIsMatch.js
var require_baseIsMatch = __commonJS({
  "node_modules/lodash/_baseIsMatch.js"(exports, module) {
    var Stack = require_Stack();
    var baseIsEqual = require_baseIsEqual();
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    function baseIsMatch(object, source, matchData, customizer) {
      var index = matchData.length, length = index, noCustomizer = !customizer;
      if (object == null) {
        return !length;
      }
      object = Object(object);
      while (index--) {
        var data = matchData[index];
        if (noCustomizer && data[2] ? data[1] !== object[data[0]] : !(data[0] in object)) {
          return false;
        }
      }
      while (++index < length) {
        data = matchData[index];
        var key = data[0], objValue = object[key], srcValue = data[1];
        if (noCustomizer && data[2]) {
          if (objValue === void 0 && !(key in object)) {
            return false;
          }
        } else {
          var stack = new Stack();
          if (customizer) {
            var result = customizer(objValue, srcValue, key, object, source, stack);
          }
          if (!(result === void 0 ? baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG | COMPARE_UNORDERED_FLAG, customizer, stack) : result)) {
            return false;
          }
        }
      }
      return true;
    }
    module.exports = baseIsMatch;
  }
});

// node_modules/lodash/_isStrictComparable.js
var require_isStrictComparable = __commonJS({
  "node_modules/lodash/_isStrictComparable.js"(exports, module) {
    var isObject3 = require_isObject();
    function isStrictComparable(value) {
      return value === value && !isObject3(value);
    }
    module.exports = isStrictComparable;
  }
});

// node_modules/lodash/_getMatchData.js
var require_getMatchData = __commonJS({
  "node_modules/lodash/_getMatchData.js"(exports, module) {
    var isStrictComparable = require_isStrictComparable();
    var keys = require_keys();
    function getMatchData(object) {
      var result = keys(object), length = result.length;
      while (length--) {
        var key = result[length], value = object[key];
        result[length] = [key, value, isStrictComparable(value)];
      }
      return result;
    }
    module.exports = getMatchData;
  }
});

// node_modules/lodash/_matchesStrictComparable.js
var require_matchesStrictComparable = __commonJS({
  "node_modules/lodash/_matchesStrictComparable.js"(exports, module) {
    function matchesStrictComparable(key, srcValue) {
      return function(object) {
        if (object == null) {
          return false;
        }
        return object[key] === srcValue && (srcValue !== void 0 || key in Object(object));
      };
    }
    module.exports = matchesStrictComparable;
  }
});

// node_modules/lodash/_baseMatches.js
var require_baseMatches = __commonJS({
  "node_modules/lodash/_baseMatches.js"(exports, module) {
    var baseIsMatch = require_baseIsMatch();
    var getMatchData = require_getMatchData();
    var matchesStrictComparable = require_matchesStrictComparable();
    function baseMatches(source) {
      var matchData = getMatchData(source);
      if (matchData.length == 1 && matchData[0][2]) {
        return matchesStrictComparable(matchData[0][0], matchData[0][1]);
      }
      return function(object) {
        return object === source || baseIsMatch(object, source, matchData);
      };
    }
    module.exports = baseMatches;
  }
});

// node_modules/lodash/isSymbol.js
var require_isSymbol = __commonJS({
  "node_modules/lodash/isSymbol.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isObjectLike = require_isObjectLike();
    var symbolTag = "[object Symbol]";
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && baseGetTag(value) == symbolTag;
    }
    module.exports = isSymbol;
  }
});

// node_modules/lodash/_isKey.js
var require_isKey = __commonJS({
  "node_modules/lodash/_isKey.js"(exports, module) {
    var isArray = require_isArray();
    var isSymbol = require_isSymbol();
    var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/;
    var reIsPlainProp = /^\w*$/;
    function isKey(value, object) {
      if (isArray(value)) {
        return false;
      }
      var type = typeof value;
      if (type == "number" || type == "symbol" || type == "boolean" || value == null || isSymbol(value)) {
        return true;
      }
      return reIsPlainProp.test(value) || !reIsDeepProp.test(value) || object != null && value in Object(object);
    }
    module.exports = isKey;
  }
});

// node_modules/lodash/_memoizeCapped.js
var require_memoizeCapped = __commonJS({
  "node_modules/lodash/_memoizeCapped.js"(exports, module) {
    var memoize2 = require_memoize();
    var MAX_MEMOIZE_SIZE = 500;
    function memoizeCapped(func) {
      var result = memoize2(func, function(key) {
        if (cache3.size === MAX_MEMOIZE_SIZE) {
          cache3.clear();
        }
        return key;
      });
      var cache3 = result.cache;
      return result;
    }
    module.exports = memoizeCapped;
  }
});

// node_modules/lodash/_stringToPath.js
var require_stringToPath = __commonJS({
  "node_modules/lodash/_stringToPath.js"(exports, module) {
    var memoizeCapped = require_memoizeCapped();
    var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
    var reEscapeChar = /\\(\\)?/g;
    var stringToPath = memoizeCapped(function(string) {
      var result = [];
      if (string.charCodeAt(0) === 46) {
        result.push("");
      }
      string.replace(rePropName, function(match, number, quote, subString) {
        result.push(quote ? subString.replace(reEscapeChar, "$1") : number || match);
      });
      return result;
    });
    module.exports = stringToPath;
  }
});

// node_modules/lodash/_arrayMap.js
var require_arrayMap = __commonJS({
  "node_modules/lodash/_arrayMap.js"(exports, module) {
    function arrayMap(array, iteratee) {
      var index = -1, length = array == null ? 0 : array.length, result = Array(length);
      while (++index < length) {
        result[index] = iteratee(array[index], index, array);
      }
      return result;
    }
    module.exports = arrayMap;
  }
});

// node_modules/lodash/_baseToString.js
var require_baseToString = __commonJS({
  "node_modules/lodash/_baseToString.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var arrayMap = require_arrayMap();
    var isArray = require_isArray();
    var isSymbol = require_isSymbol();
    var INFINITY = 1 / 0;
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolToString = symbolProto ? symbolProto.toString : void 0;
    function baseToString(value) {
      if (typeof value == "string") {
        return value;
      }
      if (isArray(value)) {
        return arrayMap(value, baseToString) + "";
      }
      if (isSymbol(value)) {
        return symbolToString ? symbolToString.call(value) : "";
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    module.exports = baseToString;
  }
});

// node_modules/lodash/toString.js
var require_toString = __commonJS({
  "node_modules/lodash/toString.js"(exports, module) {
    var baseToString = require_baseToString();
    function toString(value) {
      return value == null ? "" : baseToString(value);
    }
    module.exports = toString;
  }
});

// node_modules/lodash/_castPath.js
var require_castPath = __commonJS({
  "node_modules/lodash/_castPath.js"(exports, module) {
    var isArray = require_isArray();
    var isKey = require_isKey();
    var stringToPath = require_stringToPath();
    var toString = require_toString();
    function castPath(value, object) {
      if (isArray(value)) {
        return value;
      }
      return isKey(value, object) ? [value] : stringToPath(toString(value));
    }
    module.exports = castPath;
  }
});

// node_modules/lodash/_toKey.js
var require_toKey = __commonJS({
  "node_modules/lodash/_toKey.js"(exports, module) {
    var isSymbol = require_isSymbol();
    var INFINITY = 1 / 0;
    function toKey(value) {
      if (typeof value == "string" || isSymbol(value)) {
        return value;
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    module.exports = toKey;
  }
});

// node_modules/lodash/_baseGet.js
var require_baseGet = __commonJS({
  "node_modules/lodash/_baseGet.js"(exports, module) {
    var castPath = require_castPath();
    var toKey = require_toKey();
    function baseGet(object, path) {
      path = castPath(path, object);
      var index = 0, length = path.length;
      while (object != null && index < length) {
        object = object[toKey(path[index++])];
      }
      return index && index == length ? object : void 0;
    }
    module.exports = baseGet;
  }
});

// node_modules/lodash/get.js
var require_get = __commonJS({
  "node_modules/lodash/get.js"(exports, module) {
    var baseGet = require_baseGet();
    function get2(object, path, defaultValue) {
      var result = object == null ? void 0 : baseGet(object, path);
      return result === void 0 ? defaultValue : result;
    }
    module.exports = get2;
  }
});

// node_modules/lodash/_baseHasIn.js
var require_baseHasIn = __commonJS({
  "node_modules/lodash/_baseHasIn.js"(exports, module) {
    function baseHasIn(object, key) {
      return object != null && key in Object(object);
    }
    module.exports = baseHasIn;
  }
});

// node_modules/lodash/_hasPath.js
var require_hasPath = __commonJS({
  "node_modules/lodash/_hasPath.js"(exports, module) {
    var castPath = require_castPath();
    var isArguments = require_isArguments();
    var isArray = require_isArray();
    var isIndex = require_isIndex();
    var isLength = require_isLength();
    var toKey = require_toKey();
    function hasPath(object, path, hasFunc) {
      path = castPath(path, object);
      var index = -1, length = path.length, result = false;
      while (++index < length) {
        var key = toKey(path[index]);
        if (!(result = object != null && hasFunc(object, key))) {
          break;
        }
        object = object[key];
      }
      if (result || ++index != length) {
        return result;
      }
      length = object == null ? 0 : object.length;
      return !!length && isLength(length) && isIndex(key, length) && (isArray(object) || isArguments(object));
    }
    module.exports = hasPath;
  }
});

// node_modules/lodash/hasIn.js
var require_hasIn = __commonJS({
  "node_modules/lodash/hasIn.js"(exports, module) {
    var baseHasIn = require_baseHasIn();
    var hasPath = require_hasPath();
    function hasIn(object, path) {
      return object != null && hasPath(object, path, baseHasIn);
    }
    module.exports = hasIn;
  }
});

// node_modules/lodash/_baseMatchesProperty.js
var require_baseMatchesProperty = __commonJS({
  "node_modules/lodash/_baseMatchesProperty.js"(exports, module) {
    var baseIsEqual = require_baseIsEqual();
    var get2 = require_get();
    var hasIn = require_hasIn();
    var isKey = require_isKey();
    var isStrictComparable = require_isStrictComparable();
    var matchesStrictComparable = require_matchesStrictComparable();
    var toKey = require_toKey();
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    function baseMatchesProperty(path, srcValue) {
      if (isKey(path) && isStrictComparable(srcValue)) {
        return matchesStrictComparable(toKey(path), srcValue);
      }
      return function(object) {
        var objValue = get2(object, path);
        return objValue === void 0 && objValue === srcValue ? hasIn(object, path) : baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG | COMPARE_UNORDERED_FLAG);
      };
    }
    module.exports = baseMatchesProperty;
  }
});

// node_modules/lodash/_baseProperty.js
var require_baseProperty = __commonJS({
  "node_modules/lodash/_baseProperty.js"(exports, module) {
    function baseProperty(key) {
      return function(object) {
        return object == null ? void 0 : object[key];
      };
    }
    module.exports = baseProperty;
  }
});

// node_modules/lodash/_basePropertyDeep.js
var require_basePropertyDeep = __commonJS({
  "node_modules/lodash/_basePropertyDeep.js"(exports, module) {
    var baseGet = require_baseGet();
    function basePropertyDeep(path) {
      return function(object) {
        return baseGet(object, path);
      };
    }
    module.exports = basePropertyDeep;
  }
});

// node_modules/lodash/property.js
var require_property = __commonJS({
  "node_modules/lodash/property.js"(exports, module) {
    var baseProperty = require_baseProperty();
    var basePropertyDeep = require_basePropertyDeep();
    var isKey = require_isKey();
    var toKey = require_toKey();
    function property(path) {
      return isKey(path) ? baseProperty(toKey(path)) : basePropertyDeep(path);
    }
    module.exports = property;
  }
});

// node_modules/lodash/_baseIteratee.js
var require_baseIteratee = __commonJS({
  "node_modules/lodash/_baseIteratee.js"(exports, module) {
    var baseMatches = require_baseMatches();
    var baseMatchesProperty = require_baseMatchesProperty();
    var identity = require_identity();
    var isArray = require_isArray();
    var property = require_property();
    function baseIteratee(value) {
      if (typeof value == "function") {
        return value;
      }
      if (value == null) {
        return identity;
      }
      if (typeof value == "object") {
        return isArray(value) ? baseMatchesProperty(value[0], value[1]) : baseMatches(value);
      }
      return property(value);
    }
    module.exports = baseIteratee;
  }
});

// node_modules/lodash/_createAggregator.js
var require_createAggregator = __commonJS({
  "node_modules/lodash/_createAggregator.js"(exports, module) {
    var arrayAggregator = require_arrayAggregator();
    var baseAggregator = require_baseAggregator();
    var baseIteratee = require_baseIteratee();
    var isArray = require_isArray();
    function createAggregator(setter, initializer) {
      return function(collection, iteratee) {
        var func = isArray(collection) ? arrayAggregator : baseAggregator, accumulator = initializer ? initializer() : {};
        return func(collection, setter, baseIteratee(iteratee, 2), accumulator);
      };
    }
    module.exports = createAggregator;
  }
});

// node_modules/lodash/groupBy.js
var require_groupBy = __commonJS({
  "node_modules/lodash/groupBy.js"(exports, module) {
    var baseAssignValue = require_baseAssignValue();
    var createAggregator = require_createAggregator();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var groupBy2 = createAggregator(function(result, value, key) {
      if (hasOwnProperty.call(result, key)) {
        result[key].push(value);
      } else {
        baseAssignValue(result, key, [value]);
      }
    });
    module.exports = groupBy2;
  }
});

// node_modules/lodash/_baseSet.js
var require_baseSet = __commonJS({
  "node_modules/lodash/_baseSet.js"(exports, module) {
    var assignValue = require_assignValue();
    var castPath = require_castPath();
    var isIndex = require_isIndex();
    var isObject3 = require_isObject();
    var toKey = require_toKey();
    function baseSet(object, path, value, customizer) {
      if (!isObject3(object)) {
        return object;
      }
      path = castPath(path, object);
      var index = -1, length = path.length, lastIndex = length - 1, nested = object;
      while (nested != null && ++index < length) {
        var key = toKey(path[index]), newValue = value;
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          return object;
        }
        if (index != lastIndex) {
          var objValue = nested[key];
          newValue = customizer ? customizer(objValue, key, nested) : void 0;
          if (newValue === void 0) {
            newValue = isObject3(objValue) ? objValue : isIndex(path[index + 1]) ? [] : {};
          }
        }
        assignValue(nested, key, newValue);
        nested = nested[key];
      }
      return object;
    }
    module.exports = baseSet;
  }
});

// node_modules/lodash/set.js
var require_set = __commonJS({
  "node_modules/lodash/set.js"(exports, module) {
    var baseSet = require_baseSet();
    function set2(object, path, value) {
      return object == null ? object : baseSet(object, path, value);
    }
    module.exports = set2;
  }
});

// node_modules/react/cjs/react.development.js
var require_react_development = __commonJS({
  "node_modules/react/cjs/react.development.js"(exports, module) {
    "use strict";
    if (true) {
      (function() {
        "use strict";
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart === "function") {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(new Error());
        }
        var ReactVersion = "18.3.1";
        var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.element");
        var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
        var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
        var REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode");
        var REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler");
        var REACT_PROVIDER_TYPE = /* @__PURE__ */ Symbol.for("react.provider");
        var REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context");
        var REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref");
        var REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense");
        var REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list");
        var REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo");
        var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
        var REACT_OFFSCREEN_TYPE = /* @__PURE__ */ Symbol.for("react.offscreen");
        var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
        var FAUX_ITERATOR_SYMBOL = "@@iterator";
        function getIteratorFn(maybeIterable) {
          if (maybeIterable === null || typeof maybeIterable !== "object") {
            return null;
          }
          var maybeIterator = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL];
          if (typeof maybeIterator === "function") {
            return maybeIterator;
          }
          return null;
        }
        var ReactCurrentDispatcher = {
          /**
           * @internal
           * @type {ReactComponent}
           */
          current: null
        };
        var ReactCurrentBatchConfig = {
          transition: null
        };
        var ReactCurrentActQueue = {
          current: null,
          // Used to reproduce behavior of `batchedUpdates` in legacy mode.
          isBatchingLegacy: false,
          didScheduleLegacyUpdate: false
        };
        var ReactCurrentOwner = {
          /**
           * @internal
           * @type {ReactComponent}
           */
          current: null
        };
        var ReactDebugCurrentFrame = {};
        var currentExtraStackFrame = null;
        function setExtraStackFrame(stack) {
          {
            currentExtraStackFrame = stack;
          }
        }
        {
          ReactDebugCurrentFrame.setExtraStackFrame = function(stack) {
            {
              currentExtraStackFrame = stack;
            }
          };
          ReactDebugCurrentFrame.getCurrentStack = null;
          ReactDebugCurrentFrame.getStackAddendum = function() {
            var stack = "";
            if (currentExtraStackFrame) {
              stack += currentExtraStackFrame;
            }
            var impl = ReactDebugCurrentFrame.getCurrentStack;
            if (impl) {
              stack += impl() || "";
            }
            return stack;
          };
        }
        var enableScopeAPI = false;
        var enableCacheElement = false;
        var enableTransitionTracing = false;
        var enableLegacyHidden = false;
        var enableDebugTracing = false;
        var ReactSharedInternals = {
          ReactCurrentDispatcher,
          ReactCurrentBatchConfig,
          ReactCurrentOwner
        };
        {
          ReactSharedInternals.ReactDebugCurrentFrame = ReactDebugCurrentFrame;
          ReactSharedInternals.ReactCurrentActQueue = ReactCurrentActQueue;
        }
        function warn(format) {
          {
            {
              for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
                args[_key - 1] = arguments[_key];
              }
              printWarning("warn", format, args);
            }
          }
        }
        function error(format) {
          {
            {
              for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                args[_key2 - 1] = arguments[_key2];
              }
              printWarning("error", format, args);
            }
          }
        }
        function printWarning(level, format, args) {
          {
            var ReactDebugCurrentFrame2 = ReactSharedInternals.ReactDebugCurrentFrame;
            var stack = ReactDebugCurrentFrame2.getStackAddendum();
            if (stack !== "") {
              format += "%s";
              args = args.concat([stack]);
            }
            var argsWithFormat = args.map(function(item) {
              return String(item);
            });
            argsWithFormat.unshift("Warning: " + format);
            Function.prototype.apply.call(console[level], console, argsWithFormat);
          }
        }
        var didWarnStateUpdateForUnmountedComponent = {};
        function warnNoop(publicInstance, callerName) {
          {
            var _constructor = publicInstance.constructor;
            var componentName = _constructor && (_constructor.displayName || _constructor.name) || "ReactClass";
            var warningKey = componentName + "." + callerName;
            if (didWarnStateUpdateForUnmountedComponent[warningKey]) {
              return;
            }
            error("Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.", callerName, componentName);
            didWarnStateUpdateForUnmountedComponent[warningKey] = true;
          }
        }
        var ReactNoopUpdateQueue = {
          /**
           * Checks whether or not this composite component is mounted.
           * @param {ReactClass} publicInstance The instance we want to test.
           * @return {boolean} True if mounted, false otherwise.
           * @protected
           * @final
           */
          isMounted: function(publicInstance) {
            return false;
          },
          /**
           * Forces an update. This should only be invoked when it is known with
           * certainty that we are **not** in a DOM transaction.
           *
           * You may want to call this when you know that some deeper aspect of the
           * component's state has changed but `setState` was not called.
           *
           * This will not invoke `shouldComponentUpdate`, but it will invoke
           * `componentWillUpdate` and `componentDidUpdate`.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {?function} callback Called after component is updated.
           * @param {?string} callerName name of the calling function in the public API.
           * @internal
           */
          enqueueForceUpdate: function(publicInstance, callback, callerName) {
            warnNoop(publicInstance, "forceUpdate");
          },
          /**
           * Replaces all of the state. Always use this or `setState` to mutate state.
           * You should treat `this.state` as immutable.
           *
           * There is no guarantee that `this.state` will be immediately updated, so
           * accessing `this.state` after calling this method may return the old value.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {object} completeState Next state.
           * @param {?function} callback Called after component is updated.
           * @param {?string} callerName name of the calling function in the public API.
           * @internal
           */
          enqueueReplaceState: function(publicInstance, completeState, callback, callerName) {
            warnNoop(publicInstance, "replaceState");
          },
          /**
           * Sets a subset of the state. This only exists because _pendingState is
           * internal. This provides a merging strategy that is not available to deep
           * properties which is confusing. TODO: Expose pendingState or don't use it
           * during the merge.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {object} partialState Next partial state to be merged with state.
           * @param {?function} callback Called after component is updated.
           * @param {?string} Name of the calling function in the public API.
           * @internal
           */
          enqueueSetState: function(publicInstance, partialState, callback, callerName) {
            warnNoop(publicInstance, "setState");
          }
        };
        var assign2 = Object.assign;
        var emptyObject = {};
        {
          Object.freeze(emptyObject);
        }
        function Component2(props, context, updater) {
          this.props = props;
          this.context = context;
          this.refs = emptyObject;
          this.updater = updater || ReactNoopUpdateQueue;
        }
        Component2.prototype.isReactComponent = {};
        Component2.prototype.setState = function(partialState, callback) {
          if (typeof partialState !== "object" && typeof partialState !== "function" && partialState != null) {
            throw new Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
          }
          this.updater.enqueueSetState(this, partialState, callback, "setState");
        };
        Component2.prototype.forceUpdate = function(callback) {
          this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
        };
        {
          var deprecatedAPIs = {
            isMounted: ["isMounted", "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."],
            replaceState: ["replaceState", "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."]
          };
          var defineDeprecationWarning = function(methodName, info) {
            Object.defineProperty(Component2.prototype, methodName, {
              get: function() {
                warn("%s(...) is deprecated in plain JavaScript React classes. %s", info[0], info[1]);
                return void 0;
              }
            });
          };
          for (var fnName in deprecatedAPIs) {
            if (deprecatedAPIs.hasOwnProperty(fnName)) {
              defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
            }
          }
        }
        function ComponentDummy() {
        }
        ComponentDummy.prototype = Component2.prototype;
        function PureComponent(props, context, updater) {
          this.props = props;
          this.context = context;
          this.refs = emptyObject;
          this.updater = updater || ReactNoopUpdateQueue;
        }
        var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
        pureComponentPrototype.constructor = PureComponent;
        assign2(pureComponentPrototype, Component2.prototype);
        pureComponentPrototype.isPureReactComponent = true;
        function createRef() {
          var refObject = {
            current: null
          };
          {
            Object.seal(refObject);
          }
          return refObject;
        }
        var isArrayImpl = Array.isArray;
        function isArray(a2) {
          return isArrayImpl(a2);
        }
        function typeName(value) {
          {
            var hasToStringTag = typeof Symbol === "function" && Symbol.toStringTag;
            var type = hasToStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
            return type;
          }
        }
        function willCoercionThrow(value) {
          {
            try {
              testStringCoercion(value);
              return false;
            } catch (e2) {
              return true;
            }
          }
        }
        function testStringCoercion(value) {
          return "" + value;
        }
        function checkKeyStringCoercion(value) {
          {
            if (willCoercionThrow(value)) {
              error("The provided key is an unsupported type %s. This value must be coerced to a string before before using it here.", typeName(value));
              return testStringCoercion(value);
            }
          }
        }
        function getWrappedName(outerType, innerType, wrapperName) {
          var displayName = outerType.displayName;
          if (displayName) {
            return displayName;
          }
          var functionName = innerType.displayName || innerType.name || "";
          return functionName !== "" ? wrapperName + "(" + functionName + ")" : wrapperName;
        }
        function getContextName(type) {
          return type.displayName || "Context";
        }
        function getComponentNameFromType(type) {
          if (type == null) {
            return null;
          }
          {
            if (typeof type.tag === "number") {
              error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue.");
            }
          }
          if (typeof type === "function") {
            return type.displayName || type.name || null;
          }
          if (typeof type === "string") {
            return type;
          }
          switch (type) {
            case REACT_FRAGMENT_TYPE:
              return "Fragment";
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_PROFILER_TYPE:
              return "Profiler";
            case REACT_STRICT_MODE_TYPE:
              return "StrictMode";
            case REACT_SUSPENSE_TYPE:
              return "Suspense";
            case REACT_SUSPENSE_LIST_TYPE:
              return "SuspenseList";
          }
          if (typeof type === "object") {
            switch (type.$$typeof) {
              case REACT_CONTEXT_TYPE:
                var context = type;
                return getContextName(context) + ".Consumer";
              case REACT_PROVIDER_TYPE:
                var provider = type;
                return getContextName(provider._context) + ".Provider";
              case REACT_FORWARD_REF_TYPE:
                return getWrappedName(type, type.render, "ForwardRef");
              case REACT_MEMO_TYPE:
                var outerName = type.displayName || null;
                if (outerName !== null) {
                  return outerName;
                }
                return getComponentNameFromType(type.type) || "Memo";
              case REACT_LAZY_TYPE: {
                var lazyComponent = type;
                var payload = lazyComponent._payload;
                var init = lazyComponent._init;
                try {
                  return getComponentNameFromType(init(payload));
                } catch (x2) {
                  return null;
                }
              }
            }
          }
          return null;
        }
        var hasOwnProperty = Object.prototype.hasOwnProperty;
        var RESERVED_PROPS = {
          key: true,
          ref: true,
          __self: true,
          __source: true
        };
        var specialPropKeyWarningShown, specialPropRefWarningShown, didWarnAboutStringRefs;
        {
          didWarnAboutStringRefs = {};
        }
        function hasValidRef(config) {
          {
            if (hasOwnProperty.call(config, "ref")) {
              var getter = Object.getOwnPropertyDescriptor(config, "ref").get;
              if (getter && getter.isReactWarning) {
                return false;
              }
            }
          }
          return config.ref !== void 0;
        }
        function hasValidKey(config) {
          {
            if (hasOwnProperty.call(config, "key")) {
              var getter = Object.getOwnPropertyDescriptor(config, "key").get;
              if (getter && getter.isReactWarning) {
                return false;
              }
            }
          }
          return config.key !== void 0;
        }
        function defineKeyPropWarningGetter(props, displayName) {
          var warnAboutAccessingKey = function() {
            {
              if (!specialPropKeyWarningShown) {
                specialPropKeyWarningShown = true;
                error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", displayName);
              }
            }
          };
          warnAboutAccessingKey.isReactWarning = true;
          Object.defineProperty(props, "key", {
            get: warnAboutAccessingKey,
            configurable: true
          });
        }
        function defineRefPropWarningGetter(props, displayName) {
          var warnAboutAccessingRef = function() {
            {
              if (!specialPropRefWarningShown) {
                specialPropRefWarningShown = true;
                error("%s: `ref` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", displayName);
              }
            }
          };
          warnAboutAccessingRef.isReactWarning = true;
          Object.defineProperty(props, "ref", {
            get: warnAboutAccessingRef,
            configurable: true
          });
        }
        function warnIfStringRefCannotBeAutoConverted(config) {
          {
            if (typeof config.ref === "string" && ReactCurrentOwner.current && config.__self && ReactCurrentOwner.current.stateNode !== config.__self) {
              var componentName = getComponentNameFromType(ReactCurrentOwner.current.type);
              if (!didWarnAboutStringRefs[componentName]) {
                error('Component "%s" contains the string ref "%s". Support for string refs will be removed in a future major release. This case cannot be automatically converted to an arrow function. We ask you to manually fix this case by using useRef() or createRef() instead. Learn more about using refs safely here: https://reactjs.org/link/strict-mode-string-ref', componentName, config.ref);
                didWarnAboutStringRefs[componentName] = true;
              }
            }
          }
        }
        var ReactElement = function(type, key, ref, self2, source, owner, props) {
          var element = {
            // This tag allows us to uniquely identify this as a React Element
            $$typeof: REACT_ELEMENT_TYPE,
            // Built-in properties that belong on the element
            type,
            key,
            ref,
            props,
            // Record the component responsible for creating this element.
            _owner: owner
          };
          {
            element._store = {};
            Object.defineProperty(element._store, "validated", {
              configurable: false,
              enumerable: false,
              writable: true,
              value: false
            });
            Object.defineProperty(element, "_self", {
              configurable: false,
              enumerable: false,
              writable: false,
              value: self2
            });
            Object.defineProperty(element, "_source", {
              configurable: false,
              enumerable: false,
              writable: false,
              value: source
            });
            if (Object.freeze) {
              Object.freeze(element.props);
              Object.freeze(element);
            }
          }
          return element;
        };
        function createElement(type, config, children) {
          var propName;
          var props = {};
          var key = null;
          var ref = null;
          var self2 = null;
          var source = null;
          if (config != null) {
            if (hasValidRef(config)) {
              ref = config.ref;
              {
                warnIfStringRefCannotBeAutoConverted(config);
              }
            }
            if (hasValidKey(config)) {
              {
                checkKeyStringCoercion(config.key);
              }
              key = "" + config.key;
            }
            self2 = config.__self === void 0 ? null : config.__self;
            source = config.__source === void 0 ? null : config.__source;
            for (propName in config) {
              if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
                props[propName] = config[propName];
              }
            }
          }
          var childrenLength = arguments.length - 2;
          if (childrenLength === 1) {
            props.children = children;
          } else if (childrenLength > 1) {
            var childArray = Array(childrenLength);
            for (var i2 = 0; i2 < childrenLength; i2++) {
              childArray[i2] = arguments[i2 + 2];
            }
            {
              if (Object.freeze) {
                Object.freeze(childArray);
              }
            }
            props.children = childArray;
          }
          if (type && type.defaultProps) {
            var defaultProps = type.defaultProps;
            for (propName in defaultProps) {
              if (props[propName] === void 0) {
                props[propName] = defaultProps[propName];
              }
            }
          }
          {
            if (key || ref) {
              var displayName = typeof type === "function" ? type.displayName || type.name || "Unknown" : type;
              if (key) {
                defineKeyPropWarningGetter(props, displayName);
              }
              if (ref) {
                defineRefPropWarningGetter(props, displayName);
              }
            }
          }
          return ReactElement(type, key, ref, self2, source, ReactCurrentOwner.current, props);
        }
        function cloneAndReplaceKey(oldElement, newKey) {
          var newElement = ReactElement(oldElement.type, newKey, oldElement.ref, oldElement._self, oldElement._source, oldElement._owner, oldElement.props);
          return newElement;
        }
        function cloneElement(element, config, children) {
          if (element === null || element === void 0) {
            throw new Error("React.cloneElement(...): The argument must be a React element, but you passed " + element + ".");
          }
          var propName;
          var props = assign2({}, element.props);
          var key = element.key;
          var ref = element.ref;
          var self2 = element._self;
          var source = element._source;
          var owner = element._owner;
          if (config != null) {
            if (hasValidRef(config)) {
              ref = config.ref;
              owner = ReactCurrentOwner.current;
            }
            if (hasValidKey(config)) {
              {
                checkKeyStringCoercion(config.key);
              }
              key = "" + config.key;
            }
            var defaultProps;
            if (element.type && element.type.defaultProps) {
              defaultProps = element.type.defaultProps;
            }
            for (propName in config) {
              if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
                if (config[propName] === void 0 && defaultProps !== void 0) {
                  props[propName] = defaultProps[propName];
                } else {
                  props[propName] = config[propName];
                }
              }
            }
          }
          var childrenLength = arguments.length - 2;
          if (childrenLength === 1) {
            props.children = children;
          } else if (childrenLength > 1) {
            var childArray = Array(childrenLength);
            for (var i2 = 0; i2 < childrenLength; i2++) {
              childArray[i2] = arguments[i2 + 2];
            }
            props.children = childArray;
          }
          return ReactElement(element.type, key, ref, self2, source, owner, props);
        }
        function isValidElement(object) {
          return typeof object === "object" && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
        }
        var SEPARATOR = ".";
        var SUBSEPARATOR = ":";
        function escape(key) {
          var escapeRegex = /[=:]/g;
          var escaperLookup = {
            "=": "=0",
            ":": "=2"
          };
          var escapedString = key.replace(escapeRegex, function(match) {
            return escaperLookup[match];
          });
          return "$" + escapedString;
        }
        var didWarnAboutMaps = false;
        var userProvidedKeyEscapeRegex = /\/+/g;
        function escapeUserProvidedKey(text) {
          return text.replace(userProvidedKeyEscapeRegex, "$&/");
        }
        function getElementKey(element, index) {
          if (typeof element === "object" && element !== null && element.key != null) {
            {
              checkKeyStringCoercion(element.key);
            }
            return escape("" + element.key);
          }
          return index.toString(36);
        }
        function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
          var type = typeof children;
          if (type === "undefined" || type === "boolean") {
            children = null;
          }
          var invokeCallback = false;
          if (children === null) {
            invokeCallback = true;
          } else {
            switch (type) {
              case "string":
              case "number":
                invokeCallback = true;
                break;
              case "object":
                switch (children.$$typeof) {
                  case REACT_ELEMENT_TYPE:
                  case REACT_PORTAL_TYPE:
                    invokeCallback = true;
                }
            }
          }
          if (invokeCallback) {
            var _child = children;
            var mappedChild = callback(_child);
            var childKey = nameSoFar === "" ? SEPARATOR + getElementKey(_child, 0) : nameSoFar;
            if (isArray(mappedChild)) {
              var escapedChildKey = "";
              if (childKey != null) {
                escapedChildKey = escapeUserProvidedKey(childKey) + "/";
              }
              mapIntoArray(mappedChild, array, escapedChildKey, "", function(c2) {
                return c2;
              });
            } else if (mappedChild != null) {
              if (isValidElement(mappedChild)) {
                {
                  if (mappedChild.key && (!_child || _child.key !== mappedChild.key)) {
                    checkKeyStringCoercion(mappedChild.key);
                  }
                }
                mappedChild = cloneAndReplaceKey(
                  mappedChild,
                  // Keep both the (mapped) and old keys if they differ, just as
                  // traverseAllChildren used to do for objects as children
                  escapedPrefix + // $FlowFixMe Flow incorrectly thinks React.Portal doesn't have a key
                  (mappedChild.key && (!_child || _child.key !== mappedChild.key) ? (
                    // $FlowFixMe Flow incorrectly thinks existing element's key can be a number
                    // eslint-disable-next-line react-internal/safe-string-coercion
                    escapeUserProvidedKey("" + mappedChild.key) + "/"
                  ) : "") + childKey
                );
              }
              array.push(mappedChild);
            }
            return 1;
          }
          var child;
          var nextName;
          var subtreeCount = 0;
          var nextNamePrefix = nameSoFar === "" ? SEPARATOR : nameSoFar + SUBSEPARATOR;
          if (isArray(children)) {
            for (var i2 = 0; i2 < children.length; i2++) {
              child = children[i2];
              nextName = nextNamePrefix + getElementKey(child, i2);
              subtreeCount += mapIntoArray(child, array, escapedPrefix, nextName, callback);
            }
          } else {
            var iteratorFn = getIteratorFn(children);
            if (typeof iteratorFn === "function") {
              var iterableChildren = children;
              {
                if (iteratorFn === iterableChildren.entries) {
                  if (!didWarnAboutMaps) {
                    warn("Using Maps as children is not supported. Use an array of keyed ReactElements instead.");
                  }
                  didWarnAboutMaps = true;
                }
              }
              var iterator = iteratorFn.call(iterableChildren);
              var step;
              var ii = 0;
              while (!(step = iterator.next()).done) {
                child = step.value;
                nextName = nextNamePrefix + getElementKey(child, ii++);
                subtreeCount += mapIntoArray(child, array, escapedPrefix, nextName, callback);
              }
            } else if (type === "object") {
              var childrenString = String(children);
              throw new Error("Objects are not valid as a React child (found: " + (childrenString === "[object Object]" ? "object with keys {" + Object.keys(children).join(", ") + "}" : childrenString) + "). If you meant to render a collection of children, use an array instead.");
            }
          }
          return subtreeCount;
        }
        function mapChildren(children, func, context) {
          if (children == null) {
            return children;
          }
          var result = [];
          var count = 0;
          mapIntoArray(children, result, "", "", function(child) {
            return func.call(context, child, count++);
          });
          return result;
        }
        function countChildren(children) {
          var n2 = 0;
          mapChildren(children, function() {
            n2++;
          });
          return n2;
        }
        function forEachChildren(children, forEachFunc, forEachContext) {
          mapChildren(children, function() {
            forEachFunc.apply(this, arguments);
          }, forEachContext);
        }
        function toArray2(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        }
        function onlyChild(children) {
          if (!isValidElement(children)) {
            throw new Error("React.Children.only expected to receive a single React element child.");
          }
          return children;
        }
        function createContext(defaultValue) {
          var context = {
            $$typeof: REACT_CONTEXT_TYPE,
            // As a workaround to support multiple concurrent renderers, we categorize
            // some renderers as primary and others as secondary. We only expect
            // there to be two concurrent renderers at most: React Native (primary) and
            // Fabric (secondary); React DOM (primary) and React ART (secondary).
            // Secondary renderers store their context values on separate fields.
            _currentValue: defaultValue,
            _currentValue2: defaultValue,
            // Used to track how many concurrent renderers this context currently
            // supports within in a single renderer. Such as parallel server rendering.
            _threadCount: 0,
            // These are circular
            Provider: null,
            Consumer: null,
            // Add these to use same hidden class in VM as ServerContext
            _defaultValue: null,
            _globalName: null
          };
          context.Provider = {
            $$typeof: REACT_PROVIDER_TYPE,
            _context: context
          };
          var hasWarnedAboutUsingNestedContextConsumers = false;
          var hasWarnedAboutUsingConsumerProvider = false;
          var hasWarnedAboutDisplayNameOnConsumer = false;
          {
            var Consumer = {
              $$typeof: REACT_CONTEXT_TYPE,
              _context: context
            };
            Object.defineProperties(Consumer, {
              Provider: {
                get: function() {
                  if (!hasWarnedAboutUsingConsumerProvider) {
                    hasWarnedAboutUsingConsumerProvider = true;
                    error("Rendering <Context.Consumer.Provider> is not supported and will be removed in a future major release. Did you mean to render <Context.Provider> instead?");
                  }
                  return context.Provider;
                },
                set: function(_Provider) {
                  context.Provider = _Provider;
                }
              },
              _currentValue: {
                get: function() {
                  return context._currentValue;
                },
                set: function(_currentValue) {
                  context._currentValue = _currentValue;
                }
              },
              _currentValue2: {
                get: function() {
                  return context._currentValue2;
                },
                set: function(_currentValue2) {
                  context._currentValue2 = _currentValue2;
                }
              },
              _threadCount: {
                get: function() {
                  return context._threadCount;
                },
                set: function(_threadCount) {
                  context._threadCount = _threadCount;
                }
              },
              Consumer: {
                get: function() {
                  if (!hasWarnedAboutUsingNestedContextConsumers) {
                    hasWarnedAboutUsingNestedContextConsumers = true;
                    error("Rendering <Context.Consumer.Consumer> is not supported and will be removed in a future major release. Did you mean to render <Context.Consumer> instead?");
                  }
                  return context.Consumer;
                }
              },
              displayName: {
                get: function() {
                  return context.displayName;
                },
                set: function(displayName) {
                  if (!hasWarnedAboutDisplayNameOnConsumer) {
                    warn("Setting `displayName` on Context.Consumer has no effect. You should set it directly on the context with Context.displayName = '%s'.", displayName);
                    hasWarnedAboutDisplayNameOnConsumer = true;
                  }
                }
              }
            });
            context.Consumer = Consumer;
          }
          {
            context._currentRenderer = null;
            context._currentRenderer2 = null;
          }
          return context;
        }
        var Uninitialized = -1;
        var Pending = 0;
        var Resolved = 1;
        var Rejected = 2;
        function lazyInitializer(payload) {
          if (payload._status === Uninitialized) {
            var ctor = payload._result;
            var thenable = ctor();
            thenable.then(function(moduleObject2) {
              if (payload._status === Pending || payload._status === Uninitialized) {
                var resolved = payload;
                resolved._status = Resolved;
                resolved._result = moduleObject2;
              }
            }, function(error2) {
              if (payload._status === Pending || payload._status === Uninitialized) {
                var rejected = payload;
                rejected._status = Rejected;
                rejected._result = error2;
              }
            });
            if (payload._status === Uninitialized) {
              var pending = payload;
              pending._status = Pending;
              pending._result = thenable;
            }
          }
          if (payload._status === Resolved) {
            var moduleObject = payload._result;
            {
              if (moduleObject === void 0) {
                error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?", moduleObject);
              }
            }
            {
              if (!("default" in moduleObject)) {
                error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))", moduleObject);
              }
            }
            return moduleObject.default;
          } else {
            throw payload._result;
          }
        }
        function lazy(ctor) {
          var payload = {
            // We use these fields to store the result.
            _status: Uninitialized,
            _result: ctor
          };
          var lazyType = {
            $$typeof: REACT_LAZY_TYPE,
            _payload: payload,
            _init: lazyInitializer
          };
          {
            var defaultProps;
            var propTypes;
            Object.defineProperties(lazyType, {
              defaultProps: {
                configurable: true,
                get: function() {
                  return defaultProps;
                },
                set: function(newDefaultProps) {
                  error("React.lazy(...): It is not supported to assign `defaultProps` to a lazy component import. Either specify them where the component is defined, or create a wrapping component around it.");
                  defaultProps = newDefaultProps;
                  Object.defineProperty(lazyType, "defaultProps", {
                    enumerable: true
                  });
                }
              },
              propTypes: {
                configurable: true,
                get: function() {
                  return propTypes;
                },
                set: function(newPropTypes) {
                  error("React.lazy(...): It is not supported to assign `propTypes` to a lazy component import. Either specify them where the component is defined, or create a wrapping component around it.");
                  propTypes = newPropTypes;
                  Object.defineProperty(lazyType, "propTypes", {
                    enumerable: true
                  });
                }
              }
            });
          }
          return lazyType;
        }
        function forwardRef(render2) {
          {
            if (render2 != null && render2.$$typeof === REACT_MEMO_TYPE) {
              error("forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...)).");
            } else if (typeof render2 !== "function") {
              error("forwardRef requires a render function but was given %s.", render2 === null ? "null" : typeof render2);
            } else {
              if (render2.length !== 0 && render2.length !== 2) {
                error("forwardRef render functions accept exactly two parameters: props and ref. %s", render2.length === 1 ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined.");
              }
            }
            if (render2 != null) {
              if (render2.defaultProps != null || render2.propTypes != null) {
                error("forwardRef render functions do not support propTypes or defaultProps. Did you accidentally pass a React component?");
              }
            }
          }
          var elementType = {
            $$typeof: REACT_FORWARD_REF_TYPE,
            render: render2
          };
          {
            var ownName;
            Object.defineProperty(elementType, "displayName", {
              enumerable: false,
              configurable: true,
              get: function() {
                return ownName;
              },
              set: function(name) {
                ownName = name;
                if (!render2.name && !render2.displayName) {
                  render2.displayName = name;
                }
              }
            });
          }
          return elementType;
        }
        var REACT_MODULE_REFERENCE;
        {
          REACT_MODULE_REFERENCE = /* @__PURE__ */ Symbol.for("react.module.reference");
        }
        function isValidElementType(type) {
          if (typeof type === "string" || typeof type === "function") {
            return true;
          }
          if (type === REACT_FRAGMENT_TYPE || type === REACT_PROFILER_TYPE || enableDebugTracing || type === REACT_STRICT_MODE_TYPE || type === REACT_SUSPENSE_TYPE || type === REACT_SUSPENSE_LIST_TYPE || enableLegacyHidden || type === REACT_OFFSCREEN_TYPE || enableScopeAPI || enableCacheElement || enableTransitionTracing) {
            return true;
          }
          if (typeof type === "object" && type !== null) {
            if (type.$$typeof === REACT_LAZY_TYPE || type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_PROVIDER_TYPE || type.$$typeof === REACT_CONTEXT_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE || // This needs to include all possible module reference object
            // types supported by any Flight configuration anywhere since
            // we don't know which Flight build this will end up being used
            // with.
            type.$$typeof === REACT_MODULE_REFERENCE || type.getModuleId !== void 0) {
              return true;
            }
          }
          return false;
        }
        function memo(type, compare) {
          {
            if (!isValidElementType(type)) {
              error("memo: The first argument must be a component. Instead received: %s", type === null ? "null" : typeof type);
            }
          }
          var elementType = {
            $$typeof: REACT_MEMO_TYPE,
            type,
            compare: compare === void 0 ? null : compare
          };
          {
            var ownName;
            Object.defineProperty(elementType, "displayName", {
              enumerable: false,
              configurable: true,
              get: function() {
                return ownName;
              },
              set: function(name) {
                ownName = name;
                if (!type.name && !type.displayName) {
                  type.displayName = name;
                }
              }
            });
          }
          return elementType;
        }
        function resolveDispatcher() {
          var dispatcher = ReactCurrentDispatcher.current;
          {
            if (dispatcher === null) {
              error("Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://reactjs.org/link/invalid-hook-call for tips about how to debug and fix this problem.");
            }
          }
          return dispatcher;
        }
        function useContext(Context) {
          var dispatcher = resolveDispatcher();
          {
            if (Context._context !== void 0) {
              var realContext = Context._context;
              if (realContext.Consumer === Context) {
                error("Calling useContext(Context.Consumer) is not supported, may cause bugs, and will be removed in a future major release. Did you mean to call useContext(Context) instead?");
              } else if (realContext.Provider === Context) {
                error("Calling useContext(Context.Provider) is not supported. Did you mean to call useContext(Context) instead?");
              }
            }
          }
          return dispatcher.useContext(Context);
        }
        function useState2(initialState) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useState(initialState);
        }
        function useReducer(reducer, initialArg, init) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useReducer(reducer, initialArg, init);
        }
        function useRef(initialValue) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useRef(initialValue);
        }
        function useEffect2(create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useEffect(create, deps);
        }
        function useInsertionEffect(create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useInsertionEffect(create, deps);
        }
        function useLayoutEffect(create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useLayoutEffect(create, deps);
        }
        function useCallback2(callback, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useCallback(callback, deps);
        }
        function useMemo2(create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useMemo(create, deps);
        }
        function useImperativeHandle(ref, create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useImperativeHandle(ref, create, deps);
        }
        function useDebugValue(value, formatterFn) {
          {
            var dispatcher = resolveDispatcher();
            return dispatcher.useDebugValue(value, formatterFn);
          }
        }
        function useTransition() {
          var dispatcher = resolveDispatcher();
          return dispatcher.useTransition();
        }
        function useDeferredValue(value) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useDeferredValue(value);
        }
        function useId() {
          var dispatcher = resolveDispatcher();
          return dispatcher.useId();
        }
        function useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
        }
        var disabledDepth = 0;
        var prevLog;
        var prevInfo;
        var prevWarn;
        var prevError;
        var prevGroup;
        var prevGroupCollapsed;
        var prevGroupEnd;
        function disabledLog() {
        }
        disabledLog.__reactDisabledLog = true;
        function disableLogs() {
          {
            if (disabledDepth === 0) {
              prevLog = console.log;
              prevInfo = console.info;
              prevWarn = console.warn;
              prevError = console.error;
              prevGroup = console.group;
              prevGroupCollapsed = console.groupCollapsed;
              prevGroupEnd = console.groupEnd;
              var props = {
                configurable: true,
                enumerable: true,
                value: disabledLog,
                writable: true
              };
              Object.defineProperties(console, {
                info: props,
                log: props,
                warn: props,
                error: props,
                group: props,
                groupCollapsed: props,
                groupEnd: props
              });
            }
            disabledDepth++;
          }
        }
        function reenableLogs() {
          {
            disabledDepth--;
            if (disabledDepth === 0) {
              var props = {
                configurable: true,
                enumerable: true,
                writable: true
              };
              Object.defineProperties(console, {
                log: assign2({}, props, {
                  value: prevLog
                }),
                info: assign2({}, props, {
                  value: prevInfo
                }),
                warn: assign2({}, props, {
                  value: prevWarn
                }),
                error: assign2({}, props, {
                  value: prevError
                }),
                group: assign2({}, props, {
                  value: prevGroup
                }),
                groupCollapsed: assign2({}, props, {
                  value: prevGroupCollapsed
                }),
                groupEnd: assign2({}, props, {
                  value: prevGroupEnd
                })
              });
            }
            if (disabledDepth < 0) {
              error("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
            }
          }
        }
        var ReactCurrentDispatcher$1 = ReactSharedInternals.ReactCurrentDispatcher;
        var prefix;
        function describeBuiltInComponentFrame(name, source, ownerFn) {
          {
            if (prefix === void 0) {
              try {
                throw Error();
              } catch (x2) {
                var match = x2.stack.trim().match(/\n( *(at )?)/);
                prefix = match && match[1] || "";
              }
            }
            return "\n" + prefix + name;
          }
        }
        var reentry = false;
        var componentFrameCache;
        {
          var PossiblyWeakMap = typeof WeakMap === "function" ? WeakMap : Map;
          componentFrameCache = new PossiblyWeakMap();
        }
        function describeNativeComponentFrame(fn, construct) {
          if (!fn || reentry) {
            return "";
          }
          {
            var frame = componentFrameCache.get(fn);
            if (frame !== void 0) {
              return frame;
            }
          }
          var control;
          reentry = true;
          var previousPrepareStackTrace = Error.prepareStackTrace;
          Error.prepareStackTrace = void 0;
          var previousDispatcher;
          {
            previousDispatcher = ReactCurrentDispatcher$1.current;
            ReactCurrentDispatcher$1.current = null;
            disableLogs();
          }
          try {
            if (construct) {
              var Fake = function() {
                throw Error();
              };
              Object.defineProperty(Fake.prototype, "props", {
                set: function() {
                  throw Error();
                }
              });
              if (typeof Reflect === "object" && Reflect.construct) {
                try {
                  Reflect.construct(Fake, []);
                } catch (x2) {
                  control = x2;
                }
                Reflect.construct(fn, [], Fake);
              } else {
                try {
                  Fake.call();
                } catch (x2) {
                  control = x2;
                }
                fn.call(Fake.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (x2) {
                control = x2;
              }
              fn();
            }
          } catch (sample) {
            if (sample && control && typeof sample.stack === "string") {
              var sampleLines = sample.stack.split("\n");
              var controlLines = control.stack.split("\n");
              var s2 = sampleLines.length - 1;
              var c2 = controlLines.length - 1;
              while (s2 >= 1 && c2 >= 0 && sampleLines[s2] !== controlLines[c2]) {
                c2--;
              }
              for (; s2 >= 1 && c2 >= 0; s2--, c2--) {
                if (sampleLines[s2] !== controlLines[c2]) {
                  if (s2 !== 1 || c2 !== 1) {
                    do {
                      s2--;
                      c2--;
                      if (c2 < 0 || sampleLines[s2] !== controlLines[c2]) {
                        var _frame = "\n" + sampleLines[s2].replace(" at new ", " at ");
                        if (fn.displayName && _frame.includes("<anonymous>")) {
                          _frame = _frame.replace("<anonymous>", fn.displayName);
                        }
                        {
                          if (typeof fn === "function") {
                            componentFrameCache.set(fn, _frame);
                          }
                        }
                        return _frame;
                      }
                    } while (s2 >= 1 && c2 >= 0);
                  }
                  break;
                }
              }
            }
          } finally {
            reentry = false;
            {
              ReactCurrentDispatcher$1.current = previousDispatcher;
              reenableLogs();
            }
            Error.prepareStackTrace = previousPrepareStackTrace;
          }
          var name = fn ? fn.displayName || fn.name : "";
          var syntheticFrame = name ? describeBuiltInComponentFrame(name) : "";
          {
            if (typeof fn === "function") {
              componentFrameCache.set(fn, syntheticFrame);
            }
          }
          return syntheticFrame;
        }
        function describeFunctionComponentFrame(fn, source, ownerFn) {
          {
            return describeNativeComponentFrame(fn, false);
          }
        }
        function shouldConstruct(Component3) {
          var prototype = Component3.prototype;
          return !!(prototype && prototype.isReactComponent);
        }
        function describeUnknownElementTypeFrameInDEV(type, source, ownerFn) {
          if (type == null) {
            return "";
          }
          if (typeof type === "function") {
            {
              return describeNativeComponentFrame(type, shouldConstruct(type));
            }
          }
          if (typeof type === "string") {
            return describeBuiltInComponentFrame(type);
          }
          switch (type) {
            case REACT_SUSPENSE_TYPE:
              return describeBuiltInComponentFrame("Suspense");
            case REACT_SUSPENSE_LIST_TYPE:
              return describeBuiltInComponentFrame("SuspenseList");
          }
          if (typeof type === "object") {
            switch (type.$$typeof) {
              case REACT_FORWARD_REF_TYPE:
                return describeFunctionComponentFrame(type.render);
              case REACT_MEMO_TYPE:
                return describeUnknownElementTypeFrameInDEV(type.type, source, ownerFn);
              case REACT_LAZY_TYPE: {
                var lazyComponent = type;
                var payload = lazyComponent._payload;
                var init = lazyComponent._init;
                try {
                  return describeUnknownElementTypeFrameInDEV(init(payload), source, ownerFn);
                } catch (x2) {
                }
              }
            }
          }
          return "";
        }
        var loggedTypeFailures = {};
        var ReactDebugCurrentFrame$1 = ReactSharedInternals.ReactDebugCurrentFrame;
        function setCurrentlyValidatingElement(element) {
          {
            if (element) {
              var owner = element._owner;
              var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
              ReactDebugCurrentFrame$1.setExtraStackFrame(stack);
            } else {
              ReactDebugCurrentFrame$1.setExtraStackFrame(null);
            }
          }
        }
        function checkPropTypes(typeSpecs, values, location, componentName, element) {
          {
            var has = Function.call.bind(hasOwnProperty);
            for (var typeSpecName in typeSpecs) {
              if (has(typeSpecs, typeSpecName)) {
                var error$1 = void 0;
                try {
                  if (typeof typeSpecs[typeSpecName] !== "function") {
                    var err = Error((componentName || "React class") + ": " + location + " type `" + typeSpecName + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof typeSpecs[typeSpecName] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.");
                    err.name = "Invariant Violation";
                    throw err;
                  }
                  error$1 = typeSpecs[typeSpecName](values, typeSpecName, componentName, location, null, "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED");
                } catch (ex) {
                  error$1 = ex;
                }
                if (error$1 && !(error$1 instanceof Error)) {
                  setCurrentlyValidatingElement(element);
                  error("%s: type specification of %s `%s` is invalid; the type checker function must return `null` or an `Error` but returned a %s. You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument).", componentName || "React class", location, typeSpecName, typeof error$1);
                  setCurrentlyValidatingElement(null);
                }
                if (error$1 instanceof Error && !(error$1.message in loggedTypeFailures)) {
                  loggedTypeFailures[error$1.message] = true;
                  setCurrentlyValidatingElement(element);
                  error("Failed %s type: %s", location, error$1.message);
                  setCurrentlyValidatingElement(null);
                }
              }
            }
          }
        }
        function setCurrentlyValidatingElement$1(element) {
          {
            if (element) {
              var owner = element._owner;
              var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
              setExtraStackFrame(stack);
            } else {
              setExtraStackFrame(null);
            }
          }
        }
        var propTypesMisspellWarningShown;
        {
          propTypesMisspellWarningShown = false;
        }
        function getDeclarationErrorAddendum() {
          if (ReactCurrentOwner.current) {
            var name = getComponentNameFromType(ReactCurrentOwner.current.type);
            if (name) {
              return "\n\nCheck the render method of `" + name + "`.";
            }
          }
          return "";
        }
        function getSourceInfoErrorAddendum(source) {
          if (source !== void 0) {
            var fileName = source.fileName.replace(/^.*[\\\/]/, "");
            var lineNumber = source.lineNumber;
            return "\n\nCheck your code at " + fileName + ":" + lineNumber + ".";
          }
          return "";
        }
        function getSourceInfoErrorAddendumForProps(elementProps) {
          if (elementProps !== null && elementProps !== void 0) {
            return getSourceInfoErrorAddendum(elementProps.__source);
          }
          return "";
        }
        var ownerHasKeyUseWarning = {};
        function getCurrentComponentErrorInfo(parentType) {
          var info = getDeclarationErrorAddendum();
          if (!info) {
            var parentName = typeof parentType === "string" ? parentType : parentType.displayName || parentType.name;
            if (parentName) {
              info = "\n\nCheck the top-level render call using <" + parentName + ">.";
            }
          }
          return info;
        }
        function validateExplicitKey(element, parentType) {
          if (!element._store || element._store.validated || element.key != null) {
            return;
          }
          element._store.validated = true;
          var currentComponentErrorInfo = getCurrentComponentErrorInfo(parentType);
          if (ownerHasKeyUseWarning[currentComponentErrorInfo]) {
            return;
          }
          ownerHasKeyUseWarning[currentComponentErrorInfo] = true;
          var childOwner = "";
          if (element && element._owner && element._owner !== ReactCurrentOwner.current) {
            childOwner = " It was passed a child from " + getComponentNameFromType(element._owner.type) + ".";
          }
          {
            setCurrentlyValidatingElement$1(element);
            error('Each child in a list should have a unique "key" prop.%s%s See https://reactjs.org/link/warning-keys for more information.', currentComponentErrorInfo, childOwner);
            setCurrentlyValidatingElement$1(null);
          }
        }
        function validateChildKeys(node, parentType) {
          if (typeof node !== "object") {
            return;
          }
          if (isArray(node)) {
            for (var i2 = 0; i2 < node.length; i2++) {
              var child = node[i2];
              if (isValidElement(child)) {
                validateExplicitKey(child, parentType);
              }
            }
          } else if (isValidElement(node)) {
            if (node._store) {
              node._store.validated = true;
            }
          } else if (node) {
            var iteratorFn = getIteratorFn(node);
            if (typeof iteratorFn === "function") {
              if (iteratorFn !== node.entries) {
                var iterator = iteratorFn.call(node);
                var step;
                while (!(step = iterator.next()).done) {
                  if (isValidElement(step.value)) {
                    validateExplicitKey(step.value, parentType);
                  }
                }
              }
            }
          }
        }
        function validatePropTypes(element) {
          {
            var type = element.type;
            if (type === null || type === void 0 || typeof type === "string") {
              return;
            }
            var propTypes;
            if (typeof type === "function") {
              propTypes = type.propTypes;
            } else if (typeof type === "object" && (type.$$typeof === REACT_FORWARD_REF_TYPE || // Note: Memo only checks outer props here.
            // Inner props are checked in the reconciler.
            type.$$typeof === REACT_MEMO_TYPE)) {
              propTypes = type.propTypes;
            } else {
              return;
            }
            if (propTypes) {
              var name = getComponentNameFromType(type);
              checkPropTypes(propTypes, element.props, "prop", name, element);
            } else if (type.PropTypes !== void 0 && !propTypesMisspellWarningShown) {
              propTypesMisspellWarningShown = true;
              var _name = getComponentNameFromType(type);
              error("Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?", _name || "Unknown");
            }
            if (typeof type.getDefaultProps === "function" && !type.getDefaultProps.isReactClassApproved) {
              error("getDefaultProps is only used on classic React.createClass definitions. Use a static property named `defaultProps` instead.");
            }
          }
        }
        function validateFragmentProps(fragment) {
          {
            var keys = Object.keys(fragment.props);
            for (var i2 = 0; i2 < keys.length; i2++) {
              var key = keys[i2];
              if (key !== "children" && key !== "key") {
                setCurrentlyValidatingElement$1(fragment);
                error("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", key);
                setCurrentlyValidatingElement$1(null);
                break;
              }
            }
            if (fragment.ref !== null) {
              setCurrentlyValidatingElement$1(fragment);
              error("Invalid attribute `ref` supplied to `React.Fragment`.");
              setCurrentlyValidatingElement$1(null);
            }
          }
        }
        function createElementWithValidation(type, props, children) {
          var validType = isValidElementType(type);
          if (!validType) {
            var info = "";
            if (type === void 0 || typeof type === "object" && type !== null && Object.keys(type).length === 0) {
              info += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.";
            }
            var sourceInfo = getSourceInfoErrorAddendumForProps(props);
            if (sourceInfo) {
              info += sourceInfo;
            } else {
              info += getDeclarationErrorAddendum();
            }
            var typeString;
            if (type === null) {
              typeString = "null";
            } else if (isArray(type)) {
              typeString = "array";
            } else if (type !== void 0 && type.$$typeof === REACT_ELEMENT_TYPE) {
              typeString = "<" + (getComponentNameFromType(type.type) || "Unknown") + " />";
              info = " Did you accidentally export a JSX literal instead of a component?";
            } else {
              typeString = typeof type;
            }
            {
              error("React.createElement: type is invalid -- expected a string (for built-in components) or a class/function (for composite components) but got: %s.%s", typeString, info);
            }
          }
          var element = createElement.apply(this, arguments);
          if (element == null) {
            return element;
          }
          if (validType) {
            for (var i2 = 2; i2 < arguments.length; i2++) {
              validateChildKeys(arguments[i2], type);
            }
          }
          if (type === REACT_FRAGMENT_TYPE) {
            validateFragmentProps(element);
          } else {
            validatePropTypes(element);
          }
          return element;
        }
        var didWarnAboutDeprecatedCreateFactory = false;
        function createFactoryWithValidation(type) {
          var validatedFactory = createElementWithValidation.bind(null, type);
          validatedFactory.type = type;
          {
            if (!didWarnAboutDeprecatedCreateFactory) {
              didWarnAboutDeprecatedCreateFactory = true;
              warn("React.createFactory() is deprecated and will be removed in a future major release. Consider using JSX or use React.createElement() directly instead.");
            }
            Object.defineProperty(validatedFactory, "type", {
              enumerable: false,
              get: function() {
                warn("Factory.type is deprecated. Access the class directly before passing it to createFactory.");
                Object.defineProperty(this, "type", {
                  value: type
                });
                return type;
              }
            });
          }
          return validatedFactory;
        }
        function cloneElementWithValidation(element, props, children) {
          var newElement = cloneElement.apply(this, arguments);
          for (var i2 = 2; i2 < arguments.length; i2++) {
            validateChildKeys(arguments[i2], newElement.type);
          }
          validatePropTypes(newElement);
          return newElement;
        }
        function startTransition(scope, options) {
          var prevTransition = ReactCurrentBatchConfig.transition;
          ReactCurrentBatchConfig.transition = {};
          var currentTransition = ReactCurrentBatchConfig.transition;
          {
            ReactCurrentBatchConfig.transition._updatedFibers = /* @__PURE__ */ new Set();
          }
          try {
            scope();
          } finally {
            ReactCurrentBatchConfig.transition = prevTransition;
            {
              if (prevTransition === null && currentTransition._updatedFibers) {
                var updatedFibersCount = currentTransition._updatedFibers.size;
                if (updatedFibersCount > 10) {
                  warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table.");
                }
                currentTransition._updatedFibers.clear();
              }
            }
          }
        }
        var didWarnAboutMessageChannel = false;
        var enqueueTaskImpl = null;
        function enqueueTask(task) {
          if (enqueueTaskImpl === null) {
            try {
              var requireString = ("require" + Math.random()).slice(0, 7);
              var nodeRequire = module && module[requireString];
              enqueueTaskImpl = nodeRequire.call(module, "timers").setImmediate;
            } catch (_err) {
              enqueueTaskImpl = function(callback) {
                {
                  if (didWarnAboutMessageChannel === false) {
                    didWarnAboutMessageChannel = true;
                    if (typeof MessageChannel === "undefined") {
                      error("This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning.");
                    }
                  }
                }
                var channel = new MessageChannel();
                channel.port1.onmessage = callback;
                channel.port2.postMessage(void 0);
              };
            }
          }
          return enqueueTaskImpl(task);
        }
        var actScopeDepth = 0;
        var didWarnNoAwaitAct = false;
        function act(callback) {
          {
            var prevActScopeDepth = actScopeDepth;
            actScopeDepth++;
            if (ReactCurrentActQueue.current === null) {
              ReactCurrentActQueue.current = [];
            }
            var prevIsBatchingLegacy = ReactCurrentActQueue.isBatchingLegacy;
            var result;
            try {
              ReactCurrentActQueue.isBatchingLegacy = true;
              result = callback();
              if (!prevIsBatchingLegacy && ReactCurrentActQueue.didScheduleLegacyUpdate) {
                var queue = ReactCurrentActQueue.current;
                if (queue !== null) {
                  ReactCurrentActQueue.didScheduleLegacyUpdate = false;
                  flushActQueue(queue);
                }
              }
            } catch (error2) {
              popActScope(prevActScopeDepth);
              throw error2;
            } finally {
              ReactCurrentActQueue.isBatchingLegacy = prevIsBatchingLegacy;
            }
            if (result !== null && typeof result === "object" && typeof result.then === "function") {
              var thenableResult = result;
              var wasAwaited = false;
              var thenable = {
                then: function(resolve, reject) {
                  wasAwaited = true;
                  thenableResult.then(function(returnValue2) {
                    popActScope(prevActScopeDepth);
                    if (actScopeDepth === 0) {
                      recursivelyFlushAsyncActWork(returnValue2, resolve, reject);
                    } else {
                      resolve(returnValue2);
                    }
                  }, function(error2) {
                    popActScope(prevActScopeDepth);
                    reject(error2);
                  });
                }
              };
              {
                if (!didWarnNoAwaitAct && typeof Promise !== "undefined") {
                  Promise.resolve().then(function() {
                  }).then(function() {
                    if (!wasAwaited) {
                      didWarnNoAwaitAct = true;
                      error("You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);");
                    }
                  });
                }
              }
              return thenable;
            } else {
              var returnValue = result;
              popActScope(prevActScopeDepth);
              if (actScopeDepth === 0) {
                var _queue = ReactCurrentActQueue.current;
                if (_queue !== null) {
                  flushActQueue(_queue);
                  ReactCurrentActQueue.current = null;
                }
                var _thenable = {
                  then: function(resolve, reject) {
                    if (ReactCurrentActQueue.current === null) {
                      ReactCurrentActQueue.current = [];
                      recursivelyFlushAsyncActWork(returnValue, resolve, reject);
                    } else {
                      resolve(returnValue);
                    }
                  }
                };
                return _thenable;
              } else {
                var _thenable2 = {
                  then: function(resolve, reject) {
                    resolve(returnValue);
                  }
                };
                return _thenable2;
              }
            }
          }
        }
        function popActScope(prevActScopeDepth) {
          {
            if (prevActScopeDepth !== actScopeDepth - 1) {
              error("You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. ");
            }
            actScopeDepth = prevActScopeDepth;
          }
        }
        function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
          {
            var queue = ReactCurrentActQueue.current;
            if (queue !== null) {
              try {
                flushActQueue(queue);
                enqueueTask(function() {
                  if (queue.length === 0) {
                    ReactCurrentActQueue.current = null;
                    resolve(returnValue);
                  } else {
                    recursivelyFlushAsyncActWork(returnValue, resolve, reject);
                  }
                });
              } catch (error2) {
                reject(error2);
              }
            } else {
              resolve(returnValue);
            }
          }
        }
        var isFlushing = false;
        function flushActQueue(queue) {
          {
            if (!isFlushing) {
              isFlushing = true;
              var i2 = 0;
              try {
                for (; i2 < queue.length; i2++) {
                  var callback = queue[i2];
                  do {
                    callback = callback(true);
                  } while (callback !== null);
                }
                queue.length = 0;
              } catch (error2) {
                queue = queue.slice(i2 + 1);
                throw error2;
              } finally {
                isFlushing = false;
              }
            }
          }
        }
        var createElement$1 = createElementWithValidation;
        var cloneElement$1 = cloneElementWithValidation;
        var createFactory = createFactoryWithValidation;
        var Children = {
          map: mapChildren,
          forEach: forEachChildren,
          count: countChildren,
          toArray: toArray2,
          only: onlyChild
        };
        exports.Children = Children;
        exports.Component = Component2;
        exports.Fragment = REACT_FRAGMENT_TYPE;
        exports.Profiler = REACT_PROFILER_TYPE;
        exports.PureComponent = PureComponent;
        exports.StrictMode = REACT_STRICT_MODE_TYPE;
        exports.Suspense = REACT_SUSPENSE_TYPE;
        exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ReactSharedInternals;
        exports.act = act;
        exports.cloneElement = cloneElement$1;
        exports.createContext = createContext;
        exports.createElement = createElement$1;
        exports.createFactory = createFactory;
        exports.createRef = createRef;
        exports.forwardRef = forwardRef;
        exports.isValidElement = isValidElement;
        exports.lazy = lazy;
        exports.memo = memo;
        exports.startTransition = startTransition;
        exports.unstable_act = act;
        exports.useCallback = useCallback2;
        exports.useContext = useContext;
        exports.useDebugValue = useDebugValue;
        exports.useDeferredValue = useDeferredValue;
        exports.useEffect = useEffect2;
        exports.useId = useId;
        exports.useImperativeHandle = useImperativeHandle;
        exports.useInsertionEffect = useInsertionEffect;
        exports.useLayoutEffect = useLayoutEffect;
        exports.useMemo = useMemo2;
        exports.useReducer = useReducer;
        exports.useRef = useRef;
        exports.useState = useState2;
        exports.useSyncExternalStore = useSyncExternalStore;
        exports.useTransition = useTransition;
        exports.version = ReactVersion;
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop === "function") {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(new Error());
        }
      })();
    }
  }
});

// node_modules/react/index.js
var require_react = __commonJS({
  "node_modules/react/index.js"(exports, module) {
    "use strict";
    if (false) {
      module.exports = null;
    } else {
      module.exports = require_react_development();
    }
  }
});

// node_modules/@gravity-ui/graph/build/services/camera/CameraService.js
var import_intersects = __toESM(require_intersects());

// node_modules/@preact/signals-core/dist/signals-core.module.js
var i = /* @__PURE__ */ Symbol.for("preact-signals");
function t() {
  if (!(v > 1)) {
    var i2, t2 = false;
    !(function() {
      var i3 = c;
      c = void 0;
      while (void 0 !== i3) {
        var t3 = i3.S;
        if (t3.v === i3.v) {
          for (var n3 = t3.t; void 0 !== n3; n3 = n3.x) if (n3.i === i3.i) n3.i = t3.i;
        }
        i3 = i3.o;
      }
    })();
    while (void 0 !== h) {
      var n2 = h;
      h = void 0;
      s++;
      while (void 0 !== n2) {
        var r2 = n2.u;
        n2.u = void 0;
        n2.f &= -3;
        if (!(8 & n2.f) && w(n2)) try {
          n2.c();
        } catch (n3) {
          if (!t2) {
            i2 = n3;
            t2 = true;
          }
        }
        n2 = r2;
      }
    }
    s = 0;
    v--;
    if (t2) throw i2;
  } else v--;
}
function n(i2) {
  if (v > 0) return i2();
  e = ++u;
  v++;
  try {
    return i2();
  } finally {
    t();
  }
}
var r;
var o = void 0;
function f(i2) {
  var t2 = o, n2 = r;
  o = void 0;
  r = void 0;
  try {
    return i2();
  } finally {
    o = t2;
    r = n2;
  }
}
var h = void 0;
var v = 0;
var s = 0;
var u = 0;
var e = 0;
var c = void 0;
var d = 0;
function a(i2) {
  if (void 0 !== o) {
    var t2 = i2.n;
    if (void 0 === t2 || t2.t !== o) {
      t2 = { i: 0, S: i2, p: o.s, n: void 0, t: o, e: void 0, x: void 0, r: t2 };
      if (void 0 !== o.s) o.s.n = t2;
      o.s = t2;
      i2.n = t2;
      if (32 & o.f) i2.S(t2);
      return t2;
    } else if (-1 === t2.i) {
      t2.i = 0;
      if (void 0 !== t2.n) {
        t2.n.p = t2.p;
        if (void 0 !== t2.p) t2.p.n = t2.n;
        t2.p = o.s;
        t2.n = void 0;
        o.s.n = t2;
        o.s = t2;
      }
      return t2;
    }
  }
}
function l(i2, t2) {
  this.v = i2;
  this.i = 0;
  this.n = void 0;
  this.t = void 0;
  this.l = 0;
  this.W = null == t2 ? void 0 : t2.watched;
  this.Z = null == t2 ? void 0 : t2.unwatched;
  this.name = null == t2 ? void 0 : t2.name;
}
l.prototype.brand = i;
l.prototype.h = function() {
  return true;
};
l.prototype.S = function(i2) {
  var t2 = this, n2 = this.t;
  if (n2 !== i2 && void 0 === i2.e) {
    i2.x = n2;
    this.t = i2;
    if (void 0 !== n2) n2.e = i2;
    else f(function() {
      var i3;
      null == (i3 = t2.W) || i3.call(t2);
    });
  }
};
l.prototype.U = function(i2) {
  var t2 = this;
  if (void 0 !== this.t) {
    var n2 = i2.e, r2 = i2.x;
    if (void 0 !== n2) {
      n2.x = r2;
      i2.e = void 0;
    }
    if (void 0 !== r2) {
      r2.e = n2;
      i2.x = void 0;
    }
    if (i2 === this.t) {
      this.t = r2;
      if (void 0 === r2) f(function() {
        var i3;
        null == (i3 = t2.Z) || i3.call(t2);
      });
    }
  }
};
l.prototype.subscribe = function(i2) {
  var t2 = this;
  return j(function() {
    var n2 = t2.value;
    f(function() {
      return i2(n2);
    });
  }, { name: "sub" });
};
l.prototype.valueOf = function() {
  return this.value;
};
l.prototype.toString = function() {
  return this.value + "";
};
l.prototype.toJSON = function() {
  return this.value;
};
l.prototype.peek = function() {
  var i2 = this;
  return f(function() {
    return i2.value;
  });
};
Object.defineProperty(l.prototype, "value", { get: function() {
  var i2 = a(this);
  if (void 0 !== i2) i2.i = this.i;
  return this.v;
}, set: function(i2) {
  if (i2 !== this.v) {
    if (s > 100) throw new Error("Cycle detected");
    !(function(i3) {
      if (0 !== v && 0 === s) {
        if (i3.l !== e) {
          i3.l = e;
          c = { S: i3, v: i3.v, i: i3.i, o: c };
        }
      }
    })(this);
    this.v = i2;
    this.i++;
    d++;
    v++;
    try {
      for (var n2 = this.t; void 0 !== n2; n2 = n2.x) n2.t.N();
    } finally {
      t();
    }
  }
} });
function y(i2, t2) {
  return new l(i2, t2);
}
function w(i2) {
  for (var t2 = i2.s; void 0 !== t2; t2 = t2.n) if (t2.S.i !== t2.i || !t2.S.h() || t2.S.i !== t2.i) return true;
  return false;
}
function _(i2) {
  for (var t2 = i2.s; void 0 !== t2; t2 = t2.n) {
    var n2 = t2.S.n;
    if (void 0 !== n2) t2.r = n2;
    t2.S.n = t2;
    t2.i = -1;
    if (void 0 === t2.n) {
      i2.s = t2;
      break;
    }
  }
}
function b(i2) {
  var t2 = i2.s, n2 = void 0;
  while (void 0 !== t2) {
    var r2 = t2.p;
    if (-1 === t2.i) {
      t2.S.U(t2);
      if (void 0 !== r2) r2.n = t2.n;
      if (void 0 !== t2.n) t2.n.p = r2;
    } else n2 = t2;
    t2.S.n = t2.r;
    if (void 0 !== t2.r) t2.r = void 0;
    t2 = r2;
  }
  i2.s = n2;
}
function p(i2, t2) {
  l.call(this, void 0, t2);
  this.x = i2;
  this.s = void 0;
  this.g = d - 1;
  this.f = 4;
}
p.prototype = new l();
p.prototype.h = function() {
  this.f &= -3;
  if (1 & this.f) return false;
  if (32 == (36 & this.f)) return true;
  this.f &= -5;
  if (this.g === d) return true;
  this.g = d;
  this.f |= 1;
  if (this.i > 0 && !w(this)) {
    this.f &= -2;
    return true;
  }
  var i2 = o;
  try {
    _(this);
    o = this;
    var t2 = this.x();
    if (16 & this.f || this.v !== t2 || 0 === this.i) {
      this.v = t2;
      this.f &= -17;
      this.i++;
    }
  } catch (i3) {
    this.v = i3;
    this.f |= 16;
    this.i++;
  }
  o = i2;
  b(this);
  this.f &= -2;
  return true;
};
p.prototype.S = function(i2) {
  if (void 0 === this.t) {
    this.f |= 36;
    for (var t2 = this.s; void 0 !== t2; t2 = t2.n) t2.S.S(t2);
  }
  l.prototype.S.call(this, i2);
};
p.prototype.U = function(i2) {
  if (void 0 !== this.t) {
    l.prototype.U.call(this, i2);
    if (void 0 === this.t) {
      this.f &= -33;
      for (var t2 = this.s; void 0 !== t2; t2 = t2.n) t2.S.U(t2);
    }
  }
};
p.prototype.N = function() {
  if (!(2 & this.f)) {
    this.f |= 6;
    for (var i2 = this.t; void 0 !== i2; i2 = i2.x) i2.t.N();
  }
};
Object.defineProperty(p.prototype, "value", { get: function() {
  if (1 & this.f) throw new Error("Cycle detected");
  var i2 = a(this);
  this.h();
  if (void 0 !== i2) i2.i = this.i;
  if (16 & this.f) throw this.v;
  return this.v;
} });
function g(i2, t2) {
  return new p(i2, t2);
}
function S(i2) {
  var n2 = i2.m;
  i2.m = void 0;
  if ("function" == typeof n2) {
    v++;
    var r2 = o;
    o = void 0;
    try {
      n2();
    } catch (t2) {
      i2.f &= -2;
      i2.f |= 8;
      m(i2);
      throw t2;
    } finally {
      o = r2;
      t();
    }
  }
}
function m(i2) {
  for (var t2 = i2.s; void 0 !== t2; t2 = t2.n) t2.S.U(t2);
  i2.x = void 0;
  i2.s = void 0;
  S(i2);
}
function x(i2) {
  if (o !== this) throw new Error("Out-of-order effect");
  b(this);
  o = i2;
  this.f &= -2;
  if (8 & this.f) m(this);
  t();
}
function E(i2, t2) {
  this.x = i2;
  this.m = void 0;
  this.s = void 0;
  this.u = void 0;
  this.f = 32;
  this.name = null == t2 ? void 0 : t2.name;
  if (r) r.push(this);
}
E.prototype.c = function() {
  var i2 = this.S();
  try {
    if (8 & this.f) return;
    if (void 0 === this.x) return;
    var t2 = this.x();
    if ("function" == typeof t2) this.m = t2;
  } finally {
    i2();
  }
};
E.prototype.S = function() {
  if (1 & this.f) throw new Error("Cycle detected");
  this.f |= 1;
  this.f &= -9;
  S(this);
  _(this);
  v++;
  var i2 = o;
  o = this;
  return x.bind(this, i2);
};
E.prototype.N = function() {
  if (!(2 & this.f)) {
    this.f |= 2;
    this.u = h;
    h = this;
  }
};
E.prototype.d = function() {
  this.f |= 8;
  if (!(1 & this.f)) m(this);
};
E.prototype.dispose = function() {
  this.d();
};
function j(i2, t2) {
  var n2 = new E(i2, t2);
  try {
    n2.c();
  } catch (i3) {
    n2.d();
    throw i3;
  }
  var r2 = n2.d.bind(n2);
  r2[Symbol.dispose] = r2;
  return r2;
}

// node_modules/@gravity-ui/graph/build/store/settings.js
var import_cloneDeep = __toESM(require_cloneDeep());

// node_modules/@gravity-ui/graph/build/services/camera/cameraScaleEnums.js
var ECameraScaleLevel;
(function(ECameraScaleLevel2) {
  ECameraScaleLevel2[ECameraScaleLevel2["Minimalistic"] = 100] = "Minimalistic";
  ECameraScaleLevel2[ECameraScaleLevel2["Schematic"] = 200] = "Schematic";
  ECameraScaleLevel2[ECameraScaleLevel2["Detailed"] = 300] = "Detailed";
})(ECameraScaleLevel || (ECameraScaleLevel = {}));

// node_modules/@gravity-ui/graph/build/services/camera/defaultGetCameraBlockScaleLevel.js
function defaultGetCameraBlockScaleLevel(graph, scale) {
  const scales = graph.graphConstants.block.SCALES;
  let scaleLevel = ECameraScaleLevel.Minimalistic;
  if (scale >= scales[1]) {
    scaleLevel = ECameraScaleLevel.Schematic;
  }
  if (scale >= scales[2]) {
    scaleLevel = ECameraScaleLevel.Detailed;
  }
  return scaleLevel;
}

// node_modules/@gravity-ui/graph/build/utils/functions/wheelIntent.js
var EWheelIntent;
(function(EWheelIntent2) {
  EWheelIntent2["Pan"] = "pan";
  EWheelIntent2["Zoom"] = "zoom";
})(EWheelIntent || (EWheelIntent = {}));
var WHEEL_INTENT_RULE = {
  I1_PINCH: "I1:pinch",
  I2_HORIZONTAL_OR_DIAGONAL: "I2:horizontal-or-diagonal",
  I3_INPUT_DEVICE_TRACKPAD: "I3:input-device-trackpad",
  I3_INTEGER_TRACKPAD: "I3:integer-trackpad",
  I3_INTEGER_TRACKPAD_SLOW: "I3:integer-trackpad-slow",
  I3_RAPID_SMALL: "I3:rapid-small",
  I4_MOUSE_WHEEL_STEP: "I4:mouse-wheel-step",
  I4_LARGE_STEP: "I4:large-step",
  I4_FRACTIONAL_MOUSE: "I4:fractional-mouse",
  I4_BURST_SMOOTHING: "I4-burst:smoothing",
  I4_INPUT_DEVICE_MOUSE: "I4:input-device-mouse",
  I5_LAST_INTENT: "I5:last-intent",
  I5_STICKY_STREAM: "I5:sticky-stream"
};
var WHEEL_INTENT_I3_RULES = /* @__PURE__ */ new Set([
  WHEEL_INTENT_RULE.I3_INPUT_DEVICE_TRACKPAD,
  WHEEL_INTENT_RULE.I3_INTEGER_TRACKPAD,
  WHEEL_INTENT_RULE.I3_INTEGER_TRACKPAD_SLOW,
  WHEEL_INTENT_RULE.I3_RAPID_SMALL
]);
var WHEEL_INTENT_I4_RULES = /* @__PURE__ */ new Set([
  WHEEL_INTENT_RULE.I4_MOUSE_WHEEL_STEP,
  WHEEL_INTENT_RULE.I4_LARGE_STEP,
  WHEEL_INTENT_RULE.I4_FRACTIONAL_MOUSE,
  WHEEL_INTENT_RULE.I4_BURST_SMOOTHING,
  WHEEL_INTENT_RULE.I4_INPUT_DEVICE_MOUSE
]);
function isI3WheelIntentRule(rule) {
  return WHEEL_INTENT_I3_RULES.has(rule);
}
function isI4WheelIntentRule(rule) {
  return WHEEL_INTENT_I4_RULES.has(rule);
}
var WHEEL_INTENT_DEBUG_GLOBAL_KEY = "__graphWheelIntentDebugLogger__";
function getWheelIntentDebugLogger() {
  return globalThis[WHEEL_INTENT_DEBUG_GLOBAL_KEY] ?? null;
}
function setWheelIntentDebugLogger(logger) {
  globalThis[WHEEL_INTENT_DEBUG_GLOBAL_KEY] = logger;
}
function deltaModeLabel(deltaMode) {
  return ["PIXEL", "LINE", "PAGE"][deltaMode] ?? String(deltaMode);
}
function formatDiagonalAxisRatio(normX, normY) {
  const maxAxis = Math.max(normX, normY);
  if (maxAxis < 1e-3) {
    return null;
  }
  return Math.min(normX, normY) / maxAxis;
}
function defaultDebugLogger(entry) {
  const { input, session } = entry;
  const summary = `[wheel-intent] ${entry.rule} \u2192 ${entry.result} | \u0394(${input.deltaX.toFixed(2)}, ${input.deltaY.toFixed(2)}) ${input.deltaModeLabel} +${Math.round(session.timeSinceLastMs)}ms`;
  console.log(summary);
  console.log(JSON.stringify(entry, null, 2));
}
function enableWheelIntentDebug(logger = defaultDebugLogger) {
  setWheelIntentDebugLogger(logger);
  if (logger !== null) {
    console.log("[wheel-intent] debug logging enabled");
  }
}
var MOUSE_WHEEL_BURST_MS = 120;
var RAPID_STREAM_MS = 38;
var DIAGONAL_AXIS_MIN_RATIO = 0.5;
var DIAGONAL_MIN_ABS = 2;
var MIN_HORIZONTAL_SCROLL_ABS = 2;
var SMALL_DELTA_THRESHOLD = 50;
var TRACKPAD_I3_MAX_PX = 20;
var MOUSE_WHEEL_DISCRETE_MIN_PX = 20;
var MOUSE_WHEEL_NOTCH_MIN_PX = 3;
var MOUSE_WHEEL_NOTCH_MAX_PX = 5;
var LINE_TO_PIXEL_APPROX = 16;
var PAGE_TO_PIXEL_APPROX = 600;
function normalizeWheelDelta(delta, deltaMode) {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE)
    return delta * LINE_TO_PIXEL_APPROX;
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE)
    return delta * PAGE_TO_PIXEL_APPROX;
  return delta;
}
var LEGACY_MOUSE_WHEEL_DELTA_MIN = 100;
var MAC_CHROME_TRACKPAD_WHEEL_DELTA_RATIO = 3;
var MAC_CHROME_TRACKPAD_RATIO_TOLERANCE = 0.35;
function isMacChromeLinearWheelDelta(event, wheelDeltaY) {
  const { deltaY, deltaMode } = event;
  if (deltaMode !== WheelEvent.DOM_DELTA_PIXEL || deltaY === 0 || !Number.isInteger(deltaY)) {
    return false;
  }
  const ratio = Math.abs(wheelDeltaY / deltaY);
  return ratio > MAC_CHROME_TRACKPAD_WHEEL_DELTA_RATIO - MAC_CHROME_TRACKPAD_RATIO_TOLERANCE && ratio < MAC_CHROME_TRACKPAD_WHEEL_DELTA_RATIO + MAC_CHROME_TRACKPAD_RATIO_TOLERANCE;
}
function hasLegacyMouseWheelDelta(event) {
  const legacy = event;
  const axisDelta = legacy.wheelDeltaY ?? legacy.wheelDelta;
  if (axisDelta === void 0) {
    return false;
  }
  if (Math.abs(axisDelta) < LEGACY_MOUSE_WHEEL_DELTA_MIN) {
    return false;
  }
  if (isMacChromeLinearWheelDelta(event, axisDelta)) {
    return false;
  }
  return true;
}
function createWheelContext(event) {
  const normX = normalizeWheelDelta(event.deltaX, event.deltaMode);
  const normY = normalizeWheelDelta(event.deltaY, event.deltaMode);
  const absX = Math.abs(normX);
  const absY = Math.abs(normY);
  const isPixelDeltaMode = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL;
  const hasFractionalDelta = isPixelDeltaMode && (!Number.isInteger(event.deltaY) || !Number.isInteger(event.deltaX));
  return {
    event,
    normX,
    normY,
    absX,
    absY,
    hasFractionalDelta,
    isPixelDeltaMode,
    isSmallDelta: absX < SMALL_DELTA_THRESHOLD && absY < SMALL_DELTA_THRESHOLD,
    isVerticalOnly: absX < MIN_HORIZONTAL_SCROLL_ABS,
    hasLegacyMouseWheelDelta: hasLegacyMouseWheelDelta(event)
  };
}
function isClassicMouseWheelStep(ctx) {
  const { event, absY, isPixelDeltaMode, hasFractionalDelta } = ctx;
  if (Math.abs(event.deltaX) >= 0.5) {
    return false;
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE || event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return true;
  }
  if (absY < MOUSE_WHEEL_DISCRETE_MIN_PX) {
    return false;
  }
  if (isPixelDeltaMode && !hasFractionalDelta) {
    return ctx.hasLegacyMouseWheelDelta;
  }
  return true;
}
function isIntegerPixelTrackpadScroll(ctx, isRapidStream) {
  if (!ctx.isPixelDeltaMode || ctx.hasFractionalDelta) {
    return false;
  }
  if (ctx.hasLegacyMouseWheelDelta) {
    return false;
  }
  const peak = Math.max(ctx.absX, ctx.absY);
  if (peak < MOUSE_WHEEL_DISCRETE_MIN_PX) {
    return true;
  }
  return isRapidStream;
}
function isTrackpadLikeRapidSmall(ctx, isRapidStream) {
  if (!isRapidStream || !ctx.isPixelDeltaMode) {
    return false;
  }
  return ctx.absY < TRACKPAD_I3_MAX_PX && ctx.absX < TRACKPAD_I3_MAX_PX;
}
function isSlowFractionalMouseWheelStep(ctx, isRapidStream, inMouseWheelBurst) {
  if (isRapidStream || inMouseWheelBurst || !ctx.hasFractionalDelta || !ctx.isVerticalOnly || !ctx.isSmallDelta || !ctx.isPixelDeltaMode) {
    return false;
  }
  return ctx.absY >= MOUSE_WHEEL_NOTCH_MIN_PX && ctx.absY <= MOUSE_WHEEL_NOTCH_MAX_PX;
}
function isDominantAxisLargeWheel(ctx) {
  const { event, absX, absY } = ctx;
  return absX >= SMALL_DELTA_THRESHOLD && Math.abs(event.deltaY) < 0.5 || absY >= SMALL_DELTA_THRESHOLD && Math.abs(event.deltaX) < 0.5;
}
function isPinchZoomWheelEvent(ctx) {
  const { event, isPixelDeltaMode } = ctx;
  return isPixelDeltaMode && (event.ctrlKey || event.metaKey);
}
function isPinchZoomGesture(event) {
  return isPinchZoomWheelEvent(createWheelContext(event));
}
function isPredominantHorizontalScroll(ctx) {
  return ctx.absX >= MIN_HORIZONTAL_SCROLL_ABS && ctx.absX > ctx.absY;
}
function isDiagonalScroll(ctx) {
  const { event, absX, absY } = ctx;
  if (event.shiftKey || absX <= DIAGONAL_MIN_ABS || absY <= DIAGONAL_MIN_ABS) {
    return false;
  }
  const minAxis = Math.min(absX, absY);
  const maxAxis = Math.max(absX, absY);
  return minAxis / maxAxis >= DIAGONAL_AXIS_MIN_RATIO;
}
function buildWheelSignals(ctx) {
  return {
    isPinchZoom: isPinchZoomWheelEvent(ctx),
    isDiagonalScroll: isDiagonalScroll(ctx),
    isPredominantHorizontalScroll: isPredominantHorizontalScroll(ctx),
    isClassicMouseWheelStep: isClassicMouseWheelStep(ctx),
    isDominantAxisLargeWheel: isDominantAxisLargeWheel(ctx),
    isVerticalOnly: ctx.isVerticalOnly,
    hasFractionalDelta: ctx.hasFractionalDelta,
    isSmallDelta: ctx.isSmallDelta,
    isPixelDeltaMode: ctx.isPixelDeltaMode,
    hasLegacyMouseWheelDelta: ctx.hasLegacyMouseWheelDelta
  };
}
function intentFromMouseWheelBehavior(mouseWheelBehavior) {
  return mouseWheelBehavior === "scroll" ? EWheelIntent.Pan : EWheelIntent.Zoom;
}
function applyRapidStreamStickyIntent(intent, rule, signals, isRapidStream, lastIntentBefore, lastRuleBefore) {
  if (!isRapidStream || signals.isPinchZoom || signals.isDiagonalScroll || signals.isPredominantHorizontalScroll || intent === lastIntentBefore || lastRuleBefore === WHEEL_INTENT_RULE.I5_LAST_INTENT) {
    return { intent, rule };
  }
  return { intent: lastIntentBefore, rule: WHEEL_INTENT_RULE.I5_STICKY_STREAM };
}
function emitDebugEntry(ctx, mouseWheelBehavior, inputDevice, timeSinceLastWheel, isRapidStream, isInMouseWheelBurst, mouseWheelBurstRemainingMs, lastIntentBefore, signals, rule, result) {
  const debugLogger = getWheelIntentDebugLogger();
  if (debugLogger === null) {
    return;
  }
  const { event, normX, normY } = ctx;
  debugLogger({
    mouseWheelBehavior,
    inputDevice,
    input: {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      deltaModeLabel: deltaModeLabel(event.deltaMode),
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey
    },
    normalized: {
      deltaX: normX,
      deltaY: normY,
      diagonalAxisRatio: formatDiagonalAxisRatio(Math.abs(normX), Math.abs(normY))
    },
    session: {
      timeSinceLastMs: timeSinceLastWheel === Number.POSITIVE_INFINITY ? -1 : timeSinceLastWheel,
      isRapidStream,
      isInMouseWheelBurst,
      mouseWheelBurstRemainingMs,
      lastIntentBefore
    },
    signals,
    rule,
    result
  });
}
function createWheelIntentResolver() {
  let lastIntent = EWheelIntent.Zoom;
  let lastRule = WHEEL_INTENT_RULE.I5_LAST_INTENT;
  let lastTimestamp = null;
  let mouseWheelBurstUntil = null;
  const markMouseWheelBurst = (now) => {
    mouseWheelBurstUntil = now + MOUSE_WHEEL_BURST_MS;
  };
  const isInMouseWheelBurst = (now) => mouseWheelBurstUntil !== null && now <= mouseWheelBurstUntil;
  const resolveExplicitMouseIntent = (ctx, signals, mouseWheelBehavior, isRapidStream, inMouseWheelBurst, now) => {
    if (signals.isDominantAxisLargeWheel || signals.isClassicMouseWheelStep || signals.hasLegacyMouseWheelDelta) {
      markMouseWheelBurst(now);
      return {
        intent: intentFromMouseWheelBehavior(mouseWheelBehavior),
        rule: signals.isClassicMouseWheelStep ? WHEEL_INTENT_RULE.I4_MOUSE_WHEEL_STEP : WHEEL_INTENT_RULE.I4_LARGE_STEP
      };
    }
    if (isSlowFractionalMouseWheelStep(ctx, isRapidStream, inMouseWheelBurst)) {
      markMouseWheelBurst(now);
      return {
        intent: intentFromMouseWheelBehavior(mouseWheelBehavior),
        rule: WHEEL_INTENT_RULE.I4_FRACTIONAL_MOUSE
      };
    }
    if (inMouseWheelBurst && signals.isVerticalOnly && isTrackpadLikeRapidSmall(ctx, isRapidStream)) {
      markMouseWheelBurst(now);
      return {
        intent: intentFromMouseWheelBehavior(mouseWheelBehavior),
        rule: WHEEL_INTENT_RULE.I4_BURST_SMOOTHING
      };
    }
    markMouseWheelBurst(now);
    return {
      intent: intentFromMouseWheelBehavior(mouseWheelBehavior),
      rule: WHEEL_INTENT_RULE.I4_INPUT_DEVICE_MOUSE
    };
  };
  return (event, options) => {
    const mouseWheelBehavior = options.mouseWheelBehavior;
    const wheelInputDevice = options.wheelInputDevice ?? "auto";
    const now = performance.now();
    const timeSince = lastTimestamp !== null ? now - lastTimestamp : Number.POSITIVE_INFINITY;
    lastTimestamp = now;
    const isRapidStream = timeSince < RAPID_STREAM_MS;
    const inMouseWheelBurst = isInMouseWheelBurst(now);
    const mouseWheelBurstRemainingMs = mouseWheelBurstUntil !== null ? Math.max(0, mouseWheelBurstUntil - now) : null;
    const ctx = createWheelContext(event);
    const signals = buildWheelSignals(ctx);
    const lastIntentBefore = lastIntent;
    const lastRuleBefore = lastRule;
    let intent;
    let rule;
    if (signals.isPinchZoom) {
      intent = EWheelIntent.Zoom;
      rule = WHEEL_INTENT_RULE.I1_PINCH;
    } else if (signals.isDiagonalScroll || signals.isPredominantHorizontalScroll) {
      intent = EWheelIntent.Pan;
      rule = WHEEL_INTENT_RULE.I2_HORIZONTAL_OR_DIAGONAL;
    } else if (wheelInputDevice === "trackpad") {
      intent = EWheelIntent.Pan;
      rule = WHEEL_INTENT_RULE.I3_INPUT_DEVICE_TRACKPAD;
    } else if (wheelInputDevice === "mouse") {
      ({ intent, rule } = resolveExplicitMouseIntent(ctx, signals, mouseWheelBehavior, isRapidStream, inMouseWheelBurst, now));
    } else if (isIntegerPixelTrackpadScroll(ctx, isRapidStream)) {
      intent = EWheelIntent.Pan;
      rule = isRapidStream ? WHEEL_INTENT_RULE.I3_INTEGER_TRACKPAD : WHEEL_INTENT_RULE.I3_INTEGER_TRACKPAD_SLOW;
    } else if (signals.isDominantAxisLargeWheel || signals.isClassicMouseWheelStep || signals.hasLegacyMouseWheelDelta) {
      intent = intentFromMouseWheelBehavior(mouseWheelBehavior);
      rule = signals.isClassicMouseWheelStep ? WHEEL_INTENT_RULE.I4_MOUSE_WHEEL_STEP : WHEEL_INTENT_RULE.I4_LARGE_STEP;
      markMouseWheelBurst(now);
    } else if (isTrackpadLikeRapidSmall(ctx, isRapidStream)) {
      if (inMouseWheelBurst && signals.isVerticalOnly) {
        intent = intentFromMouseWheelBehavior(mouseWheelBehavior);
        rule = WHEEL_INTENT_RULE.I4_BURST_SMOOTHING;
        markMouseWheelBurst(now);
      } else {
        intent = EWheelIntent.Pan;
        rule = WHEEL_INTENT_RULE.I3_RAPID_SMALL;
      }
    } else if (isSlowFractionalMouseWheelStep(ctx, isRapidStream, inMouseWheelBurst)) {
      intent = intentFromMouseWheelBehavior(mouseWheelBehavior);
      rule = WHEEL_INTENT_RULE.I4_FRACTIONAL_MOUSE;
      markMouseWheelBurst(now);
    } else {
      intent = lastIntent;
      rule = WHEEL_INTENT_RULE.I5_LAST_INTENT;
    }
    ({ intent, rule } = applyRapidStreamStickyIntent(intent, rule, signals, isRapidStream, lastIntentBefore, lastRuleBefore));
    lastIntent = intent;
    lastRule = rule;
    if (getWheelIntentDebugLogger() !== null) {
      emitDebugEntry(ctx, mouseWheelBehavior, wheelInputDevice, timeSince, isRapidStream, inMouseWheelBurst, mouseWheelBurstRemainingMs, lastIntentBefore, signals, rule, intent);
    }
    return intent;
  };
}

// node_modules/@gravity-ui/graph/build/store/settings.js
var ECanChangeBlockGeometry;
(function(ECanChangeBlockGeometry2) {
  ECanChangeBlockGeometry2["ALL"] = "all";
  ECanChangeBlockGeometry2["ONLY_SELECTED"] = "onlySelected";
  ECanChangeBlockGeometry2["NONE"] = "none";
})(ECanChangeBlockGeometry || (ECanChangeBlockGeometry = {}));
var ECanDrag;
(function(ECanDrag2) {
  ECanDrag2["ALL"] = "all";
  ECanDrag2["ONLY_SELECTED"] = "onlySelected";
  ECanDrag2["NONE"] = "none";
})(ECanDrag || (ECanDrag = {}));
var DefaultSettings = {
  canDragCamera: true,
  canZoomCamera: true,
  canDuplicateBlocks: false,
  canDrag: ECanDrag.NONE,
  dragThreshold: 5,
  canCreateNewConnections: false,
  showConnectionArrows: true,
  scaleFontSize: 1,
  useBezierConnections: true,
  bezierConnectionDirection: "horizontal",
  useBlocksAnchors: true,
  connectivityComponentOnClickRaise: true,
  showConnectionLabels: false,
  blockComponents: {},
  resolveWheelIntent: createWheelIntentResolver(),
  getCameraBlockScaleLevel: defaultGetCameraBlockScaleLevel
};
var GraphEditorSettings = class {
  constructor(rootStore) {
    this.rootStore = rootStore;
    this.$settings = y(DefaultSettings);
    this.$blockComponents = g(() => {
      return this.$settings.value.blockComponents;
    });
    this.$background = g(() => {
      return this.$settings.value.background;
    });
    this.$connection = g(() => {
      return this.$settings.value.connection;
    });
    this.$connectionsSettings = g(() => {
      return {
        useBezierConnections: this.$settings.value.useBezierConnections,
        showConnectionLabels: this.$settings.value.showConnectionLabels,
        canCreateNewConnections: this.$settings.value.canCreateNewConnections,
        showConnectionArrows: this.$settings.value.showConnectionArrows,
        bezierConnectionDirection: this.$settings.value.bezierConnectionDirection
      };
    });
    this.$canDrag = g(() => {
      const settings = this.$settings.value;
      if (settings.canChangeBlockGeometry !== void 0) {
        return settings.canChangeBlockGeometry;
      }
      if (settings.canDrag !== void 0) {
        return settings.canDrag;
      }
      return ECanDrag.ALL;
    });
    this.$dragThreshold = g(() => {
      return this.$settings.value.dragThreshold ?? 3;
    });
  }
  setupSettings(config) {
    const merged = Object.assign({}, this.$settings.value, config);
    this.$settings.value = {
      ...merged,
      getCameraBlockScaleLevel: merged.getCameraBlockScaleLevel ?? defaultGetCameraBlockScaleLevel
    };
  }
  setConfigFlag(flagPath, value) {
    if (typeof this.$settings.value[flagPath] === typeof value) {
      this.$settings.value[flagPath] = value;
    }
  }
  getConfigFlag(flagPath) {
    return this.$settings.value[flagPath];
  }
  /**
   * Resolves wheel intent using {@link TGraphSettingsConfig.resolveWheelIntent} (typed; prefer over getConfigFlag).
   */
  wheelIntentFromEvent(event, options) {
    return this.$settings.value.resolveWheelIntent(event, options);
  }
  toJSON() {
    return (0, import_cloneDeep.default)(this.$settings.toJSON());
  }
  get asConfig() {
    return this.toJSON();
  }
  reset() {
    this.setupSettings(DefaultSettings);
  }
};

// node_modules/@gravity-ui/graph/build/utils/types/events.js
var EVENTS = {
  DRAG_START: "drag-start",
  DRAG_UPDATE: "drag-update",
  DRAG_END: "drag-end",
  RESIZE_START: "resize-start",
  RESIZE_UPDATE: "resize-update",
  RESIZE_END: "resize-end",
  RESIZER_MOUSEDOWN: "resizer-mousedown",
  SELECTION_START: "start-area-selection",
  SELECTION_UPDATE: "update-area-selection",
  SELECTION_END: "end-area-selection",
  NEW_CONNECTION_START: "start-new-connection",
  NEW_CONNECTION_UPDATE: "update-new-connection",
  NEW_CONNECTION_END: "end-new-connection",
  NEW_BLOCK_START: "start-new-block",
  NEW_BLOCK_UPDATE: "update-new-block",
  NEW_BLOCK_END: "end-new-block"
};

// node_modules/@gravity-ui/graph/build/utils/types/shapes.js
var import_isObject = __toESM(require_isObject());
var Point = class {
  constructor(x2, y2, origPoint) {
    this.x = x2;
    this.y = y2;
    this.origPoint = origPoint || {
      x: x2,
      y: y2
    };
  }
  toArray() {
    return [this.x, this.y];
  }
  toObject() {
    return { x: this.x, y: this.y };
  }
};
function isTRect(rect) {
  return (0, import_isObject.default)(rect) && "x" in rect && typeof rect.x === "number" && "y" in rect && typeof rect.y === "number" && "width" in rect && typeof rect.width === "number" && "height" in rect && typeof rect.height === "number";
}
var Rect = class {
  constructor(x2, y2, width, height) {
    this.x = x2;
    this.y = y2;
    this.width = width;
    this.height = height;
  }
  toArray() {
    return [this.x, this.y, this.width, this.height];
  }
  toObject() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }
};

// node_modules/@gravity-ui/graph/build/utils/functions/color.js
var parseColorCache = /* @__PURE__ */ new Map();
var applyAlphaCache = /* @__PURE__ */ new Map();
var colorNormCtx = null;
function getColorNormContext() {
  if (typeof document === "undefined") {
    return null;
  }
  if (!colorNormCtx) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    colorNormCtx = canvas.getContext("2d");
  }
  return colorNormCtx;
}
function parseColor(color) {
  const cached = parseColorCache.get(color);
  if (cached) {
    return cached;
  }
  const ctx = getColorNormContext();
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = "#000000";
  ctx.fillStyle = color;
  const normalized = ctx.fillStyle;
  let result = null;
  const hex = normalized.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) {
    result = {
      r: parseInt(hex[1], 16),
      g: parseInt(hex[2], 16),
      b: parseInt(hex[3], 16),
      a: 1
    };
  }
  if (!result) {
    const rgba = normalized.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (rgba) {
      result = {
        r: parseInt(rgba[1], 10),
        g: parseInt(rgba[2], 10),
        b: parseInt(rgba[3], 10),
        a: rgba[4] !== void 0 ? parseFloat(rgba[4]) : 1
      };
    }
  }
  if (!result) {
    return null;
  }
  parseColorCache.set(color, result);
  return result;
}
function applyAlpha(color, alpha) {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  const cacheKey = `${color}|${clampedAlpha}`;
  const cachedResult = applyAlphaCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }
  const parsed = parseColor(color);
  if (!parsed) {
    return color;
  }
  const finalAlpha = parsed.a * clampedAlpha;
  const result = `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${finalAlpha})`;
  applyAlphaCache.set(cacheKey, result);
  return result;
}
function clearColorCache() {
  parseColorCache.clear();
  applyAlphaCache.clear();
  colorNormCtx = null;
}

// node_modules/@gravity-ui/graph/build/lib/Scheduler.js
var rAF = typeof window !== "undefined" ? window.requestAnimationFrame : (fn) => global.setTimeout(fn, 16);
var cAF = typeof window !== "undefined" ? window.cancelAnimationFrame : global.clearTimeout;
var getNow = typeof window !== "undefined" ? window.performance.now.bind(window.performance) : global.Date.now.bind(global.Date);
var ESchedulerPriority;
(function(ESchedulerPriority2) {
  ESchedulerPriority2[ESchedulerPriority2["HIGHEST"] = 0] = "HIGHEST";
  ESchedulerPriority2[ESchedulerPriority2["HIGH"] = 1] = "HIGH";
  ESchedulerPriority2[ESchedulerPriority2["MEDIUM"] = 2] = "MEDIUM";
  ESchedulerPriority2[ESchedulerPriority2["LOW"] = 3] = "LOW";
  ESchedulerPriority2[ESchedulerPriority2["LOWEST"] = 4] = "LOWEST";
})(ESchedulerPriority || (ESchedulerPriority = {}));
var GlobalScheduler = class {
  constructor() {
    this.toRemove = [];
    this.visibilityChangeHandler = null;
    this.tick = this.tick.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.schedulers = [[], [], [], [], []];
    this.setupVisibilityListener();
  }
  /**
   * Setup listener for page visibility changes.
   * When tab becomes visible after being hidden, force immediate update.
   * This fixes the issue where tabs opened in background don't render HTML until interaction.
   */
  setupVisibilityListener() {
    if (typeof document === "undefined") {
      return;
    }
    this.visibilityChangeHandler = this.handleVisibilityChange;
    document.addEventListener("visibilitychange", this.visibilityChangeHandler);
  }
  /**
   * Handle page visibility changes.
   * When page becomes visible, perform immediate update if scheduler is running.
   */
  handleVisibilityChange() {
    if (!document.hidden && this._cAFID) {
      this.performUpdate();
    }
  }
  /**
   * Cleanup visibility listener
   */
  cleanupVisibilityListener() {
    if (this.visibilityChangeHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }
  }
  getSchedulers() {
    return this.schedulers;
  }
  addScheduler(scheduler2, index = ESchedulerPriority.MEDIUM) {
    this.schedulers[index].push(scheduler2);
    return () => this.removeScheduler(scheduler2, index);
  }
  removeScheduler(scheduler2, index = ESchedulerPriority.MEDIUM) {
    this.toRemove.push([scheduler2, index]);
  }
  start() {
    if (!this._cAFID) {
      this._cAFID = rAF(this.tick);
    }
  }
  stop() {
    cAF(this._cAFID);
    this._cAFID = void 0;
  }
  /**
   * Cleanup method to be called when GlobalScheduler is no longer needed.
   * Stops the scheduler and removes event listeners.
   */
  destroy() {
    this.stop();
    this.cleanupVisibilityListener();
  }
  tick() {
    this.performUpdate();
    this._cAFID = rAF(this.tick);
  }
  performUpdate() {
    const startTime = getNow();
    let schedulers = [];
    for (let i2 = 0; i2 < this.schedulers.length; i2 += 1) {
      schedulers = this.schedulers[i2];
      for (let j2 = 0; j2 < schedulers.length; j2 += 1) {
        schedulers[j2].performUpdate(getNow() - startTime);
      }
    }
    for (const [scheduler2, index] of this.toRemove) {
      const schedulerIndex = this.schedulers[index].indexOf(scheduler2);
      if (schedulerIndex !== -1) {
        this.schedulers[index].splice(schedulerIndex, 1);
      }
    }
    this.toRemove.length = 0;
  }
};
var globalScheduler = new GlobalScheduler();
var scheduler = globalScheduler;
var Scheduler = class {
  constructor() {
    this.performUpdate = this.performUpdate.bind(this);
    this.sheduled = false;
    globalScheduler.addScheduler(this);
  }
  setRoot(root) {
    this.root = root;
  }
  start() {
    globalScheduler.addScheduler(this);
  }
  stop() {
    globalScheduler.removeScheduler(this);
  }
  update() {
    this.root?.traverseDown(this.iterator);
  }
  iterator(node) {
    return node.data.iterate();
  }
  scheduleUpdate() {
    this.sheduled = true;
  }
  performUpdate() {
    if (this.sheduled) {
      this.sheduled = false;
      this.update();
    }
  }
};

// node_modules/@gravity-ui/graph/build/lib/utils.js
function assign(target, source) {
  const props = Object.keys(source);
  let prop;
  for (let i2 = 0; i2 < props.length; i2 += 1) {
    prop = props[i2];
    target[prop] = source[prop];
  }
  return target;
}
function cache(fn) {
  let result;
  let touched = true;
  return {
    get: () => {
      if (touched) {
        result = fn();
        touched = false;
      }
      return result;
    },
    reset() {
      touched = true;
    },
    clear() {
      touched = true;
      result = void 0;
    }
  };
}

// node_modules/@gravity-ui/graph/build/lib/Tree.js
var Tree = class {
  constructor(data, parent) {
    this.children = /* @__PURE__ */ new Set();
    this.childrenArray = [];
    this.childrenDirty = false;
    this.zIndexGroups = /* @__PURE__ */ new Map();
    this.zIndexChildrenCache = cache(() => {
      return Array.from(this.zIndexGroups.keys()).sort((a2, b2) => a2 - b2).map((index) => Array.from(this.zIndexGroups.get(index) || [])).flat(2);
    });
    this.renderOrder = 0;
    this.zIndex = 1;
    this.data = data;
    this.parent = parent;
  }
  append(node) {
    node.parent = this;
    this.children.add(node);
    this.childrenDirty = true;
    this.addInZIndex(node);
  }
  addInZIndex(node) {
    if (!this.zIndexGroups.has(node.zIndex)) {
      this.zIndexGroups.set(node.zIndex, /* @__PURE__ */ new Set());
    }
    this.zIndexGroups.get(node.zIndex).add(node);
    this.zIndexChildrenCache.reset();
  }
  removeZIndex(node) {
    const zIndex = node.zIndex;
    const set2 = this.zIndexGroups.get(node.zIndex);
    if (!set2)
      return;
    set2.delete(node);
    if (!set2.size) {
      this.zIndexGroups.delete(zIndex);
      this.zIndexChildrenCache.reset();
    }
  }
  remove(node = this) {
    if (node.parent === null)
      return;
    this.children.delete(node);
    this.childrenDirty = true;
    this.removeZIndex(node);
  }
  setChildren(nodes) {
    this.children = new Set(nodes);
    this.childrenDirty = true;
    nodes.forEach((item) => {
      this.addInZIndex(item);
    });
  }
  updateZIndex(index) {
    if (this.zIndex === index) {
      return;
    }
    this.zIndex = index;
    this.parent?.updateChildZIndex(this);
  }
  updateChildZIndex(child) {
    if (!this.children.has(child)) {
      return;
    }
    this.removeZIndex(child);
    this.addInZIndex(child);
  }
  clearChildren() {
    this.children.clear();
    this.childrenDirty = true;
    this.zIndexGroups.clear();
    this.zIndexChildrenCache.clear();
  }
  traverseDown(iterator) {
    this._traverse(iterator, "_walkDown");
  }
  _traverse(iterator, strategyName) {
    this[strategyName](iterator);
  }
  getChildrenArray() {
    if (this.childrenDirty) {
      this.childrenArray = Array.from(this.children);
      this.childrenDirty = false;
    }
    return this.childrenArray;
  }
  _walkDown(iterator, order) {
    this.renderOrder = order;
    if (iterator(this)) {
      if (!this.children.size) {
        return;
      }
      const children = this.zIndexChildrenCache.get();
      for (let i2 = 0; i2 < children.length; i2++) {
        children[i2]._walkDown(iterator, i2);
      }
    }
  }
};

// node_modules/@gravity-ui/graph/build/lib/CoreComponent.js
function createDefaultPrivateContext() {
  return {
    scheduler: new Scheduler(),
    globalIterateId: 0
  };
}
var CoreComponent = class {
  get zIndex() {
    return this.__comp.treeNode.zIndex;
  }
  set zIndex(index) {
    this.__comp.treeNode.updateZIndex(index);
    this.performRender();
  }
  get renderOrder() {
    return this.__comp.treeNode.renderOrder;
  }
  constructor(props, parent) {
    this.$ = {};
    this.context = {};
    this.props = {};
    this.performRender = () => {
      this.__comp.context.scheduler.scheduleUpdate();
    };
    this.context = parent?.context || {};
    this.__comp = {
      parent,
      context: parent ? parent.__comp.context : createDefaultPrivateContext(),
      treeNode: new Tree(this),
      children: {},
      childrenKeys: [],
      prevChildrenArr: [],
      updated: false,
      iterateId: 0
    };
    this.props = props;
  }
  isIterated() {
    return this.__comp.iterateId === this.__comp.context.globalIterateId;
  }
  getParent() {
    return this.__comp.parent;
  }
  setContext(context) {
    this.context = Object.assign({}, this.context, context);
    const children = this.__comp.children;
    const childrenKeys = this.__comp.childrenKeys;
    for (let i2 = 0; i2 < childrenKeys.length; i2 += 1) {
      const child = children[childrenKeys[i2]];
      if (child) {
        child.setContext(context);
      }
    }
    this.performRender();
  }
  unmount() {
  }
  render() {
  }
  updateChildren() {
  }
  setProps(_2) {
  }
  __unmount() {
    this.__unmountChildren();
    this.unmount();
    this.performRender();
  }
  iterate() {
    if (!this.__comp.parent) {
      this.__comp.context.globalIterateId = Math.random();
    }
    this.__comp.iterateId = this.__comp.context.globalIterateId;
    return true;
  }
  __updateChildren() {
    const nextChildrenArr = this.updateChildren();
    if (typeof nextChildrenArr === "undefined")
      return;
    const __comp = this.__comp;
    const children = __comp.children;
    const childrenKeys = __comp.childrenKeys;
    const nextChildrenKeys = __comp.childrenKeys = [];
    if (nextChildrenArr === __comp.prevChildrenArr)
      return;
    let key;
    let ref;
    let child;
    let currentChild;
    const treeNode = __comp.treeNode;
    __comp.prevChildrenArr = nextChildrenArr;
    treeNode.clearChildren();
    if (nextChildrenArr.length === 0) {
      if (childrenKeys.length > 0) {
        for (let i2 = 0; i2 < childrenKeys.length; i2 += 1) {
          key = childrenKeys[i2];
          child = children[key];
          child.__unmount();
          children[key] = void 0;
        }
      }
      return;
    }
    if (childrenKeys.length === 0) {
      if (nextChildrenArr.length > 0) {
        for (let i2 = 0; i2 < nextChildrenArr.length; i2 += 1) {
          child = nextChildrenArr[i2];
          key = child.options.hasOwnProperty("key") ? child.options.key : `${child.klass.name}|${i2}|defaultKey`;
          ref = child.options.ref;
          children[key] = new child.klass(child.props, this);
          if (typeof ref === "function") {
            ref(children[key]);
          } else if (typeof ref === "string") {
            this.$[ref] = children[key];
          }
          nextChildrenKeys.push(key);
          treeNode.append(children[key].__comp.treeNode);
        }
      }
      return;
    }
    const childForMount = [];
    const keyForMount = [];
    for (let i2 = 0; i2 < nextChildrenArr.length; i2 += 1) {
      child = nextChildrenArr[i2];
      key = child.options.hasOwnProperty("key") ? child.options.key : `${child.klass.name}|${i2}|defaultKey`;
      currentChild = children[key];
      nextChildrenKeys.push(key);
      if (currentChild !== void 0 && currentChild instanceof child.klass && currentChild.constructor === child.klass) {
        currentChild.setProps(child.props);
        currentChild.__comp.updated = true;
      } else {
        childForMount.push(child);
        keyForMount.push(key);
      }
    }
    for (let i2 = 0; i2 < childrenKeys.length; i2 += 1) {
      key = childrenKeys[i2];
      child = children[key];
      if (child === void 0)
        continue;
      if (child.__comp.updated === true) {
        child.__comp.updated = false;
      } else {
        child.__unmount();
        children[key] = void 0;
      }
    }
    for (let i2 = 0; i2 < childForMount.length; i2 += 1) {
      child = childForMount[i2];
      key = keyForMount[i2];
      ref = child.options.ref;
      child = children[key] = new child.klass(child.props, this);
      if (typeof ref === "function") {
        ref(children[key]);
      } else if (typeof ref === "string") {
        this.$[ref] = children[key];
      }
    }
    for (let i2 = 0; i2 < nextChildrenKeys.length; i2 += 1) {
      if ((child = children[nextChildrenKeys[i2]]) !== void 0) {
        treeNode.append(child.__comp.treeNode);
      }
    }
  }
  __unmountChildren() {
    this.__comp.treeNode.clearChildren();
    const children = this.__comp.children;
    const childrenKeys = this.__comp.childrenKeys;
    for (let i2 = 0; i2 < childrenKeys.length; i2 += 1) {
      children[childrenKeys[i2]].__unmount();
    }
  }
  static create(props = {}, options = {}) {
    return { props, options, klass: this };
  }
  static mount(Component2, props) {
    const root = new Component2(props);
    const scheduler2 = root.__comp.context.scheduler;
    scheduler2.setRoot(root.__comp.treeNode);
    scheduler2.scheduleUpdate();
    return root;
  }
  static unmount(instance) {
    instance.__unmount();
  }
};

// node_modules/@gravity-ui/graph/build/lib/Component.js
var Component = class extends CoreComponent {
  constructor(props, parent) {
    super(props, parent);
    this.firstIterate = true;
    this.firstRender = true;
    this.firstUpdateChildren = true;
    this.shouldRender = true;
    this.shouldUpdateChildren = true;
    this.shouldRenderChildren = true;
    this.__data = {
      nextProps: void 0,
      nextState: void 0
    };
    this.state = {};
  }
  willMount() {
  }
  setContext(context) {
    this.shouldRenderChildren = true;
    this.shouldUpdateChildren = true;
    super.setContext({ ...this.context, ...context });
    this.contextChanged(this.context);
  }
  setProps(props) {
    if (props === void 0)
      return;
    const data = this.__data;
    if (data.nextProps === void 0) {
      data.nextProps = assign(assign({}, this.props), props);
      this.performRender();
    } else {
      assign(data.nextProps, props);
    }
  }
  getState() {
    if (this.__data.nextState) {
      return Object.assign({}, this.state, this.__data.nextState);
    }
    return this.state;
  }
  setState(state) {
    const data = this.__data;
    if (data.nextState === void 0) {
      data.nextState = assign(assign({}, this.state), state);
      this.performRender();
    } else {
      assign(data.nextState, state);
    }
  }
  propsChanged(_nextProps) {
  }
  stateChanged(_nextState) {
  }
  contextChanged(_nextContext) {
  }
  checkData() {
    const data = this.__data;
    let updated = false;
    if (data.nextProps !== void 0) {
      this.propsChanged(data.nextProps);
      assign(this.props, data.nextProps);
      data.nextProps = void 0;
      updated = true;
    }
    if (data.nextState !== void 0) {
      this.stateChanged(data.nextState);
      assign(this.state, data.nextState);
      data.nextState = void 0;
      updated = true;
    }
    return updated;
  }
  willRender() {
  }
  didRender() {
  }
  renderLifeCycle() {
    this.willRender();
    this.render();
    this.didRender();
    this.firstRender = false;
  }
  willUpdateChildren() {
  }
  didUpdateChildren() {
  }
  childrenLifeCycle() {
    this.willUpdateChildren();
    this.__updateChildren();
    this.didUpdateChildren();
    this.firstUpdateChildren = false;
  }
  willIterate() {
    if (this.firstIterate) {
      this.willMount();
    }
  }
  didIterate() {
  }
  willNotRender() {
  }
  iterate() {
    super.iterate();
    this.checkData();
    this.willIterate();
    if (this.shouldRender) {
      this.renderLifeCycle();
    } else {
      this.willNotRender();
    }
    if (this.shouldUpdateChildren) {
      this.shouldUpdateChildren = false;
      this.childrenLifeCycle();
    }
    this.didIterate();
    this.firstIterate = false;
    return this.shouldRenderChildren;
  }
};

// node_modules/@gravity-ui/graph/build/utils/utils/schedule.js
var getNow2 = typeof globalThis !== "undefined" ? globalThis.performance.now.bind(globalThis.performance) : global.Date.now.bind(global.Date);
var schedule = (fn, options) => {
  const { priority, frameInterval, once } = options;
  let frameCounter = 0;
  let isRemoved = false;
  const debounceScheduler = {
    performUpdate: () => {
      frameCounter++;
      if (frameCounter >= frameInterval) {
        if (once && !isRemoved) {
          scheduler.removeScheduler(debounceScheduler, priority);
          isRemoved = true;
        }
        fn();
        frameCounter = 0;
        if (once) {
          isRemoved = true;
          scheduler.removeScheduler(debounceScheduler, priority);
        }
      }
    }
  };
  return scheduler.addScheduler(debounceScheduler, priority);
};
var debounce = (fn, { priority = ESchedulerPriority.MEDIUM, frameInterval = 1, frameTimeout = 0 } = {}) => {
  let frameCounter = 0;
  let isScheduled = false;
  let cancelled = false;
  let removeScheduler = null;
  let latestArgs;
  let startTime = 0;
  const debouncedScheduler = {
    performUpdate: () => {
      if (cancelled) {
        cancelled = false;
        return;
      }
      frameCounter++;
      const currentTime = getNow2();
      const elapsedTime = currentTime - startTime;
      if (frameCounter >= frameInterval && elapsedTime >= frameTimeout) {
        const currentRemoveScheduler = removeScheduler;
        isScheduled = false;
        frameCounter = 0;
        startTime = 0;
        removeScheduler = null;
        const args = latestArgs;
        latestArgs = void 0;
        fn(...args ?? []);
        if (currentRemoveScheduler) {
          currentRemoveScheduler();
        }
      }
    }
  };
  const cancel = () => {
    if (isScheduled && removeScheduler) {
      cancelled = true;
      removeScheduler();
    }
    isScheduled = false;
    frameCounter = 0;
    startTime = 0;
    removeScheduler = null;
    latestArgs = void 0;
  };
  const flush = () => {
    if (isScheduled) {
      const currentRemoveScheduler = removeScheduler;
      isScheduled = false;
      frameCounter = 0;
      startTime = 0;
      removeScheduler = null;
      const args = latestArgs;
      latestArgs = void 0;
      if (currentRemoveScheduler) {
        currentRemoveScheduler();
      }
      fn(...args ?? []);
    }
  };
  const debouncedFn = ((...args) => {
    latestArgs = args;
    frameCounter = 0;
    startTime = getNow2();
    cancelled = false;
    if (!isScheduled) {
      isScheduled = true;
      removeScheduler = scheduler.addScheduler(debouncedScheduler, priority);
    }
  });
  debouncedFn.cancel = cancel;
  debouncedFn.flush = flush;
  debouncedFn.isScheduled = () => {
    return isScheduled;
  };
  return debouncedFn;
};
var throttle = (fn, { priority = ESchedulerPriority.MEDIUM, frameInterval = 1, frameTimeout = 0 } = {}) => {
  let frameCounter = 0;
  let canExecute = true;
  let isScheduled = false;
  let removeScheduler = null;
  let startTime = 0;
  const throttledScheduler = {
    performUpdate: () => {
      frameCounter++;
      const currentTime = getNow2();
      const elapsedTime = currentTime - startTime;
      if (frameCounter >= frameInterval && elapsedTime >= frameTimeout) {
        const currentRemoveScheduler = removeScheduler;
        canExecute = true;
        isScheduled = false;
        frameCounter = 0;
        startTime = 0;
        removeScheduler = null;
        if (currentRemoveScheduler) {
          currentRemoveScheduler();
        }
      }
    }
  };
  const cancel = () => {
    if (isScheduled && removeScheduler) {
      removeScheduler();
      removeScheduler = null;
    }
    isScheduled = false;
    frameCounter = 0;
    startTime = 0;
    canExecute = true;
  };
  const flush = () => {
    cancel();
  };
  const throttledFn = ((...args) => {
    if (canExecute) {
      fn(...args);
      canExecute = false;
      frameCounter = 0;
      startTime = getNow2();
      if (!isScheduled) {
        isScheduled = true;
        removeScheduler = scheduler.addScheduler(throttledScheduler, priority);
      }
    }
  });
  throttledFn.cancel = cancel;
  throttledFn.flush = flush;
  return throttledFn;
};

// node_modules/@gravity-ui/graph/build/utils/functions/vector.js
function vectorDistance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// node_modules/@gravity-ui/graph/build/utils/functions/observeDPR.js
function observeDPR(fn) {
  let dprMediaQuery;
  let rafId;
  function onChange() {
    if (rafId !== void 0) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
      rafId = void 0;
      fn(globalThis.devicePixelRatio || 1);
      watch();
    });
  }
  function watch() {
    unwatch();
    const mqString = `(resolution: ${globalThis.devicePixelRatio || 1}dppx)`;
    dprMediaQuery = globalThis.matchMedia?.(mqString);
    dprMediaQuery?.addEventListener("change", onChange, { once: true });
  }
  function unwatch() {
    dprMediaQuery?.removeEventListener("change", onChange);
    dprMediaQuery = void 0;
    if (rafId !== void 0) {
      cancelAnimationFrame(rafId);
      rafId = void 0;
    }
  }
  watch();
  return unwatch;
}

// node_modules/@gravity-ui/graph/build/utils/functions/index.js
function noop(...args) {
}
function isTouchEvent(event) {
  return globalThis.TouchEvent ? event instanceof globalThis.TouchEvent : event.type?.startsWith("touch");
}
function getXY(root, event) {
  if (!("pageX" in event))
    return [-1, -1];
  const rect = root.getBoundingClientRect();
  return [event.pageX - rect.left - window.scrollX, event.pageY - rect.top - window.scrollY];
}
function getCoord(event, coord) {
  const name = `page${coord.toUpperCase()}`;
  if (isTouchEvent(event)) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch?.[name] ?? 0;
  }
  return event[name];
}
function getEventDelta(e1, e2) {
  return Math.abs(getCoord(e1, "x") - getCoord(e2, "x")) + Math.abs(getCoord(e1, "y") - getCoord(e2, "y"));
}
function isMetaKeyEvent(event) {
  return event.metaKey || event.ctrlKey;
}
function isShiftKeyEvent(event) {
  return event.shiftKey;
}
function isAltKeyEvent(event) {
  return event.altKey;
}
function isBlock(component) {
  return component?.isBlock;
}
function isAllowDrag(canDrag, isSelected) {
  if (canDrag === ECanDrag.ALL)
    return true;
  return canDrag === ECanDrag.ONLY_SELECTED && isSelected;
}
function getBlocksRect(blocks) {
  if (blocks.length === 0) {
    return new Rect(0, 0, 0, 0);
  }
  const geometry = blocks.reduce((acc, item) => {
    acc.minX = Math.min(acc.minX, item.x);
    acc.minY = Math.min(acc.minY, item.y);
    acc.maxX = Math.max(acc.maxX, item.x + item.width);
    acc.maxY = Math.max(acc.maxY, item.y + item.height);
    return acc;
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const rect = new Rect(geometry.minX, geometry.minY, geometry.maxX - geometry.minX, geometry.maxY - geometry.minY);
  if (isGeometryHaveInfinity(rect)) {
    return new Rect(0, 0, 0, 0);
  }
  return rect;
}
function getElementsRect(elements) {
  if (elements.length === 0) {
    return new Rect(0, 0, 0, 0);
  }
  const elementsRect = elements.reduce((acc, item) => {
    const [x2, y2, width, height] = item.getHitBox();
    acc.minX = Math.min(acc.minX, x2);
    acc.minY = Math.min(acc.minY, y2);
    acc.maxX = Math.max(acc.maxX, x2 + width);
    acc.maxY = Math.max(acc.maxY, y2 + height);
    return acc;
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  return new Rect(elementsRect.minX, elementsRect.minY, elementsRect.maxX - elementsRect.minX, elementsRect.maxY - elementsRect.minY);
}
function isGeometryHaveInfinity(geometry) {
  let infinityHave = false;
  Object.entries(geometry).forEach((entry) => {
    if (!isFinite(entry[1]))
      infinityHave = true;
  });
  return infinityHave;
}
function startAnimation(duration, draw) {
  const start = performance.now();
  requestAnimationFrame(function animate(time) {
    let progress = (time - start) / duration;
    if (progress > 1)
      progress = 1;
    draw(progress);
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  });
}
function computeCssVariable(name) {
  if (!name.startsWith("var("))
    return name;
  const body = globalThis.document.body;
  if (!body)
    return name;
  const computedStyle = window.getComputedStyle(body);
  if (!computedStyle)
    return name;
  name = name.substring(4);
  name = name.substring(0, name.length - 1);
  return computedStyle.getPropertyValue(name).trim();
}

// node_modules/@gravity-ui/graph/build/utils/Emitter.js
var TIME_PER_FRAME_FOR_GC = 5;
var globalObject = typeof window === "undefined" ? global : window;
var rIC = globalObject.requestIdleCallback || globalObject.setTimeout;
var getTime = () => performance.now();
var FnWrapper = class {
  constructor(fn, once) {
    this.fn = fn;
    this.once = once;
    this.canBeDeleted = false;
  }
  run(...args) {
    this.fn.apply(null, Array.from(args));
    if (this.once) {
      this.destroy();
    }
  }
  destroy() {
    this.fn = noop;
    this.canBeDeleted = true;
  }
};
var Emitter = class {
  constructor() {
    this.eventsForGC = /* @__PURE__ */ new Set();
    this.eventsForGC = /* @__PURE__ */ new Set();
    this.mapEventToFnWrapper = /* @__PURE__ */ new Map();
    this.mapEventToMapFnToFnWrapper = /* @__PURE__ */ new Map();
  }
  on(event, fn) {
    this._on(event, fn, false);
    return this;
  }
  once(event, fn) {
    this._on(event, fn, true);
    return this;
  }
  off(event, fn) {
    if (event === void 0) {
      this.eventsForGC = /* @__PURE__ */ new Set();
      this.mapEventToFnWrapper = /* @__PURE__ */ new Map();
      this.mapEventToMapFnToFnWrapper = /* @__PURE__ */ new Map();
      return this;
    }
    if (this.mapEventToMapFnToFnWrapper?.has(event)) {
      if (typeof fn === "function" && this.mapEventToMapFnToFnWrapper.get(event)?.has(fn)) {
        this.mapEventToMapFnToFnWrapper.get(event)?.get(fn)?.destroy();
        this.eventsForGC?.add(event);
        this._launchGC();
      }
      if (fn === void 0) {
        const fnWrappers = this.mapEventToFnWrapper?.get(event) ?? [];
        for (let i2 = 0; i2 < fnWrappers.length; i2 += 1) {
          fnWrappers[i2].destroy();
        }
        this.eventsForGC?.add(event);
        this._launchGC();
      }
    }
    return this;
  }
  emit(event, ...args) {
    if (!this.mapEventToFnWrapper?.has(event))
      return this;
    const fnWrappers = this.mapEventToFnWrapper.get(event) ?? [];
    for (let i2 = 0; i2 < fnWrappers.length; i2 += 1) {
      fnWrappers[i2].run(...args);
    }
    return this;
  }
  destroy() {
    this.eventsForGC = /* @__PURE__ */ new Set();
    this.mapEventToFnWrapper = /* @__PURE__ */ new Map();
    this.mapEventToMapFnToFnWrapper = /* @__PURE__ */ new Map();
  }
  _on(event, fn, once) {
    if (!this.mapEventToFnWrapper?.has(event)) {
      this.mapEventToFnWrapper?.set(event, []);
      this.mapEventToMapFnToFnWrapper?.set(event, /* @__PURE__ */ new WeakMap());
    }
    const fnWrapper = new FnWrapper(fn, Boolean(once));
    this.mapEventToFnWrapper?.get(event)?.push(fnWrapper);
    this.mapEventToMapFnToFnWrapper?.get(event)?.set(fn, fnWrapper);
  }
  _launchGC() {
    if (this.gcLaunched)
      return;
    this.gcLaunched = true;
    rIC(() => {
      this.gcLaunched = false;
      this._walkGC();
    });
  }
  _walkGC() {
    const startTime = getTime();
    for (const event of this.eventsForGC ?? []) {
      const newFnWrappers = [];
      const fnWrappers = this.mapEventToFnWrapper?.get(event) ?? [];
      for (let i2 = 0; i2 < fnWrappers.length; i2 += 1) {
        if (!fnWrappers[i2].canBeDeleted) {
          newFnWrappers.push(fnWrappers[i2]);
        }
      }
      this.mapEventToFnWrapper?.set(event, newFnWrappers);
      this.eventsForGC?.delete(event);
      if (getTime() - startTime >= TIME_PER_FRAME_FOR_GC) {
        this._launchGC();
        return;
      }
    }
  }
};

// node_modules/@gravity-ui/graph/build/utils/functions/clamp.js
function clamp(value, min, max) {
  if (value > max) {
    return max;
  }
  if (value < min) {
    return min;
  }
  return value;
}

// node_modules/@gravity-ui/graph/build/services/camera/CameraService.js
var getInitCameraState = () => {
  return {
    /**
     * Viewport of camera in canvas space
     * x,y - center of camera(may be negative)
     * width, height - size of viewport, equals to canvas w/h
     *  */
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    /**
     * Viewport of camera in camera space
     * relativeX, relativeY - center of camera
     * relativeWidth, relativeHeight - size of viewport
     *
     * In easy words, it's a scale-aware viewport
     */
    relativeX: 0,
    relativeY: 0,
    relativeWidth: 0,
    relativeHeight: 0,
    scale: 0.5,
    scaleMax: 1,
    scaleMin: 0.01,
    viewportInsets: { left: 0, right: 0, top: 0, bottom: 0 },
    autoPanningEnabled: false
  };
};
var CameraService = class extends Emitter {
  constructor(graph, state = getInitCameraState()) {
    super();
    this.graph = graph;
    this.state = state;
  }
  resize(newState) {
    const diffX = newState.width - this.state.width;
    const diffY = newState.height - this.state.height;
    this.set(newState);
    this.move(diffX, diffY);
  }
  set(newState) {
    const nextState = Object.assign({}, this.state, newState);
    this.graph.execut\u0435DefaultEventAction("camera-change", nextState, () => {
      this.state = Object.assign(this.state, newState);
      this.updateRelative();
      this.syncCameraSignal();
    });
  }
  syncCameraSignal() {
    this.graph.$camera.value = {
      ...this.state,
      viewportInsets: { ...this.state.viewportInsets }
    };
  }
  updateRelative() {
    this.state.relativeX = this.getRelative(this.state.x) | 0;
    this.state.relativeY = this.getRelative(this.state.y) | 0;
    this.state.relativeWidth = this.getRelative(this.state.width) | 0;
    this.state.relativeHeight = this.getRelative(this.state.height) | 0;
  }
  getCameraRect() {
    const { x: x2, y: y2, width, height } = this.state;
    return { x: x2, y: y2, width, height };
  }
  /**
   * Returns the visible camera rect in screen space that accounts for the viewport insets.
   * @returns {TRect} Visible rectangle inside the canvas after applying insets
   */
  getVisibleCameraRect() {
    const { x: x2, y: y2, width, height, viewportInsets } = this.state;
    const visibleWidth = Math.max(0, width - viewportInsets.left - viewportInsets.right);
    const visibleHeight = Math.max(0, height - viewportInsets.top - viewportInsets.bottom);
    return {
      x: x2 + viewportInsets.left,
      y: y2 + viewportInsets.top,
      width: visibleWidth,
      height: visibleHeight
    };
  }
  /**
   * Returns camera viewport rectangle in camera-relative space.
   * By default returns full canvas-relative viewport (ignores insets).
   * When options.respectInsets is true, returns viewport of the visible area (with insets applied).
   * @param {Object} [options]
   * @param {boolean} [options.respectInsets]
   * @returns {TRect} Relative viewport rectangle
   */
  getRelativeViewportRect(options) {
    const useVisible = Boolean(options?.respectInsets);
    if (!useVisible) {
      return {
        x: this.getRelative(this.state.x) | 0,
        y: this.getRelative(this.state.y) | 0,
        width: this.getRelative(this.state.width) | 0,
        height: this.getRelative(this.state.height) | 0
      };
    }
    const insets = this.state.viewportInsets;
    const visibleWidth = Math.max(0, this.state.width - insets.left - insets.right);
    const visibleHeight = Math.max(0, this.state.height - insets.top - insets.bottom);
    return {
      x: this.getRelative(this.state.x + insets.left) | 0,
      y: this.getRelative(this.state.y + insets.top) | 0,
      width: this.getRelative(visibleWidth) | 0,
      height: this.getRelative(visibleHeight) | 0
    };
  }
  getCameraScale() {
    return this.state.scale;
  }
  /**
   * Qualitative zoom tier for blocks. Delegates to `settings.getCameraBlockScaleLevel` (always set; defaults to
   * the exported `defaultGetCameraBlockScaleLevel` strategy).
   * @param cameraScale Optional scale override; defaults to current camera scale
   */
  getCameraBlockScaleLevel(cameraScale = this.getCameraScale()) {
    return this.graph.rootStore.settings.$settings.value.getCameraBlockScaleLevel(this.graph, cameraScale);
  }
  getCameraState() {
    return this.state;
  }
  move(dx = 0, dy = 0) {
    const x2 = this.state.x + dx | 0;
    const y2 = this.state.y + dy | 0;
    this.set({
      x: x2,
      y: y2
    });
  }
  /**
   * Limits the effect of camera scale on visual details to preserve their visibility.
   * Prevents important details from becoming too large or too small during zoom.
   * Converts absolute value to camera space with optional clamping.
   * @param {number} value Absolute value in screen space
   * @param {number} [max] Maximum allowed value
   * @returns {number} Scale-compensated value in camera space
   */
  limitScaleEffect(value, max) {
    const result = this.getRelative(value);
    if (max !== void 0) {
      return clamp(result, value, max);
    }
    return result;
  }
  /**
   * Converts a value from absolute (screen space) to relative (camera space).
   * @param {number} n Absolute value
   * @param {number} [scale=this.state.scale] Scale to use for conversion
   * @returns {number} Relative value
   */
  getRelative(n2, scale = this.state.scale) {
    return n2 / scale;
  }
  getRelativeXY(x2, y2) {
    return [(x2 - this.state.x) / this.state.scale, (y2 - this.state.y) / this.state.scale];
  }
  /**
   * Converts relative coordinate to absolute (screen space).
   * Inverse of getRelative.
   * @param {number} n Relative coordinate
   * @param {number} [scale=this.state.scale] Scale to use for conversion
   * @returns {number} Absolute coordinate in screen space
   */
  getAbsolute(n2, scale = this.state.scale) {
    return n2 * scale;
  }
  /**
   * Converts relative coordinates to absolute (screen space).
   * Inverse of getRelativeXY.
   * @param {number} x Relative x
   * @param {number} y Relative y
   * @returns {number[]} Absolute [x, y] in screen space
   */
  getAbsoluteXY(x2, y2) {
    return [x2 * this.state.scale + this.state.x, y2 * this.state.scale + this.state.y];
  }
  /**
   * Zoom to a screen point.
   * @param {number} x Screen x where zoom anchors
   * @param {number} y Screen y where zoom anchors
   * @param {number} scale Target scale value
   * @returns {void}
   */
  zoom(x2, y2, scale) {
    const normalizedScale = clamp(scale, this.state.scaleMin, this.state.scaleMax);
    const dx = this.getRelative(x2 - this.state.x);
    const dy = this.getRelative(y2 - this.state.y);
    const dxInNextScale = this.getRelative(x2 - this.state.x, normalizedScale);
    const dyInNextScale = this.getRelative(y2 - this.state.y, normalizedScale);
    const nextX = this.state.x + (dxInNextScale - dx) * normalizedScale;
    const nextY = this.state.y + (dyInNextScale - dy) * normalizedScale;
    this.set({
      scale: normalizedScale,
      x: nextX,
      y: nextY
    });
  }
  getScaleRelativeDimensionsBySide(size, axis, options) {
    const useVisible = Boolean(options?.respectInsets);
    const insets = this.state.viewportInsets;
    let viewportSize;
    if (axis === "width") {
      viewportSize = useVisible ? Math.max(0, this.state.width - insets.left - insets.right) : this.state.width;
    } else {
      viewportSize = useVisible ? Math.max(0, this.state.height - insets.top - insets.bottom) : this.state.height;
    }
    return clamp(Number(viewportSize / size), this.state.scaleMin, this.state.scaleMax);
  }
  getScaleRelativeDimensions(width, height, options) {
    return Math.min(this.getScaleRelativeDimensionsBySide(width, "width", options), this.getScaleRelativeDimensionsBySide(height, "height", options));
  }
  getXYRelativeCenterDimensions(dimensions, scale, options) {
    const useVisible = Boolean(options?.respectInsets);
    const insets = this.state.viewportInsets;
    const centerX = useVisible ? insets.left + Math.max(0, this.state.width - insets.left - insets.right) / 2 : this.state.width / 2;
    const centerY = useVisible ? insets.top + Math.max(0, this.state.height - insets.top - insets.bottom) / 2 : this.state.height / 2;
    const x2 = 0 - dimensions.x * scale - dimensions.width / 2 * scale + centerX;
    const y2 = 0 - dimensions.y * scale - dimensions.height / 2 * scale + centerY;
    return { x: x2, y: y2 };
  }
  isRectVisible(x2, y2, w2, h2) {
    return import_intersects.default.boxBox(x2 + this.state.relativeX, y2 + this.state.relativeY, w2, h2, 0, 0, this.state.relativeWidth, this.state.relativeHeight);
  }
  isLineVisible(x1, y1, x2, y2) {
    return import_intersects.default.lineBox(-x1, -y1, -x2, -y2, this.state.relativeX - this.state.relativeWidth, this.state.relativeY - this.state.relativeHeight, this.state.relativeWidth, this.state.relativeHeight);
  }
  applyToPoint(x2, y2) {
    return [this.getRelative(x2) - this.state.relativeX | 0, this.getRelative(y2) - this.state.relativeY | 0];
  }
  applyToRect(x2, y2, w2, h2) {
    return this.applyToPoint(x2, y2).concat(Math.floor(this.getRelative(w2)), Math.floor(this.getRelative(h2)));
  }
  /**
   * Update viewport insets (screen-space paddings inside canvas) and optionally keep the
   * world point under the visible center unchanged.
   * @param {Object} insets Partial insets to update
   * @param {number} [insets.left]
   * @param {number} [insets.right]
   * @param {number} [insets.top]
   * @param {number} [insets.bottom]
   * @param {string} [maintain=center] Preserve visual anchor; allowed values: center or none. "center" keeps the
   * same world point under visible center
   * @returns {void}
   */
  setViewportInsets(insets, params) {
    const currentInsets = this.state.viewportInsets;
    const nextInsets = {
      left: insets.left ?? currentInsets.left,
      right: insets.right ?? currentInsets.right,
      top: insets.top ?? currentInsets.top,
      bottom: insets.bottom ?? currentInsets.bottom
    };
    if (params?.maintain === "center") {
      const oldVisibleWidth = Math.max(0, this.state.width - currentInsets.left - currentInsets.right);
      const oldVisibleHeight = Math.max(0, this.state.height - currentInsets.top - currentInsets.bottom);
      const oldCenterX = currentInsets.left + oldVisibleWidth / 2;
      const oldCenterY = currentInsets.top + oldVisibleHeight / 2;
      const [anchorWorldX, anchorWorldY] = this.getRelativeXY(oldCenterX, oldCenterY);
      const newVisibleWidth = Math.max(0, this.state.width - nextInsets.left - nextInsets.right);
      const newVisibleHeight = Math.max(0, this.state.height - nextInsets.top - nextInsets.bottom);
      const newCenterX = nextInsets.left + newVisibleWidth / 2;
      const newCenterY = nextInsets.top + newVisibleHeight / 2;
      const nextX = newCenterX - anchorWorldX * this.state.scale;
      const nextY = newCenterY - anchorWorldY * this.state.scale;
      this.set({ viewportInsets: nextInsets, x: nextX, y: nextY });
      return;
    }
    this.set({ viewportInsets: nextInsets });
  }
  /**
   * Returns current viewport insets.
   * @returns {{left: number, right: number, top: number, bottom: number}} Current insets of visible viewport
   */
  getViewportInsets() {
    return this.state.viewportInsets;
  }
  /**
   * Enable auto-panning mode.
   * When enabled, the camera will automatically pan when the mouse is near the viewport edges.
   * @returns {void}
   */
  enableAutoPanning() {
    this.set({ autoPanningEnabled: true });
  }
  /**
   * Disable auto-panning mode.
   * @returns {void}
   */
  disableAutoPanning() {
    this.set({ autoPanningEnabled: false });
  }
  /**
   * Check if auto-panning mode is enabled.
   * @returns {boolean} True if auto-panning is enabled
   */
  isAutoPanningEnabled() {
    return this.state.autoPanningEnabled;
  }
};

// node_modules/@gravity-ui/graph/build/store/block/selectors.js
function selectBlockList(graph) {
  return graph.rootStore.blocksList;
}
function selectBlockById(graph, id) {
  return selectBlockList(graph).$blocksMap.value.get(id);
}
function selectBlockAnchor(graph, blockId, anchorId) {
  return selectBlockById(graph, blockId)?.getAnchorById(anchorId);
}

// node_modules/@gravity-ui/graph/build/services/HitTest.js
var import_rbush = __toESM(require_rbush_min());

// node_modules/@gravity-ui/graph/build/services/IncrementalBoundingBoxTracker.js
var IncrementalBoundingBoxTracker = class {
  constructor() {
    this.items = /* @__PURE__ */ new Set();
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    this.boundaryElements = {
      minX: /* @__PURE__ */ new Set(),
      minY: /* @__PURE__ */ new Set(),
      maxX: /* @__PURE__ */ new Set(),
      maxY: /* @__PURE__ */ new Set()
    };
  }
  has(item) {
    return this.items.has(item);
  }
  /**
   * Add element for tracking - O(1)
   * @param item Element to track
   * @returns void
   */
  add(item) {
    this.items.add(item);
    if (this.isValidBounds(item)) {
      this.updateBoundsIncremental(item);
    }
  }
  /**
   * Remove element from tracking - O(1) or O(n) if boundary element
   * @param item Element to remove
   * @returns void
   */
  remove(item) {
    if (!this.items.delete(item))
      return;
    const wasOnBoundary = this.isOnBoundary(item);
    this.removeFromBoundaryTracking(item);
    if (wasOnBoundary) {
      this.recalculateBounds();
    }
  }
  /**
   * Update element - O(1) in most cases
   * @param item Element to update
   * @param newBounds New element bounds
   * @returns void
   */
  update(item, newBounds) {
    if (!this.items.has(item)) {
      this.add(item);
      return;
    }
    const oldBounds = { ...item };
    Object.assign(item, newBounds);
    if (this.isValidBounds(item)) {
      this.updateBoundsOptimized(item, oldBounds);
    } else {
      this.removeFromBoundaryTracking(item, oldBounds);
      if (this.isOnBoundary(oldBounds)) {
        this.recalculateBounds();
      }
    }
  }
  /**
   * Clear all elements - O(1)
   *
   * @returns void
   */
  clear() {
    this.items.clear();
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    this.boundaryElements = { minX: /* @__PURE__ */ new Set(), minY: /* @__PURE__ */ new Set(), maxX: /* @__PURE__ */ new Set(), maxY: /* @__PURE__ */ new Set() };
  }
  /**
   * Load array of elements - O(n)
   * @param items Array of elements to load
   * @returns void
   */
  load(items) {
    this.clear();
    for (const item of items) {
      this.items.add(item);
      this.updateBoundsIncremental(item);
    }
  }
  /**
   * Get bounding box - O(1)
   * @returns Object with element count and bounding box
   */
  toJSON() {
    if (this.items.size === 0) {
      return { length: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    if (this.bounds.minX === Infinity || this.bounds.maxX === -Infinity) {
      return { length: this.items.size, minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    return {
      length: this.items.size,
      ...this.bounds
    };
  }
  updateBoundsIncremental(item) {
    if (!this.isValidBounds(item)) {
      return;
    }
    if (this.bounds.minX === Infinity || item.minX <= this.bounds.minX) {
      if (item.minX < this.bounds.minX) {
        this.boundaryElements.minX.clear();
        this.bounds.minX = item.minX;
      }
      this.boundaryElements.minX.add(item);
    }
    if (this.bounds.minY === Infinity || item.minY <= this.bounds.minY) {
      if (item.minY < this.bounds.minY) {
        this.boundaryElements.minY.clear();
        this.bounds.minY = item.minY;
      }
      this.boundaryElements.minY.add(item);
    }
    if (item.maxX >= this.bounds.maxX) {
      if (item.maxX > this.bounds.maxX) {
        this.boundaryElements.maxX.clear();
        this.bounds.maxX = item.maxX;
      }
      this.boundaryElements.maxX.add(item);
    }
    if (item.maxY >= this.bounds.maxY) {
      if (item.maxY > this.bounds.maxY) {
        this.boundaryElements.maxY.clear();
        this.bounds.maxY = item.maxY;
      }
      this.boundaryElements.maxY.add(item);
    }
  }
  updateBoundsOptimized(item, oldBounds) {
    this.removeFromBoundaryTracking(item, oldBounds);
    const needsRecalc = this.needsRecalculation(oldBounds);
    if (needsRecalc) {
      this.recalculateBounds();
    } else {
      this.updateBoundsIncremental(item);
    }
  }
  needsRecalculation(oldBounds) {
    return oldBounds.minX === this.bounds.minX && this.boundaryElements.minX.size === 0 || oldBounds.minY === this.bounds.minY && this.boundaryElements.minY.size === 0 || oldBounds.maxX === this.bounds.maxX && this.boundaryElements.maxX.size === 0 || oldBounds.maxY === this.bounds.maxY && this.boundaryElements.maxY.size === 0;
  }
  isOnBoundary(item) {
    return this.boundaryElements.minX.has(item) || this.boundaryElements.minY.has(item) || this.boundaryElements.maxX.has(item) || this.boundaryElements.maxY.has(item);
  }
  removeFromBoundaryTracking(item, bounds = item) {
    if (bounds.minX === this.bounds.minX)
      this.boundaryElements.minX.delete(item);
    if (bounds.minY === this.bounds.minY)
      this.boundaryElements.minY.delete(item);
    if (bounds.maxX === this.bounds.maxX)
      this.boundaryElements.maxX.delete(item);
    if (bounds.maxY === this.bounds.maxY)
      this.boundaryElements.maxY.delete(item);
  }
  recalculateBounds() {
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    this.boundaryElements = { minX: /* @__PURE__ */ new Set(), minY: /* @__PURE__ */ new Set(), maxX: /* @__PURE__ */ new Set(), maxY: /* @__PURE__ */ new Set() };
    for (const item of this.items) {
      this.updateBoundsIncremental(item);
    }
  }
  /**
   * Check if item has valid bounds (no undefined, NaN, or non-finite values)
   * @param item Element to check
   * @returns true if bounds are valid
   */
  isValidBounds(item) {
    return typeof item.minX === "number" && typeof item.minY === "number" && typeof item.maxX === "number" && typeof item.maxY === "number" && Number.isFinite(item.minX) && Number.isFinite(item.minY) && Number.isFinite(item.maxX) && Number.isFinite(item.maxY);
  }
};

// node_modules/@gravity-ui/graph/build/services/HitTest.js
var HitTest = class extends Emitter {
  constructor(graph) {
    super();
    this.graph = graph;
    this.interactiveTree = new import_rbush.default(9);
    this.usableRectTracker = new IncrementalBoundingBoxTracker();
    this.$usableRect = y({ x: 0, y: 0, width: 0, height: 0 });
    this.$pendingEntitiesUpdate = y(false);
    this.queue = /* @__PURE__ */ new Map();
    this.processQueue = debounce(() => {
      const interactiveItems = [];
      for (const [item, bbox] of this.queue) {
        this.interactiveTree.remove(item);
        if (bbox) {
          let shouldUpdate = true;
          if (item.affectsUsableRect) {
            if (this.usableRectTracker.has(item)) {
              this.usableRectTracker.update(item, bbox);
            } else {
              item.updateRect(bbox);
              shouldUpdate = false;
              this.usableRectTracker.add(item);
            }
          } else {
            this.usableRectTracker.remove(item);
          }
          if (shouldUpdate) {
            item.updateRect(bbox);
          }
          interactiveItems.push(item);
        } else {
          this.usableRectTracker.remove(item);
        }
      }
      this.interactiveTree.load(interactiveItems);
      this.queue.clear();
      this.updateUsableRect();
      this.emit("update", this);
      this.$pendingEntitiesUpdate.value = false;
    }, {
      priority: ESchedulerPriority.LOWEST,
      frameInterval: 1
      // run every scheduled lowest frame
    });
  }
  /**
   * Check if graph has any elements (blocks or connections)
   * @returns true if graph has elements, false if empty
   */
  hasGraphElements() {
    if (!this.graph) {
      return false;
    }
    return this.graph.rootStore.blocksList.$blocks.value.length > 0 || this.graph.rootStore.connectionsList.$connections.value.length > 0;
  }
  get isUnstable() {
    const hasProcessingQueue = this.processQueue.isScheduled() || this.queue.size > 0;
    const hasZeroUsableRect = this.$usableRect.value.height === 0 && this.$usableRect.value.width === 0 && this.$usableRect.value.x === 0 && this.$usableRect.value.y === 0;
    if (hasZeroUsableRect && !this.hasGraphElements()) {
      return hasProcessingQueue || this.$pendingEntitiesUpdate.value;
    }
    return hasProcessingQueue || hasZeroUsableRect || this.$pendingEntitiesUpdate.value;
  }
  /**
   * Load array of HitBox items
   * @param items Array of HitBox items to load
   * @returns void
   */
  load(items) {
    this.usableRectTracker.clear();
    for (const item of items) {
      if (item.affectsUsableRect) {
        this.usableRectTracker.add(item);
      }
    }
    this.interactiveTree.load(items);
  }
  /**
   * Update HitBox item with new bounds
   * @param item HitBox item to update
   * @param bbox New bounds data
   * @param _force Force update flag
   * @returns void
   */
  update(item, bbox, _force = false) {
    this.queue.set(item, bbox);
    this.processQueue();
  }
  /**
   * Clear all HitBox items and reset state
   */
  clear() {
    this.processQueue.cancel();
    this.queue.clear();
    this.interactiveTree.clear();
    this.usableRectTracker.clear();
    this.updateUsableRect();
    this.$pendingEntitiesUpdate.value = false;
  }
  /**
   * Mark hitTest as pending an entity update (called by setEntities).
   * Makes isUnstable = true until processQueue completes.
   * Does NOT clear usableRectTracker — existing data stays valid.
   * Does NOT eagerly schedule processQueue — it fires naturally when hitbox
   * updates arrive (new components register) or when updateBlock forces a hitbox
   * refresh on existing components. Eager scheduling caused processQueue to run
   * in the same rAF frame as markPendingUpdate (before MEDIUM/component renders),
   * clearing $pendingEntitiesUpdate before new block hitboxes were queued.
   */
  markPendingUpdate() {
    this.$pendingEntitiesUpdate.value = true;
  }
  /**
   * Add new HitBox item
   * @param item HitBox item to add
   */
  add(item) {
    if (item.destroyed) {
      return;
    }
    this.queue.set(item, item);
    this.processQueue();
  }
  /**
   * Wait for usableRect to become stable and then call callback
   * @param callback Function to call when usableRect becomes stable
   * @returns Unsubscribe function
   */
  waitUsableRectUpdate(callback) {
    if (!this.hasGraphElements()) {
      callback(this.$usableRect.value);
      return noop;
    }
    if (this.isUnstable) {
      let cleaned = false;
      const unsubscribers = [];
      const cleanup = () => {
        if (cleaned)
          return;
        cleaned = true;
        unsubscribers.forEach((unsubscribe) => unsubscribe());
      };
      const check = () => {
        if (!this.isUnstable) {
          cleanup();
          callback(this.$usableRect.value);
        }
      };
      unsubscribers.push(this.$usableRect.subscribe(check));
      unsubscribers.push(this.$pendingEntitiesUpdate.subscribe(check));
      this.on("update", check);
      unsubscribers.push(() => this.off("update", check));
      return cleanup;
    }
    callback(this.$usableRect.value);
    return noop;
  }
  updateUsableRect() {
    const rect = this.usableRectTracker.toJSON();
    const usableRect = {
      x: Number.isFinite(rect.minX) ? rect.minX : 0,
      y: Number.isFinite(rect.minY) ? rect.minY : 0,
      width: Number.isFinite(rect.maxX) ? rect.maxX - rect.minX : 0,
      height: Number.isFinite(rect.maxY) ? rect.maxY - rect.minY : 0
    };
    if (usableRect.x === this.$usableRect.value.x && usableRect.y === this.$usableRect.value.y && usableRect.width === this.$usableRect.value.width && usableRect.height === this.$usableRect.value.height) {
      return;
    }
    this.$usableRect.value = usableRect;
  }
  /**
   * Remove HitBox item
   * @param item HitBox item to remove
   */
  remove(item) {
    this.queue.set(item, null);
    this.processQueue();
  }
  /**
   * Test hit at specific point
   * @param point Point to test
   * @param pixelRatio Pixel ratio for coordinate conversion
   * @returns Array of hit components
   */
  testPoint(point, pixelRatio) {
    return this.testHitBox({
      minX: point.x - 1,
      minY: point.y - 1,
      maxX: point.x + 1,
      maxY: point.y + 1,
      x: point.origPoint?.x * pixelRatio,
      y: point.origPoint?.y * pixelRatio
    });
  }
  /**
   * Test hit box intersection with interactive elements
   * @param item Hit box data to test
   * @returns Array of hit components
   */
  testBox(item) {
    return this.interactiveTree.search(item).map((hitBox) => hitBox.item);
  }
  /**
   * Subscribe to usableRect updates
   * @param callback Function to call when usableRect changes
   * @returns Unsubscribe function
   */
  onUsableRectUpdate(callback) {
    return this.$usableRect.subscribe(callback);
  }
  /**
   * Get current usableRect value
   * @returns Current usableRect
   */
  getUsableRect() {
    return this.$usableRect.value;
  }
  /*
   * Destroy HitTest system, clears all items and stops processing queue
   * @returns void
   */
  destroy() {
    this.clear();
    super.destroy();
  }
  /**
   * Test hit box intersection with interactive elements and sort by z-index
   * @param item Hit box data to test
   * @returns Array of hit components sorted by z-index
   */
  /**
   * Test hit box intersection with interactive elements and sort by z-index
   * @param item Hit box data to test
   * @returns Array of hit components sorted by z-index
   */
  testHitBox(item) {
    const hitBoxes = this.interactiveTree.search(item);
    const result = [];
    for (let i2 = 0; i2 < hitBoxes.length; i2++) {
      if (hitBoxes[i2].item.onHitBox(item)) {
        result.push(hitBoxes[i2].item);
      }
    }
    const res = result.sort((a2, b2) => {
      const aZIndex = typeof a2.zIndex === "number" ? a2.zIndex : -1;
      const bZIndex = typeof b2.zIndex === "number" ? b2.zIndex : -1;
      if (aZIndex !== bZIndex) {
        return bZIndex - aZIndex;
      }
      const aOrder = typeof a2.renderOrder === "number" ? a2.renderOrder : -1;
      const bOrder = typeof b2.renderOrder === "number" ? b2.renderOrder : -1;
      return bOrder - aOrder;
    });
    return res;
  }
};
var HitBox = class {
  constructor(item, hitTest) {
    this.item = item;
    this.hitTest = hitTest;
    this.destroyed = false;
    this.affectsUsableRect = true;
    this.rect = [0, 0, 0, 0];
    this.unstable = true;
    this.update = (minX, minY, maxX, maxY, force) => {
      if (this.destroyed)
        return;
      if (minX === this.minX && minY === this.minY && maxX === this.maxX && maxY === this.maxY && !force)
        return;
      this.unstable = true;
      this.rect = [minX, minY, maxX - minX, maxY - minY];
      this.hitTest.update(this, { minX, minY, maxX, maxY, x: this.x, y: this.y }, force);
    };
    this.affectsUsableRect = true;
  }
  /**
   * Update HitBox rectangle data
   * @param rect New rectangle data
   */
  updateRect(rect) {
    this.minX = rect.minX;
    this.minY = rect.minY;
    this.maxX = rect.maxX;
    this.maxY = rect.maxY;
    this.x = rect.x;
    this.y = rect.y;
    this.rect = [this.minX, this.minY, this.maxX - this.minX, this.maxY - this.minY];
    this.unstable = false;
  }
  /**
   * Get HitBox rectangle as array [x, y, width, height]
   * @returns Rectangle array [x, y, width, height]
   */
  getRect() {
    return this.rect;
  }
  /**
   * Remove HitBox from hit testing
   */
  remove() {
    this.hitTest.remove(this);
  }
  /**
   * Destroy HitBox and remove from hit testing
   */
  destroy() {
    this.destroyed = true;
    this.hitTest.remove(this);
  }
  setAffectsUsableRect(affectsUsableRect) {
    this.affectsUsableRect = affectsUsableRect;
    if (this.unstable) {
      return;
    }
    this.hitTest.update(this, {
      minX: this.minX,
      minY: this.minY,
      maxX: this.maxX,
      maxY: this.maxY,
      x: this.x,
      y: this.y
    });
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/EventedComponent/EventedComponent.js
var import_intersects2 = __toESM(require_intersects());
var listeners = /* @__PURE__ */ new WeakMap();
function createSyntheticHoverEvent(type) {
  return new MouseEvent(type, {
    bubbles: false,
    cancelable: false,
    clientX: 0,
    clientY: 0
  });
}
var EventedComponent = class _EventedComponent extends Component {
  constructor(props, parent) {
    super({
      ...props,
      interactive: props.interactive ?? true
    }, parent);
    this.evented = true;
    this._eventedAreas = /* @__PURE__ */ new Map();
  }
  isInteractive() {
    return this.props.interactive;
  }
  setInteractive(interactive) {
    this.setProps({ interactive });
  }
  get events() {
    if (!listeners.has(this)) {
      listeners.set(this, /* @__PURE__ */ new Map());
    }
    return listeners.get(this);
  }
  unmount() {
    listeners.delete(this);
    super.unmount();
  }
  willRender() {
    if (this._hoveredEventedAreaKey !== void 0) {
      const area = this._eventedAreas.get(this._hoveredEventedAreaKey);
      if (area) {
        const handler = area.params.mouseleave;
        this._prevHoveredAreaLeaveHandler = typeof handler === "function" ? handler : void 0;
      }
    }
    this._eventedAreas.clear();
    super.willRender();
  }
  didRender() {
    super.didRender();
    if (this._hoveredEventedAreaKey !== void 0 && !this._eventedAreas.has(this._hoveredEventedAreaKey)) {
      this._prevHoveredAreaLeaveHandler?.(createSyntheticHoverEvent("mouseleave"));
      this._hoveredEventedAreaKey = void 0;
    }
    this._prevHoveredAreaLeaveHandler = void 0;
  }
  _areaHitTest(area, hitBoxData) {
    const onHitBox = area.params.onHitBox;
    if (onHitBox)
      return onHitBox(hitBoxData);
    const { x: x2, y: y2, width, height } = area.rect;
    return import_intersects2.default.boxBox(x2, y2, width, height, hitBoxData.minX, hitBoxData.minY, hitBoxData.maxX - hitBoxData.minX, hitBoxData.maxY - hitBoxData.minY);
  }
  _trackAreaHover() {
    if (this._eventedAreas.size === 0 || !this._lastHitBoxData) {
      this._clearAreaHover(true);
      return;
    }
    const hitBoxData = this._lastHitBoxData;
    let newHoveredKey;
    for (const [key, area] of this._eventedAreas) {
      if (this._areaHitTest(area, hitBoxData)) {
        newHoveredKey = key;
        break;
      }
    }
    if (newHoveredKey === this._hoveredEventedAreaKey)
      return;
    const prevArea = this._hoveredEventedAreaKey !== void 0 ? this._eventedAreas.get(this._hoveredEventedAreaKey) : void 0;
    if (prevArea) {
      const leaveHandler = prevArea.params.mouseleave;
      if (typeof leaveHandler === "function") {
        leaveHandler(createSyntheticHoverEvent("mouseleave"));
      }
    }
    this._hoveredEventedAreaKey = newHoveredKey;
    if (newHoveredKey !== void 0) {
      const nextArea = this._eventedAreas.get(newHoveredKey);
      if (nextArea) {
        const enterHandler = nextArea.params.mouseenter;
        if (typeof enterHandler === "function") {
          enterHandler(createSyntheticHoverEvent("mouseenter"));
        }
      }
    }
    this.performRender();
  }
  _clearAreaHover(scheduleRender = false) {
    if (this._hoveredEventedAreaKey !== void 0) {
      const area = this._eventedAreas.get(this._hoveredEventedAreaKey);
      if (area) {
        const leaveHandler = area.params.mouseleave;
        if (typeof leaveHandler === "function") {
          leaveHandler(createSyntheticHoverEvent("mouseleave"));
        }
      }
      this._hoveredEventedAreaKey = void 0;
      if (scheduleRender) {
        this.performRender();
      }
    }
  }
  eventedArea(fn, params) {
    const state = {
      hovered: this._hoveredEventedAreaKey === params.key
    };
    const rect = fn(state);
    this._eventedAreas.set(params.key, { rect, params });
    return rect;
  }
  handleEvent(_2) {
  }
  listenEvents(events, cbOrObject = this) {
    const unsubs = events.map((eventName) => {
      return this.addEventListener(eventName, cbOrObject);
    });
    return unsubs;
  }
  addEventListener(type, cbOrObject) {
    const cbs = this.events.get(type) || /* @__PURE__ */ new Set();
    cbs.add(cbOrObject);
    this.events.set(type, cbs);
    return () => this.removeEventListener(type, cbOrObject);
  }
  removeEventListener(type, cbOrObject) {
    const cbs = this.events.get(type);
    if (cbs) {
      cbs.delete(cbOrObject);
    }
  }
  _fireEvent(cmp, event) {
    if (cmp instanceof _EventedComponent && !cmp.isInteractive?.()) {
      return;
    }
    const handlers = listeners.get(cmp)?.get?.(event.type);
    handlers?.forEach((cb) => {
      if (typeof cb === "function") {
        return cb(event);
      } else if (cb instanceof Component && "handleEvent" in cb && typeof cb.handleEvent === "function") {
        return cb.handleEvent?.(event);
      }
      return void 0;
    });
    if (cmp instanceof _EventedComponent && cmp._eventedAreas.size > 0 && cmp._lastHitBoxData) {
      if (event.type === "mouseenter" || event.type === "mouseleave")
        return;
      const hitBoxData = cmp._lastHitBoxData;
      for (const area of cmp._eventedAreas.values()) {
        const handler = area.params[event.type];
        if (typeof handler !== "function")
          continue;
        if (cmp._areaHitTest(area, hitBoxData)) {
          handler(event);
        }
      }
    }
  }
  dispatchEvent(event) {
    return this._dipping(this, event);
  }
  _dipping(startParent, event) {
    let stopPropagation = false;
    let parent = startParent;
    event.stopPropagation = () => {
      stopPropagation = true;
    };
    do {
      if (parent instanceof _EventedComponent && !parent.isInteractive?.() || !this._hasListener(parent, event.type)) {
        parent = parent.getParent();
        continue;
      }
      this._fireEvent(parent, event);
      if (stopPropagation) {
        return false;
      }
      parent = parent.getParent();
    } while (parent);
    return true;
  }
  _hasListener(comp, type) {
    if (listeners.get(comp)?.has?.(type))
      return true;
    if (comp._eventedAreas?.size > 0) {
      for (const area of comp._eventedAreas.values()) {
        if (typeof area.params[type] === "function")
          return true;
      }
    }
    return false;
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/GraphComponent/index.js
var GraphComponent = class extends EventedComponent {
  getEntityId() {
    throw new Error("GraphComponent.getEntityId() is not implemented");
  }
  /**
   * Returns whether this component can be dragged.
   * Override in subclasses to enable drag behavior.
   * Components that return true will participate in drag operations managed by DragService.
   *
   * @returns true if the component is draggable, false otherwise
   */
  isDraggable() {
    return false;
  }
  /**
   * Called when a drag operation starts on this component.
   * Override in subclasses to handle drag start logic.
   *
   * @param _context - The drag context containing coordinates and participating components
   */
  handleDragStart(_context) {
  }
  /**
   * Called on each frame during a drag operation.
   * Override in subclasses to update component position.
   *
   * @param _diff - The diff containing coordinate changes (deltaX/deltaY for incremental, diffX/diffY for absolute)
   * @param _context - The drag context containing coordinates and participating components
   */
  handleDrag(_diff, _context) {
  }
  /**
   * Called when a drag operation ends.
   * Override in subclasses to finalize drag state.
   *
   * @param _context - The drag context containing final coordinates and participating components
   */
  handleDragEnd(_context) {
  }
  get affectsUsableRect() {
    return this.props.affectsUsableRect ?? this.context.affectsUsableRect ?? true;
  }
  constructor(props, parent) {
    super(props, parent);
    this.unsubscribe = [];
    this.ports = /* @__PURE__ */ new Map();
    this.mounted = false;
    this.hidden = false;
    this.hitBox = new HitBox(this, this.context.graph.hitTest);
    const affectsUsableRect = props.affectsUsableRect ?? this.context.affectsUsableRect ?? true;
    this.setProps({ affectsUsableRect });
    this.setContext({ affectsUsableRect });
  }
  /* Adopt color to the component alpha */
  adoptColor(color, { alpha } = {}) {
    if (alpha !== void 0) {
      return applyAlpha(color, alpha);
    }
    return color;
  }
  createPort(id) {
    const port = this.context.graph.rootStore.connectionsList.claimPort(id, this);
    this.ports.set(id, port);
    return port;
  }
  getPort(id) {
    if (!this.ports.has(id)) {
      return this.createPort(id);
    }
    return this.ports.get(id);
  }
  /**
   * Get all ports of this component
   * @returns Array of all port states
   */
  getPorts() {
    return Array.from(this.ports.values());
  }
  /**
   * Update port position and metadata
   * @param id Port identifier
   * @param portChanges port changes {x?, y?, meta?}
   */
  updatePort(id, portChanges) {
    const port = this.getPort(id);
    port.updatePort(portChanges);
  }
  setAffectsUsableRect(affectsUsableRect) {
    this.setProps({ affectsUsableRect });
    this.setContext({ affectsUsableRect });
  }
  propsChanged(_nextProps) {
    if (this.affectsUsableRect !== _nextProps.affectsUsableRect) {
      this.hitBox.setAffectsUsableRect(_nextProps.affectsUsableRect);
      this.setContext({ affectsUsableRect: _nextProps.affectsUsableRect });
    }
    super.propsChanged(_nextProps);
  }
  contextChanged(_nextContext) {
    if (this.firstRender || this.context.affectsUsableRect !== _nextContext.affectsUsableRect && this.props.affectsUsableRect === void 0) {
      this.hitBox.setAffectsUsableRect(_nextContext.affectsUsableRect);
    }
    super.contextChanged(_nextContext);
  }
  onChange(cb) {
    return this.addEventListener("graph-component-change", () => {
      cb(this);
    });
  }
  checkData() {
    if (super.checkData()) {
      this.dispatchEvent(new Event("graph-component-change"));
      return true;
    }
    return false;
  }
  onDrag({ onDragStart, onDragUpdate, onDrop, isDraggable, autopanning, dragCursor }) {
    let startCoords;
    let prevCoords;
    return this.addEventListener("mousedown", (event) => {
      if (!isDraggable?.(event)) {
        return;
      }
      event.stopPropagation();
      this.context.graph.dragService.startDrag({
        onStart: (event2) => {
          if (onDragStart?.(event2) === false) {
            return;
          }
          const xy = getXY(this.context.canvas, event2);
          startCoords = this.context.camera.applyToPoint(xy[0], xy[1]);
          prevCoords = startCoords;
        },
        onUpdate: (event2) => {
          if (!startCoords || !prevCoords)
            return;
          const [canvasX, canvasY] = getXY(this.context.canvas, event2);
          const currentCoords = this.context.camera.applyToPoint(canvasX, canvasY);
          const diffX = currentCoords[0] - startCoords[0];
          const diffY = currentCoords[1] - startCoords[1];
          const deltaX = currentCoords[0] - prevCoords[0];
          const deltaY = currentCoords[1] - prevCoords[1];
          onDragUpdate?.({ startCoords, prevCoords, currentCoords, diffX, diffY, deltaX, deltaY }, event2);
          prevCoords = currentCoords;
        },
        onEnd: (event2) => {
          startCoords = void 0;
          prevCoords = void 0;
          onDrop?.(event2);
        }
      }, {
        component: this,
        autopanning: autopanning ?? true,
        cursor: dragCursor ?? "grabbing"
      });
    });
  }
  isMounted() {
    return this.mounted;
  }
  willMount() {
    super.willMount();
    this.mounted = true;
  }
  /**
   * Subscribes to a graph event and automatically unsubscribes on component unmount.
   *
   * This is a convenience wrapper around this.context.graph.on that also registers the
   * returned unsubscribe function in the internal unsubscribe list, ensuring proper cleanup.
   *
   * @param eventName - Graph event name to subscribe to
   * @param handler - Event handler callback
   * @param options - Additional AddEventListener options
   * @returns Unsubscribe function
   */
  onGraphEvent(eventName, handler, options) {
    const unsubscribe = this.context.graph.on(eventName, handler, options);
    this.unsubscribe.push(unsubscribe);
    return unsubscribe;
  }
  /**
   * Subscribes to a DOM event on the graph root element and automatically unsubscribes on unmount.
   *
   * @param eventName - DOM event name to subscribe to
   * @param handler - Event handler callback
   * @param options - Additional AddEventListener options
   * @returns Unsubscribe function
   */
  onRootEvent(eventName, handler, options) {
    const root = this.context.root;
    if (!root) {
      throw new Error("Attempt to add event listener to non-existent root element");
    }
    const listener = typeof handler === "function" ? handler : handler;
    root.addEventListener(eventName, listener, options);
    const unsubscribe = () => {
      root.removeEventListener(eventName, listener, options);
    };
    this.unsubscribe.push(unsubscribe);
    return unsubscribe;
  }
  subscribeSignal(signal, cb) {
    this.unsubscribe.push(signal.subscribe(cb));
  }
  onUnmounted(cb) {
    return this.addEventListener("graph-component-unmounted", cb);
  }
  unmount() {
    super.unmount();
    this.unsubscribe.forEach((cb) => cb());
    this.ports.forEach((port) => {
      this.context.graph.rootStore.connectionsList.releasePort(port.id, this);
    });
    this.ports.clear();
    this.destroyHitBox();
    this.mounted = false;
    this.dispatchEvent(new CustomEvent("graph-component-unmounted", { detail: { component: this } }));
  }
  setHitBox(minX, minY, maxX, maxY, force) {
    this.hitBox.update(minX, minY, maxX, maxY, force);
  }
  willIterate() {
    super.willIterate();
    if (!this.firstIterate) {
      this.shouldRender = this.isVisible();
    }
  }
  isVisible() {
    if (this.hidden)
      return false;
    return this.context.camera.isRectVisible(...this.getHitBox());
  }
  getHitBoxRect() {
    const [x2, y2, maxX, maxY] = this.getHitBox();
    return { x: x2, y: y2, width: maxX - x2, height: maxY - y2 };
  }
  setVisibility(visible, { removeHitbox }) {
    const hidden = !visible;
    if (this.hidden !== hidden) {
      this.hidden = hidden;
      this.shouldRender = visible;
      if (removeHitbox) {
        if (hidden) {
          this.removeHitBox();
        } else {
          const { x: x2, y: y2, width, height } = this.getHitBoxRect();
          this.setHitBox(x2, y2, x2 + width, y2 + height, true);
        }
      }
      this.performRender();
    }
  }
  setRenderDelegated(delegated) {
    this.setVisibility(!delegated, { removeHitbox: false });
  }
  getHitBox() {
    return this.hitBox.getRect();
  }
  removeHitBox() {
    this.hitBox.remove();
  }
  destroyHitBox() {
    this.hitBox.destroy();
  }
  onHitBox(data) {
    this._lastHitBoxData = data;
    return this.isIterated();
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/anchors/index.js
var Anchor = class _Anchor extends GraphComponent {
  getEntityId() {
    return this.props.id;
  }
  get zIndex() {
    return this.__comp.parent.zIndex + 1;
  }
  constructor(props, parent) {
    super(props, parent);
    this.cursor = "pointer";
    this.shift = 0;
    this.onPositionChanged = () => {
      const { x: x2, y: y2 } = this.getPosition();
      this.setHitBox(x2 - this.shift, y2 - this.shift, x2 + this.shift, y2 + this.shift);
    };
    this.state = { size: props.size, raised: false, selected: false };
    this.connectedState = selectBlockAnchor(this.context.graph, props.blockId, props.id);
    this.connectedState.setViewComponent(this);
    this.addEventListener("click", this);
    this.addEventListener("mouseenter", this);
    this.addEventListener("mousedown", this);
    this.addEventListener("mouseleave", this);
    this.computeRenderSize(this.props.size, this.state.raised);
  }
  getHoverFactor() {
    if (this.context.camera.getCameraBlockScaleLevel() === ECameraScaleLevel.Detailed) {
      return _Anchor.DETAILED_HOVER_FACTOR;
    }
    return _Anchor.CANVAS_HOVER_FACTOR;
  }
  stateChanged(_nextState) {
    if (this.state.size !== _nextState.size) {
      this.computeShift(_nextState, this.props);
      this.onPositionChanged();
    }
    if (this.state.raised !== _nextState.raised) {
      this.computeRenderSize(this.props.size, _nextState.raised);
    }
    super.stateChanged(_nextState);
  }
  propsChanged(_nextProps) {
    if (this.props.lineWidth !== _nextProps.lineWidth) {
      this.computeShift(this.state, _nextProps);
      this.onPositionChanged();
    }
    super.propsChanged(_nextProps);
  }
  willMount() {
    this.props.port.setOwner(this);
    this.subscribeSignal(this.connectedState.$selected, (selected) => {
      this.setState({ selected });
    });
    this.subscribeSignal(this.props.port.$point, this.onPositionChanged);
    this.computeShift(this.state, this.props);
    this.onPositionChanged();
    super.willMount();
  }
  computeShift(state = this.state, props = this.props) {
    this.shift = state.size / 2 + props.lineWidth;
  }
  getPorts() {
    return [this.props.port];
  }
  /**
   * Get the position of the anchor.
   * Returns the position of the anchor in the coordinate system of the graph(ABSOLUTE).
   *
   * Example:
   * ```ts
   * const pos = anchor.getPosition(); // { x: 100, y: 100 }
   * ```
   * port.getPoint is used port.$state.value so you can use this method in signals effect and compute.
   * ```ts
   * computed(() => {
   *   return anchor.getPosition().x + 10; // { x: 110, y: 100 }
   * });
   * ```
   * @returns The position of the anchor in the coordinate system of the graph(ABSOLUTE).
   */
  getPosition() {
    return this.props.port.getPoint();
  }
  toggleSelected() {
    this.connectedState.setSelection(!this.state.selected);
  }
  /**
   * Anchor is draggable only when connection creation is disabled.
   * When connections can be created via anchors, dragging is handled by ConnectionLayer.
   */
  isDraggable() {
    if (this.context.graph.rootStore.settings.getConfigFlag("canCreateNewConnections")) {
      return false;
    }
    return true;
  }
  handleDragStart(context) {
    this.connectedState.block.getViewComponent()?.handleDragStart(context);
  }
  handleDrag(diff, context) {
    this.connectedState.block.getViewComponent()?.handleDrag(diff, context);
  }
  handleDragEnd(context) {
    this.connectedState.block.getViewComponent()?.handleDragEnd(context);
  }
  isVisible() {
    const params = this.getHitBox();
    return params ? this.context.camera.isRectVisible(...params) : true;
  }
  unmount() {
    this.props.port.removeOwner();
    this.connectedState.unsetViewComponent();
    super.unmount();
  }
  handleEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    switch (event.type) {
      case "click": {
        this.toggleSelected();
        break;
      }
      case "mouseenter": {
        this.setState({ raised: true });
        break;
      }
      case "mouseleave": {
        this.setState({ raised: false });
        break;
      }
    }
  }
  computeRenderSize(size, raised) {
    if (raised) {
      this.setState({ size: size * this.getHoverFactor() });
    } else {
      this.setState({ size });
    }
  }
  render() {
    if (this.context.camera.getCameraBlockScaleLevel() === ECameraScaleLevel.Detailed) {
      return;
    }
    const { x: x2, y: y2 } = this.getPosition();
    const ctx = this.context.ctx;
    ctx.fillStyle = this.context.colors.anchor.background;
    ctx.beginPath();
    ctx.arc(x2, y2, this.state.size * 0.5, 0, 2 * Math.PI);
    ctx.fill();
    if (this.state.selected) {
      ctx.strokeStyle = this.context.colors.anchor.selectedBorder;
      ctx.lineWidth = this.props.lineWidth + 3;
      ctx.stroke();
    }
    ctx.closePath();
  }
};
Anchor.CANVAS_HOVER_FACTOR = 1.8;
Anchor.DETAILED_HOVER_FACTOR = 1.2;

// node_modules/@gravity-ui/graph/build/components/canvas/blocks/Block.js
var import_cloneDeep3 = __toESM(require_cloneDeep());
var import_isObject2 = __toESM(require_isObject());

// node_modules/@gravity-ui/graph/build/services/selection/types.js
var ESelectionStrategy;
(function(ESelectionStrategy2) {
  ESelectionStrategy2["REPLACE"] = "replace";
  ESelectionStrategy2["APPEND"] = "add";
  ESelectionStrategy2["SUBTRACT"] = "subtract";
  ESelectionStrategy2["TOGGLE"] = "toggle";
})(ESelectionStrategy || (ESelectionStrategy = {}));

// node_modules/@gravity-ui/graph/build/services/selection/BaseSelectionBucket.js
var BaseSelectionBucket = class {
  /**
   * Check if an entity is a GraphComponent
   */
  isGraphComponent(entity) {
    return typeof entity === "object" && entity !== null && "getEntityId" in entity && typeof entity.getEntityId === "function";
  }
  /**
   * Check if an entity has getViewComponent method
   */
  hasViewComponent(entity) {
    return typeof entity === "object" && entity !== null && "getViewComponent" in entity && typeof entity.getViewComponent === "function";
  }
  constructor(entityType, onSelectionChange = (_payload, defaultAction) => {
    const result = defaultAction();
    return result ?? true;
  }, isRelatedElement, resolver) {
    this.entityType = entityType;
    this.onSelectionChange = onSelectionChange;
    this.isRelatedElement = isRelatedElement;
    this.resolver = resolver;
    this.$selectedIds = y(/* @__PURE__ */ new Set());
    this.$selected = g(() => new Set(this.$selectedIds.value));
    this.$selectedEntities = g(() => {
      if (!this.resolver) {
        return [];
      }
      const ids = Array.from(this.$selectedIds.value);
      return this.resolver(ids);
    });
    this.$selectedComponents = g(() => {
      const entities = this.$selectedEntities.value;
      if (entities.length === 0) {
        return [];
      }
      return entities.map((entity) => {
        if (this.isGraphComponent(entity)) {
          return entity;
        }
        if (this.hasViewComponent(entity)) {
          return entity.getViewComponent();
        }
        return void 0;
      }).filter((component) => component !== void 0);
    });
  }
  /**
   * Attaches the bucket to the manager
   *
   * @param manager {SelectionService} - The manager to attach to
   * @returns void
   */
  attachToManager(manager) {
    manager.registerBucket(this);
    this.manager = manager;
  }
  /**
   * Detaches the bucket from the manager
   * @param manager {SelectionService} - The manager to detach from
   * @returns void
   */
  detachFromManager(manager) {
    manager.unregisterBucket(this);
    this.manager = void 0;
  }
  /**
   * Selects the given ids
   *
   * @param ids {IDType[]} - The ids to select
   * @param strategy {ESelectionStrategy} - The strategy to use
   * @param silent {boolean} - Whether to suppress the selection change event
   * @returns void
   */
  select(ids, strategy = ESelectionStrategy.REPLACE, silent) {
    if (this.manager) {
      this.manager.select(this.entityType, ids, strategy);
    } else {
      this.updateSelection(ids, true, strategy, silent);
    }
  }
  /**
   * Deselects the given ids
   * Passed ids will be deselected with strategy SUBTRACT
   *
   * @param ids {IDType[]} - The ids to deselect
   * @param silent {boolean} - Whether to suppress the selection change event
   * @returns void
   */
  deselect(ids, silent) {
    if (this.manager) {
      this.manager.deselect(this.entityType, ids);
    } else {
      this.updateSelection(ids, false, ESelectionStrategy.SUBTRACT, silent);
    }
  }
  /**
   * Resets the selection
   * All selected ids will be deselected with strategy SUBTRACT
   *
   * @returns void
   */
  reset() {
    const currentSelectedIds = Array.from(this.$selectedIds.value);
    if (currentSelectedIds.length > 0) {
      this.updateSelection(currentSelectedIds, false, ESelectionStrategy.SUBTRACT);
    }
  }
  /**
   * Checks if the given id is selected
   *
   * @param id {IDType} - The id to check
   * @returns boolean
   */
  isSelected(id) {
    return this.$selectedIds.value.has(id);
  }
  /**
   * Applies the selection
   * Generate diff between new and current selected ids and run onSelectionChange callback
   * If silent is true, the nextSelection state will be applied immediately, otherwise it will be applied after the callback is executed and
   *
   * @param newSelectedIds {Set<IDType>} - The new selected ids
   * @param currentSelectedIds {Set<IDType>} - The current selected ids
   * @param silent {boolean} - Whether to suppress the selection change event
   * @returns void
   */
  applySelection(newSelectedIds, currentSelectedIds, silent) {
    const addedIds = [];
    const removedIds = [];
    for (const id of newSelectedIds) {
      if (!currentSelectedIds.has(id)) {
        addedIds.push(id);
      }
    }
    for (const id of currentSelectedIds) {
      if (!newSelectedIds.has(id)) {
        removedIds.push(id);
      }
    }
    if (addedIds.length > 0 || removedIds.length > 0) {
      const payload = {
        list: Array.from(newSelectedIds),
        changes: {
          add: addedIds,
          removed: removedIds
        }
      };
      let callbackUpdated = false;
      const updateSelection = (rewritenIds) => {
        this.$selectedIds.value = rewritenIds ?? newSelectedIds;
        callbackUpdated = true;
      };
      const shouldUpdate = silent || this.onSelectionChange(payload, updateSelection);
      if (shouldUpdate && !callbackUpdated) {
        updateSelection();
      }
    }
  }
};

// node_modules/@gravity-ui/graph/build/services/selection/MultipleSelectionBucket.js
var MultipleSelectionBucket = class extends BaseSelectionBucket {
  updateSelection(ids, select, strategy = ESelectionStrategy.REPLACE, silent) {
    if (!ids.length && strategy !== ESelectionStrategy.REPLACE) {
      return;
    }
    const currentSelectedIds = this.$selectedIds.value;
    const newSelectedIds = new Set(currentSelectedIds);
    switch (strategy) {
      case ESelectionStrategy.REPLACE:
        newSelectedIds.clear();
        if (select) {
          ids.forEach((id) => newSelectedIds.add(id));
        }
        break;
      case ESelectionStrategy.APPEND:
        if (select) {
          ids.forEach((id) => newSelectedIds.add(id));
        }
        break;
      case ESelectionStrategy.SUBTRACT:
        ids.forEach((id) => newSelectedIds.delete(id));
        break;
      case ESelectionStrategy.TOGGLE:
        ids.forEach((id) => {
          if (currentSelectedIds.has(id)) {
            newSelectedIds.delete(id);
          } else if (select) {
            newSelectedIds.add(id);
          }
        });
        break;
    }
    this.applySelection(newSelectedIds, currentSelectedIds, silent);
  }
};

// node_modules/@gravity-ui/graph/build/services/selection/SingleSelectionBucket.js
var SingleSelectionBucket = class extends BaseSelectionBucket {
  updateSelection(ids, select, strategy, silent) {
    if (ids.length === 0) {
      if (strategy === ESelectionStrategy.REPLACE) {
        this.applySelection(/* @__PURE__ */ new Set(), this.$selectedIds.value, silent);
      }
      return;
    }
    const currentSelectedIds = this.$selectedIds.value;
    const newSelectedIds = /* @__PURE__ */ new Set();
    const firstId = ids[0];
    if (select && (strategy === ESelectionStrategy.REPLACE || strategy === ESelectionStrategy.TOGGLE || strategy === ESelectionStrategy.APPEND)) {
      if (currentSelectedIds.has(firstId)) {
        return;
      }
      newSelectedIds.add(firstId);
    } else if (!select || strategy === ESelectionStrategy.SUBTRACT) {
      if (ids.some((id) => currentSelectedIds.has(id))) {
        newSelectedIds.clear();
      } else {
        return;
      }
    }
    this.applySelection(newSelectedIds, currentSelectedIds, silent);
  }
};

// node_modules/@gravity-ui/graph/build/services/selection/SelectionService.js
var SelectionService = class {
  constructor() {
    this.buckets = y(/* @__PURE__ */ new Map());
    this.$selection = g(() => {
      const result = /* @__PURE__ */ new Map();
      for (const [type, bucket] of this.buckets.value.entries()) {
        result.set(type, bucket.$selected.value);
      }
      return result;
    });
    this.$selectedEntities = g(() => {
      const result = [];
      for (const bucket of this.buckets.value.values()) {
        const entities = bucket.$selectedEntities.value;
        result.push(...entities);
      }
      return result;
    });
    this.$selectedComponents = g(() => {
      const result = [];
      for (const bucket of this.buckets.value.values()) {
        const entities = bucket.$selectedEntities.value;
        for (const entity of entities) {
          if (entity instanceof GraphComponent) {
            result.push(entity);
          } else {
            const component = entity.getViewComponent();
            if (component) {
              result.push(component);
            }
          }
        }
      }
      return result;
    });
  }
  /**
   * Registers a selection bucket for a specific entity type
   * @param bucket The selection bucket to register
   * @returns void
   */
  registerBucket(bucket) {
    if (this.buckets.value.has(bucket.entityType)) {
      throw new Error(`Selection bucket for entityType '${bucket.entityType}' is already registered`);
    }
    const newMap = new Map(this.buckets.value);
    newMap.set(bucket.entityType, bucket);
    this.buckets.value = newMap;
  }
  /**
   * Unregisters a selection bucket for a specific entity type
   *
   * @param bucket The selection bucket to unregister
   * @returns void
   */
  unregisterBucket(bucket) {
    const newMap = new Map(this.buckets.value);
    newMap.delete(bucket.entityType);
    this.buckets.value = newMap;
  }
  /**
   * Retrieves the selection bucket for a specific entity type
   *
   * @param entityType The entity type to get the bucket for
   * @returns {ISelectionBucket | undefined} The selection bucket or undefined if not found
   */
  getBucket(entityType) {
    return this.buckets.value.get(entityType);
  }
  getBucketByElement(element) {
    return Array.from(this.buckets.value.values()).find((bucket) => bucket.isRelatedElement?.(element));
  }
  selectRelatedElements(elements, strategy) {
    const result = elements.reduce((acc, element) => {
      const bucket = this.getBucketByElement(element);
      const id = element.getEntityId();
      if (bucket) {
        if (!acc[bucket.entityType]) {
          acc[bucket.entityType] = [];
        }
        acc[bucket.entityType].push(id);
      }
      return acc;
    }, {});
    this.select(result, strategy);
  }
  /**
   * Selects entities using either single-type or multi-type selection API
   *
   * @param entityTypeOrSelection Either a single entity type or multi-entity selection object
   * @param idsOrStrategy Either array of IDs or selection strategy
   * @param strategy The selection strategy to apply (optional when using multi-entity API)
   * @returns void
   */
  select(entityTypeOrSelection, idsOrStrategy, strategy) {
    n(() => {
      if (typeof entityTypeOrSelection === "string") {
        const entityType = entityTypeOrSelection;
        const ids = idsOrStrategy;
        const finalStrategy = strategy || ESelectionStrategy.REPLACE;
        if (finalStrategy === ESelectionStrategy.REPLACE) {
          for (const [type, bucket2] of this.buckets.value.entries()) {
            if (type !== entityType) {
              bucket2.reset();
            }
          }
        }
        const bucket = this.getBucket(entityType);
        if (bucket) {
          bucket.updateSelection(ids, true, finalStrategy);
        }
      } else {
        const selection = entityTypeOrSelection;
        const finalStrategy = idsOrStrategy;
        if (finalStrategy === ESelectionStrategy.REPLACE) {
          const selectedTypes = Object.keys(selection);
          for (const [type, bucket] of this.buckets.value.entries()) {
            if (!selectedTypes.includes(type)) {
              bucket.reset();
            }
          }
        }
        for (const [entityType, ids] of Object.entries(selection)) {
          const bucket = this.getBucket(entityType);
          if (bucket) {
            if (finalStrategy === ESelectionStrategy.REPLACE) {
              bucket.updateSelection(ids, true, ESelectionStrategy.REPLACE);
            } else {
              const currentIds = bucket.$selected.value;
              const newIds = new Set(currentIds);
              if (finalStrategy === ESelectionStrategy.APPEND) {
                ids.forEach((id) => newIds.add(id));
              } else if (finalStrategy === ESelectionStrategy.SUBTRACT) {
                ids.forEach((id) => newIds.delete(id));
              }
              bucket.updateSelection(Array.from(newIds), true, ESelectionStrategy.REPLACE);
            }
          }
        }
      }
    });
  }
  /**
   * Deselects entities using either single-type or multi-type deselection API
   *
   * @param entityTypeOrSelection Either a single entity type or multi-entity selection object
   * @param ids Array of IDs to deselect
   * @returns void
   */
  deselect(entityTypeOrSelection, ids) {
    n(() => {
      if (typeof entityTypeOrSelection === "string") {
        const entityType = entityTypeOrSelection;
        const finalIds = ids || [];
        const bucket = this.getBucket(entityType);
        if (bucket) {
          bucket.updateSelection(finalIds, false, ESelectionStrategy.SUBTRACT);
        }
      } else {
        const selection = entityTypeOrSelection;
        for (const [entityType, entityIds] of Object.entries(selection)) {
          const bucket = this.getBucket(entityType);
          if (bucket) {
            const currentIds = bucket.$selected.value;
            const newIds = new Set(currentIds);
            entityIds.forEach((id) => newIds.delete(id));
            bucket.updateSelection(Array.from(newIds), true, ESelectionStrategy.REPLACE);
          }
        }
      }
    });
  }
  /**
   * Checks selection status for single entity or multiple entities
   * @param entityTypeOrQueries Either entity type or multi-entity queries
   * @param id ID of entity to check (only used for single entity API)
   * @returns Selection status
   */
  isSelected(entityTypeOrQueries, id) {
    if (typeof entityTypeOrQueries === "string") {
      const entityType = entityTypeOrQueries;
      if (!id) {
        throw new Error(`id must be provided for single entity selection: ${entityType}`);
      }
      const finalId = id;
      const bucket = this.getBucket(entityType);
      return bucket ? bucket.isSelected(finalId) : false;
    } else {
      const queries = entityTypeOrQueries;
      const results = {};
      for (const [entityType, ids] of Object.entries(queries)) {
        const bucket = this.getBucket(entityType);
        if (bucket) {
          results[entityType] = ids.some((id2) => bucket.isSelected(id2));
        } else {
          results[entityType] = false;
        }
      }
      return results;
    }
  }
  /**
   * Resets the selection for single entity type or multiple entity types
   * @param entityTypeOrTypes Either single entity type or array of entity types
   */
  resetSelection(entityTypeOrTypes) {
    n(() => {
      if (typeof entityTypeOrTypes === "string") {
        const bucket = this.getBucket(entityTypeOrTypes);
        if (bucket) {
          bucket.reset();
        }
      } else {
        for (const entityType of entityTypeOrTypes) {
          const bucket = this.getBucket(entityType);
          if (bucket) {
            bucket.reset();
          }
        }
      }
    });
  }
  /**
   * Resets the selection for all registered buckets
   */
  resetAllSelections() {
    n(() => {
      for (const bucket of this.buckets.value.values()) {
        bucket.reset();
      }
    });
  }
};

// node_modules/@gravity-ui/graph/build/store/anchor/Anchor.js
var EAnchorType;
(function(EAnchorType2) {
  EAnchorType2["IN"] = "IN";
  EAnchorType2["OUT"] = "OUT";
})(EAnchorType || (EAnchorType = {}));
var AnchorState = class {
  get id() {
    return this.$state.value.id;
  }
  get blockId() {
    return this.$state.value.blockId;
  }
  get state() {
    return this.$state.value;
  }
  constructor(block, anchor) {
    this.block = block;
    this.$state = y(void 0);
    this.$selected = g(() => this.block.store.anchorSelectionBucket.isSelected(this.id));
    this.$viewComponentReady = y(false);
    this.$state.value = anchor;
  }
  update(anchor) {
    this.$state.value = anchor;
  }
  setSelection(selected) {
    this.block.onAnchorSelected(this.id, selected);
  }
  setViewComponent(anchorComponent) {
    this.anchorView = anchorComponent;
    this.$viewComponentReady.value = true;
  }
  unsetViewComponent() {
    this.anchorView = void 0;
    this.$viewComponentReady.value = false;
  }
  getViewComponent() {
    return this.anchorView;
  }
  asTAnchor() {
    return this.$state.value;
  }
};

// node_modules/@gravity-ui/graph/build/store/block/Block.js
var import_cloneDeep2 = __toESM(require_cloneDeep());
var IS_BLOCK_TYPE = "Block";
var BlockState = class _BlockState {
  static fromTBlock(store, block) {
    return new _BlockState(store, block, store.blockSelectionBucket);
  }
  /**
   * Block id
   */
  get id() {
    return this.$state.value.id;
  }
  /**
   * Block x position
   */
  get x() {
    return this.$state.value.x;
  }
  /**
   * Block y position
   */
  get y() {
    return this.$state.value.y;
  }
  /**
   * Block width
   */
  get width() {
    return this.$state.value.width;
  }
  /**
   * Block height
   */
  get height() {
    return this.$state.value.height;
  }
  /**
   * Block selected
   */
  get selected() {
    return this.$selected.value;
  }
  constructor(store, block, blockSelectionBucket) {
    this.store = store;
    this.blockSelectionBucket = blockSelectionBucket;
    this.$rawState = y(void 0);
    this.$state = g(() => ({
      ...this.$rawState.value,
      selected: this.$selected.value
    }));
    this.$selected = g(() => this.blockSelectionBucket.isSelected(this.$rawState.value.id));
    this.$anchorStates = y([]);
    this.$geometry = g(() => {
      const state = this.$state.value;
      return {
        x: state.x | 0,
        y: state.y | 0,
        width: state.width,
        height: state.height
      };
    });
    this.$anchorIndexs = g(() => {
      const typeIndex = {};
      return new Map(this.$anchorStates.value?.sort((a2, b2) => (a2.state.index || 0) - (b2.state.index || 0)).map((anchorState) => {
        if (!typeIndex[anchorState.state.type]) {
          typeIndex[anchorState.state.type] = 0;
        }
        return [anchorState.id, typeIndex[anchorState.state.type]++];
      }) || []);
    });
    this.$anchors = g(() => {
      return this.$anchorStates.value?.map((anchorState) => anchorState.asTAnchor()) || [];
    });
    this.$selectedAnchors = g(() => {
      return this.$anchorStates.value?.filter((anchorState) => this.store.anchorSelectionBucket.$selected.value.has(anchorState.id)) || [];
    });
    this.$viewComponent = y(void 0);
    this.$hidden = y(false);
    this.$rawState.value = block;
    this.$anchorStates.value = block.anchors?.map((anchor) => new AnchorState(this, anchor)) ?? [];
  }
  onAnchorSelected(anchorId, selected) {
    this.store.setAnchorSelection(this.id, anchorId, selected);
  }
  setSelection(selected, strategy = ESelectionStrategy.REPLACE) {
    this.store.updateBlocksSelection([this.id], selected, strategy);
  }
  getSelectedAnchor() {
    return this.$selectedAnchors.value[0];
  }
  getAnchorState(id) {
    return this.$anchorStates.value.find((state) => state.id === id);
  }
  updateXY(x2, y2, forceUpdate = false) {
    this.store.updatePosition(this.id, { x: x2, y: y2 });
    if (forceUpdate) {
      this.$viewComponent.value?.updatePosition(x2, y2, true);
    }
  }
  setViewComponent(blockComponent) {
    this.$viewComponent.value = blockComponent;
    if (this.pendingHidden !== void 0) {
      blockComponent.setHiddenBlock(this.pendingHidden);
      this.pendingHidden = void 0;
    }
  }
  /**
   * Request to hide or show this block's canvas component.
   * Safe to call before the canvas component is mounted — the request is
   * deferred and applied automatically in setViewComponent().
   */
  requestHidden(hidden) {
    this.$hidden.value = hidden;
    const canvasBlock = this.getViewComponent();
    if (canvasBlock) {
      canvasBlock.setHiddenBlock(hidden);
    } else {
      this.pendingHidden = hidden;
    }
  }
  getViewComponent() {
    return this.$viewComponent.value;
  }
  getConnections() {
    return this.store.getBlockConnections(this.id);
  }
  clearAnchorsSelection() {
    this.store.anchorSelectionBucket.reset();
  }
  setName(newName) {
    this.$rawState.value = {
      ...this.$rawState.value,
      name: newName
    };
  }
  updateAnchors(anchors) {
    const anchorsMap = new Map(this.$anchorStates.value.map((a2) => [a2.id, a2]));
    this.$anchorStates.value = anchors.map((anchor) => {
      if (anchorsMap.has(anchor.id)) {
        const anchorState = anchorsMap.get(anchor.id);
        anchorState.update(anchor);
        return anchorState;
      }
      return new AnchorState(this, anchor);
    });
  }
  /**
   * Updates block state
   *
   * @param block {Partial<TBlock>} Block to update
   * @returns void
   */
  updateBlock(block) {
    if (block.anchors) {
      this.updateAnchors(block.anchors);
    }
    this.$rawState.value = Object.assign({}, this.$rawState.value, block);
    this.getViewComponent()?.updateHitBox(this.$geometry.value, true);
  }
  getAnchorById(anchorId) {
    return this.$anchorStates.value.find((anchor) => anchor.id === anchorId);
  }
  /**
   * Converts the block state to a TBlock
   *
   * @returns {TBlock} TBlock
   */
  asTBlock() {
    return (0, import_cloneDeep2.default)({
      ...this.$rawState.toJSON(),
      selected: this.$selected.value
    });
  }
  /**
   * Cheap snapshot for graph events (e.g. `block-change`): one object spread, no deep clone.
   * Nested values (`anchors`, `meta`, `settings`, …) are shared with the live store — treat as read-only.
   */
  asTBlockShallow() {
    return {
      ...this.$rawState.value,
      selected: this.$selected.value
    };
  }
};

// node_modules/@gravity-ui/graph/build/store/connection/port/utils.js
var createBlockPointPortId = (blockId, isInput = false) => {
  return `${String(blockId)}_${isInput ? "input" : "output"}`;
};
var createAnchorPortId = (blockId, anchorId) => {
  return `${String(blockId)}/${anchorId}`;
};
var createPortId = (blockId, anchorId, isInput = false) => {
  if (anchorId) {
    return `${String(blockId)}/${anchorId}`;
  } else {
    return `${String(blockId)}_${isInput ? "input" : "output"}`;
  }
};

// node_modules/@gravity-ui/graph/build/utils/functions/text.js
var import_memoize = __toESM(require_memoize());
function getFontSize(fontSize, scale) {
  return fontSize / scale | 0;
}
function canvasContextGetter() {
  const canvas = document.createElement("canvas");
  return canvas.getContext("2d");
}
var getCanvasContext = (0, import_memoize.default)(canvasContextGetter, () => "canvasContext");
var mapTextToMeasures = /* @__PURE__ */ new Map();
function measureText(text, font, approximate = true) {
  const context = getCanvasContext();
  context.font = font;
  if (!approximate) {
    return Math.floor(context.measureText(text).width + 1);
  }
  const key = `${text}-${font}`;
  if (!mapTextToMeasures.has(key)) {
    mapTextToMeasures.set(key, Math.floor(context.measureText(text).width + 1));
  }
  return mapTextToMeasures.get(key);
}
function sliceAt(string, index) {
  return [string.slice(0, index), string.slice(index)];
}
function notEmptyLine(line) {
  return line.width > 0 && line.text.length > 0;
}
function wrapLines(text, { lineHeight, measureText: measureText2, maxWidth = Number(Infinity), maxHeight = Number(Infinity), wordWrap = true }) {
  let lines = [];
  if (!text) {
    return lines;
  }
  if (!wordWrap) {
    lines = [{ text, width: measureText2(text) }];
    return lines;
  }
  const words = text.trim().split(/\s+/);
  const SPACE = " ";
  const MAX_ITERATIONS = 1e3;
  const spaceWidth = measureText2(SPACE);
  let currentLine = "";
  let currentLineWidth = 0;
  let nextWordWidth;
  let nextWidth;
  let totalHeight = 0;
  const lineBreak = () => {
    const text2 = currentLine.trim();
    const width = text2.length > 0 ? currentLineWidth - spaceWidth : 0;
    lines.push({ text: text2, width });
    currentLine = "";
    currentLineWidth = 0;
    totalHeight += lineHeight;
  };
  const stack = words.slice().reverse();
  let nextWord;
  let iterations = 0;
  while (iterations < MAX_ITERATIONS && stack.length > 0 && totalHeight + lineHeight <= maxHeight) {
    iterations++;
    nextWord = stack.pop();
    nextWordWidth = measureText2(nextWord);
    nextWidth = currentLineWidth + spaceWidth + nextWordWidth;
    if (nextWidth <= maxWidth) {
      currentLine += SPACE + nextWord;
      currentLineWidth = nextWidth;
      continue;
    }
    if (currentLineWidth > 0) {
      stack.push(nextWord);
      lineBreak();
    } else {
      let parts = [nextWord, ""];
      let breakAt = nextWord.length - 1;
      while (breakAt > 0 && nextWordWidth > maxWidth) {
        parts = sliceAt(nextWord, breakAt);
        breakAt--;
        nextWordWidth = measureText2(parts[0]);
      }
      currentLine = parts[0];
      currentLineWidth = nextWordWidth;
      lineBreak();
      stack.push(parts[1]);
    }
  }
  if (currentLineWidth && totalHeight + lineHeight <= maxHeight) {
    lineBreak();
  }
  return lines.filter(notEmptyLine);
}
function measureMultilineText(text, font = "12px", { lineHeight, wordWrap = false, maxWidth = Infinity, maxHeight = Infinity }) {
  const boundMeasureText = (text2) => measureText(text2, font);
  lineHeight = lineHeight || parseInt(font.replace(/\D/gi, ""), 10);
  const lines = wrapLines(text, {
    measureText: boundMeasureText,
    lineHeight: lineHeight || parseInt(font.replace(/\D/gi, ""), 10),
    wordWrap,
    maxWidth,
    maxHeight
  });
  let maxLineWidth = 0;
  const linesWords = [];
  const linesWidths = [];
  for (let i2 = 0; i2 < lines.length; i2++) {
    linesWords.push(lines[i2].text);
    linesWidths.push(lines[i2].width);
    maxLineWidth = Math.max(maxLineWidth, lines[i2].width);
  }
  return {
    width: maxLineWidth,
    height: Math.min(Math.floor(linesWords.length * lineHeight + lineHeight * 0.3), maxHeight),
    lineHeight,
    linesWords,
    linesWidths
  };
}

// node_modules/@gravity-ui/graph/build/utils/renderers/text.js
var cache2 = /* @__PURE__ */ new Map();
var getMeasureKey = (value, params) => {
  return `${value}/${params.font}/${params.maxWidth}/${params.maxHeight}/${params.wordWrap}/${params.lineHeight}`;
};
function clearTextCache() {
  cache2.clear();
}
function cachedMeasureText(text, params) {
  const key = getMeasureKey(text, params);
  if (!cache2.has(key)) {
    cache2.set(key, measureMultilineText(text, params.font, params));
  }
  return cache2.get(key);
}
function layoutText(text, ctx, rect, params) {
  let x2 = rect.x;
  switch (ctx.textAlign) {
    case "center": {
      x2 = rect.x + (rect.width || 0) / 2;
      break;
    }
    case "right":
    case "end": {
      x2 = rect.x + rect.width || 0;
      break;
    }
  }
  ctx.textBaseline = "top";
  let y2 = rect.y;
  ctx.font = params.font;
  const lineHeight = params.lineHeight || parseInt(params.font.replace(/\D/gi, ""), 10);
  const measures = cachedMeasureText(text, {
    wordWrap: true,
    maxWidth: rect.width,
    maxHeight: rect.height,
    ...params
  });
  const lines = [];
  for (const line of measures.linesWords) {
    lines.push([line, x2, y2]);
    y2 += lineHeight;
    if (rect.height && y2 > rect.y + rect.height - lineHeight) {
      break;
    }
  }
  return {
    measures,
    lines,
    lineHeight
  };
}
function renderText(text, ctx, rect, params) {
  const { lines, measures } = layoutText(text, ctx, rect, params);
  for (const [line, x2, y2] of lines) {
    ctx.fillText(line, x2, y2);
  }
  return measures;
}

// node_modules/@gravity-ui/graph/build/components/canvas/blocks/Block.js
function isTBlock(block) {
  return (0, import_isObject2.default)(block);
}
var Block = class extends GraphComponent {
  currentState() {
    return this.connectedState.$state.value;
  }
  constructor(props, parent) {
    super(props, parent);
    this.cursor = "pointer";
    this.isBlock = true;
    this.connectedStateUnsubscribers = [];
    this.startDragCoords = [];
    this.blockHidden = false;
    this.$viewState = y({ zIndex: 0, order: 0 });
    this.handleClick = (event) => {
      event.stopPropagation();
      this.handleSelectionChange(event);
    };
    this.handleSelectionChange = (event) => {
      this.connectedState.setSelection(!isMetaKeyEvent(event) ? true : !this.connectedState.selected, !isMetaKeyEvent(event) ? ESelectionStrategy.REPLACE : ESelectionStrategy.APPEND);
    };
    this.updateHitBox = (geometry, force) => {
      if (this.blockHidden)
        return;
      this.setHitBox(geometry.x, geometry.y, geometry.x + geometry.width, geometry.y + geometry.height, force);
    };
    this.subscribe(props.id);
  }
  getEntityId() {
    return this.props.id;
  }
  isRendered() {
    return this.shouldRender;
  }
  updateViewState(params) {
    let hasChanges = false;
    for (const [key, value] of Object.entries(params)) {
      if (this.$viewState.value[key] !== value) {
        hasChanges = true;
        break;
      }
    }
    if (!hasChanges) {
      return;
    }
    this.$viewState.value = {
      ...this.$viewState.value,
      ...params
    };
  }
  getGeometry() {
    return {
      x: this.state.x,
      y: this.state.y,
      width: this.state.width,
      height: this.state.height
    };
  }
  getHitBoxRect() {
    return this.connectedState.$geometry.value;
  }
  isVisible() {
    if (this.blockHidden)
      return false;
    return super.isVisible();
  }
  getConfigFlag(flagPath) {
    return this.context.graph.rootStore.settings.getConfigFlag(flagPath);
  }
  subscribe(id) {
    this.connectedStateUnsubscribers.forEach((unsub) => unsub());
    this.connectedStateUnsubscribers = [];
    this.connectedState = selectBlockById(this.context.graph, id);
    this.state = (0, import_cloneDeep3.default)(this.connectedState.$state.value);
    this.connectedState.setViewComponent(this);
    this.setState({
      ...this.connectedState.$state.value,
      anchors: this.connectedState.$anchors.value
    });
    this.updateViewState({
      zIndex: this.zIndex,
      order: this.renderOrder
    });
    this.connectedStateUnsubscribers = [
      this.connectedState.$anchors.subscribe(() => {
        this.setState({
          anchors: this.connectedState.$anchors.value
        });
        this.shouldUpdateChildren = true;
      }),
      this.connectedState.$state.subscribe(() => {
        this.setState({
          ...this.connectedState.$state.value,
          anchors: this.connectedState.$anchors.value
        });
        this.updateHitBox(this.connectedState.$geometry.value);
        if (!this.blockHidden) {
          this.updatePortPositions();
        }
      })
    ];
  }
  propsChanged(nextProps) {
    const nextBlockState = this.context.graph.rootStore.blocksList.$blocksMap.value.get(nextProps.id);
    if (nextBlockState && nextBlockState !== this.connectedState) {
      this.subscribe(nextProps.id);
    }
    super.propsChanged(nextProps);
  }
  getNextState() {
    return this.__data.nextState || this.state;
  }
  didIterate() {
    if (this.$viewState.value.zIndex !== this.zIndex || this.$viewState.value.order !== this.renderOrder) {
      this.updateViewState({
        zIndex: this.zIndex,
        order: this.renderOrder
      });
    }
  }
  willMount() {
    this.addEventListener("click", this.handleClick);
  }
  calcZIndex() {
    const raised = this.connectedState.$selected.value || this.lastDragEvent ? 1 : 0;
    return this.context.constants.block.DEFAULT_Z_INDEX + raised;
  }
  raiseBlock() {
    this.zIndex = this.calcZIndex();
    this.performRender();
  }
  stateChanged(nextState) {
    if (!this.firstRender && nextState.selected !== this.state.selected) {
      this.raiseBlock();
    }
    return super.stateChanged(nextState);
  }
  getRenderIndex() {
    return this.renderOrder;
  }
  updatePosition(x2, y2, silent = false) {
    if (!silent) {
      this.connectedState.updateXY(x2, y2);
    }
    this.setState({ x: x2, y: y2 });
    this.updatePortPositions();
  }
  updatePortPositions() {
    if (this.blockHidden) {
      return;
    }
    const inputPoint = this.getConnectionPoint("in");
    this.getInputPort().setPoint(inputPoint.x, inputPoint.y);
    const outputPoint = this.getConnectionPoint("out");
    this.getOutputPort().setPoint(outputPoint.x, outputPoint.y);
    this.connectedState.$anchors.value.forEach((anchor) => {
      const port = this.getAnchorPort(anchor.id);
      if (port) {
        const anchorPoint = this.getConnectionAnchorPosition(anchor);
        port.setPoint(anchorPoint.x, anchorPoint.y);
      }
    });
  }
  getInputPort() {
    return this.getPort(createBlockPointPortId(this.state.id, true));
  }
  getOutputPort() {
    return this.getPort(createBlockPointPortId(this.state.id, false));
  }
  getAnchorPort(anchorId) {
    return this.getPort(createAnchorPortId(this.state.id, anchorId));
  }
  /**
   * Check if block can be dragged based on canDrag setting
   */
  isDraggable() {
    const canDrag = this.context.graph.rootStore.settings.$canDrag.value;
    return isAllowDrag(canDrag, this.connectedState.$selected.value);
  }
  /**
   * Handle drag start - emit event and initialize drag state
   */
  handleDragStart(context) {
    this.context.graph.execut\u0435DefaultEventAction("block-drag-start", {
      nativeEvent: context.sourceEvent,
      block: this.connectedState.asTBlock()
    }, () => {
      this.lastDragEvent = context.sourceEvent;
      this.startDragCoords = [...context.startCoords, this.state.x, this.state.y];
      this.raiseBlock();
    });
  }
  /**
   * Handle drag update - calculate new position and update block
   */
  handleDrag(diff, context) {
    if (!this.startDragCoords.length)
      return;
    this.lastDragEvent = context.sourceEvent;
    const [x2, y2] = this.calcNextDragPosition(context.currentCoords[0], context.currentCoords[1]);
    this.context.graph.execut\u0435DefaultEventAction("block-drag", {
      nativeEvent: context.sourceEvent,
      block: this.connectedState.asTBlock(),
      x: x2,
      y: y2
    }, () => this.applyNextPosition(x2, y2));
  }
  /**
   * Handle drag end - finalize drag state
   */
  handleDragEnd(context) {
    if (!this.startDragCoords.length)
      return;
    this.context.graph.emit("block-drag-end", {
      nativeEvent: context.sourceEvent,
      block: this.connectedState.asTBlock()
    });
    this.lastDragEvent = void 0;
    this.startDragCoords = [];
    this.updateHitBox(this.state);
  }
  calcNextDragPosition(x2, y2) {
    const diffX = x2 - this.startDragCoords[0] | 0;
    const diffY = y2 - this.startDragCoords[1] | 0;
    let nextX = this.startDragCoords[2] + diffX;
    let nextY = this.startDragCoords[3] + diffY;
    const spanGridSize = this.context.constants.block.SNAPPING_GRID_SIZE;
    if (spanGridSize > 1) {
      nextX = Math.round(nextX / spanGridSize) * spanGridSize;
      nextY = Math.round(nextY / spanGridSize) * spanGridSize;
    }
    return [nextX, nextY];
  }
  applyNextPosition(x2, y2) {
    this.updatePosition(x2, y2);
  }
  /* Calculate the position of the anchor based on the absolute position of the block. */
  getConnectionAnchorPosition(anchor) {
    const { x: x2, y: y2 } = this.getAnchorPosition(anchor);
    return {
      x: x2 + this.connectedState.x,
      y: y2 + this.connectedState.y
    };
  }
  /* Calculate the position of the anchors relative to the block container. */
  getAnchorPosition(anchor) {
    const index = this.connectedState.$anchorIndexs.value?.get(anchor.id) || 0;
    const offset = this.context.constants.block.HEAD_HEIGHT + this.context.constants.block.BODY_PADDING;
    return {
      x: anchor.type === EAnchorType.OUT ? this.connectedState.width : 0,
      y: offset + index * this.context.constants.system.GRID_SIZE * 2
    };
  }
  getConnectionPoint(direction) {
    return {
      x: this.connectedState.x + (direction === "out" ? this.connectedState.width : 0),
      y: this.connectedState.y + this.connectedState.height / 2 | 0
    };
  }
  renderAnchor(anchor) {
    return Anchor.create({
      ...anchor,
      zIndex: this.zIndex,
      size: 18,
      lineWidth: 2,
      port: this.getAnchorPort(anchor.id)
    }, {
      key: anchor.id
    });
  }
  isAnchorsAllowed() {
    return Array.isArray(this.state.anchors) && this.state.anchors.length && this.getConfigFlag("useBlocksAnchors");
  }
  updateChildren() {
    if (!this.isAnchorsAllowed()) {
      return void 0;
    }
    return this.state.anchors.map((anchor) => {
      return this.renderAnchor(anchor);
    });
  }
  willRender() {
    super.willRender();
    const scale = this.context.camera.getCameraScale();
    this.shouldRenderText = scale > this.context.constants.block.SCALES[0];
  }
  renderStroke(color) {
    const lineWidth = clamp(this.context.camera.getRelative(this.context.constants.block.BORDER_WIDTH), this.context.constants.block.BORDER_WIDTH, 10);
    this.context.ctx.lineWidth = lineWidth;
    this.context.ctx.strokeStyle = color;
    this.context.ctx.strokeRect(this.state.x + lineWidth / 2, this.state.y + lineWidth / 2, this.state.width - lineWidth, this.state.height - lineWidth);
  }
  /* Returns rect of block size with padding */
  getContentRect() {
    return {
      x: this.state.x + this.context.constants.text.PADDING,
      y: this.state.y + this.context.constants.text.PADDING,
      height: this.state.height - this.context.constants.text.PADDING * 2,
      width: this.state.width - this.context.constants.text.PADDING * 2
    };
  }
  renderText(text, ctx = this.context.ctx, { rect, renderParams } = {
    rect: this.getContentRect(),
    renderParams: { font: this.props.font }
  }) {
    renderText(text, ctx, rect, renderParams);
  }
  renderMinimalisticBlock(ctx) {
    this.renderSchematicView(ctx);
  }
  renderBody(ctx) {
    ctx.fillStyle = this.context.colors.block.background;
    ctx.strokeStyle = this.context.colors.block.border;
    ctx.fillRect(this.state.x, this.state.y, this.state.width, this.state.height);
    this.renderStroke(this.state.selected ? this.context.colors.block.selectedBorder : this.context.colors.block.border);
  }
  renderSchematicView(ctx) {
    this.renderBody(ctx);
    if (this.shouldRenderText) {
      ctx.fillStyle = this.context.colors.block.text;
      ctx.textAlign = "center";
      this.renderText(this.state.name, ctx);
    }
  }
  setHiddenBlock(hidden) {
    const wasBlockHidden = this.blockHidden;
    this.blockHidden = hidden;
    if (hidden) {
      this.removeHitBox();
      this.shouldRender = false;
    } else {
      const { x: x2, y: y2, width, height } = this.getHitBoxRect();
      this.setHitBox(x2, y2, x2 + width, y2 + height, true);
      if (wasBlockHidden && !this.hidden) {
        this.updatePortPositions();
      }
    }
    this.performRender();
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  renderDetailedView(ctx) {
    return this.renderBody(ctx);
  }
  render() {
    const scaleLevel = this.context.graph.cameraService.getCameraBlockScaleLevel();
    switch (scaleLevel) {
      case ECameraScaleLevel.Minimalistic: {
        this.renderMinimalisticBlock(this.context.ctx);
        break;
      }
      case ECameraScaleLevel.Schematic: {
        this.renderSchematicView(this.context.ctx);
        break;
      }
      case ECameraScaleLevel.Detailed: {
        this.renderDetailedView(this.context.ctx);
        break;
      }
    }
  }
  unmount() {
    this.connectedStateUnsubscribers.forEach((unsub) => unsub());
    this.connectedStateUnsubscribers = [];
    const connectionsList = this.context.graph.rootStore.connectionsList;
    connectionsList.releasePort(createBlockPointPortId(this.state.id, true), this);
    connectionsList.releasePort(createBlockPointPortId(this.state.id, false), this);
    this.state.anchors.forEach((anchor) => {
      connectionsList.releasePort(createAnchorPortId(this.state.id, anchor.id), this);
    });
    super.unmount();
  }
};
Block.IS = IS_BLOCK_TYPE;

// node_modules/@gravity-ui/graph/build/store/connection/selectors.js
function selectConnectionById(graph, id) {
  return graph.rootStore.connectionsList.$connectionsMap.value.get(id);
}

// node_modules/@gravity-ui/graph/build/components/canvas/connections/BaseConnection.js
var BaseConnection = class extends GraphComponent {
  /**
   * @deprecated use port system instead
   */
  get sourceBlock() {
    return this.connectedState.$sourcePortState.value.component;
  }
  /**
   * @deprecated use port system instead
   */
  get targetBlock() {
    return this.connectedState.$targetPortState.value.component;
  }
  /**
   * @deprecated use port system instead
   */
  get sourceAnchor() {
    return this.sourceBlock.connectedState.getAnchorById(this.connectedState.sourceAnchorId)?.asTAnchor();
  }
  /**
   * @deprecated use port system instead
   */
  get targetAnchor() {
    return this.targetBlock.connectedState.getAnchorById(this.connectedState.targetAnchorId)?.asTAnchor();
  }
  constructor(props, parent) {
    super(props, parent);
    this.debounceHover = debounce((hovered) => {
      this.onHoverChange(hovered);
    }, {
      priority: ESchedulerPriority.LOWEST,
      frameInterval: 3,
      frameTimeout: 0
    });
    this.updateHitBox = () => {
      const { x: x2, y: y2, width, height } = this.getHitBoxRect();
      const threshold = this.context.constants.connection.THRESHOLD_LINE_HIT;
      this.setHitBox(x2 - threshold, y2 - threshold, x2 + width + threshold, y2 + height + threshold);
    };
    this.connectedState = selectConnectionById(this.context.graph, this.props.id);
    this.connectedState.setViewComponent(this);
    this.connectedState.$sourcePortState.value.addObserver(this);
    this.connectedState.$targetPortState.value.addObserver(this);
    this.setState({ ...this.connectedState.$state.value, hovered: false });
  }
  getEntityId() {
    return this.props.id;
  }
  willMount() {
    this.subscribeSignal(this.connectedState.$selected, (selected) => {
      this.setState({ selected });
    });
    this.subscribeSignal(this.connectedState.$state, (state) => {
      this.setState({ ...state });
    });
    this.subscribeSignal(this.connectedState.$geometry, () => {
      this.updatePoints();
    });
    this.subscribeSignal(this.connectedState.$hidden, () => {
      this.performRender();
    });
    this.listenEvents(["mouseenter", "mouseleave"]);
  }
  isVisible() {
    if (this.connectedState.$hidden.value)
      return false;
    return super.isVisible();
  }
  handleEvent(event) {
    event.stopPropagation();
    super.handleEvent(event);
    switch (event.type) {
      case "mouseenter":
        this.debounceHover(true);
        break;
      case "mouseleave":
        this.debounceHover(false);
        break;
    }
  }
  onHoverChange(hoverState) {
    if (hoverState === this.state.hovered) {
      return;
    }
    this.setState({ hovered: hoverState });
  }
  unmount() {
    this.connectedState.$sourcePortState.value.removeObserver(this);
    this.connectedState.$targetPortState.value.removeObserver(this);
    super.unmount();
  }
  /**
   * Updates connection points based on current port positions
   * Called automatically when port geometry changes
   *
   * This method:
   * 1. Retrieves current port positions from the Port System
   * 2. Updates connectionPoints for rendering
   * 3. Recalculates bounding box for optimization
   * 4. Updates hit box for interaction
   *
   * @returns {void}
   */
  updatePoints(additionalPoints) {
    this.connectionPoints = [
      { x: 0, y: 0 },
      { x: 0, y: 0 }
    ];
    if (this.connectedState.$geometry.value) {
      const [source, target] = this.connectedState.$geometry.value;
      this.connectionPoints = [
        { x: source.x, y: source.y },
        { x: target.x, y: target.y }
      ];
    }
    const points = this.collectBBoxPoints();
    if (additionalPoints) {
      points.push(...additionalPoints);
    }
    const x2 = points.map((p2) => p2.x).filter(Number.isFinite);
    const y2 = points.map((p2) => p2.y).filter(Number.isFinite);
    this.bBox = [Math.min(...x2), Math.min(...y2), Math.max(...x2), Math.max(...y2)];
    this.updateHitBox();
  }
  /**
   * Collects points that define the bounding box of the connection.
   * Override in subclasses to include additional points (e.g., bezier control points, labels).
   */
  collectBBoxPoints() {
    if (!this.connectionPoints) {
      return [];
    }
    return [this.connectionPoints[0], this.connectionPoints[1]];
  }
  /**
   * Get the current bounding box of the connection
   * @returns Readonly tuple of [sourceX, sourceY, targetX, targetY]
   */
  getBBox() {
    return this.bBox;
  }
  /**
   * Get the current bounding box of the connection as a TRect.
   */
  getHitBoxRect() {
    const [minX, minY, maxX, maxY] = this.getBBox();
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/connections/BlockConnection.js
var import_intersects3 = __toESM(require_intersects());

// node_modules/@gravity-ui/graph/build/components/canvas/connections/Arrow/index.js
var ConnectionArrow = class {
  constructor(connection) {
    this.connection = connection;
  }
  getPath() {
    return this.connection.createArrowPath();
  }
  style(ctx) {
    return this.connection.styleArrow(ctx);
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/connections/bezierHelpers.js
function generateBezierParams(startPos, endPos, mode = "horizontal") {
  const distance = Math.abs(endPos.x - startPos.x);
  const coef = mode === "horizontal" ? Math.max(distance / 2, 25) : 0;
  const coefY = mode === "vertical" ? Math.max(distance / 2, 25) : 0;
  return [
    startPos,
    {
      x: startPos.x + coef,
      y: startPos.y + coefY
    },
    {
      x: endPos.x - coef,
      y: endPos.y - coefY
    },
    endPos
  ];
}
function bezierCurveLine(startPos, endPos, mode = "horizontal") {
  const path = new Path2D();
  const [start, firstPoint, secondPoint, end] = generateBezierParams(startPos, endPos, mode);
  path.moveTo(start.x, start.y);
  path.bezierCurveTo(firstPoint.x, firstPoint.y, secondPoint.x, secondPoint.y, end.x, end.y);
  return path;
}
function getPointOfBezierCurve(startPos, endPos, time, mode = "horizontal") {
  const [start, firstPoint, secondPoint, end] = generateBezierParams(startPos, endPos, mode);
  return {
    x: Math.pow(1 - time, 3) * start.x + 3 * Math.pow(1 - time, 2) * time * firstPoint.x + 3 * (1 - time) * Math.pow(time, 2) * secondPoint.x + Math.pow(time, 3) * end.x,
    y: Math.pow(1 - time, 3) * start.y + 3 * Math.pow(1 - time, 2) * time * firstPoint.y + 3 * (1 - time) * Math.pow(time, 2) * secondPoint.y + Math.pow(time, 3) * end.y
  };
}
function isPointInStroke(ctx, path, x2, y2, threshold) {
  if (!ctx || !path || !(path instanceof Path2D)) {
    return false;
  }
  const l2 = ctx.lineWidth;
  if (threshold) {
    ctx.lineWidth = threshold;
  }
  const intersectsLine = ctx.isPointInStroke(path, x2, y2);
  ctx.lineWidth = l2;
  return intersectsLine;
}
function getArrowCoords(useBezier, x1, y1, x2, y2, mode = "horizontal") {
  const angle = Math.PI / 4;
  const d2 = 8;
  let x3;
  let y3;
  let lineangle;
  if (useBezier) {
    const bezierPos = getPointOfBezierCurve({ x: x1, y: y1 }, { x: x2, y: y2 }, 0.5, mode);
    x3 = bezierPos.x;
    y3 = bezierPos.y;
    const bezierPos1 = getPointOfBezierCurve({ x: x1, y: y1 }, { x: x2, y: y2 }, 0.4, mode);
    const bezierPos2 = getPointOfBezierCurve({ x: x1, y: y1 }, { x: x2, y: y2 }, 0.6, mode);
    lineangle = Math.atan2(bezierPos2.y - bezierPos1.y, bezierPos2.x - bezierPos1.x);
  } else {
    x3 = x1 + (x2 - x1) / 2;
    y3 = y1 + (y2 - y1) / 2;
    lineangle = Math.atan2(y2 - y1, x2 - x1);
  }
  const h2 = Math.abs(d2 / Math.cos(angle));
  const angle1 = lineangle + Math.PI + angle;
  const topx = x3 + Math.cos(angle1) * h2;
  const topy = y3 + Math.sin(angle1) * h2;
  const angle2 = lineangle + Math.PI - angle;
  const botx = x3 + Math.cos(angle2) * h2;
  const boty = y3 + Math.sin(angle2) * h2;
  return [topx, topy, x3, y3, botx, boty];
}

// node_modules/@gravity-ui/graph/build/components/canvas/connections/labelHelper.js
function getLabelCoords(x1, y1, x2, y2, width, height, GRID_SIZE) {
  const alpha = x2 === x1 ? 0 : (y2 - y1) / (x2 - x1);
  const c2 = y2 - alpha * x2;
  const maxOffsetY = GRID_SIZE * 8;
  let x3;
  let y3;
  let aligment = "right";
  if (x1 <= x2 && y1 <= y2) {
    const labelRightBottomX = x2 - GRID_SIZE;
    const labelRightBottomY = alpha * labelRightBottomX + c2 - GRID_SIZE;
    aligment = "left";
    x3 = labelRightBottomX - width;
    y3 = clamp(labelRightBottomY, y2 - maxOffsetY, y2 + maxOffsetY) - height;
  } else if (x1 >= x2 && y1 <= y2) {
    const labelLeftBottomX = x2 + GRID_SIZE;
    const labelLeftBottomY = alpha * labelLeftBottomX + c2 + GRID_SIZE;
    x3 = labelLeftBottomX;
    y3 = clamp(labelLeftBottomY, y2 - maxOffsetY, y2 + maxOffsetY) - height;
  } else if (x1 >= x2 && y1 >= y2) {
    const labelLeftTopX = x2 + GRID_SIZE;
    const labelLeftTopY = alpha * labelLeftTopX + c2 + GRID_SIZE;
    x3 = labelLeftTopX;
    y3 = clamp(labelLeftTopY, y2 - maxOffsetY, y2 + maxOffsetY);
  } else {
    const labelRightTopX = x2 - GRID_SIZE;
    const labelRightTopY = alpha * labelRightTopX + c2 - GRID_SIZE;
    aligment = "left";
    x3 = labelRightTopX - width;
    y3 = clamp(labelRightTopY, y2 - maxOffsetY, y2 + maxOffsetY);
  }
  return { x: x3, y: y3, aligment };
}

// node_modules/@gravity-ui/graph/build/components/canvas/connections/BlockConnection.js
var BlockConnection = class extends BaseConnection {
  /**
   * Creates a new BlockConnection instance.
   *
   * @param props - The connection properties including showConnectionArrows setting
   * @param parent - The parent BlockConnections component
   */
  constructor(props, parent) {
    super(props, parent);
    this.cursor = "pointer";
    this.path2d = new Path2D();
    this.labelGeometry = void 0;
    this.geometry = { x1: 0, x2: 0, y1: 0, y2: 0 };
    this.arrowShape = new ConnectionArrow(this);
    this.addEventListener("click", this);
    this.context.batch.add(this, { zIndex: this.zIndex, group: this.getClassName() });
    this.applyShape(this.state, props);
  }
  /**
   * Updates the visual appearance of the connection and manages arrow visibility.
   * This method centralizes all arrow rendering logic to ensure consistency.
   *
   * IMPORTANT: We must use the props parameter instead of this.props because this.props
   * may contain outdated values during re-renders, which was the source of the original bug.
   * Always pass the most current props to this method when calling it from propsChanged.
   *
   * @param state - The current state of the connection (selected, hovered, etc.)
   * @param props - The connection properties, used to check showConnectionArrows setting
   */
  applyShape(state = this.state, props = this.props) {
    const zIndex = state.selected || state.hovered ? this.zIndex + 10 : this.zIndex;
    const group = this.getClassName(state);
    this.context.batch.update(this, { zIndex, group });
    if (props.showConnectionArrows) {
      this.context.batch.update(this.arrowShape, { zIndex: zIndex - 1, group: `arrow/${group}` });
    } else {
      this.context.batch.delete(this.arrowShape);
    }
  }
  getPath() {
    return this.generatePath();
  }
  /**
   * Creates the Path2D object for the arrow in the middle of the connection.
   * This is used by the ConnectionArrow component to render the arrow.
   *
   * @returns A Path2D object representing the arrow shape
   */
  createArrowPath() {
    const coords = getArrowCoords(this.props.useBezier, this.geometry.x1, this.geometry.y1, this.geometry.x2, this.geometry.y2, this.props.bezierDirection);
    const path = new Path2D();
    path.moveTo(coords[0], coords[1]);
    path.lineTo(coords[2], coords[3]);
    path.lineTo(coords[4], coords[5]);
    return path;
  }
  styleArrow(ctx) {
    ctx.lineWidth = this.state.hovered || this.state.selected ? 4 : 2;
    const strokeColor = this.getStrokeColor(this.state);
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
    }
    return { type: "stroke" };
  }
  generatePath() {
    this.path2d = this.createPath();
    return this.path2d;
  }
  createPath() {
    if (!this.geometry) {
      return new Path2D();
    }
    if (this.props.useBezier) {
      return bezierCurveLine({
        x: this.geometry.x1,
        y: this.geometry.y1
      }, {
        x: this.geometry.x2,
        y: this.geometry.y2
      }, this.props.bezierDirection);
    }
    const path2d = new Path2D();
    path2d.moveTo(this.geometry.x1, this.geometry.y1);
    path2d.lineTo(this.geometry.x2, this.geometry.y2);
    return path2d;
  }
  getClassName(state = this.state) {
    const hovered = state.hovered ? "hovered" : "none";
    const selected = state.selected ? "selected" : "none";
    const stroke = this.getStrokeColor(state);
    const dash = state.dashed ? (state.styles?.dashes || [6, 4]).join(",") : "";
    return `connection/${hovered}/${selected}/${stroke}/${dash}`;
  }
  style(ctx) {
    this.setRenderStyles(ctx, this.state);
    return { type: "stroke" };
  }
  setRenderStyles(ctx, state = this.state, withDashed = true) {
    ctx.lineWidth = state.hovered || state.selected ? 4 : 2;
    const strokeColor = this.getStrokeColor(state);
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
    }
    if (withDashed && state.dashed) {
      ctx.setLineDash(state.styles?.dashes || [6, 4]);
    }
  }
  afterRender(ctx) {
    const cameraClose = this.context.camera.getCameraScale() >= this.context.constants.connection.MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL;
    if (this.state.label && this.props.showConnectionLabels && cameraClose) {
      this.renderLabelText(ctx);
    }
  }
  propsChanged(nextProps) {
    super.propsChanged(nextProps);
    this.applyShape(this.state, nextProps);
  }
  stateChanged(nextState) {
    super.stateChanged(nextState);
    this.applyShape(nextState);
  }
  get zIndex() {
    return this.context.constants.connection.DEFAULT_Z_INDEX;
  }
  collectBBoxPoints() {
    const points = super.collectBBoxPoints();
    if (this.labelGeometry) {
      points.push({ x: this.labelGeometry.x, y: this.labelGeometry.y }, {
        x: this.labelGeometry.x + this.labelGeometry.width,
        y: this.labelGeometry.y + this.labelGeometry.height
      });
    }
    if (this.props.useBezier && this.connectionPoints) {
      const bezierParams = generateBezierParams(this.connectionPoints[0], this.connectionPoints[1], this.props.bezierDirection);
      points.push(bezierParams[1], bezierParams[2]);
    }
    return points;
  }
  updatePoints() {
    super.updatePoints();
    if (!this.connectionPoints) {
      return;
    }
    this.geometry.x1 = this.connectionPoints[0].x;
    this.geometry.y1 = this.connectionPoints[0].y;
    this.geometry.x2 = this.connectionPoints[1].x;
    this.geometry.y2 = this.connectionPoints[1].y;
    this.generatePath();
    this.applyShape();
  }
  handleEvent(event) {
    event.stopPropagation();
    super.handleEvent(event);
    switch (event.type) {
      case "click": {
        this.context.graph.api.selectConnections([this.props.id], !isMetaKeyEvent(event) ? true : !this.state.selected, !isMetaKeyEvent(event) ? ESelectionStrategy.REPLACE : ESelectionStrategy.APPEND);
        break;
      }
    }
  }
  onHitBox(shape) {
    const THRESHOLD_LINE_HIT = this.context.constants.connection.THRESHOLD_LINE_HIT;
    if (isPointInStroke(this.context.ctx, this.path2d, shape.x, shape.y, THRESHOLD_LINE_HIT * 2)) {
      return true;
    }
    if (this.labelGeometry !== void 0) {
      const x2 = (shape.minX + shape.maxX) / 2;
      const y2 = (shape.minY + shape.maxY) / 2;
      const relativeTreshold = THRESHOLD_LINE_HIT / this.context.camera.getCameraScale();
      return import_intersects3.default.boxBox(x2 - relativeTreshold / 2, y2 - relativeTreshold / 2, relativeTreshold, relativeTreshold, this.labelGeometry.x, this.labelGeometry.y, this.labelGeometry.width, this.labelGeometry.height);
    }
    return false;
  }
  renderLabelText(ctx) {
    if (!this.isVisible() || !this.state.label) {
      return;
    }
    const [labelInnerTopPadding, labelInnerRightPadding, labelInnerBottomPadding, labelInnerLeftPadding] = this.context.constants.connection.LABEL.INNER_PADDINGS;
    const fontSize = Math.max(14, getFontSize(9, this.context.camera.getCameraScale()));
    const font = `${fontSize}px sans-serif`;
    const measure = cachedMeasureText(this.state.label, {
      font
    });
    if (!measure) {
      return;
    }
    const { x: x2, y: y2 } = getLabelCoords(this.geometry.x1, this.geometry.y1, this.geometry.x2, this.geometry.y2, measure.width + labelInnerLeftPadding + labelInnerRightPadding, measure.height + labelInnerTopPadding + labelInnerBottomPadding, this.context.constants.system.GRID_SIZE);
    if (this.context.colors.connectionLabel?.background) {
      ctx.fillStyle = this.context.colors.connectionLabel.background;
    }
    if (this.state.hovered && this.context.colors.connectionLabel?.hoverBackground) {
      ctx.fillStyle = this.context.colors.connectionLabel.hoverBackground;
    }
    if (this.state.selected && this.context.colors.connectionLabel?.selectedBackground) {
      ctx.fillStyle = this.context.colors.connectionLabel.selectedBackground;
    }
    const rectX = x2;
    const rectY = y2;
    const rectWidth = measure.width + labelInnerLeftPadding + labelInnerRightPadding;
    const rectHeight = measure.height + labelInnerTopPadding + labelInnerBottomPadding;
    this.labelGeometry = {
      x: rectX,
      y: rectY,
      width: rectWidth,
      height: rectHeight
    };
    ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
    if (this.context.colors.connectionLabel?.text) {
      ctx.fillStyle = this.context.colors.connectionLabel.text;
    }
    if (this.state.hovered && this.context.colors.connectionLabel?.hoverText) {
      ctx.fillStyle = this.context.colors.connectionLabel.hoverText;
    }
    if (this.state.selected && this.context.colors.connectionLabel?.selectedText) {
      ctx.fillStyle = this.context.colors.connectionLabel.selectedText;
    }
    ctx.textBaseline = "top";
    ctx.font = font;
    ctx.textAlign = "left";
    ctx.fillText(this.state.label, rectX + labelInnerLeftPadding, rectY + labelInnerTopPadding);
  }
  getStrokeColor(state) {
    if (state.selected)
      return state.styles?.selectedBackground || this.context.colors.connection?.selectedBackground;
    return state.styles?.background || this.context.colors.connection?.background;
  }
  unmount() {
    super.unmount();
    this.context.batch.delete(this);
    this.context.batch.delete(this.arrowShape);
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/connections/MultipointConnection.js
var import_intersects4 = __toESM(require_intersects());

// node_modules/@gravity-ui/graph/build/utils/shapes/curvePolyline.js
function curvePolyline(points, baseRadius) {
  const path = new Path2D();
  path.moveTo(points[0].x, points[0].y);
  for (let i2 = 1; i2 < points.length - 1; i2++) {
    const prevPoint = points[i2 - 1];
    const currPoint = points[i2];
    const nextPoint = points[i2 + 1];
    const vectorPrev = {
      x: currPoint.x - prevPoint.x,
      y: currPoint.y - prevPoint.y
    };
    const vectorNext = {
      x: nextPoint.x - currPoint.x,
      y: nextPoint.y - currPoint.y
    };
    const lenPrev = Math.hypot(vectorPrev.x, vectorPrev.y);
    const lenNext = Math.hypot(vectorNext.x, vectorNext.y);
    const unitVecPrev = {
      x: vectorPrev.x / lenPrev,
      y: vectorPrev.y / lenPrev
    };
    const unitVecNext = {
      x: vectorNext.x / lenNext,
      y: vectorNext.y / lenNext
    };
    const dotProduct = unitVecPrev.x * unitVecNext.x + unitVecPrev.y * unitVecNext.y;
    const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
    let adjustedRadius = Math.min(baseRadius, angle / Math.PI * baseRadius);
    const maxRadius = Math.min(lenPrev / 2, lenNext / 2);
    adjustedRadius = Math.min(adjustedRadius, maxRadius);
    const startArcX = currPoint.x - unitVecPrev.x * adjustedRadius;
    const startArcY = currPoint.y - unitVecPrev.y * adjustedRadius;
    const endArcX = currPoint.x + unitVecNext.x * adjustedRadius;
    const endArcY = currPoint.y + unitVecNext.y * adjustedRadius;
    path.lineTo(startArcX, startArcY);
    if (angle < Math.PI - 0.01) {
      path.arcTo(currPoint.x, currPoint.y, endArcX, endArcY, adjustedRadius);
    }
  }
  path.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  return path;
}

// node_modules/@gravity-ui/graph/build/utils/shapes/triangle.js
function trangleArrowForVector(start, end, height = 10, baseWidth = 5, t2 = 1) {
  const normalizedT = clamp(t2, 0, 1);
  const tipx = (1 - normalizedT) * start.x + normalizedT * end.x;
  const tipy = (1 - normalizedT) * start.y + normalizedT * end.y;
  const lineAngle = Math.atan2(end.y - start.y, end.x - start.x);
  const baseMidX = tipx - Math.cos(lineAngle) * height;
  const baseMidY = tipy - Math.sin(lineAngle) * height;
  const baseHalfWidth = baseWidth / 2;
  const leftAngle = lineAngle + Math.PI / 2;
  const rightAngle = lineAngle - Math.PI / 2;
  const leftx = baseMidX + Math.cos(leftAngle) * baseHalfWidth;
  const lefty = baseMidY + Math.sin(leftAngle) * baseHalfWidth;
  const rightx = baseMidX + Math.cos(rightAngle) * baseHalfWidth;
  const righty = baseMidY + Math.sin(rightAngle) * baseHalfWidth;
  const trianglePath = new Path2D();
  trianglePath.moveTo(tipx, tipy);
  trianglePath.lineTo(leftx, lefty);
  trianglePath.lineTo(rightx, righty);
  trianglePath.closePath();
  return trianglePath;
}

// node_modules/@gravity-ui/graph/build/components/canvas/connections/MultipointConnection.js
var DEFAULT_FONT_SIZE = 14;
var MultipointConnection = class extends BlockConnection {
  constructor() {
    super(...arguments);
    this.labelsGeometry = [];
  }
  createPath() {
    const points = this.getPoints();
    if (!points.length) {
      return super.createPath();
    }
    return curvePolyline(points, 10);
  }
  createArrowPath() {
    const points = this.getPoints();
    if (!points.length) {
      return void 0;
    }
    const [start, end] = points.slice(points.length - 2);
    return trangleArrowForVector(start, end, 16, 10);
  }
  styleArrow(ctx) {
    ctx.fillStyle = this.state.selected ? this.context.colors.connection.selectedBackground : this.context.colors.connection.background;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = this.state.selected || this.state.hovered ? -1 : 1;
    return { type: "both" };
  }
  getPoints() {
    return this.connectedState.$state.value.points || [];
  }
  afterRender(ctx) {
    this.renderLabelsText(ctx);
  }
  updatePoints() {
    super.updatePoints();
    return;
  }
  getBBox() {
    const points = this.getPoints();
    if (!points.length) {
      return super.getBBox();
    }
    const x2 = [];
    const y2 = [];
    points.forEach((point) => {
      x2.push(point.x);
      y2.push(point.y);
    });
    return [Math.min(...x2), Math.min(...y2), Math.max(...x2), Math.max(...y2)];
  }
  getHitBoxRect() {
    const [minX, minY, maxX, maxY] = this.getBBox();
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  onHitBox(shape) {
    const THRESHOLD_LINE_HIT = this.context.constants.connection.THRESHOLD_LINE_HIT;
    if (isPointInStroke(this.context.ctx, this.path2d, shape.x, shape.y, THRESHOLD_LINE_HIT * 2)) {
      return true;
    }
    if (!this.labelsGeometry.length) {
      return false;
    }
    const x2 = (shape.minX + shape.maxX) / 2;
    const y2 = (shape.minY + shape.maxY) / 2;
    const relativeThreshold = THRESHOLD_LINE_HIT / this.context.camera.getCameraScale();
    return this.labelsGeometry.some((labelGeometry) => {
      return import_intersects4.default.boxBox(x2 - relativeThreshold / 2, y2 - relativeThreshold / 2, relativeThreshold, relativeThreshold, labelGeometry.x, labelGeometry.y, labelGeometry.width, labelGeometry.height);
    });
  }
  renderLabelsText(ctx) {
    const [labelInnerTopPadding, labelInnerRightPadding, labelInnerBottomPadding, labelInnerLeftPadding] = this.context.constants.connection.LABEL.INNER_PADDINGS;
    const { labels } = this.connectedState.$state.value;
    if (!labels || !labels.length) {
      return;
    }
    this.labelsGeometry = [];
    labels.forEach(({ x: x2, y: y2, text, height, width }) => {
      if ([x2, y2, text].some((i2) => i2 === void 0) || x2 === 0 && y2 === 0) {
        return;
      }
      this.labelsGeometry.push({
        x: x2,
        y: y2,
        width,
        height
      });
      ctx.fillStyle = this.context.colors.connectionLabel.text;
      if (this.state.hovered)
        ctx.fillStyle = this.context.colors.connectionLabel.hoverText;
      if (this.state.selected)
        ctx.fillStyle = this.context.colors.connectionLabel.selectedText;
      ctx.textAlign = "left";
      ctx.font = `${DEFAULT_FONT_SIZE}px sans-serif`;
      ctx.fillText(text, x2, y2, width);
      ctx.fillStyle = this.context.colors.connectionLabel.background;
      if (this.state.hovered)
        ctx.fillStyle = this.context.colors.connectionLabel.hoverBackground;
      if (this.state.selected)
        ctx.fillStyle = this.context.colors.connectionLabel.selectedBackground;
      ctx.fillRect(x2 - labelInnerLeftPadding, y2 - labelInnerTopPadding, width + labelInnerLeftPadding + labelInnerRightPadding, height + labelInnerTopPadding + labelInnerBottomPadding);
    });
    return;
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/connections/BezierMultipointConnection.js
var BezierMultipointConnection = class extends MultipointConnection {
  createPath() {
    const points = this.getPoints();
    const direction = this.props.bezierDirection;
    if (!points.length) {
      return super.createPath();
    }
    const path = new Path2D();
    if (points.length === 1) {
      return path;
    }
    if (points.length === 2) {
      return bezierCurveLine(points[0], points[1], direction);
    }
    for (let i2 = 1; i2 < points.length; i2++) {
      const startPoint = points[i2 - 1];
      const endPoint = points[i2];
      const isStraightSegment = direction === "vertical" ? startPoint.x === endPoint.x : startPoint.y === endPoint.y;
      if (isStraightSegment) {
        path.moveTo(startPoint.x, startPoint.y);
        path.lineTo(endPoint.x, endPoint.y);
      } else {
        const [start, firstPoint, secondPoint, end] = generateBezierParams(startPoint, endPoint, direction);
        path.moveTo(start.x, start.y);
        path.bezierCurveTo(firstPoint.x, firstPoint.y, secondPoint.x, secondPoint.y, end.x, end.y);
      }
    }
    return path;
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/connections/BatchPath2D/index.js
var Path2DChunk = class {
  constructor() {
    this.items = /* @__PURE__ */ new Set();
    this.visibleItems = cache(() => {
      return Array.from(this.items).filter((item) => item.isPathVisible?.() ?? true);
    });
    this.path = cache(() => {
      const path = new Path2D();
      path.moveTo(0, 0);
      for (const item of this.visibleItems.get()) {
        const subPath = item.getPath();
        if (subPath) {
          path.addPath(subPath);
        }
      }
      return path;
    });
  }
  applyStyles(ctx) {
    const first = this.visibleItems.get()[0];
    return first?.style(ctx);
  }
  add(item) {
    this.items.add(item);
    this.reset();
  }
  delete(item) {
    this.items.delete(item);
    this.reset();
  }
  reset() {
    this.path.reset();
    this.visibleItems.reset();
  }
  render(ctx) {
    const vis = this.visibleItems.get();
    if (!vis.length)
      return;
    ctx.save();
    const style = this.applyStyles(ctx);
    if (style) {
      const p2 = this.path.get();
      if (style.type === "fill" || style.type === "both") {
        ctx.fill(p2, style.fillRule);
      }
      if (style.type === "stroke" || style.type === "both") {
        ctx.stroke(p2);
      }
    }
    ctx.restore();
    for (const item of vis) {
      item.afterRender?.(ctx);
    }
  }
  get size() {
    return this.items.size;
  }
};
var Path2DGroup = class {
  constructor(chunkSize) {
    this.chunkSize = chunkSize;
    this.chunks = [];
    this.itemToChunk = /* @__PURE__ */ new Map();
    this.chunks.push(new Path2DChunk());
  }
  add(item) {
    let lastChunk = this.chunks[this.chunks.length - 1];
    if (lastChunk.size >= this.chunkSize) {
      lastChunk = new Path2DChunk();
      this.chunks.push(lastChunk);
    }
    lastChunk.add(item);
    this.itemToChunk.set(item, lastChunk);
  }
  delete(item) {
    const chunk = this.itemToChunk.get(item);
    if (chunk) {
      chunk.delete(item);
      this.itemToChunk.delete(item);
      if (chunk.size === 0 && this.chunks.length > 1) {
        const index = this.chunks.indexOf(chunk);
        if (index > -1) {
          this.chunks.splice(index, 1);
        }
      }
    }
  }
  resetItem(item) {
    const chunk = this.itemToChunk.get(item);
    chunk?.reset();
  }
  render(ctx) {
    for (const chunk of this.chunks) {
      chunk.render(ctx);
    }
  }
};
var BatchPath2DRenderer = class {
  constructor(onChange, chunkSize = 100) {
    this.onChange = onChange;
    this.chunkSize = chunkSize;
    this.indexes = /* @__PURE__ */ new Map();
    this.itemParams = /* @__PURE__ */ new Map();
    this.orderedPaths = cache(() => {
      return Array.from(this.indexes.entries()).sort(([indexA], [indexB]) => indexA - indexB).reduce((acc, [_2, items]) => {
        acc.push(...Array.from(items.values()));
        return acc;
      }, []);
    });
    this.requestRender = () => this.onChange?.();
  }
  getGroup(zIndex, group) {
    if (!this.indexes.has(zIndex)) {
      this.indexes.set(zIndex, /* @__PURE__ */ new Map());
    }
    const index = this.indexes.get(zIndex);
    if (!index.has(group)) {
      index.set(group, new Path2DGroup(this.chunkSize));
    }
    return index.get(group);
  }
  add(item, params) {
    if (this.itemParams.has(item)) {
      this.update(item, params);
    }
    const bucket = this.getGroup(params.zIndex, params.group);
    bucket.add(item);
    this.itemParams.set(item, params);
    this.orderedPaths.reset();
    this.requestRender();
  }
  update(item, params) {
    if (this.itemParams.has(item)) {
      const prev = this.itemParams.get(item);
      if (prev.zIndex === params.zIndex && prev.group === params.group) {
        this.markDirty(item);
        return;
      }
      this.delete(item);
    }
    this.add(item, params);
  }
  delete(item) {
    if (!this.itemParams.has(item)) {
      return;
    }
    const params = this.itemParams.get(item);
    const bucket = this.getGroup(params.zIndex, params.group);
    bucket.delete(item);
    this.itemParams.delete(item);
    this.orderedPaths.reset();
    this.requestRender();
  }
  markDirty(item) {
    const params = this.itemParams.get(item);
    if (params) {
      const group = this.getGroup(params.zIndex, params.group);
      group.resetItem(item);
      this.requestRender();
    }
  }
};

// node_modules/@gravity-ui/graph/build/graph.js
var import_merge = __toESM(require_merge());

// node_modules/@gravity-ui/graph/build/api/PublicGraphApi.js
var PublicGraphApi = class {
  constructor(graph) {
    this.graph = graph;
  }
  /**
   * Zooms to blocks
   * @param blockIds - block ids to zoom to
   * @param zoomConfig - {@link ZoomConfig} zoom config
   * @returns {boolean} true if zoom is successful, false otherwise
   *
   * @example
   * ```typescript
   * graph.zoomToBlocks([block1.id, block2.id]);
   * graph.zoomToBlocks([block1.id, block2.id], { transition: 1000, padding: 50 });
   * ```
   */
  zoomToBlocks(blockIds, zoomConfig) {
    const blocks = this.graph.rootStore.blocksList.getBlocks(blockIds);
    if (blocks.length === 0) {
      return false;
    }
    const blocksRect = getBlocksRect(blocks);
    this.zoomToRect(blocksRect, zoomConfig);
    return true;
  }
  /**
   * Zooms to GraphComponent instances
   * @param instances -  {@link GraphComponent} instances to zoom to
   * @param zoomConfig - {@link ZoomConfig} zoom config
   * @returns {boolean} true if zoom is successful, false otherwise
   *
   * @example
   * ```typescript
   * graph.zoomToElements([component1, component2]);
   * graph.zoomToElements([component1, component2], { transition: 1000, padding: 50 });
   * ```
   */
  zoomToElements(elements, zoomConfig) {
    if (elements.length === 0) {
      return false;
    }
    const elementsRect = getElementsRect(elements);
    this.zoomToRect(elementsRect, zoomConfig);
    return true;
  }
  /**
   * Zooms to fit all blocks in the viewport. This method is asynchronous and waits
   * for the usableRect to be ready before performing the zoom operation.
   *
   * @param zoomConfig - Configuration for zoom transition and padding
   * @returns Promise that resolves when zoom operation is complete
   */
  zoomToViewPort(zoomConfig) {
    this.graph.hitTest.waitUsableRectUpdate((rect) => {
      let zoomRect = rect;
      if (rect.width === 0 && rect.height === 0 && rect.x === 0 && rect.y === 0) {
        zoomRect = {
          x: 0 - this.graph.graphConstants.system.USABLE_RECT_GAP,
          y: 0 - this.graph.graphConstants.system.USABLE_RECT_GAP,
          width: 0 + this.graph.graphConstants.system.USABLE_RECT_GAP * 2,
          height: 0 + this.graph.graphConstants.system.USABLE_RECT_GAP * 2
        };
      }
      this.zoomToRect(zoomRect, zoomConfig);
    });
  }
  /**
   * Zooms to the specified rectangle in camera coordinates
   *
   * Zooms the camera to fit the specified rectangle in the viewport. The rectangle will be scaled
   * to fill the visible area (respecting camera insets) and centered in the viewport.
   *
   * @param rect - {@link TRect} rectangle to zoom to in camera coordinates
   * @param zoomConfig - {@link ZoomConfig} zoom config
   * @returns {undefined}
   *
   * @example
   * ```typescript
   * graph.zoomToRect({ x: 0, y: 0, width: 100, height: 100 });
   * graph.zoomToRect({ x: 0, y: 0, width: 100, height: 100 }, { transition: 1000, padding: 50 });
   */
  zoomToRect(rect, zoomConfig) {
    const transition = zoomConfig?.transition || 0;
    const padding = zoomConfig?.padding || 0;
    const cameraRectInit = this.graph.cameraService.getCameraRect();
    const cameraScaleInit = this.graph.cameraService.getCameraScale();
    const endScale = this.graph.cameraService.getScaleRelativeDimensions(rect.width + padding * 2, rect.height + padding * 2, { respectInsets: true });
    const xyPosition = this.graph.cameraService.getXYRelativeCenterDimensions({
      x: rect.x - padding,
      y: rect.y - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2
    }, endScale, { respectInsets: true });
    if (!transition) {
      this.graph.cameraService.set({ ...xyPosition, scale: endScale });
      return;
    }
    startAnimation(transition, (progress) => {
      const x2 = cameraRectInit.x + (xyPosition.x - cameraRectInit.x) * progress;
      const y2 = cameraRectInit.y + (xyPosition.y - cameraRectInit.y) * progress;
      const scale = cameraScaleInit + (endScale - cameraScaleInit) * progress;
      this.graph.cameraService.set({ x: x2, y: y2, scale });
    });
  }
  getGraphColors() {
    return this.graph.graphColors;
  }
  updateGraphColors(colors) {
    this.graph.setColors(colors);
  }
  getGraphConstants() {
    return this.graph.graphConstants;
  }
  updateGraphConstants(constants) {
    this.graph.setConstants(constants);
  }
  isGraphEmpty() {
    return this.graph.rootStore.blocksList.$blocksMap.value.size === 0;
  }
  setSetting(flagPath, value) {
    this.graph.rootStore.settings.setConfigFlag(flagPath, value);
  }
  setCurrentConfigurationName(newName) {
    this.graph.rootStore.configurationName = newName;
  }
  deleteSelected() {
    n(() => {
      this.graph.rootStore.connectionsList.deleteSelectedConnections();
      this.graph.rootStore.blocksList.deleteSelectedBlocks();
    });
  }
  selectBlocks(blockIds, selected, strategy = ESelectionStrategy.REPLACE) {
    this.graph.rootStore.blocksList.updateBlocksSelection(blockIds, selected, strategy);
  }
  updateBlock(block) {
    const blockStore = selectBlockById(this.graph, block.id);
    blockStore?.updateBlock(block);
  }
  addBlock(block, selectionOptions) {
    const newBlockId = this.graph.rootStore.blocksList.addBlock(block);
    if (selectionOptions !== void 0) {
      this.graph.rootStore.blocksList.updateBlocksSelection([newBlockId], selectionOptions.selected !== void 0 ? selectionOptions.selected : true, selectionOptions.strategy);
    }
    return newBlockId;
  }
  setAnchorSelection(blockId, anchorId, selected) {
    this.graph.rootStore.blocksList.setAnchorSelection(blockId, anchorId, selected);
  }
  selectConnections(connectionIds, selected, strategy = ESelectionStrategy.REPLACE) {
    n(() => {
      this.graph.rootStore.connectionsList.setConnectionsSelection(connectionIds, selected, strategy);
    });
  }
  updateConnection(id, connection) {
    const connectionStore = selectConnectionById(this.graph, id);
    connectionStore.updateConnection(connection);
  }
  addConnection(connection) {
    return this.graph.rootStore.connectionsList.addConnection(connection);
  }
  getBlockById(blockId) {
    return selectBlockById(this.graph, blockId)?.asTBlock();
  }
  getUsableRect() {
    return this.graph.hitTest.getUsableRect();
  }
  unsetSelection() {
    this.graph.rootStore.selectionService.resetAllSelections();
  }
};

// node_modules/@gravity-ui/graph/build/services/Layer.js
var HIDDEN_CLASS_NAME = "layer-hidden";
var Layer = class extends Component {
  /**
   * A wrapper for this.props.graph.on that automatically includes the AbortController signal.
   * The method is named onGraphEvent to indicate it's specifically for graph events.
   * This simplifies event subscription and ensures proper cleanup when the layer is unmounted.
   *
   * IMPORTANT: Always use this method in the afterInit() method, NOT in the constructor.
   * This ensures that event subscriptions are properly set up when the layer is reattached.
   * When a layer is unmounted, the AbortController is aborted and a new one is created.
   * When the layer is reattached, afterInit() is called again, which sets up new subscriptions
   * with the new AbortController.
   *
   * @param eventName - The name of the event to subscribe to
   * @param handler - The event handler function
   * @param options - Additional options (optional)
   * @returns The result of graph.on call (an unsubscribe function)
   */
  onGraphEvent(eventName, handler, options) {
    return this.props.graph.on(eventName, handler, {
      ...options,
      signal: this.eventAbortController.signal
    });
  }
  hide() {
    this.canvas?.classList.add(HIDDEN_CLASS_NAME);
    this.html?.classList.add(HIDDEN_CLASS_NAME);
  }
  isHidden() {
    return this.canvas?.classList.contains(HIDDEN_CLASS_NAME) || this.html?.classList.contains(HIDDEN_CLASS_NAME);
  }
  show() {
    this.canvas?.classList.remove(HIDDEN_CLASS_NAME);
    this.html?.classList.remove(HIDDEN_CLASS_NAME);
  }
  /**
   * A wrapper for HTMLElement.addEventListener that automatically includes the AbortController signal.
   * This method is for adding event listeners to the HTML element of the layer.
   * It simplifies event subscription and ensures proper cleanup when the layer is unmounted.
   *
   * IMPORTANT: Always use this method in the afterInit() method, NOT in the constructor.
   * This ensures that event subscriptions are properly set up when the layer is reattached.
   * When a layer is unmounted, the AbortController is aborted and a new one is created.
   * When the layer is reattached, afterInit() is called again, which sets up new subscriptions
   * with the new AbortController.
   *
   * @param eventName - The name of the DOM event to subscribe to
   * @param handler - The event handler function
   * @param options - Additional options (optional)
   */
  onHtmlEvent(eventName, handler, options) {
    if (!this.html) {
      throw new Error("Attempt to add event listener to non-existent HTML element");
    }
    this.html.addEventListener(eventName, handler, {
      ...options,
      signal: this.eventAbortController.signal
    });
  }
  /**
   * A wrapper for HTMLCanvasElement.addEventListener that automatically includes the AbortController signal.
   * This method is for adding event listeners to the canvas element of the layer.
   * It simplifies event subscription and ensures proper cleanup when the layer is unmounted.
   *
   * IMPORTANT: Always use this method in the afterInit() method, NOT in the constructor.
   * This ensures that event subscriptions are properly set up when the layer is reattached.
   * When a layer is unmounted, the AbortController is aborted and a new one is created.
   * When the layer is reattached, afterInit() is called again, which sets up new subscriptions
   * with the new AbortController.
   *
   * @param eventName - The name of the DOM event to subscribe to
   * @param handler - The event handler function
   * @param options - Additional options (optional)
   */
  onCanvasEvent(eventName, handler, options) {
    if (!this.canvas) {
      throw new Error("Attempt to add event listener to non-existent canvas element");
    }
    this.canvas.addEventListener(eventName, handler, {
      ...options,
      signal: this.eventAbortController.signal
    });
  }
  /**
   * A wrapper for HTMLElement.addEventListener that automatically includes the AbortController signal.
   * This method is for adding event listeners to the root element of the layer.
   * It simplifies event subscription and ensures proper cleanup when the layer is unmounted.
   *
   * IMPORTANT: Always use this method in the afterInit() method, NOT in the constructor.
   * This ensures that event subscriptions are properly set up when the layer is reattached.
   * When a layer is unmounted, the AbortController is aborted and a new one is created.
   * When the layer is reattached, afterInit() is called again, which sets up new subscriptions
   * with the new AbortController.
   *
   * @param eventName - The name of the DOM event to subscribe to
   * @param handler - The event handler function
   * @param options - Additional options (optional)
   */
  onRootEvent(eventName, handler, options) {
    if (!this.root) {
      throw new Error("Attempt to add event listener to non-existent root element");
    }
    this.root.addEventListener(eventName, handler, {
      ...options,
      signal: this.eventAbortController.signal
    });
  }
  /**
   * Subscribes to a signal (with .subscribe) and automatically unsubscribes when the layer's AbortController is aborted.
   *
   * Usage:
   *   this.onSignal(signal, handler)
   *
   * @template S - Signal type (must have .subscribe method)
   * @template T - Value type of the signal
   * @param signal - Signal with .subscribe method (returns unsubscribe function)
   * @param handler - Handler function to call on signal change
   * @returns The unsubscribe function (called automatically on abort)
   */
  onSignal(signal, handler) {
    const unsubscribe = signal.subscribe(handler);
    const abortHandler = () => {
      unsubscribe();
      this.eventAbortController.signal.removeEventListener("abort", abortHandler);
    };
    this.eventAbortController.signal.addEventListener("abort", abortHandler);
    return unsubscribe;
  }
  constructor(props, parent) {
    super(props, parent);
    this.attached = false;
    this.htmlActive = true;
    this.sizeTouched = false;
    this.updateSize = () => {
      this.sizeTouched = true;
      this.performRender();
    };
    this.stopCameraMoving = debounce(() => {
      this.html?.classList.remove("layer-with-camera-moving");
      this.moving = false;
    }, { priority: ESchedulerPriority.LOW, frameTimeout: 150 });
    this.moving = false;
    this.eventAbortController = new AbortController();
    this.setContext({
      graph: this.props.graph,
      camera: props.camera,
      colors: this.props.graph.$graphColors.value,
      constants: this.props.graph.$graphConstants.value,
      layer: this
    });
    this.init();
  }
  /**
   * Called after initialization and when the layer is reattached.
   * This is the proper place to set up event subscriptions using onGraphEvent().
   *
   * When a layer is unmounted, the AbortController is aborted and a new one is created.
   * When the layer is reattached, this method is called again, which sets up new subscriptions
   * with the new AbortController.
   *
   * All derived Layer classes should call super.afterInit() at the end of their afterInit method.
   */
  afterInit() {
    this.setContext({
      colors: this.props.graph.$graphColors.value,
      constants: this.props.graph.$graphConstants.value
    });
    this.onGraphEvent("colors-changed", (event) => {
      this.setContext({
        colors: event.detail.colors
      });
    });
    this.onGraphEvent("constants-changed", (event) => {
      this.setContext({
        constants: event.detail.constants
      });
    });
    this.onSignal(this.props.graph.$camera, (camera) => this.handleCommittedCameraChange(camera));
    this.onSignal(this.props.graph.layers.rootSize, this.updateSize);
    this.shouldRenderChildren = true;
    this.shouldUpdateChildren = true;
    if (this.html && this.props.html?.activationScale !== void 0) {
      const cameraState = this.context.camera.getCameraState();
      this.htmlActive = cameraState.scale >= this.props.html.activationScale;
      if (!this.htmlActive) {
        this.onHtmlActiveChange(false);
      }
    }
    this.handleCommittedCameraChange(this.context.camera.getCameraState());
    this.updateSize();
  }
  scheduleCameraChange(camera) {
    if (this.html && this.htmlActive) {
      if (!this.moving) {
        this.html.classList.add("layer-with-camera-moving");
        this.moving = true;
      }
      this.html.style.transform = `matrix(${camera.scale}, 0, 0, ${camera.scale}, ${camera.x}, ${camera.y})`;
      this.stopCameraMoving();
    }
  }
  handleCommittedCameraChange(camera) {
    this.applyCameraTransform(camera);
    this.onCameraChange(camera);
  }
  applyCameraTransform(camera) {
    if (this.html && this.props.html?.activationScale !== void 0) {
      const shouldBeActive = camera.scale >= this.props.html.activationScale;
      if (shouldBeActive !== this.htmlActive) {
        this.htmlActive = shouldBeActive;
        this.onHtmlActiveChange(shouldBeActive);
      }
    }
    if (this.props.html?.transformByCameraPosition && this.html && this.htmlActive) {
      this.scheduleCameraChange(camera);
    }
    if (this.props.canvas?.transformByCameraPosition) {
      this.performRender();
    }
  }
  /**
   * Called when committed camera state changes (`graph.$camera` signal).
   * Override in derived layers to react to pan, zoom, and resize.
   *
   * Built-in HTML/canvas transforms (`transformByCameraPosition`, `activationScale`)
   * are applied before this hook via `applyCameraTransform`.
   *
   * @param camera - Committed camera state (same as `graph.$camera.value`)
   */
  onCameraChange(_camera) {
  }
  /**
   * Called when the HTML layer's active state changes based on camera scale.
   * Override this method to implement custom behavior when the layer activates/deactivates.
   *
   * @param active - Whether the HTML layer is now active
   */
  onHtmlActiveChange(active) {
    if (active) {
      this.html.classList.remove("layer-hidden");
    } else {
      this.html.classList.add("layer-hidden");
    }
  }
  /**
   * Returns whether the HTML layer is currently active.
   * The layer is inactive when camera scale is below the activationScale threshold.
   */
  isHtmlActive() {
    return this.htmlActive;
  }
  init() {
    this.attached = false;
    if (this.props.canvas) {
      if (this.canvas) {
        throw new Error("Attempt to recreate a canvas");
      }
      this.canvas = this.createCanvas(this.props.canvas);
    }
    if (this.props.html) {
      if (this.html) {
        throw new Error("Attempt to recreate an html");
      }
      this.html = this.createHTML(this.props.html);
    }
  }
  unmountLayer() {
    if (this.canvas) {
      const cameraState = this.context.camera.getCameraState();
      const context = this.canvas.getContext("2d");
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, cameraState.width, cameraState.height);
      context.setTransform(cameraState.scale, 0, 0, cameraState.scale, cameraState.x, cameraState.y);
    }
    this.canvas?.parentNode?.removeChild(this.canvas);
    this.html?.parentNode?.removeChild(this.html);
    this.eventAbortController.abort();
    this.eventAbortController = new AbortController();
    this.attached = false;
  }
  unmount() {
    this.stopCameraMoving.cancel();
    this.unmountLayer();
    super.unmount();
  }
  getCanvas() {
    return this.canvas;
  }
  getHTML() {
    return this.html;
  }
  attachLayer(root) {
    if (this.attached) {
      return;
    }
    if (this.root) {
      this.unmountLayer();
    }
    this.root = root;
    if (this.canvas) {
      root.appendChild(this.canvas);
    }
    if (this.html) {
      root.appendChild(this.html);
    }
    this.attached = true;
    this.afterInit();
  }
  detachLayer() {
    this.unmountLayer();
    this.root = void 0;
  }
  createCanvas(params) {
    const canvas = document.createElement("canvas");
    canvas.classList.add("layer", "layer-canvas");
    if (Array.isArray(params.classNames))
      canvas.classList.add(...params.classNames);
    canvas.style.zIndex = `${Number(params.zIndex)}`;
    this.setContext({
      graphCanvas: canvas,
      ctx: canvas.getContext("2d", {
        desynchronized: params.desynchronized ?? false,
        willReadFrequently: params.willReadFrequently ?? false,
        alpha: params.alpha ?? true
      })
    });
    return canvas;
  }
  createHTML(params) {
    const div = document.createElement("div");
    div.classList.add("layer", "layer-html");
    if (Array.isArray(params.classNames))
      div.classList.add(...params.classNames);
    div.style.zIndex = `${Number(params.zIndex)}`;
    if (params.transformByCameraPosition) {
      div.classList.add("layer-with-camera");
    }
    return div;
  }
  getDRP() {
    const respectPixelRatio = this.props.canvas?.respectPixelRatio ?? true;
    return respectPixelRatio ? this.context.graph.layers.rootSize.value.dpr : 1;
  }
  applyTransform(x2, y2, scale, respectPixelRatio = this.props.canvas?.respectPixelRatio) {
    const ctx = this.context.ctx;
    const dpr = respectPixelRatio ? this.getDRP() : 1;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, x2 * dpr, y2 * dpr);
  }
  updateCanvasSize() {
    const { width, height, dpr } = this.context.graph.layers.getRootSize();
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
  }
  resetTransform() {
    if (this.sizeTouched) {
      this.sizeTouched = false;
      this.updateCanvasSize();
    }
    const cameraState = this.props.canvas?.transformByCameraPosition ? this.context.camera.getCameraState() : null;
    this.context.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.context.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.applyTransform(cameraState?.x ?? 0, cameraState?.y ?? 0, cameraState?.scale ?? 1, true);
  }
  render() {
    if (this.canvas) {
      this.resetTransform();
    }
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/layers/belowLayer/PointerGrid.js
var PointerGrid = class extends Component {
  constructor(props, parent) {
    super(props, parent);
    this.props = props;
    this.shouldUpdateChildren = false;
    this.shouldRenderChildren = false;
    this.currentDotsColor = this.context.colors.canvas.dots;
    this.initPattern();
  }
  render() {
    if (this.currentDotsColor !== this.context.colors.canvas.dots) {
      this.initPattern();
      this.currentDotsColor = this.context.colors.canvas.dots;
    }
    this.context.ctx.fillStyle = this.activePattern;
    this.context.ctx.fillRect(this.props.x, this.props.y, this.props.width, this.props.height);
    return;
  }
  willIterate() {
    super.willIterate();
    const cameraState = this.context.camera.getCameraState();
    this.shouldRender = cameraState.scale >= this.context.constants.block.SCALES[0];
    if (this.shouldRender) {
      this.activePattern = cameraState.scale > this.context.constants.block.SCALES[2] ? this.pattern.normal : this.pattern.simple;
    }
  }
  initPattern() {
    this.fakeCanvasContext = this.createFakeCanvasContext();
    this.pattern = {
      normal: this.createPattern(false, this.fakeCanvasContext),
      simple: this.createPattern(true, this.fakeCanvasContext)
    };
    this.activePattern = this.pattern.normal;
    this.fakeCanvasContext = void 0;
  }
  createPattern(simple, fakeCtx) {
    const size = 2;
    const bigSize = simple ? size * 3 : size * 2;
    const rows = 5;
    const cols = 5;
    const canvasWidth = rows * this.context.constants.system.GRID_SIZE;
    const canvasHeight = cols * this.context.constants.system.GRID_SIZE;
    const GRID_SIZE = this.context.constants.system.GRID_SIZE;
    fakeCtx.canvas.width = canvasWidth;
    fakeCtx.canvas.height = canvasHeight;
    fakeCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    fakeCtx.fillStyle = this.context.colors.canvas.dots;
    for (let i2 = -1; i2 < rows + 1; i2 += 1) {
      for (let j2 = -1; j2 < cols + 1; j2 += 1) {
        if (i2 % 5 === 0 && j2 % 5 === 0) {
          fakeCtx.fillRect(i2 * GRID_SIZE - bigSize / 2, j2 * GRID_SIZE - bigSize / 2, bigSize, bigSize);
        } else if (!simple) {
          fakeCtx.fillRect(i2 * GRID_SIZE - size / 2, j2 * GRID_SIZE - size / 2, size, size);
        }
      }
    }
    return this.context.ctx.createPattern(fakeCtx.canvas, "repeat");
  }
  createFakeCanvasContext() {
    return document.createElement("canvas").getContext("2d");
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/layers/belowLayer/Background.js
var Background = class extends Component {
  constructor(props, parent) {
    super(props, parent);
    this.extendedUsableRect = new Rect(0, 0, 0, 0);
    this.usableRectPath = new Path2D();
    this.setupExtendedUsableRect = debounce((usableRect) => {
      if (usableRect.x - this.context.constants.system.USABLE_RECT_GAP !== this.extendedUsableRect.x) {
        this.setState({
          x: usableRect.x - this.context.constants.system.USABLE_RECT_GAP
        });
      }
      if (usableRect.y - this.context.constants.system.USABLE_RECT_GAP !== this.extendedUsableRect.y) {
        this.setState({
          y: usableRect.y - this.context.constants.system.USABLE_RECT_GAP
        });
      }
      if (usableRect.width + this.context.constants.system.USABLE_RECT_GAP * 2 !== this.extendedUsableRect.width) {
        this.setState({
          width: usableRect.width + this.context.constants.system.USABLE_RECT_GAP * 2
        });
      }
      if (usableRect.height + this.context.constants.system.USABLE_RECT_GAP * 2 !== this.extendedUsableRect.height) {
        this.setState({
          height: usableRect.height + this.context.constants.system.USABLE_RECT_GAP * 2
        });
      }
    }, {
      priority: ESchedulerPriority.HIGHEST
    });
    this.unsubscribe = this.subscribe();
  }
  render() {
    super.render();
    const cameraState = this.context.camera.getCameraState();
    this.context.ctx.fillStyle = this.context.colors.canvas.belowLayerBackground;
    this.context.ctx.fillRect(-cameraState.relativeX - 10, -cameraState.relativeY - 10, cameraState.relativeWidth + 20, cameraState.relativeHeight + 20);
    this.context.ctx.lineWidth = this.context.camera.limitScaleEffect(3, 15);
    this.context.ctx.strokeStyle = this.context.colors.canvas.border;
    this.context.ctx.fillStyle = this.context.colors.canvas.layerBackground;
    this.context.ctx.fill(this.usableRectPath);
    this.context.ctx.stroke(this.usableRectPath);
  }
  subscribe() {
    return this.context.graph.hitTest.onUsableRectUpdate(this.setupExtendedUsableRect);
  }
  isGeometryChanged(nextState) {
    return nextState.x !== this.state.x || nextState.y !== this.state.y || nextState.height !== this.state.height || nextState.width !== this.state.width;
  }
  stateChanged(nextState) {
    if (this.isGeometryChanged(nextState)) {
      this.usableRectPath = new Path2D();
      this.usableRectPath.rect(nextState.x, nextState.y, nextState.width, nextState.height);
      this.shouldUpdateChildren = true;
    }
    super.stateChanged(nextState);
  }
  unmount() {
    super.unmount();
    this.setupExtendedUsableRect.cancel();
    this.unsubscribe();
  }
  updateChildren() {
    return [
      PointerGrid.create({
        x: this.state.x,
        y: this.state.y,
        width: this.state.width,
        height: this.state.height
      })
    ];
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/layers/belowLayer/BelowLayer.js
var BelowLayer = class extends Layer {
  constructor(props) {
    super({
      canvas: {
        zIndex: 1,
        classNames: ["no-pointer-events"],
        transformByCameraPosition: true,
        alpha: false,
        // disable alpha for better performance
        ...props.canvas
      },
      ...props
    });
    this.background = this.props.graph.rootStore.settings.$background.value || Background;
  }
  afterInit() {
    this.onSignal(this.props.graph.rootStore.settings.$background, () => {
      this.background = this.props.graph.rootStore.settings.$background.value || Background;
      this.shouldUpdateChildren = true;
      this.performRender();
    });
    super.afterInit();
  }
  updateChildren() {
    return [this.background.create({})];
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/layers/cursorLayer/CursorLayer.js
var CursorLayer = class extends Layer {
  /**
   * Creates a new CursorLayer instance.
   *
   * @param props - Configuration props for the layer
   */
  constructor(props) {
    super({
      // No HTML element needed - we'll apply cursor to the root element
      ...props
    });
    this.mode = "auto";
    this.debouncedUpdateCursor = debounce((target) => {
      this.updateCursorForTarget(target);
    }, {
      frameInterval: 3,
      priority: ESchedulerPriority.LOW
    });
  }
  /**
   * Lifecycle method called after layer initialization.
   * Sets up event listeners for mouse tracking.
   */
  afterInit() {
    super.afterInit();
    this.subscribeToGraphEvents();
  }
  /**
   * Subscribes to graph mouse events for cursor management.
   * Always tracks mouse position to maintain accurate state
   * when switching between manual and auto modes.
   *
   * @private
   */
  subscribeToGraphEvents() {
    this.onGraphEvent("mouseenter", (event) => {
      const target = event.detail?.target;
      this.currentTarget = target;
      if (this.mode === "auto") {
        this.debouncedUpdateCursor(target);
      }
    });
    this.onGraphEvent("mouseleave", () => {
      this.debouncedUpdateCursor.cancel();
      this.currentTarget = void 0;
      if (this.mode === "auto") {
        this.applyCursor("auto");
      }
    });
  }
  /**
   * Updates the cursor based on the target component's cursor property.
   *
   * @param target - The component under the mouse cursor
   * @private
   */
  updateCursorForTarget(target) {
    if (target && typeof target.isInteractive === "function" && target.isInteractive() && target.cursor) {
      this.applyCursor(target.cursor);
    } else {
      this.applyCursor("auto");
    }
  }
  /**
   * Applies the specified cursor to the graph root element.
   *
   * @param cursor - The cursor type to apply
   * @private
   */
  applyCursor(cursor) {
    const rootElement = this.props.graph.layers.$root;
    if (rootElement) {
      rootElement.style.cursor = cursor;
    }
  }
  unmountLayer() {
    this.debouncedUpdateCursor.cancel();
    super.unmountLayer();
    const rootElement = this.props.graph.layers.$root;
    if (rootElement) {
      rootElement.style.cursor = "auto";
    }
  }
  /**
   * Locks the cursor to a specific type, disabling automatic cursor changes.
   *
   * When locked, the cursor will not change automatically based on
   * component interactions until unlockCursor() is called. This effectively
   * "freezes" the cursor state until manually unlocked.
   *
   * @param cursor - The cursor type to lock to
   *
   * @example
   * ```typescript
   * // Lock to loading cursor during async operation
   * cursorLayer.lockCursor("wait");
   *
   * // Lock to grabbing cursor during drag
   * cursorLayer.lockCursor("grabbing");
   * ```
   *
   * @see {@link unlockCursor} to return to automatic behavior
   */
  lockCursor(cursor) {
    this.mode = "manual";
    this.manualCursor = cursor;
    this.applyCursor(cursor);
  }
  /**
   * Unlocks the cursor and returns to automatic cursor management.
   *
   * The cursor will immediately update to reflect the current state
   * based on the component under the mouse (if any). This removes the
   * "lock" and allows the cursor to respond to component interactions again.
   *
   * @example
   * ```typescript
   * // Unlock to return to automatic behavior
   * cursorLayer.unlockCursor();
   *
   * // If mouse is over a block, cursor will immediately show "grab"
   * // If mouse is over empty space, cursor will show "auto"
   * ```
   *
   * @see {@link lockCursor} to disable automatic behavior
   */
  unlockCursor() {
    this.mode = "auto";
    this.manualCursor = void 0;
    if (this.currentTarget) {
      this.updateCursorForTarget(this.currentTarget);
    } else {
      this.applyCursor("auto");
    }
  }
  /**
   * Returns the current operating mode of the cursor layer.
   *
   * @returns The current mode ("auto" or "manual")
   *
   * @example
   * ```typescript
   * if (cursorLayer.getMode() === "manual") {
   *   console.log("Cursor is manually controlled");
   * }
   * ```
   */
  getMode() {
    return this.mode;
  }
  /**
   * Returns the currently set manual cursor type.
   *
   * @returns The manual cursor type, or undefined if not in manual mode
   *
   * @example
   * ```typescript
   * const manualCursor = cursorLayer.getManualCursor();
   * if (manualCursor) {
   *   console.log(`Manual cursor: ${manualCursor}`);
   * }
   * ```
   */
  getManualCursor() {
    return this.manualCursor;
  }
  /**
   * Checks if the cursor layer is currently in manual mode.
   *
   * @returns True if in manual mode, false otherwise
   *
   * @example
   * ```typescript
   * if (cursorLayer.isManual()) {
   *   // Manual cursor is active
   *   console.log("Manual cursor:", cursorLayer.getManualCursor());
   * }
   * ```
   */
  isManual() {
    return this.mode === "manual";
  }
  /**
   * Checks if the cursor layer is currently in automatic mode.
   *
   * @returns True if in automatic mode, false otherwise
   *
   * @example
   * ```typescript
   * if (cursorLayer.isAuto()) {
   *   // Cursor changes automatically based on components
   *   console.log("Current target:", cursorLayer.getCurrentTarget());
   * }
   * ```
   */
  isAuto() {
    return this.mode === "auto";
  }
  /**
   * Returns the component currently under the mouse cursor.
   *
   * This method is primarily intended for debugging and development.
   * The value is tracked regardless of the current mode.
   *
   * @returns The component under the cursor, or undefined if none
   *
   * @example
   * ```typescript
   * const target = cursorLayer.getCurrentTarget();
   * if (target) {
   *   console.log("Mouse over:", target.constructor.name);
   *   console.log("Component cursor:", target.cursor);
   * }
   * ```
   */
  getCurrentTarget() {
    return this.currentTarget;
  }
};

// node_modules/@gravity-ui/graph/build/graphEvents.js
var extractNativeGraphMouseEvent = (event) => {
  return event.detail.sourceEvent instanceof MouseEvent ? event.detail.sourceEvent : null;
};
var graphMouseEvents = ["mousedown", "click", "dblclick", "mouseenter", "mousemove", "mouseleave"];
function isNativeGraphEventName(eventType) {
  return graphMouseEvents.includes(eventType);
}
var GraphEvent = class extends CustomEvent {
  constructor() {
    super(...arguments);
    this.graphEventDefaultPrevented = false;
    this.graphEventPropagationStopped = false;
  }
  preventGraphEventDefault() {
    this.graphEventDefaultPrevented = true;
  }
  stopGraphEventPropagation() {
    this.graphEventPropagationStopped = true;
  }
  isDefaultPrevented() {
    return this.graphEventDefaultPrevented || this.defaultPrevented;
  }
};
function isGraphEvent(event) {
  return event instanceof CustomEvent && "graphEventDefaultPrevented" in event && "graphEventPropagationStopped" in event;
}

// node_modules/@gravity-ui/graph/build/utils/functions/dragListener.js
function getDragListenerDocument(node) {
  if (node instanceof Document) {
    return node;
  }
  return node.ownerDocument;
}
function installTextSelectionSuppression(doc, graph) {
  const root = graph?.getGraphCanvas() ?? doc.documentElement;
  doc.defaultView?.getSelection()?.removeAllRanges();
  const onSelectStart = (event) => {
    event.preventDefault();
  };
  doc.addEventListener("selectstart", onSelectStart, { capture: true });
  const prevUserSelect = root.style.userSelect;
  root.style.userSelect = "none";
  return () => {
    doc.removeEventListener("selectstart", onSelectStart, { capture: true });
    root.style.userSelect = prevUserSelect;
  };
}
function dragListener(document2, options) {
  const stopOnMouseLeave = options?.stopOnMouseLeave ?? false;
  const graph = options?.graph;
  const dragCursor = options?.dragCursor;
  const component = options?.component;
  const autopanning = options?.autopanning ?? Boolean(graph);
  const suppressTextSelection = options?.suppressTextSelection ?? true;
  const threshold = options?.threshold ?? graph?.rootStore.settings.$dragThreshold.value ?? 0;
  const dragDocument = getDragListenerDocument(document2);
  let releaseTextSelection = null;
  const ensureTextSelectionSuppressed = () => {
    if (!suppressTextSelection || releaseTextSelection !== null) {
      return;
    }
    releaseTextSelection = installTextSelectionSuppression(dragDocument, graph);
  };
  const cleanupTextSelection = () => {
    releaseTextSelection?.();
    releaseTextSelection = null;
  };
  let started = false;
  let finished = false;
  let thresholdExceeded = false;
  let startX = null;
  let startY = null;
  let lastMouseEvent;
  const emitter = new Emitter();
  const mousemoveBinded = (event) => {
    lastMouseEvent = event;
    mousemove(emitter, event);
  };
  const mouseupBinded = mouseup.bind(null, emitter);
  const handleCameraChange = () => {
    if (started && !finished && lastMouseEvent) {
      emitter.emit(EVENTS.DRAG_UPDATE, lastMouseEvent);
    }
  };
  const unsubscribeCamera = graph && autopanning ? graph.$camera.subscribe(handleCameraChange) : void 0;
  const checkThreshold = (event) => {
    if (startX === null || startY === null) {
      startX = event.clientX;
      startY = event.clientY;
    }
    if (threshold <= 0) {
      return true;
    }
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance >= threshold;
  };
  const startDrag = (event) => {
    started = true;
    thresholdExceeded = true;
    if (suppressTextSelection) {
      ensureTextSelectionSuppressed();
      event.preventDefault();
      dragDocument.defaultView?.getSelection()?.removeAllRanges();
    }
    if (graph) {
      if (autopanning) {
        graph.cameraService.enableAutoPanning();
      }
      if (dragCursor) {
        graph.lockCursor(dragCursor);
      }
      if (component) {
        graph.getGraphLayer().captureEvents(component);
      }
    }
    emitter.emit(EVENTS.DRAG_START, event);
    document2.addEventListener("mousemove", mousemoveBinded);
  };
  const handleThresholdMove = (event) => {
    if (finished || thresholdExceeded) {
      return;
    }
    if (checkThreshold(event)) {
      document2.removeEventListener("mousemove", handleThresholdMove, { capture: true });
      startDrag(event);
    }
  };
  const cleanup = () => {
    cleanupTextSelection();
    unsubscribeCamera?.();
    document2.removeEventListener("mousemove", mousemoveBinded);
    if (threshold > 0) {
      document2.removeEventListener("mousemove", handleThresholdMove, { capture: true });
    }
  };
  const cleanupDragState = () => {
    if (graph) {
      if (autopanning) {
        graph.cameraService.disableAutoPanning();
      }
      if (dragCursor) {
        graph.unlockCursor();
      }
      if (component) {
        graph.getGraphLayer().releaseCapture();
      }
    }
  };
  if (stopOnMouseLeave) {
    document2.addEventListener("mouseleave", (event) => {
      finished = true;
      if (started) {
        mouseupBinded(event);
        cleanupDragState();
      }
      cleanup();
    }, { once: true, capture: true });
  }
  if (threshold > 0) {
    document2.addEventListener("mousemove", handleThresholdMove, { capture: true });
  } else {
    document2.addEventListener("mousemove", (event) => {
      if (finished) {
        return;
      }
      startDrag(event);
    }, { once: true, capture: true });
  }
  document2.addEventListener("mouseup", (event) => {
    finished = true;
    if (started) {
      mouseupBinded(event);
      cleanupDragState();
    }
    cleanup();
  }, { once: true, capture: true });
  document2.addEventListener("mousedown", () => {
    cleanup();
  }, { once: true, capture: true });
  emitter.on("cancel", () => {
    finished = true;
    if (started) {
      cleanupDragState();
    }
    cleanup();
  });
  return emitter;
}
function stopDragListening(emitter) {
  emitter.emit("cancel");
}
function mousemove(emitter, event) {
  emitter.emit(EVENTS.DRAG_UPDATE, event);
}
function mouseup(emitter, event) {
  emitter.emit(EVENTS.DRAG_END, event);
  emitter.destroy();
}

// node_modules/@gravity-ui/graph/build/services/camera/Camera.js
var Camera = class extends EventedComponent {
  constructor(props, parent) {
    super(props, parent);
    this.handleCameraStateChange = (state) => {
      const isAutoPanningEnabled = state.autoPanningEnabled;
      if (isAutoPanningEnabled) {
        this.startAutoPanning();
      } else {
        this.stopAutoPanning();
      }
    };
    this.handleClick = () => {
      this.context.graph.api.unsetSelection();
    };
    this.handleMouseMoveForAutoPan = (event) => {
      this.lastMouseEvent = event;
    };
    this.handleMouseDownEvent = (event) => {
      const nativeEvent = event.detail.sourceEvent;
      if (!(nativeEvent instanceof MouseEvent)) {
        return;
      }
      if (!this.context.graph.rootStore.settings.getConfigFlag("canDragCamera")) {
        return;
      }
      if (isGraphEvent(event) && event.isDefaultPrevented()) {
        return;
      }
      if (isMetaKeyEvent(nativeEvent)) {
        return;
      }
      if (nativeEvent.button === 1) {
        event.preventDefault();
      } else if (event.detail.target !== this && this.isTargetDraggable(event.detail.target)) {
        return;
      }
      event.preventDefault();
      dragListener(this.ownerDocument, { graph: this.context.graph, autopanning: false, dragCursor: "grabbing" }).on(EVENTS.DRAG_START, (event2) => this.onDragStart(event2)).on(EVENTS.DRAG_UPDATE, (event2) => this.onDragUpdate(event2)).on(EVENTS.DRAG_END, () => this.onDragEnd());
    };
    this.handleWheelEvent = (event) => {
      if (!this.context.graph.rootStore.settings.getConfigFlag("canZoomCamera")) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      const intent = this.context.graph.rootStore.settings.wheelIntentFromEvent(event, {
        mouseWheelBehavior: this.context.constants.camera.MOUSE_WHEEL_BEHAVIOR,
        wheelInputDevice: this.context.constants.camera.WHEEL_INPUT_DEVICE
      });
      if (intent === EWheelIntent.Pan) {
        this.handlePan(event);
        return;
      }
      const acceleration = isPinchZoomGesture(event) ? this.context.constants.camera.PINCH_ZOOM_SPEED : 1;
      this.handleZoom(event, acceleration);
    };
    this.camera = this.context.camera;
    this.ownerDocument = this.context.ownerDocument;
    this.addWheelListener();
    this.addEventListener("click", this.handleClick);
    this.context.graph.on("mousedown", this.handleMouseDownEvent);
    this.unsubscribeCamera = this.context.graph.$camera.subscribe(this.handleCameraStateChange);
  }
  setRoot() {
    this.setContext({
      root: this.props.root
    });
    this.addWheelListener(this.props.root);
  }
  addWheelListener(root = this.props.root) {
    root?.addEventListener("wheel", this.handleWheelEvent, { passive: false });
  }
  propsChanged(nextProps) {
    if (this.props.root !== nextProps.root) {
      this.props.root?.removeEventListener("wheel", this.handleWheelEvent);
      this.addWheelListener(nextProps.root);
    }
    super.propsChanged(nextProps);
  }
  unmount() {
    super.unmount();
    this.stopAutoPanning();
    this.props.root?.removeEventListener("wheel", this.handleWheelEvent);
    this.context.graph.off("mousedown", this.handleMouseDownEvent);
    this.unsubscribeCamera?.();
  }
  startAutoPanning() {
    if (this.removeAutoPanScheduler) {
      return;
    }
    this.props.root?.addEventListener("mousemove", this.handleMouseMoveForAutoPan);
    this.removeAutoPanScheduler = schedule(() => {
      this.performAutoPan();
    }, {
      priority: ESchedulerPriority.HIGH,
      frameInterval: 1
      // Execute every frame
    });
  }
  stopAutoPanning() {
    if (this.removeAutoPanScheduler) {
      this.removeAutoPanScheduler();
      this.removeAutoPanScheduler = void 0;
    }
    this.props.root?.removeEventListener("mousemove", this.handleMouseMoveForAutoPan);
    this.lastMouseEvent = void 0;
  }
  performAutoPan() {
    if (!this.lastMouseEvent || !this.props.root) {
      return;
    }
    const rect = this.props.root.getBoundingClientRect();
    const mouseX = this.lastMouseEvent.clientX - rect.left;
    const mouseY = this.lastMouseEvent.clientY - rect.top;
    const cameraState = this.camera.getCameraState();
    const insets = cameraState.viewportInsets;
    const AUTO_PAN_THRESHOLD = this.context.constants.camera.AUTO_PAN_THRESHOLD;
    const AUTO_PAN_SPEED = this.context.constants.camera.AUTO_PAN_SPEED;
    const viewportLeft = insets.left;
    const viewportRight = cameraState.width - insets.right;
    const viewportTop = insets.top;
    const viewportBottom = cameraState.height - insets.bottom;
    let deltaX = 0;
    let deltaY = 0;
    if (mouseX < viewportLeft + AUTO_PAN_THRESHOLD && mouseX >= viewportLeft) {
      const ratio = 1 - (mouseX - viewportLeft) / AUTO_PAN_THRESHOLD;
      deltaX = AUTO_PAN_SPEED * ratio;
    } else if (mouseX > viewportRight - AUTO_PAN_THRESHOLD && mouseX <= viewportRight) {
      const ratio = 1 - (viewportRight - mouseX) / AUTO_PAN_THRESHOLD;
      deltaX = -AUTO_PAN_SPEED * ratio;
    }
    if (mouseY < viewportTop + AUTO_PAN_THRESHOLD && mouseY >= viewportTop) {
      const ratio = 1 - (mouseY - viewportTop) / AUTO_PAN_THRESHOLD;
      deltaY = AUTO_PAN_SPEED * ratio;
    } else if (mouseY > viewportBottom - AUTO_PAN_THRESHOLD && mouseY <= viewportBottom) {
      const ratio = 1 - (viewportBottom - mouseY) / AUTO_PAN_THRESHOLD;
      deltaY = -AUTO_PAN_SPEED * ratio;
    }
    if (deltaX !== 0 || deltaY !== 0) {
      this.camera.move(deltaX, deltaY);
    }
  }
  /**
   * DragService handles draggable graph components; camera pan is deferred in that case.
   */
  isTargetDraggable(target) {
    return target instanceof GraphComponent && target.isDraggable();
  }
  onDragStart(event) {
    this.lastDragEvent = event;
  }
  onDragUpdate(event) {
    if (!this.lastDragEvent) {
      return;
    }
    this.camera.move(event.pageX - this.lastDragEvent.pageX, event.pageY - this.lastDragEvent.pageY);
    this.lastDragEvent = event;
  }
  onDragEnd() {
    this.lastDragEvent = void 0;
  }
  /**
   * Applies a pan delta from wheel input.
   *
   * Transitional: invoked directly from {@link handleWheelEvent}. Will become a handler
   * for a semantic `camera:pan` graph event once the input event bus replaces raw DOM subscriptions.
   */
  handlePan(event) {
    const hasWrongHorizontalScroll = event.shiftKey && Math.abs(event.deltaY) > 1e-3;
    const panSpeed = this.context.constants.camera.PAN_SPEED;
    this.moveWithEdges((hasWrongHorizontalScroll ? -event.deltaY : -event.deltaX) * panSpeed, (hasWrongHorizontalScroll ? -event.deltaX : -event.deltaY) * panSpeed);
  }
  /**
   * Applies a zoom delta from wheel input.
   *
   * Transitional: invoked directly from {@link handleWheelEvent}. Will become a handler
   * for a semantic `camera:zoom` graph event once the input event bus replaces raw DOM subscriptions.
   */
  handleZoom(event, acceleration = 1) {
    if (!event.deltaY) {
      return;
    }
    const xy = getXY(this.context.canvas, event);
    const pinchSpeed = Math.sign(event.deltaY) * clamp(Math.abs(event.deltaY), 1, 20);
    const dScale = this.context.constants.camera.STEP * this.context.constants.camera.SPEED * pinchSpeed * acceleration;
    const cameraScale = this.camera.getCameraScale();
    const smoothDScale = dScale * cameraScale;
    this.camera.zoom(xy[0], xy[1], cameraScale - smoothDScale);
  }
  moveWithEdges(deltaX, deltaY) {
    const uR = this.context.graph.api.getUsableRect();
    const cameraState = this.camera.getCameraState();
    const gapX = cameraState.relativeWidth;
    const gapY = cameraState.relativeHeight;
    const moveToRight = deltaX > 0;
    const moveToLeft = deltaX < 0;
    const moveToTop = deltaY > 0;
    const moveToBottop = deltaY < 0;
    if (moveToRight && uR.x - gapX > cameraState.relativeX * -1) {
      deltaX = 0;
    }
    if (moveToLeft && uR.x + uR.width + gapX < cameraState.relativeX * -1 + cameraState.relativeWidth) {
      deltaX = 0;
    }
    if (moveToTop && uR.y - gapY > cameraState.relativeY * -1) {
      deltaY = 0;
    }
    if (moveToBottop && uR.y + uR.height + gapY < cameraState.relativeY * -1 + cameraState.relativeHeight) {
      deltaY = 0;
    }
    this.camera.move(deltaX, deltaY);
  }
  render() {
    this.context.layer.resetTransform();
  }
  updateChildren() {
    return this.props.children;
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/blocks/Blocks.js
var Blocks = class extends Component {
  constructor(props, context) {
    super(props, context);
    this.blocks = [];
    this.blocksView = {};
    this.unsubscribe = this.subscribe();
    this.prepareFont(this.getFontScale());
  }
  getFontScale() {
    return this.context.graph.rootStore.settings.getConfigFlag("scaleFontSize");
  }
  rerender() {
    this.shouldRenderChildren = true;
    this.shouldUpdateChildren = true;
    this.performRender();
  }
  subscribe() {
    this.blocks = this.context.graph.rootStore.blocksList.$blocks.value;
    this.blocksView = this.context.graph.rootStore.settings.getConfigFlag("blockComponents");
    return [
      this.context.graph.rootStore.blocksList.$blocks.subscribe((blocks) => {
        this.blocks = blocks;
        this.rerender();
      }),
      this.context.graph.rootStore.settings.$blockComponents.subscribe((blockComponents) => {
        this.blocksView = blockComponents;
        this.rerender();
      })
    ];
  }
  prepareFont(scaleFontSize) {
    this.font = `bold ${Math.round(this.context.constants.text.BASE_FONT_SIZE * scaleFontSize)}px sans-serif`;
  }
  unmount() {
    super.unmount();
    this.unsubscribe.forEach((cb) => cb());
  }
  updateChildren() {
    return this.blocks.map((block, index) => {
      return (this.blocksView[block.$state.value.is] || Block).create({
        id: block.id,
        initialIndex: index,
        font: this.font
      }, {
        key: block.id
      });
    });
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/connections/BlockConnections.js
var BlockConnections = class extends Component {
  get connections() {
    return this.context.graph.rootStore.connectionsList.$connections.value;
  }
  constructor(props, parent) {
    super(props, parent);
    this.scheduleUpdate = debounce(() => {
      this.performRender();
      this.shouldUpdateChildren = true;
    }, {
      priority: ESchedulerPriority.HIGHEST,
      frameInterval: 1
    });
    this.batch = new BatchPath2DRenderer(() => this.performRender(), this.context.constants.connection.PATH2D_CHUNK_SIZE || 100);
    this.unsubscribe = this.subscribe();
    this.setContext({
      batch: this.batch
    });
  }
  subscribe() {
    return [
      this.context.graph.rootStore.settings.$connectionsSettings.subscribe(() => {
        this.scheduleUpdate();
      }),
      this.context.graph.rootStore.connectionsList.$connections.subscribe(() => {
        this.scheduleUpdate();
      }),
      this.context.graph.rootStore.settings.$connection.subscribe(() => {
        this.scheduleUpdate();
      })
    ];
  }
  unmount() {
    super.unmount();
    this.scheduleUpdate.cancel();
    this.unsubscribe.forEach((reactionDisposer) => reactionDisposer());
  }
  updateChildren() {
    if (!this.connections)
      return [];
    const settings = this.context.graph.rootStore.settings.$connectionsSettings.value;
    const ConnectionCtop = this.context.graph.rootStore.settings.$connection.value || BlockConnection;
    return this.connections.map((connection) => {
      const props = {
        id: connection.id,
        useBezier: settings.useBezierConnections,
        bezierDirection: settings.bezierConnectionDirection,
        showConnectionLabels: settings.showConnectionLabels,
        showConnectionArrows: settings.showConnectionArrows
      };
      return ConnectionCtop.create(props, { key: String(connection.id) });
    });
  }
  render() {
    const paths = this.batch.orderedPaths.get();
    for (const path of paths) {
      path.render(this.context.ctx);
    }
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/layers/graphLayer/GraphLayer.js
var rootBubblingEventTypes = /* @__PURE__ */ new Set([
  "mousedown",
  "touchstart",
  "mouseup",
  "touchend",
  "click",
  "dblclick",
  "contextmenu"
]);
var GraphLayer = class extends Layer {
  constructor(props) {
    super({
      canvas: {
        zIndex: 2,
        classNames: ["no-user-select", "no-pointer-events"],
        transformByCameraPosition: true
      },
      // HTML element creation is now separated into framework-specific layers
      ...props
    });
    this.pointerPressed = false;
    this.handleMouseDownEvent = (event) => {
      return this.onRootPointerStart(event);
    };
    const canvas = this.getCanvas();
    this.setContext({
      canvas,
      ctx: canvas.getContext("2d"),
      root: this.props.root,
      camera: this.props.camera,
      ownerDocument: canvas.ownerDocument,
      constants: this.props.graph.graphConstants,
      colors: this.props.graph.graphColors,
      graph: this.props.graph
    });
    if (this.context.root) {
      this.attachListeners();
    }
    this.camera = this.props.camera;
    this.performRender = this.performRender.bind(this);
  }
  afterInit() {
    this.setContext({
      root: this.root
    });
    this.attachListeners();
    this.context.graph.rootStore.blocksList.$blocks.subscribe(() => {
      this.performRender();
    });
    this.context.graph.rootStore.connectionsList.$connections.subscribe(() => {
      this.performRender();
    });
    super.afterInit();
  }
  onCameraChange(camera) {
    if (this.context.graph.rootStore.settings.getConfigFlag("emulateMouseEventsOnCameraChange")) {
      this.onCameraChangeEmulateMouseEvents(camera);
    }
  }
  /**
   * Attaches DOM event listeners to the root element.
   * All event listeners are registered with the rootOn wrapper method to ensure they are properly cleaned up
   * when the layer is unmounted. This eliminates the need for manual event listener removal.
   */
  attachListeners() {
    if (!this.root)
      return;
    rootBubblingEventTypes.forEach((type) => this.onRootEvent(type, this));
    this.onRootEvent("mousemove", this);
  }
  /*
   * Capture element for future events
   * When element is captured, it will be used as target for future events
   * until releaseCapture is called
   * @param component - element to capture
   */
  captureEvents(component) {
    this.capturedTargetComponent = component;
  }
  releaseCapture() {
    this.capturedTargetComponent = void 0;
  }
  handleEvent(e2) {
    if (e2.type === "mousemove") {
      this.updateTargetComponent(e2);
      this.onRootPointerMove(e2);
      this.targetComponent?._trackAreaHover();
      return;
    }
    switch (e2.type) {
      case "mousedown":
      case "touchstart": {
        this.updateTargetComponent(e2, true);
        this.tryEmulateClick(e2);
        this.handleMouseDownEvent(e2);
        break;
      }
      case "mouseup":
      case "touchend": {
        this.tryEmulateClick(e2);
        this.onRootPointerEnd(e2);
        break;
      }
      case "click":
      case "dblclick": {
        this.tryEmulateClick(e2);
        break;
      }
    }
    return;
  }
  dispatchNativeEvent(type, event, targetComponent) {
    const graphEvent = this.props.graph.emit(type, {
      target: targetComponent,
      pointerPressed: this.pointerPressed,
      sourceEvent: event
    });
    if (graphEvent.defaultPrevented) {
      event.preventDefault();
      return false;
    }
    if (isGraphEvent(graphEvent) && graphEvent.graphEventPropagationStopped) {
      return false;
    }
    return true;
  }
  applyEventToTargetComponent(event, target = this.targetComponent) {
    if (isNativeGraphEventName(event.type)) {
      if (!this.dispatchNativeEvent(event.type, event, target)) {
        return;
      }
    }
    if (!target || typeof target.dispatchEvent !== "function")
      return;
    target.dispatchEvent(event);
  }
  updateTargetComponent(event, force = false) {
    if (!force && this.eventByTargetComponent && getEventDelta(event, this.eventByTargetComponent) < 3)
      return;
    this.eventByTargetComponent = event;
    if (this.capturedTargetComponent) {
      this.targetComponent = this.capturedTargetComponent;
      return;
    }
    this.prevTargetComponent = this.targetComponent;
    const point = this.context.graph.getPointInCameraSpace(event);
    if (point.origPoint) {
      this.lastMouseCanvasX = point.origPoint.x;
      this.lastMouseCanvasY = point.origPoint.y;
    }
    this.targetComponent = this.context.graph.getElementOverPoint(point) || this.$.camera;
  }
  onCameraChangeEmulateMouseEvents(camera) {
    if (this.lastMouseCanvasX === void 0 || this.lastMouseCanvasY === void 0)
      return;
    if (this.capturedTargetComponent)
      return;
    const [worldX, worldY] = this.context.camera.applyToPoint(this.lastMouseCanvasX, this.lastMouseCanvasY);
    const point = new Point(worldX, worldY, { x: this.lastMouseCanvasX, y: this.lastMouseCanvasY });
    const newTarget = this.context.graph.getElementOverPoint(point) || this.$.camera;
    if (newTarget === this.targetComponent)
      return;
    const fakeEvent = new MouseEvent("mousemove", {
      clientX: camera.x,
      clientY: camera.y,
      bubbles: false,
      cancelable: false
    });
    this.prevTargetComponent = this.targetComponent;
    this.targetComponent = newTarget;
    this.onRootPointerMove(fakeEvent);
  }
  onRootPointerMove(event) {
    if (this.targetComponent !== this.prevTargetComponent) {
      this.prevTargetComponent?._clearAreaHover(true);
      this.applyEventToTargetComponent(new CustomEvent("mouseleave", {
        bubbles: false,
        detail: {
          target: this.prevTargetComponent,
          sourceEvent: event,
          pointerPressed: this.pointerPressed
        }
      }), this.prevTargetComponent);
      this.applyEventToTargetComponent(new CustomEvent("mouseout", {
        bubbles: true,
        detail: {
          target: this.prevTargetComponent,
          sourceEvent: event,
          pointerPressed: this.pointerPressed
        }
      }), this.prevTargetComponent);
      this.applyEventToTargetComponent(new CustomEvent("mouseenter", {
        bubbles: false,
        detail: {
          target: this.targetComponent,
          sourceEvent: event,
          pointerPressed: this.pointerPressed
        }
      }), this.targetComponent);
      this.applyEventToTargetComponent(new CustomEvent("mouseover", {
        bubbles: true,
        detail: {
          target: this.targetComponent,
          sourceEvent: event,
          pointerPressed: this.pointerPressed
        }
      }), this.targetComponent);
    }
  }
  onRootPointerStart(event) {
    if (event.button === 2) {
      return;
    }
    this.pointerPressed = true;
    this.applyEventToTargetComponent(event);
  }
  onRootPointerEnd(event) {
    if (event.button === 2) {
      return;
    }
    this.pointerPressed = false;
    this.applyEventToTargetComponent(event);
  }
  tryEmulateClick(event, target = this.targetComponent) {
    if ((event.type === "mousedown" || event.type === "touchstart") && target !== void 0) {
      this.canEmulateClick = false;
      this.pointerStartTarget = target;
      this.pointerStartEvent = event;
    }
    if ((event.type === "mouseup" || event.type === "touchend") && (this.pointerStartTarget === target || // connections can be very close to each other
    this.pointerStartTarget instanceof BlockConnection && target instanceof BlockConnection) && // pointerStartEvent can be undefined if mousedown/touchstart event happened over dialog backdrop
    this.pointerStartEvent && getEventDelta(this.pointerStartEvent, event) < 3) {
      this.canEmulateClick = true;
    }
    if (this.canEmulateClick && (event.type === "click" || event.type === "dblclick")) {
      this.applyEventToTargetComponent(new MouseEvent(event.type, event), this.pointerStartTarget);
    }
  }
  updateChildren() {
    const cameraProps = {
      children: [BlockConnections.create(), Blocks.create()],
      root: this.root
    };
    return [Camera.create(cameraProps, { ref: "camera" })];
  }
};

// node_modules/@gravity-ui/graph/build/utils/renderers/render.js
function render(ctx, cb) {
  ctx.save();
  cb(ctx);
  ctx.restore();
}

// node_modules/@gravity-ui/graph/build/components/canvas/layers/selectionLayer/SelectionLayer.js
function getSelectionRect(sx, sy, ex, ey) {
  if (sx > ex)
    [sx, ex] = [ex, sx];
  if (sy > ey)
    [sy, ey] = [ey, sy];
  return [sx, sy, ex - sx, ey - sy];
}
var SelectionLayer = class extends Layer {
  constructor(props) {
    super({
      canvas: {
        zIndex: 4,
        classNames: ["no-pointer-events"],
        transformByCameraPosition: true,
        // Automatically apply camera transformation
        ...props.canvas
      },
      ...props
    });
    this.selectionStartWorld = null;
    this.selectionEndWorld = null;
    this.handleMouseDown = (nativeEvent) => {
      if (!this.root?.ownerDocument) {
        return;
      }
      const event = extractNativeGraphMouseEvent(nativeEvent);
      const target = nativeEvent.detail.target;
      if (!(target instanceof Camera)) {
        return;
      }
      if (event && isMetaKeyEvent(event)) {
        if (isGraphEvent(nativeEvent)) {
          nativeEvent.stopGraphEventPropagation();
        }
        this.context.graph.dragService.startDrag({
          onStart: this.startSelectionRender,
          onUpdate: this.updateSelectionRender,
          onEnd: this.endSelectionRender
        });
      }
    };
    this.updateSelectionRender = (event, [worldX, worldY]) => {
      this.selectionEndWorld = { x: worldX, y: worldY };
      this.performRender();
    };
    this.startSelectionRender = (_event, [worldX, worldY]) => {
      this.selectionStartWorld = { x: worldX, y: worldY };
      this.selectionEndWorld = { x: worldX, y: worldY };
    };
    this.endSelectionRender = (event) => {
      if (!this.selectionStartWorld || !this.selectionEndWorld) {
        return;
      }
      const hasSizeX = Math.abs(this.selectionEndWorld.x - this.selectionStartWorld.x) > 0.1;
      const hasSizeY = Math.abs(this.selectionEndWorld.y - this.selectionStartWorld.y) > 0.1;
      if (!hasSizeX || !hasSizeY) {
        this.selectionStartWorld = null;
        this.selectionEndWorld = null;
        this.performRender();
        return;
      }
      const worldRect = getSelectionRect(this.selectionStartWorld.x, this.selectionStartWorld.y, this.selectionEndWorld.x, this.selectionEndWorld.y);
      this.applySelectedArea(worldRect[0], worldRect[1], worldRect[2], worldRect[3], event.shiftKey);
      this.selectionStartWorld = null;
      this.selectionEndWorld = null;
      this.performRender();
    };
    this.setContext({
      canvas: this.getCanvas(),
      ctx: this.getCanvas().getContext("2d")
    });
  }
  /**
   * Called after initialization and when the layer is reattached.
   * This is where we set up event subscriptions to ensure they work properly
   * after the layer is unmounted and reattached.
   */
  afterInit() {
    this.onGraphEvent("mousedown", this.handleMouseDown, {
      capture: true
    });
    super.afterInit();
  }
  render() {
    this.resetTransform();
    if (!this.hasActiveSelection()) {
      return;
    }
    this.drawSelectionArea();
  }
  hasActiveSelection() {
    return this.selectionStartWorld !== null && this.selectionEndWorld !== null;
  }
  drawSelectionArea() {
    if (!this.selectionStartWorld || !this.selectionEndWorld) {
      return;
    }
    const x2 = Math.min(this.selectionStartWorld.x, this.selectionEndWorld.x);
    const y2 = Math.min(this.selectionStartWorld.y, this.selectionEndWorld.y);
    const width = Math.abs(this.selectionEndWorld.x - this.selectionStartWorld.x);
    const height = Math.abs(this.selectionEndWorld.y - this.selectionStartWorld.y);
    render(this.context.ctx, (ctx) => {
      ctx.fillStyle = this.context.colors.selection.background;
      ctx.strokeStyle = this.context.colors.selection.border;
      ctx.beginPath();
      ctx.lineWidth = Math.round(1 / this.context.graph.cameraService.getCameraScale());
      ctx.roundRect(x2, y2, width, height, Number(this.context.graph.layers.getDPR()));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }
  applySelectedArea(x2, y2, w2, h2, shiftPressed) {
    const selectableEntityTypes = this.context.graph.$graphConstants.value.selectionLayer.SELECTABLE_ENTITY_TYPES;
    const shiftStrategy = this.context.graph.$graphConstants.value.selectionLayer.SHIFT_STRATEGY;
    const strategy = shiftPressed && shiftStrategy ? shiftStrategy : this.context.graph.$graphConstants.value.selectionLayer.STRATEGY;
    const elements = this.context.graph.getElementsOverRect({ x: x2, y: y2, width: w2, height: h2 }, selectableEntityTypes);
    this.context.graph.rootStore.selectionService.selectRelatedElements(elements, strategy || ESelectionStrategy.REPLACE);
  }
};

// node_modules/@gravity-ui/graph/build/graphConfig.js
var initGraphColors = {
  anchor: {
    background: "#4a4a4a",
    selectedBorder: "#FFCC00"
  },
  block: {
    background: "#e0e0e0",
    border: "#dfdfdf",
    text: "#272727",
    selectedBorder: "#FFCC00"
  },
  canvas: {
    belowLayerBackground: "#eaeaea",
    layerBackground: "#f9f9f9",
    border: "#EAEAEAFF",
    dots: "#d0d2ce"
  },
  connection: {
    background: "#272727",
    selectedBackground: "#ecc113"
  },
  connectionLabel: {
    background: "#EAEAEA",
    hoverBackground: "#FFCC00",
    selectedBackground: "#FFCC00",
    text: "#777677",
    hoverText: "#777677",
    selectedText: "#777677"
  },
  selection: {
    background: "rgba(0, 0, 0, 0.051)",
    border: "#ecc113"
  }
};
var initGraphConstants = {
  selectionLayer: {
    SELECTABLE_ENTITY_TYPES: [Block],
    STRATEGY: ESelectionStrategy.REPLACE
  },
  system: {
    GRID_SIZE: 16,
    /* @deprecated this config is not used anymore, Layers checks devicePixelRatio internally */
    PIXEL_RATIO: typeof globalThis !== "undefined" ? globalThis.devicePixelRatio || 1 : 1,
    USABLE_RECT_GAP: 400,
    CAMERA_VIEWPORT_TRESHOLD: 0.5
  },
  camera: {
    SPEED: 1,
    STEP: 8e-3,
    AUTO_PAN_THRESHOLD: 50,
    AUTO_PAN_SPEED: 5,
    MOUSE_WHEEL_BEHAVIOR: "zoom",
    WHEEL_INPUT_DEVICE: "auto",
    PINCH_ZOOM_SPEED: 1,
    PAN_SPEED: 1
  },
  block: {
    WIDTH_MIN: 16 * 10,
    BORDER_WIDTH: 3,
    HEAD_HEIGHT: 16 * 4,
    BODY_PADDING: 16 * 1.5,
    SCALES: [0.125, 0.225, 0.7],
    DEFAULT_Z_INDEX: 1,
    INCRIMENT_Z_INDEX: 10,
    GHOST_BLOCK_OPACITY: 0.7,
    WIDTH: 200,
    HEIGHT: 160,
    SNAPPING_GRID_SIZE: 1
  },
  connection: {
    MUTED_CANVAS_CONNECTION_WIDTH: 0.8,
    SCALES: [0.01, 0.125, 0.125],
    DEFAULT_Z_INDEX: 0,
    THRESHOLD_LINE_HIT: 8,
    MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL: 0.25,
    PATH2D_CHUNK_SIZE: 100,
    LABEL: {
      INNER_PADDINGS: [0, 0, 0, 0]
    }
  },
  text: {
    BASE_FONT_SIZE: 24,
    PADDING: 10
  }
};

// node_modules/@gravity-ui/graph/build/services/KeyboardService/index.js
var KeyboardService = class {
  constructor(graph) {
    this.graph = graph;
    this.$keyboardState = y({
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false
    });
    this.lastEvent = null;
    this.unsubscribes = [];
    this.keybordEvents = new EventTarget();
    this.handleKeyDown = (event) => {
      if (this.hasChanged(event)) {
        this.lastEvent = event;
        this.$keyboardState.value = {
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey
        };
      }
      this.notifyKeyCode(event);
    };
    this.graph.on("state-change", (event) => {
      if (event.detail.state === GraphState.READY) {
        this.startListening();
      } else if (event.detail.state === GraphState.INIT) {
        this.stopListening();
      }
    });
  }
  isShiftPressed() {
    return this.$keyboardState.value.shiftKey;
  }
  isMetaPressed() {
    return this.$keyboardState.value.metaKey;
  }
  isCtrlPressed() {
    return this.$keyboardState.value.ctrlKey;
  }
  isAltPressed() {
    return this.$keyboardState.value.altKey;
  }
  startListening() {
    this.graph.layers.$root?.ownerDocument?.addEventListener("keydown", this.handleKeyDown, {
      capture: true
    });
    this.graph.layers.$root?.ownerDocument?.addEventListener("keyup", this.handleKeyDown, {
      capture: true
    });
    this.unsubscribes.push(() => {
      this.graph.layers.$root?.ownerDocument?.removeEventListener("keydown", this.handleKeyDown, {
        capture: true
      });
      this.graph.layers.$root?.ownerDocument?.removeEventListener("keyup", this.handleKeyDown, {
        capture: true
      });
    });
  }
  onPress(key, cb, options) {
    this.keybordEvents.addEventListener(`press-${key}`, cb, options);
    return () => {
      this.keybordEvents.removeEventListener(`press-${key}`, cb);
    };
  }
  onRelease(key, cb, options) {
    this.keybordEvents.addEventListener(`release-${key}`, cb, options);
    return () => {
      this.keybordEvents.removeEventListener(`release-${key}`, cb);
    };
  }
  stopListening() {
    this.unsubscribes.forEach((unsubscribe) => unsubscribe());
    this.unsubscribes = [];
    this.lastEvent = null;
    this.$keyboardState.value = {
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false
    };
  }
  hasChanged(event) {
    return this.lastEvent?.key !== event.key || this.lastEvent?.shiftKey !== event.shiftKey || this.lastEvent?.metaKey !== event.metaKey || this.lastEvent?.ctrlKey !== event.ctrlKey || this.lastEvent?.altKey !== event.altKey;
  }
  notifyKeyCode(event) {
    if (event.type === "keydown") {
      this.keybordEvents.dispatchEvent(new CustomEvent(`press-${event.key}`, { detail: event }));
    } else if (event.type === "keyup") {
      this.keybordEvents.dispatchEvent(new CustomEvent(`release-${event.key}`, { detail: event }));
    }
  }
  cleanup() {
    this.stopListening();
  }
};

// node_modules/@gravity-ui/graph/build/services/LayersService.js
var Layers = class extends Emitter {
  constructor($root) {
    super();
    this.$root = $root;
    this.attached = false;
    this.rootSize = y({ width: 0, height: 0, dpr: globalThis.devicePixelRatio || 1 });
    this.layers = /* @__PURE__ */ new Set();
    this.resizeObserver = new ResizeObserver(() => {
      this.handleRootResize();
    });
    this.handleRootResize = throttle(() => {
      this.updateSize();
    }, {
      priority: ESchedulerPriority.LOWEST,
      frameInterval: 1
    });
    this.updateSize = () => {
      if (!this.$root) {
        return;
      }
      this.rootSize.value = {
        width: this.$root.clientWidth,
        height: this.$root.clientHeight,
        dpr: this.getDPR()
      };
      this.emit("update-size", this.getRootSize());
    };
  }
  getDPR() {
    return globalThis.devicePixelRatio || 1;
  }
  createLayer(layerCtor, props) {
    const layer = Component.mount(layerCtor, {
      root: this.$root,
      ...props
    });
    this.layers.add(layer);
    if (this.attached) {
      layer.attachLayer(this.$root);
    }
    return layer;
  }
  detachLayer(layer) {
    this.layers.delete(layer);
    layer.detachLayer();
  }
  getRootSize() {
    return this.rootSize.value;
  }
  getLayers() {
    return Array.from(this.layers);
  }
  attach(root = this.$root) {
    this.$root = root;
    this.layers.forEach((layer) => {
      layer.attachLayer(this.$root);
    });
  }
  start(root = this.$root) {
    if (this.attached) {
      return;
    }
    this.attach(root);
    if (!this.$root) {
      throw new Error("Root not specified");
    }
    this.updateSize();
    this.resizeObserver.observe(this.$root, { box: "border-box" });
    window.addEventListener("resize", this.handleRootResize);
    this.unwatchDPR = observeDPR(() => this.updateSize());
    this.attached = true;
  }
  detach(full = false) {
    this.layers.forEach((layer) => {
      layer.detachLayer();
    });
    this.attached = false;
    window.removeEventListener("resize", this.handleRootResize);
    this.unwatchDPR?.();
    this.handleRootResize.cancel();
    this.resizeObserver.disconnect();
    if (full) {
      this.$root = void 0;
    }
  }
  unmount() {
    this.detach(true);
    this.destroy();
  }
  destroy() {
    this.detach();
    this.destroyLayers();
    this.off();
  }
  destroyLayers() {
    this.layers.forEach((layer) => {
      Component.unmount(layer);
    });
  }
};

// node_modules/@gravity-ui/graph/build/services/drag/DragService.js
var DragService = class {
  constructor(graph) {
    this.graph = graph;
    this.dragComponents = [];
    this.startCoords = null;
    this.prevCoords = null;
    this.currentDragEmitter = null;
    this.unsubscribeMouseDown = null;
    this.$state = y(this.createIdleState());
    this.handleMouseDown = (event) => {
      if (this.currentDragEmitter && this.$state.value.isDragging) {
        return;
      }
      const canDrag = this.graph.rootStore.settings.$canDrag.value;
      if (canDrag === ECanDrag.NONE) {
        return;
      }
      const target = event.detail.target;
      if (!target || typeof target.isDraggable !== "function" || !target.isDraggable()) {
        return;
      }
      this.dragComponents = this.collectDragComponents(target, canDrag);
      if (this.dragComponents.length === 0) {
        return;
      }
      if (isGraphEvent(event)) {
        event.stopGraphEventPropagation();
      }
      this.currentDragEmitter = null;
      const doc = this.graph.getGraphCanvas().ownerDocument;
      this.currentDragEmitter = dragListener(doc, {
        graph: this.graph,
        dragCursor: "grabbing",
        autopanning: true
      }).on(EVENTS.DRAG_START, this.handleDragStart).on(EVENTS.DRAG_UPDATE, this.handleDragUpdate).on(EVENTS.DRAG_END, this.handleDragEnd);
    };
    this.handleDragStart = (event) => {
      const coords = this.getWorldCoords(event);
      this.startCoords = coords;
      this.prevCoords = coords;
      this.$state.value = this.createDragState(event, this.dragComponents, coords);
      const context = {
        sourceEvent: event,
        startCoords: coords,
        prevCoords: coords,
        currentCoords: coords,
        components: this.dragComponents
      };
      this.dragComponents.forEach((component) => {
        component.handleDragStart(context);
      });
    };
    this.handleDragUpdate = (event) => {
      if (!this.startCoords || !this.prevCoords) {
        return;
      }
      const currentCoords = this.getWorldCoords(event);
      this.$state.value = {
        ...this.$state.value,
        currentEvent: event,
        currentCoords
      };
      const diff = {
        startCoords: this.startCoords,
        prevCoords: this.prevCoords,
        currentCoords,
        diffX: currentCoords[0] - this.startCoords[0],
        diffY: currentCoords[1] - this.startCoords[1],
        deltaX: currentCoords[0] - this.prevCoords[0],
        deltaY: currentCoords[1] - this.prevCoords[1]
      };
      const context = {
        sourceEvent: event,
        startCoords: this.startCoords,
        prevCoords: this.prevCoords,
        currentCoords,
        components: this.dragComponents
      };
      this.dragComponents.forEach((component) => {
        component.handleDrag(diff, context);
      });
      this.prevCoords = currentCoords;
    };
    this.handleDragEnd = (event) => {
      if (this.startCoords && this.prevCoords) {
        const currentCoords = this.getWorldCoords(event);
        const context = {
          sourceEvent: event,
          startCoords: this.startCoords,
          prevCoords: this.prevCoords,
          currentCoords,
          components: this.dragComponents
        };
        this.dragComponents.forEach((component) => {
          component.handleDragEnd(context);
        });
      }
      this.graph.rootStore.blocksList.flushBatchedBlocksGeometryEmit();
      this.cleanup();
    };
  }
  /**
   * Create idle (not dragging) state
   */
  createIdleState() {
    return {
      isDragging: false,
      initialEvent: null,
      currentEvent: null,
      components: [],
      componentTypes: /* @__PURE__ */ new Set(),
      isMultiple: false,
      isHomogeneous: true,
      startCoords: null,
      currentCoords: null
    };
  }
  /**
   * Create active drag state from components
   */
  createDragState(event, components, startCoords) {
    const componentTypes = new Set(components.map((c2) => c2.constructor.name));
    return {
      isDragging: true,
      initialEvent: event,
      currentEvent: event,
      components,
      componentTypes,
      isMultiple: components.length > 1,
      isHomogeneous: componentTypes.size <= 1,
      startCoords,
      currentCoords: startCoords
    };
  }
  /**
   * Cleanup when service is destroyed
   */
  destroy() {
    this.cleanup();
  }
  /**
   * Collect all components that should participate in drag operation.
   * Behavior depends on canDrag setting:
   * - ALL: If target is in selection, drag all selected draggable components. Otherwise drag only target.
   * - ONLY_SELECTED: Only selected components can be dragged. If target is not selected, returns empty array.
   */
  collectDragComponents(target, canDrag) {
    const selectedComponents = this.graph.selectionService.$selectedComponents.value;
    const targetInSelection = selectedComponents.some((c2) => c2 === target);
    if (canDrag === ECanDrag.ONLY_SELECTED) {
      if (!targetInSelection) {
        return [];
      }
      return selectedComponents.filter((c2) => typeof c2.isDraggable === "function" && c2.isDraggable());
    }
    if (targetInSelection && selectedComponents.length > 0) {
      return selectedComponents.filter((c2) => typeof c2.isDraggable === "function" && c2.isDraggable());
    }
    return [target];
  }
  /**
   * Convert screen coordinates to world coordinates
   */
  getWorldCoords(event) {
    const canvas = this.graph.getGraphCanvas();
    const [screenX, screenY] = getXY(canvas, event);
    return this.graph.cameraService.applyToPoint(screenX, screenY);
  }
  /**
   * Cleanup after drag operation ends
   */
  cleanup() {
    this.currentDragEmitter = null;
    this.dragComponents = [];
    this.startCoords = null;
    this.prevCoords = null;
    if (this.unsubscribeMouseDown) {
      this.unsubscribeMouseDown();
      this.unsubscribeMouseDown = null;
    }
    this.$state.value = this.createIdleState();
  }
  /**
   * Start a custom drag operation for specialized use cases like creating connections or new blocks.
   * This provides a unified API for drag operations without exposing dragListener directly.
   *
   * @param callbacks - Lifecycle callbacks (onStart, onUpdate, onEnd)
   * @param options - Drag options (document, cursor, autopanning, etc.)
   *
   * @example
   * ```typescript
   * // In ConnectionLayer
   * graph.dragService.startOperation(
   *   {
   *     onStart: (event, coords) => this.onStartConnection(event, coords),
   *     onUpdate: (event, coords) => this.onMoveConnection(event, coords),
   *     onEnd: (event, coords) => this.onEndConnection(coords),
   *   },
   *   { cursor: "crosshair", autopanning: true }
   * );
   * ```
   */
  startDrag(callbacks, options = {}) {
    const { document: doc, cursor, autopanning = true, stopOnMouseLeave, threshold, initialEvent, suppressTextSelection } = options;
    const { onStart, onUpdate, onEnd } = callbacks;
    const targetDocument = doc ?? this.graph.getGraphCanvas().ownerDocument;
    return dragListener(targetDocument, {
      graph: this.graph,
      dragCursor: cursor,
      autopanning,
      stopOnMouseLeave,
      threshold,
      suppressTextSelection
    }).on(EVENTS.DRAG_START, (event) => {
      onStart?.(event, initialEvent ? this.getWorldCoords(initialEvent) : this.getWorldCoords(event));
    }).on(EVENTS.DRAG_UPDATE, (event) => {
      const coords = this.getWorldCoords(event);
      onUpdate?.(event, coords);
    }).on(EVENTS.DRAG_END, (event) => {
      const coords = this.getWorldCoords(event);
      onEnd?.(event, coords);
    });
  }
};

// node_modules/@gravity-ui/graph/build/store/index.js
var import_cloneDeep5 = __toESM(require_cloneDeep());

// node_modules/@gravity-ui/graph/build/components/canvas/blocks/generate.js
var generateRandomId = /* @__PURE__ */ (() => {
  let idCounter = 0;
  return function generateRandomIdImpl(key = "model") {
    idCounter += 1;
    return `${key}-${Date.now()}-${idCounter}`;
  };
})();

// node_modules/@gravity-ui/graph/build/store/block/BlocksList.js
var BlockListStore = class {
  constructor(rootStore, graph) {
    this.rootStore = rootStore;
    this.graph = graph;
    this.$blocksMap = y(/* @__PURE__ */ new Map());
    this.$blocks = y([]);
    this.batchedGeometryPending = /* @__PURE__ */ new Map();
    this.batchedGeometryRaf = null;
    this.$blocksReactiveState = g(() => {
      return Array.from(this.$blocksMap.value.values());
    });
    this.$selectedBlockComponents = g(() => {
      return this.blockSelectionBucket.$selectedComponents.value;
    });
    this.$selectedBlocks = g(() => {
      return this.blockSelectionBucket.$selectedEntities.value;
    });
    this.$selectedAnchor = g(() => {
      const entities = this.anchorSelectionBucket.$selectedEntities.value;
      return entities.length > 0 ? entities[0] : void 0;
    });
    this.blockSelectionBucket = new MultipleSelectionBucket("block", (payload, defaultAction) => {
      return this.graph.execut\u0435DefaultEventAction("blocks-selection-change", payload, defaultAction);
    }, (element) => element instanceof Block, (ids) => ids.map((id) => this.getBlockState(id)).filter((block) => block !== void 0));
    this.anchorSelectionBucket = new SingleSelectionBucket("anchor", (diff, defaultAction) => {
      if (diff.changes.add.length > 0) {
        const anchorId = diff.changes.add[0];
        const anchor = this.$blocks.value.flatMap((block) => block.$anchorStates.value).find((a2) => a2.id === anchorId);
        if (anchor) {
          return this.graph.execut\u0435DefaultEventAction("block-anchor-selection-change", { anchor: anchor.asTAnchor(), selected: true }, defaultAction);
        }
      }
      if (diff.changes.removed.length > 0) {
        const anchorId = diff.changes.removed[0];
        const anchor = this.$blocks.value.flatMap((block) => block.$anchorStates.value).find((a2) => a2.id === anchorId);
        if (anchor) {
          return this.graph.execut\u0435DefaultEventAction("block-anchor-selection-change", { anchor: anchor.asTAnchor(), selected: false }, defaultAction);
        }
      }
      return defaultAction();
    }, void 0, (ids) => {
      if (!this.rootStore.settings.getConfigFlag("useBlocksAnchors"))
        return [];
      const result = [];
      for (const block of this.$blocks.value) {
        for (const anchor of block.$anchorStates.value) {
          if (ids.includes(anchor.id)) {
            result.push(anchor);
          }
        }
      }
      return result;
    });
    this.blockSelectionBucket.attachToManager(this.rootStore.selectionService);
    this.anchorSelectionBucket.attachToManager(this.rootStore.selectionService);
  }
  /**
   * Sets anchor selection
   *
   * @param blockId {BlockState["id"]} Block id
   * @param anchorId {AnchorState["id"]} Anchor id
   * @param selected {boolean} Selected
   * @returns void
   */
  setAnchorSelection(blockId, anchorId, selected) {
    const blockState = this.$blocksMap.value.get(blockId);
    if (!blockState) {
      return;
    }
    const anchor = blockState.getAnchorById(anchorId);
    if (!anchor) {
      return;
    }
    if (selected) {
      this.anchorSelectionBucket.select([anchorId], ESelectionStrategy.REPLACE);
    } else {
      this.anchorSelectionBucket.deselect([anchorId]);
    }
  }
  /**
   * Checks if a block is selected
   *
   * @param blockId {BlockState["id"]} Block id
   * @returns {boolean} Is selected
   */
  isSelectedBlock(blockId) {
    return this.blockSelectionBucket.$selected.value.has(blockId);
  }
  unsetAnchorsSelection() {
    this.anchorSelectionBucket.reset();
  }
  /**
   * Updates block position
   *
   * @event block-change
   * @param id {BlockState["id"]} Block id
   * @param nextState {{x: number, y: number}} Next state
   * @returns void
   */
  updatePosition(id, nextState) {
    const blockState = this.$blocksMap.value.get(id);
    if (!blockState) {
      return;
    }
    this.graph.execut\u0435DefaultEventAction("block-change", { block: blockState.asTBlockShallow() }, () => {
      blockState.updateBlock(nextState);
      const geometry = blockState.$geometry.value;
      this.batchedGeometryPending.set(id, { id, ...geometry });
      this.scheduleBatchedBlocksGeometryFlush();
    });
  }
  /**
   * Flushes pending `blocks-geometry-change` immediately (cancels a scheduled rAF if any).
   * Called when a graph drag ends so the last frame is not lost.
   */
  flushBatchedBlocksGeometryEmit() {
    this.clearGeometryRaf();
    this.emitPendingBlocksGeometry();
  }
  scheduleBatchedBlocksGeometryFlush() {
    if (this.batchedGeometryRaf !== null) {
      return;
    }
    this.batchedGeometryRaf = requestAnimationFrame(() => {
      this.batchedGeometryRaf = null;
      this.emitPendingBlocksGeometry();
    });
  }
  clearGeometryRaf() {
    if (this.batchedGeometryRaf !== null) {
      cancelAnimationFrame(this.batchedGeometryRaf);
      this.batchedGeometryRaf = null;
    }
  }
  emitPendingBlocksGeometry() {
    if (this.batchedGeometryPending.size === 0) {
      return;
    }
    const blocks = Array.from(this.batchedGeometryPending.values());
    this.batchedGeometryPending.clear();
    this.graph.emit("blocks-geometry-change", { blocks });
  }
  cancelBatchedBlocksGeometry() {
    this.clearGeometryRaf();
    this.batchedGeometryPending.clear();
  }
  updateBlocksMap(blocks) {
    this.$blocksMap.value = new Map(blocks);
    this.$blocks.value = Array.from(this.$blocksMap.value.values());
  }
  /**
   * Adds block
   *
   * If a block with this id already exists, it will be updated.
   * If id is not provided, a random id will be generated.
   *
   * @param block {Omit<TBlock, "id"> & { id?: TBlockId }} Block to add
   * @returns void
   */
  addBlock(block) {
    const id = block.id || generateRandomId("block");
    this.$blocksMap.value.set(id, this.getOrCraeateBlockState({
      id,
      ...block
    }));
    this.updateBlocksMap(this.$blocksMap.value);
    return id;
  }
  /**
   * Deletes blocks
   *
   * @param blocks {TBlock["id"] | TBlock} Blocks to delete
   * @returns void
   */
  deleteBlocks(blocks) {
    const map = new Map(this.$blocksMap.value);
    blocks.forEach((bId) => {
      const id = isTBlock(bId) ? bId.id : bId;
      const block = map.get(id);
      if (!block) {
        return;
      }
      map.delete(id);
    });
    this.updateBlocksMap(map);
  }
  /**
   * Updates blocks state
   *
   * If block with this id already exists, it will be updated.
   * Otherwise, a new block will be created.
   *
   * @param blocks {TBlock[]} Blocks to update
   * @returns void
   */
  updateBlocks(blocks) {
    this.updateBlocksMap(blocks.reduce((acc, block) => {
      const state = this.getOrCraeateBlockState(block);
      acc.set(block.id, state);
      return acc;
    }, this.$blocksMap.value));
  }
  /**
   * Sets blocks state
   *
   * @param blocks {TBlock[]} Blocks to set
   * @returns void
   */
  setBlocks(blocks) {
    const blockStates = blocks.map((block) => this.getOrCraeateBlockState(block));
    this.applyBlocksState(blockStates);
  }
  getOrCraeateBlockState(block) {
    const blockState = this.$blocksMap.value.get(block.id);
    if (blockState) {
      blockState.updateBlock(block);
      return blockState;
    }
    return BlockState.fromTBlock(this, block);
  }
  applyBlocksState(blocks) {
    this.updateBlocksMap(blocks.map((block) => [block.id, block]));
  }
  /**
   * Updates block selection using the SelectionService
   *
   * @param ids Block IDs to update selection for
   * @param selected Whether to select or deselect
   * @param strategy The selection strategy to apply
   *
   * @returns void
   */
  updateBlocksSelection(ids, selected, strategy = ESelectionStrategy.REPLACE) {
    if (selected) {
      this.blockSelectionBucket.select(ids, strategy);
    } else {
      this.blockSelectionBucket.deselect(ids);
    }
  }
  /**
   * Gets connections of a block
   *
   * Method search connection with source/target block id.
   * If you connect blocks via custom ports, this method will not work.
   *
   * @param blockId {TBlockId} Block id
   * @returns {ConnectionState[]} Connections
   */
  getBlockConnections(blockId) {
    return this.rootStore.connectionsList.$connections.value.filter((connection) => [connection.targetBlockId, connection.sourceBlockId].includes(blockId));
  }
  /**
   * Resets block selection
   *
   * @returns void
   */
  resetSelection() {
    n(() => {
      this.unsetAnchorsSelection();
      this.blockSelectionBucket.reset();
    });
  }
  /**
   * Deletes selected blocks
   *
   * @returns void
   */
  deleteSelectedBlocks() {
    const selectedBlocks = this.$selectedBlocks.value;
    selectedBlocks.forEach((block) => {
      this.deleteAllBlockConnections(block.id);
    });
    const newBlocks = this.$blocks.value.filter((block) => !selectedBlocks.includes(block));
    this.applyBlocksState(newBlocks);
  }
  /**
   * Deletes all connections of a block
   *
   * Method search connection with source/target block id.
   * If you connect blocks via custom ports, this method will not work.
   *
   * @param blockId {TBlockId} Block id
   * @returns void
   */
  deleteAllBlockConnections(blockId) {
    const connections = this.getBlockConnections(blockId);
    this.rootStore.connectionsList.deleteConnections(connections);
  }
  reset() {
    this.cancelBatchedBlocksGeometry();
    this.applyBlocksState([]);
  }
  /**
   * Gets blocks as JSON
   *
   * @returns {TBlock[]} Blocks
   */
  toJSON() {
    return this.$blocks.value.map((block) => block.asTBlock());
  }
  /**
   * Gets block state by id
   *
   * @param id {TBlockId} Block id
   * @returns {BlockState | undefined} Block state
   */
  getBlockState(id) {
    return this.$blocksMap.value.get(id);
  }
  /**
   * Gets block by id
   *
   * @param id {TBlockId} Block id
   * @returns {TBlock | undefined} Block
   */
  getBlock(id) {
    return this.getBlockState(id)?.asTBlock();
  }
  /**
   * Gets blocks by ids
   *
   * If block with this id does not exist, it will filtered out.
   *
   * @param ids {BlockState["id"][]} Block ids
   * @returns {TBlock[]} Blocks
   */
  getBlocks(ids) {
    return this.getBlockStates(ids).map((block) => block.asTBlock());
  }
  /**
   * Gets block states by ids
   *
   * If block with this id does not exist, it will filtered out.
   *
   * @param ids {BlockState["id"][]} Block ids
   * @returns {BlockState[]} Block states
   */
  getBlockStates(ids) {
    return ids.map((id) => this.getBlockState(id)).filter((block) => block !== void 0);
  }
};

// node_modules/@gravity-ui/graph/build/store/connection/ConnectionState.js
var import_cloneDeep4 = __toESM(require_cloneDeep());
var ConnectionState = class _ConnectionState {
  get id() {
    return this.$state.value.id;
  }
  get sourceBlockId() {
    return this.$state.value.sourceBlockId;
  }
  get sourceAnchorId() {
    return this.$state.value.sourceAnchorId;
  }
  get targetBlockId() {
    return this.$state.value.targetBlockId;
  }
  get targetAnchorId() {
    return this.$state.value.targetAnchorId;
  }
  static getConnectionId(connection) {
    if (connection.id)
      return connection.id;
    if (connection.sourceAnchorId && connection.targetAnchorId) {
      return [connection.sourceAnchorId, connection.targetAnchorId].join(":");
    }
    return [connection.sourceBlockId, connection.targetBlockId].join(":");
  }
  constructor(store, connectionState, connectionSelectionBucket) {
    this.store = store;
    this.connectionSelectionBucket = connectionSelectionBucket;
    this.$rawState = y(void 0);
    this.$selected = g(() => {
      return this.connectionSelectionBucket.$selected.value.has(this.$rawState.value.id);
    });
    this.$state = g(() => ({
      ...this.$rawState.value,
      selected: this.$selected.value
    }));
    this.isDestroyed = false;
    this.$sourcePortId = g(() => {
      if (this.$state.value.sourcePortId) {
        return this.$state.value.sourcePortId;
      }
      if (this.$state.value.sourceAnchorId) {
        return createAnchorPortId(this.$state.value.sourceBlockId, this.$state.value.sourceAnchorId);
      }
      return createBlockPointPortId(this.$state.value.sourceBlockId, false);
    });
    this.$targetPortId = g(() => {
      if (this.$state.value.targetPortId) {
        return this.$state.value.targetPortId;
      }
      if (this.$state.value.targetAnchorId) {
        return createAnchorPortId(this.$state.value.targetBlockId, this.$state.value.targetAnchorId);
      }
      return createBlockPointPortId(this.$state.value.targetBlockId, true);
    });
    this.$sourcePortState = g(() => {
      const portId = this.$sourcePortId.value;
      let port = this.store.getPort(portId);
      if (!port) {
        port = this.store.observePort(portId, this);
      } else if (!port.observers.has(this)) {
        port.addObserver(this);
      }
      return port;
    });
    this.$targetPortState = g(() => {
      const portId = this.$targetPortId.value;
      let port = this.store.getPort(portId);
      if (!port) {
        port = this.store.observePort(portId, this);
      } else if (!port.observers.has(this)) {
        port.addObserver(this);
      }
      return port;
    });
    this.$sourcePort = g(() => {
      return this.$sourcePortState.value.$state.value;
    });
    this.$targetPort = g(() => {
      return this.$targetPortState.value.$state.value;
    });
    this.$sourceBlock = g(() => {
      const component = this.$sourcePortState.value.component;
      if (!component) {
        return void 0;
      }
      if (component instanceof Block) {
        return component.connectedState;
      }
      if (component instanceof Anchor) {
        return component.connectedState.block;
      }
      return void 0;
    });
    this.$targetBlock = g(() => {
      const component = this.$targetPortState.value.component;
      if (!component) {
        return void 0;
      }
      if (component instanceof Block) {
        return component.connectedState;
      }
      if (component instanceof Anchor) {
        return component.connectedState.block;
      }
      return void 0;
    });
    this.$hidden = g(() => {
      const getBlockHidden = (component) => {
        if (component instanceof Block)
          return component.connectedState.$hidden.value;
        if (component instanceof Anchor)
          return component.connectedState.block.$hidden.value;
        return false;
      };
      return getBlockHidden(this.$sourcePortState.value.component) && getBlockHidden(this.$targetPortState.value.component);
    });
    this.$geometry = g(() => {
      const sourcePort = this.$sourcePortState.value;
      const targetPort = this.$targetPortState.value;
      if (!sourcePort.lookup && !targetPort.lookup) {
        return [sourcePort.$point.value, targetPort.$point.value];
      }
      return void 0;
    });
    const id = _ConnectionState.getConnectionId(connectionState);
    this.$rawState.value = { ...connectionState, id };
  }
  /**
   * Sets the view component for this connection state
   * @param viewComponent - The BaseConnection component instance
   * @returns {void}
   */
  setViewComponent(viewComponent) {
    this.viewComponent = viewComponent;
  }
  /**
   * Gets the view component associated with this connection state.
   * @returns The BaseConnection view component or undefined if not set.
   */
  getViewComponent() {
    return this.viewComponent;
  }
  /**
   * Checks if the connection is currently selected.
   * @returns True if the connection is selected, false otherwise.
   */
  isSelected() {
    return this.$selected.value;
  }
  setSelection(selected, strategy = ESelectionStrategy.REPLACE) {
    this.store.setConnectionsSelection([this.id], selected, strategy);
  }
  /**
   * @deprecated Use `toJSON` instead.
   * @returns {TConnection} A deep copy of the connection data
   */
  asTConnection() {
    return (0, import_cloneDeep4.default)({
      ...this.$rawState.toJSON(),
      selected: this.$selected.value
    });
  }
  /**
   * Converts the connection state to a plain JSON object
   * @returns {TConnection} A deep copy of the connection data
   */
  toJSON() {
    return (0, import_cloneDeep4.default)({
      ...this.$rawState.toJSON(),
      selected: this.$selected.value
    });
  }
  /**
   * Updates the connection with new data
   * @param connection - Partial connection data to update
   * @returns {void}
   */
  updateConnection(connection) {
    const { styles: styles2, ...newProps } = connection;
    const newStyles = Object.assign({}, this.$rawState.value.styles, styles2);
    this.$rawState.value = Object.assign({}, this.$rawState.value, newProps, { styles: newStyles });
  }
  /**
   * Clean up port observers when connection is destroyed
   * @returns {void}
   */
  destroy() {
    if (this.$sourcePortId.value) {
      this.store.unobservePort(this.$sourcePortId.value, this);
    }
    if (this.$targetPortId.value) {
      this.store.unobservePort(this.$targetPortId.value, this);
    }
  }
};

// node_modules/@gravity-ui/graph/build/store/connection/port/Port.js
var PortState = class {
  /**
   * Get the port's unique identifier
   *
   * @returns {TPortId} The port's ID
   */
  get id() {
    return this.$state.value.id;
  }
  /**
   * Get the port's effective X coordinate (respects delegation)
   *
   * @returns {number} The X coordinate
   */
  get x() {
    return this.$point.value.x;
  }
  /**
   * Get the port's effective Y coordinate (respects delegation)
   *
   * @returns {number} The Y coordinate
   */
  get y() {
    return this.$point.value.y;
  }
  /**
   * Get the component that owns this port
   *
   * @returns {Component | undefined} The owning component, if any
   */
  get component() {
    return this.owner || this.$state.value.component;
  }
  /**
   * Get whether the port is in lookup state (waiting for coordinates)
   *
   * @returns {boolean | undefined} True if waiting for coordinates, false if resolved
   */
  get lookup() {
    return this.$state.value.lookup;
  }
  /**
   * Get the port's metadata
   *
   * @returns {T | undefined} The metadata attached to this port
   */
  get meta() {
    return this.$state.value.meta;
  }
  constructor(port) {
    this.$state = y(void 0);
    this.$delegate = y(void 0);
    this.observers = /* @__PURE__ */ new Set();
    this.$point = g(() => {
      const delegate = this.$delegate.value;
      if (delegate) {
        return delegate.$point.value;
      }
      return { x: this.$state.value.x, y: this.$state.value.y };
    });
    this.$state.value = { ...port };
    if (port.component) {
      this.owner = port.component;
    }
  }
  /**
   * Set the component that owns this port
   * @param owner Component that will own this port (block, anchor, etc.)
   * @returns void
   */
  setOwner(owner) {
    this.owner = owner;
    this.updatePort({ component: owner, lookup: false });
  }
  /**
   * Remove the current owner from this port
   */
  removeOwner() {
    this.owner = void 0;
    this.updatePort({ component: void 0, lookup: true });
  }
  /**
   * Add an observer reference to this port
   * Stores the actual reference for accurate counting
   * @param observer The object observing this port
   */
  addObserver(observer) {
    this.observers.add(observer);
  }
  /**
   * Remove an observer reference from this port
   * Removes the actual reference from the set
   * @param observer The object to stop observing this port
   */
  removeObserver(observer) {
    this.observers.delete(observer);
  }
  /**
   * Update the port's position coordinates.
   * When delegated, the position is saved but does not affect getPoint() —
   * the effective position comes from the delegate port.
   * @param x New X coordinate
   * @param y New Y coordinate
   */
  setPoint(x2, y2) {
    if (this.$delegate.value) {
      this.savedPoint = { x: x2, y: y2 };
      return;
    }
    this.updatePort({ x: x2, y: y2 });
  }
  getPoint() {
    return this.$point.value;
  }
  /**
   * Delegate this port to mirror another port's position.
   * While delegated, getPoint() returns the target port's position.
   * Any setPoint() calls are saved and restored on undelegate().
   * @param target The port to mirror
   */
  delegate(target) {
    this.savedPoint = { x: this.$state.value.x, y: this.$state.value.y };
    this.$delegate.value = target;
  }
  /**
   * Remove delegation and restore the last saved position.
   * If setPoint() was called during delegation, the last value is used.
   * Otherwise, the position from before delegation is restored.
   */
  undelegate() {
    this.$delegate.value = void 0;
    if (this.savedPoint) {
      this.updatePort({ x: this.savedPoint.x, y: this.savedPoint.y });
      this.savedPoint = void 0;
    }
  }
  /**
   * Whether this port is currently delegated to another port
   */
  get isDelegated() {
    return this.$delegate.value !== void 0;
  }
  /**
   * Update port state with partial data
   * @param port Partial port data to merge with current state
   */
  updatePort(port) {
    this.$state.value = {
      ...this.$state.value,
      ...port,
      meta: {
        ...this.$state.value.meta,
        ...port.meta
      }
    };
  }
  /**
   * Check if this port can be safely deleted
   * @returns true if port has no owner and no observers
   */
  canBeDeleted() {
    return !this.owner && this.observers.size === 0;
  }
};

// node_modules/@gravity-ui/graph/build/store/connection/port/PortList.js
var PortsStore = class {
  constructor(rootStore, graph) {
    this.rootStore = rootStore;
    this.graph = graph;
    this.$ports = g(() => {
      return Array.from(this.$portsMap.value.values());
    });
    this.$portsMap = y(/* @__PURE__ */ new Map());
    this.notifyPortMapChanged = debounce(() => {
      this.$portsMap.value = new Map(this.$portsMap.value);
    }, {
      priority: ESchedulerPriority.LOW,
      frameInterval: 1
    });
  }
  createPort(id, component) {
    if (this.$portsMap.value.has(id)) {
      const existingPort = this.$portsMap.value.get(id);
      if (existingPort) {
        existingPort.setOwner(component);
        return existingPort;
      }
    }
    const newPort = new PortState({
      id,
      x: 0,
      y: 0,
      component,
      lookup: !component
    });
    this.$portsMap.value.set(id, newPort);
    this.notifyPortMapChanged();
    return newPort;
  }
  getPort(id) {
    return this.$portsMap.value.get(id);
  }
  getOrCreatePort(id, component) {
    const existingPort = this.getPort(id);
    if (existingPort) {
      if (component && !existingPort.owner) {
        existingPort.setOwner(component);
      }
      return existingPort;
    }
    return this.createPort(id, component);
  }
  deletePort(id) {
    const deleted = this.$portsMap.value.delete(id);
    if (deleted) {
      this.notifyPortMapChanged();
    }
    return deleted;
  }
  deletePorts(ids) {
    ids.forEach((id) => {
      this.$portsMap.value.delete(id);
    });
  }
  clearPorts() {
    this.$portsMap.value.clear();
    this.notifyPortMapChanged();
  }
  getPortsByComponent(component) {
    return this.$ports.value.filter((port) => port.component === component);
  }
  ownPort(port, component) {
    port.addObserver(component);
  }
  unownPort(port, component) {
    port.removeObserver(component);
    if (port.observers.size === 0 && !port.component) {
      this.deletePort(port.id);
    }
  }
  reset() {
    this.clearPorts();
  }
  /**
   * Find the nearest port at given world coordinates
   * First finds components under cursor, then checks their ports
   *
   * @param point World coordinates to search from
   * @param searchRadius Maximum search radius in pixels (default: 0 - exact match)
   * @param filter Optional filter function to validate ports
   * @returns Nearest port within radius, or undefined if none found
   *
   * @example
   * ```typescript
   * const port = portsStore.findPortAtPoint(
   *   { x: 100, y: 200 },
   *   30,
   *   (port) => !port.lookup && port.owner !== undefined
   * );
   * ```
   */
  findPortAtPoint(point, searchRadius = 0, filter) {
    const pointObj = new Point(point.x, point.y);
    const component = this.graph.getElementOverPoint(pointObj, [GraphComponent]);
    if (!component) {
      return void 0;
    }
    return this.findPortAtPointByComponent(component, point, searchRadius, filter);
  }
  /**
   * Find the nearest port at given world coordinates for a specific component
   *
   * @param component Component to search in
   * @param point World coordinates to search from
   * @param searchRadius Maximum search radius in pixels (default: 0 - exact match)
   * @param filter Optional filter function to validate ports
   * @returns Nearest port within radius, or undefined if none found
   */
  findPortAtPointByComponent(component, point, searchRadius = 0, filter) {
    const ports = component.getPorts();
    for (const port of ports) {
      if (port.lookup)
        continue;
      const distance = vectorDistance(point, port);
      if (distance <= searchRadius) {
        if (filter && !filter(port))
          continue;
        return port;
      }
    }
    return void 0;
  }
};

// node_modules/@gravity-ui/graph/build/store/connection/ConnectionList.js
var ConnectionsStore = class {
  constructor(rootStore, graph) {
    this.rootStore = rootStore;
    this.graph = graph;
    this.$connections = g(() => {
      return Array.from(this.$connectionsMap.value.values());
    });
    this.$connectionsMap = y(/* @__PURE__ */ new Map());
    this.$selectedConnections = g(() => {
      return this.connectionSelectionBucket.$selectedEntities.value;
    });
    this.$selectedConnectionComponents = g(() => {
      return this.connectionSelectionBucket.$selectedComponents.value;
    });
    this.ports = new PortsStore(this.rootStore, this.graph);
    this.connectionSelectionBucket = new MultipleSelectionBucket("connection", (payload, defaultAction) => {
      return this.graph.execut\u0435DefaultEventAction("connection-selection-change", payload, defaultAction);
    }, (element) => element instanceof BaseConnection, (ids) => ids.map((id) => this.getConnectionState(id)).filter((conn) => conn !== void 0));
    this.connectionSelectionBucket.attachToManager(this.rootStore.selectionService);
  }
  /**
   * Claim ownership of a port (for Blocks, Anchors)
   * @param id Port identifier
   * @param owner Component that will own this port
   * @returns The port state
   */
  claimPort(id, owner) {
    const port = this.ports.getOrCreatePort(id);
    port.setOwner(owner);
    return port;
  }
  /**
   * Release ownership of a port (when Block/Anchor is destroyed)
   * @param id Port identifier
   * @param owner Component that currently owns this port
   */
  releasePort(id, owner) {
    const port = this.ports.getPort(id);
    if (port?.owner === owner) {
      port.removeOwner();
      this.checkAndDeletePort(id);
    }
  }
  /**
   * Start observing a port (for Connections)
   * @param id Port identifier
   * @param observer The object that will observe this port
   * @returns The port state
   */
  observePort(id, observer) {
    const port = this.ports.getOrCreatePort(id);
    port.addObserver(observer);
    return port;
  }
  /**
   * Stop observing a port (when Connection is destroyed)
   * @param id Port identifier
   * @param observer The object that was observing this port
   */
  unobservePort(id, observer) {
    const port = this.ports.getPort(id);
    if (port) {
      port.removeObserver(observer);
      this.checkAndDeletePort(id);
    }
  }
  /**
   * Get a port by its ID
   * @param id Port identifier
   * @returns The port state if it exists
   */
  getPort(id) {
    return this.ports.getPort(id);
  }
  /**
   * Get all ports
   * @returns Array of all port states
   */
  getAllPorts() {
    return this.ports.$ports.value;
  }
  /**
   * Check if a port exists
   * @param id Port identifier
   * @returns true if port exists
   */
  hasPort(id) {
    return this.ports.getPort(id) !== void 0;
  }
  /**
   * Check if a port can be deleted and delete it if possible
   * @param id Port identifier
   */
  checkAndDeletePort(id) {
    const port = this.ports.getPort(id);
    if (port && port.canBeDeleted()) {
      this.ports.deletePort(id);
    }
  }
  deletePorts(ports) {
    this.ports.deletePorts(ports);
  }
  updateConnections(connections) {
    this.$connectionsMap.value = connections.reduce((acc, connection) => {
      const c2 = this.getOrCreateConnection(connection);
      acc.set(c2.id, c2);
      return acc;
    }, this.$connectionsMap.value);
  }
  setConnections(connections) {
    this.$connectionsMap.value = new Map(connections.map((connection) => {
      const c2 = this.getOrCreateConnection(connection);
      return [c2.id, c2];
    }));
  }
  getOrCreateConnection(connections) {
    const id = ConnectionState.getConnectionId(connections);
    if (this.$connectionsMap.value.has(id)) {
      const c2 = this.$connectionsMap.value.get(id);
      c2.updateConnection(connections);
      return c2;
    }
    return new ConnectionState(this, connections, this.connectionSelectionBucket);
  }
  addConnection(connection) {
    const newConnection = new ConnectionState(this, connection, this.connectionSelectionBucket);
    this.$connectionsMap.value.set(newConnection.id, newConnection);
    this.notifyConnectionMapChanged();
    return newConnection.id;
  }
  notifyConnectionMapChanged() {
    this.$connectionsMap.value = new Map(this.$connectionsMap.value);
  }
  deleteConnections(connections) {
    connections.forEach((c2) => {
      c2.destroy();
      this.$connectionsMap.value.delete(c2.id);
    });
    this.notifyConnectionMapChanged();
  }
  deleteSelectedConnections() {
    this.$connections.value.forEach((c2) => {
      if (c2.$selected.value) {
        c2.destroy();
        this.$connectionsMap.value.delete(c2.id);
      }
    });
    this.notifyConnectionMapChanged();
  }
  /**
   * Updates connection selection using the SelectionService
   * @param ids Connection IDs to update selection for
   * @param selected Whether to select or deselect
   * @param strategy The selection strategy to apply
   */
  setConnectionsSelection(ids, selected, strategy = ESelectionStrategy.REPLACE) {
    if (selected) {
      this.connectionSelectionBucket.select(ids, strategy);
    } else {
      this.connectionSelectionBucket.deselect(ids);
    }
  }
  /**
   * Resets the selection for connections
   *
   * @returns {void}
   */
  resetSelection() {
    this.connectionSelectionBucket.reset();
  }
  getConnections(ids) {
    if (!ids || !ids.length) {
      return this.$connections.value;
    }
    const map = this.$connectionsMap.value;
    return ids.map((id) => map.get(id)).filter(Boolean);
  }
  getConnectionState(id) {
    return this.$connectionsMap.value.get(id);
  }
  getConnection(id) {
    return this.getConnectionState(id)?.toJSON();
  }
  getConnectionStates(ids) {
    return ids.map((id) => this.getConnectionState(id)).filter(Boolean);
  }
  toJSON() {
    return this.$connections.value.map((c2) => c2.toJSON());
  }
  reset() {
    this.$connections.value.forEach((c2) => {
      c2.destroy();
    });
    this.setConnections([]);
    this.ports.reset();
  }
};

// node_modules/@gravity-ui/graph/build/store/group/GroupsList.js
var import_groupBy = __toESM(require_groupBy());

// node_modules/@gravity-ui/graph/build/components/canvas/groups/Group.js
var defaultStyle = {
  background: "rgba(100, 100, 100, 0.1)",
  border: "rgba(100, 100, 100, 0.3)",
  borderWidth: 2,
  selectedBackground: "rgba(100, 100, 100, 1)",
  selectedBorder: "rgba(100, 100, 100, 1)",
  highlightedBackground: "rgba(100, 200, 100, 0.3)",
  highlightedBorder: "rgba(100, 200, 100, 0.8)"
};
var defaultGeometry = {
  padding: [20, 20, 20, 20]
};
var Group = class _Group extends GraphComponent {
  static define(config) {
    return class SpecificGroup extends _Group {
      constructor(props, parent) {
        super({
          ...props,
          style: {
            ...defaultStyle,
            ...config.style,
            ...props.style
          },
          geometry: {
            ...defaultGeometry,
            ...config.geometry,
            ...props.geometry
          }
        }, parent);
      }
    };
  }
  get zIndex() {
    return 0;
  }
  constructor(props, parent) {
    super(props, parent);
    this.blocks = [];
    this.cursor = "pointer";
    this.highlighted = false;
    this.isDragging = false;
    this.dragStartRect = null;
    this.lastSnappedPos = null;
    this.handleClick = (event) => {
      event.stopPropagation();
      const isMeta = isMetaKeyEvent(event);
      this.groupState.setSelection(!isMeta ? true : !this.groupState.$selected.value, !isMeta ? ESelectionStrategy.REPLACE : ESelectionStrategy.APPEND);
    };
    this.style = {
      ...defaultStyle,
      ...props.style
    };
    this.geometry = {
      ...defaultGeometry,
      ...props.geometry
    };
    this.subscribeToGroup();
    this.addEventListener("click", this.handleClick);
  }
  /**
   * Set the highlighted state of the group
   */
  setHighlighted(highlighted) {
    if (this.highlighted !== highlighted) {
      this.highlighted = highlighted;
      this.performRender();
    }
  }
  /**
   * Check if the group is currently highlighted (block is being dragged over it).
   *
   * This method is useful for custom group components that override the `render()` method
   * and need to apply different styling when the group is highlighted during transfer mode.
   *
   * @returns `true` if the group is highlighted, `false` otherwise
   *
   * @example
   * ```typescript
   * class CustomGroup extends Group {
   *   protected override render() {
   *     const ctx = this.context.ctx;
   *     const rect = this.getRect();
   *
   *     // Apply different styles based on state
   *     if (this.isHighlighted()) {
   *       ctx.strokeStyle = 'rgba(100, 200, 100, 1)';
   *       ctx.lineWidth = 3;
   *     } else if (this.state.selected) {
   *       ctx.strokeStyle = 'rgba(100, 100, 100, 1)';
   *       ctx.lineWidth = 2;
   *     } else {
   *       ctx.strokeStyle = 'rgba(100, 100, 100, 0.4)';
   *       ctx.lineWidth = 1;
   *     }
   *
   *     ctx.beginPath();
   *     ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
   *     ctx.stroke();
   *   }
   * }
   * ```
   */
  isHighlighted() {
    return this.highlighted;
  }
  getEntityId() {
    return this.props.id;
  }
  /**
   * Check if group can be dragged based on props.draggable and canDrag setting
   */
  isDraggable() {
    const canDrag = this.context.graph.rootStore.settings.$canDrag.value;
    return Boolean(this.props.draggable) && isAllowDrag(canDrag, Boolean(this.state.selected));
  }
  /**
   * Override to apply snapping or other position transforms during drag.
   * Called with the raw (pre-snap) target position computed from the drag start + cumulative diff.
   * The default implementation returns the position unchanged (no snapping).
   *
   * @example
   * ```typescript
   * protected override snapPosition(x: number, y: number) {
   *   const grid = 16;
   *   return { x: Math.round(x / grid) * grid, y: Math.round(y / grid) * grid };
   * }
   * ```
   */
  snapPosition(x2, y2) {
    const gridSize = this.context.constants.block.SNAPPING_GRID_SIZE;
    if (gridSize <= 1) {
      return { x: x2, y: y2 };
    }
    return {
      x: Math.round(x2 / gridSize) * gridSize,
      y: Math.round(y2 / gridSize) * gridSize
    };
  }
  /**
   * Handle drag start - stores the initial rect position and sets isDragging flag.
   * Subclasses that override this method should call super.handleDragStart() to preserve this behavior.
   */
  handleDragStart(_context) {
    this.isDragging = true;
    this.dragStartRect = { x: this.state.rect.x, y: this.state.rect.y };
    this.lastSnappedPos = { x: this.state.rect.x, y: this.state.rect.y };
  }
  /**
   * Handle drag update - moves the group rect and notifies via onDragUpdate.
   * Uses the cumulative diff from drag start so that snapPosition always operates
   * on the absolute target position (avoids error accumulation from per-frame deltas).
   * onDragUpdate is called only when the position actually changes.
   */
  handleDrag(diff, _context) {
    if (!this.dragStartRect || !this.lastSnappedPos) {
      return;
    }
    const { x: newX, y: newY } = this.snapPosition(this.dragStartRect.x + diff.diffX, this.dragStartRect.y + diff.diffY);
    const deltaX = newX - this.lastSnappedPos.x;
    const deltaY = newY - this.lastSnappedPos.y;
    this.lastSnappedPos = { x: newX, y: newY };
    const rect = {
      x: newX,
      y: newY,
      width: this.state.rect.width,
      height: this.state.rect.height
    };
    this.setState({ rect });
    this.updateHitBox(rect);
    if (deltaX !== 0 || deltaY !== 0) {
      this.props.onDragUpdate(this.props.id, { deltaX, deltaY });
    }
  }
  /**
   * Handle drag end - clears isDragging flag and drag tracking state.
   * Subclasses that override this method should call super.handleDragEnd() to preserve this behavior.
   */
  handleDragEnd(_context) {
    this.isDragging = false;
    this.dragStartRect = null;
    this.lastSnappedPos = null;
  }
  getRect(rect = this.state.rect) {
    const [paddingTop, paddingRight, paddingBottom, paddingLeft] = this.geometry.padding;
    return {
      x: rect.x - paddingLeft,
      y: rect.y - paddingTop,
      width: rect.width + paddingLeft + paddingRight,
      height: rect.height + paddingTop + paddingBottom
    };
  }
  subscribeToGroup() {
    this.groupState = this.context.graph.rootStore.groupsList.getGroupState(this.props.id);
    this.subscribeSignal(this.groupState.$selected, (selected) => {
      this.setState({
        selected
      });
    });
    this.groupState.setViewComponent(this);
    return this.subscribeSignal(this.groupState.$state, (group) => {
      if (!group) {
        return;
      }
      if (this.isDragging) {
        const { rect: _rect, ...groupWithoutRect } = group;
        this.setState({
          ...this.getState(),
          ...groupWithoutRect
        });
      } else {
        this.setState({
          ...this.state,
          ...group
        });
        this.updateHitBox(group.rect);
      }
    });
  }
  unmount() {
    this.groupState.setViewComponent(void 0);
    super.unmount();
  }
  updateHitBox(rect) {
    const hitArea = this.getRect(rect);
    this.setHitBox(hitArea.x, hitArea.y, hitArea.x + hitArea.width, hitArea.y + hitArea.height);
  }
  layoutText(text, textParams) {
    const currentRect = this.getRect();
    return layoutText(text, this.context.ctx, currentRect, {
      maxWidth: currentRect.width,
      maxHeight: currentRect.height,
      ...textParams
    });
  }
  renderBody(ctx, rect = this.getRect()) {
    if (this.highlighted) {
      ctx.strokeStyle = this.style.highlightedBorder;
      ctx.fillStyle = this.style.highlightedBackground;
    } else if (this.state.selected) {
      ctx.strokeStyle = this.style.selectedBorder;
      ctx.fillStyle = this.style.selectedBackground;
    } else {
      ctx.strokeStyle = this.style.border;
      ctx.fillStyle = this.style.background;
    }
    ctx.lineWidth = this.highlighted ? this.style.borderWidth + 1 : this.style.borderWidth;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    ctx.stroke();
  }
  render() {
    this.renderBody(this.context.ctx, this.getRect());
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/groups/BlockGroups.js
var BlockGroups = class extends Layer {
  static withBlockGrouping({ groupingFn, mapToGroups }) {
    const Base = this;
    return class BlockGroupWithGrouping extends Base {
      constructor() {
        super(...arguments);
        this.$groupsBlocksMap = g(() => {
          const blocks = this.props.graph.rootStore.blocksList.$blocks.value;
          return groupingFn(blocks);
        });
      }
      afterInit() {
        this.onSignal(g(() => {
          const groupedBlocks = this.$groupsBlocksMap.value;
          return Object.entries(groupedBlocks).map(([key, blocks]) => mapToGroups(key, {
            blocks,
            rect: getBlocksRect(blocks.map((block) => block.asTBlock()))
          }));
        }), (groups) => {
          this.setGroups(groups);
        });
        super.afterInit();
      }
    };
  }
  static withPredefinedGroups() {
    const Base = this;
    return class BlockGroupWithPredefinedGroups extends Base {
      constructor() {
        super(...arguments);
        this.$predefinedGroups = new l([]);
        this.$groupsBlocksMap = g(() => {
          const groups = this.$predefinedGroups.value;
          const blocksMap = {};
          const blocksListStore = this.props.graph.rootStore.blocksList;
          groups.forEach((group) => {
            const blocks = blocksListStore.getBlockStates(group.blocksIds);
            blocksMap[group.id] = blocks;
          });
          return blocksMap;
        });
      }
      defineGroups(groups) {
        this.$predefinedGroups.value = groups;
      }
      afterInit() {
        this.onSignal(g(() => {
          const groups = this.$predefinedGroups.value;
          const groupsBlocksMap = this.$groupsBlocksMap.value;
          return groups.map((group) => {
            const blocks = groupsBlocksMap[group.id] || [];
            const rect = getBlocksRect(blocks.map((block) => block.asTBlock()));
            return {
              ...group,
              rect
            };
          });
        }), (groups) => {
          this.setGroups(groups);
        });
        super.afterInit();
      }
    };
  }
  constructor(props) {
    super({
      canvas: {
        zIndex: 1,
        classNames: ["no-user-select"],
        transformByCameraPosition: true,
        ...props.canvas
      },
      ...props
    });
    this.$groupsBlocksMap = new l({});
    this.$groupsSource = this.props.graph.rootStore.groupsList.$groups;
    this.$blockGroupsMap = g(() => {
      return Object.entries(this.$groupsBlocksMap.value).reduce((acc, [key, blocks]) => {
        blocks.forEach((block) => {
          acc.set(block.id, key);
        });
        return acc;
      }, /* @__PURE__ */ new Map());
    });
    this.updateBlocks = (groupId, { deltaX, deltaY }) => {
      if (this.props.updateBlocksOnDrag) {
        const blocks = this.$groupsBlocksMap.value[groupId];
        if (blocks?.length) {
          blocks.forEach((block) => {
            block.updateXY(block.x + deltaX, block.y + deltaY, true);
          });
        }
      }
    };
    const canvas = this.getCanvas();
    this.setContext({
      canvas,
      ctx: canvas.getContext("2d"),
      root: this.props.root,
      camera: this.props.camera,
      constants: this.props.graph.graphConstants,
      colors: this.props.graph.graphColors,
      graph: this.props.graph,
      ownerDocument: this.props.root
    });
  }
  afterInit() {
    this.onSignal(this.$groupsSource, (groups) => {
      this.shouldUpdateChildren = true;
      this.shouldRenderChildren = true;
      this.setState({ groups });
    });
    super.afterInit();
  }
  getParent() {
    return this.props.graph.getGraphLayer().$.camera;
  }
  setGroups(groups) {
    const groupsToUpdate = groups.map((group) => {
      const existingGroupState = this.props.graph.rootStore.groupsList.getGroupState(group.id);
      if (existingGroupState?.isSizeLocked()) {
        return { ...group, rect: existingGroupState.$state.value.rect };
      }
      return group;
    });
    this.props.graph.rootStore.groupsList.setGroups(groupsToUpdate);
  }
  updateGroups(groups) {
    this.props.graph.rootStore.groupsList.updateGroups(groups);
  }
  unmountLayer() {
    this.props.graph.rootStore.groupsList.reset();
    super.unmountLayer();
  }
  getGroupComponent(group) {
    return group.$state.value.component || this.props.groupComponent || Group;
  }
  updateChildren() {
    return this.state.groups?.map((group) => {
      return this.getGroupComponent(group).create({
        id: group.id,
        onDragUpdate: this.updateBlocks,
        draggable: this.props.draggable || false
      }, { key: group.id, ref: group.id });
    });
  }
  /**
   * Find a Group component by its ID
   */
  getGroupById(groupId) {
    return this.$?.[groupId];
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/groups/BlockGroupsTransferLayer.js
var BlockGroupsTransferLayer = class extends BlockGroups {
  constructor() {
    super(...arguments);
    this.transferState = this.createIdleState();
    this.disposeSubscription = null;
  }
  get isTransferEnabled() {
    return this.props.transferEnabled !== false;
  }
  afterInit() {
    super.afterInit();
    if (this.isTransferEnabled) {
      this.subscribeToDragState();
    }
  }
  /**
   * Subscribe to DragService state changes
   */
  subscribeToDragState() {
    const dragService = this.props.graph.dragService;
    if (!dragService)
      return;
    this.disposeSubscription = j(() => {
      const isShiftPressed = this.props.graph.keyboardService.isShiftPressed();
      this.handleDragStateChange(dragService.$state.value, isShiftPressed ?? false);
    });
  }
  /**
   * Handle drag state changes - react to Shift key in real-time
   */
  handleDragStateChange(dragState, isShiftPressed) {
    if (!dragState.isDragging) {
      if (this.transferState.isTransferring) {
        this.endTransfer();
      }
      return;
    }
    if (isShiftPressed && !this.transferState.isTransferring) {
      this.activateTransfer(dragState);
    } else if (!isShiftPressed && this.transferState.isTransferring) {
      this.deactivateTransfer();
    }
    if (this.transferState.isTransferring && dragState.currentCoords) {
      this.updateHighlight(dragState.currentCoords);
    }
  }
  /**
   * Activate transfer mode for currently dragged blocks
   */
  activateTransfer(dragState) {
    const blocks = dragState.components.filter((c2) => c2 instanceof Block).map((block) => block.state);
    if (blocks.length === 0)
      return;
    const sourceGroupIds = /* @__PURE__ */ new Set();
    for (const block of blocks) {
      const groupId = this.$blockGroupsMap.value.get(block.id) ?? null;
      if (groupId) {
        sourceGroupIds.add(groupId);
      }
    }
    this.transferState = {
      isTransferring: true,
      blocks,
      sourceGroupIds,
      targetGroupId: null,
      highlightedGroupId: null
    };
    this.lockAllGroups();
    this.props.onTransferStart?.(blocks.map((b2) => b2.id.toString()), sourceGroupIds);
    if (dragState.currentCoords) {
      this.updateHighlight(dragState.currentCoords);
    }
  }
  /**
   * Deactivate transfer mode - apply transfer and unlock groups
   * Called when Shift is released during drag
   */
  deactivateTransfer() {
    const { highlightedGroupId, targetGroupId, blocks } = this.transferState;
    if (highlightedGroupId) {
      this.setGroupHighlight(highlightedGroupId, false);
    }
    const changes = [];
    for (const block of blocks) {
      const oldGroupId = this.$blockGroupsMap.value.get(block.id) ?? null;
      if (oldGroupId !== targetGroupId) {
        changes.push({
          blockId: block.id,
          sourceGroup: oldGroupId,
          targetGroup: targetGroupId
        });
      }
    }
    this.applyGroupChange(changes);
    this.unlockAllGroups();
    this.props.onTransferEnd?.(blocks.map((b2) => b2.id.toString()), targetGroupId);
    this.transferState = this.createIdleState();
  }
  /**
   * Lock all groups' sizes
   */
  lockAllGroups() {
    const groups = this.props.graph.rootStore.groupsList.$groups.value;
    for (const groupState of groups) {
      groupState.lockSize();
    }
  }
  /**
   * Unlock all groups' sizes
   */
  unlockAllGroups() {
    const groups = this.props.graph.rootStore.groupsList.$groups.value;
    for (const groupState of groups) {
      groupState.unlockSize();
    }
  }
  createIdleState() {
    return {
      isTransferring: false,
      blocks: [],
      sourceGroupIds: /* @__PURE__ */ new Set(),
      targetGroupId: null,
      highlightedGroupId: null
    };
  }
  /**
   * Update highlighting based on cursor position
   */
  updateHighlight(point) {
    if (!this.transferState.isTransferring)
      return;
    const targetGroup = this.findGroupAtPoint(point);
    const targetGroupId = targetGroup?.getEntityId() ?? null;
    if (this.transferState.highlightedGroupId !== targetGroupId) {
      if (this.transferState.highlightedGroupId) {
        this.setGroupHighlight(this.transferState.highlightedGroupId, false);
      }
      if (targetGroupId) {
        this.setGroupHighlight(targetGroupId, true);
      }
    }
    this.transferState = {
      ...this.transferState,
      targetGroupId,
      // Real target group under cursor
      highlightedGroupId: targetGroupId
    };
  }
  /**
   * End transfer on drag end (mouseup) - apply transfer if in transfer mode
   */
  endTransfer() {
    const { highlightedGroupId, targetGroupId, blocks } = this.transferState;
    if (highlightedGroupId) {
      this.setGroupHighlight(highlightedGroupId, false);
    }
    const changes = [];
    for (const block of blocks) {
      const currentGroupId = this.$blockGroupsMap.value.get(block.id) ?? null;
      if (currentGroupId !== targetGroupId) {
        changes.push({
          blockId: block.id,
          sourceGroup: currentGroupId,
          targetGroup: targetGroupId
        });
      }
    }
    this.applyGroupChange(changes);
    this.unlockAllGroups();
    this.props.onTransferEnd?.(blocks.map((b2) => b2.id.toString()), targetGroupId);
    this.transferState = this.createIdleState();
  }
  /**
   * Cancel the transfer operation without applying changes.
   *
   * This method can be called to abort an ongoing transfer without moving blocks to a new group.
   * It will unhighlight groups, unlock sizes, and reset the transfer state.
   *
   * @example
   * ```typescript
   * // Cancel transfer on Escape key
   * document.addEventListener('keydown', (e) => {
   *   if (e.key === 'Escape' && layer.isTransferring()) {
   *     layer.cancelTransfer();
   *   }
   * });
   * ```
   */
  cancelTransfer() {
    const { highlightedGroupId } = this.transferState;
    if (highlightedGroupId) {
      this.setGroupHighlight(highlightedGroupId, false);
    }
    this.unlockAllGroups();
    this.transferState = this.createIdleState();
  }
  /**
   * Find a group at the given point
   */
  findGroupAtPoint(point) {
    const [x2, y2] = point;
    return this.props.graph.getElementOverPoint(new Point(x2, y2), [Group]) ?? null;
  }
  /**
   * Set highlight state for a group directly on the component
   */
  setGroupHighlight(groupId, highlighted) {
    const groupComponent = this.getGroupById(groupId);
    groupComponent?.setHighlighted(highlighted);
  }
  /**
   * Apply the group change to the block
   */
  applyGroupChange(changes) {
    if (changes.length > 0) {
      this.props.onBlockGroupChange?.(changes);
    }
  }
  /**
   * Check if a block transfer is currently in progress.
   *
   * @returns `true` if transfer mode is active (Shift is pressed during drag), `false` otherwise
   *
   * @example
   * ```typescript
   * if (layer.isTransferring()) {
   *   console.log('Transferring', layer.getTransferringBlocksCount(), 'blocks');
   * }
   * ```
   */
  isTransferring() {
    return this.transferState.isTransferring;
  }
  /**
   * Get the number of blocks being transferred in the current operation.
   *
   * @returns Number of blocks currently being transferred, or 0 if no transfer is in progress
   *
   * @example
   * ```typescript
   * const count = layer.getTransferringBlocksCount();
   * console.log(`Transferring ${count} block${count !== 1 ? 's' : ''}`);
   * ```
   */
  getTransferringBlocksCount() {
    return this.transferState.blocks.length;
  }
  unmountLayer() {
    if (this.disposeSubscription) {
      this.disposeSubscription();
      this.disposeSubscription = null;
    }
    if (this.transferState.highlightedGroupId) {
      this.setGroupHighlight(this.transferState.highlightedGroupId, false);
    }
    this.transferState = this.createIdleState();
    super.unmountLayer();
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/groups/CollapsibleGroup.js
var DEFAULT_COLLAPSED_WIDTH = 200;
var DEFAULT_COLLAPSED_HEIGHT = 48;
var DIRECTION_FACTOR = { start: 0, center: 0.5, end: 1 };
function computeDefaultCollapseRect(expandedRect, direction, collapsedWidth, collapsedHeight) {
  const w2 = collapsedWidth ?? DEFAULT_COLLAPSED_WIDTH;
  const h2 = collapsedHeight ?? DEFAULT_COLLAPSED_HEIGHT;
  const ax = DIRECTION_FACTOR[direction?.x ?? "start"];
  const ay = DIRECTION_FACTOR[direction?.y ?? "start"];
  return {
    x: expandedRect.x + ax * (expandedRect.width - w2),
    y: expandedRect.y + ay * (expandedRect.height - h2),
    width: w2,
    height: h2
  };
}
var GROUP_PORT_LEFT = "_left";
var GROUP_PORT_RIGHT = "_right";
var defaultStyle2 = {
  background: "rgba(100, 100, 100, 0.1)",
  border: "rgba(100, 100, 100, 0.3)",
  borderWidth: 2,
  selectedBackground: "rgba(100, 100, 100, 1)",
  selectedBorder: "rgba(100, 100, 100, 1)",
  highlightedBackground: "rgba(100, 200, 100, 0.3)",
  highlightedBorder: "rgba(100, 200, 100, 0.8)"
};
var defaultGeometry2 = {
  padding: [20, 20, 20, 20]
};
var CollapsibleGroup = class extends Group {
  constructor() {
    super(...arguments);
    this.dragStartCollapsedRect = null;
  }
  static define(config) {
    return class SpecificGroup extends this {
      constructor(props, parent) {
        super({
          ...props,
          style: {
            ...defaultStyle2,
            ...config.style,
            ...props.style
          },
          geometry: {
            ...defaultGeometry2,
            ...config.geometry,
            ...props.geometry
          }
        }, parent);
      }
    };
  }
  /**
   * Extend base subscription to also react to collapsed state on init.
   * subscribeSignal fires immediately with the current value, so a group
   * that starts with collapsed: true will hide its blocks on mount.
   *
   * Also handles external collapse state changes: if setGroups() is called
   * with collapsed: false while the group is currently collapsed, it expands.
   */
  subscribeToGroup() {
    const unsub = super.subscribeToGroup();
    this.subscribeSignal(this.groupState.$state, (group) => {
      if (group.collapsed) {
        this.applyBlockVisibility(true);
        const rect = group.collapsedRect ?? this.computeCollapsedRect(group.rect);
        if (!group.collapsedRect) {
          this.groupState.updateGroup({
            collapsedRect: rect
          });
        }
        this.delegatePorts(rect);
        this.updateHitBox(rect);
      } else if (this.state.collapsed) {
        this.undelegatePorts();
        this.applyBlockVisibility(false);
        this.updateHitBox(group.rect);
      }
    });
    return unsub;
  }
  // ---------------------------------------------------------------------------
  // Overrides — use collapsedRect for rendering and hit-testing when collapsed
  // ---------------------------------------------------------------------------
  /**
   * Returns the visual rect. When collapsed, returns `collapsedRect`
   * (with padding) so the group renders as a compact header.
   */
  getRect(rect) {
    const state = this.getState();
    if (state.collapsed && state.collapsedRect) {
      return super.getRect(state.collapsedRect);
    }
    return super.getRect(rect);
  }
  /**
   * Sets the hitbox to the collapsed rect when collapsed, or the expanded
   * rect otherwise. Passes the raw inner rect to super so that base Group's
   * updateHitBox can apply padding exactly once.
   */
  updateHitBox(rect) {
    const state = this.getState();
    super.updateHitBox(state.collapsed && state.collapsedRect ? state.collapsedRect : rect);
  }
  /**
   * Remember inner rect and collapsed rect so {@link handleDrag} can translate
   * `collapsedRect` by the same snapped delta as `rect` (grid snapping in Group).
   */
  handleDragStart(context) {
    super.handleDragStart(context);
    const group = this.groupState.$state.value;
    if (group.collapsed && group.collapsedRect) {
      this.dragStartCollapsedRect = { ...group.collapsedRect };
    } else {
      this.dragStartCollapsedRect = null;
    }
  }
  handleDragEnd(context) {
    this.dragStartCollapsedRect = null;
    super.handleDragEnd(context);
  }
  /**
   * When dragging a collapsed group, move `collapsedRect` in lockstep with the snapped
   * `rect` movement computed by {@link Group.handleDrag} (not per-frame mouse deltas).
   */
  handleDrag(diff, context) {
    if (!this.dragStartRect || !this.lastSnappedPos) {
      return;
    }
    super.handleDrag(diff, context);
    const group = this.groupState.$state.value;
    if (!group.collapsed || !group.collapsedRect || !this.dragStartCollapsedRect || !this.dragStartRect) {
      return;
    }
    const { x: newInnerX, y: newInnerY } = this.snapPosition(this.dragStartRect.x + diff.diffX, this.dragStartRect.y + diff.diffY);
    const dx = newInnerX - this.dragStartRect.x;
    const dy = newInnerY - this.dragStartRect.y;
    if (dx === 0 && dy === 0) {
      return;
    }
    const newCollapsedRect = {
      x: this.dragStartCollapsedRect.x + dx,
      y: this.dragStartCollapsedRect.y + dy,
      width: this.dragStartCollapsedRect.width,
      height: this.dragStartCollapsedRect.height
    };
    this.groupState.updateGroup({
      collapsedRect: newCollapsedRect
    });
    this.updateGroupPortPositions(this.getRect(newCollapsedRect));
  }
  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  /** Whether this group is currently in the collapsed state. */
  isCollapsed() {
    return this.groupState.$state.value.collapsed ?? false;
  }
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  getGroupBlocks() {
    return this.context.graph.rootStore.groupsList.$blockGroups.value[this.props.id] ?? [];
  }
  /**
   * Returns the number of ports currently delegated to the left and right
   * group edge ports. Only meaningful when the group is collapsed.
   *
   * Cost is O(blocks × anchors) per call when the cache is cold — typical group
   * sizes keep this cheap. The result is cached until delegation changes
   * ({@link delegatePorts} / {@link undelegatePorts}); override {@link renderCollapsedView}
   * and call a custom counter if you need different invalidation rules.
   */
  getPortDelegationCounts() {
    if (this.portDelegationCountsCache !== void 0) {
      return this.portDelegationCountsCache;
    }
    let left = 0;
    let right = 0;
    this.getGroupBlocks().forEach((blockState) => {
      const canvasBlock = blockState.getViewComponent();
      if (!canvasBlock)
        return;
      const inputPort = canvasBlock.getInputPort();
      if (inputPort?.isDelegated)
        left++;
      const outputPort = canvasBlock.getOutputPort();
      if (outputPort?.isDelegated)
        right++;
      blockState.$anchors.value.forEach((anchor) => {
        const port = canvasBlock.getAnchorPort(anchor.id);
        if (port?.isDelegated) {
          if (anchor.type === EAnchorType.OUT)
            right++;
          else
            left++;
        }
      });
    });
    this.portDelegationCountsCache = { left, right };
    return this.portDelegationCountsCache;
  }
  invalidatePortDelegationCountsCache() {
    this.portDelegationCountsCache = void 0;
  }
  /**
   * Compute the collapsed rect for a given full rect.
   *
   * Uses the user-provided `getCollapseRect` if available, otherwise falls
   * back to the direction-based default.
   */
  computeCollapsedRect(fullRect) {
    const state = this.groupState.$state.value;
    if (state.getCollapseRect) {
      return state.getCollapseRect(state, fullRect);
    }
    return computeDefaultCollapseRect(fullRect, state.collapseDirection);
  }
  // ---------------------------------------------------------------------------
  // Collapse
  // ---------------------------------------------------------------------------
  /**
   * Collapse the group: set collapsedRect, hide member blocks,
   * and redirect their ports to the group edges.
   *
   * Emits a cancelable `group-collapse-change` event before applying changes.
   * If a listener calls `event.preventDefault()`, the collapse is cancelled.
   */
  collapse() {
    const currentRect = this.groupState.$state.value.rect;
    const nextRect = this.computeCollapsedRect(currentRect);
    this.context.graph.execut\u0435DefaultEventAction("group-collapse-change", {
      groupId: this.props.id,
      collapsed: true,
      currentRect,
      nextRect
    }, () => {
      n(() => {
        this.applyBlockVisibility(true);
        this.delegatePorts(nextRect);
        this.groupState.updateGroup({
          collapsed: true,
          collapsedRect: nextRect
        });
      });
      this.updateHitBox(nextRect);
    });
  }
  // ---------------------------------------------------------------------------
  // Expand
  // ---------------------------------------------------------------------------
  /**
   * Expand the group: remove collapsedRect, show member blocks, and let
   * them resume managing their own ports.
   *
   * Emits a cancelable `group-collapse-change` event before applying changes.
   * If a listener calls `event.preventDefault()`, the expand is cancelled.
   */
  expand() {
    const state = this.groupState.$state.value;
    const currentRect = state.collapsedRect ?? state.rect;
    const nextRect = state.rect;
    this.context.graph.execut\u0435DefaultEventAction("group-collapse-change", {
      groupId: this.props.id,
      collapsed: false,
      currentRect,
      nextRect
    }, () => {
      n(() => {
        this.undelegatePorts();
        this.applyBlockVisibility(false);
        this.groupState.updateGroup({
          collapsed: false,
          collapsedRect: void 0
        });
      });
      this.updateHitBox(this.groupState.$state.value.rect);
    });
  }
  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  unmount() {
    if (this.state.collapsed) {
      this.applyBlockVisibility(false);
      this.undelegatePorts();
    }
    this.invalidatePortDelegationCountsCache();
    super.unmount();
  }
  // ---------------------------------------------------------------------------
  // Block visibility
  // ---------------------------------------------------------------------------
  applyBlockVisibility(hidden) {
    this.getGroupBlocks().forEach((blockState) => {
      blockState.requestHidden(hidden);
    });
  }
  // ---------------------------------------------------------------------------
  // Port delegation
  // ---------------------------------------------------------------------------
  /**
   * Get (or create) the group's left-edge port used as a delegation target.
   * Input ports and IN anchors delegate to this port when collapsed.
   */
  getLeftEdgePort() {
    return this.getPort(`${String(this.props.id)}${GROUP_PORT_LEFT}`);
  }
  /**
   * Get (or create) the group's right-edge port used as a delegation target.
   * Output ports and OUT anchors delegate to this port when collapsed.
   */
  getRightEdgePort() {
    return this.getPort(`${String(this.props.id)}${GROUP_PORT_RIGHT}`);
  }
  /**
   * Update the group's edge port positions to match the given rect.
   */
  updateGroupPortPositions(rect) {
    const midY = rect.y + rect.height / 2;
    this.getLeftEdgePort().setPoint(rect.x, midY);
    this.getRightEdgePort().setPoint(rect.x + rect.width, midY);
  }
  /**
   * Delegate all ports of group blocks to the group's edge ports.
   *
   * - Input port  → left-edge port
   * - Output port → right-edge port
   * - IN anchors  → left-edge port
   * - OUT anchors → right-edge port
   *
   * While delegated, block ports mirror the group edge positions.
   * When the group is dragged, only the group edge ports need to be
   * updated — all delegated ports follow automatically.
   */
  delegatePorts(targetRect) {
    this.invalidatePortDelegationCountsCache();
    const rect = this.getRect(targetRect);
    this.updateGroupPortPositions(rect);
    const leftPort = this.getLeftEdgePort();
    const rightPort = this.getRightEdgePort();
    this.getGroupBlocks().forEach((blockState) => {
      const canvasBlock = blockState.getViewComponent();
      if (!canvasBlock)
        return;
      const inputPort = canvasBlock.getInputPort();
      if (inputPort && !inputPort.isDelegated) {
        inputPort.delegate(leftPort);
      }
      const outputPort = canvasBlock.getOutputPort();
      if (outputPort && !outputPort.isDelegated) {
        outputPort.delegate(rightPort);
      }
      blockState.$anchors.value.forEach((anchor) => {
        const port = canvasBlock.getAnchorPort(anchor.id);
        if (port && !port.isDelegated) {
          port.delegate(anchor.type === EAnchorType.OUT ? rightPort : leftPort);
        }
      });
    });
  }
  /**
   * Remove delegation from all ports of group blocks, restoring their
   * original positions (saved automatically by the delegation mechanism).
   */
  undelegatePorts() {
    this.invalidatePortDelegationCountsCache();
    this.getGroupBlocks().forEach((blockState) => {
      const canvasBlock = blockState.getViewComponent();
      if (!canvasBlock)
        return;
      const inputPort = canvasBlock.getInputPort();
      if (inputPort?.isDelegated) {
        inputPort.undelegate();
      }
      const outputPort = canvasBlock.getOutputPort();
      if (outputPort?.isDelegated) {
        outputPort.undelegate();
      }
      blockState.$anchors.value.forEach((anchor) => {
        const port = canvasBlock.getAnchorPort(anchor.id);
        if (port?.isDelegated) {
          port.undelegate();
        }
      });
    });
  }
  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  render() {
    const collapsed = this.state.collapsed ?? false;
    if (collapsed) {
      this.renderCollapsedView(this.context.ctx);
    } else {
      super.render();
    }
  }
  /**
   * Render the compact header shown when the group is collapsed.
   * Override this method to customise the collapsed appearance.
   */
  renderCollapsedView(ctx) {
    const rect = this.getRect();
    if (this.isHighlighted()) {
      ctx.strokeStyle = this.style.highlightedBorder;
      ctx.fillStyle = this.style.highlightedBackground;
    } else if (this.state.selected) {
      ctx.strokeStyle = this.style.selectedBorder;
      ctx.fillStyle = this.style.selectedBackground;
    } else {
      ctx.strokeStyle = this.style.border;
      ctx.fillStyle = this.style.background;
    }
    ctx.lineWidth = this.style.borderWidth;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    ctx.stroke();
    const label = `[\u2212] ${String(this.props.id)}`;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width - 16);
  }
};

// node_modules/@gravity-ui/graph/build/store/group/Group.js
var GroupState = class _GroupState {
  constructor(store, state, groupSelectionBucket) {
    this.store = store;
    this.groupSelectionBucket = groupSelectionBucket;
    this.$state = y({
      id: "",
      rect: {
        x: 0,
        y: 0,
        width: 0,
        height: 0
      },
      component: Group
    });
    this.$viewComponent = y(void 0);
    this.sizeLocked = false;
    this.$selected = g(() => {
      return this.groupSelectionBucket.isSelected(this.id);
    });
    this.$state.value = state;
  }
  setViewComponent(component) {
    this.$viewComponent.value = component;
  }
  getViewComponent() {
    return this.$viewComponent.value;
  }
  /**
   * Check if the group's size is locked
   */
  isSizeLocked() {
    return this.sizeLocked;
  }
  /**
   * Lock the group's size to prevent auto-resize during block transfer
   */
  lockSize() {
    this.sizeLocked = true;
  }
  /**
   * Unlock the group's size to allow auto-resize
   */
  unlockSize() {
    this.sizeLocked = false;
  }
  get id() {
    return this.$state.value.id;
  }
  updateGroup(group) {
    this.$state.value = {
      ...this.$state.value,
      ...group
    };
  }
  setSelection(selected, strategy = ESelectionStrategy.REPLACE) {
    this.store.updateGroupsSelection([this.id], selected, strategy);
  }
  asTGroup() {
    return this.$state.value;
  }
  static fromTGroup(store, group) {
    return new _GroupState(store, group, store.groupSelectionBucket);
  }
};

// node_modules/@gravity-ui/graph/build/store/group/GroupsList.js
var GroupsListStore = class {
  constructor(rootStore, graph) {
    this.rootStore = rootStore;
    this.graph = graph;
    this.$groupsMap = y(/* @__PURE__ */ new Map());
    this.$groups = g(() => {
      return Array.from(this.$groupsMap.value.values());
    });
    this.$blockGroups = g(() => {
      return (0, import_groupBy.default)(this.rootStore.blocksList.$blocks.value, (item) => item.$state.value.group);
    });
    this.groupSelectionBucket = new MultipleSelectionBucket("group", (payload, defaultAction) => {
      this.graph.execut\u0435DefaultEventAction("groups-selection-change", payload, defaultAction);
    }, (element) => {
      return element instanceof Group;
    }, (ids) => {
      return this.getGroupStates(ids).filter((value) => Boolean(value)).map((group) => group.getViewComponent()).filter((value) => Boolean(value));
    });
    this.$selectedGroups = g(() => {
      return Array.from(this.groupSelectionBucket.$selected.value).map((id) => this.getGroupState(id)).filter(Boolean);
    });
    this.groupSelectionBucket.attachToManager(this.rootStore.selectionService);
  }
  updateGroupsMap(groups) {
    this.$groupsMap.value = new Map(groups);
  }
  addGroup(group) {
    this.$groupsMap.value.set(group.id, this.getOrCreateGroupState(group));
    this.updateGroupsMap(this.$groupsMap.value);
    return group.id;
  }
  deleteGroups(groups) {
    const map = new Map(this.$groupsMap.value);
    groups.forEach((gId) => {
      const id = typeof gId === "string" ? gId : gId.id;
      map.delete(id);
    });
    this.updateGroupsMap(map);
  }
  updateGroups(groups) {
    this.updateGroupsMap(groups.reduce((acc, group) => {
      const state = this.getOrCreateGroupState(group);
      acc.set(group.id, state);
      return acc;
    }, this.$groupsMap.value));
  }
  setGroups(groups) {
    const groupStates = groups.map((group) => this.getOrCreateGroupState(group));
    this.applyGroupsState(groupStates);
  }
  getOrCreateGroupState(group) {
    const groupState = this.$groupsMap.value.get(group.id);
    if (groupState) {
      groupState.updateGroup(group);
      return groupState;
    }
    return GroupState.fromTGroup(this, group);
  }
  applyGroupsState(groups) {
    this.updateGroupsMap(groups.map((group) => [group.id, group]));
  }
  getGroupState(id) {
    return this.$groupsMap.value.get(id);
  }
  getGroup(id) {
    return this.getGroupState(id)?.asTGroup();
  }
  reset() {
    this.applyGroupsState([]);
  }
  toJSON() {
    return this.$groups.value.map((group) => group.asTGroup());
  }
  /**
   * Updates group selection using the SelectionService
   * @param ids Group IDs to update selection for
   * @param selected Whether to select or deselect
   * @param strategy The selection strategy to apply
   */
  updateGroupsSelection(ids, selected, strategy = ESelectionStrategy.REPLACE) {
    if (selected) {
      this.groupSelectionBucket.select(ids, strategy);
    } else {
      this.groupSelectionBucket.deselect(ids);
    }
  }
  /**
   * Resets the selection for groups
   */
  resetSelection() {
    this.groupSelectionBucket.reset();
  }
  getGroupStates(ids) {
    return ids.map((id) => this.getGroupState(id)).filter(Boolean);
  }
};

// node_modules/@gravity-ui/graph/build/store/index.js
var RootStore = class {
  constructor(graph) {
    this.selectionService = new SelectionService();
    this.blocksList = new BlockListStore(this, graph);
    this.connectionsList = new ConnectionsStore(this, graph);
    this.settings = new GraphEditorSettings(this);
    this.groupsList = new GroupsListStore(this, graph);
  }
  getAsConfig() {
    return (0, import_cloneDeep5.default)({
      configurationName: this.configurationName,
      blocks: this.blocksList.toJSON(),
      connections: this.connectionsList.toJSON(),
      settings: this.settings.toJSON()
    });
  }
  reset() {
    n(() => {
      this.blocksList.reset();
      this.connectionsList.reset();
      this.settings.reset();
      this.groupsList.reset();
    });
  }
};

// node_modules/@gravity-ui/graph/build/graph.js
var GraphState;
(function(GraphState2) {
  GraphState2[GraphState2["INIT"] = 0] = "INIT";
  GraphState2[GraphState2["ATTACHED"] = 1] = "ATTACHED";
  GraphState2[GraphState2["READY"] = 2] = "READY";
})(GraphState || (GraphState = {}));
var Graph = class {
  getGraphCanvas() {
    return this.graphLayer.getCanvas();
  }
  get graphColors() {
    return this.$graphColors.value;
  }
  get graphConstants() {
    return this.$graphConstants.value;
  }
  get blocks() {
    return this.rootStore.blocksList;
  }
  get connections() {
    return this.rootStore.connectionsList;
  }
  get selectionService() {
    return this.rootStore.selectionService;
  }
  constructor(config, rootEl, graphColors, graphConstants) {
    this.scheduler = scheduler;
    this.cameraService = new CameraService(this);
    this.layers = new Layers();
    this.api = new PublicGraphApi(this);
    this.eventEmitter = new EventTarget();
    this.rootStore = new RootStore(this);
    this.hitTest = new HitTest(this);
    this.$graphColors = y(initGraphColors);
    this.$graphConstants = y(initGraphConstants);
    this.$camera = y(getInitCameraState());
    this.state = GraphState.INIT;
    this.startRequested = false;
    this.onUpdateSize = (event) => {
      this.cameraService.set(event);
    };
    this.belowLayer = this.addLayer(BelowLayer, {});
    this.graphLayer = this.addLayer(GraphLayer, {});
    this.selectionLayer = this.addLayer(SelectionLayer, {});
    this.cursorLayer = this.addLayer(CursorLayer, {});
    this.dragService = new DragService(this);
    this.keyboardService = new KeyboardService(this);
    this.selectionLayer.hide();
    this.graphLayer.hide();
    this.belowLayer.hide();
    if (rootEl) {
      this.attach(rootEl);
    }
    if (graphColors) {
      this.setColors(graphColors);
    }
    if (graphConstants) {
      this.setConstants(graphConstants);
    }
    this.setupGraph(config);
  }
  getGraphLayer() {
    return this.graphLayer;
  }
  setColors(colors) {
    this.$graphColors.value = (0, import_merge.default)({}, this.$graphColors.value, colors);
    this.emit("colors-changed", { colors: this.graphColors });
  }
  setConstants(constants) {
    this.$graphConstants.value = (0, import_merge.default)({}, this.$graphConstants.value, constants);
    this.emit("constants-changed", { constants: this.graphConstants });
  }
  /**
   * Zoom to center of camera
   * @param zoomConfig - zoom config
   * @param zoomConfig.x if set - zoom to x coordinate, else - zoom to center
   * @param zoomConfig.y if set - zoom to y coordinate, else - zoom to center
   * @param zoomConfig.scale camera scale
   *
   * @returns {undefined}
   * */
  zoom(zoomConfig) {
    const { width, height } = this.cameraService.getCameraState();
    this.cameraService.zoom(zoomConfig.x || width / 2, zoomConfig.y || height / 2, zoomConfig.scale);
  }
  /**
   * Zooms to the target
   *
   * - If target is rectangle, it will be zoomed({@link PublicGraphApi.zoomToRect}) to the rectangle and returns true.
   * - If target is array of block ids, it will be zoomed({@link PublicGraphApi.zoomToBlocks}) to the blocks, if at least one block is found, returns true, otherwise returns false.
   * - If target is array of {@link GraphComponent} instances, it will be zoomed({@link PublicGraphApi.zoomToElements}) to the rect containing all components and returns true.
   * - If target is center, it will be zoomed({@link PublicGraphApi.zoomToViewPort}) to the center and returns true.
   *
   * @example
   * ```typescript
   * graph.zoomTo("center");
   * graph.zoomTo([block1.id, block2.id]);
   * graph.zoomTo([block1, block2]);
   * graph.zoomTo({x: 100, y: 100, width: 100, height: 100 });
   * ```
   * @param target - target to zoom to
   * @param config - zoom config, optional, optional
   * @returns {boolean} true if zoom is successful, false otherwise
   *
   * */
  zoomTo(target, config) {
    if (isTRect(target)) {
      this.api.zoomToRect(target, config);
      return true;
    }
    if (Array.isArray(target)) {
      if (target.every((item) => item instanceof GraphComponent)) {
        return this.api.zoomToElements(target, config);
      }
      if (target.every((item) => typeof item === "string")) {
        return this.api.zoomToBlocks(target, config);
      }
    }
    this.api.zoomToViewPort(config);
    return true;
  }
  getElementsOverPoint(point, filter) {
    const items = this.hitTest.testPoint(point, this.layers.getDPR());
    if (filter && items.length > 0) {
      return items.filter((item) => filter.some((Component2) => item instanceof Component2));
    }
    return items;
  }
  getElementOverPoint(point, filter) {
    return this.getElementsOverPoint(point, filter)?.[0];
  }
  /**
   * Returns the current viewport rectangle in camera space, expanded by threshold.
   * @returns {TRect} Viewport rect in camera-relative coordinates
   */
  getViewportRect() {
    const CAMERA_VIEWPORT_TRESHOLD = this.graphConstants.system.CAMERA_VIEWPORT_TRESHOLD;
    const rel = this.cameraService.getRelativeViewportRect();
    const x2 = -rel.x - rel.width * CAMERA_VIEWPORT_TRESHOLD;
    const y2 = -rel.y - rel.height * CAMERA_VIEWPORT_TRESHOLD;
    const width = -rel.x + rel.width * (1 + CAMERA_VIEWPORT_TRESHOLD) - x2;
    const height = -rel.y + rel.height * (1 + CAMERA_VIEWPORT_TRESHOLD) - y2;
    return { x: x2, y: y2, width, height };
  }
  getElementsInViewport(filter) {
    const viewportRect = this.getViewportRect();
    return this.getElementsOverRect(viewportRect, filter);
  }
  getElementsOverRect(rect, filter) {
    const items = this.hitTest.testBox({
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.width,
      maxY: rect.y + rect.height
    });
    if (filter.length && items.length > 0) {
      return items.filter((item) => filter.some((Component2) => item instanceof Component2));
    }
    return items;
  }
  getPointInCameraSpace(event) {
    const xy = getXY(this.graphLayer.getCanvas(), event);
    const applied = this.cameraService.applyToPoint(xy[0], xy[1]);
    return new Point(applied[0], applied[1], { x: xy[0], y: xy[1] });
  }
  updateEntities({ blocks, connections }) {
    n(() => {
      if (blocks?.length) {
        this.rootStore.blocksList.updateBlocks(blocks);
      }
      if (connections?.length) {
        this.rootStore.connectionsList.updateConnections(connections);
      }
    });
  }
  setEntities({ blocks, connections }) {
    this.hitTest.markPendingUpdate();
    n(() => {
      this.rootStore.blocksList.setBlocks(blocks || []);
      this.rootStore.connectionsList.setConnections(connections || []);
    });
  }
  on(type, cb, options) {
    this.eventEmitter.addEventListener(type, cb, options);
    return () => this.off(type, cb);
  }
  off(type, cb) {
    this.eventEmitter.removeEventListener(type, cb);
  }
  /*
   * Emit Graph's events
   */
  emit(eventName, detail) {
    const event = new GraphEvent(eventName, {
      detail,
      bubbles: false,
      cancelable: true
    });
    this.eventEmitter.dispatchEvent(event);
    if (eventName === "mousedown" && isGraphEvent(event) && !event.isDefaultPrevented()) {
      this.dragService.handleMouseDown(event);
    }
    return event;
  }
  /*
   * Emit Graph's event and execute default action if it is not prevented
   */
  execut\u0435DefaultEventAction(eventName, detail, defaultCb) {
    const event = this.emit(eventName, detail);
    if (!event.defaultPrevented) {
      defaultCb();
    }
  }
  addLayer(layerCtor, props) {
    return this.layers.createLayer(layerCtor, {
      ...props,
      camera: this.cameraService,
      graph: this
    });
  }
  detachLayer(layer) {
    this.layers.detachLayer(layer);
  }
  setupGraph(config = {}) {
    this.config = config;
    this.rootStore.configurationName = config.configurationName;
    this.setEntities({
      blocks: config.blocks,
      connections: config.connections
    });
    if (config.settings) {
      this.updateSettings(config.settings);
    }
    if (config.layers) {
      config.layers.forEach(([layer, params]) => {
        this.addLayer(layer, params);
      });
    }
  }
  updateSettings(settings) {
    this.rootStore.settings.setupSettings(settings);
  }
  updateSize() {
    this.layers.updateSize();
  }
  attach(rootEl) {
    if (this.state === GraphState.READY) {
      return;
    }
    rootEl[/* @__PURE__ */ Symbol.for("graph")] = this;
    this.layers.attach(rootEl);
    const { width: rootWidth, height: rootHeight } = this.layers.getRootSize();
    this.cameraService.set({ width: rootWidth, height: rootHeight });
    this.setGraphState(GraphState.ATTACHED);
    if (this.startRequested) {
      this.startRequested = false;
      this.start();
    }
  }
  start(rootEl = this.layers.$root) {
    if (this.state !== GraphState.ATTACHED) {
      this.startRequested = true;
      return;
    }
    if (this.state >= GraphState.READY) {
      throw new Error("Graph already started");
    }
    if (rootEl) {
      this.attach(rootEl);
    }
    this.layers.on("update-size", this.onUpdateSize);
    this.layers.start();
    this.scheduler.start();
    this.setGraphState(GraphState.READY);
    this.runAfterGraphReady(() => {
      this.selectionLayer.show();
      this.graphLayer.show();
      this.belowLayer.show();
      this.cursorLayer.show();
    });
  }
  /**
   * Graph is ready when the hitboxes are stable.
   * In order to initialize hitboxes we need to start scheduler and wait untils every component registered in hitTest service
   * Immediatelly after registering startign a rendering process.
   * @param cb - Callback to run after graph is ready
   */
  runAfterGraphReady(cb) {
    this.hitTest.waitUsableRectUpdate(cb);
  }
  stop(full = false) {
    this.layers.detach(full);
    clearTextCache();
    this.scheduler.stop();
    this.setGraphState(this.layers.$root ? GraphState.ATTACHED : GraphState.INIT);
  }
  setGraphState(state) {
    if (this.state === state) {
      return;
    }
    this.state = state;
    this.emit("state-change", { state: this.state });
  }
  clear() {
    this.layers.detach();
    clearTextCache();
  }
  detach() {
    this.stop(true);
  }
  unmount() {
    this.detach();
    this.layers.off("update-size", this.onUpdateSize);
    this.setGraphState(GraphState.INIT);
    this.hitTest.clear();
    this.layers.unmount();
    clearTextCache();
    clearColorCache();
    this.rootStore.reset();
    this.scheduler.stop();
    this.dragService.destroy();
  }
  /**
   * Locks the cursor to a specific type, disabling automatic cursor changes.
   *
   * When the cursor is locked, it will remain fixed to the specified type
   * and will not change automatically based on component interactions until
   * unlockCursor() is called. This is useful during drag operations, loading
   * states, or other situations where you want to override the default
   * interactive cursor behavior.
   *
   * @param cursor - The cursor type to lock to
   *
   * @example
   * ```typescript
   * // Lock to loading cursor during async operation
   * graph.lockCursor("wait");
   *
   * // Lock to grabbing cursor during drag operation
   * graph.lockCursor("grabbing");
   *
   * // Lock to copy cursor for duplication operations
   * graph.lockCursor("copy");
   * ```
   *
   * @see {@link CursorLayer.lockCursor} for more details
   * @see {@link unlockCursor} to return to automatic behavior
   */
  lockCursor(cursor) {
    this.cursorLayer.lockCursor(cursor);
  }
  /**
   * Unlocks the cursor and returns to automatic cursor management.
   *
   * The cursor will immediately update to reflect the current state
   * based on the component under the mouse (if any). This provides
   * smooth transitions when ending drag operations or async tasks.
   *
   * @example
   * ```typescript
   * // After completing a drag operation
   * graph.unlockCursor(); // Will show appropriate cursor for current hover state
   *
   * // After finishing an async operation
   * await someAsyncTask();
   * graph.unlockCursor(); // Returns to interactive cursor behavior
   * ```
   *
   * @see {@link CursorLayer.unlockCursor} for more details
   * @see {@link lockCursor} to override automatic behavior
   */
  unlockCursor() {
    this.cursorLayer.unlockCursor();
  }
  /**
   * Returns the CursorLayer instance for advanced cursor management.
   *
   * Use this method when you need direct access to cursor layer functionality
   * beyond the basic setCursor/unsetCursor API, such as checking the current
   * mode or getting the component under the cursor.
   *
   * @returns The CursorLayer instance
   *
   * @example
   * ```typescript
   * const cursorLayer = graph.getCursorLayer();
   *
   * // Check current mode
   * if (cursorLayer.isManual()) {
   *   console.log("Manual cursor:", cursorLayer.getManualCursor());
   * }
   *
   * // Get component under cursor for debugging
   * const target = cursorLayer.getCurrentTarget();
   * console.log("Hovering over:", target?.constructor.name);
   * ```
   *
   * @see {@link CursorLayer} for available methods and properties
   */
  getCursorLayer() {
    return this.cursorLayer;
  }
};

// node_modules/@gravity-ui/graph/build/plugins/minimap/layer.js
var MiniMapLayer = class extends Layer {
  constructor(props) {
    const classNames = [...Array.isArray(props.classNames) ? props.classNames : [], "graph-minimap"];
    super({
      canvas: {
        zIndex: 300,
        classNames,
        transformByCameraPosition: false
      },
      ...props
    });
    this.handleMouseDownEvent = (rootEvent) => {
      rootEvent.stopPropagation();
      this.onCameraDrag(rootEvent);
      this.context.graph.dragService.startDrag({ onUpdate: (event) => this.onCameraDrag(event) }, { stopOnMouseLeave: true, autopanning: false, cursor: "move" });
    };
    this.minimapWidth = this.props.width ?? 200;
    this.minimapHeight = this.props.height ?? 200;
    this.cameraBorderSize = this.props.cameraBorderSize ?? 2;
    this.cameraBorderColor = this.props.cameraBorderColor ?? "rgba(255, 119, 0, 0.9)";
    this.relativeX = 0;
    this.relativeY = 0;
    this.scale = 1;
  }
  afterInit() {
    this.injectPositionStyle();
    this.onSignal(this.props.graph.hitTest.$usableRect, () => {
      this.calculateViewPortCoords();
      this.performRender();
    });
    this.onGraphEvent("colors-changed", () => this.performRender());
    const onBlocksMoved = () => {
      this.calculateViewPortCoords();
      this.performRender();
    };
    this.onGraphEvent("block-change", onBlocksMoved);
    this.onGraphEvent("blocks-geometry-change", onBlocksMoved);
    if (this.canvas) {
      this.onCanvasEvent("mousedown", this.handleMouseDownEvent);
    }
    super.afterInit();
  }
  onCameraChange(_camera) {
    this.performRender();
  }
  updateCanvasSize() {
    const dpr = this.getDRP();
    this.canvas.width = this.minimapWidth * dpr;
    this.canvas.height = this.minimapHeight * dpr;
  }
  willRender() {
    if (this.firstRender) {
      this.canvas.style.width = `${this.minimapWidth}px`;
      this.canvas.style.height = `${this.minimapHeight}px`;
    }
  }
  render() {
    if (!this.context?.ctx)
      return;
    const usableRect = this.props.graph.api.getUsableRect();
    if (usableRect.width === 0 && usableRect.height === 0) {
      this.resetTransform();
      return;
    }
    this.resetTransform();
    this.context.ctx.scale(this.scale, this.scale);
    this.context.ctx.translate(-this.relativeX, -this.relativeY);
    this.renderUsableRectBelow();
    this.renderBlocks();
    this.drawCameraBorderFrame();
  }
  injectPositionStyle() {
    const minimapPosition = this.getPositionOfMiniMap(this.props.location);
    const style = document.createElement("style");
    style.innerHTML = `
      .layer.graph-minimap {
        top: ${minimapPosition.top};
        left: ${minimapPosition.left};
        bottom: ${minimapPosition.bottom};
        right: ${minimapPosition.right};
        width: ${this.minimapWidth}px;
        height: ${this.minimapHeight}px;
        border: 2px solid var(--g-color-private-cool-grey-1000-solid);
        background: lightgrey;
      }`;
    this.root.appendChild(style);
  }
  calculateViewPortCoords() {
    const usableRect = this.props.graph.api.getUsableRect();
    const xPos = usableRect.x - this.context.constants.system.USABLE_RECT_GAP;
    const yPos = usableRect.y - this.context.constants.system.USABLE_RECT_GAP;
    const width = usableRect.width + this.context.constants.system.USABLE_RECT_GAP * 2;
    const height = usableRect.height + this.context.constants.system.USABLE_RECT_GAP * 2;
    if (width > height) {
      this.scale = this.minimapWidth / width;
    } else {
      this.scale = this.minimapHeight / height;
    }
    if (height > this.minimapHeight / this.scale)
      this.scale = this.minimapHeight / height;
    if (width > this.minimapWidth / this.scale)
      this.scale = this.minimapWidth / width;
    this.relativeX = xPos + width / 2 - this.minimapWidth / this.scale / 2;
    this.relativeY = yPos + height / 2 - this.minimapHeight / this.scale / 2;
  }
  // eslint-disable-next-line complexity
  drawCameraBorderFrame() {
    const cameraState = this.props.camera.getCameraState();
    const relativeXRight = this.relativeX + this.minimapWidth / this.scale;
    const relativeYBottom = this.relativeY + this.minimapHeight / this.scale;
    let width = cameraState.relativeWidth;
    let height = cameraState.relativeHeight;
    let xPos = -cameraState.relativeX;
    let yPos = -cameraState.relativeY;
    const scaledCameraBorderSize = this.cameraBorderSize / this.scale;
    if (xPos <= this.relativeX && xPos + width <= this.relativeX) {
      xPos = this.relativeX;
      width = scaledCameraBorderSize;
    } else if (xPos <= this.relativeX && xPos + width > this.relativeX && xPos + width <= relativeXRight) {
      width = width - (this.relativeX - xPos);
      xPos = this.relativeX;
    } else if (xPos <= this.relativeX && xPos + width > relativeXRight) {
      xPos = this.relativeX;
      width = this.minimapWidth / this.scale;
    } else if (xPos >= this.relativeX && xPos < relativeXRight && xPos + width <= relativeXRight) {
    } else if (xPos >= this.relativeX && xPos < relativeXRight && xPos + width > relativeXRight) {
      width = this.minimapWidth / this.scale - (xPos - this.relativeX);
    } else if (xPos >= relativeXRight && xPos + width > relativeXRight) {
      xPos = relativeXRight - scaledCameraBorderSize;
      width = scaledCameraBorderSize;
    }
    if (yPos <= this.relativeY && yPos + height <= this.relativeY) {
      yPos = this.relativeY;
      height = scaledCameraBorderSize;
    } else if (yPos <= this.relativeY && yPos + height > this.relativeY && yPos + height <= relativeYBottom) {
      height = height - (this.relativeY - yPos);
      yPos = this.relativeY;
    } else if (yPos <= this.relativeY && yPos + height > relativeYBottom) {
      yPos = this.relativeY;
      height = this.minimapHeight / this.scale;
    } else if (yPos >= this.relativeY && yPos < relativeYBottom && yPos + height <= relativeYBottom) {
    } else if (yPos >= this.relativeY && yPos < relativeYBottom && yPos + height > relativeYBottom) {
      height = this.minimapHeight / this.scale - (yPos - this.relativeY);
    } else if (yPos >= relativeYBottom && yPos + height > relativeYBottom) {
      yPos = relativeYBottom - scaledCameraBorderSize;
      height = scaledCameraBorderSize;
    }
    this.context.ctx.lineWidth = scaledCameraBorderSize;
    this.context.ctx.strokeStyle = computeCssVariable(this.cameraBorderColor);
    this.context.ctx.strokeRect(xPos, yPos, width, height);
  }
  getPositionOfMiniMap(location) {
    let position2 = {
      left: "unset",
      top: "unset",
      bottom: "unset",
      right: "unset"
    };
    if (!location || location === "topLeft") {
      position2.top = "0px";
      position2.left = "0px";
    }
    if (location === "topRight") {
      position2.top = "0px";
      position2.right = "0px";
    }
    if (location === "bottomRight") {
      position2.bottom = "0px";
      position2.right = "0px";
    }
    if (location === "bottomLeft") {
      position2.bottom = "0px";
      position2.left = "0px";
    }
    if (typeof location === "object") {
      position2 = location;
    }
    return position2;
  }
  renderUsableRectBelow() {
    const usableRect = this.props.graph.api.getUsableRect();
    this.context.ctx.fillStyle = computeCssVariable(this.context.colors.canvas.layerBackground);
    const xPos = usableRect.x - this.context.constants.system.USABLE_RECT_GAP;
    const yPos = usableRect.y - this.context.constants.system.USABLE_RECT_GAP;
    const width = usableRect.width + this.context.constants.system.USABLE_RECT_GAP * 2;
    const height = usableRect.height + this.context.constants.system.USABLE_RECT_GAP * 2;
    this.context.ctx.fillRect(xPos, yPos, width, height);
  }
  renderBlocks() {
    const blocks = this.props.graph.rootStore.blocksList.$blocks.value;
    blocks.forEach((block) => {
      const viewComponent = block.getViewComponent();
      viewComponent?.renderMinimalisticBlock(this.context.ctx);
    });
  }
  onCameraDrag(event) {
    const cameraState = this.props.camera.getCameraState();
    const x2 = -(this.relativeX + event.offsetX / this.scale) + cameraState.relativeWidth / 2;
    const y2 = -(this.relativeY + event.offsetY / this.scale) + cameraState.relativeHeight / 2;
    const dx = x2 * cameraState.scale - cameraState.x;
    const dy = y2 * cameraState.scale - cameraState.y;
    this.context.camera.move(dx, dy);
  }
};

// node_modules/@gravity-ui/graph/build/plugins/cssVariables/CSSVariablesLayer.js
var import_merge2 = __toESM(require_merge());

// node_modules/style-observer/src/util/Bug.js
var Bug = class _Bug {
  constructor({ name, initialValue, detect }) {
    this.name = name;
    this.initialValue = initialValue ?? true;
    this.detect = detect;
    _Bug.all[name] = this;
    Object.defineProperty(_Bug, name, {
      get() {
        return this.all[name].value;
      },
      configurable: true,
      enumerable: true
    });
  }
  #value;
  #valuePending;
  /**
   * Get whether the bug is present or not, or a promise that will resolve to this value when detection is complete.
   */
  get valuePending() {
    if (this.#value !== void 0) {
      return this.#value;
    }
    if (this.#valuePending !== void 0) {
      return this.#valuePending;
    }
    this.#valuePending = this.detect();
    if (this.#valuePending instanceof Promise) {
      this.#valuePending.then((value) => this.#value = value);
    } else {
      this.#value = this.#valuePending;
    }
    return this.#valuePending;
  }
  /**
   * Synchronously get either whether the bug is present (if already detected or detection is sync)
   * or kick off detection and return the initial value if detection is async
   */
  get value() {
    if (this.#value !== void 0) {
      return this.#value;
    }
    let valuePending = this.valuePending;
    if (valuePending instanceof Promise) {
      return this.initialValue;
    } else {
      return valuePending;
    }
  }
  static all = {};
  static detectAll() {
    return Promise.all(Object.values(_Bug.all).map((bug) => bug.valuePending));
  }
};

// node_modules/style-observer/src/util/bugs/transitionrun-loop.js
var transitionrun_loop_default = new Bug({
  name: "TRANSITIONRUN_EVENT_LOOP",
  detect() {
    let dummy2 = document.createElement("div");
    document.body.appendChild(dummy2);
    let property = "--bar-" + Date.now();
    dummy2.style.cssText = `${property}: 1; transition: ${property} 1ms step-start allow-discrete`;
    return new Promise((resolve) => {
      let eventsCount = 0;
      requestAnimationFrame(() => {
        setTimeout((_2) => resolve(eventsCount > 1), 50);
        dummy2.addEventListener("transitionrun", (_2) => eventsCount++);
        dummy2.style.setProperty(property, "2");
      });
    }).finally(() => dummy2.remove());
  }
});

// node_modules/style-observer/src/util/bugs/unregistered-transition.js
var unregistered_transition_default = new Bug({
  name: "UNREGISTERED_TRANSITION",
  detect() {
    let dummy2 = document.createElement("div");
    document.body.appendChild(dummy2);
    let property = "--foo-" + Date.now();
    dummy2.style.cssText = `${property}: 1; transition: ${property} 1ms step-start allow-discrete`;
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout((_2) => resolve(true), 30);
        dummy2.addEventListener("transitionstart", (_2) => resolve(false));
        dummy2.style.setProperty(property, "2");
      });
    }).finally(() => dummy2.remove());
  }
});

// node_modules/style-observer/src/util/adopt-css.js
var styles = /* @__PURE__ */ new WeakMap();
function adoptCSS(css, root = globalThis.document) {
  root = root.ownerDocument ?? root;
  let window2 = root.defaultView;
  if (root.adoptedStyleSheets) {
    let sheet = new window2.CSSStyleSheet();
    sheet.replaceSync(css);
    if (Object.isFrozen(root.adoptedStyleSheets)) {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    } else {
      root.adoptedStyleSheets.push(sheet);
    }
    return sheet;
  } else {
    let style = styles.get(root);
    if (!style) {
      style = root.head.appendChild(root.createElement("style"));
      styles.set(root, style);
    }
    style.insertAdjacentText("beforeend", css);
    return style.sheet;
  }
}

// node_modules/style-observer/src/util/is-registered-property.js
function isRegisteredProperty(property, root = globalThis.document) {
  let dummy2 = root.createElement("div");
  root.body.append(dummy2);
  let invalidValue = "foo(bar)";
  dummy2.style.setProperty(property, invalidValue);
  let value = getComputedStyle(dummy2).getPropertyValue(property);
  let ret = true;
  if (value === invalidValue) {
    let child = dummy2.appendChild(root.createElement("div"));
    let inheritedValue = getComputedStyle(child).getPropertyValue(property);
    ret = inheritedValue !== invalidValue;
  }
  dummy2.remove();
  return ret;
}

// node_modules/style-observer/src/util/gentle-register-property.js
var INITIAL_VALUES = {
  "<angle>": "0deg",
  "<color>": "transparent",
  "<custom-ident>": "none",
  "<image>": "linear-gradient(transparent 0% 100%)",
  "<integer>": "0",
  "<length>": "0px",
  "<length-percentage>": "0px",
  "<number>": "0",
  "<percentage>": "0%",
  "<resolution>": "1dppx",
  "<string>": "''",
  "<time>": "0s",
  "<transform-function>": "scale(1)",
  "<transform-list>": "scale(1)",
  "<url>": "url('')"
};
var properties = /* @__PURE__ */ new Map();
function gentleRegisterProperty(property, meta = {}, root = globalThis.document) {
  let registeredProperties = properties.get(root);
  if (!property.startsWith("--") || registeredProperties && property in registeredProperties || isRegisteredProperty(property, root)) {
    return;
  }
  let definition = {
    syntax: meta.syntax || "*",
    inherits: meta.inherits ?? true
  };
  if (meta.initialValue !== void 0) {
    definition.initialValue = meta.initialValue;
  } else if (definition.syntax !== "*" && definition.syntax in INITIAL_VALUES) {
    definition.initialValue = INITIAL_VALUES[definition.syntax];
  }
  let styleSheet = adoptCSS(`@layer style-observer-registered-properties {
		@property ${property} {
			syntax: "${definition.syntax}";
			inherits: ${definition.inherits};
			${definition.initialValue !== void 0 ? `initial-value: ${definition.initialValue};` : ""}
		}
	}`, root);
  if (!registeredProperties) {
    registeredProperties = {};
    properties.set(root, registeredProperties);
  }
  registeredProperties[property] = styleSheet;
}

// node_modules/style-observer/src/util/bugs/adopted-style-sheet.js
var adopted_style_sheet_default = new Bug({
  name: "ADOPTED_STYLE_SHEET",
  detect() {
    let dummy2 = document.createElement("div");
    document.body.append(dummy2);
    dummy2.attachShadow({ mode: "open" });
    if (Object.isFrozen(dummy2.shadowRoot.adoptedStyleSheets)) {
      dummy2.remove();
      return false;
    }
    gentleRegisterProperty("--style-observer-adopted-style-sheet-bug", {
      syntax: "<number>",
      inherits: true,
      initialValue: 0
    });
    let sheet = new CSSStyleSheet();
    sheet.insertRule(`
			:host {
				/* This declaration shouldn't be empty for the bug to trigger */
				color: transparent;
			}
		`);
    dummy2.shadowRoot.adoptedStyleSheets.push(sheet);
    let style = sheet.cssRules[0].style;
    style.setProperty("--style-observer-adopted-style-sheet-bug", "1");
    let cs = getComputedStyle(dummy2);
    let oldValue = cs.getPropertyValue("--style-observer-adopted-style-sheet-bug");
    style.removeProperty("--style-observer-adopted-style-sheet-bug");
    cs = getComputedStyle(dummy2);
    let newValue = cs.getPropertyValue("--style-observer-adopted-style-sheet-bug");
    dummy2.remove();
    return oldValue === newValue;
  }
});

// node_modules/style-observer/src/util/MultiWeakMap.js
var MultiWeakMap = class extends WeakMap {
  has(key, value) {
    if (arguments.length === 1) {
      return super.has(key);
    }
    let set2 = super.get(key);
    return set2?.has(value) || false;
  }
  add(key, value) {
    let set2 = super.get(key) ?? /* @__PURE__ */ new Set();
    set2.add(value);
    super.set(key, set2);
  }
  delete(key, ...values) {
    let set2 = super.get(key);
    if (set2) {
      for (let value of values) {
        set2.delete(value);
      }
      if (set2.size === 0) {
        super.delete(key);
      }
    }
  }
};

// node_modules/style-observer/src/util.js
function toArray(value) {
  if (value === void 0 || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string" && typeof value[Symbol.iterator] === "function") {
    return Array.from(value);
  }
  return [value];
}
function wait(ms) {
  if (ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  return new Promise((resolve) => requestAnimationFrame(resolve));
}
var dummy;
function getLonghands(property) {
  dummy ??= document.createElement("div");
  let style = dummy.style;
  style[property] = "inherit";
  let ret = [...style];
  if (ret.length === 0) {
    ret = [property];
  }
  style.cssText = "";
  return ret;
}
function parseTimes(cssTime) {
  let matches = cssTime.matchAll(/(?:^|\s)([+-]?(?:\d+|\d*\.\d+))\s*(ms|s)?(?=\s|$)/g);
  let ret = [];
  for (let match of matches) {
    let [, value, unit] = match;
    value = parseFloat(value);
    if (unit === "s") {
      value *= 1e3;
    }
    ret.push(value);
  }
  return ret;
}
function getTimesFor(property, transitions) {
  transitions = splitCommas(transitions);
  let propertyRegex;
  if (property === "all") {
    propertyRegex = /\b\w+\b/g;
  } else {
    let properties2 = [.../* @__PURE__ */ new Set([...getLonghands(property), property, "all"])];
    propertyRegex = RegExp(`(?:^|\\s)(${properties2.join("|")})\\b`);
  }
  let lastRelevantTransition = transitions.findLast((transition) => propertyRegex.test(transition));
  let times = lastRelevantTransition ? parseTimes(lastRelevantTransition) : [0, 0];
  if (times.length === 0) {
    times = [0, 0];
  } else if (times.length === 1) {
    times.push(0);
  }
  let [duration, delay] = times;
  return { duration, delay };
}
function splitCommas(value) {
  let ret = [];
  let lastIndex = 0;
  let stack = [];
  for (let match of value.matchAll(/[,()]/g)) {
    let char = match[0];
    if (char === ",") {
      if (stack.length === 0) {
        let item = value.slice(lastIndex, match.index);
        ret.push(item.trim());
        lastIndex = match.index + 1;
      }
    } else if (char === "(") {
      stack.push("(");
    } else if (char === ")") {
      stack.pop();
    }
  }
  if (lastIndex < value.length) {
    let item = value.slice(lastIndex);
    ret.push(item.trim());
  }
  return ret;
}

// node_modules/style-observer/src/rendered-observer.js
var RenderedObserver = class {
  /**
   * All currently observed targets
   * @type {WeakSet<Element>}
   */
  #targets = /* @__PURE__ */ new Set();
  /**
   * Documents to IntersectionObserver instances
   * @type {WeakMap<Document, IntersectionObserver>}
   */
  #intersectionObservers = /* @__PURE__ */ new WeakMap();
  constructor(callback) {
    this.callback = callback;
  }
  /**
   * Begin observing the presence of an element.
   * @param {Element} element - The element to observe.
   */
  observe(element) {
    if (this.#targets.has(element)) {
      return;
    }
    let doc = element.ownerDocument;
    let io = this.#intersectionObservers.get(doc);
    if (!io) {
      io = new IntersectionObserver(
        (entries) => {
          this.callback(entries.map(({ target }) => ({ target })));
        },
        { root: doc.documentElement }
      );
      this.#intersectionObservers.set(doc, io);
    }
    this.#targets.add(element);
    io.observe(element);
  }
  /**
   * Stop observing the presence of an element.
   * @param {Element} [element] - The element to stop observing. If not provided, all targets will be unobserved.
   */
  unobserve(element) {
    if (!element) {
      for (const target of this.#targets) {
        this.unobserve(target);
      }
      return;
    }
    let doc = element.ownerDocument;
    let io = this.#intersectionObservers.get(doc);
    io?.unobserve(element);
    this.#targets.delete(element);
  }
};

// node_modules/style-observer/src/element-style-observer.js
var allowDiscrete = globalThis.CSS?.supports?.("transition-behavior", "allow-discrete") ? " allow-discrete" : "";
if (globalThis.document) {
  gentleRegisterProperty("--style-observer-transition", { inherits: false });
  Bug.detectAll();
}
var ElementStyleObserver = class {
  /**
   * Observed properties to their old values.
   * @type {Map<string, string>}
   */
  properties;
  /**
   * Get the names of all properties currently being observed.
   * @type { string[] }
   */
  get propertyNames() {
    return [...this.properties.keys()];
  }
  /**
   * The element being observed.
   * @type {Element}
   */
  target;
  /**
   * The callback to call when the element's style changes.
   * @type {StyleObserverCallback}
   */
  callback;
  /**
   * The observer options.
   * @type {StyleObserverOptions}
   */
  options;
  /**
   * Whether the observer has been initialized.
   * @type {boolean}
   */
  #initialized = false;
  /**
   * @param {Element} target
   * @param {StyleObserverCallback} callback
   * @param {StyleObserverOptions} [options]
   */
  constructor(target, callback, options = {}) {
    this.constructor.all.add(target, this);
    this.properties = /* @__PURE__ */ new Map();
    this.target = target;
    this.callback = callback;
    this.options = { properties: [], ...options };
    let properties2 = toArray(options.properties);
    this.renderedObserver = new RenderedObserver((records) => {
      if (this.propertyNames.length > 0) {
        this.handleEvent();
      }
    });
    if (properties2.length > 0) {
      this.observe(properties2);
    }
  }
  /**
   * Called the first time observe() is called to initialize the target.
   */
  #init() {
    if (this.#initialized) {
      return;
    }
    let firstTime = this.constructor.all.get(this.target).size === 1;
    this.updateTransition({ firstTime });
    this.#initialized = true;
  }
  resolveOptions(options) {
    return Object.assign(resolveOptions(options), this.options);
  }
  /**
   * Handle a potential property change
   * @private
   * @param {TransitionEvent} [event]
   */
  async handleEvent(event) {
    if (event && !this.properties.has(event.propertyName)) {
      return;
    }
    if (Bug.TRANSITIONRUN_EVENT_LOOP && event?.type === "transitionrun" || this.options.throttle > 0) {
      let eventName = Bug.TRANSITIONRUN_EVENT_LOOP ? "transitionrun" : "transitionstart";
      let delay = Math.max(this.options.throttle, 50);
      if (Bug.TRANSITIONRUN_EVENT_LOOP) {
        let times = getTimesFor(
          event.propertyName,
          getComputedStyle(this.target).transition
        );
        delay = Math.max(delay, times.duration + times.delay + 16);
      }
      this.target.removeEventListener(eventName, this);
      await wait(delay);
      this.target.addEventListener(eventName, this);
    }
    let cs = getComputedStyle(this.target);
    let records = [];
    for (let property of this.propertyNames) {
      let value = cs.getPropertyValue(property);
      let oldValue = this.properties.get(property);
      if (value !== oldValue) {
        records.push({ target: this.target, property, value, oldValue });
        this.properties.set(property, value);
      }
    }
    if (records.length > 0) {
      this.callback(records);
    }
  }
  /**
   * Observe the target for changes to one or more CSS properties.
   * @param {string | string[]} properties
   * @return {void}
   */
  observe(properties2) {
    properties2 = toArray(properties2);
    properties2 = properties2.filter((property) => !this.properties.has(property));
    if (properties2.length === 0) {
      return;
    }
    this.#init();
    let cs = getComputedStyle(this.target);
    for (let property of properties2) {
      if (Bug.UNREGISTERED_TRANSITION && !this.constructor.properties.has(property)) {
        gentleRegisterProperty(property, void 0, this.target.ownerDocument);
        this.constructor.properties.add(property);
      }
      let value = cs.getPropertyValue(property);
      this.properties.set(property, value);
    }
    if (Bug.TRANSITIONRUN_EVENT_LOOP) {
      this.target.addEventListener("transitionrun", this);
      Bug.all.TRANSITIONRUN_EVENT_LOOP.valuePending?.then((affected) => {
        if (!affected) {
          this.target.removeEventListener("transitionrun", this);
        }
      });
    }
    this.target.addEventListener("transitionstart", this);
    this.target.addEventListener("transitionend", this);
    this.updateTransitionProperties();
    this.renderedObserver.observe(this.target);
  }
  /**
   * Update the `--style-observer-transition` property to include all observed properties.
   */
  updateTransitionProperties() {
    this.setProperty("--style-observer-transition", "");
    let transitionProperties = new Set(
      getComputedStyle(this.target).transitionProperty.split(", ")
    );
    let properties2 = [];
    for (let observer of this.constructor.all.get(this.target)) {
      properties2.push(...observer.propertyNames);
    }
    properties2 = [...new Set(properties2)];
    let transition = properties2.filter((property) => !transitionProperties.has(property)).map((property) => `${property} 1ms step-start${allowDiscrete}`).join(", ");
    this.setProperty("--style-observer-transition", transition);
  }
  /**
   * @type { string | undefined }
   */
  #inlineTransition;
  /**
   * Update the target's transition property or refresh it if it was overwritten.
   * @param {object} options
   * @param {boolean} [options.firstTime] - Whether this is the first time the transition is being set.
   */
  updateTransition({ firstTime } = {}) {
    const sot = "var(--style-observer-transition, --style-observer-noop)";
    const inlineTransition = this.getProperty("transition");
    let transition;
    if (firstTime ? inlineTransition : !inlineTransition.includes(sot)) {
      transition = this.#inlineTransition = inlineTransition;
    }
    if (transition === void 0 && (firstTime || !this.#inlineTransition)) {
      if (inlineTransition.includes(sot)) {
        this.setProperty("transition", "");
      }
      transition = getComputedStyle(this.target).transition;
    }
    if (transition === "all") {
      transition = "";
    } else {
      transition = transition.replace(/^none\b/, "");
    }
    const prefix = transition ? transition + ", " : "";
    this.setProperty("transition", prefix + sot);
    this.updateTransitionProperties();
  }
  /**
   * Whether the target has an open shadow root (and the modern adoptedStyleSheets API is supported).
   * @type { boolean }
   * @private
   */
  get _isHost() {
    return this.target.shadowRoot && !Bug.ADOPTED_STYLE_SHEET && !Object.isFrozen(this.target.shadowRoot.adoptedStyleSheets);
  }
  /**
   * Shadow style sheet. Only used if _isHost is true.
   * @type { CSSStyleSheet | undefined }
   * @private
   */
  _shadowSheet;
  /**
   * Any styles we've set on the target, for any reason.
   * @type { Record<string, string> }
   * @private
   */
  _styles = {};
  /**
   * Set a CSS property on the target.
   * @param {string} property
   * @param {string} value
   * @param {string} [priority]
   * @return {void}
   */
  setProperty(property, value, priority) {
    let inlineStyle = this.target.style;
    let style = inlineStyle;
    if (this._isHost) {
      if (!this._shadowSheet) {
        this._shadowSheet = new CSSStyleSheet();
        this._shadowSheet.insertRule(`:host { }`);
        this.target.shadowRoot.adoptedStyleSheets.push(this._shadowSheet);
        if (Object.keys(this._styles).length > 0) {
          for (let property2 in this._styles) {
            let value2 = this._styles[property2];
            this.setProperty(property2, value2);
            if (inlineStyle.getPropertyValue(property2) === value2) {
              inlineStyle.removeProperty(property2);
            }
          }
        }
      }
      style = this._shadowSheet.cssRules[0].style;
    }
    style.setProperty(property, value, priority);
    this._styles[property] = this.getProperty(property);
  }
  /**
   * Get a CSS property from the target.
   * @param {string} property
   * @return {string}
   */
  getProperty(property) {
    let style = this._shadowSheet?.cssRules[0]?.style ?? this.target.style;
    return style.getPropertyValue(property);
  }
  /**
   * Stop observing a target for changes to one or more CSS properties.
   * @param { string | string[] } [properties] Properties to stop observing. Defaults to all observed properties.
   * @return {void}
   */
  unobserve(properties2) {
    properties2 = toArray(properties2);
    properties2 = properties2.filter((property) => this.properties.has(property));
    for (let property of properties2) {
      this.properties.delete(property);
    }
    if (this.properties.size === 0) {
      this.target.removeEventListener("transitionrun", this);
      this.target.removeEventListener("transitionstart", this);
      this.target.removeEventListener("transitionend", this);
      this.renderedObserver.unobserve(this.target);
    }
    this.updateTransitionProperties();
  }
  /** All properties ever observed by this class. */
  static properties = /* @__PURE__ */ new Set();
  /**
   * All instances ever observed by this class.
   */
  static all = new MultiWeakMap();
};
function resolveOptions(options) {
  if (!options) {
    return {};
  }
  if (typeof options === "string" || Array.isArray(options)) {
    options = { properties: toArray(options) };
  } else if (typeof options === "object") {
    options = { properties: [], ...options };
  }
  return options;
}

// node_modules/style-observer/src/style-observer.js
var StyleObserver = class {
  /**
   * @type { WeakMap<Element, ElementStyleObserver> }
   */
  elementObservers = /* @__PURE__ */ new WeakMap();
  /**
   * @param {StyleObserverCallback} callback
   * @param {StyleObserverOptions | string | string[]} [options]
   */
  constructor(callback, options) {
    this.callback = callback;
    options = resolveOptions(options);
    options.targets ??= [];
    if (options.target) {
      options.targets.push(options.target);
    }
    this.options = options;
    if (this.options.targets.length > 0 && this.options.properties.length > 0) {
      this.observe(this.options.targets, this.options.properties);
    }
  }
  /**
   * @type {StyleObserverCallback}
   */
  changed(records) {
    this.callback(records);
  }
  /**
   * Observe one or more targets for changes to one or more CSS properties.
   *
   * @overload
   * @param {Element | Element[]} targets
   * @param {string | string[]} properties
   * @returns {void}
   *
   * @overload
   * @param {string | string[]} properties
   * @param {Element | Element[]} targets
   * @returns {void}
   *
   * @overload
   * @param {...(string | Element | (string | Element)[]) } propertiesOrTargets
   * @returns {void}
   */
  observe(...args) {
    let { targets, properties: properties2 } = resolveArgs(...args);
    if (targets.length === 0) {
      targets = this.options.targets;
    }
    if (targets.length === 0) {
      return;
    }
    for (let target of targets) {
      let observer = this.elementObservers.get(target);
      if (!observer) {
        observer = new ElementStyleObserver(
          target,
          (records) => this.changed(records),
          this.options
        );
        this.elementObservers.set(target, observer);
      }
      observer.observe(properties2);
    }
  }
  /**
   * Stop observing one or more targets for changes to one or more CSS properties.
   *
   * @overload
   * @param {Element | Element[]} targets
   * @param {string | string[]} properties
   * @returns {void}
   *
   * @overload
   * @param {string | string[]} properties
   * @param {Element | Element[]} targets
   * @returns {void}
   *
   * @overload
   * @param {...(string | Element | (string | Element)[]) } propertiesOrTargets
   * @returns {void}
   */
  unobserve(...args) {
    let { targets, properties: properties2 } = resolveArgs(...args);
    if (targets.length === 0) {
      targets = this.options.targets;
    }
    if (targets.length === 0) {
      return;
    }
    if (properties2.length === 0) {
      properties2 = this.options.properties;
    }
    for (let target of targets) {
      let observer = this.elementObservers.get(target);
      if (observer) {
        observer.unobserve(properties2);
      }
    }
  }
  /**
   * Update the transition for one or more targets.
   * @param {Element | Element[]} targets
   * @returns {void}
   */
  updateTransition(targets) {
    for (let target of toArray(targets)) {
      let observer = this.elementObservers.get(target);
      if (observer) {
        observer.updateTransition();
      }
    }
  }
};
function resolveArgs(targets, properties2) {
  let args = [...toArray(targets), ...toArray(properties2)];
  targets = [];
  properties2 = [];
  for (let arg of args) {
    let arr = typeof arg === "string" || arg instanceof String ? properties2 : targets;
    arr.push(arg);
  }
  return { targets, properties: properties2 };
}

// node_modules/@gravity-ui/graph/build/plugins/cssVariables/types.js
var CSSVariableType;
(function(CSSVariableType2) {
  CSSVariableType2["COLOR"] = "color";
  CSSVariableType2["FLOAT"] = "float";
  CSSVariableType2["INT"] = "int";
  CSSVariableType2["STRING"] = "string";
  CSSVariableType2["BOOLEAN"] = "boolean";
})(CSSVariableType || (CSSVariableType = {}));
var CSS_VALUE_CONVERTERS = {
  [CSSVariableType.COLOR]: (value) => value.trim(),
  [CSSVariableType.FLOAT]: (value) => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  },
  [CSSVariableType.INT]: (value) => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  },
  [CSSVariableType.STRING]: (value) => value.trim(),
  [CSSVariableType.BOOLEAN]: (value) => {
    const trimmed = value.trim().toLowerCase();
    return trimmed === "true" || trimmed === "1" || trimmed === "yes";
  }
};

// node_modules/@gravity-ui/graph/build/plugins/cssVariables/constants.js
var DEFAULT_CSS_VARIABLES_LAYER_PROPS = {
  debug: false,
  html: {
    zIndex: 1,
    classNames: ["css-variables-layer"],
    transformByCameraPosition: false
  }
};
var CSS_VARIABLE_MAPPINGS = [
  // Canvas colors
  {
    cssVariable: "--graph-canvas-background",
    graphPath: "canvas.layerBackground",
    typeConverter: CSSVariableType.COLOR
  },
  {
    cssVariable: "--graph-canvas-below-background",
    graphPath: "canvas.belowLayerBackground",
    typeConverter: CSSVariableType.COLOR
  },
  { cssVariable: "--graph-canvas-dots", graphPath: "canvas.dots", typeConverter: CSSVariableType.COLOR },
  { cssVariable: "--graph-canvas-border", graphPath: "canvas.border", typeConverter: CSSVariableType.COLOR },
  // Block colors
  { cssVariable: "--graph-block-background", graphPath: "block.background", typeConverter: CSSVariableType.COLOR },
  { cssVariable: "--graph-block-border", graphPath: "block.border", typeConverter: CSSVariableType.COLOR },
  { cssVariable: "--graph-block-text", graphPath: "block.text", typeConverter: CSSVariableType.COLOR },
  {
    cssVariable: "--graph-block-selected-border",
    graphPath: "block.selectedBorder",
    typeConverter: CSSVariableType.COLOR
  },
  // Anchor colors
  { cssVariable: "--graph-anchor-background", graphPath: "anchor.background", typeConverter: CSSVariableType.COLOR },
  {
    cssVariable: "--graph-anchor-selected-border",
    graphPath: "anchor.selectedBorder",
    typeConverter: CSSVariableType.COLOR
  },
  // Connection colors
  {
    cssVariable: "--graph-connection-background",
    graphPath: "connection.background",
    typeConverter: CSSVariableType.COLOR
  },
  {
    cssVariable: "--graph-connection-selected-background",
    graphPath: "connection.selectedBackground",
    typeConverter: CSSVariableType.COLOR
  },
  // Connection label colors
  {
    cssVariable: "--graph-connection-label-background",
    graphPath: "connectionLabel.background",
    typeConverter: CSSVariableType.COLOR
  },
  {
    cssVariable: "--graph-connection-label-hover-background",
    graphPath: "connectionLabel.hoverBackground",
    typeConverter: CSSVariableType.COLOR
  },
  {
    cssVariable: "--graph-connection-label-selected-background",
    graphPath: "connectionLabel.selectedBackground",
    typeConverter: CSSVariableType.COLOR
  },
  {
    cssVariable: "--graph-connection-label-text",
    graphPath: "connectionLabel.text",
    typeConverter: CSSVariableType.COLOR
  },
  {
    cssVariable: "--graph-connection-label-hover-text",
    graphPath: "connectionLabel.hoverText",
    typeConverter: CSSVariableType.COLOR
  },
  {
    cssVariable: "--graph-connection-label-selected-text",
    graphPath: "connectionLabel.selectedText",
    typeConverter: CSSVariableType.COLOR
  },
  // Selection colors
  {
    cssVariable: "--graph-selection-background",
    graphPath: "selection.background",
    typeConverter: CSSVariableType.COLOR
  },
  { cssVariable: "--graph-selection-border", graphPath: "selection.border", typeConverter: CSSVariableType.COLOR },
  // Block constants
  { cssVariable: "--graph-block-width", graphPath: "block.WIDTH", typeConverter: CSSVariableType.FLOAT },
  { cssVariable: "--graph-block-height", graphPath: "block.HEIGHT", typeConverter: CSSVariableType.FLOAT },
  { cssVariable: "--graph-block-width-min", graphPath: "block.WIDTH_MIN", typeConverter: CSSVariableType.FLOAT },
  { cssVariable: "--graph-block-head-height", graphPath: "block.HEAD_HEIGHT", typeConverter: CSSVariableType.FLOAT },
  { cssVariable: "--graph-block-body-padding", graphPath: "block.BODY_PADDING", typeConverter: CSSVariableType.FLOAT },
  // System constants
  { cssVariable: "--graph-grid-size", graphPath: "system.GRID_SIZE", typeConverter: CSSVariableType.INT },
  { cssVariable: "--graph-usable-rect-gap", graphPath: "system.USABLE_RECT_GAP", typeConverter: CSSVariableType.FLOAT },
  // Camera constants
  { cssVariable: "--graph-camera-speed", graphPath: "camera.SPEED", typeConverter: CSSVariableType.FLOAT },
  { cssVariable: "--graph-camera-step", graphPath: "camera.STEP", typeConverter: CSSVariableType.FLOAT },
  { cssVariable: "--graph-camera-pan-speed", graphPath: "camera.PAN_SPEED", typeConverter: CSSVariableType.FLOAT },
  // Text constants
  {
    cssVariable: "--graph-text-base-font-size",
    graphPath: "text.BASE_FONT_SIZE",
    typeConverter: CSSVariableType.FLOAT
  },
  { cssVariable: "--graph-text-padding", graphPath: "text.PADDING", typeConverter: CSSVariableType.FLOAT }
];
var SUPPORTED_CSS_VARIABLES = new Set(CSS_VARIABLE_MAPPINGS.map((mapping) => mapping.cssVariable));

// node_modules/@gravity-ui/graph/build/plugins/cssVariables/mapping.js
var import_get = __toESM(require_get());
var import_set = __toESM(require_set());
function mapCSSChangesToGraphColors(changes) {
  const result = {};
  for (const change of changes) {
    if (!SUPPORTED_CSS_VARIABLES.has(change.name)) {
      continue;
    }
    const mapping = CSS_VARIABLE_MAPPINGS.find((m2) => m2.cssVariable === change.name);
    if (!mapping || mapping.typeConverter !== CSSVariableType.COLOR) {
      continue;
    }
    const convertedValue = CSS_VALUE_CONVERTERS[mapping.typeConverter](change.value);
    (0, import_set.default)(result, mapping.graphPath, convertedValue);
  }
  return result;
}
function mapCSSChangesToGraphConstants(changes) {
  const result = {};
  for (const change of changes) {
    if (!SUPPORTED_CSS_VARIABLES.has(change.name)) {
      continue;
    }
    const mapping = CSS_VARIABLE_MAPPINGS.find((m2) => m2.cssVariable === change.name);
    if (!mapping || mapping.typeConverter === CSSVariableType.COLOR) {
      continue;
    }
    const convertedValue = CSS_VALUE_CONVERTERS[mapping.typeConverter](change.value);
    (0, import_set.default)(result, mapping.graphPath, convertedValue);
  }
  return result;
}
function mapGraphColorsToCSSVariables(colors) {
  const result = {};
  for (const mapping of CSS_VARIABLE_MAPPINGS) {
    if (mapping.typeConverter !== CSSVariableType.COLOR) {
      continue;
    }
    const value = (0, import_get.default)(colors, mapping.graphPath);
    if (value !== void 0) {
      result[mapping.cssVariable] = String(value);
    }
  }
  return result;
}
function mapGraphConstantsToCSSVariables(constants) {
  const result = {};
  for (const mapping of CSS_VARIABLE_MAPPINGS) {
    if (mapping.typeConverter === CSSVariableType.COLOR) {
      continue;
    }
    const value = (0, import_get.default)(constants, mapping.graphPath);
    if (value !== void 0) {
      result[mapping.cssVariable] = String(value);
    }
  }
  return result;
}
function filterSupportedCSSChanges(changes) {
  return changes.filter((change) => SUPPORTED_CSS_VARIABLES.has(change.name));
}

// node_modules/@gravity-ui/graph/build/plugins/cssVariables/CSSVariablesLayer.js
var CSSVariablesLayer = class extends Layer {
  constructor(props) {
    const finalProps = { ...DEFAULT_CSS_VARIABLES_LAYER_PROPS, ...props };
    super(finalProps);
    this.state = {
      isObserving: false,
      colors: {},
      constants: {}
    };
    this.containerElement = null;
    this.styleObserver = null;
  }
  propsChanged(nextProps) {
    super.propsChanged(nextProps);
    if (this.props.containerClass !== nextProps.containerClass) {
      if (this.props.debug) {
        console.log("CSSVariablesLayer: Container class changed from", this.props.containerClass, "to", nextProps.containerClass);
      }
      this.stopObserving();
      this.removeContainerElement();
      this.createContainerElement();
      this.startObserving();
    }
  }
  afterInit() {
    this.createContainerElement();
    this.readInitialCSSVariables();
    this.startObserving();
    super.afterInit();
  }
  unmount() {
    this.stopObserving();
    this.removeContainerElement();
    super.unmount();
  }
  /**
   * Creates the container HTML element with specified CSS class
   */
  createContainerElement() {
    if (!this.getHTML()) {
      if (this.props.debug) {
        console.warn("CSSVariablesLayer: HTML element not available");
      }
      return;
    }
    this.containerElement = document.createElement("div");
    this.containerElement.className = this.props.containerClass;
    this.containerElement.style.cssText = `
      position: absolute;
      top: -1px;
      left: -1px;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
    `;
    this.getHTML()?.appendChild(this.containerElement);
    if (this.props.debug) {
      console.log("CSSVariablesLayer: Container element created with class", this.props.containerClass);
      console.log("CSSVariablesLayer: Container element:", this.containerElement);
      console.log("CSSVariablesLayer: Container in DOM:", document.contains(this.containerElement));
    }
  }
  /**
   * Removes the container element from DOM
   */
  removeContainerElement() {
    if (this.containerElement && this.containerElement.parentNode) {
      this.containerElement.parentNode.removeChild(this.containerElement);
    }
    this.containerElement = null;
  }
  createStyleObserver() {
    return new StyleObserver((records) => {
      const changes = records.map((record) => ({
        name: record.property,
        value: record.value,
        oldValue: record.oldValue
      }));
      if (this.props.debug) {
        console.log("CSSVariablesLayer: CSS variable changes detected:", changes);
      }
      this.handleCSSVariableChanges(changes);
    }, {
      targets: [this.containerElement],
      properties: Array.from(SUPPORTED_CSS_VARIABLES)
    });
  }
  /**
   * Reads initial CSS variable values and applies them to the graph
   * This ensures that CSS variables set before the observer starts are applied
   */
  readInitialCSSVariables() {
    if (!this.containerElement) {
      if (this.props.debug) {
        console.warn("CSSVariablesLayer: Cannot read initial CSS variables - container element not available");
      }
      return;
    }
    try {
      const computedStyle = window.getComputedStyle(this.containerElement);
      const changes = [];
      for (const cssVariable of SUPPORTED_CSS_VARIABLES) {
        const value = computedStyle.getPropertyValue(cssVariable).trim();
        if (value) {
          changes.push({
            name: cssVariable,
            value,
            oldValue: ""
          });
        }
      }
      if (this.props.debug) {
        console.log("CSSVariablesLayer: Initial CSS variables read:", changes);
      }
      if (changes.length > 0) {
        this.handleCSSVariableChanges(changes);
      }
    } catch (error) {
      console.error("CSSVariablesLayer: Failed to read initial CSS variables:", error);
    }
  }
  /**
   * Starts observing CSS variable changes using style-observer
   */
  startObserving() {
    if (!this.containerElement) {
      if (this.props.debug) {
        console.warn("CSSVariablesLayer: Cannot start observing - container element not available");
      }
      return;
    }
    if (this.state.isObserving) {
      return;
    }
    try {
      const variablesToObserve = Array.from(SUPPORTED_CSS_VARIABLES);
      this.styleObserver = this.createStyleObserver();
      this.setState({ isObserving: true });
      if (this.props.debug) {
        console.log("CSSVariablesLayer: Started observing", variablesToObserve.length, "CSS variables");
        console.log("CSSVariablesLayer: Observing element:", this.containerElement);
        console.log("CSSVariablesLayer: Variables to observe:", variablesToObserve);
      }
    } catch (error) {
      console.error("CSSVariablesLayer: Failed to start observing CSS variables:", error);
    }
  }
  /**
   * Stops observing CSS variable changes
   */
  stopObserving() {
    if (this.styleObserver) {
      this.styleObserver.unobserve(this.containerElement);
      this.styleObserver = null;
    }
    this.setState({ isObserving: false });
    if (this.props.debug) {
      console.log("CSSVariablesLayer: Stopped observing CSS variables");
    }
  }
  /**
   * Handles CSS variable changes from style-observer
   */
  handleCSSVariableChanges(changes) {
    const supportedChanges = filterSupportedCSSChanges(changes);
    if (supportedChanges.length === 0) {
      return;
    }
    if (this.props.debug) {
      console.log("CSSVariablesLayer: CSS variable changes detected:", supportedChanges);
    }
    this.applyChangesToGraph(supportedChanges);
    if (this.props.onChange) {
      this.props.onChange(supportedChanges);
    }
  }
  /**
   * Applies CSS variable changes to graph colors and constants
   */
  applyChangesToGraph(changes) {
    try {
      const colorChanges = mapCSSChangesToGraphColors(changes);
      const constantChanges = mapCSSChangesToGraphConstants(changes);
      if (Object.keys(colorChanges).length === 0 && Object.keys(constantChanges).length === 0) {
        return;
      }
      const colors = (0, import_merge2.default)({}, this.state.colors, colorChanges);
      const constants = (0, import_merge2.default)({}, this.state.constants, constantChanges);
      this.setState({ colors, constants });
      this.props.graph.setColors(colors);
      if (this.props.debug) {
        console.log("CSSVariablesLayer: Applied color changes:", colorChanges);
      }
      this.props.graph.setConstants(constants);
      if (this.props.debug) {
        console.log("CSSVariablesLayer: Applied constant changes:", constantChanges);
      }
    } catch (error) {
      console.error("CSSVariablesLayer: Failed to apply changes to graph:", error);
    }
  }
};

// node_modules/@gravity-ui/graph/build/plugins/layered/hooks/useLayeredLayout.js
var import_react = __toESM(require_react());

// node_modules/@gravity-ui/graph/build/plugins/layered/layout.js
function getGraph(nodes, edges) {
  const graph = {};
  const layering = [];
  const nodeIdToId = /* @__PURE__ */ new Map();
  let id;
  let count = 0;
  for (const node of nodes) {
    id = `innerNodeId_${count++}`;
    let layer = layering[node.level];
    if (!layer) {
      layering[node.level] = layer = /* @__PURE__ */ new Set();
    }
    layer.add(id);
    nodeIdToId.set(node.id, id);
    graph[id] = { node: { ...node }, in: [], out: [] };
  }
  for (const edge of edges) {
    const from = nodeIdToId.get(edge.from);
    const to = nodeIdToId.get(edge.to);
    if (from !== void 0 && to !== void 0) {
      graph[from].out.push(to);
      graph[to].in.push(from);
    }
  }
  return {
    graph,
    layering: layering.filter(Boolean),
    levels: layering.map((layer, index) => layer ? index : -1).filter((i2) => i2 !== -1)
  };
}
function prepareGraph(graph, layering, levels) {
  let count = 0;
  for (let i2 = 0; i2 < layering.length; i2++) {
    const layer = layering[i2];
    const nextLayer = layering[i2 + 1];
    for (const nodeId of layer) {
      const nodeGraph = graph[nodeId];
      nodeGraph.rank = i2;
      if (i2 === layering.length - 1) {
        continue;
      }
      for (let index = 0; index < nodeGraph.out.length; index++) {
        const outputNode = nodeGraph.out[index];
        if (!nextLayer.has(outputNode)) {
          const newId = `${outputNode}_${count++}`;
          const newNode = { id: newId, shape: "dot", size: 0, level: levels[i2] };
          graph[newId] = {
            node: newNode,
            in: [nodeId],
            out: [],
            virtual: true
          };
          nextLayer.add(newId);
          nodeGraph.out[index] = newId;
          graph[newId].out.push(outputNode);
          graph[outputNode].in[graph[outputNode].in.indexOf(nodeId)] = newId;
        }
      }
    }
  }
}
function initOrder(graph, layering) {
  const queue = [...layering[0]];
  const order = [];
  const visited = new Set(queue);
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (nodeId === void 0) {
      break;
    }
    const graphNode = graph[nodeId];
    let layer = order[graphNode.rank];
    if (!layer) {
      order[graphNode.rank] = layer = [];
    }
    layer.push(nodeId);
    for (const outNodeId of graphNode.out) {
      if (visited.has(outNodeId)) {
        continue;
      }
      visited.add(outNodeId);
      queue.push(outNodeId);
    }
  }
  return order;
}
function twoLayerCrossCount(graph, northLayer, southLayer) {
  const southPos = southLayer.reduce((obj, nodeId, i2) => {
    obj[nodeId] = i2;
    return obj;
  }, {});
  const southEntries = [];
  for (const v2 of northLayer) {
    southEntries.push(...graph[v2].out.map((e2) => southPos[e2]).sort((a2, b2) => a2 - b2));
  }
  let firstIndex = 1;
  while (firstIndex < southLayer.length) {
    firstIndex *= 2;
  }
  const treeSize = 2 * firstIndex - 1;
  firstIndex -= 1;
  const tree = new Array(treeSize).fill(0);
  let cc = 0;
  southEntries.forEach((pos) => {
    let index = pos + firstIndex;
    tree[index]++;
    while (index > 0) {
      if (index % 2) {
        cc += tree[index + 1];
      }
      index = Math.floor((index - 1) / 2);
      tree[index]++;
    }
  });
  return cc;
}
function countCrossing(graph, order) {
  let cc = 0;
  for (let i2 = 1; i2 < order.length; ++i2) {
    cc += twoLayerCrossCount(graph, order[i2 - 1], order[i2]);
  }
  return cc;
}
function medianValue(nodes, order) {
  const positions = order.reduce((pos, nodeId, i2) => {
    if (nodes.includes(nodeId)) {
      pos.push(i2);
    }
    return pos;
  }, []);
  if (positions.length === 0) {
    return -1;
  }
  const m2 = Math.floor(positions.length / 2);
  if (positions.length % 2 === 1) {
    return positions[m2];
  }
  if (positions.length === 2) {
    return (positions[0] + positions[1]) / 2;
  }
  const left = positions[m2 - 1] - positions[0];
  const right = positions[positions.length - 1] - positions[m2];
  return (positions[m2 - 1] * right + positions[m2] * left) / (left + right);
}
function sortWithFixedNodes(order, median) {
  const sorted = order.filter((a2) => median[a2] !== -1).sort((a2, b2) => median[a2] - median[b2]);
  for (let i2 = 0, sortIndex = 0; sortIndex < sorted.length; i2++) {
    if (median[order[i2]] !== -1) {
      order[i2] = sorted[sortIndex++];
    }
  }
}
function applyWeightedMedianHeuristic(graph, order, iter) {
  if (iter % 2 === 0) {
    for (let i2 = 1; i2 < order.length; i2++) {
      const median = {};
      for (const nodeId of order[i2]) {
        median[nodeId] = medianValue(graph[nodeId].in, order[i2 - 1]);
      }
      sortWithFixedNodes(order[i2], median);
    }
  } else {
    for (let i2 = order.length - 2; i2 >= 0; i2--) {
      const median = {};
      for (const nodeId of order[i2]) {
        median[nodeId] = medianValue(graph[nodeId].out, order[i2 + 1]);
      }
      sortWithFixedNodes(order[i2], median);
    }
  }
}
function swap(rank, i2, j2) {
  const tmp = rank[i2];
  rank[i2] = rank[j2];
  rank[j2] = tmp;
}
function partialCountCrossing(graph, order, layerIndex) {
  let cc = 0;
  if (layerIndex > 0) {
    cc += twoLayerCrossCount(graph, order[layerIndex - 1], order[layerIndex]);
  }
  if (layerIndex < order.length - 1) {
    cc += twoLayerCrossCount(graph, order[layerIndex], order[layerIndex + 1]);
  }
  return cc;
}
function transpose(graph, order) {
  let improved = true;
  let count = 0;
  const maxIteration = 10;
  while (improved && count++ < maxIteration) {
    improved = false;
    for (let layerIndex = 0; layerIndex < order.length; layerIndex++) {
      const layer = order[layerIndex];
      let bestCC = partialCountCrossing(graph, order, layerIndex);
      for (let i2 = 0; i2 < layer.length - 1; i2++) {
        swap(layer, i2, i2 + 1);
        const cc = partialCountCrossing(graph, order, layerIndex);
        if (bestCC > cc) {
          improved = true;
          bestCC = cc;
        } else {
          swap(layer, i2, i2 + 1);
        }
      }
    }
  }
}
function ordering(graph, layering, skipTranspose) {
  const maxSweeps = 24;
  const order = initOrder(graph, layering);
  let bestOrder = order.map((el) => [...el]);
  let bestCC = countCrossing(graph, order);
  for (let i2 = 0, lastBest = 0; lastBest < 4 && i2 < maxSweeps; i2++, lastBest++) {
    applyWeightedMedianHeuristic(graph, order, i2);
    if (!skipTranspose) {
      transpose(graph, order);
    }
    const cc = countCrossing(graph, order);
    if (bestCC > cc) {
      bestCC = cc;
      bestOrder = order.map((el) => [...el]);
      lastBest = 0;
    }
  }
  bestOrder.forEach((layer) => {
    layer.forEach((v2, i2) => {
      graph[v2].order = i2;
    });
  });
  return bestOrder;
}
function findOtherInnerSegmentNode(graph, v2) {
  if (graph[v2].virtual) {
    return graph[v2].in.find((u2) => graph[u2].virtual);
  }
  return void 0;
}
function addConflict(conflicts, v2, w2) {
  let conflictsV = conflicts[v2];
  if (!conflictsV) {
    conflicts[v2] = conflictsV = /* @__PURE__ */ new Set();
  }
  conflictsV.add(w2);
}
function hasConflict(conflicts, v2, w2) {
  return conflicts[v2] && conflicts[v2].has(w2) || conflicts[w2] && conflicts[w2].has(v2);
}
function findType1Conflicts(graph, layering) {
  const conflicts = {};
  function visitLayer(prevLayer, layer) {
    let k0 = 0;
    let scanPos = 0;
    const prevLayerLength = prevLayer.length;
    const lastNode = layer[layer.length - 1];
    layer.forEach((v2, i2) => {
      const w2 = findOtherInnerSegmentNode(graph, v2);
      const k1 = w2 ? graph[w2].order : prevLayerLength;
      if (w2 || v2 === lastNode) {
        layer.slice(scanPos, i2 + 1).forEach((scanNode) => {
          graph[scanNode].in.forEach((u2) => {
            const uNode = graph[u2];
            const uPos = uNode.order;
            if ((uPos < k0 || k1 < uPos) && !(uNode.virtual && graph[scanNode].virtual)) {
              addConflict(conflicts, u2, scanNode);
            }
          });
        });
        scanPos = i2 + 1;
        k0 = k1;
      }
    });
    return layer;
  }
  layering.reduce(visitLayer);
  return conflicts;
}
function findType2Conflicts(graph, layering) {
  const conflicts = {};
  function scan(south, southPos, southEnd, prevNorthBorder, nextNorthBorder) {
    for (let i2 = southPos; i2 < southEnd; i2++) {
      const v2 = south[i2];
      if (graph[v2].virtual) {
        graph[v2].in.forEach((u2) => {
          const uNode = graph[u2];
          if (uNode.virtual && (uNode.order < prevNorthBorder || uNode.order > nextNorthBorder)) {
            addConflict(conflicts, u2, v2);
          }
        });
      }
    }
  }
  function visitLayer(north, south) {
    let prevNorthPos = -1;
    let nextNorthPos = 0;
    let southPos = 0;
    south.forEach((v2, southLookahead) => {
      if (graph[v2].virtual) {
        const predecessors = graph[v2].in;
        if (predecessors.length) {
          nextNorthPos = graph[predecessors[0]].order;
          scan(south, southPos, southLookahead, prevNorthPos, nextNorthPos);
          southPos = southLookahead;
          prevNorthPos = nextNorthPos;
        }
      }
      scan(south, southPos, south.length, prevNorthPos, north.length);
    });
    return south;
  }
  layering.reduce(visitLayer);
  return conflicts;
}
function verticalAlignment(graph, layering, conflicts, neighbor) {
  const root = {};
  const align = {};
  const pos = {};
  layering.forEach((layer) => {
    layer.forEach((v2, order) => {
      root[v2] = v2;
      align[v2] = v2;
      pos[v2] = order;
    });
  });
  layering.forEach((layer) => {
    let prevIdx = -1;
    layer.forEach((v2) => {
      const ws = graph[v2][neighbor];
      if (ws.length) {
        ws.sort((a2, b2) => pos[a2] - pos[b2]);
        const mp = (ws.length - 1) / 2;
        for (let i2 = Math.floor(mp), il = Math.ceil(mp); i2 <= il; i2++) {
          const w2 = ws[i2];
          if (align[v2] === v2 && prevIdx < pos[w2] && !hasConflict(conflicts, v2, w2)) {
            align[w2] = v2;
            align[v2] = root[v2] = root[w2];
            prevIdx = pos[w2];
          }
        }
      }
    });
  });
  return { root, align };
}
var DEFAULT_NODE_WIDTH = 100;
var DEFAULT_NODE_HEIGHT = 100;
function resolveLayoutOptions(options) {
  const defaultNodeWidth = options?.defaultNodeWidth ?? DEFAULT_NODE_WIDTH;
  const defaultNodeHeight = options?.defaultNodeHeight ?? DEFAULT_NODE_HEIGHT;
  return {
    defaultNodeWidth,
    defaultNodeHeight,
    nodeHorizontalGap: options?.nodeHorizontalGap ?? defaultNodeWidth * 2,
    nodeVerticalGap: options?.nodeVerticalGap ?? 200,
    layerSpacingFactor: options?.layerSpacingFactor ?? 1.7,
    enormousGraphNodeThreshold: options?.enormousGraphNodeThreshold ?? 700,
    enormousGraphEdgeThreshold: options?.enormousGraphEdgeThreshold ?? 3e3
  };
}
function nodeWidth(graph, v2, opts) {
  if (graph && v2 && graph[v2]) {
    const width = graph[v2].node.width ?? opts.defaultNodeWidth;
    return width + opts.nodeHorizontalGap;
  }
  return opts.defaultNodeWidth + opts.nodeHorizontalGap;
}
function nodeHeight(graph, v2, opts) {
  if (graph && v2 && graph[v2]) {
    const height = graph[v2].node.height ?? opts.defaultNodeHeight;
    return height + opts.nodeVerticalGap;
  }
  return opts.defaultNodeHeight + opts.nodeVerticalGap;
}
function horizontalCompaction(graph, layering, root, align, reverse, opts) {
  const xs = {};
  const sink = Object.keys(graph).reduce((obj, key) => {
    obj[key] = key;
    return obj;
  }, {});
  const shift = Object.keys(graph).reduce((obj, key) => {
    obj[key] = Number.POSITIVE_INFINITY;
    return obj;
  }, {});
  function placeBlock(v2) {
    if (xs[v2] === void 0) {
      xs[v2] = 0;
      let w2 = v2;
      do {
        const rank = reverse ? layering.length - graph[w2].rank - 1 : graph[w2].rank;
        const pos = layering[rank].indexOf(w2);
        if (pos > 0) {
          const u2 = root[layering[rank][pos - 1]];
          placeBlock(u2);
          if (sink[v2] === v2) {
            sink[v2] = sink[u2];
          }
          if (sink[v2] === sink[u2]) {
            xs[v2] = Math.max(xs[v2], xs[u2] + nodeHeight(graph, v2, opts));
          } else {
            shift[sink[u2]] = Math.min(shift[sink[u2]], xs[v2] - xs[u2] - nodeHeight(graph, v2, opts));
          }
        }
        w2 = align[w2];
      } while (w2 !== v2);
    }
  }
  Object.keys(graph).forEach((v2) => {
    if (root[v2] === v2) {
      placeBlock(v2);
    }
  });
  Object.keys(graph).forEach((v2) => {
    xs[v2] = xs[root[v2]];
    if (shift[sink[root[v2]]] < Number.POSITIVE_INFINITY) {
      xs[v2] = xs[v2] + shift[sink[root[v2]]];
    }
  });
  return xs;
}
function findSmallestHeightAlignment(graph, xss, opts) {
  return Object.values(xss).reduce((res, xs) => {
    let max = Number.NEGATIVE_INFINITY;
    let min = Number.POSITIVE_INFINITY;
    Object.entries(xs).forEach(([v2, x2]) => {
      const halfHeight = nodeHeight(graph, v2, opts) / 2;
      max = Math.max(x2 + halfHeight, max);
      min = Math.min(x2 - halfHeight, min);
    });
    const height = max - min;
    if (res.min > height) {
      return {
        min: height,
        align: xs
      };
    }
    return res;
  }, { min: Number.POSITIVE_INFINITY }).align;
}
function alignCoordinates(xss, alignTo) {
  const alignToVals = Object.values(alignTo);
  const alignToMin = alignToVals.reduce((a2, b2) => Math.min(a2, b2));
  const alignToMax = alignToVals.reduce((a2, b2) => Math.max(a2, b2));
  ["u", "d"].forEach((vert) => {
    ["l", "r"].forEach((horiz) => {
      const alignment = vert + horiz;
      const xs = xss[alignment];
      if (xs === alignTo) {
        return;
      }
      const xsVals = Object.values(xs);
      const delta = horiz === "l" ? alignToMin - xsVals.reduce((a2, b2) => Math.min(a2, b2)) : alignToMax - xsVals.reduce((a2, b2) => Math.max(a2, b2));
      if (delta) {
        Object.keys(xs).forEach((key) => {
          xs[key] += delta;
        });
      }
    });
  });
}
function balance(xss, align) {
  return Object.keys(xss.ul).reduce((obj, v2) => {
    if (align) {
      obj[v2] = xss[align.toLowerCase()][v2];
    } else {
      const vXs = Object.values(xss).map((xs) => xs[v2]).sort((a2, b2) => a2 - b2);
      obj[v2] = (vXs[1] + vXs[2]) / 2;
    }
    return obj;
  }, {});
}
function mergeConflicts(a2, b2) {
  const conflicts = {};
  Object.entries(a2).forEach(([v2, ws]) => {
    ws.forEach((w2) => {
      addConflict(conflicts, v2, w2);
    });
  });
  Object.entries(b2).forEach(([v2, ws]) => {
    ws.forEach((w2) => {
      addConflict(conflicts, v2, w2);
    });
  });
  return conflicts;
}
function positionY(graph, layering, opts) {
  const conflicts = mergeConflicts(findType1Conflicts(graph, layering), findType2Conflicts(graph, layering));
  const xss = {};
  let adjustedLayering;
  ["u", "d"].forEach((vert) => {
    adjustedLayering = vert === "u" ? layering : [...layering].reverse();
    ["l", "r"].forEach((horiz) => {
      if (horiz === "r") {
        adjustedLayering = adjustedLayering.map((inner) => {
          return [...inner].reverse();
        });
      }
      const neighborFn = vert === "u" ? "in" : "out";
      const { root, align } = verticalAlignment(graph, adjustedLayering, conflicts, neighborFn);
      const xs = horizontalCompaction(graph, adjustedLayering, root, align, vert === "d", opts);
      if (horiz === "r") {
        Object.keys(xs).forEach((v2) => {
          xs[v2] = -xs[v2];
        });
      }
      xss[vert + horiz] = xs;
    });
  });
  const smallestHeight = findSmallestHeightAlignment(graph, xss, opts);
  alignCoordinates(xss, smallestHeight);
  return balance(xss);
}
function position(graph, order, opts) {
  const ys = positionY(graph, order, opts);
  Object.keys(ys).forEach((v2) => {
    graph[v2].node.y = ys[v2];
  });
  const valueY = Object.values(ys);
  const step = Math.max(nodeWidth(void 0, void 0, opts), (valueY.reduce((a2, b2) => Math.max(a2, b2)) - valueY.reduce((a2, b2) => Math.min(a2, b2))) / order.length) * opts.layerSpacingFactor;
  let x2 = 0;
  order.forEach((layer) => {
    layer.forEach((nodeId) => {
      const node = graph[nodeId].node;
      node.x = x2;
    });
    x2 += step;
  });
}
function prepareResult(graph) {
  const nodes = [];
  const edges = [];
  Object.values(graph).forEach((graphNode) => {
    const node = graphNode.node;
    if (graphNode.virtual) {
      if (!graph[graphNode.in[0]].virtual) {
        let to = graphNode.out[0];
        if (graph[to].virtual) {
          while (graph[graph[to].out[0]].virtual) {
            to = graph[to].out[0];
          }
        }
        const startNode = graph[graphNode.in[0]].node;
        const toNode = graph[to].node;
        if (graph[to].virtual) {
          const finalNode = graph[graph[to].out[0]].node;
          if (startNode.y === node.y) {
            if (toNode.y === finalNode.y) {
              edges.push({ from: startNode.id, to: finalNode.id });
            } else {
              nodes.push(toNode);
              edges.push({ from: startNode.id, to: toNode.id, arrows: { to: false } });
              edges.push({ from: toNode.id, to: finalNode.id, arrows: { from: false } });
            }
          } else if (toNode.y === finalNode.y) {
            nodes.push(node);
            edges.push({ from: startNode.id, to: node.id, arrows: { to: false } });
            edges.push({ from: node.id, to: finalNode.id, arrows: { from: false } });
          } else {
            nodes.push(node);
            nodes.push(toNode);
            edges.push({ from: startNode.id, to: node.id, arrows: { to: false } });
            edges.push({
              from: node.id,
              to: toNode.id,
              arrows: { from: false, to: false }
            });
            edges.push({ from: toNode.id, to: finalNode.id, arrows: { from: false } });
          }
        } else if (startNode.y === node.y && node.y === toNode.y) {
          edges.push({ from: startNode.id, to: toNode.id });
        } else {
          nodes.push(node);
          edges.push({ from: startNode.id, to: node.id, arrows: { to: false } });
          edges.push({ from: node.id, to: toNode.id, arrows: { from: false } });
        }
      }
    } else {
      nodes.push(node);
      graphNode.out.forEach((to) => {
        if (!graph[to].virtual) {
          edges.push({ from: node.id, to: graph[to].node.id });
        }
      });
    }
  });
  return { nodes, edges };
}
async function layoutGraph({ nodes, edges, options }) {
  const opts = resolveLayoutOptions(options);
  const enormousGraph = nodes.length > opts.enormousGraphNodeThreshold || edges.length > opts.enormousGraphEdgeThreshold;
  const { graph, layering, levels } = getGraph(nodes, edges);
  prepareGraph(graph, layering, levels);
  const order = ordering(graph, layering, enormousGraph);
  position(graph, order, opts);
  return prepareResult(graph);
}

// node_modules/@gravity-ui/graph/build/plugins/layered/converters/layeredConverter.js
function buildAdjacency(edges) {
  const adjacency = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    const from = String(edge.from);
    const to = String(edge.to);
    const neighbors = adjacency.get(from);
    if (neighbors) {
      neighbors.push({ to, arrows: edge.arrows });
    } else {
      adjacency.set(from, [{ to, arrows: edge.arrows }]);
    }
  }
  return adjacency;
}
function getVirtualNodeCenter(nodePositions, virtualNodeSize) {
  return (id) => {
    const pos = nodePositions.get(id);
    if (!pos)
      return void 0;
    const size = virtualNodeSize ?? DEFAULT_NODE_WIDTH;
    return {
      x: pos.x + size / 2,
      y: pos.y + size / 2
    };
  };
}
function getBlockRightEdge(id, nodePositions, blockSizes) {
  const pos = nodePositions.get(id);
  if (!pos)
    return void 0;
  const size = blockSizes.get(id);
  if (size) {
    return {
      x: pos.x + size.width,
      y: pos.y + size.height / 2
    };
  }
  return pos;
}
function getBlockLeftEdge(id, nodePositions, blockSizes) {
  const pos = nodePositions.get(id);
  if (!pos)
    return void 0;
  const size = blockSizes.get(id);
  if (size) {
    return {
      x: pos.x,
      y: pos.y + size.height / 2
    };
  }
  return pos;
}
function layeredConverter({ layoutResult, connectionIdBySourceTarget, blockSizes, virtualNodeSize }) {
  const { nodes, edges } = layoutResult;
  const nodePositions = /* @__PURE__ */ new Map();
  const dotNodeIds = /* @__PURE__ */ new Set();
  for (const node of nodes) {
    const id = String(node.id);
    nodePositions.set(id, { x: node.x ?? 0, y: node.y ?? 0 });
    if (node.shape === "dot") {
      dotNodeIds.add(id);
    }
  }
  const blocks = {};
  for (const node of nodes) {
    if (node.shape === "dot")
      continue;
    const id = node.id;
    const pos = nodePositions.get(String(id));
    if (pos) {
      blocks[id] = pos;
    }
  }
  const edgesResult = {};
  const adjacency = buildAdjacency(edges);
  const visitedEdges = /* @__PURE__ */ new Set();
  const getVirtualCenter = getVirtualNodeCenter(nodePositions, virtualNodeSize);
  for (const edge of edges) {
    const from = String(edge.from);
    const to = String(edge.to);
    const edgeKey = `${from}->${to}`;
    if (visitedEdges.has(edgeKey))
      continue;
    if (dotNodeIds.has(from))
      continue;
    const chain = [from];
    let current = to;
    visitedEdges.add(edgeKey);
    while (dotNodeIds.has(current)) {
      chain.push(current);
      const nextEdges = adjacency.get(current);
      if (!nextEdges || nextEdges.length === 0)
        break;
      const nextEdge = nextEdges[0];
      const nextEdgeKey = `${current}->${nextEdge.to}`;
      visitedEdges.add(nextEdgeKey);
      current = nextEdge.to;
    }
    chain.push(current);
    const sourceId = chain[0];
    const targetId = chain[chain.length - 1];
    const key = `${sourceId}/${targetId}`;
    const idQueue = connectionIdBySourceTarget.get(key);
    const connectionId = (idQueue?.length ? idQueue.shift() : null) ?? key;
    const points = [];
    const sourceEdge = getBlockRightEdge(sourceId, nodePositions, blockSizes);
    if (sourceEdge)
      points.push(sourceEdge);
    if (chain.length > 2) {
      for (let i2 = 1; i2 < chain.length - 1; i2++) {
        const center = getVirtualCenter(chain[i2]);
        if (center)
          points.push(center);
      }
    }
    const targetEdge = getBlockLeftEdge(targetId, nodePositions, blockSizes);
    if (targetEdge)
      points.push(targetEdge);
    if (points.length >= 2) {
      edgesResult[connectionId] = {
        points
      };
    }
  }
  return { blocks, edges: edgesResult };
}

// node_modules/@gravity-ui/graph/build/plugins/layered/utils/computeLevels.js
function computeLevels(blockIds, connections) {
  const idToStr = (id) => String(id);
  const inDegree = /* @__PURE__ */ new Map();
  const outEdges = /* @__PURE__ */ new Map();
  for (const id of blockIds) {
    const s2 = idToStr(id);
    inDegree.set(s2, 0);
    outEdges.set(s2, []);
  }
  for (const c2 of connections) {
    const from = idToStr(c2.sourceBlockId);
    const to = idToStr(c2.targetBlockId);
    if (!inDegree.has(to))
      inDegree.set(to, 0);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    const out = outEdges.get(from);
    if (out)
      out.push(to);
  }
  const level = /* @__PURE__ */ new Map();
  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id);
      level.set(id, 0);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const u2 = queue[head++];
    const l2 = level.get(u2) ?? 0;
    for (const v2 of outEdges.get(u2) ?? []) {
      const cur = level.get(v2);
      const next = l2 + 1;
      if (cur === void 0 || next > cur) {
        level.set(v2, next);
      }
      const deg = (inDegree.get(v2) ?? 1) - 1;
      inDegree.set(v2, deg);
      if (deg === 0) {
        queue.push(v2);
      }
    }
  }
  for (const id of blockIds) {
    const s2 = idToStr(id);
    if (!level.has(s2)) {
      level.set(s2, 0);
    }
  }
  const result = /* @__PURE__ */ new Map();
  for (const id of blockIds) {
    result.set(id, level.get(idToStr(id)) ?? 0);
  }
  return result;
}

// node_modules/@gravity-ui/graph/build/plugins/layered/hooks/useLayeredLayout.js
function useLayeredLayout(params) {
  const { blocks, connections, layoutOptions, onError } = params;
  const [result, setResult] = (0, import_react.useState)(null);
  const [isLoading, setIsLoading] = (0, import_react.useState)(true);
  const layoutNodes = (0, import_react.useMemo)(() => {
    const levels = computeLevels(blocks.map((b2) => b2.id), connections.map((c2) => ({ sourceBlockId: c2.sourceBlockId, targetBlockId: c2.targetBlockId })));
    return blocks.map((b2) => ({
      id: String(b2.id),
      level: b2.level ?? levels.get(b2.id) ?? 0,
      width: b2.width,
      height: b2.height
    }));
  }, [blocks, connections]);
  const layoutEdges = (0, import_react.useMemo)(() => connections.map((c2) => ({
    from: String(c2.sourceBlockId),
    to: String(c2.targetBlockId)
  })), [connections]);
  const connectionIdBySourceTarget = (0, import_react.useMemo)(() => {
    const map = /* @__PURE__ */ new Map();
    for (const c2 of connections) {
      const key = `${String(c2.sourceBlockId)}/${String(c2.targetBlockId)}`;
      const list = map.get(key) ?? [];
      list.push(c2.id ?? key);
      map.set(key, list);
    }
    return map;
  }, [connections]);
  const blockSizes = (0, import_react.useMemo)(() => {
    const map = /* @__PURE__ */ new Map();
    for (const b2 of blocks) {
      map.set(String(b2.id), { width: b2.width, height: b2.height });
    }
    return map;
  }, [blocks]);
  const runLayout = (0, import_react.useCallback)(() => {
    return layoutGraph({
      nodes: layoutNodes,
      edges: layoutEdges,
      options: layoutOptions
    });
  }, [layoutNodes, layoutEdges, layoutOptions]);
  (0, import_react.useEffect)(() => {
    let isCancelled = false;
    setIsLoading(true);
    runLayout().then((layoutResult) => {
      if (isCancelled)
        return;
      const converted = layeredConverter({
        layoutResult: {
          nodes: layoutResult.nodes.map((n2) => ({
            id: String(n2.id),
            x: n2.x,
            y: n2.y,
            shape: n2.shape
          })),
          edges: layoutResult.edges.map((e2) => ({ from: String(e2.from), to: String(e2.to), arrows: e2.arrows }))
        },
        connectionIdBySourceTarget: new Map(Array.from(connectionIdBySourceTarget.entries()).map(([k, v2]) => [k, [...v2]])),
        blockSizes
      });
      setResult(converted);
      setIsLoading(false);
    }).catch((error) => {
      if (!isCancelled) {
        onError?.(error);
        setIsLoading(false);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [runLayout, connectionIdBySourceTarget, blockSizes, onError]);
  return { result, isLoading };
}

// node_modules/@gravity-ui/graph/build/utils/shapes/polyline.js
function polyline(points) {
  const path = new Path2D();
  if (!points.length) {
    return path;
  }
  path.moveTo(points[0].x, points[0].y);
  for (let i2 = 1; i2 < points.length; i2++) {
    path.lineTo(points[i2].x, points[i2].y);
  }
  return path;
}

// node_modules/@gravity-ui/graph/build/components/canvas/layers/portConnectionLayer/PortConnectionLayer.js
var import_rbush2 = __toESM(require_rbush_min());

// node_modules/@gravity-ui/graph/build/utils/renderers/svgPath.js
function renderSVG(icon, ctx, rect) {
  render(ctx, (isolatedCtx) => {
    const iconPath = new Path2D(icon.path);
    const coefX = icon.width / icon.iniatialWidth;
    const coefY = icon.height / icon.initialHeight;
    isolatedCtx.translate(rect.x + rect.width / 2 - icon.width / 2, rect.y + rect.height / 2 - icon.height / 2);
    isolatedCtx.scale(coefX, coefY);
    isolatedCtx.fill(iconPath, "evenodd");
  });
}

// node_modules/@gravity-ui/graph/build/components/canvas/layers/portConnectionLayer/PortConnectionLayer.js
var PORT_SEARCH_RADIUS = 20;
var PortConnectionLayer = class _PortConnectionLayer extends Layer {
  constructor(props) {
    super({
      canvas: {
        zIndex: 4,
        classNames: ["no-pointer-events"],
        transformByCameraPosition: true,
        ...props.canvas
      },
      ...props
    });
    this.startState = null;
    this.endState = null;
    this.snappingPortsTree = null;
    this.isSnappingTreeOutdated = true;
    this.enable = () => {
      this.enabled = true;
    };
    this.disable = () => {
      this.enabled = false;
    };
    this.currentListener = null;
    this.handleMouseDown = (nativeEvent) => {
      if (!this.enabled) {
        return;
      }
      const initEvent = extractNativeGraphMouseEvent(nativeEvent);
      const initialComponent = nativeEvent.detail.target;
      if (!initEvent || !this.root?.ownerDocument || !initialComponent) {
        return;
      }
      if (initEvent.button !== 0) {
        return;
      }
      if (!(initialComponent instanceof GraphComponent) || initialComponent.getPorts().length === 0) {
        return;
      }
      const canvas = this.context.graph.getGraphCanvas();
      const [screenX, screenY] = getXY(canvas, initEvent);
      const [worldX, worldY] = this.context.graph.cameraService.applyToPoint(screenX, screenY);
      const searchRadius = this.props.searchRadius || PORT_SEARCH_RADIUS;
      const port = this.context.graph.rootStore.connectionsList.ports.findPortAtPointByComponent(initialComponent, new Point(worldX, worldY), searchRadius, (candidate) => this.isSnappablePort(candidate));
      if (!port) {
        return;
      }
      if (isGraphEvent(nativeEvent)) {
        nativeEvent.preventGraphEventDefault();
        nativeEvent.stopGraphEventPropagation();
      }
      this.currentListener = this.context.graph.dragService.startDrag({
        onStart: (_event, coords) => {
          this.onStartConnection(port, new Point(coords[0], coords[1]));
        },
        onUpdate: (event, coords) => this.onMoveNewConnection(event, new Point(coords[0], coords[1])),
        onEnd: (_event, coords) => this.onEndNewConnection(new Point(coords[0], coords[1]))
      }, { cursor: "crosshair", initialEvent: initEvent });
    };
    this.setContext({
      canvas: this.getCanvas(),
      graphCanvas: props.graph.getGraphCanvas(),
      ctx: this.getCanvas().getContext("2d"),
      camera: props.camera,
      constants: this.props.graph.graphConstants,
      colors: this.props.graph.graphColors,
      graph: this.props.graph
    });
    this.enabled = Boolean(this.props.graph.rootStore.settings.getConfigFlag("canCreateNewConnections"));
    this.onSignal(this.props.graph.rootStore.settings.$settings, (value) => {
      this.enabled = Boolean(value.canCreateNewConnections);
    });
  }
  afterInit() {
    this.onGraphEvent("mousedown", this.handleMouseDown, { capture: true });
    const checkPortsChanged = () => {
      this.isSnappingTreeOutdated = true;
    };
    this.portsUnsubscribe = this.onSignal(this.context.graph.rootStore.connectionsList.ports.$ports, checkPortsChanged);
    this.context.graph.keyboardService.onPress("Escape", () => {
      if (this.currentListener) {
        this.cancelNewConnection();
      }
    }, {
      signal: this.eventAbortController.signal
    });
    super.afterInit();
  }
  onCameraChange(_camera) {
    this.isSnappingTreeOutdated = true;
  }
  isSnappablePort(port) {
    const meta = port.meta?.[_PortConnectionLayer.PortMetaKey];
    return Boolean(meta?.snappable);
  }
  renderEndpoint(ctx) {
    ctx.beginPath();
    const scale = this.context.camera.getCameraScale();
    const iconSize = 24 / scale;
    const iconOffset = 12 / scale;
    if (!this.targetPort && this.props.createIcon && this.endState) {
      renderSVG({
        path: this.props.createIcon.path,
        width: this.props.createIcon.width,
        height: this.props.createIcon.height,
        iniatialWidth: this.props.createIcon.viewWidth,
        initialHeight: this.props.createIcon.viewHeight
      }, ctx, { x: this.endState.x, y: this.endState.y - iconOffset, width: iconSize, height: iconSize });
    } else if (this.props.point) {
      ctx.fillStyle = this.props.point.fill || this.context.colors.canvas.belowLayerBackground;
      if (this.props.point.stroke) {
        ctx.strokeStyle = this.props.point.stroke;
      }
      renderSVG({
        path: this.props.point.path,
        width: this.props.point.width,
        height: this.props.point.height,
        iniatialWidth: this.props.point.viewWidth,
        initialHeight: this.props.point.viewHeight
      }, ctx, { x: this.endState.x, y: this.endState.y - iconOffset, width: iconSize, height: iconSize });
    }
    ctx.closePath();
  }
  render() {
    this.resetTransform();
    if (!this.startState || !this.endState) {
      return;
    }
    if (this.props.drawLine) {
      const { path, style } = this.props.drawLine(this.startState, this.endState);
      this.context.ctx.lineWidth = this.context.camera.limitScaleEffect(style.width || 3);
      this.context.ctx.strokeStyle = style.color;
      this.context.ctx.setLineDash(style.dash);
      this.context.ctx.stroke(path);
    } else {
      this.context.ctx.beginPath();
      this.context.ctx.lineWidth = this.context.camera.limitScaleEffect(3);
      this.context.ctx.strokeStyle = this.context.colors.connection.selectedBackground;
      this.context.ctx.moveTo(this.startState.x, this.startState.y);
      this.context.ctx.lineTo(this.endState.x, this.endState.y);
      this.context.ctx.stroke();
      this.context.ctx.closePath();
    }
    render(this.context.ctx, (ctx) => {
      this.renderEndpoint(ctx);
    });
  }
  onStartConnection(port, _worldCoords) {
    if (!port) {
      return;
    }
    const params = this.getEventParams(port);
    this.sourcePort = port;
    this.startState = new Point(port.x, port.y);
    this.context.graph.execut\u0435DefaultEventAction("port-connection-create-start", {
      blockId: params.blockId,
      anchorId: params.anchorId,
      sourcePort: port
    }, () => {
      this.selectPort(port, true);
    });
    this.performRender();
  }
  onMoveNewConnection(event, point) {
    if (!this.startState || !this.sourcePort) {
      return;
    }
    const snapResult = this.findNearestSnappingPort(point, this.sourcePort);
    let actualEndPoint = point;
    let newTargetPort;
    if (snapResult) {
      actualEndPoint = new Point(snapResult.snapPoint.x, snapResult.snapPoint.y);
      newTargetPort = snapResult.port;
    } else {
      const searchRadius = this.props.searchRadius || PORT_SEARCH_RADIUS;
      newTargetPort = this.context.graph.rootStore.connectionsList.ports.findPortAtPoint(point, searchRadius, (p2) => {
        return this.isSnappablePort(p2) && Boolean(p2.owner) && p2.id !== this.sourcePort?.id;
      });
    }
    this.endState = new Point(actualEndPoint.x, actualEndPoint.y);
    this.performRender();
    if (newTargetPort !== this.targetPort) {
      this.selectPort(this.targetPort, false);
      this.targetPort = newTargetPort;
      const sourceParams = this.getEventParams(this.sourcePort);
      const targetParams = this.getEventParams(newTargetPort);
      this.context.graph.execut\u0435DefaultEventAction("port-connection-create-hover", {
        sourceBlockId: sourceParams.blockId,
        sourceAnchorId: sourceParams.anchorId,
        targetBlockId: targetParams?.blockId,
        targetAnchorId: targetParams?.anchorId,
        sourcePort: this.sourcePort,
        targetPort: newTargetPort || void 0
      }, () => {
        if (this.targetPort) {
          this.selectPort(this.targetPort, true);
        }
      });
    }
  }
  selectPort(port, select) {
    if (!port)
      return;
    const component = port.owner;
    if (component instanceof GraphComponent) {
      const bucket = this.context.graph.rootStore.selectionService.getBucketByElement(component);
      if (!bucket) {
        return;
      }
      if (select) {
        bucket.select([component.getEntityId()], ESelectionStrategy.REPLACE);
      } else {
        bucket.deselect([component.getEntityId()]);
      }
    }
  }
  cancelNewConnection() {
    if (this.currentListener) {
      stopDragListening(this.currentListener);
    }
    this.startState = null;
    this.endState = null;
    this.performRender();
    this.context.graph.execut\u0435DefaultEventAction("port-connection-cancel", {
      sourcePort: this.sourcePort,
      targetPort: this.targetPort
    }, () => {
    });
    this.sourcePort = void 0;
    this.targetPort = void 0;
  }
  onEndNewConnection(point) {
    if (!this.sourcePort || !this.startState || !this.endState) {
      return;
    }
    let targetPort;
    const snapResult = this.findNearestSnappingPort(point, this.sourcePort);
    if (snapResult) {
      targetPort = snapResult.port;
    } else {
      const searchRadius = this.props.searchRadius || PORT_SEARCH_RADIUS;
      targetPort = this.context.graph.rootStore.connectionsList.ports.findPortAtPoint(point, searchRadius, (p2) => {
        return this.isSnappablePort(p2) && Boolean(p2.owner) && p2.id !== this.sourcePort?.id;
      });
    }
    this.startState = null;
    this.endState = null;
    this.performRender();
    const sourceParams = this.getEventParams(this.sourcePort);
    if (!targetPort) {
      this.context.graph.execut\u0435DefaultEventAction("port-connection-create-drop", {
        sourceBlockId: sourceParams.blockId,
        sourceAnchorId: sourceParams.anchorId,
        point,
        sourcePort: this.sourcePort
      }, () => {
      });
      this.sourcePort = void 0;
      this.targetPort = void 0;
      return;
    }
    const sourceType = this.getPortType(this.sourcePort);
    const targetType = this.getPortType(targetPort);
    let actualSourcePort = this.sourcePort;
    let actualTargetPort = targetPort;
    if (sourceType === EAnchorType.IN && targetType === EAnchorType.OUT) {
      actualSourcePort = targetPort;
      actualTargetPort = this.sourcePort;
    }
    const actualSourceParams = this.getEventParams(actualSourcePort);
    const actualTargetParams = this.getEventParams(actualTargetPort);
    this.context.graph.execut\u0435DefaultEventAction("port-connection-created", {
      sourceBlockId: actualSourceParams.blockId,
      sourceAnchorId: actualSourceParams.anchorId,
      targetBlockId: actualTargetParams.blockId,
      targetAnchorId: actualTargetParams.anchorId,
      sourcePort: actualSourcePort,
      targetPort: actualTargetPort
    }, () => {
      this.context.graph.rootStore.connectionsList.addConnection({
        sourceBlockId: actualSourceParams.blockId,
        sourceAnchorId: actualSourceParams.anchorId,
        targetBlockId: actualTargetParams.blockId,
        targetAnchorId: actualTargetParams.anchorId
      });
    });
    this.selectPort(this.sourcePort, false);
    this.selectPort(targetPort, false);
    const targetParams = this.getEventParams(targetPort);
    this.context.graph.execut\u0435DefaultEventAction("port-connection-create-drop", {
      sourceBlockId: sourceParams.blockId,
      sourceAnchorId: sourceParams.anchorId,
      targetBlockId: targetParams.blockId,
      targetAnchorId: targetParams.anchorId,
      point,
      sourcePort: this.sourcePort,
      targetPort
    }, () => {
    });
    this.sourcePort = void 0;
    this.targetPort = void 0;
  }
  findNearestSnappingPort(point, sourcePort) {
    this.rebuildSnappingTree();
    if (!this.snappingPortsTree) {
      return null;
    }
    const searchRadius = this.props.searchRadius || PORT_SEARCH_RADIUS;
    const candidates = this.snappingPortsTree.search({
      minX: point.x - searchRadius,
      minY: point.y - searchRadius,
      maxX: point.x + searchRadius,
      maxY: point.y + searchRadius
    });
    if (candidates.length === 0) {
      return null;
    }
    let nearestPort = null;
    let nearestDistance = Infinity;
    for (const candidate of candidates) {
      const port = candidate.port;
      if (sourcePort && port.id === sourcePort.id) {
        continue;
      }
      const distance = vectorDistance(point, port);
      const meta = port.meta?.[_PortConnectionLayer.PortMetaKey];
      if (meta?.snapCondition && sourcePort) {
        const canSnap = meta.snapCondition({
          sourcePort,
          targetPort: port,
          cursorPosition: point,
          distance
        });
        if (!canSnap) {
          continue;
        }
      }
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPort = port;
      }
    }
    if (!nearestPort) {
      return null;
    }
    return {
      port: nearestPort,
      snapPoint: { x: nearestPort.x, y: nearestPort.y }
    };
  }
  /**
   * Rebuild the RBush spatial index for snapping ports
   * Optimization: Only includes ports from components visible in viewport + padding
   */
  rebuildSnappingTree() {
    if (!this.isSnappingTreeOutdated) {
      return;
    }
    const snappingBoxes = [];
    const searchRadius = this.props.searchRadius || PORT_SEARCH_RADIUS;
    const visibleComponents = this.context.graph.getElementsInViewport([GraphComponent]);
    for (const component of visibleComponents) {
      const ports = component.getPorts();
      for (const port of ports) {
        if (port.lookup)
          continue;
        if (this.isSnappablePort(port)) {
          snappingBoxes.push({
            minX: port.x - searchRadius,
            minY: port.y - searchRadius,
            maxX: port.x + searchRadius,
            maxY: port.y + searchRadius,
            port
          });
        }
      }
    }
    this.snappingPortsTree = new import_rbush2.default(9);
    if (snappingBoxes.length > 0) {
      this.snappingPortsTree.load(snappingBoxes);
    }
    this.isSnappingTreeOutdated = false;
  }
  /**
   * Determine the port type (IN or OUT)
   * @param port Port to check
   * @returns EAnchorType.IN, EAnchorType.OUT, or null if the port is a block point (no specific direction)
   */
  getPortType(port) {
    const component = port.owner;
    if (!component) {
      return null;
    }
    if (component instanceof Anchor) {
      const anchorType = component.connectedState.state.type;
      if (anchorType === EAnchorType.IN || anchorType === EAnchorType.OUT) {
        return anchorType;
      }
    }
    return null;
  }
  /**
   * Get full event parameters from a port
   * Includes both legacy parameters (blockId, anchorId) and new port reference
   */
  getEventParams(port) {
    if (!port) {
      return {};
    }
    const component = port.owner;
    if (!component) {
      throw new Error("Port has no owner component");
    }
    if (component instanceof Anchor) {
      return {
        blockId: component.connectedState.blockId,
        anchorId: component.connectedState.id
      };
    }
    if (component instanceof Block) {
      return {
        blockId: component.connectedState.id
      };
    }
    return {};
  }
  unmount() {
    if (this.portsUnsubscribe) {
      this.portsUnsubscribe();
      this.portsUnsubscribe = void 0;
    }
    this.snappingPortsTree = null;
    super.unmount();
  }
};
PortConnectionLayer.PortMetaKey = /* @__PURE__ */ Symbol.for("PortConnectionLayer.PortMeta");

// node_modules/@gravity-ui/graph/build/components/canvas/layers/newBlockLayer/NewBlockLayer.js
var NewBlockLayer = class extends Layer {
  constructor(props) {
    super({
      canvas: {
        zIndex: 4,
        classNames: ["no-pointer-events"],
        ...props.canvas
      },
      ...props
    });
    this.copyBlocks = [];
    this.blockStates = [];
    this.enabled = true;
    this.handleMouseDown = (nativeEvent) => {
      if (!this.enabled) {
        return;
      }
      const event = extractNativeGraphMouseEvent(nativeEvent);
      const target = nativeEvent.detail.target;
      if (event && isAltKeyEvent(event) && isBlock(target)) {
        if (this.props.isDuplicateAllowed && !this.props.isDuplicateAllowed(target)) {
          return;
        }
        event.preventDefault();
        if (isGraphEvent(nativeEvent)) {
          nativeEvent.stopGraphEventPropagation();
          nativeEvent.preventGraphEventDefault();
        }
        const blockTarget = target;
        this.context.graph.dragService.startDrag({
          onStart: (event2) => this.onStartNewBlock(event2, blockTarget),
          onUpdate: (event2) => this.onMoveNewBlock(event2),
          onEnd: (event2, coords) => this.onEndNewBlock(event2, { x: coords[0], y: coords[1] })
        }, { cursor: "copy" });
      }
    };
    this.setContext({
      canvas: this.getCanvas(),
      graphCanvas: props.graph.getGraphCanvas(),
      ctx: this.getCanvas().getContext("2d"),
      camera: props.camera,
      constants: this.props.graph.graphConstants,
      colors: this.props.graph.graphColors,
      graph: this.props.graph
    });
  }
  /**
   * Called after initialization and when the layer is reattached.
   * This is where we set up event subscriptions to ensure they work properly
   * after the layer is unmounted and reattached.
   */
  afterInit() {
    super.afterInit();
    this.onGraphEvent("mousedown", this.handleMouseDown, {
      capture: true
    });
  }
  render() {
    this.resetTransform();
    if (!this.blockStates.length) {
      return;
    }
    render(this.context.ctx, (ctx) => {
      ctx.beginPath();
      ctx.fillStyle = this.props.ghostBackground || this.context.colors.block.border;
      for (const blockState of this.blockStates) {
        ctx.fillRect(blockState.x, blockState.y, blockState.width, blockState.height);
      }
      ctx.closePath();
    });
  }
  onStartNewBlock(event, block) {
    const isBlockSelected = block.connectedState.selected;
    let blockStates;
    if (isBlockSelected) {
      const selectedBlockStates = this.context.graph.rootStore.blocksList.$selectedBlocks.value;
      if (this.props.isDuplicateAllowed) {
        blockStates = selectedBlockStates.filter((blockState) => this.props.isDuplicateAllowed(blockState.getViewComponent()));
        if (blockStates.length === 0)
          return;
      } else {
        blockStates = selectedBlockStates;
      }
    } else {
      blockStates = [block.connectedState];
    }
    const blocks = isBlockSelected ? blockStates.map((blockState) => blockState.getViewComponent()) : [block];
    this.copyBlocks = blockStates;
    this.initialPoint = this.context.graph.getPointInCameraSpace(event);
    this.context.graph.execut\u0435DefaultEventAction("block-add-start-from-shadow", { blocks }, () => {
      const scale = this.context.camera.getCameraScale();
      const xy = getXY(this.context.graphCanvas, event);
      const mouseX = xy[0];
      const mouseY = xy[1];
      const cameraRect = this.context.camera.getCameraRect();
      const clickedBlockX = block.connectedState.x * scale + cameraRect.x;
      const clickedBlockY = block.connectedState.y * scale + cameraRect.y;
      const clickOffsetX = mouseX - clickedBlockX;
      const clickOffsetY = mouseY - clickedBlockY;
      this.blockStates = this.copyBlocks.map((blockState) => {
        const blockScreenX = blockState.x * scale + cameraRect.x;
        const blockScreenY = blockState.y * scale + cameraRect.y;
        const blockWidth = blockState.width * scale;
        const blockHeight = blockState.height * scale;
        return {
          width: blockWidth,
          height: blockHeight,
          // Position the ghost block so that the click offset is maintained
          x: mouseX - clickOffsetX + (blockScreenX - clickedBlockX),
          y: mouseY - clickOffsetY + (blockScreenY - clickedBlockY)
        };
      });
      this.performRender();
    });
  }
  onMoveNewBlock(event) {
    if (!this.copyBlocks.length) {
      return;
    }
    const xy = getXY(this.context.graphCanvas, event);
    const mouseX = xy[0];
    const mouseY = xy[1];
    if (this.lastMouseX === void 0) {
      this.lastMouseX = mouseX;
      this.lastMouseY = mouseY;
      return;
    }
    const deltaX = mouseX - this.lastMouseX;
    const deltaY = mouseY - this.lastMouseY;
    this.blockStates = this.blockStates.map((blockState) => {
      return {
        ...blockState,
        x: blockState.x + deltaX,
        y: blockState.y + deltaY
      };
    });
    this.lastMouseX = mouseX;
    this.lastMouseY = mouseY;
    this.performRender();
  }
  onEndNewBlock(event, point) {
    if (!this.copyBlocks.length) {
      return;
    }
    this.blockStates = [];
    this.lastMouseX = void 0;
    this.lastMouseY = void 0;
    this.performRender();
    const offsetX = point.x - this.initialPoint.x;
    const offsetY = point.y - this.initialPoint.y;
    const items = this.copyBlocks.map((blockState) => {
      const newCoord = {
        x: blockState.x + offsetX,
        y: blockState.y + offsetY
      };
      return {
        block: blockState.getViewComponent(),
        coord: newCoord
      };
    });
    const delta = {
      x: offsetX,
      y: offsetY
    };
    this.context.graph.execut\u0435DefaultEventAction("block-added-from-shadow", {
      items,
      delta
    }, () => {
      this.context.graph.api.unsetSelection();
      const blockIdMap = /* @__PURE__ */ new Map();
      items.forEach((item) => {
        const block = item.block.connectedState.asTBlock();
        const blockPoint = item.coord;
        const newBlockId = `${block.id.toString()}-added-from-shadow-${Date.now()}`;
        blockIdMap.set(block.id.toString(), newBlockId);
        this.context.graph.api.addBlock({
          ...block,
          id: newBlockId,
          is: "block",
          x: blockPoint.x,
          y: blockPoint.y
        }, {
          selected: true,
          strategy: ESelectionStrategy.APPEND
          // Use APPEND strategy to keep all blocks selected
        });
      });
      if (blockIdMap.size > 1) {
        const connections = this.context.graph.rootStore.connectionsList.$connections.value;
        connections.forEach((connection) => {
          const sourceId = connection.sourceBlockId;
          const targetId = connection.targetBlockId;
          if (blockIdMap.has(sourceId.toString()) && blockIdMap.has(targetId.toString())) {
            const newSourceId = blockIdMap.get(sourceId.toString());
            const newTargetId = blockIdMap.get(targetId.toString());
            this.context.graph.api.addConnection({
              sourceBlockId: newSourceId,
              targetBlockId: newTargetId,
              sourceAnchorId: connection.sourceAnchorId,
              targetAnchorId: connection.targetAnchorId,
              // Copy any other connection properties
              styles: connection.$state.value.styles,
              dashed: connection.$state.value.dashed,
              label: connection.$state.value.label
            });
          }
        });
      }
    });
    this.copyBlocks = [];
    this.initialPoint = null;
  }
  enable() {
    this.enabled = true;
  }
  disable() {
    this.enabled = false;
  }
  isEnabled() {
    return this.enabled;
  }
};

// node_modules/@gravity-ui/graph/build/components/canvas/layers/connectionLayer/ConnectionLayer.js
var ConnectionLayer = class extends Layer {
  constructor(props) {
    super({
      canvas: {
        zIndex: 4,
        classNames: ["no-pointer-events"],
        transformByCameraPosition: true,
        // Automatically apply camera transformation
        ...props.canvas
      },
      ...props
    });
    this.startState = null;
    this.endState = null;
    this.enable = () => {
      this.enabled = true;
    };
    this.disable = () => {
      this.enabled = false;
    };
    this.handleMouseDown = (nativeEvent) => {
      const target = nativeEvent.detail.target;
      const initEvent = extractNativeGraphMouseEvent(nativeEvent);
      if (!initEvent || !target || !this.root?.ownerDocument) {
        return;
      }
      if (initEvent.button !== 0) {
        return;
      }
      if (this.checkIsShouldStartCreationConnection(target, initEvent) && (isBlock(target) || target instanceof Anchor)) {
        if (isGraphEvent(nativeEvent)) {
          nativeEvent.preventGraphEventDefault();
          nativeEvent.stopGraphEventPropagation();
        }
        this.context.graph.dragService.startDrag({
          onStart: (_event, coords) => this.onStartConnection(target, new Point(coords[0], coords[1])),
          onUpdate: (event, coords) => this.onMoveNewConnection(event, new Point(coords[0], coords[1])),
          onEnd: (_event, coords) => this.onEndNewConnection(new Point(coords[0], coords[1]))
        }, { cursor: "crosshair" });
      }
    };
    this.setContext({
      canvas: this.getCanvas(),
      graphCanvas: props.graph.getGraphCanvas(),
      ctx: this.getCanvas().getContext("2d"),
      camera: props.camera,
      constants: this.props.graph.graphConstants,
      colors: this.props.graph.graphColors,
      graph: this.props.graph
    });
    this.enabled = Boolean(this.props.graph.rootStore.settings.getConfigFlag("canCreateNewConnections"));
    this.onSignal(this.props.graph.rootStore.settings.$settings, (value) => {
      this.enabled = Boolean(value.canCreateNewConnections);
    });
  }
  /**
   * Called after initialization and when the layer is reattached.
   * This is where we set up event subscriptions to ensure they work properly
   * after the layer is unmounted and reattached.
   */
  afterInit() {
    this.onGraphEvent("mousedown", this.handleMouseDown, { capture: true });
    super.afterInit();
  }
  checkIsShouldStartCreationConnection(target, initEvent) {
    if (!this.enabled) {
      return false;
    }
    const isTargetAllowed = target instanceof Anchor && this.context.graph.rootStore.settings.getConfigFlag("useBlocksAnchors") || isShiftKeyEvent(initEvent) && isBlock(target);
    if (!isTargetAllowed) {
      return false;
    }
    if (this.props.isConnectionAllowed && !this.props.isConnectionAllowed(target.connectedState)) {
      return false;
    }
    return true;
  }
  renderEndpoint(ctx) {
    ctx.beginPath();
    const scale = this.context.camera.getCameraScale();
    const iconSize = 24 / scale;
    const iconOffset = 12 / scale;
    if (!this.target && this.props.createIcon && this.endState) {
      renderSVG({
        path: this.props.createIcon.path,
        width: this.props.createIcon.width,
        height: this.props.createIcon.height,
        iniatialWidth: this.props.createIcon.viewWidth,
        initialHeight: this.props.createIcon.viewHeight
      }, ctx, { x: this.endState.x, y: this.endState.y - iconOffset, width: iconSize, height: iconSize });
    } else if (this.props.point) {
      ctx.fillStyle = this.props.point.fill || this.context.colors.canvas.belowLayerBackground;
      if (this.props.point.stroke) {
        ctx.strokeStyle = this.props.point.stroke;
      }
      renderSVG({
        path: this.props.point.path,
        width: this.props.point.width,
        height: this.props.point.height,
        iniatialWidth: this.props.point.viewWidth,
        initialHeight: this.props.point.viewHeight
      }, ctx, { x: this.endState.x, y: this.endState.y - iconOffset, width: iconSize, height: iconSize });
    }
    ctx.closePath();
  }
  render() {
    this.resetTransform();
    if (!this.startState || !this.endState) {
      return;
    }
    const scale = this.context.camera.getCameraScale();
    this.context.ctx.lineWidth = Math.round(2 / scale);
    if (this.props.drawLine) {
      const { path, style } = this.props.drawLine(this.startState, this.endState);
      this.context.ctx.strokeStyle = style.color;
      this.context.ctx.setLineDash(style.dash);
      this.context.ctx.stroke(path);
    } else {
      this.context.ctx.beginPath();
      this.context.ctx.strokeStyle = this.context.colors.connection.selectedBackground;
      this.context.ctx.moveTo(this.startState.x, this.startState.y);
      this.context.ctx.lineTo(this.endState.x, this.endState.y);
      this.context.ctx.stroke();
      this.context.ctx.closePath();
    }
    render(this.context.ctx, (ctx) => {
      this.renderEndpoint(ctx);
    });
  }
  getBlockId(component) {
    if (component instanceof AnchorState) {
      return component.blockId;
    }
    return component.id;
  }
  getAnchorId(component) {
    if (component instanceof AnchorState) {
      return component.id;
    }
    return void 0;
  }
  onStartConnection(sourceComponent, worldCoords) {
    if (!sourceComponent) {
      return;
    }
    this.sourceComponent = sourceComponent.connectedState;
    if (sourceComponent instanceof Block) {
      this.startState = new Point(worldCoords.x, worldCoords.y);
    } else if (sourceComponent instanceof Anchor) {
      const point = sourceComponent.getPosition();
      this.startState = new Point(point.x, point.y);
    }
    this.context.graph.execut\u0435DefaultEventAction("connection-create-start", {
      blockId: sourceComponent instanceof Anchor ? sourceComponent.connectedState.blockId : sourceComponent.connectedState.id,
      anchorId: sourceComponent instanceof Anchor ? sourceComponent.connectedState.id : void 0
    }, () => {
      if (sourceComponent instanceof Block) {
        this.context.graph.api.selectBlocks([this.sourceComponent.id], true, ESelectionStrategy.REPLACE);
      } else if (sourceComponent instanceof Anchor) {
        this.context.graph.api.setAnchorSelection(sourceComponent.props.blockId, sourceComponent.props.id, true);
      }
    });
    this.performRender();
  }
  onMoveNewConnection(event, point) {
    if (!this.startState || !this.sourceComponent) {
      return;
    }
    const newTargetComponent = this.context.graph.getElementOverPoint(point, [Block, Anchor]);
    this.endState = new Point(point.x, point.y);
    this.performRender();
    if (!newTargetComponent || !newTargetComponent.connectedState) {
      this.target?.connectedState?.setSelection(false);
      this.target = void 0;
      return;
    }
    if ((!this.target || this.target.connectedState !== newTargetComponent.connectedState) && newTargetComponent.connectedState !== this.sourceComponent) {
      this.target?.connectedState?.setSelection(false);
      const target = newTargetComponent.connectedState;
      this.target = newTargetComponent;
      this.context.graph.execut\u0435DefaultEventAction("connection-create-hover", {
        sourceBlockId: this.sourceComponent instanceof AnchorState ? this.sourceComponent.blockId : this.sourceComponent.id,
        sourceAnchorId: this.sourceComponent instanceof AnchorState ? this.sourceComponent.id : void 0,
        targetAnchorId: target instanceof AnchorState ? target.id : void 0,
        targetBlockId: target instanceof AnchorState ? target.blockId : target.id
      }, () => {
        this.target.connectedState.setSelection(true);
      });
    }
  }
  onEndNewConnection(point) {
    if (!this.sourceComponent || !this.startState || !this.endState) {
      return;
    }
    const targetComponent = this.context.graph.getElementOverPoint(point, [Block, Anchor]);
    this.startState = null;
    this.endState = null;
    this.performRender();
    if (!(targetComponent instanceof Block) && !(targetComponent instanceof Anchor)) {
      this.context.graph.execut\u0435DefaultEventAction("connection-create-drop", {
        sourceBlockId: this.getBlockId(this.sourceComponent),
        sourceAnchorId: this.getAnchorId(this.sourceComponent),
        point
      }, () => {
      });
      return;
    }
    if (targetComponent && targetComponent.connectedState && this.sourceComponent !== targetComponent.connectedState) {
      if (this.sourceComponent instanceof AnchorState && targetComponent.connectedState instanceof AnchorState && this.sourceComponent.blockId !== targetComponent.connectedState.blockId) {
        const params = {
          sourceBlockId: this.sourceComponent.blockId,
          sourceAnchorId: this.sourceComponent.id,
          targetAnchorId: targetComponent.connectedState.id,
          targetBlockId: targetComponent.connectedState.blockId
        };
        this.context.graph.execut\u0435DefaultEventAction("connection-created", params, () => {
          this.context.graph.rootStore.connectionsList.addConnection(params);
        });
      } else if (this.sourceComponent instanceof BlockState && targetComponent.connectedState instanceof BlockState) {
        const params = {
          sourceBlockId: this.sourceComponent.id,
          targetBlockId: targetComponent.connectedState.id
        };
        this.context.graph.execut\u0435DefaultEventAction("connection-created", params, () => {
          this.context.graph.rootStore.connectionsList.addConnection(params);
        });
      }
      this.sourceComponent.setSelection(false);
      targetComponent.connectedState.setSelection(false);
    }
    this.context.graph.execut\u0435DefaultEventAction("connection-create-drop", {
      sourceBlockId: this.getBlockId(this.sourceComponent),
      sourceAnchorId: this.getAnchorId(this.sourceComponent),
      targetBlockId: this.getBlockId(targetComponent.connectedState),
      targetAnchorId: this.getAnchorId(targetComponent.connectedState),
      point
    }, () => {
    });
  }
};
export {
  Anchor,
  BaseConnection,
  BaseSelectionBucket,
  BatchPath2DRenderer,
  BezierMultipointConnection,
  BlockConnection,
  BlockGroups,
  BlockGroupsTransferLayer,
  CSSVariablesLayer,
  CSS_VARIABLE_MAPPINGS,
  Block as CanvasBlock,
  CollapsibleGroup,
  Component,
  ConnectionArrow,
  ConnectionLayer,
  DEFAULT_CSS_VARIABLES_LAYER_PROPS,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  EAnchorType,
  ECameraScaleLevel,
  ECanChangeBlockGeometry,
  ECanDrag,
  ESchedulerPriority,
  ESelectionStrategy,
  EVENTS,
  EWheelIntent,
  Graph,
  GraphComponent,
  GraphState,
  Group,
  Layer,
  MiniMapLayer,
  MultipleSelectionBucket,
  MultipointConnection,
  NewBlockLayer,
  PortConnectionLayer,
  RootStore,
  SUPPORTED_CSS_VARIABLES,
  SingleSelectionBucket,
  WHEEL_INTENT_RULE,
  applyAlpha,
  cachedMeasureText,
  clearColorCache,
  clearTextCache,
  computeDefaultCollapseRect,
  createAnchorPortId,
  createBlockPointPortId,
  createPortId,
  createWheelIntentResolver,
  curvePolyline,
  debounce,
  defaultGetCameraBlockScaleLevel,
  enableWheelIntentDebug,
  filterSupportedCSSChanges,
  getFontSize,
  getLabelCoords,
  isI3WheelIntentRule,
  isI4WheelIntentRule,
  isPinchZoomGesture,
  layoutGraph,
  layoutText,
  mapCSSChangesToGraphColors,
  mapCSSChangesToGraphConstants,
  mapGraphColorsToCSSVariables,
  mapGraphConstantsToCSSVariables,
  polyline,
  renderText,
  schedule,
  throttle,
  trangleArrowForVector,
  useLayeredLayout
};
/*! Bundled license information:

react/cjs/react.development.js:
  (**
   * @license React
   * react.development.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
