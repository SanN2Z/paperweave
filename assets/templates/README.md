# Shipped drawing templates

`catalog.json` is imported on first startup in every installation. The 11 assets ship with the product; users do not need the maintainer's local folders. Content hashes avoid duplicates across restarts. The library original is retained; “用这个模板绘图” creates an independent editable copy and sends its path to the CLI agent.

| Assets | Provenance and terms |
| --- | --- |
| Four SVG components | [tovacinni/cv-gfx-ml-icons](https://github.com/tovacinni/cv-gfx-ml-icons/tree/75bc108cd5777b96d702449d871e9067642c75b0), pinned commit; CC0-1.0. Original declaration included as `CC0-LICENSE.txt`. |
| Seven PPTX files in `contributed/` | Maintainer-contributed research drawing collection, supplied for inclusion with the product. Eight slides in total, containing native shapes/connectors and embedded images. Underlying illustrations and cited material remain attributable to their original authors. No blanket MIT/CC0 license is asserted for these contributed slides. Check in-slide attribution when reusing material. |

Paperweave's MIT code license does not relicense third-party assets. Editable PowerPoint does not mean that every embedded picture is a vector. Preserve original attribution when adapting a component.

## Additional author-shared conference templates

`sources.json` includes author-published CVPR/ECCV/NeurIPS PowerPoint posters from [Bolei Zhou's collection](https://github.com/zhoubolei/bolei_awesome_posters/tree/9bd06822873d8f23f4765a06e367f3813bf8397e). These are source references, not bundled binaries. The author allows using them as a starting point for one's own posters; the collection does not supply a separate open-source license. Retain authorship and paper sources. These are poster frameworks, not guaranteed model-component-only libraries.

An agent can download the chosen source with its regular network tools and call `import_template` with the absolute path, original URL and reuse statement. Do not present externally sourced template text or numbers as the user's scientific findings.
