/* Orthogonal edge router: A* on a fine grid around rectangular cards.
   Lines never enter a card; crossings, overlaps, bends and crowding carry costs. */
(function (root) {
  const DX = [1, 0, -1, 0],
    DY = [0, 1, 0, -1]; // E S W N
  const INF = 1e30;

  function Heap() {
    this.k = [];
    this.v = [];
  }
  Heap.prototype.push = function (key, val) {
    const k = this.k,
      v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  };
  Heap.prototype.pop = function () {
    const k = this.k,
      v = this.v,
      top = v[0],
      lk = k.pop(),
      lv = v.pop(),
      n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  };

  function Router(nodes, o) {
    this.o = o = Object.assign(
      {
        grid: 10,
        pad: 14,
        margin: 240,
        bend: 24,
        cross: 140,
        overlap: 600,
        port: 90,
        near: 4,
        inset: 16,
        outside: 0,
        ring: 40,
      },
      o || {}
    );
    this.nodes = nodes;
    const G = o.grid;
    let x0 = INF,
      y0 = INF,
      x1 = -INF,
      y1 = -INF;
    for (const id in nodes) {
      const r = nodes[id];
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w);
      y1 = Math.max(y1, r.y + r.h);
    }
    this.ox = Math.floor((x0 - o.margin) / G) * G;
    this.oy = Math.floor((y0 - o.margin) / G) * G;
    this.cols = Math.ceil((x1 + o.margin - this.ox) / G);
    this.rows = Math.ceil((y1 + o.margin - this.oy) / G);
    const N = this.cols * this.rows;
    this.N = N;
    this.blocked = new Int16Array(N).fill(-1);
    this.occH = new Uint8Array(N);
    this.occV = new Uint8Array(N);
    this.occP = new Uint8Array(N);
    this.nearH = new Uint8Array(N);
    this.nearV = new Uint8Array(N);
    this.g = new Float64Array(N * 4).fill(INF);
    this.from = new Int32Array(N * 4).fill(-1);
    this.touched = [];
    this.bx0 = x0 - o.ring;
    this.by0 = y0 - o.ring;
    this.bx1 = x1 + o.ring;
    this.by1 = y1 + o.ring;
    this.ids = Object.keys(nodes);
    this.ids.forEach((id, i) => this.paint(nodes[id], i));
    this.routes = {};
  }
  Router.prototype.cx = function (c) {
    return this.ox + c * this.o.grid + this.o.grid / 2;
  };
  Router.prototype.cy = function (r) {
    return this.oy + r * this.o.grid + this.o.grid / 2;
  };
  Router.prototype.span = function (r) {
    const G = this.o.grid,
      P = this.o.pad;
    return {
      c0: Math.ceil((r.x - P - this.ox - G / 2) / G),
      c1: Math.floor((r.x + r.w + P - this.ox - G / 2) / G),
      r0: Math.ceil((r.y - P - this.oy - G / 2) / G),
      r1: Math.floor((r.y + r.h + P - this.oy - G / 2) / G),
    };
  };
  Router.prototype.paint = function (r, i) {
    const s = this.span(r);
    for (let y = Math.max(0, s.r0); y <= Math.min(this.rows - 1, s.r1); y++)
      for (let x = Math.max(0, s.c0); x <= Math.min(this.cols - 1, s.c1); x++)
        this.blocked[y * this.cols + x] = i;
  };
  Router.prototype.repaint = function () {
    this.blocked.fill(-1);
    this.ids.forEach((id, i) => {
      if (!this.nodes[id].hidden) this.paint(this.nodes[id], i);
    });
  };
  Router.prototype.ring = function (id) {
    const r = this.nodes[id],
      s = this.span(r),
      out = [],
      ins = this.o.inset;
    const top = s.r0 - 1,
      bot = s.r1 + 1,
      lef = s.c0 - 1,
      rig = s.c1 + 1;
    for (let c = s.c0; c <= s.c1; c++) {
      const x = this.cx(c);
      if (x < r.x + ins || x > r.x + r.w - ins || c < 0 || c >= this.cols) continue;
      if (top >= 0) out.push({ cell: top * this.cols + c, dir: 3, px: x, py: r.y });
      if (bot < this.rows) out.push({ cell: bot * this.cols + c, dir: 1, px: x, py: r.y + r.h });
    }
    for (let y = s.r0; y <= s.r1; y++) {
      const yy = this.cy(y);
      if (yy < r.y + ins || yy > r.y + r.h - ins || y < 0 || y >= this.rows) continue;
      if (lef >= 0) out.push({ cell: y * this.cols + lef, dir: 2, px: r.x, py: yy });
      if (rig < this.cols) out.push({ cell: y * this.cols + rig, dir: 0, px: r.x + r.w, py: yy });
    }
    return out;
  };
  Router.prototype.route = function (src, tgt, limit) {
    const o = this.o,
      G = o.grid,
      cols = this.cols,
      rows = this.rows,
      blocked = this.blocked;
    const occH = this.occH,
      occV = this.occV,
      occP = this.occP,
      nearH = this.nearH,
      nearV = this.nearV;
    const g = this.g,
      from = this.from,
      touched = this.touched;
    for (let i = 0; i < touched.length; i++) {
      g[touched[i]] = INF;
      from[touched[i]] = -1;
    }
    touched.length = 0;
    const T = this.nodes[tgt],
      tx0 = T.x - o.pad,
      tx1 = T.x + T.w + o.pad,
      ty0 = T.y - o.pad,
      ty1 = T.y + T.h + o.pad;
    const goal = new Map();
    this.ring(tgt).forEach((p) => {
      if (blocked[p.cell] < 0) goal.set(p.cell * 4 + ((p.dir + 2) & 3), p);
    });
    const heap = new Heap();
    const h = (cell) => {
      const x = this.cx(cell % cols),
        y = this.cy((cell / cols) | 0);
      return Math.max(0, tx0 - x, x - tx1) + Math.max(0, ty0 - y, y - ty1);
    };
    const startOf = new Map();
    this.ring(src).forEach((p) => {
      if (blocked[p.cell] >= 0) return;
      const s = p.cell * 4 + p.dir;
      const vert = p.dir === 1 || p.dir === 3;
      const c0 =
        (occP[p.cell] ? o.port : 0) +
        ((vert ? occV[p.cell] : occH[p.cell]) ? o.overlap : 0) +
        ((vert ? occH[p.cell] : occV[p.cell]) ? o.cross : 0);
      if (c0 < g[s]) {
        if (g[s] === INF) touched.push(s);
        g[s] = c0;
        from[s] = -2;
        startOf.set(s, p);
        heap.push(c0 + h(p.cell), s);
      }
    });
    let end = -1,
      n = 0;
    const cap = limit || 600000;
    while (heap.k.length) {
      const s = heap.pop(),
        cell = s >> 2,
        d = s & 3;
      if (goal.has(s)) {
        end = s;
        break;
      }
      if (++n > cap) break;
      const gs = g[s],
        x = cell % cols,
        y = (cell / cols) | 0;
      for (let nd = 0; nd < 4; nd++) {
        if (nd === ((d + 2) & 3)) continue;
        const nx = x + DX[nd],
          ny = y + DY[nd];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nc = ny * cols + nx;
        if (blocked[nc] >= 0) continue;
        const horiz = nd === 0 || nd === 2;
        let cost = G + (nd !== d ? o.bend : 0);
        if (horiz ? occH[nc] : occV[nc]) cost += o.overlap;
        if (horiz ? occV[nc] : occH[nc]) cost += o.cross;
        if (occP[nc]) cost += o.port;
        cost += o.near * (horiz ? nearH[nc] : nearV[nc]);
        if (o.outside) {
          const px = this.ox + nx * G + G / 2,
            py = this.oy + ny * G + G / 2;
          if (px < this.bx0 || px > this.bx1 || py < this.by0 || py > this.by1) cost += o.outside;
        }
        const ns = nc * 4 + nd,
          ng = gs + cost;
        if (ng < g[ns]) {
          if (g[ns] === INF) touched.push(ns);
          g[ns] = ng;
          from[ns] = s;
          heap.push(ng + h(nc), ns);
        }
      }
    }
    if (end < 0) return null;
    const states = [];
    for (let s = end; ; s = from[s]) {
      states.push(s);
      if (from[s] === -2) break;
    }
    states.reverse();
    const sp = startOf.get(states[0]),
      ep = goal.get(end);
    const cells = states.map((s) => s >> 2),
      dirs = states.map((s) => s & 3);
    const pt = (c) => ({ x: this.cx(c % cols), y: this.cy((c / cols) | 0) });
    const pts = [{ x: sp.px, y: sp.py }, pt(cells[0])];
    for (let i = 1; i < cells.length; i++) if (dirs[i] !== dirs[i - 1]) pts.push(pt(cells[i - 1]));
    const last = pt(cells[cells.length - 1]);
    pts.push(last);
    pts.push(ep.dir === 1 || ep.dir === 3 ? { x: last.x, y: ep.py } : { x: ep.px, y: last.y });
    return { pts: simplify(pts), cells, dirs, startCell: sp.cell, endCell: ep.cell, src, tgt };
  };
  function simplify(p) {
    const out = [];
    p.forEach((b) => {
      const a = out[out.length - 1];
      if (a && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) return;
      out.push({ x: b.x, y: b.y });
    });
    for (let i = out.length - 2; i > 0; i--) {
      const a = out[i - 1],
        b = out[i],
        c = out[i + 1];
      if (
        (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) ||
        (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01)
      )
        out.splice(i, 1);
    }
    return out;
  }
  Router.prototype.mark = function (res, v) {
    const cols = this.cols,
      N = this.N;
    const bump = (arr, i) => {
      if (i >= 0 && i < N) arr[i] = Math.max(0, arr[i] + v);
    };
    for (let i = 0; i < res.cells.length; i++) {
      const c = res.cells[i],
        d = res.dirs[i],
        nd = i + 1 < res.dirs.length ? res.dirs[i + 1] : d;
      const hz = d === 0 || d === 2 || nd === 0 || nd === 2,
        vt = d === 1 || d === 3 || nd === 1 || nd === 3;
      if (hz) {
        bump(this.occH, c);
        bump(this.nearH, c - cols);
        bump(this.nearH, c + cols);
      }
      if (vt) {
        bump(this.occV, c);
        bump(this.nearV, c - 1);
        bump(this.nearV, c + 1);
      }
    }
    bump(this.occP, res.startCell);
    bump(this.occP, res.endCell);
  };
  Router.prototype.add = function (id, src, tgt) {
    const r = this.route(src, tgt);
    if (r) {
      this.routes[id] = r;
      this.mark(r, 1);
    }
    return r;
  };
  Router.prototype.remove = function (id) {
    const r = this.routes[id];
    if (r) {
      this.mark(r, -1);
      delete this.routes[id];
    }
  };
  Router.prototype.routeAll = function (edges, passes) {
    const nd = this.nodes;
    const order = edges
      .slice()
      .sort((a, b) => dist(nd[a.src], nd[a.tgt]) - dist(nd[b.src], nd[b.tgt]));
    order.forEach((e) => this.add(e.id, e.src, e.tgt));
    for (let p = 0; p < (passes == null ? 4 : passes); p++) {
      let improved = 0;
      const cr = crossingsPerEdge(this.routes);
      order
        .filter((e) => cr[e.id] > 0)
        .forEach((e) => {
          const old = this.routes[e.id];
          if (!old) return;
          this.mark(old, -1);
          delete this.routes[e.id];
          const r = this.route(e.src, e.tgt);
          const before = countFor(old, this.routes),
            after = r ? countFor(r, this.routes) : INF;
          if (r && after < before) {
            this.routes[e.id] = r;
            this.mark(r, 1);
            improved++;
          } else {
            this.routes[e.id] = old;
            this.mark(old, 1);
          }
        });
      if (!improved) break;
    }
    return this.routes;
  };
  function dist(a, b) {
    return Math.abs(a.x + a.w / 2 - b.x - b.w / 2) + Math.abs(a.y + a.h / 2 - b.y - b.h / 2);
  }
  function segIntersect(a, b, c, d) {
    const h1 = Math.abs(a.y - b.y) < 0.5,
      h2 = Math.abs(c.y - d.y) < 0.5;
    if (h1 === h2) return null;
    const H = h1 ? [a, b] : [c, d],
      V = h1 ? [c, d] : [a, b],
      y = H[0].y,
      x = V[0].x;
    if (
      x > Math.min(H[0].x, H[1].x) + 0.5 &&
      x < Math.max(H[0].x, H[1].x) - 0.5 &&
      y > Math.min(V[0].y, V[1].y) + 0.5 &&
      y < Math.max(V[0].y, V[1].y) - 0.5
    )
      return { x, y };
    return null;
  }
  function crossingsBetween(p, q) {
    let n = 0;
    for (let i = 1; i < p.length; i++)
      for (let j = 1; j < q.length; j++) if (segIntersect(p[i - 1], p[i], q[j - 1], q[j])) n++;
    return n;
  }
  function countFor(r, routes) {
    let n = 0;
    for (const k in routes) n += crossingsBetween(r.pts, routes[k].pts);
    return n;
  }
  function crossingsPerEdge(routes) {
    const out = {},
      ks = Object.keys(routes);
    ks.forEach((k) => (out[k] = 0));
    for (let i = 0; i < ks.length; i++)
      for (let j = i + 1; j < ks.length; j++) {
        const n = crossingsBetween(routes[ks[i]].pts, routes[ks[j]].pts);
        out[ks[i]] += n;
        out[ks[j]] += n;
      }
    return out;
  }
  function totalCrossings(routes) {
    const ks = Object.keys(routes);
    let n = 0;
    for (let i = 0; i < ks.length; i++)
      for (let j = i + 1; j < ks.length; j++)
        n += crossingsBetween(routes[ks[i]].pts, routes[ks[j]].pts);
    return n;
  }
  const api = { Router, totalCrossings, segIntersect, crossingsBetween, crossingsPerEdge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrthoRouter = api;
})(typeof self !== 'undefined' ? self : this);
