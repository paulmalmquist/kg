import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getChatGPTUser } from '../../chatgpt-auth';
import { initialize, viewState, createRun, mutateRecord, rebuild, transitionRun, evaluate, addAudit, hashText, canRead, current } from '../../../lib/atlas-engine';
import type {State} from '../../../lib/atlas-types';
export const dynamic='force-dynamic';
const roleSchema=z.enum(['analyst','engineer','steward']);
const inputSchema=z.object({action:z.enum(['search','revoke','retire','delete','rebuild','transition','evaluate','revise']),role:roleSchema,revision:z.number().int().positive(),id:z.string().max(100).optional(),question:z.string().trim().min(2).max(1000).optional(),mode:z.enum(['keyword','context','graph']).optional(),stage:z.enum(['proposed','approved','rejected','measured']).optional(),note:z.string().trim().min(3).max(6000).optional()}).strict();
const response=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
async function load(owner:string) {
  if(!env.DB)throw new Error('Workspace storage is unavailable.');
  let row=await env.DB.prepare('SELECT revision,state FROM atlas_workspaces WHERE owner_id = ?').bind(owner).first<{revision:number;state:string}>();
  if(!row){const initial=await initialize();await env.DB.prepare('INSERT OR IGNORE INTO atlas_workspaces(owner_id, revision, state) VALUES (?, 1, ?)').bind(owner,JSON.stringify(initial)).run();row=await env.DB.prepare('SELECT revision,state FROM atlas_workspaces WHERE owner_id = ?').bind(owner).first<{revision:number;state:string}>();}
  if(!row)throw new Error('Workspace storage is unavailable.');
  return {revision:row.revision,state:JSON.parse(row.state) as State};
}
export async function GET(req:Request) {
  const user=await getChatGPTUser();if(!user)return response({error:'Sign in to open your workspace.'},401);
  const parsed=roleSchema.safeParse(new URL(req.url).searchParams.get('role')||'analyst');if(!parsed.success)return response({error:'Unknown demo persona.'},400);
  try{const {state,revision}=await load(user.userId);return response({...viewState(state,parsed.data),revision,role:parsed.data,user:user.displayName});}catch{return response({error:'Could not load workspace storage. Please retry.'},503);}
}
export async function POST(req:Request) {
  const user=await getChatGPTUser();if(!user)return response({error:'Sign in to update your workspace.'},401);
  const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin)return response({error:'Invalid request origin.'},403);
  if(Number(req.headers.get('content-length')||0)>16000)return response({error:'Request is too large.'},413);
  let raw:string;try{raw=await req.text();}catch{return response({error:'Invalid request.'},400);}if(raw.length>16000)return response({error:'Request is too large.'},413);
  let parsed;try{parsed=inputSchema.safeParse(JSON.parse(raw));}catch{return response({error:'Invalid JSON.'},400);}if(!parsed.success)return response({error:'Invalid action parameters.'},400);
  const input=parsed.data;
  try{
    const {state,revision}=await load(user.userId);if(input.revision!==revision)return response({error:'Workspace changed in another tab. Refresh and retry.'},409);
    let runId:string|undefined;
    if(input.action==='search'){if(!input.question||!input.mode)return response({error:'Question and retrieval mode are required.'},400);runId=createRun(state,input.role,input.question,input.mode,user.userId).id;}
    else if(['revoke','retire','delete'].includes(input.action)){if(!input.id)return response({error:'Record ID required.'},400);mutateRecord(state,input.role,input.id,input.action,user.userId);}
    else if(input.action==='rebuild')rebuild(state,input.role,user.userId);
    else if(input.action==='transition'){if(!input.id||!input.stage||!input.note)return response({error:'Investigation, stage, and rationale are required.'},400);transitionRun(state,input.role,input.id,input.stage,input.note,user.userId);}
    else if(input.action==='revise'){
      if(input.role!=='steward')return response({error:'Steward simulation is required.'},403);
      const r=state.records.find(r=>r.id===input.id);if(!r||!canRead(r,input.role)||r.status!=='approved'||!input.note)return response({error:'An approved record and revised text are required.'},400);
      r.revisions.push({version:current(r).version+1,text:input.note,recordedAt:new Date().toISOString(),validFrom:new Date().toISOString().slice(0,10),hash:await hashText(input.note)});addAudit(state,'evidence.revised',r.id,user.userId);
    }else if(input.action==='evaluate'){state.evaluations.unshift(evaluate());state.evaluations=state.evaluations.slice(0,30);addAudit(state,'evaluation.completed',state.evaluations[0].id,user.userId);}
    if(!env.DB)throw new Error('Workspace storage is unavailable.');
    const result=await env.DB.prepare('UPDATE atlas_workspaces SET state = ?, revision = revision + 1 WHERE owner_id = ? AND revision = ?').bind(JSON.stringify(state),user.userId,revision).run();
    if(result.meta.changes!==1)return response({error:'Another change won the update. Refresh and retry.'},409);
    return response({snapshot:{...viewState(state,input.role),revision:revision+1,role:input.role,user:user.displayName},runId});
  }catch(error){return response({error:error instanceof Error?error.message:'Operation failed.'},400);}
}
