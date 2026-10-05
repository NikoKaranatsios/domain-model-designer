/* Keep connection trunks steady while a card follows the pointer. */
const WirePreview = (() => {
  function simplify(points) {
    const out = [];
    for (const p of points) {
      if (out.length && out.at(-1).x === p.x && out.at(-1).y === p.y) continue;
      while (out.length > 1) {
        const a = out.at(-2),
          b = out.at(-1);
        if (
          (a.x === b.x && b.x === p.x && (b.y - a.y) * (p.y - b.y) >= 0) ||
          (a.y === b.y && b.y === p.y && (b.x - a.x) * (p.x - b.x) >= 0)
        )
          out.pop();
        else break;
      }
      out.push({ ...p });
    }
    return out;
  }
  function reanchor(original, sourceBefore, targetBefore, sourceNow, targetNow) {
    if (
      sourceNow.x === sourceBefore.x &&
      sourceNow.y === sourceBefore.y &&
      targetNow.x === targetBefore.x &&
      targetNow.y === targetBefore.y
    )
      return original.map((p) => ({ ...p }));
    const p = simplify(original),
      last = p.length - 1;
    if (last < 1) return p;
    const start = {
      x: p[0].x + sourceNow.x - sourceBefore.x,
      y: p[0].y + sourceNow.y - sourceBefore.y,
    };
    const end = {
      x: p[last].x + targetNow.x - targetBefore.x,
      y: p[last].y + targetNow.y - targetBefore.y,
    };
    const ds = { x: Math.sign(p[1].x - p[0].x), y: Math.sign(p[1].y - p[0].y) };
    const dt = { x: Math.sign(p[last - 1].x - p[last].x), y: Math.sign(p[last - 1].y - p[last].y) };
    const pad = 24;
    if (p.length <= 3) {
      const a = { x: start.x + ds.x * pad, y: start.y + ds.y * pad },
        b = { x: end.x + dt.x * pad, y: end.y + dt.y * pad };
      let middle;
      if (ds.x && dt.x) {
        const y = (start.y + end.y) / 2;
        middle = [
          { x: a.x, y },
          { x: b.x, y },
        ];
      } else if (ds.y && dt.y) {
        const x = (start.x + end.x) / 2;
        middle = [
          { x, y: a.y },
          { x, y: b.y },
        ];
      } else middle = [ds.x ? { x: a.x, y: b.y } : { x: b.x, y: a.y }];
      return simplify([start, a, ...middle, b, end]);
    }
    const a = ds.x
      ? {
          x: ds.x > 0 ? Math.max(p[1].x, start.x + pad) : Math.min(p[1].x, start.x - pad),
          y: start.y,
        }
      : {
          x: start.x,
          y: ds.y > 0 ? Math.max(p[1].y, start.y + pad) : Math.min(p[1].y, start.y - pad),
        };
    const b = dt.x
      ? {
          x: dt.x > 0 ? Math.max(p[last - 1].x, end.x + pad) : Math.min(p[last - 1].x, end.x - pad),
          y: end.y,
        }
      : {
          x: end.x,
          y: dt.y > 0 ? Math.max(p[last - 1].y, end.y + pad) : Math.min(p[last - 1].y, end.y - pad),
        };
    if (p.length === 4) {
      const corner = ds.x ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
      return simplify([start, a, corner, b, end]);
    }
    const trunk = p.slice(2, -2),
      first = trunk[0],
      tail = trunk.at(-1);
    const joinStart = ds.x ? { x: a.x, y: first.y } : { x: first.x, y: a.y };
    const joinEnd = dt.x ? { x: b.x, y: tail.y } : { x: tail.x, y: b.y };
    return simplify([start, a, joinStart, ...trunk, joinEnd, b, end]);
  }
  return { reanchor };
})();
