# FuzzyFlow Pro

FuzzyFlow Pro is a browser based learning studio for exploring fuzzy logic controllers. It is a static site with no server side runtime, database, API key, package installation, or build step.

## Run locally

Serve the repository root over HTTP so the browser can load the JavaScript modules:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploy

The site files are ready to serve from the repository root. For GitHub Pages, enable **Settings → Pages → GitHub Actions**. The workflow in `.github/workflows/pages.yml` publishes the root files after pushes to `main`.

For another static host, publish the repository root as the site directory. No build command is needed.

## What's included

- `index.html` — page structure and controls
- `src/app.js` — interactive walkthrough, charts, and interface behavior
- `src/engine.js` — fuzzy controller calculations
- `src/styles.css` — responsive interface styles
- `DEPLOYMENT.md` — hosting instructions
