# RenameRelocate 1.1.0

Fork of [RenameFile](https://discourse.stashapp.cc/t/renamefile/1334) (David Maisonave / Axter).

Same Title-field rename behavior, plus four extra plugin settings:

1. **Apply To Folder** — only scenes whose file lives under this path are processed.
2. **Destination Folder** — after rename, the file (and associated sidecars) are moved here.
3. **Rename Only (no relocate)** — rename in place and never move. Overrides Destination Folder while it is on.
4. **Filename Suffix Tag** — a variable string appended to the end of the new filename, before the extension.

## Setup

1. Install requirements: `pip install -r requirements.txt`
2. Copy the `RenameRelocate` folder into your Stash plugins directory.
3. Settings → Plugins → Reload Plugins.
4. Configure under Settings → Plugins → RenameRelocate:

| Setting | Example | Notes |
|---|---|---|
| Apply To Folder | `/media/stash/inbox` | Leave empty to apply to every scene |
| Destination Folder | `/media/stash/organized` | Leave empty to rename in place |
| Rename Only (no relocate) | off | On = rename in place, Destination Folder ignored |
| Enable Whole Library Task | off | Safety switch for the library-wide task |
| Filename Suffix Tag | `[Keep]` | Becomes `Title-Performer-[Keep].mp4` |
| Dry Run | on first | Logs only; no rename/move |

Destination folder should already be inside a Stash library path so the scan can pick the file back up.

## Usage

Open a scene whose file is under **Apply To Folder**, set **Title**, click **Save**. The hook runs, builds the new name from Key Fields, appends the suffix tag, then moves the file to **Destination Folder**.

With **Rename Only** enabled the file keeps its folder — only the filename changes, and Destination Folder is ignored (a log line notes this when both are set).

Associated files (`.srt`, `.funscript`, etc.) move with the same stem.

### Tasks

Settings → Tasks:

| Task | What it does |
|---|---|
| Rename Relocate Last Scene | Processes the most recently updated scene. |
| Rename Relocate Whole Library | Pages through every scene and applies the same rules. **Off by default** — it refuses to run until **Enable Whole Library Task** is turned on. |

The library task honours **Apply To Folder**, so scenes outside it are left alone. It logs one line per file it would change, a progress bar, and a `checked / renamed / failed` summary at the end. Scanning is deferred: instead of a scan per file it collects the folders it touched and scans them once at the end.

Turn on **Dry Run** and run the library task first. Read the log. Only then turn Dry Run off.

If the target filename already exists, ` (2)`, ` (3)`… is appended rather than overwriting the existing file. Advanced options live in `renamerelocate_settings.py`; the keys that are actually read are listed at the top of that file.

Enable **Dry Run** after any settings change and check `renamerelocate.log`.
