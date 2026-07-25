import AppShell from "./AppShell";

export default function SuperAdminLayout() {
  return (
    <AppShell
      requiredRole="SUPER_ADMIN"
      scrollRegionId="admin-scroll-region"
      headerTitle="Tổng quan toàn trường"
      showWorkspaceTitle={false}
      contentMaxWidth="1280px"
    />
  );
}
