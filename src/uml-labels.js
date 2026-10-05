/* Place relationship annotations outside cards and previously placed labels. */
const UMLLabels = (() => {
  function create(nodes) {
    const grid = new Map(),
      unit = 80;
    const cells = (b) => {
      const keys = [];
      for (let y = Math.floor(b.y / unit); y <= Math.floor((b.y + b.h) / unit); y++)
        for (let x = Math.floor(b.x / unit); x <= Math.floor((b.x + b.w) / unit); x++)
          keys.push(x + ':' + y);
      return keys;
    };
    function add(b) {
      for (const key of cells(b)) {
        if (!grid.has(key)) grid.set(key, new Set());
        grid.get(key).add(b);
      }
    }
    const overlaps = (a, b) =>
      a.x < b.x + b.w + 4 && a.x + a.w + 4 > b.x && a.y < b.y + b.h + 4 && a.y + a.h + 4 > b.y;
    const offsets = [0, 20, -20, 40, -40, 80, -80, 160, -160];
    const shifts = offsets
      .flatMap((x) => offsets.map((y) => ({ x, y })))
      .sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
    for (const node of Object.values(nodes)) add(node);
    return {
      place(b, maxShift = 160) {
        for (const shift of shifts) {
          if (Math.hypot(shift.x, shift.y) > maxShift) continue;
          const candidate = { ...b, x: b.x + shift.x, y: b.y + shift.y };
          const neighbours = new Set(
            cells({
              ...candidate,
              x: candidate.x - 4,
              y: candidate.y - 4,
              w: candidate.w + 8,
              h: candidate.h + 8,
            }).flatMap((key) => [...(grid.get(key) || [])])
          );
          if (![...neighbours].some((other) => overlaps(candidate, other))) {
            add(candidate);
            return candidate;
          }
        }
        // Label suppression is an explicit presentation choice; data stays in details/exports.
        return null;
      },
    };
  }
  return { create };
})();
