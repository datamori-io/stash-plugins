/**
 * Modern Scene Cards v0.4.1
 * - Strict chip parsing (no jumbled duration/rating text)
 * - Hide native overlays when our chips are present
 * - Performer hover: up to 3 other scenes
 */
(function () {
  "use strict";

  const CARD_FLAG = "mscEnhanced";
  const POPUP_ID = "msc-performer-popup";
  let popupHideTimer = null;
  let popupEl = null;

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

  // Only accept clean resolution tokens
  function parseRes(text) {
    if (!text) return null;
    const m = String(text).match(/\b(4K|UHD|2160p|1440p|1080p|720p|480p)\b/i);
    if (!m) return null;
    const t = m[1].toUpperCase();
    if (t === "UHD" || t === "2160P") return "4K";
    return t.replace("P", "p");
  }

  // Only accept clean duration like 1:23:45 or 12:34
  function parseTime(text) {
    if (!text) return null;
    const m = String(text).match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
    return m ? m[1] : null;
  }

  function parseCodec(text) {
    if (!text) return null;
    const m = String(text).match(/\b(HEVC|H\.?265|H\.?264|AVC|AV1|VP9|VP8|x265|x264)\b/i);
    if (!m) return null;
    const c = m[1].toUpperCase().replace(".", "");
    if (c === "H265" || c === "X265") return "HEVC";
    if (c === "H264" || c === "X264" || c === "AVC") return "H.264";
    return c;
  }

  function findResFromCard(card) {
    // Prefer quality tags first (clean)
    for (const a of qsa(card, "a.tag-item, .tag-item")) {
      const r = parseRes(textOf(a));
      if (r) return r;
    }
    // Then native specs overlay — but only the res token
    const specs = qs(card, ".scene-specs-overlay, .overlay-resolution");
    return parseRes(textOf(specs));
  }

  function findCodecFromCard(card) {
    for (const a of qsa(card, "a.tag-item, .tag-item")) {
      const c = parseCodec(textOf(a));
      if (c) return c;
    }
    return null;
  }

  function findTimeFromCard(card) {
    const dur = qs(
      card,
      ".overlay-duration, .scene-card-preview .duration, .scene-specs-overlay"
    );
    return parseTime(textOf(dur));
  }

  function ensureBottomMeta(card) {
    const preview =
      qs(card, ".scene-card-preview") ||
      qs(card, ".preview-image-container") ||
      card;
    if (!preview) return;

    const res = findResFromCard(card);
    const codec = findCodecFromCard(card);
    const time = findTimeFromCard(card);

    // Nothing clean to show — leave native overlays alone
    if (!res && !codec && !time) return;

    let row = qs(card, ".msc-bottom-meta");
    if (!row) {
      row = document.createElement("div");
      row.className = "msc-bottom-meta";
      const style = window.getComputedStyle(preview);
      if (style.position === "static") {
        preview.style.position = "relative";
      }
      preview.appendChild(row);
    }

    row.innerHTML = "";
    // Order: time | codec | res  (row-reverse in CSS puts res furthest right)
    if (time) {
      const c = document.createElement("span");
      c.className = "msc-chip msc-chip--time";
      c.textContent = time;
      row.appendChild(c);
    }
    if (codec) {
      const c = document.createElement("span");
      c.className = "msc-chip msc-chip--codec";
      c.textContent = codec;
      row.appendChild(c);
    }
    if (res) {
      const c = document.createElement("span");
      c.className = "msc-chip msc-chip--res";
      c.textContent = res;
      row.appendChild(c);
    }

    card.classList.add("msc-has-bottom-meta");

    // Hide native overlays so they don't double / jumble
    qsa(
      card,
      ".scene-specs-overlay, .overlay-resolution, .overlay-duration, .scene-card-preview .duration"
    ).forEach(function (el) {
      el.style.display = "none";
    });
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
  }

  function scan(root) {
    try {
      const scope = root && root.querySelectorAll ? root : document;
      qsa(scope, ".scene-card").forEach(enhanceCard);
      if (root && root.classList && root.classList.contains("scene-card")) {
        enhanceCard(root);
      }
    } catch (e) {
      console.warn("[MSC] scan:", e);
    }
  }

  async function gql(query, variables) {
    const res = await fetch("/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ query: query, variables: variables || {} }),
    });
    if (!res.ok) throw new Error("GraphQL HTTP " + res.status);
    const json = await res.json();
    if (json.errors && json.errors.length) {
      throw new Error(json.errors[0].message || "GraphQL error");
    }
    return json.data;
  }

  async function fetchPerformerScenes(performerId, excludeSceneId, limit) {
    limit = limit || 3;
    const query =
      "query FindScenes($performer_id: [ID!], $per_page: Int) {" +
      "  findScenes(" +
      "    scene_filter: { performers: { value: $performer_id, modifier: INCLUDES } }" +
      "    filter: { per_page: $per_page, sort: \"date\", direction: DESC }" +
      "  ) { scenes { id title paths { screenshot } } }" +
      "}";
    const data = await gql(query, {
      performer_id: [String(performerId)],
      per_page: limit + 4,
    });
    const scenes = (data && data.findScenes && data.findScenes.scenes) || [];
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
    const pop = getOrCreatePopup();
    const r = anchor.getBoundingClientRect();
    const pw = 280;
    let left = r.left;
    let top = r.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (left < 8) left = 8;
    if (top + 200 > window.innerHeight) top = Math.max(8, r.top - 200);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  function renderPopup(title, scenes, loading) {
    const pop = getOrCreatePopup();
    let html =
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
        const thumb =
          (s.paths && s.paths.screenshot) ||
          "/scene/" + s.id + "/screenshot";
        const name = s.title || "Scene #" + s.id;
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
    const m = String(href || "").match(/\/performers\/(\d+)/);
    return m ? m[1] : null;
  }

  function sceneIdFromCard(card) {
    const a = qs(card, 'a[href*="/scenes/"]');
    if (!a) return null;
    const m = String(a.href).match(/\/scenes\/(\d+)/);
    return m ? m[1] : null;
  }

  async function onPerformerEnter(link) {
    clearTimeout(popupHideTimer);
    const id = performerIdFromHref(link.href);
    if (!id) return;
    const card = link.closest(".scene-card");
    const exclude = card ? sceneIdFromCard(card) : null;
    const name = textOf(link) || "Performer";
    positionPopup(link);
    renderPopup(name, null, true);
    try {
      const scenes = await fetchPerformerScenes(id, exclude, 3);
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

  const observer = new MutationObserver(function (mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      for (let j = 0; j < m.addedNodes.length; j++) {
        const node = m.addedNodes[j];
        if (node.nodeType !== 1) continue;
        fullScan(node);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  console.log("[ModernSceneCards] v0.4.1 loaded");
})();
