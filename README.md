# Ayele Degu International Hotel

Hotel website and booking application with a React/TypeScript frontend, Express/TypeScript API, and MongoDB.

## Requirements

- Node.js 20.19+ or 22.12+
- MongoDB Atlas (or another MongoDB replica set; booking inventory uses transactions)
- Chapa merchant credentials for ETB checkout
- Stripe account credentials for USD checkout
- SMTP account for booking confirmations and contact enquiries

## Local setup

1. Copy `backend/.env.example` to `backend/.env`; fill in a MongoDB Atlas connection string, a strong `JWT_SECRET`, and the first administrator's email and password.
2. Add the hotel email, phone, and full address. The address is used to build the Google Maps directions link.
   The in-site map pin defaults to the hotel coordinates (6.4083, 38.3104). Override them with `HOTEL_LATITUDE` and `HOTEL_LONGITUDE` if the hotel location changes.
3. Add Chapa, Stripe, and SMTP credentials. For Google sign-up, create a Google OAuth web client and set its client ID as `GOOGLE_CLIENT_ID` in `backend/.env` and `VITE_GOOGLE_CLIENT_ID` in `frontend/.env`. These IDs must match. Keep all secret keys in `.env` or deployment environment variables; never expose them as `VITE_` variables.
4. Install dependencies and start both workspaces:

   ```sh
   npm install
   npm run dev
   ```

   The Vite website runs at `http://localhost:5173`; the API runs at `http://localhost:4000`.
5. Sign in at `/admin` using `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Add room types and set their ETB and USD rates independently before accepting bookings.

### Get a MongoDB Atlas connection string

The app cannot generate a real Atlas URI until an Atlas project and database user exist. In MongoDB Atlas:

1. Create or select a project, then create a cluster (the free shared cluster is enough to begin).
2. In **Database Access**, create a database user. This is separate from your Atlas website login. Save the username and password privately.
3. In **Network Access**, add your current public IP address. Avoid `0.0.0.0/0` unless you intentionally accept access from every IP; add your production host's outbound IPs before deployment.
4. Open the cluster's **Connect → Drivers**, choose **Node.js**, and copy the `mongodb+srv://` connection string.
5. Replace the username/password placeholders, URL-encode special characters in the database password, and add the app database name. Put it only in `backend/.env`:

   ```text
   MONGODB_URI=mongodb+srv://<database-user>:<url-encoded-password>@<cluster-host>/ayele_hotel?retryWrites=true&w=majority&appName=<cluster-name>
   ```

   Do not send the real URI or password in chat, screenshots, source files, or frontend `VITE_` variables. `backend/.env` is ignored by Git.

6. Start the backend with `npm run dev`; `/api/health` reports database connection status. Atlas is a replica set, which the booking inventory transactions require.

The backend uses Mongoose's default connection pool settings because expected concurrent workload and Atlas tier are not known yet. Monitor Atlas **Metrics → Connections** and application latency as traffic grows before tuning pool sizes.

### Initial room data

`backend/data/rooms.json` contains the four room types and USD nightly rates publicly listed on [ayeledeguinthotel.com](https://ayeledeguinthotel.com/rooms.php): Standard ($40), Twin ($75), Deluxe ($65), and Suite ($85). It also includes paraphrased room details and links to the hotel's public room photos.

The live site does not publish room inventory counts or ETB rates. The current seed therefore uses one room per type as **test-only local inventory** and leaves ETB rates unset. The booking page marks these entries as test data, and production hides test-only entries. For Chapa bookings where no ETB rate is configured, the server locks the converted USD nightly rate using a validated live USD→ETB rate when creating the booking hold. Replace test inventory with verified counts and rates before enabling live bookings. The seed script refuses test-only room data when `NODE_ENV=production`.

To import the local test entries into the connected database, run:

```sh
npm run db:seed
```

The seed command upserts room types by name. For real inventory, update `backend/data/rooms.json` or create room types from the staff dashboard. ETB and USD prices remain separate; no currency conversion is applied.

The public Rooms page at `/rooms` lists configured room types, nightly rates, and a direct link to booking. The Services page at `/services` lists the hotel's facilities and guest services: restaurant (7:00 AM–10:00 PM), fitness center (6:00 AM–10:00 PM), spa (9:00 AM–8:00 PM), conference hall (up to 100 guests), airport shuttle (arrange 24 hours ahead), free secure parking, daily housekeeping, and 24/7 room service. Details were checked against the hotel's public site on 2026-10-23; verify prices, availability, and service terms with the hotel before launch.

Guest-facing room prices can be switched between USD and Birr. USD room rates and listed USD fees are converted using the latest USD→ETB rate supplied by the public ExchangeRate-API feed; the rate timestamp is shown and the data is refreshed hourly. Indicative conversions can differ from the final charge. Chapa uses a configured ETB rate where available; otherwise, its ETB total is calculated and locked using a validated server-side exchange rate when the booking hold is created. Stripe charges the configured USD rate.

The four room photos listed in `backend/data/rooms.json` have optimized WebP copies in `frontend/public/images/rooms`; the homepage and Rooms page use these local copies instead of downloading the original multi-megabyte JPEGs.

Guest-facing pages include an English/Amharic guided support chat for room types, listed prices, parking, and hotel services. It answers from the public room and hotel configuration, keeps chat history in the visitor's browser for up to 12 hours, and directs other questions to the configured hotel contact details. It is an automated FAQ, not a live staff or AI chat service.

## Staff workspace

`/admin` provides an authenticated operations workspace with separate pages for overview, rooms and rates, reservations, guest history, payments, reports, staff access, and published hotel configuration. Reservations and guests use server-side search and pagination. Reservation details include stay information, guest contacts, payment references, email delivery status, and eligible unpaid cancellation. CSV exports identify their scope: reservation exports contain the current filtered page; revenue exports contain the selected report period.

Administrators can create and edit room descriptions, photos, rates, active status, and test-data classification. Confirm real inventory and rates before clearing a room's test-data flag. Existing reservations preserve their booked prices. Capacity changes are rejected when inventory nights already exist; room edits and new holds serialize through the room record to prevent allocation races. Staff accounts can read operational data and cancel eligible unpaid reservations; only administrators can edit room details, create accounts, and suspend or restore staff access. Administrator accounts are protected from suspension in this interface.

Revenue reports use the reservation creation date in UTC and keep ETB and USD separate. They show recorded paid totals, not settlement balances or net revenue after refunds. Payment records cannot be manually marked paid, and the dashboard does not execute provider refunds. Hotel contact information and provider credentials continue to be managed through the deployment environment.

## Payments

- ETB bookings are routed through Chapa.
- USD bookings are routed through Stripe Checkout.
- Staff can enter separate nightly rates for ETB and USD. When the ETB rate is not set, Chapa uses a validated live USD→ETB rate at booking-hold creation and stores that rate with the booking.
- Google sign-up verifies the identity token and prefills the verified email and name for the current booking; it does not create a guest account. Set `GOOGLE_CLIENT_ID` in the backend. The booking page uses the public client ID returned by the backend, with `VITE_GOOGLE_CLIENT_ID` as a fallback. Add the website origin to the OAuth client's authorized JavaScript origins in Google Cloud.
- The booking price selector offers Auto, USD, and Birr. Auto follows the selected payment provider (Chapa in Birr, Stripe in USD); manual display currency choices do not change the checkout currency.
- Stripe is shown as available only when both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are configured. Configure the webhook endpoint as `https://<public-api-host>/api/payments/stripe/webhook` and subscribe to `checkout.session.completed`.
- Set `PUBLIC_API_URL` to the publicly reachable API origin so Chapa can call the payment callback and return endpoints.
- Use provider test keys and test-mode webhooks before enabling live payments. Restart the API after changing payment or Google OAuth environment settings.

## Email and directions

Configure either SMTP or Resend for email delivery:

- SMTP: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`.
- Resend: set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to an address on a domain verified in Resend; example placeholder domains will not deliver mail.

After payment is confirmed, the app emails the guest a complete reservation confirmation with the booking reference, guest and stay details, room count, nightly rate, total paid, payment method/reference, and configured hotel contact details. Contact-form enquiries also use the configured provider. Set `HOTEL_EMAIL` as the enquiries recipient and reply-to address. `HOTEL_ADDRESS` produces a Google Maps directions link; no location is assumed by the app.

## Production build

```sh
npm run build
npm start
```

The Express service serves the built frontend and API from one origin. `render.yaml` contains a Render web-service blueprint; add the private provider credentials and MongoDB URI in the Render dashboard before deployment.

## Important operational notes

- The first administrator is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` when the database has no user with that email. Passwords are Argon2id-hashed; staff sessions use an HTTP-only, SameSite cookie.
- Do not expose MongoDB or payment credentials in frontend code.
- Paid booking cancellation does not issue a refund. Process provider refunds manually before changing a paid reservation.
- Run end-to-end payment tests with provider test accounts before taking live reservations.
