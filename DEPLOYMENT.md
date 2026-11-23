# Deployment guide

FuzzyFlow Pro is a static website. No server-side runtime or environment variables are needed to host it.

## Option 1 — Netlify (drag and drop)

1. Run `npm run build`.
2. Open the `dist/` folder.
3. Upload the contents of `dist/` to Netlify's manual deploy area.
4. Open the generated site URL and test the controller and learning sections.

The deploy folder must have `index.html` at its root and a sibling `src/` directory.

## Option 2 — Vercel

1. Push the complete source project to a Git repository.
2. Import the repository in Vercel.
3. Framework preset: **Other**.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Deploy.

The included `vercel.json` does not require any server function.

## Option 3 — GitHub Pages with Actions

1. Push this project to a GitHub repository using the `main` branch.
2. Open **Settings → Pages** in the repository.
3. Select **GitHub Actions** as the build and deployment source.
4. The included `.github/workflows/pages.yml` builds `dist/` and deploys it on pushes to `main`.
5. Wait for the workflow to finish, then open the Pages URL shown by GitHub.

For a repository named `username.github.io`, the root path is used. For a project repository, the generated site assets use relative paths (`./src/...`), so they can be served below the repository subpath.

## Option 4 — Local static hosting

Run:

```bash
npm run build
npm run dev
```

Then open `http://localhost:4173`.

## Deployment ZIP

The separate deployment archive contains the production site files at the archive root, plus a deployment README. Extract it and upload the extracted folder as a static site. Do not upload the complete source ZIP if your hosting workflow expects only the built website.

## Post-deployment smoke checklist

- The home page opens without a 404.
- `src/styles.css` loads.
- `src/app.js` and `src/engine.js` load.
- Controller sliders update the displayed values.
- Next stage advances the walkthrough.
- The hand calculation displays its computed PASS/FAIL result.
- The custom decision table can be applied and reset.
- A control-surface cell loads its input pair into the controller.
