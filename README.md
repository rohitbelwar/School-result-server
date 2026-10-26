# OMR Auto-Checker — integrated licensing

The OMR frontend and licence API are now served by the existing `server1.js` process. This keeps the school-result server and OMR code in separate folders while using one HTTP port.

## Requirements
- Node.js >= 22.5 (the licensing backend uses built-in `node:sqlite`)
- Existing School-result-server dependencies installed (`npm install`)
- MongoDB configuration for the existing school server
- A writable persistent `DATA_DIR` for the OMR SQLite database and generated secrets

## Start
From the repository root:

```sh
npm install
npm start
```

Open the OMR app at `http://localhost:3000/omr/` (change the port if `PORT` is configured differently). The OMR health endpoint is `/api/omr/health`; the OMR admin panel is `/admin`.

Create the first OMR administrator once:

```sh
npm run omr:create-admin -- owner
```

You will be prompted for a password unless `ADMIN_PASSWORD` is set temporarily in the environment. Use a strong password and do not commit `.env`.

## Important deployment notes
- `server1.js` now dispatches only namespaced OMR routes (`/api/v1/*`, `/api/omr/*`, `/api/admin/*`, `/admin`, `/healthz`) to the OMR licence handler before Express body parsing. Existing school routes continue through their original middleware.
- Do not run `server2.js` alongside the integrated server in production. It remains only as an optional standalone/testing entry point and uses the same OMR data directory by default.
- Use HTTPS in production, set `ALLOWED_ORIGINS` to trusted frontend origins, and ensure `DATA_DIR` is persistent and backed up.
- Trial tracking is based on the browser installation/client identity. It is not proof of a unique school or device; a determined user can create another identity. For strict school-level anti-abuse, a verified school/account identity is needed.
- Verify that the UPI ID and the payee encoded in `assets/phonepe-payment-qr.png` match before accepting real payments. The provided config and QR have been noted as potentially inconsistent.
- Payment requests are not proof of payment. The admin must verify incoming funds in the payment/bank app before approving.

## API
- `GET /api/omr/health`
- Customer APIs: `/api/v1/*`
- Admin APIs: `/api/admin/*`
- Admin panel: `/admin`
