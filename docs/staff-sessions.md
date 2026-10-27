# Staff sessions and activity

Administrators open **Sessions & activity** in the sidebar to review recent device sessions and successful staff management actions. Staff users cannot read or revoke sessions through these endpoints.

Each successful login creates an eight-hour database session bound to the signed, HTTP-only staff cookie. Every staff request checks the live account and the session's expiry and revocation state. Existing cookies without a session ID require a new login after deployment. Signing out revokes the database session as well as clearing the cookie. Administrators can sign out another device or sign out their own other sessions while preserving their current session.

The admin frontend sends a heartbeat every 30 seconds while open and returns to sign-in when the API reports an expired or revoked session. The session list shows browser, operating system, device category, sign-in time, last-seen time, last successful action, and the network address observed at sign-in. Browser details are estimates from User-Agent, and network addresses follow the application's existing trusted-proxy configuration. They do not identify an exact physical device or location. An active session is an unexpired, unrevoked credential; it can be idle.

Known successful management actions are recorded after the response completes: sign-in/out, room creation and edits, publication changes, reservation cancellation, extension payment requests and resend actions, staff account creation and access changes, and session revocation. Known read actions update the device's last action without adding an audit entry. Failed actions and arbitrary paths are not logged as successful actions. Request bodies, search strings, passwords, payment data, and tokens are excluded. Database audit-write failures are reported in server logs.

Session metadata expires 30 days after the session expiry. Activity entries expire after 90 days. MongoDB TTL cleanup is asynchronous. Historical activity from before deployment and direct database edits are not reconstructed or included in this application audit trail.

Validation includes authentication rejection for legacy, forged, expired, revoked and inactive-account sessions; live-role enforcement; administrator-only security access; scoped revocation of the actor's other sessions; rejection of current-session revocation through the device endpoint; and successful-action logging without sensitive request data. Tests use mocks, with no production account or session changes.
