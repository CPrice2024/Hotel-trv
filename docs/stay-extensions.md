# Stay extensions and payment requests

An administrator opens an original confirmed, paid reservation, chooses a later checkout under **Stay extensions**, previews the availability and additional price, and sends the payment request. The request uses the existing guest email, room type, room quantity, and currency. Extra nights use the current room rate; the total stay is limited to 60 nights.

The extra nights are held in a linked reservation for 24 hours. The original paid reservation, payment reference, and receipt remain intact. The admin detail shows the effective confirmed checkout across paid extensions and lists each extension separately. Unpaid extensions do not change the confirmed checkout.

The guest receives an email with the extra dates, amount, hold expiry, and **Pay now** link. The signed link opens a details page. Its **Pay now** button opens Stripe for USD or Chapa for ETB. Starting checkout changes the payment window to 31 minutes. Existing provider verification confirms the extension and sends its confirmation/receipt. A browser redirect alone cannot mark the extension paid.

Only one pending extension is allowed per original reservation. The existing expiry job cancels unpaid holds and releases their inventory. An admin can open the linked pending reservation to cancel it, subject to the existing active-payment-session rule. Failed email delivery leaves the held request visible with a **Resend payment email** action, rather than silently creating another request. Late payments for cancelled holds retain the existing refund-review behavior.

This uses the existing `FRONTEND_URL`, `JWT_SECRET`, email delivery settings, Stripe configuration, and Chapa configuration. Email must be configured before an extension request can be created. No new provider credentials are needed. Legacy bookings do not need a data migration; the parent reference and extension metadata are optional/defaulted schema fields.

Validation: `npm test` covers extension dates, signed links, admin permissions, price checks, inventory preview, duplicate requests, request email delivery/retry, expired resend rejection, and guest detail retrieval. `npm run build` checks both applications. Route tests mock database operations and email delivery; they do not charge payment providers or send guest emails.
