# Deployment

The app is static files in `dist/`. Every option below runs the same tests and build. Replace `<user>`, `<repo>` and `<project>` with your own names.

The **base path** matters only when the site lives in a sub-folder. Set it with the `BASE_PATH` environment variable at build time. It defaults to `/`.

| Host | Base path | SPA deep links handled by |
| --- | --- | --- |
| GitHub Pages (project site) | `/<repo>/` (set automatically by the workflow) | `404.html` copy of the app (`SPA_404=1`) |
| Netlify | `/` | `netlify.toml` redirect `/* → /index.html 200` |
| Vercel | `/` | `vercel.json` rewrite |
| Cloudflare Pages | `/` | Built-in SPA mode (there is no `404.html` in the output) |
| Docker / nginx | `/` (or `--build-arg BASE_PATH=/sub/`) | `try_files … /index.html` in `docker/nginx.conf` |

Security headers (CSP allowing only this site and `archive-api.open-meteo.com`, no-referrer, nosniff) are set in `netlify.toml`, `vercel.json`, `public/_headers` (Cloudflare and Netlify) and `docker/nginx.conf`. GitHub Pages cannot set headers.

---

## 1. GitHub Pages (GitHub Actions)

1. Create a GitHub repository, for example `grassland-assistant`, and push this folder to its `main` branch:
   ```bash
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
2. On GitHub, open **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. The workflow `.github/workflows/deploy-pages.yml` runs on every push to `main`: `npm ci`, `npm test`, then `npm run build` with `BASE_PATH=/<repo>/` and `SPA_404=1`. Follow it in the **Actions** tab. Re-run it by hand with **Run workflow**.
4. When it finishes, the URL appears on the deploy job and in Settings → Pages.

**URL:** `https://<user>.github.io/<repo>/`

If the repository is named `<user>.github.io` (a user site), change `BASE_PATH` in the workflow to `/`. The URL is then `https://<user>.github.io/`.

## 2. Netlify

**From Git:**
1. Sign in at app.netlify.com, choose **Add new site → Import an existing project**, and pick the repository.
2. Netlify reads `netlify.toml`: the build command is `npm run build`, the publish directory is `dist`, and Node is 22. Leave the fields as detected and click **Deploy**.

**Without Git (drag and drop):** run `npm run build` locally, then drag the `dist` folder onto app.netlify.com/drop. `netlify.toml` is not read this way, so add a `dist/_redirects` file containing `/*  /index.html  200` before you upload it.

**CLI:** `npx netlify-cli deploy --build --prod`

**URL:** `https://<site-name>.netlify.app` (rename it under Site configuration → Site details).

## 3. Vercel

1. Sign in at vercel.com and choose **Add New → Project**, then import the repository.
2. Vercel detects Vite and also reads `vercel.json` (build `npm run build`, output `dist`, SPA rewrite). Click **Deploy**.

**CLI:** `npx vercel` for a preview, `npx vercel --prod` for production.

**URL:** `https://<project>.vercel.app`. Preview deployments get `https://<project>-<hash>-<team>.vercel.app`.

## 4. Cloudflare Pages

1. In the Cloudflare dashboard, open **Workers & Pages → Create → Pages → Connect to Git** and pick the repository.
2. Build settings:
   - Framework preset: **Vite** (or None)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variable: `NODE_VERSION` = `22`
3. Click **Save and Deploy**. `public/_headers` is copied into the output and applied. Do **not** set `SPA_404`: Cloudflare serves `index.html` for unknown paths only when there is no `404.html`.

**CLI:** `npm run build && npx wrangler pages deploy dist --project-name <project>`

**URL:** `https://<project>.pages.dev`

## 5. Docker (any other host)

```bash
docker build -t grassland-assistant .
docker run --rm -p 8080:80 grassland-assistant
```

Open `http://localhost:8080`. The image runs the tests, builds the site, and serves it with nginx 1.27 (alpine), including the SPA fallback and security headers.

To serve it under a sub-path behind a reverse proxy:

```bash
docker build --build-arg BASE_PATH=/grassland/ -t grassland-assistant .
```

Make the proxy forward `/grassland/` to the container without stripping the prefix, or change `root`/`location` in `docker/nginx.conf` to match.

**URL:** `http://<host>:8080/`. Behind your proxy, `https://<your-domain>/` (or `/grassland/`).

---

## Checking a deployment

1. Open the URL in a private window. You should see the welcome screen.
2. Reload a deep link such as `<url>/report`. It should load the app, not a host error page.
3. Open the demo farm, then **Weather**. The chart should load. If it does not, check the browser console for a CSP error mentioning `archive-api.open-meteo.com`.
4. Build a report and download the PDF.
