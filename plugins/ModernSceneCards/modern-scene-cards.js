/**
 * Modern Scene Cards v0.2
 * - Better React patching via PluginApi
 * - Accurate female-only filtering using full scene data
 * - Resolution + Codec badges
 * - Settings-aware defaults
 */

(function () {
  "use strict";

  const PluginApi = window.PluginApi;
  if (!PluginApi) {
    console.warn("[ModernSceneCards] PluginApi not found");
    return;
  }

  const DEFAULTS = {
    showOnlyFemale: true,
    showCodec: true,
    showResolution: true,
    showFemaleCountBadge: true,
  };

  function getSettings() {
    return { ...DEFAULTS };
  }

  function formatResolution(width, height) {
    if (!width || !height) return null;
    const h = Number(height);
    if (h >= 2160) return "4K";
    if (h >= 1440) return "1440p";
    if (h >= 1080) return "1080p";
    if (h >= 720) return "720p";
    if (h >= 480) return "480p";
    return `${h}p`;
  }

  function formatCodec(raw) {
    if (!raw) return null;
    const c = String(raw).toLowerCase();
    if (c.includes("hevc") || c.includes("h265") || c.includes("h.265")) return "HEVC";
    if (c.includes("av1")) return "AV1";
    if (c.includes("h264") || c.includes("avc") || c.includes("h.264")) return "H.264";
    if (c.includes("vp9")) return "VP9";
    if (c.includes("vp8")) return "VP8";
    return String(raw).toUpperCase().slice(0, 8);
  }

  function isFemale(p) {
    if (!p) return false;
    const g = (p.gender || "").toUpperCase();
    return g === "FEMALE" || g === "TRANSGENDER_FEMALE";
  }

  function getPrimaryFile(scene) {
    if (!scene || !scene.files || scene.files.length === 0) return null;
    return scene.files[0];
  }

  function enhanceCard(cardEl, scene) {
    if (!cardEl || !scene || cardEl.dataset.mscEnhanced === "1") return;
    cardEl.dataset.mscEnhanced = "1";

    const settings = getSettings();
    const details =
      cardEl.querySelector(".scene-card__details") ||
      cardEl.querySelector(".card-section");

    if (!details) return;

    const old = details.querySelector(".msc-badge-row");
    if (old) old.remove();

    const row = document.createElement("div");
    row.className = "msc-badge-row";

    const file = getPrimaryFile(scene);

    if (settings.showResolution && file) {
      const res = formatResolution(file.width, file.height);
      if (res) {
        const b = document.createElement("span");
        b.className = "msc-badge msc-badge--resolution";
        b.textContent = res;
        row.appendChild(b);
      }
    }

    if (settings.showCodec && file) {
      const codec = formatCodec(file.video_codec || file.codec);
      if (codec) {
        const b = document.createElement("span");
        b.className = "msc-badge msc-badge--codec";
        b.textContent = codec;
        row.appendChild(b);
      }
    }

    if (settings.showFemaleCountBadge && scene.performers) {
      const females = scene.performers.filter(isFemale);
      if (females.length > 0) {
        const b = document.createElement("span");
        b.className = "msc-badge msc-badge--female";
        if (females.length === 1) {
          b.textContent = females[0].name.split(/\s+/)[0];
        } else {
          b.textContent = `${females.length}\u2640`;
        }
        row.appendChild(b);
      }
    }

    if (row.children.length) {
      details.appendChild(row);
    }

    if (settings.showOnlyFemale && scene.performers) {
      const femaleIds = new Set(
        scene.performers.filter(isFemale).map((p) => String(p.id))
      );

      const performerNodes = cardEl.querySelectorAll(
        "a[href*='/performers/'], .performer-name, .performer-tag, [data-performer-id]"
      );

      performerNodes.forEach((node) => {
        let id = node.getAttribute("data-performer-id");
        if (!id && node.href) {
          const m = node.href.match(/\/performers\/(\d+)/);
          if (m) id = m[1];
        }
        if (id && !femaleIds.has(String(id))) {
          const parent = node.closest(".performer-tag, .tag-item, span") || node;
          parent.style.display = "none";
        } else if (id) {
          node.classList.add("msc-keep");
        }
      });
    }
  }

  try {
    PluginApi.patch.after("SceneCard", function (props, result) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          const links = document.querySelectorAll(
            `.scene-card a[href*="/scenes/${props.scene.id}"]`
          );
          links.forEach((link) => {
            const card = link.closest(".scene-card");
            if (card) enhanceCard(card, props.scene);
          });
        }, 30);
      });
      return result;
    });
    console.log("[ModernSceneCards] SceneCard patch registered");
  } catch (err) {
    console.warn("[ModernSceneCards] patch.after failed:", err);
  }

  document.documentElement.classList.add("msc-loaded");
  if (getSettings().showOnlyFemale) {
    document.documentElement.classList.add("msc-female-only");
  }

  console.log("[ModernSceneCards] v0.2 loaded");
})();
