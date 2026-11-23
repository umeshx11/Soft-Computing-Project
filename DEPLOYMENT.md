# Deployment

FuzzyFlow Pro is a static site. The repository root contains the entry page and its JavaScript and CSS assets, so a build step is not required.

## GitHub Pages

1. Open the repository's **Settings → Pages** page.
2. Set the publishing source to **GitHub Actions**.
3. Push to `main`. The workflow uploads the repository root and deploys it.
4. Check the **Actions** tab for the deployment result and URL.

The site uses relative asset paths, so it works at the GitHub Pages project URL as well as at a domain root.

## Other static hosts

Set the publish directory to the repository root. There is no build or install command.

## Local preview

From the repository root, run:

```bash
python -m http.server 8000
```

Open <http://localhost:8000>.
