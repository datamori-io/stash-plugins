# datamori-io / stash-plugins

Personal Stash plugin source for a high-quality adult media library.

## Source URL

```
https://datamori-io.github.io/stash-plugins/main/index.yml
```

Add this URL in **Stash → Settings → Plugins → Available Plugins → Add Source**.

## Included Plugins

### 1. Modern Scene Cards (v0.2)
Clean, modern scene cards inspired by ThePornDB.

- 16:9 (cinematic) thumbnail proportions
- Female-only performers shown on the card
- Glass-style **Resolution** + **Codec** badges
- Soft shadows, rounded corners, modern hover lift
- Settings for toggling features

### 2. Auto Quality Tags (v0.1)
Automatically creates and applies tags based on file metadata:

- Resolution tags: `4K`, `1440p`, `1080p`, `720p`…
- Codec tags: `HEVC`, `H.264`, `AV1`, `VP9`…

Run the task from **Tasks** page → “Apply Resolution & Codec Tags”.

### 3. Library Health (starter)
Light visual indicators for missing dates / quality issues.

### 4. RenameRelocate (v1.0.0)
Rename a scene from the Title field, append a suffix tag, and move the file to another folder.

- **Apply To Folder** — only process files under this path
- **Destination Folder** — relocate after rename
- **Filename Suffix Tag** — variable appended to the end of the filename

Requires Python packages: `stashapp-tools`, `requests`, `psutil`.

## License

AGPL-3.0
