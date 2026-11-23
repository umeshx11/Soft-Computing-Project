# FuzzyFlow Pro — Deployment Package

This is the static production build. The website entry point is `index.html` and the required application modules are in `src/`.

## Netlify
1. Extract this ZIP.
2. Drag the extracted folder (the one containing `index.html` and `src/`) into Netlify's manual deploy area.
3. Open the URL Netlify provides.

## Vercel
For Vercel, use the complete source project ZIP or its Git repository. Configure:
- Framework preset: Other
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

## GitHub Pages
Use the complete source project and push it to `main`. The included workflow builds and deploys `dist/` through GitHub Actions.

## Local preview
With Node.js 20+ and the complete source project, run `npm install`, `npm run build`, and `npm run dev`, then open http://localhost:4173.

No backend, API key, database, or environment variable is required.
