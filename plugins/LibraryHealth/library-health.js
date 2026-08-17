(function () {
  "use strict";
  const PluginApi = window.PluginApi;
  if (!PluginApi) return;
  function scanCards() {
    document.querySelectorAll(".scene-card:not([data-lh-scanned])").forEach((card) => {
      card.dataset.lhScanned = "1";
      const dateEl = card.querySelector(".scene-card__date, .card-section .text-muted");
      if (dateEl && (!dateEl.textContent || dateEl.textContent.trim() === "")) {
        card.classList.add("lh-missing-date");
      }
    });
  }
  const observer = new MutationObserver(() => { scanCards(); });
  observer.observe(document.body, { childList: true, subtree: true });
  scanCards();
  console.log("[LibraryHealth] UI helpers loaded");
})();
