import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostDemo, DEMO_RULES, demoMetrics, demoStandings, hostDemoReducer } from '../src/competitions/hostDemoModel';
import { readFileSync } from 'node:fs';

test('host demo is deterministic fictional state; resets never share modified fixtures', () => {
  const a=createHostDemo(),b=createHostDemo();
  assert.deepEqual(a,b); assert.notEqual(a.events,b.events);
  a.events[0].rules.title='Changed locally';
  assert.equal(b.events[0].rules.title,DEMO_RULES.title);
  assert.deepEqual(hostDemoReducer(a,{type:'reset'}),b);
  assert.ok(a.events.every(e=>e.id.startsWith('demo-')));
});
test('demo analytics derive from fictional results with clear completion denominator', () => {
  const state=createHostDemo();
  assert.deepEqual(demoMetrics(state),{participants:24,started:52,completed:39,eligible:35,pending:2,excluded:0,completionRate:.75});
  const board=demoStandings(state);
  assert.equal(board.length,24);assert.equal(new Set(board.map(r=>r.playerId)).size,24);
  assert.ok(board.every(r=>r.eligible&&r.review==='clear'));
  assert.equal(board[0].score,92);
});

test('fictional host results respect the advertised hit and miss score bounds', () => {
  const results=createHostDemo().results;
  assert.ok(results.some(r=>!r.hit));
  assert.ok(results.some(r=>r.hit&&r.score>50));
  for(const result of results){
    assert.ok(Number.isInteger(result.score)&&result.score>=0&&result.score<=100);
    if(!result.hit) assert.ok(result.score<=50,`${result.name}: missed shots cannot exceed 50/100`);
  }
});
test('published demo rules are frozen while new drafts can be edited/published', () => {
  let state=createHostDemo();
  state=hostDemoReducer(state,{type:'save',rules:{...DEMO_RULES,title:'Forbidden'}});
  assert.equal(state.events[0].rules.title,DEMO_RULES.title);assert.match(state.message,/frozen/);
  state=hostDemoReducer(state,{type:'save',rules:{...DEMO_RULES,title:'My fictional demo draft'},create:true});
  const id=state.activeId;assert.equal(state.events.at(-1)!.state,'draft');assert.equal(demoMetrics(state).started,0);
  state=hostDemoReducer(state,{type:'publish'});assert.equal(state.events.find(e=>e.id===id)!.state,'published');
  state=hostDemoReducer(state,{type:'save',rules:{...DEMO_RULES,title:'Changed'}});assert.match(state.message,/frozen/);
});
test('demo moderation needs a reason, stays event-isolated and updates audit/rankings', () => {
  let state=createHostDemo();
  state=hostDemoReducer(state,{type:'review',resultId:'demo-result-1',decision:'approve',reason:''});
  assert.equal(demoMetrics(state).pending,2);
  state=hostDemoReducer(state,{type:'review',resultId:'demo-result-1',decision:'approve',reason:'Fictional review example'});
  assert.equal(demoMetrics(state).pending,1);assert.equal(demoMetrics(state).eligible,36);
  assert.ok(state.audit.at(-1)!.detail.includes('Fictional review example'));
  state=hostDemoReducer(state,{type:'select',id:'demo-draft'});
  assert.equal(demoStandings(state).length,0);
  const previous=state.results;
  state=hostDemoReducer(state,{type:'review',resultId:'demo-result-4',decision:'exclude',reason:'Wrong event'});
  assert.equal(state.results,previous);
});
test('demo finalization requires closure, resolved flags and acknowledgment; then review freezes', () => {
  let state=createHostDemo();
  state=hostDemoReducer(state,{type:'finalize',acknowledged:true});assert.equal(state.events[0].state,'published');
  state=hostDemoReducer(state,{type:'close'});
  state=hostDemoReducer(state,{type:'finalize',acknowledged:true});assert.equal(state.events[0].state,'closed');
  for(const id of ['demo-result-1','demo-result-4']) state=hostDemoReducer(state,{type:'review',resultId:id,decision:'exclude',reason:'Demonstration exclusion'});
  state=hostDemoReducer(state,{type:'finalize'});assert.equal(state.events[0].state,'closed');
  state=hostDemoReducer(state,{type:'finalize',acknowledged:true});assert.equal(state.events[0].state,'finalized');
  const results=JSON.stringify(state.results);
  state=hostDemoReducer(state,{type:'review',resultId:'demo-result-1',decision:'approve',reason:'Too late'});
  assert.equal(JSON.stringify(state.results),results);
});
test('demo component/model have no API, storage, cookie or network write paths', () => {
  const code=['../src/competitions/HostDemo.tsx','../src/competitions/hostDemoModel.ts'].map(p=>readFileSync(new URL(p,import.meta.url),'utf8')).join('\n');
  assert.doesNotMatch(code,/\bfetch\s*\(|\bapi\s*[(<]|localStorage|sessionStorage|document\.cookie|\/api\/organizer|\/api\/competitions/);
});
