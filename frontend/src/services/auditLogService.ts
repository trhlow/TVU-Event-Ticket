import { mockAuditLogs } from '../data/mockAuditLogs';
import { AuditLog } from '../types/audit';

export const auditLogService = {
  list(): AuditLog[] {
    return mockAuditLogs;
  },
};
