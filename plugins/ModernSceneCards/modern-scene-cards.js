/**
 * Modern Scene Cards v0.2.1
 * Hardened: safe on Front Page, guards against missing scene data
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

  function isFemale(p) {
    if (!p || typeof p !== "object") return false;
    const g = String(p.gender || "").toUpperCase();
    return g === "FEMALE" || g === "TRANSGENDER_FEMALE";
  }

  function getPrimaryFile(scene) {
    if (!scene || !Array.isArray(scene.files) || scene.files.length === 0) return null;
    return scene.files[0];
  }

  function enhanceCard(cardEl, scene) {
    try {
      if (!cardEl || !scene || !scene.id) return;
      if (cardEl.dataset.mscEnhanced === "1") return;
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

      if (settings.showFemaleCountBadge && Array.isArray(scene.performers)) {
        const females = scene.performers.filter(isFemale);
        if (females.length > 0) {
          const b = document.createElement("span");
          b.className = "msc-badge msc-badge--female";
          if (females.length === 1 && females[0].name) {
            b.textContent = String(females[0].name).split(/\s+/)[0];
          } else {
            b.textContent = females.length + "\u2640";
          }
          row.appendChild(b);
        }
      }

      if (row.children.length) {
        details.appendChild(row);
      }

      if (settings.showOnlyFemale && Array.isArray(scene.performers)) {
        const femaleIds = new Set(
          scene.performers.filter(isFemale).map((p) => String(p.id))
        );

        cardEl
          .querySelectorAll(
            "a[href*='/performers/'], .performer-name, .performer-tag, [data-performer-id]"
          )
          .forEach((node) => {
            let id = node.getAttribute("data-performer-id");
            if (!id && node.href) {
              const m = String(node.href).match(/\/performers\/(\d+)/);
              if (m) id = m[1];
            }
            if (id && !femaleIds.has(String(id))) {
              const parent =
                node.closest(".performer-tag, .tag-item, span") || node;
              parent.style.display = "none";
            }
          });
      }
    } catch (err) {
      console.warn("[ModernSceneCards] enhanceCard error:", err);
    }
  }

  try {
    PluginApi.patch.after("SceneCard", function (props, result) {
      try {
        if (
          props &&
          props.scene &&
          typeof props.scene === "object" &&
          props.scene.id != null
        ) {
          const sceneId = props.scene.id;
          requestAnimationFrame(function () {
            setTimeout(function () {
              try {
                const links = document.querySelectorAll(
                  '.scene-card a[href*="/scenes/' + sceneId + '"]'
                );
                links.forEach(function (link) {
                  const card = link.closest(".scene-card");
                  if (card) enhanceCard(card, props.scene);
                });
              } catch (e) {
                console.warn("[ModernSceneCards] deferred enhance failed:", e);
              }
            }, 40);
          });
        }
      } catch (e) {
        console.warn("[ModernSceneCards] patch handler error:", e);
      }
      return result;
    });
    console.log("[ModernSceneCards] SceneCard patch registered (v0.2.1 safe)");
  } catch (err) {
    console.warn("[ModernSceneCards] patch.after failed:", err);
  }

  document.documentElement.classList.add("msc-loaded");
  console.log("[ModernSceneCards] v0.2.1 loaded");
})();
