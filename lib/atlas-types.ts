export type Role = 'analyst' | 'engineer' | 'steward';
export type Mode = 'keyword' | 'context' | 'graph';
export type Kind = 'metric' | 'model' | 'app' | 'document' | 'decision' | 'test' | 'lot';
export type RecordStatus = 'approved' | 'provisional' | 'retired' | 'deleted';
export type Revision = {version: number; text: string; recordedAt: string; validFrom: string; hash: string};
export type EvidenceRecord = {id: string; title: string; kind: Kind; source: string; sourceRef: string; owner: string; status: RecordStatus; roles: Role[]; classification: string; aliases: string[]; revisions: Revision[]; policyVersion: number};
export type Edge = {id: string; from: string; to: string; relation: string; evidenceId: string; evidenceVersion: number};
export type Citation = {id: string; title: string; version: number; text: string; start: number; end: number; hash: string; sourceRef: string};
export type Transition = {stage: string; at: string; actor: string; note: string};
/** Why an impact result may not be the complete set of affected objects. */
export type ImpactLimit =
  | 'access-scope'          // computed only over evidence the persona can read
  | 'depth-limit'           // traversal stopped at the configured hop limit
  | 'stale-relationships'   // relationships whose supporting evidence changed were excluded
  | 'root-inferred';        // the starting object was the top search result, not a user choice
export type Impact = {rootId: string | null; rootSource: 'explicit' | 'top-ranked' | 'none'; candidates: string[]; ids: string[]; complete: boolean; limits: ImpactLimit[]};
export type RelationVersion = {id: string; evidenceId: string; evidenceVersion: number};
export type Candidate = {id: string; score: number; matched: string[]};
export type RetrievalConfig = {titleWeight: number; textWeight: number; aliasWeight: number; idWeight: number; maxRoots: number; contextRoots: number; contextDepth: number; maxCitations: number; impactDepth: number; impactRelations: string[]};
export type Run = {
  id: string; question: string; mode: Mode; role: Role; createdAt: string; citations: Citation[]; answer: string;
  evidenceIds: string[];
  /** Directed downstream dependents of impact.rootId. Not limited to citations. */
  impactIds: string[];
  /** Undirected neighbourhood used to assemble context. Not a dependency claim. */
  graphIds: string[];
  impact?: Impact;
  manifest: {engine: string; generator: string; indexGeneration: number; policyVersions: Record<string, number>; evidenceVersions: Record<string, number>; relations?: RelationVersion[]; candidates?: Candidate[]; config?: RetrievalConfig};
  transitions: Transition[];
  redacted?: boolean;
  /** View-only: cited evidence whose revision, policy, or status changed since the run. */
  staleEvidenceIds?: string[];
};
export type AuditEvent = {id: string; action: string; target: string; at: string; actor: string};
export type Check = {name: string; passed: boolean; detail: string};
export type Evaluation = {id: string; at: string; checks: Check[]; durationMs: number};
export type State = {schemaVersion: number; records: EvidenceRecord[]; edges: Edge[]; tombstones: string[]; index: {generation: number; builtAt: string; ids: string[]}; runs: Run[]; audit: AuditEvent[]; evaluations: Evaluation[]};
export type Snapshot = State & {revision: number; role: Role; user: string};
