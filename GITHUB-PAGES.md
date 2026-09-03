# GitHub Pages deployment

This copy of Atlas Cube Coach includes `.github/workflows/deploy.yml`.

After the project files are in the root of a GitHub repository:

1. Open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open **Actions** and allow the `Deploy Atlas Cube Coach to GitHub Pages` workflow to finish.
4. The deployment will provide the HTTPS GitHub Pages address.

The workflow runs `npm install`, `npm run build`, then publishes the generated `dist` folder.
