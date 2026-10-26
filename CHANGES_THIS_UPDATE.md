# This update — "payment system not visible" fix

Cause: `license_3_2_2.js` hid the header button whenever `license-config.js` → `api` was empty (`p.hidden = !ON`), and there was no payment card anywhere on screen.

## Changed files (4)
| File | Change |
|---|---|
| `index.html` | New licence card at the top of the **Scan** screen (the screen the app opens on); header `🔑 License` button no longer ships `hidden`. |
| `license_3_2_2.js` | Header button always visible; card status line; card buttons wired; honest "server not configured" mode (payment details visible, submission/activation disabled, nothing stored or sent); "Check payment status / get my code" button on the Activate screen. |
| `style_3_2_2.css` | Card styles (desktop + phone layout), 44 px touch targets. |
| `license-config.js` | Comment only — states what an empty `api` means. |

## Unchanged
`app_3_2_2.js` (scanner), `server/*` (backend + admin panel), `assets/phonepe-payment-qr.png`, PDF generator files.
