# Moneta for iPhone

The phone version is a home-screen web app (PWA), so no Mac or Apple developer account is needed.
It uses the same screens and logic as the Windows app (`../windows/src`) with a phone layout; only the
platform layer is here (`src/webApi.ts`: storage in IndexedDB, prices through the Moneta cloud
service, files through the share sheet).

## Install on your iPhone

1. In the Windows app, open **Settings → Sync with your phone** and turn sync on.
2. Choose **Link a device**. Scan the QR code with the iPhone Camera, or open the address it shows in Safari.
3. In Safari, tap **Share → Add to Home Screen**.
4. Open Moneta from the Home Screen, choose **Link to Moneta on my computer** and type the code.

Both devices then stay in sync. Each change is encrypted on the device before it's uploaded.

## Notes

- iPhone web apps don't run in the background: prices, card auto-pay and the monthly snapshot update when you open the app.
- If Safari clears the app's storage, open it and link again; the synced copy is restored.

## Develop

```bash
npm install
npm run dev          # with `npx wrangler dev` running in ../cloud for /api
npm run build        # output in dist/, served by the cloud Worker
npm run icons        # re-render the icons (uses Electron from ../windows)
```
