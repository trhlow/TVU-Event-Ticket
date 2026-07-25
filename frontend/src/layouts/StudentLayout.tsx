import AppShell from "./AppShell";

export default function StudentLayout() {
  return (
    <AppShell
      requiredRole="SINH_VIEN"
      scrollRegionId="student-scroll-region"
      showWorkspaceTitle={false}
      contentMaxWidth="1240px"
    />
  );
}
