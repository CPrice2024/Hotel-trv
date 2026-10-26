# GitHub, Render, and Vercel

Keep this npm workspace repository together. Deploy both services from the repository root.

## 1. GitHub

Push the repository to GitHub. `.env` files, generated builds, logs, and dependencies are ignored. Never upload `backend/.env` to GitHub.

## 2. Render backend

Create a Render Blueprint from the GitHub repository using `render.yaml`, or create a Node web service with:

- Root directory: leave blank (repository root).
- Build: `npm ci --include=dev && npm run build --workspace backend`
- Start: `npm start`
- Health check: `/api/health`
- Node.js: 22.x

Configure environment variables from `backend/.env.example` in Render's Environment settings. Use `NODE_ENV=production`. Keep credentials only in Render. Render supplies `PORT`.

Set `PUBLIC_API_URL` to the actual Render HTTPS origin, without a trailing slash. Set `FRONTEND_URL` to the Vercel production origin once available. Set Google, Chapa, Stripe, and email credentials only for the intended environment. Use test payment credentials for staging.

Allow the Render service's outbound addresses in MongoDB Atlas Network Access. The database must support transactions (a replica set). Confirm `/api/health` returns HTTP 200 and `database: connected`.

Production hides rooms marked `testOnly`. Use the admin dashboard to verify room inventory and rates and save real room entries before accepting bookings. Do not run the test seed in production.

## 3. Vercel frontend

Before importing, update the API rewrite destination in root `vercel.json` to the actual Render service origin. The supplied destination, `https://ayele-degu-hotel.onrender.com`, is the expected service name, not a verified deployed address.

Import the same GitHub repository. Keep Root Directory at the repository root (`.`). The checked-in `vercel.json` sets:

- Framework: Vite
- Install: `npm ci --include=dev`
- Build: `npm run build --workspace frontend`
- Output: `frontend/dist`

Set Vercel's `VITE_API_URL=/api` (or leave it unset). The `/api` rewrite proxies requests to Render, preserving same-origin staff session cookies. Do not set this to the Render URL unless you separately redesign cross-site session handling. Vercel also rewrites frontend routes to `index.html`, allowing direct visits and refreshes on `/booking`, `/admin`, and other routes.

The Google client ID is returned by the backend. Add the Vercel production origin to the OAuth client's authorized JavaScript origins. If you use `VITE_GOOGLE_CLIENT_ID`, use the same client ID as the backend.

After deployment, set Render's `FRONTEND_URL` to the Vercel production origin and redeploy the backend. Use the production Vercel URL for testing; preview origins are not automatically allowed by the backend CORS policy.

## 4. Hosted payment callbacks

In the same Stripe account and mode as the Render API key, create a webhook destination:

`https://<actual-render-host>/api/payments/stripe/webhook`

Select `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Put that destination's signing secret into Render's `STRIPE_WEBHOOK_SECRET`; do not reuse the local CLI listener secret.

Chapa callback and return URLs are built from `PUBLIC_API_URL`. Confirm this is the Render HTTPS origin, not localhost.

## 5. Verify the hosted app

1. Open `/api/health` through the Vercel URL to confirm its proxy reaches Render.
2. Visit and refresh `/rooms`, `/booking`, and `/admin` directly.
3. Sign in to the staff dashboard, refresh, and confirm the session persists.
4. Verify Google email sign-in on the Vercel origin.
5. Complete one booking per payment provider with test credentials. Verify payment status, inventory, callback delivery, and confirmation email.
6. Switch to live credentials only after verifying real room counts/rates and completing provider onboarding. Reconfigure the live Stripe webhook and its separate signing secret.

The local builds and unit tests do not validate hosted payment callbacks or email delivery.
