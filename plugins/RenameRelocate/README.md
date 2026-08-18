# RenameRelocate 1.0.0

Fork of [RenameFile](https://discourse.stashapp.cc/t/renamefile/1334) (David Maisonave / Axter).

Same Title-field rename behavior, plus three extra plugin settings:

1. **Apply To Folder** — only scenes whose file lives under this path are processed.
2. **Destination Folder** — after rename, the file (and associated sidecars) are moved here.
3. **Filename Suffix Tag** — a variable string appended to the end of the new filename, before the extension.

## Setup

1. Install requirements: `pip install -r requirements.txt`
2. Copy the `RenameRelocate` folder into your Stash plugins directory.
3. Settings → Plugins → Reload Plugins.
4. Configure under Settings → Plugins → RenameRelocate:

| Setting | Example | Notes |
|---|---|---|
| Apply To Folder | `/media/stash/inbox` | Leave empty to apply to every scene |
| Destination Folder | `/media/stash/organized` | Leave empty to rename in place |
| Filename Suffix Tag | `[Keep]` | Becomes `Title-Performer-[Keep].mp4` |
| Dry Run | on first | Logs only; no rename/move |

Destination folder should already be inside a Stash library path so the scan can pick the file back up.

## Usage

Open a scene whose file is under **Apply To Folder**, set **Title**, click **Save**. The hook runs, builds the new name from Key Fields, appends the suffix tag, then moves the file to **Destination Folder**.

Associated files (`.srt`, `.funscript`, etc.) move with the same stem.

Enable **Dry Run** after any settings change and check `renamerelocate.log`.
