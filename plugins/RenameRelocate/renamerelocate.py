# RenameRelocate — Stash plugin
# Fork of RenameFile (David Maisonave / Axter)
# Title-field rename + apply-to folder + destination folder + suffix tag.

import hashlib
import json
import os
import shutil
import sys
import time
import traceback
from pathlib import Path

import stashapi.log as log
from stashapi.stashapp import StashInterface

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from renamerelocate_settings import config as ADVANCED
except Exception:  # advanced config file missing or broken — fall back to defaults
    ADVANCED = {}

DEFAULT_KEY_FIELDS = "title,performers,studio,tags"
DEFAULT_SEPARATOR = "-"
DEFAULT_ASSOCIATED_EXTS = [
    ".funscript", ".srt", ".vtt", ".scc", ".ttml", ".dfxp",
    ".lrc", ".cap", ".sami", ".stl", ".mcc", ".info", ".txt", ".xml",
]

ASSOCIATED_EXTS = ADVANCED.get("associated_files_to_rename") or DEFAULT_ASSOCIATED_EXTS
MAX_FILENAME_LENGTH = int(ADVANCED.get("max_filename_length") or 255)
EXCLUDE_TAGS = {t.lower() for t in (ADVANCED.get("excludeTags") or [])}
EXCLUDE_IGNORE_AUTO_TAGS = ADVANCED.get("excludeIgnoreAutoTags", True)
RENAME_ASSOCIATED = ADVANCED.get("rename_associated_files_enable", True)
PATH_TO_EXCLUDE = (ADVANCED.get("pathToExclude") or "").strip()

TRACE_ENABLED = False


def trace(message):
    if TRACE_ENABLED:
        log.debug(f"[RenameRelocate] {message}")


def read_input():
    raw = sys.stdin.read()
    return json.loads(raw) if raw else {}


def connect(json_input):
    server = json_input.get("server_connection") or {}
    stash = StashInterface(server)
    return stash


def plugin_settings(stash):
    plugins = (stash.get_configuration() or {}).get("plugins") or {}
    return plugins.get("renamerelocate") or {}


def normalize_path(p):
    if not p:
        return ""
    return os.path.normpath(os.path.abspath(os.path.expanduser(str(p))))


def path_is_under(file_path, folder):
    if not folder:
        return True
    file_path = normalize_path(file_path)
    folder = normalize_path(folder)
    try:
        return os.path.commonpath([file_path, folder]) == folder
    except ValueError:
        return False


def replace_illegal(name):
    for char in ['<', '>', ':', '"', '/', '\\', '|', '?', '*']:
        name = name.replace(char, "-")
    return name


def collapse_separator(name, separator):
    if not separator:
        return name
    doubled = separator + separator
    while doubled in name:
        name = name.replace(doubled, separator)
    return name.strip(separator + " ")


def join_names(items, title, include_existing):
    title_l = (title or "").lower()
    parts = []
    for item in items:
        name = (item or "").strip()
        if not name:
            continue
        if not include_existing and name.lower() in title_l:
            continue
        parts.append(name)
    return ", ".join(parts)


def form_filename(scene, settings):
    keys = settings.get("zfieldKeyList") or DEFAULT_KEY_FIELDS
    keys = [k.strip() for k in keys.replace(";", ",").replace(" ", "").split(",") if k.strip()]
    separator = settings.get("zseparators") or DEFAULT_SEPARATOR
    include_existing = bool(settings.get("z_keyFIeldsIncludeInFileName"))
    max_tags = settings.get("zmaximumTagKeys")
    max_tags = 12 if not max_tags else int(max_tags)
    suffix = (settings.get("filenameSuffix") or "").strip()

    title = scene.get("title") or Path(scene["files"][0]["path"]).stem
    files = scene.get("files") or [{}]
    file0 = files[0]
    parts = []

    for key in keys:
        if key == "title" and title:
            parts.append(title)
        elif key == "performers":
            names = join_names([p.get("name") for p in scene.get("performers") or []], title, include_existing)
            if names:
                parts.append(f"({names})")
        elif key == "studio":
            studio = (scene.get("studio") or {}).get("name")
            if studio and (include_existing or studio.lower() not in title.lower()):
                parts.append(studio)
        elif key == "tags":
            if max_tags == -1:
                continue
            names = []
            for tag in scene.get("tags") or []:
                name = tag.get("name")
                if not name:
                    continue
                if name.lower() in EXCLUDE_TAGS:
                    continue
                if EXCLUDE_IGNORE_AUTO_TAGS and tag.get("ignore_auto_tag"):
                    continue
                if not include_existing and name.lower() in title.lower():
                    continue
                names.append(name)
                if max_tags and len(names) >= max_tags:
                    break
            if names:
                parts.append(", ".join(names))
        elif key == "date" and scene.get("date"):
            if scene["date"] not in title:
                parts.append(scene["date"])
        elif key == "height" and file0.get("height"):
            parts.append(f"{file0['height']}P")
        elif key == "width" and file0.get("width"):
            parts.append(f"{file0['width']}W")
        elif key == "resolution" and file0.get("width") and file0.get("height"):
            parts.append(f"{file0['width']}x{file0['height']}P")
        elif key == "video_codec" and file0.get("video_codec"):
            parts.append(file0["video_codec"].upper())
        elif key == "frame_rate" and file0.get("frame_rate"):
            parts.append(f"{file0['frame_rate']}FPS")

    name = collapse_separator(separator.join([p for p in parts if p]), separator)
    if suffix:
        suffix = replace_illegal(suffix)
        if not name.endswith(suffix):
            name = f"{name}{separator}{suffix}"
    return replace_illegal(name).strip()


def truncate_stem(stem, ext):
    if len(stem) + len(ext) <= MAX_FILENAME_LENGTH:
        return stem
    digest = hashlib.md5(stem.encode()).hexdigest()[:8]
    keep = max(MAX_FILENAME_LENGTH - len(ext) - 9, 1)
    return stem[:keep] + "_" + digest


def unique_path(dest_dir, stem, ext, original):
    """Return a path in dest_dir that does not collide with a different existing file."""
    original_norm = normalize_path(original)
    candidate = dest_dir / f"{stem}{ext}"
    if not candidate.exists() or normalize_path(candidate) == original_norm:
        return candidate
    for n in range(2, 1000):
        numbered = truncate_stem(f"{stem} ({n})", ext)
        candidate = dest_dir / f"{numbered}{ext}"
        if not candidate.exists() or normalize_path(candidate) == original_norm:
            log.info(f"Target name already taken, using {candidate.name}")
            return candidate
    raise RuntimeError(f"Could not find a free filename for {stem}{ext} in {dest_dir}")


def associated_pairs(old_stem, new_stem):
    if not RENAME_ASSOCIATED:
        return []
    pairs = []
    for ext in ASSOCIATED_EXTS:
        src = old_stem + ext
        if os.path.isfile(src):
            pairs.append((src, new_stem + ext))
    return pairs


def move_associated(old_stem, new_stem):
    for src, dst in associated_pairs(old_stem, new_stem):
        log.info(f"Moving associated {src} -> {dst}")
        try:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.move(src, dst)
        except Exception as e:
            log.warning(f"Failed to move associated file {src}: {e}")


def rename_scene(stash, scene_id, settings):
    fragment = (
        "id title date performers {name} tags {id name ignore_auto_tag} "
        "studio {name} files {id path width height video_codec frame_rate}"
    )
    scene = stash.find_scene(scene_id, fragment)
    if not scene or not scene.get("files"):
        log.error(f"Scene {scene_id} not found or has no files.")
        return None

    original = scene["files"][0]["path"]
    apply_to = (settings.get("applyToFolder") or "").strip()
    rename_only = bool(settings.get("renameOnly"))
    dest_setting = (settings.get("destinationFolder") or "").strip()
    dry_run = bool(settings.get("zzdryRun"))
    rename_if_empty = bool(settings.get("yRenameEvenIfTitleEmpty"))

    if rename_only:
        if dest_setting:
            log.info("Rename Only is enabled — ignoring Destination Folder; the file stays where it is.")
        dest_folder = ""
    else:
        dest_folder = dest_setting

    trace(f"scene={scene_id} file={original} rename_only={rename_only} dest={dest_folder!r} dry_run={dry_run}")

    if apply_to and not path_is_under(original, apply_to):
        log.info(f"Skipping scene {scene_id}: not under Apply To Folder ({apply_to})")
        return None

    if PATH_TO_EXCLUDE and path_is_under(original, PATH_TO_EXCLUDE):
        log.info(f"Skipping scene {scene_id}: under pathToExclude ({PATH_TO_EXCLUDE})")
        return None

    if not scene.get("title") and not rename_if_empty:
        log.info("Nothing to do because title is empty.")
        return None

    if not os.path.isfile(original):
        log.error(f"File does not exist: {original}")
        return None

    src_dir = Path(original).parent
    stem = Path(original).stem
    ext = Path(original).suffix
    new_stem = truncate_stem(form_filename(scene, settings), ext)
    if not new_stem:
        log.error(f"Generated an empty filename for scene {scene_id}; leaving the file alone.")
        return None

    dest_dir = Path(normalize_path(dest_folder)) if dest_folder else src_dir
    same_dir = normalize_path(src_dir) == normalize_path(dest_dir)
    if same_dir and new_stem == stem:
        log.info(f"Name unchanged: {original}")
        return None

    if not dry_run:
        try:
            os.makedirs(dest_dir, exist_ok=True)
        except Exception as e:
            log.error(f"Cannot create destination folder {dest_dir}: {e}")
            return None

    try:
        new_path = unique_path(dest_dir, new_stem, ext, original)
    except RuntimeError as e:
        log.error(str(e))
        return None

    if normalize_path(new_path) == normalize_path(original):
        log.info(f"Name and folder unchanged: {original}")
        return None

    verb = "rename" if same_dir else "move"
    if dry_run:
        log.info(f"Would {verb} {original} -> {new_path}")
        for src, dst in associated_pairs(str(src_dir / stem), str(dest_dir / new_path.stem)):
            log.info(f"Would {verb} associated {src} -> {dst}")
        return str(new_path)

    log.info(f"{'Renaming' if same_dir else 'Moving'} {original} -> {new_path}")
    try:
        shutil.move(original, str(new_path))
    except Exception as e:
        log.error(f"Failed to {verb} {original} -> {new_path}: {e}")
        return None

    move_associated(str(src_dir / stem), str(dest_dir / new_path.stem))

    scan_paths = [src_dir.resolve().as_posix()]
    dest_posix = dest_dir.resolve().as_posix()
    if dest_posix not in scan_paths:
        scan_paths.append(dest_posix)
    for p in scan_paths:
        try:
            stash.metadata_scan(paths=[p])
        except Exception as e:
            log.warning(f"metadata_scan failed for {p}: {e}")
    time.sleep(2)
    return str(new_path)


def latest_scene_id(stash):
    try:
        result = stash.call_GQL(
            """
            query {
              findScenes(filter: {per_page: 1, sort: "updated_at", direction: DESC}) {
                scenes { id }
              }
            }
            """
        )
        scenes = ((result or {}).get("findScenes") or {}).get("scenes") or []
        if scenes:
            return scenes[0].get("id")
    except Exception as e:
        log.warning(f"Could not query the most recently updated scene: {e}")
    return None


def hook_scene_id(json_input):
    try:
        ctx = (((json_input.get("args") or {}).get("hookContext")) or {})
        return ctx.get("id")
    except Exception:
        return None


def main():
    global TRACE_ENABLED
    json_input = read_input()
    stash = connect(json_input)
    settings = plugin_settings(stash)
    TRACE_ENABLED = bool(settings.get("zzdebugTracing"))
    mode = ((json_input.get("args") or {}).get("mode")) or ""
    trace(f"mode={mode!r} settings={settings}")

    scene_id = hook_scene_id(json_input)
    if mode == "rename_files_task" or not scene_id:
        scene_id = scene_id or latest_scene_id(stash)
    if not scene_id:
        log.info("No scene to process.")
        return
    try:
        result = rename_scene(stash, scene_id, settings)
        if result:
            log.info(f"Done: {result}")
        else:
            log.info("No changes were made.")
    except Exception as e:
        log.error(f"RenameRelocate failed: {e}\n{traceback.format_exc()}")


if __name__ == "__main__":
    main()
