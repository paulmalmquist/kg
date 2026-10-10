'use client';
import {useMemo,useState} from 'react';
import { Maximize2, Minus, Plus, Focus } from 'lucide-react';
import type {EvidenceRecord,Edge} from '../../lib/atlas-types';
const colors:Record<string,string>={metric:'#b79cff',model:'#74baff',app:'#57d7b0',document:'#e2c58e',decision:'#eb9ec7',test:'#f89c85',lot:'#8bcec8'};
export function connected(records:EvidenceRecord[],edges:Edge[],focus:string,depth=2){const seen=new Set([focus]);let frontier=[focus];for(let k=0;k<depth;k++){const next:string[]=[];for(const e of edges){if(frontier.includes(e.from)&&!seen.has(e.to)){seen.add(e.to);next.push(e.to);}if(frontier.includes(e.to)&&!seen.has(e.from)){seen.add(e.from);next.push(e.from);}}frontier=next;}return records.filter(r=>seen.has(r.id)&&r.status==='approved');}
export default function Graph({records,edges,focus,onSelect,onFocus}:{records:EvidenceRecord[];edges:Edge[];focus:string;onSelect:(id:string)=>void;onFocus:(id:string)=>void}){
  const [zoom,setZoom]=useState(1);
  const visible=useMemo(()=>connected(records,edges,focus),[records,edges,focus]);
  const nodes=useMemo(()=>{const rest=visible.filter(r=>r.id!==focus);return visible.map(r=>{if(r.id===focus)return {...r,x:400,y:245};const i=rest.findIndex(x=>x.id===r.id);const angle=(i/rest.length)*Math.PI*2-Math.PI/2;return {...r,x:400+Math.cos(angle)*285,y:245+Math.sin(angle)*173};});},[visible,focus]);
  const byId=new Map(nodes.map(n=>[n.id,n]));
  return <section className="graph-panel">
    <div className="panel-header"><div><span className="eyebrow">CONNECTED CONTEXT</span><h2>Follow the evidence</h2></div><span className="subtle">{nodes.length} objects · {edges.filter(e=>byId.has(e.from)&&byId.has(e.to)).length} relationships</span></div>
    <div className="graph-tools"><select aria-label="Focus graph on an object" value={focus} onChange={e=>{onFocus(e.target.value);setZoom(1);}}>{records.filter(r=>r.status==='approved').map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select><div className="zoom-tools"><button aria-label="Zoom out" onClick={()=>setZoom(z=>Math.max(.75,z-.15))}><Minus size={15}/></button><button aria-label="Reset zoom" onClick={()=>setZoom(1)}><Focus size={16}/></button><button aria-label="Zoom in" onClick={()=>setZoom(z=>Math.min(1.6,z+.15))}><Plus size={15}/></button></div></div>
    <svg className="constellation" viewBox="0 0 800 500" role="group" aria-label="Interactive knowledge graph. Select a node to inspect its evidence.">
      <defs><radialGradient id="nebula"><stop offset="0" stopColor="#8060ce" stopOpacity=".19"/><stop offset="1" stopColor="#8060ce" stopOpacity="0"/></radialGradient><filter id="glow"><feGaussianBlur stdDeviation="7"/></filter><marker id="arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#6c6687"/></marker></defs>
      <circle cx="400" cy="245" r="230" fill="url(#nebula)"/>
      {Array.from({length:68},(_,i)=><circle key={`s${i}`} cx={(i*173+37)%800} cy={(i*97+19)%500} r={i%7===0?1.2:.65} fill="#bcc1e1" opacity={.1+(i%4)*.08}/>)}
      <g transform={`translate(400 245) scale(${zoom}) translate(-400 -245)`}>
      <ellipse cx="400" cy="245" rx="285" ry="173" stroke="#595170" strokeDasharray="2 9" fill="none" opacity=".26"/>
      {edges.filter(e=>byId.has(e.from)&&byId.has(e.to)).map(e=>{const a=byId.get(e.from)!;const b=byId.get(e.to)!;return <g key={e.id}><path d={`M${a.x},${a.y} Q400,245 ${b.x},${b.y}`} fill="none" stroke={e.from===focus||e.to===focus?'#85729e':'#3e405a'} strokeWidth={e.from===focus||e.to===focus?1.3:.8} opacity=".6" markerEnd="url(#arrow)"/><title>{a.title} {e.relation} {b.title}</title></g>;})}
      {nodes.map(n=><g className="graph-node" role="button" tabIndex={0} aria-label={`Inspect ${n.title}`} key={n.id} transform={`translate(${n.x} ${n.y})`} onClick={()=>onSelect(n.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(n.id);}}}>
        <title>{n.title} · {n.kind} · {n.source}</title><circle r={n.id===focus?29:20} fill={colors[n.kind]} opacity=".10"/><circle r={n.id===focus?22:13} fill={colors[n.kind]} opacity=".15" filter="url(#glow)"/><circle r={n.id===focus?14:8} fill="#181726" stroke={colors[n.kind]} strokeWidth="1.4"/><circle r={n.id===focus?5:3} fill={colors[n.kind]}/>
        <text y={n.id===focus?42:29} textAnchor="middle" fill={n.id===focus?'#f0eaff':'#d1ccdf'} fontSize={n.id===focus?15:11} fontWeight={n.id===focus?600:400}>{n.title.length>27?n.title.slice(0,25)+'…':n.title}</text><text y={n.id===focus?59:43} textAnchor="middle" fill="#828099" fontSize="9" letterSpacing="1.1">{n.kind.toUpperCase()}</text>
      </g>)}
      </g>
    </svg>
    <div className="graph-footer"><div className="legend">{['metric','model','app','document','decision','test','lot'].filter(k=>nodes.some(n=>n.kind===k)).map(k=><span key={k}><i style={{background:colors[k]}}/>{k}</span>)}</div><span className="subtle"><Maximize2 size={12}/> Select any node</span></div>
  </section>;
}
