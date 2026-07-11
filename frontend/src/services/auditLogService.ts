import { mockAuditLogs } from "../data/mockAuditLogs";
import { AuditLog } from "../types/audit";
import { apiConfig, createUnsupportedApiError } from "./apiClient";

export const auditLogService = {
  list(): AuditLog[] {
    if (!apiConfig.useDemoData) throw createUnsupportedApiError("audit logs");
    return mockAuditLogs;
  },
  async listRemote(): Promise<AuditLog[]> {
    if (apiConfig.useDemoData || apiConfig.enableMockFallback) return mockAuditLogs;
    throw createUnsupportedApiError("audit logs");
  },
};
