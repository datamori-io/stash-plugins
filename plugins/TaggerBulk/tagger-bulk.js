/**
 * Tagger Bulk v0.1.0
 * - Search All / Search Selected in the Scene Tagger
 * - Bulk find/replace across every row's query box
 * No React patching: the Tagger components are not in Stash's patchable list,
 * so this drives the real DOM the same way a person would.
 */
(function () {
  "use strict";

  const PLUGIN_ID = "TaggerBulk";
  const BAR_CLASS = "tb-bar";
  const DEFAULT_DELAY = 1000;
  const QUERY_TIMEOUT = 60000;

  let settings = {};
  let running = false;
  let stopRequested = false;

  function log(msg) {
    console.log("[TaggerBulk] " + msg);
  }

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

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  /* --------------------------------------------------------------- settings */

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

  async function loadSettings() {
    try {
      var data = await gql("query { configuration { plugins } }");
      var all = (data && data.configuration && data.configuration.plugins) || {};
      settings = all[PLUGIN_ID] || {};
    } catch (e) {
      log("could not read plugin settings: " + e.message);
      settings = {};
    }
  }

  function setting(key) {
    if (settings && settings[key] !== undefined) return settings[key];
    try {
      var api = window.PluginApi;
      if (api && api.utils && api.utils.getPluginSetting) {
        return api.utils.getPluginSetting(PLUGIN_ID, key);
      }
    } catch (_) {}
    return undefined;
  }

  function searchDelay() {
    var v = Number(setting("searchDelay"));
    if (!isFinite(v) || v <= 0) return DEFAULT_DELAY;
    return Math.min(v, 60000);
  }

  function skipMatched() {
    var v = setting("skipMatched");
    return !(v === false || v === "false");
  }

  /* -------------------------------------------------------------- row lookup */

  function header() {
    return qs(document, ".tagger-container-header");
  }

  function rows() {
    return qsa(document, ".tagger-container .search-item");
  }

  // The query form lives in the row's own top-level .row; search results are
  // rendered as a sibling of it. Scoping this way keeps us off result fields.
  function queryGroup(row) {
    var top = qs(row, ":scope > .row");
    return top ? qs(top, ".input-group") : null;
  }

  function queryInput(row) {
    var g = queryGroup(row);
    return g ? qs(g, "input") : null;
  }

  function searchButton(row) {
    var g = queryGroup(row);
    return g ? qs(g, ".input-group-append button") : null;
  }

  function isSelected(row) {
    var top = qs(row, ":scope > .row");
    var box = top ? qs(top, ".search-item-check") : null;
    return !!(box && box.checked);
  }

  function hasResults(row) {
    return row.children.length > 1;
  }

  function isBusy(row) {
    var btn = searchButton(row);
    if (!btn) return false;
    if (btn.disabled) return true;
    return !!qs(btn, ".LoadingIndicator, .spinner-border");
  }

  function targets(selectedOnly) {
    var list = rows().filter(function (r) {
      return !!searchButton(r);
    });
    if (selectedOnly) list = list.filter(isSelected);
    return list;
  }

  /* --------------------------------------------------------------- utilities */

  // React tracks its own value on the input node, so a plain .value assignment
  // is swallowed. Go through the native setter and fire a bubbling input event.
  function setInputValue(input, value) {
    var desc = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    );
    if (desc && desc.set) desc.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* ------------------------------------------------------------- search all */

  async function settle(row) {
    var start = Date.now();
    var hadResults = hasResults(row);
    // Wait for the spinner to appear, but give up early if results land first.
    while (Date.now() - start < 1500 && !isBusy(row)) {
      if (hasResults(row) !== hadResults) return;
      await sleep(60);
    }
    while (Date.now() - start < QUERY_TIMEOUT && isBusy(row)) await sleep(150);
    await sleep(100);
  }

  async function runSearch(bar) {
    var selectedOnly = qs(bar, ".tb-selected-only").checked;
    var list = targets(selectedOnly);
    if (skipMatched()) {
      list = list.filter(function (r) {
        return !hasResults(r);
      });
    }

    if (!list.length) {
      status(bar, "Nothing to search. Does the selected source support search?");
      return;
    }

    running = true;
    stopRequested = false;
    setRunningUI(bar, true);

    var delay = searchDelay();
    var done = 0;
    for (var i = 0; i < list.length; i++) {
      if (stopRequested) break;
      var row = list[i];
      if (!document.body.contains(row)) continue;
      var btn = searchButton(row);
      if (!btn) continue;

      status(bar, "Searching " + (i + 1) + " of " + list.length + "…");
      btn.click();
      await settle(row);
      done++;
      if (i < list.length - 1 && delay) await sleep(delay);
    }

    running = false;
    setRunningUI(bar, false);
    status(
      bar,
      (stopRequested ? "Stopped after " : "Searched ") +
        done +
        " of " +
        list.length +
        "."
    );
    stopRequested = false;
  }

  /* ------------------------------------------------------------ bulk queries */

  function applyBulk(bar) {
    var find = qs(bar, ".tb-find").value;
    var replace = qs(bar, ".tb-replace").value;
    var useRegex = qs(bar, ".tb-regex").checked;
    var selectedOnly = qs(bar, ".tb-selected-only").checked;

    if (!find) {
      status(bar, "Enter something to find first.");
      return;
    }

    var re;
    try {
      re = new RegExp(useRegex ? find : escapeRegex(find), "gi");
    } catch (e) {
      status(bar, "Bad regex: " + e.message);
      return;
    }

    var changed = 0;
    targets(selectedOnly).forEach(function (row) {
      var input = queryInput(row);
      if (!input) return;
      var current = input.value || "";
      var next = current.replace(re, replace).replace(/\s+/g, " ").trim();
      if (next !== current) {
        setInputValue(input, next);
        changed++;
      }
    });

    status(bar, "Updated " + changed + " " + plural(changed) + ".");
  }

  function resetBulk(bar) {
    var selectedOnly = qs(bar, ".tb-selected-only").checked;
    var count = 0;
    targets(selectedOnly).forEach(function (row) {
      var input = queryInput(row);
      if (!input || !input.value) return;
      // Blank falls back to the query Stash derives from the filename/metadata.
      setInputValue(input, "");
      count++;
    });
    status(bar, "Reset " + count + " " + plural(count) + ".");
  }

  function plural(n) {
    return n === 1 ? "query" : "queries";
  }

  /* --------------------------------------------------------------------- UI */

  function status(bar, text) {
    var el = qs(bar, ".tb-status");
    if (el) el.textContent = text || "";
  }

  function setRunningUI(bar, isRunning) {
    var btn = qs(bar, ".tb-search-all");
    if (!btn) return;
    btn.textContent = isRunning ? "Stop" : "Search All";
    btn.classList.toggle("tb-danger", isRunning);
    qsa(bar, ".tb-apply, .tb-reset").forEach(function (b) {
      b.disabled = isRunning;
    });
  }

  function buildBar() {
    var bar = document.createElement("div");
    bar.className = BAR_CLASS;
    bar.innerHTML =
      '<div class="tb-row">' +
      '<button type="button" class="btn btn-secondary tb-search-all">Search All</button>' +
      '<label class="tb-check"><input type="checkbox" class="tb-selected-only"> Selected only</label>' +
      '<span class="tb-sep"></span>' +
      '<input type="text" class="tb-find" placeholder="Find in query">' +
      '<input type="text" class="tb-replace" placeholder="Replace with">' +
      '<label class="tb-check"><input type="checkbox" class="tb-regex"> Regex</label>' +
      '<button type="button" class="btn btn-secondary tb-apply">Apply</button>' +
      '<button type="button" class="btn btn-secondary tb-reset">Reset</button>' +
      "</div>" +
      '<div class="tb-status"></div>';

    qs(bar, ".tb-search-all").addEventListener("click", function () {
      if (running) {
        stopRequested = true;
        status(bar, "Stopping after the current search…");
        return;
      }
      runSearch(bar).catch(function (e) {
        running = false;
        setRunningUI(bar, false);
        status(bar, "Failed: " + e.message);
      });
    });
    qs(bar, ".tb-apply").addEventListener("click", function () {
      applyBulk(bar);
    });
    qs(bar, ".tb-reset").addEventListener("click", function () {
      resetBulk(bar);
    });
    qsa(bar, ".tb-find, .tb-replace").forEach(function (input) {
      input.addEventListener("keypress", function (e) {
        if (e.key === "Enter") applyBulk(bar);
      });
    });

    return bar;
  }

  function inject() {
    var head = header();
    if (!head) {
      running = false;
      stopRequested = false;
      return;
    }
    if (qs(head, "." + BAR_CLASS)) return;
    head.appendChild(buildBar());
    log("toolbar added");
  }

  /* ------------------------------------------------------------------- boot */

  loadSettings();

  var observer = new MutationObserver(function () {
    inject();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  inject();

  try {
    if (window.PluginApi && window.PluginApi.Event) {
      window.PluginApi.Event.addEventListener("stash:location", function () {
        loadSettings();
        setTimeout(inject, 100);
      });
    }
  } catch (_) {}

  log("loaded");
})();
