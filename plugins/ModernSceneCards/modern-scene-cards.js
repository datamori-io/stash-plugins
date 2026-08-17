/**
 * Modern Scene Cards v0.4.0
 * - MutationObserver only (no React patch)
 * - Bottom-right meta chips (res / codec / time) from DOM + tags
 * - Performer hover: up to 3 other scenes via GraphQL
 * - Orange / dark-grey theme via CSS
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

  // ---------- bottom-right chips from existing DOM / tags ----------
  function textOf(el) {
    return (el && el.textContent ? el.textContent : "").trim();
  }

  function findResFromCard(card) {
    const specs = qs(card, ".scene-specs-overlay, .overlay-resolution");
    const t = textOf(specs);
    if (t && /\d|4K|UHD|HD/i.test(t)) return t.split(/\s+/)[0];

    // tags
    for (const a of qsa(card, "a.tag-item, .tag-item")) {
      const n = textOf(a);
      if (/^(4K|2160p|1440p|1080p|720p|480p)$/i.test(n)) return n.toUpperCase();
    }
    return null;
  }

  function findCodecFromCard(card) {
    for (const a of qsa(card, "a.tag-item, .tag-item")) {
      const n = textOf(a);
      if (/^(HEVC|H\.?264|H\.?265|AV1|VP9|x265|x264)$/i.test(n)) {
        return n.toUpperCase().replace("H264", "H.264").replace("H265", "HEVC");
      }
    }
    return null;
  }

  function findTimeFromCard(card) {
    const dur = qs(card, ".overlay-duration, .scene-card-preview .duration");
    const t = textOf(dur);
    if (t && /\d/.test(t)) return t;
    return null;
  }

  function ensureBottomMeta(card) {
    const preview =
      qs(card, ".scene-card-preview") ||
      qs(card, ".preview-image-container") ||
      card;
    if (!preview) return;

    let row = qs(card, ".msc-bottom-meta");
    if (!row) {
      row = document.createElement("div");
      row.className = "msc-bottom-meta";
      // attach inside preview for absolute positioning
      const style = window.getComputedStyle(preview);
      if (style.position === "static") {
        preview.style.position = "relative";
      }
      preview.appendChild(row);
    }

    const res = findResFromCard(card);
    const codec = findCodecFromCard(card);
    const time = findTimeFromCard(card);

    row.innerHTML = "";
    if (res) {
      const c = document.createElement("span");
      c.className = "msc-chip msc-chip--res";
      c.textContent = res;
      row.appendChild(c);
    }
    if (codec) {
      const c = document.createElement("span");
      c.className = "msc-chip msc-chip--codec";
      c.textContent = codec;
      row.appendChild(c);
    }
    if (time) {
      const c = document.createElement("span");
      c.className = "msc-chip msc-chip--time";
      c.textContent = time;
      row.appendChild(c);
    }

    if (row.children.length) {
      card.classList.add("msc-has-bottom-meta");
    }
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

  // ---------- GraphQL helper ----------
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
      html += '<div class="msc-performer-popup__loading">Loading…</div>';
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
      // still hovering-ish
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

  // ---------- boot ----------
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

  console.log("[ModernSceneCards] v0.4.0 loaded");
})();
