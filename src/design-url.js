/* Self-contained design links: JSON -> gzip -> base64url. No storage service. */
const DesignURL = (() => {
  const MAX_BYTES = 2 * 1024 * 1024;
  const MAX_TOKEN_LENGTH = 500000;
  const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const text = (v) => typeof v === 'string';
  const id = (v) =>
    text(v) &&
    /^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(v) &&
    !['__proto__', 'constructor', 'prototype'].includes(v);
  const finite = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
  const integer = (v, min, max) => Number.isInteger(v) && finite(v, min, max);
  function validMultiplicity(value, optional = false) {
    if (optional && value === '') return true;
    if (!text(value) || !/^(?:\*|\d+|\d+\.\.(?:\d+|\*))$/.test(value)) return false;
    if (value === '*') return true;
    const [lower, upper] = value.split('..');
    return (
      integer(+lower, 0, 1000000) &&
      (upper === undefined || upper === '*' || integer(+upper, +lower, 1000000))
    );
  }
  function require(ok, message) {
    if (!ok) throw new Error(message);
  }
  function validate(config) {
    require(record(config) &&
      (config.v === undefined || config.v === 1), 'Unsupported design format.');
    require(new TextEncoder().encode(JSON.stringify(config)).length <=
      MAX_BYTES, 'The design is too large (maximum 2 MB).');
    const m = config.model,
      l = config.layout;
    require(record(m) && record(l), 'The model or layout is missing.');
    require(m.title === undefined ||
      (text(m.title) && m.title.trim().length > 0 && m.title.length <= 120), 'Invalid model name.');
    require(Array.isArray(m.CTX) &&
      m.CTX.length > 0 &&
      m.CTX.length <= 64, 'Invalid domain areas.');
    const contexts = new Set(),
      areaNames = new Set();
    for (const c of m.CTX) {
      require(record(c) &&
        id(c.id) &&
        text(c.name) &&
        c.name.trim().length > 0 &&
        c.name === c.name.trim() &&
        c.name.length <= 120 &&
        text(c.desc) &&
        c.desc.length <= 10000 &&
        !contexts.has(c.id) &&
        !areaNames.has(c.name.toLowerCase()), 'Invalid or duplicate domain area.');
      contexts.add(c.id);
      areaNames.add(c.name.toLowerCase());
      require(c.color === undefined ||
        (text(c.color) && /^#[0-9a-f]{6}$/i.test(c.color)), 'Invalid domain-area color.');
    }
    require(Array.isArray(m.ENT) && m.ENT.length <= 256, 'Invalid model elements.');
    const entities = new Set();
    for (const e of m.ENT) {
      require(record(e) &&
        id(e.id) &&
        contexts.has(e.ctx) &&
        text(e.desc) &&
        e.desc.length <= 10000 &&
        !entities.has(e.id), 'Invalid model element.');
      entities.add(e.id);
      require(e.st === undefined ||
        ['abstract', 'interface'].includes(e.st), 'Invalid element kind.');
      require(e.includes === undefined ||
        (Array.isArray(e.includes) &&
          e.includes.length <= 256 &&
          new Set(e.includes).size === e.includes.length &&
          e.includes.every(id)), 'Invalid included value types.');
      require(Array.isArray(e.f) && e.f.length <= 256, 'Invalid fields.');
      const fields = new Set();
      for (const f of e.f) {
        require(record(f) &&
          id(f.n) &&
          !fields.has(f.n) &&
          text(f.t) &&
          f.t.trim().length > 0 &&
          f.t.length <= 80 &&
          text(f.m) &&
          text(f.k) &&
          text(f.note) &&
          f.note.length <= 2000, 'Invalid field.');
        fields.add(f.n);
        require(validMultiplicity(f.m), 'Invalid field multiplicity. Use a UML multiplicity.');
        const keys = f.k.split(' ').filter(Boolean);
        require(new Set(keys).size === keys.length &&
          keys.every(
            (k) => ['PK', 'UK'].includes(k) || k.startsWith('FK:')
          ), 'Invalid attribute keys.');
      }
      for (const key of ['uk', 'checks'])
        require(e[key] === undefined ||
          (Array.isArray(e[key]) &&
            e[key].length <= 256 &&
            e[key].every((s) => text(s) && s.length <= 10000)), 'Invalid keys or rules.');
    }
    for (const e of m.ENT) {
      require(e.ext === undefined || entities.has(e.ext), 'Unknown parent element.');
      for (const f of e.f)
        for (const k of f.k.split(' '))
          if (k.startsWith('FK:')) require(entities.has(k.slice(3)), 'Unknown field reference.');
    }
    require(record(m.ENUMS) &&
      Object.keys(m.ENUMS).length <= 256 &&
      Object.entries(m.ENUMS).every(
        ([k, v]) =>
          id(k) &&
          Array.isArray(v) &&
          v.length > 0 &&
          v.length <= 1024 &&
          new Set(v).size === v.length &&
          v.every((s) => text(s) && s.trim().length > 0 && s.length <= 200)
      ), 'Invalid allowed values.');
    require(record(m.ENUMNOTES) &&
      Object.entries(m.ENUMNOTES).every(
        ([k, v]) => Object.hasOwn(m.ENUMS, k) && text(v) && v.length <= 10000
      ), 'Invalid allowed-value notes.');
    require(Array.isArray(m.TYPES) &&
      m.TYPES.length <= 256 &&
      Array.isArray(m.PRIMS) &&
      m.PRIMS.length <= 128, 'Invalid value types.');
    const typeNames = new Set(entities);
    for (const name of Object.keys(m.ENUMS)) {
      require(!typeNames.has(
        name
      ), 'Data type names must be unique across classes, enumerations, and value types.');
      typeNames.add(name);
    }
    for (const t of m.TYPES) {
      require(record(t) &&
        id(t.n) &&
        text(t.d) &&
        t.d.length <= 10000 &&
        !typeNames.has(t.n) &&
        Array.isArray(t.f) &&
        t.f.length <= 256, 'Invalid or duplicate value type.');
      typeNames.add(t.n);
      const names = new Set();
      for (const f of t.f) {
        require(record(f) &&
          id(f.n) &&
          !names.has(f.n) &&
          text(f.t) &&
          f.t.trim().length > 0 &&
          f.t.length <= 80 &&
          validMultiplicity(f.m) &&
          text(f.k) &&
          text(f.note) &&
          f.note.length <= 2000, 'Invalid value-type attribute.');
        names.add(f.n);
        const keys = f.k.split(' ').filter(Boolean);
        require(new Set(keys).size === keys.length &&
          keys.every(
            (k) => ['PK', 'UK'].includes(k) || k.startsWith('FK:')
          ), 'Invalid value-type attribute keys.');
        for (const k of f.k.split(' '))
          if (k.startsWith('FK:'))
            require(entities.has(k.slice(3)), 'Unknown value-type field reference.');
      }
    }
    for (const p of m.PRIMS) {
      require(Array.isArray(p) &&
        p.length === 2 &&
        id(p[0]) &&
        text(p[1]) &&
        p[1].length <= 2000 &&
        !typeNames.has(p[0]), 'Invalid or duplicate primitive type.');
      typeNames.add(p[0]);
    }
    const valueTypes = new Set(m.TYPES.map((type) => type.n));
    require(m.ENT.every((e) =>
      (e.includes || []).every((name) => valueTypes.has(name))
    ), 'Included fields need a value-type definition.');
    require(Array.isArray(m.RELS) && m.RELS.length <= 2048, 'Invalid connections.');
    const edges = new Set();
    for (const r of m.RELS) {
      require(record(r) &&
        integer(r.i, 0, 100000) &&
        !edges.has(r.i) &&
        entities.has(r.a) &&
        entities.has(r.b) &&
        ['gen', 'real', 'comp', 'agg', 'assoc', 'dep'].includes(r.k) &&
        [r.l, r.m1, r.m2].every(text), 'Invalid connection.');
      edges.add(r.i);
      require(r.nav === undefined ||
        ['none', 'a', 'b', 'both'].includes(r.nav), 'Invalid navigation direction.');
      require(r.l.length <= 200 &&
        [r.role1, r.role2].every(
          (role) => role === undefined || (text(role) && role.length <= 80)
        ), 'Invalid association role or name.');
      require(validMultiplicity(r.m1, true) &&
        validMultiplicity(
          r.m2,
          true
        ), 'Invalid relationship multiplicity. Use a UML multiplicity.');
      if (['gen', 'real'].includes(r.k))
        require(r.a !== r.b, 'Inheritance and realization cannot connect a class to itself.');
      if (r.k === 'comp') {
        const parts = r.m1.split('..'),
          upper = parts.at(-1);
        require(r.m1 !== '' &&
          upper !== '*' &&
          +upper <= 1, 'A part can have at most one composite owner.');
      }
      if (r.k === 'real')
        require(m.ENT.find((e) => e.id === r.a).st !== 'interface' &&
          m.ENT.find((e) => e.id === r.b).st ===
            'interface', 'Realization must point to an interface.');
      if (r.k === 'gen') {
        require((m.ENT.find((e) => e.id === r.a).st === 'interface') ===
          (m.ENT.find((e) => e.id === r.b).st ===
            'interface'), 'Generalization must connect classes to classes or interfaces to interfaces.');
        require(!m.RELS.some(
          (other) => other !== r && other.k === 'gen' && other.a === r.a && other.b === r.b
        ), 'Duplicate generalization.');
      }
      if (!['assoc', 'agg', 'comp'].includes(r.k))
        require(r.m1 === '' &&
          r.m2 === '' &&
          !r.role1 &&
          !r.role2, 'Only associations have endpoint multiplicities and roles.');
    }
    const parents = new Map(
      m.ENT.map((e) => [e.id, m.RELS.filter((r) => r.k === 'gen' && r.a === e.id).map((r) => r.b)])
    );
    for (const e of m.ENT)
      if (e.ext) {
        require((e.st === 'interface') ===
          (m.ENT.find((parent) => parent.id === e.ext).st ===
            'interface'), 'Generalization must connect classes to classes or interfaces to interfaces.');
        require(!parents.get(e.id).length ||
          parents
            .get(e.id)
            .includes(e.ext), 'The parent field conflicts with inheritance relationships.');
        if (!parents.get(e.id).includes(e.ext)) parents.get(e.id).push(e.ext);
      }
    function acyclic(adjacency, label) {
      const active = new Set(),
        done = new Set();
      function visit(id) {
        require(!active.has(id), label + ' must not form a cycle.');
        if (done.has(id)) return;
        active.add(id);
        for (const next of adjacency.get(id) || []) visit(next);
        active.delete(id);
        done.add(id);
      }
      for (const id of adjacency.keys()) visit(id);
    }
    acyclic(parents, 'Inheritance');
    // Composition is acyclic between objects, not necessarily between class types.
    // A Folder may contain Folders; a class diagram cannot validate object links.
    require(text(l.version) && integer(l.C, 1, 32) && integer(l.R, 1, 32), 'Invalid layout grid.');
    require(finite(l.gx, 24, 1000) &&
      finite(l.gy, 24, 1000) &&
      record(l.nodes), 'Invalid card spacing.');
    require(Array.isArray(l.cell) &&
      l.cell.length === m.ENT.length &&
      new Set(l.cell).size === l.cell.length &&
      l.cell.every((k) => integer(k, 0, l.C * l.R - 1)), 'Invalid card positions.');
    require(Object.keys(l.nodes).length === entities.size &&
      Object.keys(l.nodes).every((key) =>
        entities.has(key)
      ), 'Card dimensions must match the model classes.');
    for (const e of m.ENT) {
      const n = l.nodes[e.id];
      require(record(n) &&
        finite(n.w, 80, 1000) &&
        finite(n.h, 40, 2400), 'Invalid card dimensions.');
    }
    require(record(l.ro), 'Invalid connection routing settings.');
    const routerLimits = {
      grid: [8, 80],
      pad: [0, 80],
      margin: [40, 2000],
      inset: [0, 80],
      ring: [0, 200],
      bend: [0, 10000],
      cross: [0, 10000],
      overlap: [0, 10000],
      port: [0, 10000],
      near: [0, 100],
      outside: [0, 10000],
    };
    for (const [k, v] of Object.entries(l.ro))
      require(Object.hasOwn(routerLimits, k) &&
        finite(v, ...routerLimits[k]), 'Invalid connection routing setting.');
    require(l.cardWidth === undefined ||
      finite(l.cardWidth, 80, 1000), 'Invalid default card width.');
    const width = Math.max(l.cardWidth || 224, ...m.ENT.map((e) => l.nodes[e.id].w));
    const rowHeights = Array(l.R).fill(40);
    m.ENT.forEach((e, i) => {
      const row = Math.floor(l.cell[i] / l.C);
      rowHeights[row] = Math.max(rowHeights[row], l.nodes[e.id].h);
    });
    require(l.C * (width + l.gx) <= 20000 &&
      rowHeights.reduce((a, h) => a + h + l.gy, 0) <= 20000, 'The layout grid is too large.');
    const rowY = [];
    let y = 80;
    for (const h of rowHeights) {
      rowY.push(y);
      y += h + l.gy;
    }
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    m.ENT.forEach((e, i) => {
      const n = l.nodes[e.id],
        cell = l.cell[i],
        row = Math.floor(cell / l.C),
        x = 80 + (cell % l.C) * (width + l.gx) + (width - n.w) / 2,
        ny = Math.round(rowY[row] + (rowHeights[row] - n.h) / 2);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, ny);
      x1 = Math.max(x1, x + n.w);
      y1 = Math.max(y1, ny + n.h);
    });
    const grid = l.ro.grid ?? 10,
      margin = l.ro.margin ?? 240,
      cols = Math.ceil((x1 + margin - Math.floor((x0 - margin) / grid) * grid) / grid),
      rows = Math.ceil((y1 + margin - Math.floor((y0 - margin) / grid) * grid) / grid);
    require(!m.ENT.length ||
      cols * rows <=
        500000, 'The routing grid is too large. Reduce spacing, card size, or routing precision.');
    require(record(l.routes), 'Invalid connection paths.');
    let totalPoints = 0;
    for (const [key, points] of Object.entries(l.routes)) {
      require(/^e\d+$/.test(key) &&
        edges.has(Number(key.slice(1))) &&
        Array.isArray(points) &&
        points.length >= 2 &&
        points.length <= 128, 'Invalid connection path.');
      totalPoints += points.length;
      for (const p of points)
        require(record(p) &&
          finite(p.x, -100000, 100000) &&
          finite(p.y, -100000, 100000), 'Invalid connection point.');
      for (let i = 1; i < points.length; i++)
        require(points[i].x === points[i - 1].x ||
          points[i].y === points[i - 1].y, 'Connection paths must be orthogonal.');
    }
    require(totalPoints <= 8192, 'The saved connection paths are too complex.');
    require(config.view === undefined || record(config.view), 'Invalid view settings.');
    const v =
      config.view === undefined
        ? { hidden: [], selected: null, search: '', camera: { fit: true } }
        : config.view;
    require(v.attributes === undefined ||
      ['keys', 'all'].includes(v.attributes), 'Invalid attribute display.');
    require(v.labels === undefined ||
      typeof v.labels === 'boolean', 'Invalid relationship display.');
    require(record(v) &&
      Array.isArray(v.hidden) &&
      v.hidden.every((c) => contexts.has(c)) &&
      (v.selected === null || entities.has(v.selected)) &&
      text(v.search) &&
      v.search.length <= 500, 'Invalid view settings.');
    require(!v.selected ||
      !v.hidden.includes(
        m.ENT.find((e) => e.id === v.selected).ctx
      ), 'The selected card is hidden.');
    require(record(v.camera) && typeof v.camera.fit === 'boolean', 'Invalid camera settings.');
    if (!v.camera.fit)
      require(finite(v.camera.zoom, 0.04, 2.5) &&
        finite(v.camera.x, -100000, 100000) &&
        finite(v.camera.y, -100000, 100000), 'Invalid camera position.');
    return { v: 1, model: m, layout: l, view: v };
  }
  function token(url) {
    const u = new URL(url),
      hash = new URLSearchParams(u.hash.slice(1));
    return hash.has('model') ? hash.get('model') : u.searchParams.get('model');
  }
  async function encode(config) {
    require(typeof CompressionStream ===
      'function', 'This browser cannot create compressed design links.');
    const json = JSON.stringify(validate(config));
    require(new TextEncoder().encode(json).length <=
      MAX_BYTES, 'The design is too large to share in a link.');
    const buffer = await new Response(
      new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
    ).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768)
      binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    const payload = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    require(payload.length <=
      MAX_TOKEN_LENGTH, 'The design is too large for a share link. Download a Design backup instead.');
    return payload;
  }
  async function decode(payload) {
    require(typeof DecompressionStream ===
      'function', 'This browser cannot open compressed design links.');
    require(text(payload) &&
      payload.length > 0 &&
      payload.length <= MAX_TOKEN_LENGTH &&
      /^[A-Za-z0-9_-]+={0,2}$/.test(payload), 'The design link is incomplete or invalid.');
    const base = payload.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base + '='.repeat((4 - (base.length % 4)) % 4));
    const reader = new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'))
      .getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        require(size <= MAX_BYTES, 'The shared design is too large.');
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return validate(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  }
  return {
    validate,
    token,
    encode,
    decode,
    limits: Object.freeze({ maxBytes: MAX_BYTES, maxTokenLength: MAX_TOKEN_LENGTH }),
  };
})();
