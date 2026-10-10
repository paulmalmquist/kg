import { seedState } from './atlas-data.ts';
import type {State,Role,Mode,EvidenceRecord,Run,Evaluation,Citation,Edge,Impact,ImpactLimit,RelationVersion,Candidate,RetrievalConfig} from './atlas-types.ts';
export const ENGINE_VERSION = 'atlas-lexical-graph/1.1.0';
export const SCHEMA_VERSION = 2;
/** Domain errors whose messages are safe to show to the user. Anything else is an infrastructure fault. */
export class AtlasError extends Error { constructor(message:string){super(message);this.name='AtlasError';} }
export const CONFIG: RetrievalConfig = {titleWeight:6,textWeight:1,aliasWeight:4,idWeight:12,maxRoots:4,contextRoots:2,contextDepth:2,maxCitations:10,impactDepth:6,impactRelations:['CONSUMES','DEPENDS_ON','IMPLEMENTED_BY','GOVERNED_BY']};
export const RUN_CAPACITY = 250;
export const AUDIT_CAPACITY = 5000;
/** Cloudflare D1 maximum string/row size (developers.cloudflare.com/d1/platform/limits, checked 2026-10-10). */
export const D1_ROW_LIMIT_BYTES = 2_000_000;
/** Non-essential growth stops here so revocation, retirement, and deletion always have headroom. */
export const STORAGE_SOFT_LIMIT_BYTES = 1_800_000;
/** Access and lifecycle changes that must never be blocked by pilot capacity limits. */
export const ESSENTIAL_ACTIONS = new Set(['revoke','retire','delete']);

export const current = (r: EvidenceRecord) => r.revisions[r.revisions.length-1];
export const canRead = (r: EvidenceRecord, role: Role) => r.status !== 'deleted' && r.roles.includes(role);
const readable = (s: State, id: string, role: Role) => {const r=s.records.find(x=>x.id===id);return !!r&&canRead(r,role)&&!s.tombstones.includes(id);};
export function eligible(s: State, role: Role) {return s.records.filter(r=>canRead(r,role)&&r.status==='approved'&&!s.tombstones.includes(r.id));}
const stop = new Set('what is the a an and or of for to in with how why was are which would if change definition approved used where this its it'.split(' '));
const tokens = (s: string) => [...new Set(s.toLowerCase().replace(/[^a-z0-9_-]/g,' ').split(/\s+/).filter(t=>t.length>1&&!stop.has(t)))];
export function authorizedGraph(s: State,role: Role) {
  const ids = new Set(eligible(s,role).map(r=>r.id));
  return s.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)&&ids.has(e.evidenceId)&&current(s.records.find(r=>r.id===e.evidenceId)!).version===e.evidenceVersion);
}

/**
 * Directed change impact: everything that (transitively) depends on rootId through
 * dependency relations, computed only over evidence the persona may read.
 * `complete` is false whenever the result cannot be shown to be the full set.
 */
export function impactAnalysis(s:State,role:Role,rootId:string):{ids:string[];complete:boolean;limits:ImpactLimit[];relations:RelationVersion[]} {
  const limits = new Set<ImpactLimit>();
  // Scope is a property of the persona, not of this path, so reporting it reveals nothing path-specific.
  if (s.records.some(r=>r.status==='approved'&&!s.tombstones.includes(r.id)&&!canRead(r,role))) limits.add('access-scope');
  const visible = new Set(eligible(s,role).map(r=>r.id));
  if (!visible.has(rootId)) return {ids:[],complete:false,limits:[...limits],relations:[]};
  const relationTypes = new Set(CONFIG.impactRelations);
  const usable = authorizedGraph(s,role).filter(e=>relationTypes.has(e.relation));
  const seen = new Set([rootId]); const used = new Map<string,Edge>(); let frontier = [rootId];
  for (let depth=0; depth<CONFIG.impactDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const e of usable) if (frontier.includes(e.to)) { used.set(e.id,e); if (!seen.has(e.from)) { seen.add(e.from); next.push(e.from); } }
    frontier = next;
  }
  if (usable.some(e=>frontier.includes(e.to)&&!seen.has(e.from))) limits.add('depth-limit');
  // Relationships among visible objects that were excluded only because their evidence changed.
  const stale = s.edges.some(e=>relationTypes.has(e.relation)&&seen.has(e.to)&&visible.has(e.from)&&visible.has(e.evidenceId)&&current(s.records.find(r=>r.id===e.evidenceId)!).version!==e.evidenceVersion);
  if (stale) limits.add('stale-relationships');
  const ids = eligible(s,role).filter(r=>seen.has(r.id)&&r.id!==rootId).map(r=>r.id);
  return {ids,complete:limits.size===0,limits:[...limits],relations:[...used.values()].map(e=>({id:e.id,evidenceId:e.evidenceId,evidenceVersion:e.evidenceVersion}))};
}
export function downstreamImpact(s:State,role:Role,id:string){
  const ids = new Set(impactAnalysis(s,role,id).ids);
  return eligible(s,role).filter(r=>ids.has(r.id));
}
/** Undirected neighbourhood for context assembly. This is not a dependency claim. */
export function neighborhood(s:State,role:Role,id:string,depth=2) {
  if(!eligible(s,role).some(r=>r.id===id)) return [];
  const edges=authorizedGraph(s,role); const seen=new Set([id]); let frontier=[id];
  for(let d=0;d<depth;d++){const next:string[]=[];for(const e of edges){if(frontier.includes(e.from)&&!seen.has(e.to)){seen.add(e.to);next.push(e.to);}if(frontier.includes(e.to)&&!seen.has(e.from)){seen.add(e.from);next.push(e.from);}}frontier=next;}
  return [...seen];
}
export type RetrieveOptions = {impactRoot?: string};
export function retrieve(s:State,role:Role,question:string,mode:Mode,options:RetrieveOptions={}) {
  const terms=tokens(question); const corpus=eligible(s,role).filter(r=>s.index.ids.includes(r.id));
  const scored=corpus.map(r=>{
    const title=tokens(r.title);const text=tokens(current(r).text);const aliases=r.aliases.flatMap(tokens);let score=0;const matched:string[]=[];
    for(const term of terms){let hit=false;if(title.includes(term)){score+=CONFIG.titleWeight;hit=true;}if(text.includes(term)){score+=CONFIG.textWeight;hit=true;}if(mode!=='keyword'&&aliases.includes(term)){score+=CONFIG.aliasWeight;hit=true;}if(hit)matched.push(term);}
    if(question.toLowerCase().includes(r.id.toLowerCase())){score+=CONFIG.idWeight;matched.push(r.id);}
    return {r,score,matched};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.r.id.localeCompare(b.r.id));
  const roots=scored.slice(0,CONFIG.maxRoots).map(x=>x.r.id);
  const ids=mode==='graph'?[...new Set([...roots,...roots.slice(0,CONFIG.contextRoots).flatMap(id=>neighborhood(s,role,id,CONFIG.contextDepth))])]:roots;
  const found=ids.map(id=>corpus.find(r=>r.id===id)).filter((r):r is EvidenceRecord=>!!r).slice(0,CONFIG.maxCitations);
  const citations:Citation[]=found.map(r=>({id:r.id,title:r.title,version:current(r).version,text:current(r).text,start:0,end:current(r).text.length,hash:current(r).hash,sourceRef:r.sourceRef}));
  const answer=citations.length ? citations.slice(0,3).map((c,i)=>`[${i+1}] ${c.text}`).join('\n\n') : 'No approved evidence matched this question within the selected access scope. Try an exact metric name or record ID.';
  // Impact starts from an explicit, authorized object when the user names one; otherwise from the
  // top-ranked match, which is disclosed because lexical rank is not the same as the changed object.
  let impact:Impact|undefined; let relations:RelationVersion[]=[];
  if(options.impactRoot!==undefined&&!eligible(s,role).some(r=>r.id===options.impactRoot))throw new AtlasError('The selected impact root is unavailable.');
  if(mode==='graph'||options.impactRoot!==undefined){
    const rootId=options.impactRoot??roots[0]??null;
    const rootSource:Impact['rootSource']=options.impactRoot!==undefined?'explicit':rootId?'top-ranked':'none';
    if(rootId){const a=impactAnalysis(s,role,rootId);relations=a.relations;impact={rootId,rootSource,candidates:roots,ids:a.ids,complete:a.complete,limits:rootSource==='top-ranked'?[...a.limits,'root-inferred']:a.limits};}
    else impact={rootId:null,rootSource,candidates:[],ids:[],complete:false,limits:[]};
  }
  const candidates:Candidate[]=scored.slice(0,Math.max(CONFIG.maxCitations,CONFIG.maxRoots)).map(x=>({id:x.r.id,score:x.score,matched:x.matched}));
  return {citations,answer,impact,impactIds:impact?.ids??[],graphIds:mode==='graph'?ids:roots,candidates,relations};
}
export async function hashText(text:string) {const buffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function initialize() {const s=seedState();await Promise.all(s.records.flatMap(r=>r.revisions.map(async v=>{v.hash=await hashText(v.text);})));return s;}
const ESSENTIAL_AUDIT=new Set([...ESSENTIAL_ACTIONS].map(a=>`evidence.${a}`));
function assertAuditCapacity(s:State,action:string){if(!ESSENTIAL_AUDIT.has(action)&&s.audit.length>=AUDIT_CAPACITY)throw new AtlasError('Pilot audit capacity reached. Export the workspace before extending capacity. Revocation, retirement, and deletion remain available.');}
export function addAudit(s:State,action:string,target:string,actor:string) {assertAuditCapacity(s,action);s.audit.push({id:crypto.randomUUID(),action,target,actor,at:new Date().toISOString()});}
export function serializedBytes(s:State){return new TextEncoder().encode(JSON.stringify(s)).length;}
/** Call after applying an action and before persisting the snapshot. */
export function assertStorageBudget(s:State,action:string){
  const bytes=serializedBytes(s);
  if(bytes>D1_ROW_LIMIT_BYTES)throw new AtlasError('This workspace is larger than the pilot storage row limit. Export it and start a new workspace.');
  if(!ESSENTIAL_ACTIONS.has(action)&&bytes>STORAGE_SOFT_LIMIT_BYTES)throw new AtlasError('Workspace storage budget reached. Export the workspace before adding more. Revocation, retirement, and deletion remain available.');
}
export function createRun(s:State,role:Role,question:string,mode:Mode,actor:string,options:RetrieveOptions={}):Run {
  if(s.runs.length>=RUN_CAPACITY)throw new AtlasError('Pilot run capacity reached. Export the workspace before extending capacity.');
  assertAuditCapacity(s,'retrieval.created');
  const result=retrieve(s,role,question,mode,options);const id=crypto.randomUUID();const at=new Date().toISOString();
  const run:Run={id,question,mode,role,createdAt:at,citations:result.citations,answer:result.answer,evidenceIds:result.citations.map(c=>c.id),impactIds:result.impactIds,graphIds:result.graphIds,impact:result.impact,
    manifest:{engine:ENGINE_VERSION,generator:'verbatim-extracts/no-llm',indexGeneration:s.index.generation,policyVersions:Object.fromEntries(result.citations.map(c=>[c.id,s.records.find(r=>r.id===c.id)!.policyVersion])),evidenceVersions:Object.fromEntries(result.citations.map(c=>[c.id,c.version])),relations:result.relations,candidates:result.candidates,config:structuredClone(CONFIG)},
    transitions:[{stage:'observed',at,actor,note:question},{stage:'contextualized',at,actor:'retrieval-engine',note:`Retrieved ${result.citations.length} approved evidence records.`}]};
  s.runs.unshift(run);addAudit(s,'retrieval.created',id,actor);return run;
}
/** A saved run is shown while its cited evidence is still readable. Retirement is not revocation. */
export function runVisible(s:State,run:Run,role:Role) {return !run.redacted&&run.evidenceIds.every(id=>readable(s,id,role));}
/** Cited evidence whose status, revision, or access policy changed after the run. */
export function staleEvidence(s:State,run:Run) {return run.evidenceIds.filter(id=>{const r=s.records.find(x=>x.id===id);return !r||r.status!=='approved'||s.tombstones.includes(id)||current(r).version!==run.manifest.evidenceVersions[id]||r.policyVersion!==run.manifest.policyVersions[id];});}
/** True when a relationship the run's impact relied on no longer holds at the recorded evidence version. */
export function relationsChanged(s:State,run:Run,role:Role) {
  if(!run.manifest.relations)return run.mode==='graph'; // saved before relation versions were captured
  const visible=new Set(eligible(s,role).map(r=>r.id));
  return run.manifest.relations.some(rel=>{const e=s.edges.find(x=>x.id===rel.id);if(!e||e.evidenceVersion!==rel.evidenceVersion||!visible.has(e.from)||!visible.has(e.to)||!visible.has(e.evidenceId))return true;return current(s.records.find(r=>r.id===e.evidenceId)!).version!==rel.evidenceVersion;});
}
/** Per-persona projection of a saved run: every non-cited reference is reauthorized individually. */
function projectRun(s:State,run:Run,role:Role):Run {
  const ok=(id:string)=>readable(s,id,role);
  const edgeOk=(rel:RelationVersion)=>{const e=s.edges.find(x=>x.id===rel.id);return !!e&&ok(e.from)&&ok(e.to)&&ok(e.evidenceId);};
  let impact=run.impact;
  if(impact)impact=impact.rootId&&!ok(impact.rootId)?{...impact,rootId:null,ids:[],candidates:[],complete:false,limits:[...new Set<ImpactLimit>([...impact.limits,'access-scope'])]}:{...impact,ids:impact.ids.filter(ok),candidates:impact.candidates.filter(ok)};
  return {...run,graphIds:run.graphIds.filter(ok),impactIds:impact?impact.ids:run.impactIds.filter(ok),impact,
    manifest:{...run.manifest,relations:run.manifest.relations?.filter(edgeOk),candidates:run.manifest.candidates?.filter(c=>ok(c.id))},
    staleEvidenceIds:staleEvidence(s,run)};
}
export function viewState(s:State,role:Role):State {
  const records=s.records.filter(r=>canRead(r,role)&&!s.tombstones.includes(r.id));const ids=new Set(records.map(r=>r.id));
  return {...s,records,edges:authorizedGraph(s,role),tombstones:[],index:{...s.index,ids:s.index.ids.filter(id=>ids.has(id))},runs:s.runs.filter(r=>runVisible(s,r,role)).map(r=>projectRun(s,r,role)),audit:role==='steward'?s.audit:[],evaluations:s.evaluations};
}
/** Remove a deleted record from every derived structure. Only the tombstone and audit trail keep its ID. */
function scrubReferences(s:State,id:string){
  s.edges=s.edges.filter(e=>e.from!==id&&e.to!==id&&e.evidenceId!==id);
  s.index.ids=s.index.ids.filter(x=>x!==id);
  for(const run of s.runs){
    if(run.evidenceIds.includes(id)){run.redacted=true;run.question='Removed with source evidence';run.answer='';run.citations=[];run.transitions=run.transitions.map(t=>({...t,note:'Removed with source evidence'}));}
    run.evidenceIds=run.evidenceIds.filter(x=>x!==id);run.graphIds=run.graphIds.filter(x=>x!==id);run.impactIds=run.impactIds.filter(x=>x!==id);
    if(run.impact)run.impact={...run.impact,rootId:run.impact.rootId===id?null:run.impact.rootId,ids:run.impact.ids.filter(x=>x!==id),candidates:run.impact.candidates.filter(x=>x!==id)};
    delete run.manifest.evidenceVersions[id];delete run.manifest.policyVersions[id];
    if(run.manifest.relations)run.manifest.relations=run.manifest.relations.filter(r=>r.evidenceId!==id&&s.edges.some(e=>e.id===r.id));
    if(run.manifest.candidates)run.manifest.candidates=run.manifest.candidates.filter(c=>c.id!==id);
  }
}
export function mutateRecord(s:State,role:Role,id:string,action:string,actor:string) {
  if(role!=='steward')throw new AtlasError('Steward simulation is required for evidence changes.');
  const r=s.records.find(x=>x.id===id);if(!r||!canRead(r,role)||s.tombstones.includes(id))throw new AtlasError('Record is unavailable.');
  if(!ESSENTIAL_ACTIONS.has(action))throw new AtlasError('Unsupported evidence operation.');
  // Idempotent: repeating an access change must not grow the audit log or invalidate approvals again.
  // With deletion tombstoned, essential audit events are bounded to three per record.
  if(action==='revoke'){if(r.roles.length===1&&r.roles[0]==='steward')throw new AtlasError('Record is already restricted.');r.roles=['steward'];r.policyVersion++;}
  else if(action==='retire'){if(r.status==='retired')throw new AtlasError('Record is already retired.');r.status='retired';}
  else {r.status='deleted';r.revisions=[];r.title='Deleted evidence';r.aliases=[];r.sourceRef='';r.owner='';r.roles=['steward'];s.tombstones.push(id);scrubReferences(s,id);}
  s.index.ids=s.index.ids.filter(x=>s.records.some(r=>r.id===x&&r.status==='approved')&&!s.tombstones.includes(x));addAudit(s,`evidence.${action}`,id,actor);
}
export async function reviseRecord(s:State,role:Role,id:string,text:string,actor:string) {
  if(role!=='steward')throw new AtlasError('Steward simulation is required for evidence changes.');
  const r=s.records.find(x=>x.id===id);if(!r||!canRead(r,role)||s.tombstones.includes(id)||r.status!=='approved')throw new AtlasError('An approved record is unavailable for revision.');
  const hash=await hashText(text);
  // Identical content is not a new revision; publishing it would needlessly invalidate relationships and approvals.
  if(hash===current(r).hash)throw new AtlasError('Revision is identical to the current text.');
  assertAuditCapacity(s,'evidence.revised');
  const at=new Date().toISOString();r.revisions.push({version:current(r).version+1,text,recordedAt:at,validFrom:at.slice(0,10),hash});addAudit(s,'evidence.revised',r.id,actor);
}
export function rebuild(s:State,role:Role,actor:string) {if(role!=='steward')throw new AtlasError('Steward simulation is required to rebuild.');assertAuditCapacity(s,'index.rebuilt');s.index={generation:s.index.generation+1,builtAt:new Date().toISOString(),ids:s.records.filter(r=>r.status==='approved'&&!s.tombstones.includes(r.id)).map(r=>r.id)};addAudit(s,'index.rebuilt',String(s.index.generation),actor);}
export function transitionRun(s:State,role:Role,id:string,stage:string,note:string,actor:string){
  const run=s.runs.find(x=>x.id===id);if(!run||!runVisible(s,run,role))throw new AtlasError('Investigation is unavailable.');
  const last=run.transitions.at(-1)!.stage;
  const allowed:Record<string,string[]>={contextualized:['proposed'],proposed:['approved','rejected'],approved:['measured'],measured:[],rejected:[]};
  if(!allowed[last]?.includes(stage))throw new AtlasError('This transition is not valid from the current stage.');
  if(['approved','rejected'].includes(stage)&&role!=='steward')throw new AtlasError('Steward simulation is required for approval.');
  if(!run.citations.length)throw new AtlasError('An investigation needs approved evidence before a proposal.');
  if(stage==='approved'&&(staleEvidence(s,run).length||relationsChanged(s,run,role)))throw new AtlasError('Evidence, relationships, or access policy changed. Run a fresh investigation before approval.');
  assertAuditCapacity(s,`investigation.${stage}`);
  run.transitions.push({stage,at:new Date().toISOString(),actor,note});addAudit(s,`investigation.${stage}`,id,actor);
}
/** Bring a persisted snapshot to the current schema without discarding user records, runs, or decisions. */
export function upgradeState(s:State):State {
  if(s.schemaVersion>=SCHEMA_VERSION)return s;
  s.tombstones??=[];s.runs??=[];s.audit??=[];s.evaluations??=[];
  // Schema 1 deletions scrubbed cited text but left graph references and relationships behind.
  for(const id of s.tombstones)scrubReferences(s,id);
  s.schemaVersion=SCHEMA_VERSION;return s;
}
export function evaluate():Evaluation {
  const start=performance.now();const s=seedState();const checks:Evaluation['checks']=[];
  const check=(name:string,test:()=>boolean,detail:string)=>{try{checks.push({name,passed:test(),detail});}catch{checks.push({name,passed:false,detail});}};
  check('Exact metric retrieval',()=>retrieve(s,'analyst','Takt time','keyword').citations[0]?.id==='m_takt','The approved metric is the first result.');
  check('Alias expansion',()=>retrieve(s,'analyst','fpy','context').citations.some(c=>c.id==='m_fpy'),'An acronym resolves to its certified definition.');
  check('Restricted content',()=>!retrieve(s,'analyst','P-123 failed inspection','graph').citations.some(c=>c.id==='test_123')&&retrieve(s,'engineer','P-123 failed inspection','graph').citations.some(c=>c.id==='test_123'),'Engineering-only evidence is excluded for an analyst and found for an engineer.');
  check('Graph permission boundary',()=>!neighborhood(s,'analyst','m_fpy',3).includes('f_inspect'),'A traversal cannot introduce a restricted endpoint.');
  check('Provisional claims excluded',()=>!retrieve(s,'engineer','yield rework','graph').citations.some(c=>c.id==='d_draft'),'The conflicting unapproved proposal is not evidence.');
  check('Directed change impact',()=>downstreamImpact(s,'analyst','f_demand').some(r=>r.id==='a_capacity'),'An upstream fact reaches the consuming app through its model and metric.');
  check('Impact is not limited to citations',()=>{const t=structuredClone(s);return createRun(t,'analyst','What is affected if fct_shift_demand changes?','graph','test').impactIds.includes('a_capacity');},'A saved investigation reports dependents that were not among its retrieved extracts.');
  const revoke=structuredClone(s);mutateRecord(revoke,'steward','d_takt','revoke','test');
  check('Revocation takes effect',()=>!retrieve(revoke,'analyst','production calendar policy','graph').citations.some(c=>c.id==='d_takt'),'A revoked record is absent from retrieval and graph expansion.');
  check('Saved references reauthorized',()=>{const t=structuredClone(s);const run=createRun(t,'analyst','Takt time','graph','test');const hidden=run.graphIds.find(id=>!run.evidenceIds.includes(id))!;mutateRecord(t,'steward',hidden,'revoke','test');return !JSON.stringify(viewState(t,'analyst').runs).includes(`"${hidden}"`);},'A context-only reference in a saved run disappears when access to it is revoked.');
  const del=structuredClone(s);mutateRecord(del,'steward','d_takt','delete','test');rebuild(del,'steward','test');
  check('No resurrection on rebuild',()=>!del.index.ids.includes('d_takt')&&!del.records.find(r=>r.id==='d_takt')!.revisions.length&&!del.edges.some(e=>e.evidenceId==='d_takt'||e.from==='d_takt'||e.to==='d_takt'),'A tombstone survives a full projection rebuild and its relationships are removed.');
  check('Empty-answer behavior',()=>retrieve(s,'analyst','xyzzzz-unknown','graph').citations.length===0,'Unknown questions abstain instead of inventing evidence.');
  check('Revocation at capacity',()=>{const t=structuredClone(s);while(t.audit.length<AUDIT_CAPACITY)t.audit.push({id:'f',action:'index.rebuilt',target:'f',actor:'test',at:''});mutateRecord(t,'steward','m_takt','revoke','test');return t.records.find(r=>r.id==='m_takt')!.roles.join()==='steward';},'A full audit log never blocks an access revocation.');
  const run=createRun(s,'engineer','first-pass yield','graph','test');
  check('Citation spans match',()=>run.citations.every(c=>current(s.records.find(r=>r.id===c.id)!).text.slice(c.start,c.end)===c.text),'Every excerpt is tied to a source revision and exact span.');
  check('Approval authority',()=>{transitionRun(s,'engineer',run.id,'proposed','Investigate first attempts','test');try{transitionRun(s,'engineer',run.id,'approved','Accept','test');return false;}catch{return true;}},'An engineer cannot approve in the steward scenario.');
  check('Relationship change blocks approval',()=>{const t=structuredClone(s);const r=createRun(t,'analyst','What is affected if fct_shift_demand changes?','graph','test');transitionRun(t,'analyst',r.id,'proposed','Review consumers','test');const app=t.records.find(x=>x.id==='a_capacity')!;app.revisions.push({...current(app),version:current(app).version+1,text:'Changed.'});try{transitionRun(t,'steward',r.id,'approved','Approve','test');return false;}catch{return true;}},'A changed relationship behind the impact claim requires a fresh investigation.');
  mutateRecord(s,'steward','m_fpy','revoke','test');
  check('Historical answer reauthorization',()=>!viewState(s,'analyst').runs.some(r=>r.id===run.id),'Previously saved content is checked against current access.');
  return {id:crypto.randomUUID(),at:new Date().toISOString(),checks,durationMs:Math.round((performance.now()-start)*100)/100};
}
