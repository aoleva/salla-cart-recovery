# Salla cart recovery

## Deploy to Render

Use **New > Blueprint** in [Render](https://dashboard.render.com/), connect
`aoleva/salla-cart-recovery`, and select the `main` branch. The root `render.yaml`
creates a Node.js web service and a PostgreSQL database in Frankfurt.

**These are paid resources. Review the cost estimate before deploying.**
The recovery worker runs inside the web service and needs an always-on instance.
Render's free web service sleeps after 15 minutes without incoming requests;
its free database expires after 30 days. See
[Render's free plan limits](https://render.com/docs/free).

Enter these values in Render's Blueprint form (not in GitHub or chat):

- `SALLA_APP_ID`: the application ID from Salla Partners.
- `APP_ENCRYPTION_KEY`: a persistent 64-character hexadecimal key. For a new
  installation, generate it locally with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `WEBHOOK_SECRET`: the same secret configured for the Salla webhook.

Render generates `SESSION_SECRET` and `ADMIN_KEY` and connects `DATABASE_URL`
automatically. Read `ADMIN_KEY` from the service's Environment settings when
opening the admin page. Keep all secret values private.

This Blueprint creates a fresh database. If migrating an existing deployment,
preserve its database and encryption key so existing store tokens remain readable.

After the service is live, use its actual Render URL with these paths:

- `/health`: database and application health.
- `/salla/embedded`: embedded page URL in Salla Partners.
- `/webhook/salla`: Salla webhook URL.
- `/admin`: provision WhatsApp for a registered store.

Open the app from Salla to register the store, then open `/admin`, enter the
admin key, load and select the store, and save its UltraMsg Instance ID and token.
Return to Salla to scan the WhatsApp QR code.

## Merchant isolation and channel provisioning

Only the application operator provisions UltraMsg through `/admin`. Merchants
install the Salla app and scan their own WhatsApp QR; they never enter provider
credentials. Allocate a separate UltraMsg Instance to each merchant. Allocation
is manual in this version; creating provider instances automatically is not implemented.

Embedded login returns a signed eight-hour session scoped to the verified Salla
merchant. Each app launch stores it under a random context in sessionStorage;
dashboard API and QR requests use that token, not a shared cookie. After updating
from the cookie-based version, close and reopen the app from Salla. A directly
opened dashboard or API URL does not establish a merchant session.

New admin assignments validate provider credentials and reject an Instance that
is already assigned to another merchant, using a database transaction and lock.
Existing duplicate assignments are not deleted or migrated automatically. Audit
any channels previously assigned to multiple test stores before enabling recovery.

Run `npm test` for session-isolation and channel-conflict regression checks.
