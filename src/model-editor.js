/* Data-model editing. Each command returns a validated, independent snapshot. */
const ModelEditor = (() => {
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const identifier = (v) =>
    typeof v === 'string' &&
    /^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(v) &&
    !['__proto__', 'constructor', 'prototype'].includes(v);
  function check(ok, message) {
    if (!ok) throw new Error(message);
  }
  const areaColors = ['#2B5C61', '#5B4FA6', '#386C97', '#A2522C', '#963D60', '#8A600E', '#4C5C6B'];
  function areaId(model, name) {
    let base =
      name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || 'area';
    if (!/^[a-z_]/.test(base)) base = 'area_' + base;
    let id = base,
      i = 2;
    while (!identifier(id) || model.CTX.some((c) => c.id === id)) id = base + '_' + i++;
    return id;
  }
  function resolveArea(model, name) {
    const value = String(name || '').trim();
    check(
      value.length > 0 && value.length <= 120,
      'Enter a domain-area name (up to 120 characters).'
    );
    const existing = model.CTX.find(
      (c) => c.name.toLowerCase() === value.toLowerCase() || c.id === value
    );
    if (existing) return existing.id;
    check(model.CTX.length < 64, 'A model can have up to 64 domain areas.');
    const id = areaId(model, value);
    model.CTX.push({
      id,
      name: value,
      desc: '',
      color: areaColors[model.CTX.length % areaColors.length],
    });
    return id;
  }
  function multiplicity(value) {
    const m = String(value).trim();
    check(
      /^(?:\*|\d+|\d+\.\.(?:\d+|\*))$/.test(m),
      'Use a UML multiplicity such as 1, 0..1, 0..*, or 1..*.'
    );
    const [lower, upper] = m.split('..');
    check(
      lower === '*' || (Number.isSafeInteger(+lower) && +lower <= 1000000),
      'The multiplicity is too large.'
    );
    if (upper && upper !== '*')
      check(
        Number.isSafeInteger(+upper) && +upper >= +lower && +upper <= 1000000,
        'The upper bound must be at least the lower bound.'
      );
    if (m === '*') return '0..*';
    const lo = String(+lower);
    return upper === undefined || (upper !== '*' && +upper === +lower)
      ? lo
      : lo + '..' + (upper === '*' ? '*' : String(+upper));
  }
  function wholeMultiplicity(value) {
    const m = multiplicity(value);
    check(
      ['0', '1', '0..1'].includes(m),
      'A part can have at most one composite owner. Use 1 or 0..1 at the whole end.'
    );
    return m;
  }
  function cycle(rels, kind) {
    const visiting = new Set(),
      done = new Set();
    function visit(id) {
      if (visiting.has(id)) return true;
      if (done.has(id)) return false;
      visiting.add(id);
      for (const r of rels) if (r.k === kind && r.a === id && visit(r.b)) return true;
      visiting.delete(id);
      done.add(id);
      return false;
    }
    return rels.some((r) => r.k === kind && visit(r.a));
  }
  function height(e, attributes) {
    const count = attributes === 'all' ? e.f.length : e.f.filter((f) => f.k).length;
    return Math.min(2400, (e.st ? 46 : 34) + 10 + count * 18 + (count < e.f.length ? 20 : 0));
  }
  function resize(config, width) {
    for (const e of config.model.ENT) {
      const n = config.layout.nodes[e.id],
        h = height(e, config.view.attributes);
      if (n.h !== h || (width && n.w !== width)) config.layout.routes = {};
      n.h = h;
      if (width) n.w = width;
    }
  }
  function apply(input, command) {
    const c = clone(DesignURL.validate(input)),
      m = c.model,
      l = c.layout,
      v = c.view;
    const find = (id) => {
      const e = m.ENT.find((e) => e.id === id);
      check(e, 'This class no longer exists.');
      return e;
    };
    if (command.type === 'import-design') {
      const imported = clone(DesignURL.validate(command.config));
      check(!cycle(imported.model.RELS, 'gen'), 'Inheritance must not form a cycle.');
      check(!cycle(imported.model.RELS, 'comp'), 'Composition must not form a cycle.');
      return imported;
    } else if (command.type === 'class') {
      const data = command.data,
        old = command.id ? find(command.id) : null;
      check(
        identifier(data.id),
        'Use a class name beginning with a letter or underscore, followed by letters, numbers, or underscores (up to 80 characters).'
      );
      check(
        !m.ENT.some((e) => e.id === data.id && e !== old),
        'A class with this name already exists.'
      );
      check(
        !m.TYPES.some((t) => t.n === data.id) &&
          !m.PRIMS.some((p) => p[0] === data.id) &&
          !Object.hasOwn(m.ENUMS, data.id),
        'This name is already used by another data type.'
      );
      const context = data.areaName === undefined ? data.ctx : resolveArea(m, data.areaName);
      check(
        m.CTX.some((ctx) => ctx.id === context),
        'Choose a domain area.'
      );
      check(['', 'abstract', 'interface'].includes(data.st || ''), 'Choose a class kind.');
      const names = new Set();
      const fields = data.f.map((f) => {
        const n = String(f.n).trim(),
          t = String(f.t).trim();
        check(
          identifier(n),
          'Attribute names must start with a letter or underscore and contain only letters, numbers, or underscores.'
        );
        check(!names.has(n), 'Attribute names must be unique within a class.');
        names.add(n);
        check(
          t.length > 0 && t.length <= 80,
          'Every attribute needs a type (up to 80 characters).'
        );
        const keys = String(f.k).split(' ').filter(Boolean);
        check(
          keys.every(
            (k) =>
              ['PK', 'UK'].includes(k) ||
              (k.startsWith('FK:') && m.ENT.some((e) => e.id === k.slice(3)))
          ),
          'Choose an existing class for the foreign key.'
        );
        return { n, t, m: multiplicity(f.m), k: keys.join(' '), note: String(f.note || '').trim() };
      });
      const e = {
        ...(old || {}),
        id: data.id,
        ctx: context,
        desc: String(data.desc || '').trim(),
        f: fields,
      };
      if (data.st) e.st = data.st;
      else delete e.st;
      for (const key of ['uk', 'checks']) {
        const values = (data[key] || []).map((s) => String(s).trim()).filter(Boolean);
        if (values.length) e[key] = values;
        else delete e[key];
      }
      if (old) {
        const from = old.id,
          to = e.id;
        m.ENT[m.ENT.indexOf(old)] = e;
        if (from !== to) {
          for (const other of m.ENT) {
            if (other.ext === from) other.ext = to;
            for (const f of other.f) {
              if (f.t === from) f.t = to;
              f.k = f.k
                .split(' ')
                .map((k) => (k === 'FK:' + from ? 'FK:' + to : k))
                .join(' ');
            }
          }
          for (const type of m.TYPES)
            for (const f of type.f || []) {
              if (f.t === from) f.t = to;
              if (f.k)
                f.k = f.k
                  .split(' ')
                  .map((k) => (k === 'FK:' + from ? 'FK:' + to : k))
                  .join(' ');
            }
          for (const r of m.RELS) {
            if (r.a === from) r.a = to;
            if (r.b === from) r.b = to;
          }
          l.nodes[to] = l.nodes[from];
          delete l.nodes[from];
          if (v.selected === from) v.selected = to;
        }
      } else {
        check(m.ENT.length < 256, 'This model already has the maximum of 256 classes.');
        const occupied = new Set(l.cell);
        let cell = 0;
        while (occupied.has(cell)) cell++;
        if (cell >= l.C * l.R) {
          check(l.R < 32, 'The grid is full.');
          l.R++;
        }
        m.ENT.push(e);
        l.cell.push(cell);
        l.nodes[e.id] = {
          w:
            command.width ||
            (Object.keys(l.nodes).length
              ? Math.max(...Object.values(l.nodes).map((n) => n.w))
              : l.cardWidth || 280),
          h: height(e, v.attributes),
        };
        l.routes = {};
      }
      v.selected = e.id;
      v.hidden = v.hidden.filter((ctx) => ctx !== e.ctx);
      resize(c);
    } else if (command.type === 'delete-class') {
      const e = find(command.id);
      check(
        command.removeReferences ||
          (!m.ENT.some((other) => other !== e && other.f.some((f) => f.t === e.id)) &&
            !m.TYPES.some((type) => (type.f || []).some((f) => f.t === e.id))),
        'This class is used as an attribute type. Delete with its referring attributes or change their types first.'
      );
      l.cardWidth = Math.max(...Object.values(l.nodes).map((n) => n.w));
      const i = m.ENT.indexOf(e);
      m.ENT.splice(i, 1);
      l.cell.splice(i, 1);
      delete l.nodes[e.id];
      m.RELS = m.RELS.filter((r) => r.a !== e.id && r.b !== e.id);
      for (const other of m.ENT) {
        if (other.ext === e.id) delete other.ext;
        if (command.removeReferences) {
          const removed = new Set(other.f.filter((f) => f.t === e.id).map((f) => f.n));
          other.f = other.f.filter((f) => !removed.has(f.n));
          for (const key of ['uk', 'checks'])
            if (other[key])
              other[key] = other[key].filter(
                (rule) => !rule.split(/[^A-Za-z0-9_]+/).some((token) => removed.has(token))
              );
        }
        for (const f of other.f)
          f.k = f.k
            .split(' ')
            .filter((k) => k !== 'FK:' + e.id)
            .join(' ');
      }
      for (const type of m.TYPES) {
        if (command.removeReferences && type.f) type.f = type.f.filter((f) => f.t !== e.id);
        for (const f of type.f || [])
          if (f.k)
            f.k = f.k
              .split(' ')
              .filter((k) => k !== 'FK:' + e.id)
              .join(' ');
      }
      if (v.selected === e.id) v.selected = null;
      l.routes = {};
      resize(c);
    } else if (command.type === 'relationship') {
      const data = command.data,
        old = command.id === undefined ? null : m.RELS.find((r) => r.i === command.id);
      if (command.id !== undefined) check(old, 'This relationship no longer exists.');
      find(data.a);
      find(data.b);
      check(
        [
          'assoc',
          'agg',
          'comp',
          'gen',
          ...(old && ['real', 'dep'].includes(old.k) ? [old.k] : []),
        ].includes(data.k),
        'Choose a data-model relationship.'
      );
      const r = {
        i: old ? old.i : Math.max(-1, ...m.RELS.map((r) => r.i)) + 1,
        a: data.a,
        b: data.b,
        k: data.k,
        l: String(data.l || '').trim(),
        m1: '',
        m2: '',
      };
      if (['assoc', 'agg', 'comp'].includes(r.k)) {
        r.m1 = r.k === 'comp' ? wholeMultiplicity(data.m1) : multiplicity(data.m1);
        r.m2 = multiplicity(data.m2);
        r.role1 = String(data.role1 || '').trim();
        r.role2 = String(data.role2 || '').trim();
        r.nav = data.nav || 'none';
        check(['none', 'a', 'b', 'both'].includes(r.nav), 'Choose a navigation direction.');
      }
      if (r.k === 'comp')
        check(
          ['0', '1', '0..1'].includes(r.m1),
          'A part can have at most one composite owner. Use 1 or 0..1 at the whole end.'
        );
      if (['gen', 'real', 'comp'].includes(r.k))
        check(r.a !== r.b, 'Inheritance and composition cannot connect a class to itself.');
      if (r.k === 'gen')
        check(
          find(r.a).st !== 'interface' && find(r.b).st !== 'interface',
          'Use class inheritance between classes.'
        );
      const rels = m.RELS.filter((other) => other !== old);
      check(
        !rels.some(
          (other) =>
            other.a === r.a &&
            other.b === r.b &&
            other.k === r.k &&
            (['gen', 'real'].includes(r.k) ||
              (other.l === r.l &&
                (other.role1 || '') === (r.role1 || '') &&
                (other.role2 || '') === (r.role2 || '')))
        ),
        'This relationship already exists.'
      );
      rels.push(r);
      check(!cycle(rels, 'gen'), 'Inheritance must not form a cycle.');
      check(!cycle(rels, 'comp'), 'Composition must not form a cycle.');
      m.RELS = rels;
      for (const id of new Set([r.a, old && old.a].filter(Boolean))) {
        const e = find(id),
          parent = rels.find((r) => r.k === 'gen' && r.a === id);
        if (parent) e.ext = parent.b;
        else delete e.ext;
      }
      l.routes = {};
      v.selected = r.a;
      v.hidden = v.hidden.filter((ctx) => ![find(r.a).ctx, find(r.b).ctx].includes(ctx));
    } else if (command.type === 'delete-relationship') {
      const r = m.RELS.find((r) => r.i === command.id);
      check(r, 'This relationship no longer exists.');
      m.RELS = m.RELS.filter((other) => other !== r);
      if (r.k === 'gen') {
        const e = find(r.a),
          parent = m.RELS.find((other) => other.k === 'gen' && other.a === r.a);
        if (parent) e.ext = parent.b;
        else delete e.ext;
      }
      delete l.routes['e' + r.i];
    } else if (command.type === 'view') {
      l.gx = command.gx;
      l.gy = command.gy;
      v.attributes = command.attributes;
      v.labels = command.labels;
      if (command.hidden !== undefined) {
        check(
          Array.isArray(command.hidden) &&
            command.hidden.every((id) => m.CTX.some((c) => c.id === id)),
          'Choose valid domain areas.'
        );
        v.hidden = [...new Set(command.hidden)];
        if (v.selected && v.hidden.includes(find(v.selected).ctx)) v.selected = null;
      }
      l.cardWidth = command.width;
      if (command.title !== undefined) m.title = String(command.title).trim() || 'Domain model';
      check(['all', 'keys'].includes(v.attributes), 'Choose which attributes to show.');
      l.routes = {};
      resize(c, command.width);
    } else if (command.type === 'area') {
      const name = String(command.name || '').trim();
      check(
        name.length > 0 && name.length <= 120,
        'Enter a domain-area name (up to 120 characters).'
      );
      const area = command.id ? m.CTX.find((c) => c.id === command.id) : null;
      if (command.id) check(area, 'This domain area no longer exists.');
      check(
        !m.CTX.some((c) => c !== area && c.name.toLowerCase() === name.toLowerCase()),
        'A domain area with this name already exists.'
      );
      check(/^#[0-9a-f]{6}$/i.test(command.color), 'Choose a domain-area color.');
      if (area)
        Object.assign(area, {
          name,
          desc: String(command.description || '').trim(),
          color: command.color,
        });
      else {
        check(m.CTX.length < 64, 'A model can have up to 64 domain areas.');
        m.CTX.push({
          id: areaId(m, name),
          name,
          desc: String(command.description || '').trim(),
          color: command.color,
        });
      }
    } else if (command.type === 'delete-area') {
      check(m.CTX.length > 1, 'Keep at least one domain area.');
      check(
        m.CTX.some((c) => c.id === command.id) &&
          m.CTX.some((c) => c.id === command.moveTo) &&
          command.moveTo !== command.id,
        'Choose a different domain area for its classes.'
      );
      m.CTX = m.CTX.filter((c) => c.id !== command.id);
      for (const e of m.ENT) if (e.ctx === command.id) e.ctx = command.moveTo;
      v.hidden = v.hidden.filter((id) => id !== command.id && id !== command.moveTo);
    } else if (command.type === 'enum') {
      check(identifier(command.name), 'Use a valid enumeration name.');
      check(
        !m.ENT.some((e) => e.id === command.name) &&
          !m.TYPES.some((t) => t.n === command.name) &&
          !m.PRIMS.some((p) => p[0] === command.name),
        'This name is already used by another data type.'
      );
      const values = command.values.map((s) => String(s).trim()).filter(Boolean);
      check(
        values.length > 0 && new Set(values).size === values.length,
        'Add at least one value, with no duplicates.'
      );
      m.ENUMS[command.name] = values;
      m.ENUMNOTES[command.name] = String(command.note || '').trim();
    } else if (command.type === 'new-model' || command.type === 'clear-model') {
      const empty = command.type === 'clear-model';
      c.model = {
        title: empty ? 'Untitled model' : 'Domain model',
        CTX: [{ id: 'model', name: 'Domain model', desc: '' }],
        ENT: empty ? [] : [{ id: 'NewClass', ctx: 'model', desc: '', f: [] }],
        RELS: [],
        ENUMS: {},
        ENUMNOTES: {},
        TYPES: [],
        PRIMS: empty
          ? [
              ['UUID', 'Unique identifier.'],
              ['String', 'Text.'],
              ['Integer', 'Whole number.'],
              ['Decimal', 'Exact decimal number.'],
              ['Boolean', 'True or false.'],
              ['DateTime', 'Timestamp.'],
              ['Date', 'Calendar date.'],
            ]
          : clone(m.PRIMS),
      };
      c.layout = {
        version: 'editor',
        C: 4,
        R: 2,
        gx: 100,
        gy: 80,
        cell: empty ? [] : [0],
        nodes: empty ? {} : { NewClass: { w: 280, h: 44 } },
        cardWidth: 280,
        routes: {},
        ro: empty ? {} : clone(l.ro),
      };
      c.view = {
        hidden: [],
        selected: empty ? null : 'NewClass',
        search: '',
        camera: { fit: true },
        attributes: 'all',
        labels: true,
      };
    } else throw new Error('Unknown editor command.');
    return DesignURL.validate(c);
  }
  return { apply, multiplicity, wholeMultiplicity, height };
})();
