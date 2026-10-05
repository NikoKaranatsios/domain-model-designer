/* Binary UML relationships. Routing direction is independent of model direction. */
const UMLNotation = (() => {
  function line(r) {
    const whole = r.k === 'comp' || r.k === 'agg';
    return {
      id: 'e' + r.i,
      r,
      src: whole ? r.b : r.a,
      tgt: whole ? r.a : r.b,
      ms: whole ? r.m2 : r.m1,
      mt: whole ? r.m1 : r.m2,
      rs: whole ? r.role2 : r.role1,
      rt: whole ? r.role1 : r.role2,
    };
  }
  function markers(r) {
    if (r.k === 'gen' || r.k === 'real') return { start: null, end: 'mt' };
    if (r.k === 'dep') return { start: null, end: 'ma' };
    const nav = r.nav ?? (r.k === 'assoc' ? 'b' : 'none');
    const a = nav === 'a' || nav === 'both',
      b = nav === 'b' || nav === 'both';
    if (r.k === 'comp' || r.k === 'agg')
      return { start: b ? 'ma' : null, end: (r.k === 'comp' ? 'md' : 'mg') + (a ? '-nav' : '') };
    return { start: a ? 'ma' : null, end: b ? 'ma' : null };
  }
  function routeFits(l, points, nodes) {
    if (!Array.isArray(points) || points.length < 2) return false;
    const boundary = (p, n) =>
      !!n &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      p.x >= n.x &&
      p.x <= n.x + n.w &&
      p.y >= n.y &&
      p.y <= n.y + n.h &&
      (p.x === n.x || p.x === n.x + n.w || p.y === n.y || p.y === n.y + n.h);
    if (!boundary(points[0], nodes[l.src]) || !boundary(points.at(-1), nodes[l.tgt])) return false;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      if (a.x !== b.x && a.y !== b.y) return false;
      for (const n of Object.values(nodes)) {
        if (
          a.y === b.y &&
          a.y > n.y &&
          a.y < n.y + n.h &&
          Math.max(a.x, b.x) > n.x &&
          Math.min(a.x, b.x) < n.x + n.w
        )
          return false;
        if (
          a.x === b.x &&
          a.x > n.x &&
          a.x < n.x + n.w &&
          Math.max(a.y, b.y) > n.y &&
          Math.min(a.y, b.y) < n.y + n.h
        )
          return false;
      }
    }
    return true;
  }
  return { line, markers, routeFits };
})();
