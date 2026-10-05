const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');

const html=readFileSync(resolve(__dirname,'../FCP Domain Model.html'),'utf8');
const section=(start,end)=>{const a=html.search(start);assert.ok(a>=0,'missing function');const tail=html.slice(a),b=tail.search(end);assert.ok(b>0,'missing section boundary');return tail.slice(0,b);};
const functions=section(/function endPointer\(ev\)\s*\{/,/stage\.addEventListener\(\s*['\"]pointerup['\"]\s*,/)+section(/function cancelCardDrag\(\)\s*\{/,/\/\* ---------- selection \+ detail panel ---------- \*\//);
function state(){
  const context=vm.createContext();
  vm.runInContext(`
    const calls=[];
    const ENT=[{id:'A'},{id:'B'}],GR={C:2,R:1,cell:{A:1,B:0}};
    const nodes={A:{x:100,y:0},B:{x:0,y:0}},cardEl={A:{classList:{remove:()=>calls.push('remove-drag')}}};
    const stage={classList:{remove:()=>calls.push('remove-panning'),add:()=>calls.push('add-panning')}};
    const S={tx:20,ty:30,auto:false};
    const pointers=new Map();let gesture=null,connection=null;
    let routes={e0:[{x:100,y:0},{x:0,y:0}]},virtRoutes={},drag=null,dragSnapshot=null;
    const cancelAnimationFrame=()=>calls.push('cancel-frame');
    const place=()=>{nodes.A.x=GR.cell.A*100;nodes.B.x=GR.cell.B*100;};
    const placeCards=()=>calls.push('place-cards'),drawZones=()=>calls.push('zones'),drawWires=()=>calls.push('wires');
    const routeAll=()=>calls.push('route'),routeVirtual=()=>calls.push('virtual'),queueURLUpdate=()=>calls.push('save');
    const connectionClick=id=>calls.push('connect:'+id),cancelConnection=()=>{connection=null;calls.push('cancel-connection');};
    const document={elementFromPoint:()=>({closest:()=>({dataset:{id:'B'}})})};
    const select=id=>calls.push('select:'+id),showRelationshipEditor=()=>calls.push('editor'),byId=()=>({r:{i:0}});
    const remember=()=>calls.push('history'),fit=()=>calls.push('fit'),notice=message=>calls.push(message);
    const designSnapshot=()=>({layout:{cell:[GR.cell.A,GR.cell.B],C:GR.C,R:GR.R,routes}});
    const DesignURL={validate:()=>{throw new Error('Routing grid is too large');}};
    ${functions}
    function beginDrag(){dragSnapshot={layout:{C:2,R:1,cell:[0,1]}};drag={id:'A',raf:1,target:{c:1,r:0},routes:{e0:[{x:0,y:0},{x:100,y:0}]},virtual:{}};}
  `,context);
  return code=>JSON.parse(vm.runInContext('JSON.stringify('+code+')',context));
}

test('cancelled pointer input restores a card without changing selection or undo history',()=>{
  const run=state();run("(beginDrag(),pointers.set(1,{x:10,y:10}),gesture={type:'card',id:'A',moved:true},endPointer({type:'pointercancel',pointerId:1}),true)");
  assert.deepEqual(run('GR.cell'),{A:0,B:1});assert.equal(run('drag'),null);assert.equal(run('gesture'),null);assert.equal(run('pointers.size'),0);
  assert.ok(!run('calls').some(call=>call==='history'||call.startsWith('select:')));
});

test('captured connection drags use the card under the released pointer',()=>{
  const run=state();run("(connection={source:'A',dragging:true,pointerId:7},endPointer({type:'pointerup',pointerId:7,clientX:150,clientY:100,target:{closest:()=>({dataset:{id:'A'}})}}),true)");
  assert.ok(run('calls').includes('connect:B'));assert.equal(run('connection.dragging'),false);
});

test('ending a pinch continues as a pan with the remaining pointer',()=>{
  const run=state();run("(pointers.set(1,{x:20,y:30}),pointers.set(2,{x:100,y:200}),gesture={type:'pinch'},endPointer({type:'pointerup',pointerId:1}),true)");
  assert.deepEqual(run('gesture'),{type:'pan',sx:100,sy:200,tx:20,ty:30,moved:true});assert.equal(run('pointers.size'),1);
});

test('a drop outside the routing budget rolls back before routing or recording history',()=>{
  const run=state();run("(beginDrag(),endDrag('A'),true)");
  assert.deepEqual(run('GR.cell'),{A:0,B:1});assert.equal(run('drag'),null);assert.ok(run('calls').includes('Routing grid is too large'));
  assert.ok(!run('calls').includes('route'));assert.ok(!run('calls').includes('history'));
});
