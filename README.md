# datamori-io / stash-plugins

Personal Stash plugin source for a high-quality adult media library.

## Source URL

```
https://datamori-io.github.io/stash-plugins/main/index.yml
```

Add this URL in **Stash → Settings → Plugins → Available Plugins → Add Source**.

## Included Plugins

### 1. Modern Scene Cards (v0.5.0)
Orange / dark-grey modern scene cards.

- 16:9 (cinematic) thumbnail proportions
- Studio logo top-right
- Glass-style chips bottom-right: **Resolution**, **Codec**, **Duration**
- **Watched** badge top-left when play progress is over 25% of the scene duration
- Performer hover popup showing up to 3 other scenes by that performer

**Settings**

| Setting | Type | Description |
| --- | --- | --- |
| Show Watched badge (play progress over 25%) | Boolean | Toggles the Watched badge and its card highlight |

### 2. Auto Quality Tags (v0.2.1)
Creates and applies tags from file metadata across the whole library.

- Resolution tags: `4K` (≥2160p), `1440p`, `1080p`, `720p`, `480p`
- Codec tags: `HEVC` (h265), `H.264` (avc), `AV1`, `VP9`, `VP8`

**Tasks** (Settings → Tasks)

| Task | What it does |
| --- | --- |
| Apply Resolution & Codec Tags | Pages through all scenes and adds missing resolution + codec tags. Existing tags are left alone. |
| Replace outdated quality tags | Full library scan. Removes res/codec tags that no longer match the file, then applies the correct ones. All other tags are untouched. |

Both tasks accept `createMissing` (default `true`), `dryRun` (default `false`), `replaceOutdated`, and `pageSize` (default `100`, capped at `500`).

### 3. Library Health (v0.1.0)
Light visual indicators for missing dates / quality issues.

**Tasks**

| Task | What it does |
| --- | --- |
| Quick Library Health Check | Logs a summary of potential quality issues (missing covers, missing dates, unorganized scenes, etc.) |

### 4. RenameRelocate (v1.0.2)
Renames a scene file from the Title field, optionally appends a suffix tag, and moves it to a destination folder. Runs on `Scene.Update.Post`, or manually via the **Rename Relocate Last Scene** task.

**Settings**

| Setting | Type | Description |
| --- | --- | --- |
| Apply To Folder | String | Only process scenes whose file path is under this folder. Empty = all scenes. |
| Destination Folder | String | Move the file and its associated files here after renaming. Empty = leave in place. |
| Rename Only (no relocate) | Boolean | Rename in place and never move. Destination Folder is ignored while this is on. |
| Filename Suffix Tag | String | Appended to the end of the new filename, before the extension (e.g. `[Keep]`). |
| Empty Title Rename | Boolean | Rename/move even when the Title field is empty. |
| Include Existing Key Field | Boolean | Append performer, tags, studio, and gallery keys even if the name is already in the original filename. |
| Key Fields | String | Comma-separated fields in filename order. Default `title,performers,studio,tags`. |
| Max Tag Keys | Number | Maximum tag keys appended to the filename. `0` = default (12), `-1` = no tags. |
| Separator | String | Separator between filename parts. Default `-`. |
| Debug Tracing | Boolean | Extra logging to `RenameRelocate/renamerelocate.log`. |
| Dry Run | Boolean | Log what would happen without renaming or moving. **Enable this first after changing settings.** |

Requires Python packages: `stashapp-tools`, `requests`, `psutil`.

## License

AGPL-3.0
