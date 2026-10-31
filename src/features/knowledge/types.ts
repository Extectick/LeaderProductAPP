export type KnowledgeStatus = 'QUEUED' | 'PROCESSING' | 'READY' | 'ERROR' | 'SKIPPED';
export type KnowledgeSection = 'COMPANY' | 'AI_WORKSPACE' | 'ARCHIVE' | 'OTHER';
export type KnowledgeView = 'pending' | 'published' | 'processing' | 'errors' | 'all';
export type KnowledgeVersion = { id: string; revision: number; status: KnowledgeStatus; errorCode: string | null; createdAt: string; extractedAt: string | null };
export type KnowledgeDocument = {
  id: string; sourceId: string; path: string; title: string; section: KnowledgeSection; size: number; mimeType: string;
  currentRevision: number; publishedRevision: number | null; publishedAt: string | null; deletedAt: string | null;
  allEmployees: boolean; allowedUserIds: number[]; allowedDepartmentIds: number[]; updatedAt: string; versions?: KnowledgeVersion[];
};
export type KnowledgeSource = { id: string; key: string; name: string; enabled: boolean; lastScanAt: string | null; lastSuccessAt: string | null; lastErrorCode: string | null; nextScanAt: string };
export type KnowledgePreview = { document: KnowledgeDocument; version: KnowledgeVersion & { text: string | null; path: string; sha256: string | null } };
export type KnowledgeAudit = { id: string; action: string; actorId: number | null; versionId: string | null; createdAt: string; detail: Record<string, unknown> };
export type AudienceItem = { id: number; name: string; description?: string };
export type KnowledgeAudience = { allEmployees: boolean; userIds: number[]; departmentIds: number[] };
export type KnowledgeListQuery = { view: KnowledgeView; section?: KnowledgeSection; q?: string; cursor?: string; deleted?: 'show' | 'hide' };
export type KnowledgeClient = {
  config(signal?: AbortSignal): Promise<{ canManage: boolean }>;
  sources(signal?: AbortSignal): Promise<KnowledgeSource[]>;
  documents(query: KnowledgeListQuery, signal?: AbortSignal): Promise<{ documents: KnowledgeDocument[]; nextCursor: string | null }>;
  document(id: string, signal?: AbortSignal): Promise<KnowledgeDocument>;
  preview(id: string, revision: number, signal?: AbortSignal): Promise<KnowledgePreview>;
  versions(id: string, before?: number, signal?: AbortSignal): Promise<{ versions: KnowledgeVersion[]; nextBefore: number | null }>;
  audit(id: string, signal?: AbortSignal): Promise<KnowledgeAudit[]>;
  audience(kind: 'user' | 'department', query: { q?: string; cursor?: number; ids?: number[] }, signal?: AbortSignal): Promise<{ items: AudienceItem[]; nextCursor: number | null }>;
  publish(id: string, versionId: string, audience: KnowledgeAudience): Promise<unknown>;
  revoke(id: string): Promise<unknown>;
  retry(id: string): Promise<unknown>;
  sync(id: string): Promise<unknown>;
};
