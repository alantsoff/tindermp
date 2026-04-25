# vendor/

Self-hosted third-party scripts to bypass user-side network blocks.

## telegram-web-app.js

Telegram WebApp SDK. Some user proxies/VPNs/ISPs block `telegram.org`, which
makes the SDK fail to load inside Telegram WebView and surfaces a misleading
"Запуск не из Telegram" error in the mini-app.

To refresh:

```bash
curl -fsSL https://telegram.org/js/telegram-web-app.js \
  -o apps/web/public/vendor/telegram-web-app.js
```

Run this:
- before the first deploy after adopting self-host (P0.10 in CURSOR_TASKS),
- once every ~3-6 months to pick up Telegram WebApp protocol updates.

The layout (`apps/web/app/m/layout.tsx`) loads this file FIRST, then the
official CDN as fallback. So even if this file is the placeholder commited
in the initial PR, the app keeps working — it just doesn't get the
proxy-bypass benefit until the file is refreshed for real.
