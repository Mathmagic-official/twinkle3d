# Hi3D 3.0 project page

Static project page for Hi3D 3.0 / Twinkle 3D, with an interactive two-way image-to-3D
geometry comparison over 25 showcase cases.

## Preview locally

```bash
python3 -m http.server 8876
```

Open http://localhost:8876

## Deploying to GitHub Pages

The site lives at the repository root, so Pages can serve it directly:
**Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`**.

`.nojekyll` is present so Jekyll does not filter any asset paths.

## Assets

| Path | What it is |
| --- | --- |
| `assets/models_web/<case>/<method>.glb` | Geometry shown in the viewer: Draco meshes with textures stripped (~4 MB avg, down from ~12 MB) |
| `assets/previews/<case>/<method>.jpg` | Front-view stills used in the scan table and as loading posters |
| `assets/inputs_web`, `assets/thumbs` | Input images, resized for the viewer and the case strip |
| `assets/figures/web` | Figures from the technical write-up |
| `assets/draco` | Local Draco decoder for `DRACOLoader` |
| `assets/fonts` | Self-hosted webfonts, so the page needs no external font CDN |

Regenerate the stripped meshes with `_tools/strip_textures.py` after changing the case list
in `data/cases.json`. Method labels shown in the UI also come from `data/cases.json`.

## Pending assets

- Technical report: currently shows "coming soon".
- Video: set `VIDEO_URL` at the top of `js/app.js`. A page link renders a Watch button;
  an `.mp4`/`.webm`/`.mov` URL embeds a player instead.
