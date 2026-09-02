# Voice Key Website

Astro static marketing site for Voice Key. It is published with Cloudflare Workers Static Assets at
`https://voicekey.buildwithais.com` and provides English and Chinese routes.

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
npm run deploy
```

`npm run deploy` builds the site, uploads the static assets, and updates the
`voicekey.buildwithais.com/*` Worker route from an authenticated workstation.

The version badge reads the root `package.json` version at build time, then checks
the latest GitHub release in the browser with a one-hour local cache.
