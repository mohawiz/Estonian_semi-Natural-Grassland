// GitHub Pages has no SPA rewrites: serving index.html as 404.html makes deep
// links (e.g. /<repo>/report) load the app, which then routes client-side.
// Only done when SPA_404=1 (set by the Pages workflow): Cloudflare Pages treats
// a missing 404.html as "SPA mode", so other hosts must not get this file.
import { copyFileSync, existsSync } from 'node:fs';
if (process.env.SPA_404 === '1' && existsSync('dist/index.html')) {
  copyFileSync('dist/index.html', 'dist/404.html');
  console.log('postbuild: wrote dist/404.html for GitHub Pages');
}
