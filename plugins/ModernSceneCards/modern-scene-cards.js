/**
 * Modern Scene Cards v0.5.0
 * - Watched badge when play progress > 25% of duration
 * - MutationObserver only (no React patch)
 */
(function () {
  "use strict";

  const CARD_FLAG = "mscEnhanced";
  const POPUP_ID = "msc-performer-popup";
  const WATCHED_THRESHOLD = 0.25;
  let popupHideTimer = null;
  let popupEl = null;

  const watchQueue = [];
  const watchQueued = {};
  let watchTimer = null;

  function qs(root, sel) {
    try {
      return (root || document).querySelector(sel);
    } catch (_) {
      return null;
    }
  }

  function qsa(root, sel) {
    try {
      return Array.from((root || document).querySelectorAll(sel));
    } catch (_) {
      return [];
    }
  }

  function textOf(el) {
    return (el && el.textContent ? el.textContent : "").trim();
  }

  function showWatchedEnabled() {
    try {
      var cfg =
        (window.PluginApi &&
          window.PluginApi.utils &&
          window.PluginApi.utils.getPluginSetting &&
          window.PluginApi.utils.getPluginSetting(
            "ModernSceneCards",
            "showWatchedBadge"
          )) ||
        null;
      if (cfg === false || cfg === "false") return false;
    } catch (_) {}
    return true;
  }

  function parseRes(text) {
    if (!text) return null;
    var m = String(text).match(/\b(4K|UHD|2160p|1440p|1080p|720p|480p)\b/i);
    if (!m) return null;
    var t = m[1].toUpperCase();
    if (t === "UHD" || t === "2160P") return "4K";
    return t.replace("P", "p");
  }

  function parseTime(text) {
    if (!text) return null;
    var m = String(text).match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
    return m ? m[1] : null;
  }

  function parseCodec(text) {
    if (!text) return null;
    var m = String(text).match(
      /\b(HEVC|H\.?265|H\.?264|AVC|AV1|VP9|VP8|x265|x264)\b/i
    );
    if (!m) return null;
    var c = m[1].toUpperCase().replace(".", "");
    if (c === "H265" || c === "X265") return "HEVC";
    if (c === "H264" || c === "X264" || c === "AVC") return "H.264";
    return c;
  }

  function findResFromCard(card) {
    var tags = qsa(card, "a.tag-item, .tag-item");
    for (var i = 0; i < tags.length; i++) {
      var r = parseRes(textOf(tags[i]));
      if (r) return r;
    }
    return parseRes(textOf(qs(card, ".scene-specs-overlay, .overlay-resolution")));
  }

  function findCodecFromCard(card) {
    var tags = qsa(card, "a.tag-item, .tag-item");
    for (var i = 0; i < tags.length; i++) {
      var c = parseCodec(textOf(tags[i]));
      if (c) return c;
    }
    return null;
  }

  function findTimeFromCard(card) {
    return parseTime(
      textOf(
        qs(
          card,
          ".overlay-duration, .scene-card-preview .duration, .scene-specs-overlay"
        )
      )
    );
  }

  function ensureBottomMeta(card) {
    var preview =
      qs(card, ".scene-card-preview") ||
      qs(card, ".preview-image-container") ||
      card;
    if (!preview) return;

    var res = findResFromCard(card);
    var codec = findCodecFromCard(card);
    var time = findTimeFromCard(card);
    if (!res && !codec && !time) return;

    var row = qs(card, ".msc-bottom-meta");
    if (!row) {
      row = document.createElement("div");
      row.className = "msc-bottom-meta";
      if (window.getComputedStyle(preview).position === "static") {
        preview.style.position = "relative";
      }
      preview.appendChild(row);
    }

    row.innerHTML = "";
    if (time) {
      var t = document.createElement("span");
      t.className = "msc-chip msc-chip--time";
      t.textContent = time;
      row.appendChild(t);
    }
    if (codec) {
      var c = document.createElement("span");
      c.className = "msc-chip msc-chip--codec";
      c.textContent = codec;
      row.appendChild(c);
    }
    if (res) {
      var r = document.createElement("span");
      r.className = "msc-chip msc-chip--res";
      r.textContent = res;
      row.appendChild(r);
    }

    card.classList.add("msc-has-bottom-meta");
    qsa(
      card,
      ".scene-specs-overlay, .overlay-resolution, .overlay-duration, .scene-card-preview .duration"
    ).forEach(function (el) {
      el.style.display = "none";
    });
  }

  function sceneIdFromCard(card) {
    var a = qs(card, 'a[href*="/scenes/"]');
    if (!a) return null;
    var m = String(a.href).match(/\/scenes\/(\d+)/);
    return m ? m[1] : null;
  }

  function applyWatchedBadge(card, watched) {
    var preview =
      qs(card, ".scene-card-preview") ||
      qs(card, ".preview-image-container") ||
      card;
    var existing = qs(card, ".msc-watched");
    if (!watched) {
      if (existing) existing.remove();
      card.classList.remove("msc-watched-card");
      return;
    }
    if (!existing) {
      existing = document.createElement("div");
      existing.className = "msc-watched";
      existing.textContent = "Watched";
      if (preview) preview.appendChild(existing);
    }
    card.classList.add("msc-watched-card");
  }

  function isWatchedScene(scene) {
    if (!scene) return false;
    var duration = 0;
    if (scene.files && scene.files.length) {
      duration = Number(scene.files[0].duration) || 0;
    }
    if (duration <= 0) return false;
    var played = Number(scene.playDuration || scene.play_duration || 0);
    var resume = Number(scene.resumeTime || scene.resume_time || 0);
    var progress = Math.max(played, resume);
    return progress / duration >= WATCHED_THRESHOLD;
  }

  async function gql(query, variables) {
    var res = await fetch("/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ query: query, variables: variables || {} }),
    });
    if (!res.ok) throw new Error("GraphQL HTTP " + res.status);
    var json = await res.json();
    if (json.errors && json.errors.length) {
      throw new Error(json.errors[0].message || "GraphQL error");
    }
    return json.data;
  }

  async function flushWatchQueue() {
    watchTimer = null;
    if (!watchQueue.length) return;
    var batch = watchQueue.splice(0, 80);
    batch.forEach(function (id) {
      delete watchQueued[id];
    });
    try {
      var data = await gql(
        "query FindScenes($ids: [ID!]) {" +
          "  findScenes(filter: { ids: $ids, per_page: 80 }) {" +
          "    scenes { id playDuration resumeTime files { duration } }" +
          "  }" +
          "}",
        { ids: batch }
      );
      var scenes =
        (data && data.findScenes && data.findScenes.scenes) || [];
      var byId = {};
      scenes.forEach(function (s) {
        byId[String(s.id)] = s;
      });
      batch.forEach(function (id) {
        var cards = qsa(
          document,
          '.scene-card a[href*="/scenes/' + id + '"]'
        );
        cards.forEach(function (link) {
          var card = link.closest(".scene-card");
          if (card) applyWatchedBadge(card, isWatchedScene(byId[id]));
        });
      });
    } catch (e) {
      console.warn("[MSC] watched lookup:", e);
    }
    if (watchQueue.length) scheduleWatchFlush();
  }

  function scheduleWatchFlush() {
    if (watchTimer) return;
    watchTimer = setTimeout(flushWatchQueue, 180);
  }

  function queueWatchedLookup(card) {
    if (!showWatchedEnabled()) return;
    var id = sceneIdFromCard(card);
    if (!id || watchQueued[id]) return;
    watchQueued[id] = true;
    watchQueue.push(id);
    scheduleWatchFlush();
  }

  function enhanceCard(card) {
    if (!card || card.dataset[CARD_FLAG] === "1") return;
    card.dataset[CARD_FLAG] = "1";
    card.classList.add("msc-card");
    try {
      ensureBottomMeta(card);
    } catch (e) {
      console.warn("[MSC] bottom meta:", e);
    }
    try {
      queueWatchedLookup(card);
    } catch (e) {
      console.warn("[MSC] watch queue:", e);
    }
  }

  function scan(root) {
    try {
      var scope = root && root.querySelectorAll ? root : document;
      qsa(scope, ".scene-card").forEach(enhanceCard);
      if (root && root.classList && root.classList.contains("scene-card")) {
        enhanceCard(root);
      }
    } catch (e) {
      console.warn("[MSC] scan:", e);
    }
  }

  async function fetchPerformerScenes(performerId, excludeSceneId, limit) {
    limit = limit || 3;
    var data = await gql(
      "query FindScenes($performer_id: [ID!], $per_page: Int) {" +
        "  findScenes(" +
        "    scene_filter: { performers: { value: $performer_id, modifier: INCLUDES } }" +
        "    filter: { per_page: $per_page, sort: \"date\", direction: DESC }" +
        "  ) { scenes { id title paths { screenshot } } }" +
        "}",
      {
        performer_id: [String(performerId)],
        per_page: limit + 4,
      }
    );
    var scenes = (data && data.findScenes && data.findScenes.scenes) || [];
    return scenes
      .filter(function (s) {
        return String(s.id) !== String(excludeSceneId || "");
      })
      .slice(0, limit);
  }

  function getOrCreatePopup() {
    if (popupEl && document.body.contains(popupEl)) return popupEl;
    popupEl = document.createElement("div");
    popupEl.id = POPUP_ID;
    popupEl.className = "msc-performer-popup";
    popupEl.style.display = "none";
    popupEl.addEventListener("mouseenter", function () {
      clearTimeout(popupHideTimer);
    });
    popupEl.addEventListener("mouseleave", scheduleHidePopup);
    document.body.appendChild(popupEl);
    return popupEl;
  }

  function scheduleHidePopup() {
    clearTimeout(popupHideTimer);
    popupHideTimer = setTimeout(function () {
      if (popupEl) popupEl.style.display = "none";
    }, 280);
  }

  function positionPopup(anchor) {
    var pop = getOrCreatePopup();
    var r = anchor.getBoundingClientRect();
    var pw = 280;
    var left = r.left;
    var top = r.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (left < 8) left = 8;
    if (top + 200 > window.innerHeight) top = Math.max(8, r.top - 200);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  function renderPopup(title, scenes, loading) {
    var pop = getOrCreatePopup();
    var html =
      '<div class="msc-performer-popup__title">' +
      (title || "More scenes") +
      "</div>";
    if (loading) {
      html += '<div class="msc-performer-popup__loading">Loading\u2026</div>';
    } else if (!scenes || !scenes.length) {
      html +=
        '<div class="msc-performer-popup__empty">No other scenes found</div>';
    } else {
      html += '<div class="msc-performer-popup__list">';
      scenes.forEach(function (s) {
        var thumb =
          (s.paths && s.paths.screenshot) ||
          "/scene/" + s.id + "/screenshot";
        var name = s.title || "Scene #" + s.id;
        html +=
          '<a class="msc-performer-popup__item" href="/scenes/' +
          s.id +
          '">' +
          '<img class="msc-performer-popup__thumb" src="' +
          thumb +
          '" alt="" loading="lazy" />' +
          '<div class="msc-performer-popup__meta">' +
          '<div class="msc-performer-popup__name">' +
          name.replace(/</g, "&lt;") +
          "</div></div></a>";
      });
      html += "</div>";
    }
    pop.innerHTML = html;
    pop.style.display = "block";
  }

  function performerIdFromHref(href) {
    var m = String(href || "").match(/\/performers\/(\d+)/);
    return m ? m[1] : null;
  }

  async function onPerformerEnter(link) {
    clearTimeout(popupHideTimer);
    var id = performerIdFromHref(link.href);
    if (!id) return;
    var card = link.closest(".scene-card");
    var exclude = card ? sceneIdFromCard(card) : null;
    var name = textOf(link) || "Performer";
    positionPopup(link);
    renderPopup(name, null, true);
    try {
      var scenes = await fetchPerformerScenes(id, exclude, 3);
      positionPopup(link);
      renderPopup(name, scenes, false);
    } catch (e) {
      console.warn("[MSC] performer scenes:", e);
      renderPopup(name, [], false);
    }
  }

  function bindPerformerHovers(root) {
    qsa(root || document, '.scene-card a[href*="/performers/"]').forEach(
      function (link) {
        if (link.dataset.mscHover === "1") return;
        link.dataset.mscHover = "1";
        link.addEventListener("mouseenter", function () {
          onPerformerEnter(link);
        });
        link.addEventListener("mouseleave", scheduleHidePopup);
      }
    );
  }

  document.documentElement.classList.add("msc-loaded");

  function fullScan(root) {
    scan(root);
    bindPerformerHovers(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      fullScan(document);
    });
  } else {
    fullScan(document);
  }

  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      for (var j = 0; j < m.addedNodes.length; j++) {
        var node = m.addedNodes[j];
        if (node.nodeType !== 1) continue;
        fullScan(node);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  console.log("[ModernSceneCards] v0.5.0 loaded");
})();
