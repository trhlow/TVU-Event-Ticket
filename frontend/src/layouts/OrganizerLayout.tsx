import AppShell from "./AppShell";

export default function OrganizerLayout() {
  return (
    <AppShell
      requiredRole="ORGANIZER"
      scrollRegionId="organizer-scroll-region"
      showWorkspaceTitle={false}
      contentMaxWidth="1240px"
    />
  );
}
