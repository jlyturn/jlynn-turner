# J'Lynn Turner, Portfolio

Personal portfolio: projects, experience, competitions, skills and resume.

## Files
- `index.html`: the page content
- `styles.css`: all styles, light and dark themes, one to three columns by screen width
- `app.js`: theme switch and the circuit background
- `fonts/`: Google Sans and Google Sans Flex (SIL Open Font License), self-hosted
- `_headers`: security headers (Netlify)
- `scripts/check.mjs`: the site check (see below)
- `netlify.toml`: tells Netlify to run the check and publish only `dist/`
- `.github/workflows/check.yml`: runs the check on GitHub on every push and pull request
- `JLynn_Turner_Resume.pdf`: resume

## Security
- No third-party requests: fonts and scripts are served from this site only.
- Strict Content-Security-Policy: scripts, styles and fonts load from this site only; no inline code.
- The page cannot be framed by other sites, and it never asks for camera, microphone or location.
- No forms, accounts, cookies, analytics or secrets. The theme choice is stored only on the visitor's device.

## Site check
Every push runs `node scripts/check.mjs` on GitHub, and Netlify runs it again before each deploy. If any check fails, nothing is published and the live site stays as it was. It checks for unexpected or missing files, broken links, anything loaded from other sites, inline code, unsafe links and script patterns, page basics (title, one heading, labels, alt text), the security headers, private details, and the page size. Run it yourself with `node scripts/check.mjs` (Node 22, nothing to install).

Static site, no framework. Deployed on Netlify from `dist/`.
