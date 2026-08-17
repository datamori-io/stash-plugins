/**
 * Auto Quality Tags v0.2.1
 * - Pages through entire library
 * - Additive or replace-outdated mode via task args
 */

(function () {
  function log(msg) {
    console.log("[AutoQualityTags] " + msg);
  }

  const RES_TAGS = ["4K", "1440p", "1080p", "720p", "480p"];
  const CODEC_TAGS = ["HEVC", "H.264", "AV1", "VP9", "VP8"];
  const ALL_QUALITY = RES_TAGS.concat(CODEC_TAGS);
  const QUALITY_SET = {};
  ALL_QUALITY.forEach(function (n) {
    QUALITY_SET[n.toLowerCase()] = true;
  });

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

  function isQualityTagName(name) {
    return !!QUALITY_SET[String(name || "").toLowerCase()];
  }

  function main() {
    const args = input.args || {};
    const createMissing =
      String(args.createMissing || "true").toLowerCase() !== "false";
    const dryRun = String(args.dryRun || "false").toLowerCase() === "true";
    const replaceOutdated =
      String(args.replaceOutdated || "false").toLowerCase() === "true";
    let pageSize = parseInt(args.pageSize || "100", 10);
    if (!pageSize || pageSize < 1) pageSize = 100;
    if (pageSize > 500) pageSize = 500;

    log(
      "Starting… createMissing=" +
        createMissing +
        " dryRun=" +
        dryRun +
        " replaceOutdated=" +
        replaceOutdated +
        " pageSize=" +
        pageSize
    );

    const findQuery =
      "query FindScenes($filter: FindFilterType) {" +
      "  findScenes(filter: $filter) {" +
      "    count" +
      "    scenes {" +
      "      id title" +
      "      tags { id name }" +
      "      files { width height video_codec }" +
      "    }" +
      "  }" +
      "}";

    let page = 1;
    let totalCount = null;
    let examined = 0;
    let tagged = 0;
    let updated = 0;
    let created = 0;
    const tagCache = {};

    function ensureTag(name) {
      if (tagCache[name]) return tagCache[name];

      const findTagQ =
        "query FindTags($filter: FindFilterType) {" +
        "  findTags(filter: $filter) { tags { id name } }" +
        "}";
      const findRes = gql.Do(findTagQ, {
        filter: { q: name, per_page: 10 },
      });

      if (findRes && findRes.findTags && findRes.findTags.tags) {
        const exact = findRes.findTags.tags.find(function (t) {
          return t.name.toLowerCase() === name.toLowerCase();
        });
        if (exact) {
          tagCache[name] = exact.id;
          return exact.id;
        }
      }

      if (!createMissing || dryRun) return null;

      const createQ =
        "mutation TagCreate($input: TagCreateInput!) {" +
        "  tagCreate(input: $input) { id name }" +
        "}";
      const createRes = gql.Do(createQ, { input: { name: name } });
      if (createRes && createRes.tagCreate) {
        tagCache[name] = createRes.tagCreate.id;
        created++;
        log("Created tag: " + name);
        return createRes.tagCreate.id;
      }
      return null;
    }

    function processScene(scene) {
      if (!scene.files || scene.files.length === 0) return;

      const file = scene.files[0];
      const desiredNames = [];
      const res = formatResolution(file.width, file.height);
      if (res) desiredNames.push(res);
      const codec = formatCodec(file.video_codec);
      if (codec) desiredNames.push(codec);
      if (desiredNames.length === 0) return;

      const existingTags = scene.tags || [];
      const existingByLower = {};
      existingTags.forEach(function (t) {
        existingByLower[t.name.toLowerCase()] = t;
      });

      const desiredIds = [];
      let needsChange = false;

      desiredNames.forEach(function (name) {
        const existing = existingByLower[name.toLowerCase()];
        if (existing) {
          desiredIds.push(existing.id);
        } else {
          const id = ensureTag(name);
          if (id) {
            desiredIds.push(id);
            needsChange = true;
          }
        }
      });

      let finalIds;
      if (replaceOutdated) {
        finalIds = existingTags
          .filter(function (t) {
            return !isQualityTagName(t.name);
          })
          .map(function (t) {
            return t.id;
          })
          .concat(desiredIds);

        const oldQualityIds = existingTags
          .filter(function (t) {
            return isQualityTagName(t.name);
          })
          .map(function (t) {
            return t.id;
          })
          .sort()
          .join(",");
        const newQualityIds = desiredIds.slice().sort().join(",");
        if (oldQualityIds !== newQualityIds) needsChange = true;
      } else {
        const currentIds = existingTags.map(function (t) {
          return t.id;
        });
        finalIds = currentIds.slice();
        desiredIds.forEach(function (id) {
          if (finalIds.indexOf(id) === -1) {
            finalIds.push(id);
            needsChange = true;
          }
        });
      }

      if (!needsChange) return;

      if (dryRun) {
        log(
          "[dry-run] Scene " +
            scene.id +
            " \u2192 " +
            desiredNames.join(", ") +
            (replaceOutdated ? " (replace)" : "")
        );
        tagged++;
        return;
      }

      const seen = {};
      const uniqueIds = [];
      finalIds.forEach(function (id) {
        if (!seen[id]) {
          seen[id] = true;
          uniqueIds.push(id);
        }
      });

      const updateQ =
        "mutation SceneUpdate($input: SceneUpdateInput!) {" +
        "  sceneUpdate(input: $input) { id }" +
        "}";
      const updateRes = gql.Do(updateQ, {
        input: { id: scene.id, tag_ids: uniqueIds },
      });

      if (updateRes && updateRes.sceneUpdate) {
        tagged++;
        updated++;
        log("Tagged scene " + scene.id + " \u2192 " + desiredNames.join(", "));
      }
    }

    while (true) {
      const variables = {
        filter: {
          per_page: pageSize,
          page: page,
          sort: "id",
          direction: "ASC",
        },
      };

      const result = gql.Do(findQuery, variables);
      if (!result || !result.findScenes) {
        log("Query failed on page " + page);
        break;
      }

      if (totalCount === null) {
        totalCount = result.findScenes.count || 0;
        log("Total scenes in library: " + totalCount);
      }

      const scenes = result.findScenes.scenes || [];
      if (scenes.length === 0) break;

      scenes.forEach(function (scene) {
        examined++;
        try {
          processScene(scene);
        } catch (e) {
          log("Error on scene " + scene.id + ": " + e);
        }
      });

      log(
        "Page " +
          page +
          " done (" +
          examined +
          "/" +
          totalCount +
          " examined, " +
          tagged +
          " changed)"
      );

      if (examined >= totalCount) break;
      if (scenes.length < pageSize) break;
      page++;
      if (page > 10000) {
        log("Safety stop at page limit");
        break;
      }
    }

    const summary =
      "Done. Examined: " +
      examined +
      " / " +
      (totalCount || "?") +
      " | Updated: " +
      updated +
      " | Tags created: " +
      created +
      (dryRun ? " | DRY RUN" : "") +
      (replaceOutdated ? " | replaceOutdated=on" : "");

    log(summary);
    return { Output: summary };
  }

  return main();
})();
