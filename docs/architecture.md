# Architecture and editor integration

Foliohush is a local-first React application. Its static public demo has no application server, authentication service, remote document store, analytics integration, or synchronization protocol. An optional self-hosted Node gateway enables explicitly requested AI calls with server-only credentials; it is not part of the public demo and does not provide document storage. See [AI_AGENT.md](AI_AGENT.md). `FolioEditor` is reusable source code within this repository; there is no published `foliohush` npm package or stable external package API.

## Source map

| File                          | Responsibility                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`                 | Workspace state, document selection, local-save status, app dialogs, persistent formatting controls, import/export downloads, snapshots, outline, focus mode |
| `src/editor/FolioEditor.tsx` | Tiptap instance, editable body, selection toolbar, slash-command menu, link dialog                                           |
| `src/AgentPanel.tsx`          | Assistant scope and mode controls, preview, consent, Apply/Reject, and responsive panel structure                             |
| `src/ThemePicker.tsx`         | Eight-theme picker and system-preference selection                                                                         |
| `src/lib/agent.ts`            | Offline/simulated suggestions, optional connected requests, and safe application                                            |
| `src/lib/themes.ts`           | Theme tokens and separately persisted appearance preferences                                                                |
| `server/`                    | Optional self-hosted AI gateway and gateway tests                                                                           |
| `src/lib/documents.ts`        | Versioned data types, validation, storage helpers, snapshots, import, HTML and Markdown serialization                        |
| `src/lib/sample.ts`           | Initial example document                                                                                                     |
| `src/lib/documents.test.ts`   | Document, storage, import/export, and safety-bound tests                                                                     |
| `src/main.tsx`                | React mount, locally bundled fonts, stylesheet imports                                                                       |
| `src/styles.css`              | Application layout, editor presentation, responsive behavior, print and reduced-motion rules                                 |
| `tests/`                      | Browser-level tests                                                                                                          |

Unit coverage lives in `src/lib/documents.test.ts`; jsdom integration coverage lives in `src/App.test.tsx` and `src/editor/FolioEditor.test.tsx`. The latter mounts the actual editor but supplies synthetic DOM geometry. See [verification.md](verification.md) for what these checks do and do not establish.

The data path is:

1. `loadWorkspace` reads and validates the stored workspace.
2. `App` owns a `Workspace` in React state.
3. A ProseMirror transaction filter validates document-changing transactions before they are committed. Unsupported changes are rejected and reported through `onRejectedEdit`; accepted content updates emit Tiptap JSON.
4. `updateDocument` validates and reconstructs the changed document.
5. The app compares current storage with its expected raw bytes and, where available, uses a Web Lock around the comparison and `saveWorkspace` call. A mismatch or storage error pauses saving.
6. Exports are generated locally and downloaded through a Blob URL.

## Reuse the editor

Copy or import the component source into a compatible React/TypeScript application. It depends on Tiptap React/Core, StarterKit, Highlight, Placeholder, ProseMirror state through `@tiptap/pm`, Lucide, and the `isSafeUrl` / `validateContent` helpers in `src/lib/documents.ts`. Use the dependency versions in this repository's lockfile as a tested starting point rather than mixing unrelated Tiptap versions.

The component does not store documents, create snapshots, export files, render a title, or provide the app-level block selector, persistent Bold/Italic controls, and undo/redo buttons. Those belong to `App` and the document helpers. The component does include its floating toolbar, slash commands, and link dialog.

### Props

```ts
import type { Editor, JSONContent } from '@tiptap/react'

export type FolioEditorProps = {
  initialContent: JSONContent
  onChange?: (content: JSONContent, editor: Editor) => void
  onReady?: (editor: Editor) => void
  onRejectedEdit?: (reason: string) => void
  editable?: boolean
  placeholder?: string
}
```

| Prop             | Behavior                                                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initialContent` | Initial Tiptap document JSON. Validate untrusted input before passing it in. This is not a controlled `value` prop.                                                     |
| `onChange`       | Receives `editor.getJSON()` and the current editor instance on a content update. The host owns persistence and error handling.                                          |
| `onReady`        | Receives the editor after creation. Use it for host controls or inspection; do not retain a destroyed instance after unmount.                                           |
| `onRejectedEdit` | Receives the validation reason when a document-changing transaction is rejected before commit. Show a concise notice; the rejected edit is not sent through `onChange`. |
| `editable`       | Defaults to `true`. Changes are applied with `editor.setEditable`. `false` is a UI mode, not a security or authorization boundary.                                      |
| `placeholder`    | Empty-paragraph placeholder configured when the editor is created. Remount to reliably change it.                                                                       |

`initialContent` initializes the instance; changing the prop alone does not replace the document. Use a distinct React `key` when switching documents or restoring a snapshot. This resets the editor and keeps undo history from crossing document boundaries. The app uses a document ID plus a restore epoch for this purpose.

### Minimal source integration

This example lives inside a project that has the repository's component and document helper sources at the indicated paths:

```tsx
import { useState } from 'react'
import { FolioEditor } from './editor/FolioEditor'
import { createDocument, updateDocument } from './lib/documents'
import './styles.css'

export function WritingSurface() {
  const [draft, setDraft] = useState(() => createDocument('New draft'))

  return (
    <FolioEditor
      key={draft.id}
      initialContent={draft.content}
      placeholder="Start with a sentence…"
      onChange={(content) => {
        setDraft((previous) => updateDocument(previous, { content }))
      }}
    />
  )
}
```

This example keeps the draft in memory only. Use `onRejectedEdit` to show rejected-edit feedback. Add a visible save/error state and your own persistence policy if you use it outside `App`. Catch validation failures at your application's input boundary. For data from a JSON backup, use `importDocument(raw)`; for arbitrary candidate editor JSON, use `validateContent(value)`.

### Styling and host requirements

`src/styles.css` contains both editor and application styles, including global rules for `body`, buttons, forms, and root colors. Importing the whole file is convenient for a standalone app but may affect an existing site's design. For an embedded editor, extract and scope the `.folio-editor`, `.bubble-toolbar`, `.slash-menu`, dialog, form-control, and loading styles, along with their required CSS variables and focus styles.

Font imports live in `src/main.tsx`, not the component. Bring those imports across or choose host fonts. Preserve font licenses if you redistribute the fonts. The UI assumes a browser DOM; `immediatelyRender: false` delays initial editor rendering but is not a complete server-rendering integration. Run it as a client component when using a server-rendered framework.

The component currently exposes no prop for custom extensions, menu commands, translation strings, CSS class names, or editor attributes. Adapt the source for those needs. Review keyboard behavior, dialog focus, mobile positioning, and screen-reader behavior in the host application; this repository does not claim an accessibility certification.

## Workspace layout

The application shell separates library navigation, writing controls, document content, and the assistant. The sidebar groups document search and the library; the top bar exposes labeled Assistant, Appearance, and Focus controls. The document toolbar keeps Bold and Italic available alongside the block selector and history controls, without replacing the editor's selection toolbar or shortcuts.

Primary controls target 44 px hit areas. Main interface text is 15–16 px, with an 18 px writing body. The document-title textarea follows its content height rather than reserving an oversized fixed block; it is remeasured when layout or content changes.

At widths of 1280 px and above, opening the assistant reserves space alongside the editor rather than covering the writing surface. On smaller screens it is an overlay; on phones it uses a near-full-screen sheet. The panel has a fixed close control and Apply/Reject action area with an independently scrolling inner region, so long previews do not push essential actions out of reach. Responsive layout rules live in `src/styles.css`; panel structure lives in `src/AgentPanel.tsx`.

These presentation changes retain all eight themes, local persistence, selection formatting, and the existing assistant modes. Offline formatting and explicitly simulated suggestions work without provider calls. Connected AI remains an opt-in, preview-and-consent flow for deployments with the optional gateway; the static public demo supplies only offline and simulated behavior.

## Document and workspace model

The persisted format is version 1:

```ts
interface Snapshot {
  id: string
  title: string
  content: JSONContent
  createdAt: string
  label: string
}

interface WritingDocument {
  id: string
  title: string
  content: JSONContent
  createdAt: string
  updatedAt: string
  snapshots: Snapshot[]
}

interface Workspace {
  version: 1
  activeDocumentId: string
  documents: WritingDocument[]
}
```

Dates are exact UTC ISO strings, such as `2026-10-05T07:00:00.000Z`. IDs contain only letters, digits, `_`, and `-`, up to 100 characters. Titles are limited to 200 characters; empty titles and spaces are preserved during editing, with UI fallbacks for untitled documents. JSON exports wrap one document in `{ format: 'foliohush', version: 1, document }`; the stored workspace is a different shape and is not an import file.

`importDocument` assigns a fresh document ID and creation/update timestamps, and regenerates snapshot IDs. Existing drafts are never selected for replacement using identity from an imported file. Snapshot content and historical snapshot timestamps are retained.

### Core helper API

| Function                                                    | Purpose                                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `validateContent(value)`                                    | Reconstruct allowed Tiptap JSON or throw `DocumentValidationError`.                                                |
| `validateDocument(value)` / `validateWorkspace(value)`      | Validate complete records, identity, dates, bounds, and relationships.                                             |
| `createDocument(title?, content?, now?, id?)`               | Create a validated draft with no snapshots.                                                                        |
| `createWorkspace(documents?)`                               | Create a validated workspace with the first document active.                                                       |
| `updateDocument(doc, patch, now?)`                          | Return a validated document with changed title/content and updated timestamp.                                      |
| `snapshotDocument(doc, label?, now?)`                       | Prepend a copy of the current title/content and retain at most 12 snapshots.                                       |
| `restoreSnapshot(doc, snapshotId, now?)`                    | Save the current draft as `Before restore`, then restore the selected snapshot's title/content.                    |
| `loadWorkspace(storage)`                                    | Return `ok`, `empty`, `corrupt`, or `unavailable`; corrupt results include the original raw string.                |
| `saveWorkspace(storage, workspace)`                         | Return `{ ok: true, raw }` or `{ ok: false, error }`; refuse to overwrite unreadable or incompatible stored data.  |
| `recoverWorkspace(storage, workspace)`                      | Explicit recovery helper that preserves old raw bytes before replacement. It is not exposed by the current app UI. |
| `serializeDocument(doc)` / `importDocument(raw, now?, id?)` | Write/read a bounded version 1 JSON document envelope.                                                             |
| `exportHtml(doc)` / `exportMarkdown(doc)`                   | Create a reading/publishing copy including the title; omit snapshots.                                              |
| `safeLink(value)` / `isSafeUrl(value)`                      | Canonicalize a permitted absolute URL, or check it without throwing.                                               |

Validation and export helpers may throw `DocumentValidationError`. Storage helpers report their errors as result objects. Successful `saveWorkspace` and `recoverWorkspace` calls return `{ ok: true, raw: string }`, where `raw` is the exact serialized value written. The app uses those returned bytes for expected-value tracking rather than rereading a value another writer might have replaced. `StorageLike` requires only `getItem` and `setItem`, so tests can use a memory-backed implementation without a browser.

### Validation boundaries

- Workspace: 1–50 documents, unique IDs, and an active ID that exists.
- Document: up to 12 snapshots; snapshot IDs must be unique within the document.
- Serialized workspace or JSON file: at most 4 MiB of UTF-8 data.
- Each content tree: nesting depth at most 32, no more than 20,000 nodes, at most 1,000,000 text characters overall and 500,000 per text node.
- Supported nodes: document, paragraph, heading levels 1–3, blockquote, bullet/ordered list, list item, code block, horizontal rule, text, and hard break.
- Ordered-list starts are integers from 0 through 1,000,000. The optional marker type is restricted to `1`, `a`, `A`, `i`, or `I`; missing/null means the default. JSON and HTML preserve these attributes, while Markdown emits numeric markers.
- Supported marks: bold, italic, strike, underline, code, highlight, and link. Underline is supported by the schema, although it has no button in the selection toolbar.
- Unknown properties, unsupported nodes/marks, invalid node relationships, cycles, repeated in-memory node objects, arbitrary styling, and unsupported attributes are rejected rather than passed through.
- Links permit `http:`, `https:`, and `mailto:` only. Relative links, embedded web credentials, whitespace/control characters, executable schemes, and encoded control characters are rejected. Accepted links are normalized and assigned safe relationship attributes.

The Tiptap schema, validator, serializers, and tests must evolve together. Adding an extension to the editor alone can produce content that the transaction filter or persistence layer rejects. Do not widen the validator to arbitrary HTML or attributes just to make a new extension pass.

## Storage and recovery behavior

The app stores the entire workspace under `foliohush.workspace.v1` using synchronous browser `localStorage`. Snapshot content is copied, not stored as a diff. This keeps the format readable but increases serialized size and write work as the workspace grows.

At startup, invalid stored data is preserved and the app opens a temporary starter workspace with saving blocked. Ordinary `saveWorkspace` also refuses to overwrite a corrupt or unknown-version value. `recoverWorkspace` is an explicit library-level escape hatch: it first saves the original bytes under `foliohush.workspace.v1.recovery`, refuses to replace a different previous recovery backup, and only then writes the replacement. It is not an automatic migration, a downloadable backup, or a transaction spanning both storage keys.

The app tracks `expectedRaw`, the exact workspace string it last read or saved. Immediately before writing, it compares the current stored value with those expected bytes and pauses on a mismatch. Where `navigator.locks` is available, a lock named after the workspace key serializes that comparison and write across cooperating tabs. Without Web Locks, the fallback is only an optimistic read/compare/write: the comparison and write are not atomic, so a concurrent-write race remains possible. The low-level `saveWorkspace` helper itself does not take a lock or an `expectedRaw` argument.

The app also observes `storage` events for the workspace key and storage-clear events. A conflict, storage failure, or lock failure pauses saves and asks the user to export; there is no automatic merge or retry guarantee. Unsaved state enables an emergency plain-text export, and the app requests a browser unload warning, which browsers may suppress. Browser storage clearing and eviction remain outside the app's control.

Switching the app's scheme, hostname, or port creates a different storage origin. Deployments and local development ports do not automatically share documents. There is no service worker, so offline reload availability is not guaranteed even though an already-loaded editor can work without network requests.

## Export contracts

- **JSON** is the restorable application format for one document and its snapshots. Imports regenerate identity, so it is content-preserving rather than a byte-identical identity round trip.
- **HTML** is a standalone, unstyled document. Text and attribute values are escaped; supported links are validated. It does not include the editor's stylesheet or fonts.
- **Markdown** uses a conservative serializer with escaping and variable-length code fences. Underline and highlight lose their appearance but keep the text; alphabetic/Roman list markers become numbers. Markdown renderer differences can affect the result. There is no Markdown parser/importer.

- **Emergency TXT** is shown in the Export dialog while the draft is unsaved. It takes the current title and `editor.getText()` (falling back to the stored in-memory content), without requiring the JSON serializer or a successful storage write. It contains no formatting, snapshots, or original corrupt storage bytes. It cannot recover an edit rejected before commit or be re-imported as a JSON document.

Treat HTML/Markdown/TXT as text recovery or interchange exports, not as complete workspace backups.

## Provenance

The application layout and styles, surrounding document library, slash-command interface, link workflow, local snapshot UX, validation/storage layer, and export serializers are project code. The editable document engine, schema extensions, selection handling, and undo infrastructure come from Tiptap and ProseMirror. The app does not claim to implement a new rich-text engine.

React supplies the UI runtime, Vite the build tooling, Lucide the icon shapes, and Fontsource the packaged DM Sans and Libre Caslon Text fonts. The welcome draft is repository sample content. Editorial writing interfaces are design inspiration; this is not a Medium product or a copy of Medium's source code, branding, or assets.

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for licenses verified from the installed packages and copies of the relevant license texts.

## Build-time license notices

`npm run build` first runs `scripts/prepare-notices.mjs`. It combines `THIRD_PARTY_NOTICES.md` and the full license files in `docs/licenses/` into `public/THIRD_PARTY_NOTICES.txt`, which Vite copies into the static build. Keep this notice file with the distributed application and bundled fonts. The generated file supplements the source notices; do not edit it instead of its inputs.
