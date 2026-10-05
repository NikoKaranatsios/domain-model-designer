// Fictional model covering UML features without depending on a user's design.
const field = (n, t = 'String', k = '', m = '1') => ({ n, t, k, m, note: '' });
const entity = (id, ctx, f, extra = {}) => ({
  id,
  ctx,
  desc: 'Synthetic test element.',
  f,
  ...extra,
});
const model = {
  title: 'Synthetic UML test model',
  CTX: [
    { id: 'records', name: 'Records', desc: '' },
    { id: 'collections', name: 'Collections', desc: '' },
    { id: 'resources', name: 'Resources', desc: '' },
    { id: 'files', name: 'Files', desc: '' },
  ],
  ENT: [
    entity(
      'BaseRecord',
      'records',
      [field('record_id', 'UUID', 'PK'), field('display_name'), field('kind', 'RecordKind')],
      { st: 'abstract' }
    ),
    entity('TextRecord', 'records', [field('record_id', 'UUID', 'PK FK:BaseRecord')], {
      ext: 'BaseRecord',
    }),
    entity('ImageRecord', 'records', [field('record_id', 'UUID', 'PK FK:BaseRecord')], {
      ext: 'BaseRecord',
    }),
    entity('Collection', 'collections', [field('collection_id', 'UUID', 'PK'), field('title')], {
      includes: ['RecordMetadata'],
    }),
    entity('CollectionEntry', 'collections', [
      field('collection_id', 'UUID', 'PK FK:Collection'),
      field('resource_id', 'UUID', 'PK FK:Resource'),
      field('valid_from', 'Date', 'PK'),
    ]),
    entity('Resource', 'resources', [field('resource_id', 'UUID', 'PK')], {
      includes: ['RecordMetadata'],
    }),
    entity('FileResource', 'resources', [field('resource_id', 'UUID', 'PK FK:Resource')], {
      ext: 'Resource',
    }),
    entity(
      'FolderResource',
      'resources',
      [field('resource_id', 'UUID', 'PK FK:Resource'), field('code', 'String', 'UK')],
      { ext: 'Resource' }
    ),
    entity('Identifiable', 'resources', [], { st: 'interface' }),
    entity('Selection', 'collections', [field('item_ids', 'UUID', '', '0..*')]),
    entity('TextBlock', 'files', [field('lines', 'String', '', '1..4')]),
    entity(
      'Attachment',
      'files',
      [field('attachment_id', 'UUID', 'PK'), field('created_at', 'DateTime')],
      { includes: ['RecordMetadata'] }
    ),
    entity('AttachmentLink', 'files', [field('attachment_id', 'UUID', 'FK:Attachment')]),
    entity('SourceBatch', 'files', [field('batch_id', 'UUID', 'PK')]),
    entity(
      'ResourceLink',
      'resources',
      [
        field('from_resource_id', 'UUID', 'FK:Resource'),
        field('to_resource_id', 'UUID', 'FK:Resource'),
      ],
      { checks: ['from_resource_id ≠ to_resource_id'] }
    ),
  ],
  ENUMS: { RecordKind: ['text', 'image'], TestState: ['draft', 'ready'] },
  ENUMNOTES: { RecordKind: 'Synthetic record variants.' },
  TYPES: [
    {
      n: 'RecordMetadata',
      d: 'Reusable synthetic fields.',
      f: [
        field('data_source'),
        field('source_batch_id', 'UUID', 'FK:SourceBatch'),
        field('created_at', 'DateTime'),
      ],
    },
    { n: 'Coordinate', d: 'A point.', f: [field('x', 'Decimal'), field('y', 'Decimal')] },
  ],
  PRIMS: [
    ['UUID', 'Identifier.'],
    ['String', 'Text.'],
    ['Date', 'Date.'],
    ['DateTime', 'Timestamp.'],
    ['Decimal', 'Number.'],
  ],
  RELS: [],
};
const connect = (a, b, k = 'assoc', extra = {}) =>
  model.RELS.push({
    i: model.RELS.length,
    a,
    b,
    k,
    l: '',
    m1: k === 'gen' || k === 'real' ? '' : '1',
    m2: k === 'gen' || k === 'real' ? '' : '0..*',
    nav: 'b',
    ...extra,
  });
connect('TextRecord', 'BaseRecord', 'gen');
connect('ImageRecord', 'BaseRecord', 'gen');
connect('FileResource', 'Resource', 'gen');
connect('FolderResource', 'Resource', 'gen');
connect('Resource', 'Identifiable', 'real');
connect('Collection', 'CollectionEntry', 'comp');
connect('CollectionEntry', 'Resource');
connect('Selection', 'Collection');
connect('AttachmentLink', 'Attachment');
connect('AttachmentLink', 'Resource');
connect('ResourceLink', 'Resource');
const layout = {
  version: '1',
  nodes: Object.fromEntries(model.ENT.map((e) => [e.id, { w: 280, h: 180 }])),
  ro: {
    grid: 10,
    margin: 240,
    pad: 18,
    bend: 26,
    cross: 260,
    overlap: 700,
    port: 90,
    near: 5,
    outside: 40,
    ring: 40,
  },
  routes: Object.fromEntries(
    model.RELS.map((r) => [
      'e' + r.i,
      [
        { x: 80 + r.i * 12, y: 80 },
        { x: 80 + r.i * 12, y: 140 },
        { x: 400 + r.i * 12, y: 140 },
        { x: 400 + r.i * 12, y: 200 },
      ],
    ])
  ),
  C: 5,
  R: 3,
  cell: model.ENT.map((_, i) => i),
  gx: 130,
  gy: 110,
};
module.exports = {
  v: 1,
  model,
  layout,
  view: { hidden: [], selected: null, search: '', camera: { fit: true } },
};
