# Voice Key Website

Bilingual Astro marketing site deployed with Cloudflare Workers Static Assets at
`https://voicekey.buildwithais.com`. The light, responsive design emphasizes free
open-source software, local recognition and optional user-selected AI services.

## Structure

- `src/components/HomePage.astro`: Shared localized homepage, accessible scenario
  tabs, product illustration (not a recording), FAQs and release download links.
- `src/components/SiteHeader.astro`: Shared navigation with equivalent-page language switching.
- `src/layouts/BaseLayout.astro`: HTML shell, metadata, canonical and language links,
  homepage software structured data, footer and skip link. The 404 page is noindex.
- `src/content.ts`: Shared bilingual installation and privacy documentation.
- `src/pages/[...path].astro`: Human-readable documentation routes.
- `src/pages/[...document].md.ts`: Static Markdown versions from the same content.
- `src/styles/global.css`: Light design system, responsive layouts and reduced-motion support.
- `public/llms.txt`: Product facts, capability boundaries and documentation index for agents.
- `public/robots.txt` and `astro.config.mjs`: Crawl policy and localized HTML sitemap.

Homepages are `/` and `/zh/`. Guides are `/guide/` and `/zh/guide/`;
privacy pages are `/privacy/` and `/zh/privacy/`. Markdown versions use `.md`
instead of the final slash. Release links resolve through GitHub's latest release
page so unavailable or stale architecture-specific artifacts are not advertised.
There are no runtime third-party font requests, microphone access or analytics.

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
npm run deploy
```

Deployment builds the site and publishes through `wrangler.jsonc` to the existing
`voicekey-site` Worker and `voicekey.buildwithais.com/*` route. Verify English and
Chinese layouts, scenario tabs, FAQ disclosure, language links, downloads, 404,
metadata, sitemap and Markdown endpoints before publishing. Keep capability and
privacy claims synchronized with the app and `llms.txt`.
