# School-result-server + OMR Auto-Checker

The existing school application remains in place. OMR Auto-Checker is in `OMR-AutoChecker/` and its licensing API is mounted into the existing `server1.js` process, so the default setup uses one port.

## Start
1. Use Node.js 22.5 or newer.
2. Configure `.env` using `.env.example` (do not commit secrets).
3. Run `npm install`.
4. Run `npm start`.
5. Open `/omr/` on the same host/port. The OMR admin panel is `/admin`.
6. Create the OMR administrator once with `npm run omr:create-admin -- owner`.

The original `server1.js` school routes are retained. OMR licence API handling is mounted before JSON body parsing so its raw request-body parser continues to work.

Review `OMR-AutoChecker/README.md` before production deployment. Confirm UPI QR details, use HTTPS, persistent storage, strong secrets, and an authenticated admin account.
