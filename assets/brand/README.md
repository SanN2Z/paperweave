# 扇子 · Shanzi

The 0.2.3 mascot is a compact five-panel folding-fan spirit with a larger face, broad apricot ribs and a warm charcoal icon background. It replaces the detailed floral illustration that lost definition at taskbar sizes. This is original raster artwork made with the built-in imagegen tool on 2026-09-06, not a vector asset.

- `fan-sprite-master.png`: unmodified final generated square, intentionally opaque.
- `fan-sprite.png`: 512px Tauri export for the workbench, favicon and high-density launcher.
- `desktop-ui/fan-sprite.png`: identical 512px launcher copy.
- `src-tauri/icons/`: native ICO/ICNS and PNG exports generated with the Tauri icon CLI.

The initial edit simplified the former floral mascot into five large panels, large eyes and a compact body. Two transparent-background attempts returned baked checkerboard pixels; neither is shipped. The final icon deliberately uses a full-bleed charcoal background to preserve a strong silhouette on light and dark desktops. UI consumers round the square through CSS. Do not claim the master has alpha transparency.

Regenerate packaging with `npx tauri icon assets/brand/fan-sprite-master.png`, copy `src-tauri/icons/icon.png` into both 512px consumer paths, and run `powershell -NoProfile -File scripts/desktop-brand.ps1`. Inspect 22/32/48px previews as well as the large master before accepting a future replacement.

Final built-in generation prompt (the simplified fan from the first edit was the reference):

> Use case: logo-brand. Create the final production square desktop application icon, using the attached simplified fan spirit as the mascot. Keep the five-scallop ivory folding-fan body, large dark expressive eyes and tiny smile, apricot structural ribs, small mitten hands, two feet. Make the character refined, adorable and exceptionally readable at 32 pixels. Enlarge it to occupy 90 percent of the canvas width and 84 percent of its height, centered. One full-bleed solid deep warm charcoal background #302C2B filling the ENTIRE square from edge to edge, NO rounded corners, no checkerboard, no transparent area, no white border. Character surface is smooth warm porcelain ivory with restrained shallow enamel bevels, crisp warm apricot edge; elegant soft volume, precise silhouette, strong contrast. Simplify the eyes into clean dark espresso ovals with a single small highlight; no fussy ornament, floral patterns, paper grain, busy textures, fine wire lattice or excessive glossy shading. The five fan folds should be broad and quiet; the face is unmistakable. A premium original macOS-quality software identity, professionally balanced, understated and charming. Not a promotional mockup: ONLY the actual square icon artwork. No text, no watermark, no scene, no extra objects, no haze or bloom. This is a deliberately OPAQUE RGB full-bleed square app icon.
