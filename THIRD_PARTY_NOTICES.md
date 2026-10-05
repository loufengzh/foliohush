# Third-party notices

Foliohush's original application code is MIT licensed. That license does not replace the licenses of its dependencies, icons, or bundled fonts.

The entries below were checked against the installed `package.json` and license files associated with this checkout's lockfile. Full license texts for the main editor/runtime/design dependencies are preserved in [docs/licenses](docs/licenses). Version numbers describe the packages inspected, not a promise to keep dependencies frozen forever.

The production build runs `scripts/prepare-notices.mjs` to concatenate this notice and the full preserved license texts into `public/THIRD_PARTY_NOTICES.txt`. Vite includes that file in `dist/`; retain it when distributing the static application and bundled fonts.

## Editor and UI foundations

| Project / package                                                                                                                            | Inspected version                     | License                                                              | Preserved notice                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tiptap: `@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-highlight`, `@tiptap/extension-placeholder`, `@tiptap/pm` | 3.31.4                                | MIT                                                                  | [Tiptap license](docs/licenses/tiptap-MIT.txt)                                                                                                   |
| ProseMirror, including `prosemirror-model`, `prosemirror-state`, `prosemirror-view`                                                          | 1.25.12 / 1.4.4 / 1.42.6 respectively | MIT                                                                  | [ProseMirror license](docs/licenses/prosemirror-MIT.txt), [Tiptap's ProseMirror notice and package list](docs/licenses/tiptap-pm-third-party.md) |
| React and React DOM                                                                                                                          | 19.3.0                                | MIT                                                                  | [React license](docs/licenses/react-MIT.txt)                                                                                                     |
| Vite                                                                                                                                         | 8.3.2                                 | MIT for Vite core; bundled dependencies retain their listed licenses | [Full installed Vite license file](docs/licenses/vite-LICENSE.md)                                                                                |
| `lucide-react`                                                                                                                               | 1.52.0                                | ISC; specified Feather-derived icons use MIT                         | [Full Lucide and Feather notices](docs/licenses/lucide-LICENSE.txt)                                                                              |

Upstream copyright notices in those files include:

- Tiptap: copyright (c) 2025, Tiptap GmbH.
- ProseMirror: copyright (C) 2015–2017 by Marijn Haverbeke and others, as provided in the installed license.
- React: copyright (c) Meta Platforms, Inc. and affiliates.
- Vite: copyright (c) 2019–present, VoidZero Inc. and Vite contributors.
- Lucide: copyright (c) 2026 Lucide Icons and Contributors. The included Feather notice credits copyright (c) 2013–present Cole Bemis.

Project websites: [Tiptap](https://tiptap.dev), [ProseMirror](https://prosemirror.net), [React](https://react.dev), [Vite](https://vite.dev), [Lucide](https://lucide.dev).

Tiptap and ProseMirror provide the rich-text engine and editing foundations. Their presence in the dependency tree does not imply that every upstream feature is exposed by Foliohush. For example, tables are not supported by this application's document format or UI even though Tiptap's ProseMirror package lists a table-related package.

## Bundled fonts

| Fontsource package              | Inspected version | License                               | Preserved notice                                                     |
| ------------------------------- | ----------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `@fontsource/dm-sans`           | 5.3.0             | SIL Open Font License 1.1 (`OFL-1.1`) | [DM Sans license](docs/licenses/dm-sans-OFL.txt)                     |
| `@fontsource/libre-caslon-text` | 5.3.0             | SIL Open Font License 1.1 (`OFL-1.1`) | [Libre Caslon Text license](docs/licenses/libre-caslon-text-OFL.txt) |

DM Sans credits the DM Sans Project Authors, copyright 2014. Libre Caslon Text credits the Libre Caslon Text Project Authors, copyright 2012. Full upstream statements, including their project references, are kept unchanged in the linked files. The fonts are packaged through [Fontsource's DM Sans](https://fontsource.org/fonts/dm-sans) and [Libre Caslon Text](https://fontsource.org/fonts/libre-caslon-text) distributions and served with the application rather than requested from a font CDN.

Font software remains under the OFL; the project's MIT license does not relicense it. Preserve its notices when redistributing the fonts and consult the full license for redistribution, modification, naming, and standalone-sale conditions. The OFL's font-license requirement does not apply to documents written using the fonts.

## Development tools and transitive packages

The project also uses TypeScript (inspected 7.0.2, Apache-2.0), Vitest (5.0.3, MIT for its core), and Playwright Test (1.63.0, Apache-2.0), along with Vite's React plugin, type definitions, and transitive dependencies. Their complete installed licenses remain in their respective packages. `package-lock.json` records the dependency graph and resolved versions.

This document highlights the application's main foundations and bundled visual assets; it is not a complete software bill of materials or legal audit of every transitive development tool. If redistributing dependency source, installed packages, or a production bundle, retain the applicable upstream notices and review the complete resolved dependency set. Do not assume this project's MIT license covers every file in `node_modules`.

## Project provenance and trademarks

The app shell, styling, document workflow, slash-command interface, validation/storage code, and export serializers are project code. They build on the libraries credited above. The repository does not claim authorship of React, Tiptap, ProseMirror, Lucide's icon artwork, or the bundled typefaces.

Foliohush is not affiliated with Medium. References to editorial or Medium-style writing describe the interaction and layout inspiration, not a copied engine, an official integration, or a trademark license.
