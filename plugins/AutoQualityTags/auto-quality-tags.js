/**
 * Auto Quality Tags – embedded JS plugin for Stash
 * Creates and applies resolution + codec tags based on file metadata.
 */

(function () {
  function log(msg) {
    console.log("[AutoQualityTags] " + msg);
  }

  function formatResolution(width, height) {
    if (!width || !height) return null;
    const h = Number(height);
    if (h >= 2160) return "4K";
    if (h >= 1440) return "1440p";
    if (h >= 1080) return "1080p";
    if (h >= 720) return "720p";
    if (h >= 480) return "480p";
    return null;
  }

  function formatCodec(raw) {
    if (!raw) return null;
    const c = String(raw).toLowerCase();
    if (c.includes("hevc") || c.includes("h265") || c.includes("h.265")) return "HEVC";
    if (c.includes("av1")) return "AV1";
    if (c.includes("h264") || c.includes("avc") || c.includes("h.264")) return "H.264";
    if (c.includes("vp9")) return "VP9";
    if (c.includes("vp8")) return "VP8";
    return null;
  }

  function main() {
    const args = input.args || {};
    const createMissing = String(args.createMissing || "true").toLowerCase() !== "false";
    const dryRun = String(args.dryRun || "false").toLowerCase() === "true";

    log("Starting… createMissing=" + createMissing + " dryRun=" + dryRun);

    const findQuery = `
      query FindScenes($filter: FindFilterType) {
        findScenes(filter: $filter) {
          count
          scenes {
            id
            title
            tags { id name }
            files {
              width
              height
              video_codec
            }
          }
        }
      }
    `;

    const variables = {
      filter: {
        per_page: 500,
        sort: "updated_at",
        direction: "DESC"
      }
    };

    const result = gql.Do(findQuery, variables);
    if (!result || !result.findScenes) {
      return { error: "Failed to query scenes" };
    }

    const scenes = result.findScenes.scenes || [];
    log("Found " + scenes.length + " scenes to examine");

    let tagged = 0;
    let created = 0;
    const tagCache = {};

    function ensureTag(name) {
      if (tagCache[name]) return tagCache[name];

      const findTagQ = `
        query FindTags($filter: FindFilterType) {
          findTags(filter: $filter) {
            tags { id name }
          }
        }
      `;
      const findRes = gql.Do(findTagQ, {
        filter: { q: name, per_page: 5 }
      });

      if (findRes && findRes.findTags && findRes.findTags.tags) {
        const exact = findRes.findTags.tags.find(
          (t) => t.name.toLowerCase() === name.toLowerCase()
        );
        if (exact) {
          tagCache[name] = exact.id;
          return exact.id;
        }
      }

      if (!createMissing || dryRun) {
        return null;
      }

      const createQ = `
        mutation TagCreate($input: TagCreateInput!) {
          tagCreate(input: $input) { id name }
        }
      `;
      const createRes = gql.Do(createQ, {
        input: { name: name }
      });

      if (createRes && createRes.tagCreate) {
        tagCache[name] = createRes.tagCreate.id;
        created++;
        log("Created tag: " + name);
        return createRes.tagCreate.id;
      }
      return null;
    }

    scenes.forEach((scene) => {
      if (!scene.files || scene.files.length === 0) return;

      const file = scene.files[0];
      const desired = [];

      const res = formatResolution(file.width, file.height);
      if (res) desired.push(res);

      const codec = formatCodec(file.video_codec);
      if (codec) desired.push(codec);

      if (desired.length === 0) return;

      const existingNames = (scene.tags || []).map((t) => t.name.toLowerCase());
      const toAdd = [];

      desired.forEach((name) => {
        if (existingNames.indexOf(name.toLowerCase()) === -1) {
          const id = ensureTag(name);
          if (id) toAdd.push(id);
        }
      });

      if (toAdd.length === 0) return;

      if (dryRun) {
        log("[dry-run] Would tag scene " + scene.id + " with " + desired.join(", "));
        tagged++;
        return;
      }

      const currentIds = (scene.tags || []).map((t) => t.id);
      const newIds = currentIds.concat(toAdd);

      const updateQ = `
        mutation SceneUpdate($input: SceneUpdateInput!) {
          sceneUpdate(input: $input) { id }
        }
      `;
      const updateRes = gql.Do(updateQ, {
        input: {
          id: scene.id,
          tag_ids: newIds
        }
      });

      if (updateRes && updateRes.sceneUpdate) {
        tagged++;
        log("Tagged scene " + scene.id + " \u2192 " + desired.join(", "));
      }
    });

    const summary =
      "Done. Scenes examined: " +
      scenes.length +
      " | Newly tagged: " +
      tagged +
      " | Tags created: " +
      created;

    log(summary);
    return { Output: summary };
  }

  return main();
})();
