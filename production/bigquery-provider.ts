/** Server-only integration seam. Not enabled by the synthetic pilot.
 * getSession MUST resolve the caller at a trusted corporate auth boundary.
 * The delegated token's identity must have source-equivalent BigQuery RLS.
 * An identity string or a browser-selected demo persona is not authorization.
 */
export type AuthorizedSession = {subject:string;accessToken:string;policyEpoch:string};
export type QueryParameter={name:string;parameterType:unknown;parameterValue:unknown};
type QueryResult={jobComplete?:boolean;jobReference?:{jobId:string;location?:string};rows?:{f:{v:string}[]}[];pageToken?:string;errors?:unknown[];totalBytesProcessed?:string;totalBytesBilled?:string;cacheHit?:boolean};
export type BigQueryConfig={project:string;dataset:string;location:string;embeddingModel:string;dimensions:number;maximumBytesBilled:string};
export type RetrievedEvidence={evidence_id:string;revision:number;chunk_id:string;content:string;source_uri:string;content_hash:string;distance:number};
export class BigQueryProvider {
  private config:BigQueryConfig;
  private getSession:()=>Promise<AuthorizedSession>;
  private request:typeof fetch;
  constructor(config:BigQueryConfig,getSession:()=>Promise<AuthorizedSession>,request:typeof fetch=fetch){
    if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(config.project)||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(config.dataset)||!/^[a-zA-Z0-9-]+$/.test(config.location))throw new Error('Invalid BigQuery identifiers.');
    if(!Number.isInteger(config.dimensions)||config.dimensions<1||config.dimensions>4096||!/^\d+$/.test(config.maximumBytesBilled))throw new Error('Invalid query limits.');
    this.config=config;this.getSession=getSession;this.request=request;
  }
  async vectorSearch(vector:number[],topK=8){
    if(vector.length!==this.config.dimensions||vector.some(v=>!Number.isFinite(v))||!vector.some(v=>v!==0))throw new Error('Embedding must match the configured model dimension and be nonzero.');
    if(!Number.isInteger(topK)||topK<1||topK>20)throw new Error('topK must be between 1 and 20.');
    const session=await this.getSession();
    if(!session.subject||!session.accessToken||!session.policyEpoch)throw new Error('A verified delegated session and current authorization epoch are required.');
    const table=`${this.config.project}.${this.config.dataset}`;
    // RLS on BOTH underlying tables is a production prerequisite. This join
    // additionally checks current revision and deletion state. Selective filters
    // can underfill top-k or force brute force; benchmark and measure recall.
    const sql=`SELECT TO_JSON_STRING(STRUCT(
      hit.base.evidence_id AS evidence_id, hit.base.revision AS revision,
      hit.base.chunk_id AS chunk_id, hit.base.content AS content,
      d.source_uri AS source_uri, hit.base.content_hash AS content_hash,
      hit.distance AS distance)) AS result
    FROM VECTOR_SEARCH(
      (SELECT evidence_id, revision, chunk_id, content, content_hash, embedding
       FROM \`${table}.chunks\`
       WHERE status = 'approved' AND is_current = TRUE AND embedding_model = @model),
      'embedding', (SELECT @vector AS embedding),
      top_k => @top_k, distance_type => 'COSINE') AS hit
    JOIN \`${table}.evidence_current\` AS d
      ON d.evidence_id = hit.base.evidence_id AND d.revision = hit.base.revision
    WHERE d.status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM \`${table}.tombstones\` AS t WHERE t.evidence_id = d.evidence_id)
    ORDER BY hit.distance ASC`;
    const params:QueryParameter[]=[{name:'model',parameterType:{type:'STRING'},parameterValue:{value:this.config.embeddingModel}},{name:'vector',parameterType:{type:'ARRAY',arrayType:{type:'FLOAT64'}},parameterValue:{arrayValues:vector.map(v=>({value:String(v)}))}},{name:'top_k',parameterType:{type:'INT64'},parameterValue:{value:String(topK)}}];
    const base=`https://bigquery.googleapis.com/bigquery/v2/projects/${this.config.project}`;
    const headers={Authorization:`Bearer ${session.accessToken}`,'Content-Type':'application/json'};
    const signal=AbortSignal.timeout(20000);
    const send=async(url:string,init:RequestInit)=>{const r=await this.request(url,{...init,headers,signal});if(!r.ok)throw new Error(`BigQuery request failed (${r.status}).`);const result=await r.json() as QueryResult;if(result.errors?.length)throw new Error('BigQuery rejected the retrieval query.');return result;};
    let result=await send(`${base}/queries`,{method:'POST',body:JSON.stringify({query:sql,useLegacySql:false,location:this.config.location,parameterMode:'NAMED',queryParameters:params,maximumBytesBilled:this.config.maximumBytesBilled,maxResults:20,timeoutMs:1000,useQueryCache:false,requestId:crypto.randomUUID()})});
    const job=result.jobReference;let polls=0;
    while(!result.jobComplete&&job&&polls++<8){result=await send(`${base}/queries/${encodeURIComponent(job.jobId)}?location=${encodeURIComponent(job.location||this.config.location)}&timeoutMs=1000&maxResults=20`,{method:'GET'});}
    if(!result.jobComplete||result.pageToken)throw new Error('Retrieval did not return a complete result within its bounded request. No partial answer was published.');
    const evidence=(result.rows??[]).map(row=>JSON.parse(row.f[0].v) as RetrievedEvidence);
    return {evidence,principal:session.subject,policyEpoch:session.policyEpoch,jobId:job?.jobId??null,bytesProcessed:result.totalBytesProcessed??null,bytesBilled:result.totalBytesBilled??null};
  }
}
