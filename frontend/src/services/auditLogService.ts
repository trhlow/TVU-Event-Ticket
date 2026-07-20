import { mockAuditLogs } from "../data/mockAuditLogs";
import { AuditLog } from "../types/audit";
import { apiConfig, apiRequest } from "./apiClient";

interface AuditLogResponse {
  id: string;
  actorId: string;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail: string | null;
  createdAt: string;
}

interface AuditLogPageResponse {
  content: AuditLogResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface AuditLogPage {
  items: AuditLog[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface AuditLogQuery {
  action?: string;
  page?: number;
  size?: number;
}

function mapAuditLog(response: AuditLogResponse): AuditLog {
  return {
    id: response.id,
    actorName: response.actorEmail || response.actorId,
    userName: response.actorEmail || response.actorId,
    action: response.action,
    target: `${response.targetType}:${response.targetId}`,
    result: response.detail || "",
    ipAddress: "",
    createdAt: response.createdAt,
  };
}

export const auditLogService = {
  async listRemote({ action, page = 0, size = 20 }: AuditLogQuery = {}): Promise<AuditLogPage> {
    if (apiConfig.useDemoData) {
      return {
        items: mockAuditLogs.slice(page * size, page * size + size),
        page,
        size,
        totalElements: mockAuditLogs.length,
        totalPages: Math.max(1, Math.ceil(mockAuditLogs.length / size)),
      };
    }
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (action) params.set("action", action);
    const response = await apiRequest<AuditLogPageResponse>(`/admin/audit-log?${params.toString()}`);
    return {
      items: response.content.map(mapAuditLog),
      page: response.page,
      size: response.size,
      totalElements: response.totalElements,
      totalPages: response.totalPages,
    };
  },
};
