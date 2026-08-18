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

DEFAULT_KEY_FIELDS = "title,performers,studio,tags"
DEFAULT_SEPARATOR = "-"
ASSOCIATED_EXTS = [
    ".funscript", ".srt", ".vtt", ".scc", ".ttml", ".dfxp",
    ".lrc", ".cap", ".sami", ".stl", ".mcc", ".info", ".txt", ".xml",
]


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
                if tag.get("ignore_auto_tag"):
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

    name = separator.join([p for p in parts if p]).replace(separator + separator, separator)
    if suffix:
        suffix = replace_illegal(suffix)
        if not name.endswith(suffix):
            name = f"{name}{separator}{suffix}"
    return replace_illegal(name)


def move_associated(old_stem, new_stem, dry_run):
    for ext in ASSOCIATED_EXTS:
        src = old_stem + ext
        if os.path.isfile(src):
            dst = new_stem + ext
            log.info(f"{'Would move' if dry_run else 'Moving'} associated {src} -> {dst}")
            if not dry_run:
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.move(src, dst)


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
    dest_folder = (settings.get("destinationFolder") or "").strip()
    dry_run = bool(settings.get("zzdryRun"))
    rename_if_empty = bool(settings.get("yRenameEvenIfTitleEmpty"))

    if apply_to and not path_is_under(original, apply_to):
        log.info(f"Skipping scene {scene_id}: not under Apply To Folder ({apply_to})")
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
    new_stem = form_filename(scene, settings)
    if len(new_stem) + len(ext) > 255:
        digest = hashlib.md5(new_stem.encode()).hexdigest()[:8]
        new_stem = new_stem[: 255 - len(ext) - 9] + "_" + digest

    dest_dir = Path(normalize_path(dest_folder)) if dest_folder else src_dir
    new_path = dest_dir / f"{new_stem}{ext}"

    same_name = Path(original).name == new_path.name
    same_dir = normalize_path(src_dir) == normalize_path(dest_dir)
    if same_name and same_dir:
        log.info(f"Name and folder unchanged: {new_path}")
        return None

    log.info(f"{'Would move' if dry_run else 'Moving'} {original} -> {new_path}")
    if dry_run:
        return str(new_path)

    os.makedirs(dest_dir, exist_ok=True)
    shutil.move(original, str(new_path))
    move_associated(str(src_dir / stem), str(dest_dir / new_stem), dry_run=False)

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
            "query { allScenes { id updated_at } }"
        )
        scenes = result.get("allScenes") or []
    except Exception:
        scenes = stash.find_scenes(fragment="id updated_at")
    if not scenes:
        return None
    return max(scenes, key=lambda s: s.get("updated_at") or "").get("id")


def hook_scene_id(json_input):
    try:
        ctx = (((json_input.get("args") or {}).get("hookContext")) or {})
        return ctx.get("id")
    except Exception:
        return None


def main():
    json_input = read_input()
    stash = connect(json_input)
    settings = plugin_settings(stash)
    mode = ((json_input.get("args") or {}).get("mode")) or ""

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
