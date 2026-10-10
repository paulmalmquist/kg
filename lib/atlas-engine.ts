import { seedState } from './atlas-data.ts';
import type {State,Role,Mode,EvidenceRecord,Run,Evaluation,Citation} from './atlas-types.ts';
export const ENGINE_VERSION = 'atlas-lexical-graph/1.0.0';
export const current = (r: EvidenceRecord) => r.revisions[r.revisions.length-1];
export const canRead = (r: EvidenceRecord, role: Role) => r.status !== 'deleted' && r.roles.includes(role);
export function eligible(s: State, role: Role) {return s.records.filter(r=>canRead(r,role)&&r.status==='approved'&&!s.tombstones.includes(r.id));}
const stop = new Set('what is the a an and or of for to in with how why was are which would if change definition approved used where this its it'.split(' '));
const tokens = (s: string) => [...new Set(s.toLowerCase().replace(/[^a-z0-9_-]/g,' ').split(/\s+/).filter(t=>t.length>1&&!stop.has(t)))];
export function authorizedGraph(s: State,role: Role) {
  const ids = new Set(eligible(s,role).map(r=>r.id));
  return s.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)&&ids.has(e.evidenceId)&&current(s.records.find(r=>r.id===e.evidenceId)!).version===e.evidenceVersion);
}
export function downstreamImpact(s:State,role:Role,id:string){
  const edges=authorizedGraph(s,role).filter(e=>['CONSUMES','DEPENDS_ON','IMPLEMENTED_BY','GOVERNED_BY'].includes(e.relation));
  const ids=new Set([id]);let frontier=[id];
  for(let d=0;d<6;d++){const next:string[]=[];for(const e of edges){if(frontier.includes(e.to)&&!ids.has(e.from)){ids.add(e.from);next.push(e.from);}}frontier=next;}
  return eligible(s,role).filter(r=>ids.has(r.id)&&r.id!==id);
}
export function neighborhood(s:State,role:Role,id:string,depth=2) {
  if(!eligible(s,role).some(r=>r.id===id)) return [];
  const edges=authorizedGraph(s,role); const seen=new Set([id]); let frontier=[id];
  for(let d=0;d<depth;d++){const next:string[]=[];for(const e of edges){if(frontier.includes(e.from)&&!seen.has(e.to)){seen.add(e.to);next.push(e.to);}if(frontier.includes(e.to)&&!seen.has(e.from)){seen.add(e.from);next.push(e.from);}}frontier=next;}
  return [...seen];
}
export function retrieve(s:State,role:Role,question:string,mode:Mode) {
  const terms=tokens(question); const corpus=eligible(s,role).filter(r=>s.index.ids.includes(r.id));
  const scored=corpus.map(r=>{const title=tokens(r.title);const text=tokens(current(r).text);const aliases=r.aliases.flatMap(tokens);let score=0;for(const term of terms){if(title.includes(term))score+=6;if(text.includes(term))score+=1;if(mode!=='keyword'&&aliases.includes(term))score+=4;}if(question.toLowerCase().includes(r.id.toLowerCase()))score+=12;return {r,score};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.r.id.localeCompare(b.r.id));
  const roots=scored.slice(0,4).map(x=>x.r.id);const ids=mode==='graph'?[...new Set([...roots,...roots.slice(0,2).flatMap(id=>neighborhood(s,role,id,2))])]:roots;
  const found=ids.map(id=>corpus.find(r=>r.id===id)).filter((r):r is EvidenceRecord=>!!r).slice(0,10);
  const citations:Citation[]=found.map(r=>({id:r.id,title:r.title,version:current(r).version,text:current(r).text,start:0,end:current(r).text.length,hash:current(r).hash,sourceRef:r.sourceRef}));
  const answer=citations.length ? citations.slice(0,3).map((c,i)=>`[${i+1}] ${c.text}`).join('\n\n') : 'No approved evidence matched this question within the selected access scope. Try an exact metric name or record ID.';
  const impactIds=mode==='graph'&&roots[0]?downstreamImpact(s,role,roots[0]).map(r=>r.id).filter(id=>citations.some(c=>c.id===id)):[];
  return {citations,answer,impactIds,graphIds:mode==='graph'?ids:roots};
}
export async function hashText(text:string) {const buffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function initialize() {const s=seedState();await Promise.all(s.records.flatMap(r=>r.revisions.map(async v=>{v.hash=await hashText(v.text);})));return s;}
export function addAudit(s:State,action:string,target:string,actor:string) {if(s.audit.length>=5000)throw new Error('Pilot audit capacity reached. Export the workspace before extending capacity.');s.audit.push({id:crypto.randomUUID(),action,target,actor,at:new Date().toISOString()});}
export function createRun(s:State,role:Role,question:string,mode:Mode,actor:string):Run {
  if(s.runs.length>=250)throw new Error('Pilot run capacity reached. Export the workspace before extending capacity.');
  const result=retrieve(s,role,question,mode);const id=crypto.randomUUID();const at=new Date().toISOString();
  const run:Run={id,question,mode,role,createdAt:at,...result,evidenceIds:result.citations.map(c=>c.id),manifest:{engine:ENGINE_VERSION,generator:'verbatim-extracts/no-llm',indexGeneration:s.index.generation,policyVersions:Object.fromEntries(result.citations.map(c=>[c.id,s.records.find(r=>r.id===c.id)!.policyVersion])),evidenceVersions:Object.fromEntries(result.citations.map(c=>[c.id,c.version]))},transitions:[{stage:'observed',at,actor,note:question},{stage:'contextualized',at,actor:'retrieval-engine',note:`Retrieved ${result.citations.length} approved evidence records.`}]};
  s.runs.unshift(run);addAudit(s,'retrieval.created',id,actor);return run;
}
export function runVisible(s:State,run:Run,role:Role) {return !run.redacted&&run.evidenceIds.every(id=>{const r=s.records.find(r=>r.id===id);return r&&canRead(r,role)&&r.status==='approved'&&!s.tombstones.includes(id);});}
export function viewState(s:State,role:Role):State {
  const records=s.records.filter(r=>canRead(r,role)&&!s.tombstones.includes(r.id));const ids=new Set(records.map(r=>r.id));
  return {...s,records,edges:authorizedGraph(s,role),tombstones:[],index:{...s.index,ids:s.index.ids.filter(id=>ids.has(id))},runs:s.runs.filter(r=>runVisible(s,r,role)),audit:role==='steward'?s.audit:[],evaluations:s.evaluations};
}
export function mutateRecord(s:State,role:Role,id:string,action:string,actor:string) {
  if(role!=='steward')throw new Error('Steward simulation is required for evidence changes.');
  const r=s.records.find(x=>x.id===id);if(!r||!canRead(r,role)||s.tombstones.includes(id))throw new Error('Record is unavailable.');
  if(action==='revoke'){r.roles=['steward'];r.policyVersion++;}
  else if(action==='retire')r.status='retired';
  else if(action==='delete'){
    r.status='deleted';r.revisions=[];r.title='Deleted evidence';r.aliases=[];r.sourceRef='';r.owner='';r.roles=['steward'];s.tombstones.push(id);
    for(const run of s.runs){if(run.evidenceIds.includes(id)){run.redacted=true;run.question='Removed with source evidence';run.answer='';run.citations=[];run.transitions=run.transitions.map(t=>({...t,note:'Removed with source evidence'}));}}
  }else throw new Error('Unsupported evidence operation.');
  s.index.ids=s.index.ids.filter(x=>s.records.some(r=>r.id===x&&r.status==='approved')&&!s.tombstones.includes(x));addAudit(s,`evidence.${action}`,id,actor);
}
export function rebuild(s:State,role:Role,actor:string) {if(role!=='steward')throw new Error('Steward simulation is required to rebuild.');s.index={generation:s.index.generation+1,builtAt:new Date().toISOString(),ids:s.records.filter(r=>r.status==='approved'&&!s.tombstones.includes(r.id)).map(r=>r.id)};addAudit(s,'index.rebuilt',String(s.index.generation),actor);}
export function transitionRun(s:State,role:Role,id:string,stage:string,note:string,actor:string){
  const run=s.runs.find(x=>x.id===id);if(!run||!runVisible(s,run,role))throw new Error('Investigation is unavailable.');
  const last=run.transitions.at(-1)!.stage;
  const allowed:Record<string,string[]>={contextualized:['proposed'],proposed:['approved','rejected'],approved:['measured'],measured:[],rejected:[]};
  if(!allowed[last]?.includes(stage))throw new Error('This transition is not valid from the current stage.');
  if(['approved','rejected'].includes(stage)&&role!=='steward')throw new Error('Steward simulation is required for approval.');
  if(!run.citations.length)throw new Error('An investigation needs approved evidence before a proposal.');
  if(stage==='approved'&&run.citations.some(c=>{const r=s.records.find(r=>r.id===c.id)!;return current(r).version!==c.version||r.policyVersion!==run.manifest.policyVersions[c.id];}))throw new Error('Evidence or access policy changed. Run a fresh investigation before approval.');
  run.transitions.push({stage,at:new Date().toISOString(),actor,note});addAudit(s,`investigation.${stage}`,id,actor);
}
export function evaluate():Evaluation {
  const start=performance.now();const s=seedState();const checks:Evaluation['checks']=[];
  const check=(name:string,test:()=>boolean,detail:string)=>{try{checks.push({name,passed:test(),detail});}catch{checks.push({name,passed:false,detail});}};
  check('Exact metric retrieval',()=>retrieve(s,'analyst','Takt time','keyword').citations[0]?.id==='m_takt','The approved metric is the first result.');
  check('Alias expansion',()=>retrieve(s,'analyst','fpy','context').citations.some(c=>c.id==='m_fpy'),'An acronym resolves to its certified definition.');
  check('Restricted content',()=>!retrieve(s,'analyst','P-123 failed inspection','graph').citations.some(c=>c.id==='test_123'),'Engineering-only evidence is excluded for an analyst.');
  check('Graph permission boundary',()=>!neighborhood(s,'analyst','m_fpy',3).includes('f_inspect'),'A traversal cannot introduce a restricted endpoint.');
  check('Provisional claims excluded',()=>!retrieve(s,'engineer','yield rework','graph').citations.some(c=>c.id==='d_draft'),'The conflicting unapproved proposal is not evidence.');
  check('Directed change impact',()=>downstreamImpact(s,'analyst','f_demand').some(r=>r.id==='a_capacity'),'An upstream fact reaches the consuming app through its model and metric.');
  const revoke=structuredClone(s);mutateRecord(revoke,'steward','d_takt','revoke','test');
  check('Revocation takes effect',()=>!retrieve(revoke,'analyst','production calendar policy','graph').citations.some(c=>c.id==='d_takt'),'A revoked record is absent from retrieval and graph expansion.');
  const del=structuredClone(s);mutateRecord(del,'steward','d_takt','delete','test');rebuild(del,'steward','test');
  check('No resurrection on rebuild',()=>!del.index.ids.includes('d_takt')&&!del.records.find(r=>r.id==='d_takt')!.revisions.length,'A tombstone survives a full projection rebuild.');
  check('Empty-answer behavior',()=>retrieve(s,'analyst','xyzzzz-unknown','graph').citations.length===0,'Unknown questions abstain instead of inventing evidence.');
  const run=createRun(s,'engineer','first-pass yield','graph','test');
  check('Citation spans match',()=>run.citations.every(c=>current(s.records.find(r=>r.id===c.id)!).text.slice(c.start,c.end)===c.text),'Every excerpt is tied to a source revision and exact span.');
  check('Approval authority',()=>{transitionRun(s,'engineer',run.id,'proposed','Investigate first attempts','test');try{transitionRun(s,'engineer',run.id,'approved','Accept','test');return false;}catch{return true;}},'An engineer cannot approve in the steward scenario.');
  mutateRecord(s,'steward','m_fpy','revoke','test');
  check('Historical answer reauthorization',()=>!viewState(s,'analyst').runs.some(r=>r.id===run.id),'Previously saved content is checked against current access.');
  return {id:crypto.randomUUID(),at:new Date().toISOString(),checks,durationMs:Math.round((performance.now()-start)*100)/100};
}
