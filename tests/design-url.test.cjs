const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const { gzipSync, gunzipSync } = require('node:zlib');
const {randomBytes}=require('node:crypto');
const { test } = require('node:test');

const html = readFileSync(resolve(__dirname, '../FCP Domain Model.html'), 'utf8');
const dataScript = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes('const DM='));
const defaults = vm.runInNewContext(`${dataScript}\nJSON.stringify({model:DM,layout:LAYOUT})`);
const config = JSON.parse(defaults);
const codecScript = html.match(/<script id="design-url-codec">([\s\S]*?)<\/script>/)[1];
const codec = vm.runInNewContext(`${codecScript}\nDesignURL`, {
  URL, URLSearchParams, TextEncoder, TextDecoder, CompressionStream,
  DecompressionStream, Blob, Response, btoa, atob,
});
const clone = value => JSON.parse(JSON.stringify(value));
const pack = value => gzipSync(Buffer.from(JSON.stringify(value))).toString('base64url');
const baseView = { hidden: [], selected: null, search: '', camera: { fit: true } };

test('full model, card arrangement, dimensions, and routes survive URL encoding', async () => {
  const payload = await codec.encode({ v: 1, ...config, view: baseView });
  const independent = JSON.parse(gunzipSync(Buffer.from(payload, 'base64url')).toString('utf8'));
  assert.deepEqual(independent.model, config.model);
  assert.deepEqual(independent.layout, config.layout);
  assert.match(payload, /^[A-Za-z0-9_-]+$/);
  assert.ok(payload.length < 18000, `Unexpected payload size: ${payload.length}`);
  const restored = clone(await codec.decode(payload));
  assert.deepEqual(restored, { v: 1, ...config, view: baseView });
});

test('legacy full-model links restore without an envelope version or view', async () => {
  const restored = clone(await codec.decode(pack(config)));
  assert.deepEqual(restored.model, config.model);
  assert.deepEqual(restored.layout, config.layout);
  assert.deepEqual(restored.view, baseView);
});

test('changed descriptions, card sizes, positions, and view are independent of defaults', async () => {
  const changed = clone(config);
  changed.model.ENT.find(e => e.id === 'Household').desc = 'Shared description: Müller & family <notes> 🏠';
  [changed.layout.cell[0], changed.layout.cell[1]] = [changed.layout.cell[1], changed.layout.cell[0]];
  changed.layout.nodes.Household.w = 240;
  changed.layout.routes = {};
  changed.view = { hidden: ['ledger'], selected: 'Household', search: 'Household', camera: { fit: false, zoom: .75, x: 1200, y: 800 } };
  const restored = clone(await codec.decode(await codec.encode(changed)));
  assert.deepEqual(restored.model, changed.model);
  assert.deepEqual(restored.layout, changed.layout);
  assert.deepEqual(restored.view, changed.view);
});

test('fragment configuration takes precedence over GET and an empty fragment is invalid', async () => {
  assert.equal(codec.token('https://example.test/model.html?model=query#model=fragment'), 'fragment');
  assert.equal(codec.token('https://example.test/model.html?model=query'), 'query');
  assert.equal(codec.token('https://example.test/model.html'), null);
  assert.equal(codec.token('https://example.test/model.html?model=query#model='), '');
  await assert.rejects(codec.decode(''), /incomplete or invalid/);
});

test('truncated, malformed, oversized, and unsupported links are rejected', async () => {
  await assert.rejects(codec.decode('not-a-valid-gzip-stream'));
  await assert.rejects(codec.decode(pack(config).slice(0, -15)));
  await assert.rejects(codec.decode('x'.repeat(500001)), /incomplete or invalid/);
  await assert.rejects(codec.decode(pack({ ...config, v: 999 })), /Unsupported design format/);
  const oversized = gzipSync(Buffer.alloc(2 * 1024 * 1024 + 1, 'x')).toString('base64url');
  await assert.rejects(codec.decode(oversized), /too large/);
});

test('broken references and overlapping card cells cannot crash the viewer', async () => {
  const references = clone(config);
  references.model.RELS[0].b = 'MissingEntity';
  await assert.rejects(codec.decode(pack(references)), /Invalid connection/);
  const overlapping = clone(config);
  overlapping.layout.cell[0] = overlapping.layout.cell[1];
  await assert.rejects(codec.decode(pack(overlapping)), /Invalid card positions/);
  const badId = clone(config);
  badId.model.ENT[0].id = 'constructor';
  await assert.rejects(codec.decode(pack(badId)), /Invalid model element/);
  const hiddenSelection = { ...clone(config), view: { ...baseView, hidden: ['client'], selected: 'Household' } };
  await assert.rejects(codec.decode(pack(hiddenSelection)), /selected card is hidden/);
});

test('shared links reject inheritance cycles including legacy parent fields and conflicting parents', async () => {
  const gen=clone(config);gen.model.RELS.push({i:1000,a:'Principal',b:'StaffUser',k:'gen',l:'',m1:'',m2:''});
  await assert.rejects(codec.decode(pack(gen)),/Inheritance.*cycle/);
  const legacy=clone(config);legacy.model.RELS=legacy.model.RELS.filter(r=>r.k!=='gen');legacy.layout.routes={};
  legacy.model.ENT.find(e=>e.id==='StaffUser').ext='ClientUser';legacy.model.ENT.find(e=>e.id==='ClientUser').ext='StaffUser';
  await assert.rejects(codec.decode(pack(legacy)),/Inheritance.*cycle/);
  const conflict=clone(config);conflict.model.ENT.find(e=>e.id==='StaffUser').ext='Person';
  await assert.rejects(codec.decode(pack(conflict)),/parent field conflicts/);
});

test('imports enforce composition ownership, cycles, and realization targets', async () => {
  const owner=clone(config);owner.model.RELS.find(r=>r.k==='comp').m1='0..*';
  await assert.rejects(codec.decode(pack(owner)),/at most one/);
  const self=clone(config),composition=self.model.RELS.find(r=>r.k==='comp');composition.b=composition.a;
  await assert.rejects(codec.decode(pack(self)),/itself/);
  const cycle=clone(config);for(const [i,a,b] of [[1000,'Principal','StaffUser'],[1001,'StaffUser','Principal']])cycle.model.RELS.push({i,a,b,k:'comp',l:'',m1:'1',m2:'*'});
  await assert.rejects(codec.decode(pack(cycle)),/Composition.*cycle/);
  const real=clone(config);real.model.RELS.find(r=>r.k==='real').b='Person';
  await assert.rejects(codec.decode(pack(real)),/point to an interface/);
});

test('runtime schemas reject malformed field types, namespaces, views, and extra layout nodes', () => {
  for(const value of [null,false,'view',[]])assert.throws(()=>codec.validate({...clone(config),view:value}),/Invalid view settings/);
  for(const change of [f=>f.n='bad name',f=>f.t='',f=>f.t={},f=>f.k='PK PK',f=>f.k='INDEX',f=>f.note='x'.repeat(2001)]){
    const c=clone(config);change(c.model.ENT[0].f[0]);assert.throws(()=>codec.validate(c),/Invalid (field|attribute)/);
  }
  const colliding=clone(config);colliding.model.ENUMS.Principal=['one'];assert.throws(()=>codec.validate(colliding),/names must be unique/);
  const duplicate=clone(config);duplicate.model.ENUMS.PrincipalKind=['staff','staff'];assert.throws(()=>codec.validate(duplicate),/allowed values/);
  const areas=clone(config);areas.model.CTX[1].name=areas.model.CTX[0].name.toUpperCase();assert.throws(()=>codec.validate(areas),/duplicate domain area/);
  const nodes=clone(config);nodes.layout.nodes.Ghost={w:'broken',h:100};assert.throws(()=>codec.validate(nodes),/must match/);
  const routing=clone(config);routing.layout.ro.toString=1;assert.throws(()=>codec.validate(routing),/routing setting/);
});

test('untrusted layouts have bounded routing memory and path complexity', async () => {
  const grid=clone(config);Object.assign(grid.layout,{gx:1000,gy:1000});Object.assign(grid.layout.ro,{grid:8,margin:2000});
  await assert.rejects(codec.decode(pack(grid)),/routing grid is too large/);
  const path=clone(config);path.layout.routes.e0=Array.from({length:129},(_,i)=>({x:i*10,y:0}));
  await assert.rejects(codec.decode(pack(path)),/Invalid connection path/);
  const total=clone(config);total.layout.routes=Object.fromEntries(total.model.RELS.map(r=>['e'+r.i,Array.from({length:100},(_,i)=>({x:i,y:r.i}))]));
  await assert.rejects(codec.decode(pack(total)),/paths are too complex/);
  const oversized={...clone(config),extra:'x'.repeat(2*1024*1024)};assert.throws(()=>codec.validate(oversized),/too large/);
});

test('encoding validates the schema before producing a share link', async () => {
  const c=clone(config);c.model.ENT[0].f[0].m='anything';await assert.rejects(codec.encode(c),/multiplicity/);
});

test('encoding refuses links larger than the decoder accepts',async()=>{
  const c=clone(config);c.model.ENT[0].f=Array.from({length:256},(_,i)=>({n:'field'+i,t:'String',m:'1',k:'',note:randomBytes(1500).toString('base64')}));
  assert.ok(Buffer.byteLength(JSON.stringify(c))<codec.limits.maxBytes);
  await assert.rejects(codec.encode(c),/too large for a share link.*backup/);
});
