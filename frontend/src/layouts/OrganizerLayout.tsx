import AppShell from "./AppShell";
import { getCurrentUser } from "../state/authSession";

export default function OrganizerLayout() {
  const user = getCurrentUser();

  return (
    <AppShell
      requiredRole="ORGANIZER"
      scrollRegionId="organizer-scroll-region"
      headerTitle={user?.clubName || "Chưa có thông tin CLB"}
      showGreeting
      contentMaxWidth="1240px"
    />
  );
}
