(function (root) {
  "use strict";
  if (root.__outreighVisitor) return;
  var SENSITIVE = ["token","access_token","refresh_token","id_token","auth","authorization","key","api_key","apikey","password","passwd","secret","signature","sig","jwt","session","code","email","ssn","card","cvv"];
  var SESSION_MS = 1800000;
  var BATCH = 10;
  var FLUSH_MS = 5000;

  function sanitizeUrl(raw) {
    var out = { path: "/", utm: {}, dropped: [] };
    try {
      var url = new URL(raw, root.location && root.location.href || "https://visitor.invalid");
      var path = url.pathname || "/";
      out.path = path.slice(0, 300);
      url.searchParams.forEach(function (value, key) {
        var lower = String(key).toLowerCase();
        var blocked = SENSITIVE.indexOf(lower) !== -1 || /token|password|secret|email/i.test(lower);
        if (blocked) { out.dropped.push(lower); return; }
        if (lower.indexOf("utm_") === 0 && value) {
          var name = lower.slice(4);
          if (["source", "medium", "campaign", "term", "content"].indexOf(name) !== -1) out.utm[name] = String(value).slice(0, 120);
        }
      });
    } catch (e) { /* keep the empty result */ }
    return out;
  }

  function pageType(path) {
    var value = String(path || "/").toLowerCase();
    if (value === "/" || value === "") return "home";
    if (/\/(pricing|plans|prices?)(\/|$)/.test(value)) return "pricing";
    if (/\/(demo|contact|book|get-started|talk-to-sales)(\/|$)/.test(value)) return "demo";
    if (/\/(integrations?|apps|connect)(\/|$)/.test(value)) return "integrations";
    if (/\/(product|products|features|platform|solutions)(\/|$)/.test(value)) return "product";
    return "other";
  }

  function uuid() {
    var cryptoObj = root.crypto;
    if (cryptoObj && cryptoObj.randomUUID) return cryptoObj.randomUUID();
    var hex = "";
    for (var i = 0; i < 32; i++) hex += Math.floor(Math.random() * 16).toString(16);
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-4" + hex.slice(13, 16) + "-a" + hex.slice(17, 20) + "-" + hex.slice(20, 32);
  }

  function storage() {
    try { return root.localStorage; } catch (e) { return null; }
  }

  function privacyOff() {
    var nav = root.navigator || {};
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl === true) return true;
    var store = storage();
    return !!(store && store.getItem("outreigh_off") === "1");
  }

  var queue = [];
  var timer = null;
  var lastPath = "";
  var shownAt = Date.now();
  var maxScroll = 0;
  var endpoint = "";
  var siteId = "";
  var consentMode = "required";
  var booted = false;

  function consented() {
    if (consentMode !== "required") return true;
    var store = storage();
    return !!(store && store.getItem("outreigh_consent") === "1");
  }

  function session() {
    var store = storage();
    var now = Date.now();
    var visitor = store && store.getItem("outreigh_vid");
    var returning = !!visitor;
    if (!visitor) {
      visitor = uuid();
      if (store) store.setItem("outreigh_vid", visitor);
    }
    var current = store && store.getItem("outreigh_sid");
    var last = Number(store && store.getItem("outreigh_last") || 0);
    if (!current || !last || now - last > SESSION_MS) current = uuid();
    if (store) {
      store.setItem("outreigh_sid", current);
      store.setItem("outreigh_last", String(now));
    }
    return { visitor: visitor, session: current, returning: returning };
  }

  function send(body) {
    try {
      var payload = JSON.stringify(body);
      if (root.navigator && typeof root.navigator.sendBeacon === "function") {
        var blob = new root.Blob([payload], { type: "application/json" });
        if (root.navigator.sendBeacon(endpoint, blob)) return;
      }
    } catch (e) { /* fetch fallback below */ }
    try {
      root.fetch(endpoint, { method: "POST", mode: "cors", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(function () {});
    } catch (e2) { /* fail silent */ }
  }

  function flush() {
    if (timer) { root.clearTimeout(timer); timer = null; }
    if (!queue.length || !endpoint) return;
    var batch = queue.slice();
    queue = [];
    send({ site_id: siteId, consent: consented(), events: batch });
  }

  function enqueue(event) {
    if (privacyOff() || !consented() || !siteId) return false;
    queue.push(event);
    if (queue.length >= BATCH) flush();
    else if (!timer) timer = root.setTimeout(flush, FLUSH_MS);
    return true;
  }

  function baseEvent(name, props) {
    var loc = root.location || { pathname: "/", href: "/", search: "" };
    var clean = sanitizeUrl(loc.pathname + (loc.search || ""));
    var who = session();
    return {
      event_id: uuid(),
      event_name: name,
      path: clean.path,
      page_type: pageType(clean.path),
      referrer: root.document && root.document.referrer || "",
      utm: clean.utm,
      session_id: who.session,
      visitor_key: who.visitor,
      returning: who.returning,
      props: props || {}
    };
  }

  function pageview() {
    var loc = root.location || { pathname: "/" };
    if (loc.pathname === lastPath) return;
    // Remember the path only after the event is queued. A client navigation
    // before consent used to mark the page seen, and consent() then skipped it.
    if (!enqueue(baseEvent("page_view", {}))) return;
    lastPath = loc.pathname;
    shownAt = Date.now();
    maxScroll = 0;
  }

  function engagement() {
    var visible = Date.now() - shownAt;
    enqueue(Object.assign(baseEvent("engagement", {}), { engagement: { visible_ms: visible, max_scroll_pct: maxScroll } }));
  }

  function track(name, props) {
    try {
      if (!/^[a-z0-9_.:-]{1,40}$/i.test(String(name || ""))) return;
      var safe = {};
      if (props && typeof props === "object") {
        Object.keys(props).slice(0, 12).forEach(function (key) {
          if (!/^[a-z0-9_.:-]{1,40}$/i.test(key) || /password|secret|token|email/i.test(key)) return;
          var value = props[key];
          if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") safe[key] = String(value).slice(0, 160);
        });
      }
      enqueue(baseEvent(String(name), safe));
    } catch (e) { /* fail silent */ }
  }

  function disable() {
    try {
      var store = storage();
      if (store) store.setItem("outreigh_off", "1");
      queue = [];
    } catch (e) { /* fail silent */ }
  }

  function consent() {
    try {
      var store = storage();
      if (store) store.setItem("outreigh_consent", "1");
      pageview();
    } catch (e) { /* fail silent */ }
  }

  root.OutReign = { track: track, disable: disable, consent: consent, flush: flush };
  if (root.__OUTREIGN_SDK_TEST__) root.__OUTREIGN_SDK__ = { sanitizeUrl: sanitizeUrl, pageType: pageType, queue: function () { return queue; } };

  try {
    var doc = root.document;
    if (!doc) return;
    var script = doc.currentScript || (doc.querySelector && doc.querySelector("script[data-site-id]"));
    if (!script) return;
    siteId = script.getAttribute("data-site-id") || "";
    consentMode = script.getAttribute("data-consent") === "not_required" ? "not_required" : "required";
    var src = script.src || "";
    var explicit = script.getAttribute("data-endpoint") || "";
    endpoint = explicit || (src.indexOf("visitor-sdk") !== -1 ? src.replace(/visitor-sdk[\s\S]*$/, "visitor-ingest") : "");
    if (!siteId || privacyOff()) return;
    booted = true;
    root.__outreighVisitor = true;
    if (doc.addEventListener) {
      doc.addEventListener("scroll", function () {
        var height = (doc.documentElement && doc.documentElement.scrollHeight) || 1;
        var seen = ((root.scrollY || 0) + (root.innerHeight || 0)) / height * 100;
        if (seen > maxScroll) maxScroll = Math.max(0, Math.min(100, Math.round(seen)));
      }, { passive: true });
    }
    if (root.history && !root.history.__outreigh) {
      ["pushState", "replaceState"].forEach(function (method) {
        var original = root.history[method];
        if (typeof original !== "function") return;
        root.history[method] = function () {
          var result = original.apply(this, arguments);
          try { pageview(); } catch (e) { /* fail silent */ }
          return result;
        };
      });
      root.history.__outreigh = true;
      if (root.addEventListener) root.addEventListener("popstate", function () { try { pageview(); } catch (e) {} });
    }
    if (root.addEventListener) {
      root.addEventListener("pagehide", function () {
        try { engagement(); flush(); } catch (e) { /* fail silent */ }
      });
    }
    if (consented()) pageview();
  } catch (e) { /* fail silent */ }
  void booted;
})(typeof globalThis !== "undefined" ? globalThis : this);
