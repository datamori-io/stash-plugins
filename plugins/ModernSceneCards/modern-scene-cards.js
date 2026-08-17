/**
 * Modern Scene Cards v0.3.0
 * Pure DOM / MutationObserver – no PluginApi.patch
 * Safe on Front Page and everywhere else.
 */
(function () {
  "use strict";

  const STYLE_FLAG = "msc-loaded";
  const CARD_FLAG = "mscEnhanced";

  function enhanceCard(card) {
    if (!card || card.dataset[CARD_FLAG] === "1") return;
    card.dataset[CARD_FLAG] = "1";
    card.classList.add("msc-card");
  }

  function scan(root) {
    try {
      const scope = root && root.querySelectorAll ? root : document;
      scope.querySelectorAll(".scene-card").forEach(enhanceCard);
      if (root && root.classList && root.classList.contains("scene-card")) {
        enhanceCard(root);
      }
    } catch (e) {
      console.warn("[ModernSceneCards] scan error:", e);
    }
  }

  document.documentElement.classList.add(STYLE_FLAG);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      scan(document);
    });
  } else {
    scan(document);
  }

  const observer = new MutationObserver(function (mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      for (let j = 0; j < m.addedNodes.length; j++) {
        const node = m.addedNodes[j];
        if (node.nodeType !== 1) continue;
        scan(node);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log("[ModernSceneCards] v0.3.0 (MutationObserver only) loaded");
})();
