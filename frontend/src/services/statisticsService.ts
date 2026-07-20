import { apiConfig, createUnsupportedApiError } from "./apiClient";

export const statisticsService = {
  // No GET /admin/statistics/* endpoint exists on the backend yet — see
  // backend/docs/BACKEND_SECURITY_REQUIREMENTS.md item 14. This throws rather than fabricating numbers
  // so callers can show an honest "waiting on backend" state instead of fake stats.
  async assertSupported(): Promise<void> {
    if (apiConfig.useDemoData) return;
    throw createUnsupportedApiError("thống kê toàn trường");
  },
};
