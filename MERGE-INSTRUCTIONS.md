# Merge instructions

This ZIP is an integration patch, not a full copy of every file in your GitHub repository.

Copy the included `server1.js` and `package.json` over the corresponding files in the repository, and add the included `OMR-AutoChecker/`, `scripts/`, `.env.example`, `.gitignore`, and `README.md` files. If your repository already has a README or .gitignore, merge the relevant text instead of overwriting unrelated content.

The provided `server1.js` is based on the uploaded `server1.js` file with only the OMR licence dispatch and OMR static frontend mount added near startup. Compare it with your GitHub version before replacing it, because any changes made on GitHub after the uploaded copy are not included.

Run on Node.js >= 22.5. Install dependencies, configure `.env`, then `npm start`. OMR frontend: `/omr/`; OMR health: `/api/omr/health`; admin panel: `/admin`.

Do not run the optional standalone `server2.js` alongside the integrated `server1.js` in production. Verify the QR/UPI mismatch before accepting payments. This patch does not deploy the project to GitHub or hosting for you.
