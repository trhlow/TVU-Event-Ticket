import { broadcastResponseToMainFrame } from "@azure/msal-browser/redirect-bridge";

// MSAL 5 popup flows communicate the authorization response back to the main application through
// this bridge. Keep this entry point isolated from React and routing so the URL fragment is preserved.
void broadcastResponseToMainFrame();
