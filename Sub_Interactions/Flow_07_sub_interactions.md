# Flow_07 interaction sweep
## Interaction map
In app: Copy URL, I've added it, client rows (swipe Disconnect), Send a test draft, Connect another app, Disconnect all. Web: Continue with Apple, email, password, Sign in, Allow, Cancel. Notification: banner tap, Later, Review.
## Surface decisions
Connector lives inside the AI assistant settings page (one place for "AI"). OAuth must be web pages (opened by the AI app). Draft review reuses Flow 06 Review (one approval surface).
## Spawned surfaces
Disconnect all → dialog "Disconnect all AI apps? They won't see your schedule or send drafts until you connect again." (ASSUMED, destructive).
## Hidden states
AI app connected but Planner has no device push token (draft visible in Recent plans only); token refresh by client after 30 d expiry (reconnect needed); same client registered twice (separate rows by client id; name shown with "(2)"); MCP session resumption after server restart (stateless handlers; session id regenerated).
## Edge cases
AI calls propose_changes repeatedly (20/day cap → `rate_limited`); AI proposes changes for a term that ended; AI includes the Planner's email in titles (allowed, it's their text); client name spoofing ("Dialed Official") → consent shows redirect host too.
## Micro-interactions
Copy shows toast; client rows show last-used time ("Used 2 min ago").
## Motion and interruption
Consent cancelled → nothing stored; Planner revoking while AI mid-call → next call 401.
## Feedback and semantic haptics
Success on connect; warning on disconnect confirm.
## Gaps found
Consent/sign-in web pages and the Disconnect-all dialog are D-35 surfaces (prototype + owner approval before production UI).
