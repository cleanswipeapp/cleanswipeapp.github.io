/* CleanSwipe legal pages: small progressive enhancements. Everything works without this file. */
(function () {
  "use strict";
  var doc = document;

  // Header capsule gets a stronger fill once the page scrolls (same as the main site).
  var header = doc.querySelector(".site-header");
  if (header) {
    var onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 8); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  var tocLinks = Array.prototype.slice.call(doc.querySelectorAll('.toc a[href^="#"]'));
  if (!tocLinks.length) return;

  // Mobile table of contents: collapse the card after a section is chosen.
  var details = doc.querySelector(".toc-m");
  if (details) {
    details.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("a")) details.removeAttribute("open");
    });
  }

  // Scroll-spy: highlight the TOC link of the section in view (aria-current="true").
  var sections = Array.prototype.slice.call(doc.querySelectorAll(".sec"));
  var ids = sections.map(function (s) { return s.querySelector("h2[id]").id; });
  if (!sections.length || !("IntersectionObserver" in window)) return;

  var current = null;
  var pinned = null; // a section the reader just jumped to; held until they scroll by hand

  function setActive(id) {
    if (id === current) return;
    current = id;
    tocLinks.forEach(function (a) {
      if (id && a.getAttribute("href") === "#" + id) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }

  function scan() {
    if (pinned) { setActive(pinned); return; }
    var atBottom = window.innerHeight + window.scrollY >= doc.documentElement.scrollHeight - 2;
    var line = window.innerHeight * 0.2;
    var id = null;
    if (atBottom) id = ids[ids.length - 1];
    else {
      for (var i = sections.length - 1; i >= 0; i--) {
        if (sections[i].getBoundingClientRect().top <= line) { id = ids[i]; break; }
      }
    }
    setActive(id);
  }

  // Thin band at 20% of the viewport height. Sections are tall, so one of them leaves or enters
  // the band whenever the reading position moves from one section to the next, even on jumps.
  var io = new IntersectionObserver(scan, { rootMargin: "-20% 0px -79% 0px" });
  sections.forEach(function (s) { io.observe(s); });

  // Fully visible footer = the reader reached the bottom of the page.
  var footer = doc.querySelector(".site-footer");
  if (footer) new IntersectionObserver(scan, { threshold: 1 }).observe(footer);

  function pinFromHash(id) {
    pinned = ids.indexOf(id) === -1 ? null : id;
    scan();
  }
  doc.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (a) pinFromHash(decodeURIComponent(a.getAttribute("href").slice(1)));
  });
  window.addEventListener("hashchange", function () {
    pinFromHash(decodeURIComponent(window.location.hash.slice(1)));
  });
  ["wheel", "touchmove", "keydown"].forEach(function (type) {
    window.addEventListener(type, function () { pinned = null; }, { passive: true });
  });

  if (window.location.hash) pinFromHash(decodeURIComponent(window.location.hash.slice(1)));
  else scan();
})();
