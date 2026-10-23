/* CleanSwipe public site — vanilla, deferred, no dependencies.
   Header state, scroll reveal, nav scroll-spy, and the interactive review demo. */
(function () {
  "use strict";

  var doc = document;
  var hasIO = "IntersectionObserver" in window;

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  // Reduced motion, kept live so toggling the OS setting takes effect without a reload.
  var motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var reduceMotion = !!(motionQuery && motionQuery.matches);
  var motionListeners = [];
  if (motionQuery) {
    var onMotionChange = function () {
      reduceMotion = motionQuery.matches;
      motionListeners.forEach(function (fn) { fn(); });
    };
    if (motionQuery.addEventListener) { motionQuery.addEventListener("change", onMotionChange); }
    else if (motionQuery.addListener) { motionQuery.addListener(onMotionChange); }
  }

  initHeader();
  initReveal();
  initScrollSpy();
  initDemo();

  /* ---------- Header: the capsule gets a stronger fill once the page scrolls ---------- */
  function initHeader() {
    var header = $(".site-header");
    if (!header) { return; }
    var onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 8); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Reveal: rise in once, staggered by the --i custom property (see site.css) ---------- */
  function initReveal() {
    var items = $$(".reveal");
    if (!hasIO) {
      items.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Scroll-spy: mark the nav link of the section in view, like the selected tab in the app ---------- */
  function initScrollSpy() {
    var links = $$('.nav-links a[href^="#"]');
    if (!hasIO || !links.length) { return; }
    var byId = {};
    var sections = [];
    links.forEach(function (link) {
      var section = doc.getElementById(link.getAttribute("href").slice(1));
      if (section) { byId[section.id] = link; sections.push(section); }
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = byId[entry.target.id];
        if (!link) { return; }
        if (entry.isIntersecting) { link.setAttribute("aria-current", "location"); }
        else { link.removeAttribute("aria-current"); }
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach(function (section) { io.observe(section); });
  }

  /* ---------- Interactive demo: three photos, swipe or tap, then a summary ----------
     Nothing here touches a photo library. It replays the app's rule: a swipe only marks;
     the summary is where a plan would be confirmed. */
  function initDemo() {
    var demo = $("#demo");
    if (!demo) { return; }

    var THRESHOLD = 0.28;   // fraction of the card width that commits a swipe
    var FLICK = 0.6;        // px per ms that commits a swipe regardless of distance
    var FLY_MS = 320;
    var SPRING = "cubic-bezier(.34,1.56,.64,1)";

    var cards = $$(".demo-card", demo);
    var total = cards.length;
    var steps = $$("#stepper li");
    var counter = $("[data-demo-count]", demo);
    var live = $("#demo-live", demo);
    var buttons = {
      mark: $('[data-act="mark"]', demo),
      keep: $('[data-act="keep"]', demo),
      undo: $('[data-act="undo"]', demo)
    };
    var badges = { mark: $('[data-count="mark"]', demo), keep: $('[data-count="keep"]', demo) };

    var cur = 0;            // index of the front card
    var done = false;       // summary showing
    var history = [];       // [{ card, dir }] in decision order
    var drag = null;        // active pointer drag
    var interacted = false; // stops the idle hint for good

    var hintDelay = null;
    var hintLoop = null;
    var visible = false;

    render();
    updateUi();

    /* --- decisions --- */
    function decide(dir, speed) {
      if (done || cur >= total) { return; }
      markInteracted();
      var card = cards[cur];
      history.push({ card: card, dir: dir });
      cur++;
      setRatio(card, dir === "keep" ? 1 : -1);
      flyOut(card, dir, speed);
      render();
      updateUi();
      announce(dir === "keep" ? "Kept." : "Marked for cleanup.");
      // The dock circle drains once the card has left.
      window.setTimeout(function () {
        var last = history[history.length - 1];
        if (drag || (last && last.card !== card)) { return; }
        setFill(0, 0);
      }, reduceMotion ? 0 : FLY_MS);
      if (cur === total) { window.setTimeout(showSummary, reduceMotion ? 160 : FLY_MS + 60); }
    }

    function undo() {
      if (done || !history.length) { return; }
      markInteracted();
      var entry = history.pop();
      cur--;
      entry.card.style.setProperty("--ko", "0");
      entry.card.style.setProperty("--mo", "0");
      setFill(0, 0);
      render();
      comeBack(entry.card, entry.dir);
      updateUi();
      announce("Undone.");
    }

    function restart() {
      history = [];
      cur = 0;
      done = false;
      cards.forEach(function (card) {
        card.style.transition = "none";
        card.style.transform = "";
        card.style.opacity = "";
        card.style.setProperty("--ko", "0");
        card.style.setProperty("--mo", "0");
      });
      setFill(0, 0);
      render();
      void demo.offsetWidth;
      cards.forEach(function (card) { card.style.transition = ""; });
      demo.classList.remove("is-done");
      updateUi();
      demo.focus({ preventScroll: true });
      announce("Demo reset.");
    }

    function showSummary() {
      if (done || cur < total) { return; }
      done = true;
      fillSummary();
      demo.classList.add("is-done");
      updateUi();
      if (doc.activeElement && doc.activeElement !== demo && demo.contains(doc.activeElement)) {
        demo.focus({ preventScroll: true });
      }
      announce("Review summary.");
    }

    function fillSummary() {
      ["mark", "keep"].forEach(function (kind) {
        var items = history.filter(function (h) { return h.dir === kind; });
        $('[data-sum-n="' + kind + '"]', demo).textContent = String(items.length);
        var wrap = $('[data-sum-thumbs="' + kind + '"]', demo);
        wrap.textContent = "";
        if (!items.length) {
          var none = doc.createElement("span");
          none.className = "sum-none";
          none.textContent = "None";
          wrap.appendChild(none);
          return;
        }
        items.forEach(function (h) {
          var img = doc.createElement("img");
          img.src = $("img", h.card).getAttribute("src");
          img.alt = "";
          img.width = 520;
          img.height = 650;
          wrap.appendChild(img);
        });
      });
    }

    /* --- card motion --- */
    function flyOut(card, dir, speed) {
      var sign = dir === "keep" ? 1 : -1;
      if (reduceMotion) {
        card.style.transition = "";            // stylesheet: 150ms opacity fade
        card.style.transform = "";
        card.style.opacity = "0";
        return;
      }
      var ms = clamp(FLY_MS - Math.abs(speed || 0) * 60, 200, FLY_MS);
      card.style.transition = "transform " + ms + "ms cubic-bezier(.3,.7,.3,1), opacity " + ms + "ms ease";
      card.style.transform = "translate3d(" + sign * 140 + "%,0,0) rotate(" + sign * 18 + "deg)";
      card.style.opacity = "0";
    }

    function comeBack(card, dir) {
      var sign = dir === "keep" ? 1 : -1;
      if (reduceMotion) {
        card.style.transition = "";
        card.style.transform = "";
        card.style.opacity = "";
        return;
      }
      card.style.transition = "none";
      card.style.transform = "translate3d(" + sign * 140 + "%,0,0) rotate(" + sign * 18 + "deg)";
      card.style.opacity = "0";
      void card.offsetWidth;
      card.style.transition = "transform 380ms cubic-bezier(.2,.8,.2,1), opacity 220ms ease";
      card.style.transform = "";
      card.style.opacity = "";
      window.setTimeout(function () { releaseTransition(card); }, 420);
    }

    function springBack(card) {
      setRatio(card, 0);
      if (reduceMotion) {
        card.style.transition = "none";
        card.style.transform = "";
        window.requestAnimationFrame(function () { card.style.transition = ""; });
        return;
      }
      card.style.transition = "transform 380ms " + SPRING;
      card.style.transform = "";
      window.setTimeout(function () { releaseTransition(card); }, 420);
    }

    // Hand transitions back to the stylesheet, unless the user has grabbed the card again.
    function releaseTransition(card) {
      if (!drag || drag.card !== card) { card.style.transition = ""; }
    }

    /* --- stamps and dock fills follow one ratio: -1 (mark) .. 0 .. 1 (keep) --- */
    function setRatio(card, r) {
      var keep = Math.max(0, r);
      var mark = Math.max(0, -r);
      card.style.setProperty("--ko", keep.toFixed(3));
      card.style.setProperty("--mo", mark.toFixed(3));
      setFill(keep, mark);
    }

    function setFill(keep, mark) {
      buttons.keep.style.setProperty("--fill", String(keep));
      buttons.mark.style.setProperty("--fill", String(mark));
    }

    /* --- view state --- */
    function render() {
      cards.forEach(function (card, i) {
        var pos = i < cur ? "out" : String(i - cur);
        if (card.dataset.pos !== pos) { card.dataset.pos = pos; }
        card.setAttribute("aria-hidden", pos === "0" ? "false" : "true");
      });
    }

    function updateUi() {
      var counts = { keep: 0, mark: 0 };
      history.forEach(function (h) { counts[h.dir]++; });
      counter.textContent = done ? "Done" : Math.min(cur + 1, total) + " of " + total;
      demo.style.setProperty("--p", String(cur / total));
      ["keep", "mark"].forEach(function (kind) {
        badges[kind].textContent = String(counts[kind]);
        badges[kind].classList.toggle("on", counts[kind] > 0);
      });
      buttons.undo.disabled = done || history.length === 0;
      setStep(done ? 3 : 2);
    }

    // Stepper beside the demo: step 2 while swiping, step 3 when the summary shows.
    function setStep(n) {
      steps.forEach(function (li, i) {
        var step = i + 1;
        li.classList.toggle("is-done", step < n);
        li.classList.toggle("is-active", step === n);
        if (step === n) { li.setAttribute("aria-current", "step"); }
        else { li.removeAttribute("aria-current"); }
      });
    }

    function announce(message) {
      if (!live) { return; }
      live.textContent = "";
      window.setTimeout(function () { live.textContent = message; }, 50);
    }

    /* --- pointer drag (touch-action: pan-y keeps vertical page scroll working) --- */
    cards.forEach(function (card) {
      card.addEventListener("pointerdown", function (e) {
        if (done || drag || card !== cards[cur]) { return; }
        if (e.pointerType === "mouse" && e.button !== 0) { return; }
        cancelAnimations(card);
        drag = {
          card: card,
          id: e.pointerId,
          x0: e.clientX,
          dx: 0,
          w: card.offsetWidth || 300,
          samples: [{ x: e.clientX, t: e.timeStamp }]
        };
        try { card.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
        demo.classList.add("dragging");
        card.style.transition = "none";
        markInteracted();
      });
      card.addEventListener("pointermove", onDragMove);
      card.addEventListener("pointerup", onDragEnd);
      card.addEventListener("pointercancel", onDragEnd);
    });

    function onDragMove(e) {
      if (!drag || e.pointerId !== drag.id) { return; }
      drag.dx = e.clientX - drag.x0;
      drag.samples.push({ x: e.clientX, t: e.timeStamp });
      if (drag.samples.length > 12) { drag.samples.shift(); }
      var rotate = reduceMotion ? 0 : drag.dx / 18;
      drag.card.style.transform = "translate3d(" + drag.dx + "px,0,0) rotate(" + rotate + "deg)";
      setRatio(drag.card, clamp(drag.dx / (THRESHOLD * drag.w), -1, 1));
    }

    function onDragEnd(e) {
      if (!drag || e.pointerId !== drag.id) { return; }
      var d = drag;
      drag = null;
      demo.classList.remove("dragging");
      var v = velocity(d.samples);
      var dir = 0;
      if (e.type !== "pointercancel" && Math.abs(d.dx) > 6) {
        if (Math.abs(d.dx) > THRESHOLD * d.w) { dir = d.dx > 0 ? 1 : -1; }
        else if (Math.abs(v) > FLICK && (v > 0) === (d.dx > 0)) { dir = d.dx > 0 ? 1 : -1; }
      }
      if (dir) { decide(dir > 0 ? "keep" : "mark", v); }
      else { springBack(d.card); }
    }

    function velocity(samples) {
      var last = samples[samples.length - 1];
      var first = samples[0];
      for (var i = samples.length - 1; i >= 0; i--) {
        if (last.t - samples[i].t > 100) { break; }
        first = samples[i];
      }
      var dt = last.t - first.t;
      return dt > 0 ? (last.x - first.x) / dt : 0;
    }

    function cancelAnimations(el) {
      if (el.getAnimations) { el.getAnimations().forEach(function (a) { a.cancel(); }); }
    }

    /* --- buttons and keyboard --- */
    demo.addEventListener("click", function (e) {
      var target = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!target || !demo.contains(target)) { return; }
      var act = target.getAttribute("data-act");
      if (act === "keep" || act === "mark") { decide(act); }
      else if (act === "undo") { undo(); }
      else if (act === "restart") { restart(); }
    });

    demo.addEventListener("keydown", function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || done) { return; }
      if (e.key === "ArrowRight") { e.preventDefault(); decide("keep"); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); decide("mark"); }
      else if (e.key === "Backspace" || e.key === "z" || e.key === "Z") { e.preventDefault(); undo(); }
    });

    /* --- idle hint: after 1.2 s on screen the front card leans toward KEEP, then every 7 s
       until the first interaction. Off with reduced motion; paused while off screen. --- */
    function playHint() {
      if (interacted || done || drag || reduceMotion || doc.hidden) { return; }
      var card = cards[cur];
      if (!card || !card.animate) { return; }
      var w = card.offsetWidth;
      card.animate([
        { transform: "translate3d(0,0,0) rotate(0deg)" },
        { transform: "translate3d(" + w * 0.06 + "px,0,0) rotate(2.4deg)", offset: 0.4, easing: SPRING },
        { transform: "translate3d(0,0,0) rotate(0deg)" }
      ], { duration: 1200, easing: "cubic-bezier(.3,.7,.3,1)" });
      var stamp = $(".stamp.keep", card);
      if (stamp) { stamp.animate([{ opacity: 0 }, { opacity: 0.4, offset: 0.4 }, { opacity: 0 }], { duration: 1200 }); }
      setFill(0.4, 0);
      window.setTimeout(function () { if (!interacted && !drag) { setFill(0, 0); } }, 520);
    }

    function startHints() {
      if (interacted || reduceMotion || !visible || hintDelay || hintLoop) { return; }
      hintDelay = window.setTimeout(function () {
        hintDelay = null;
        playHint();
        hintLoop = window.setInterval(playHint, 7000);
      }, 1200);
    }

    function stopHints() {
      window.clearTimeout(hintDelay);
      window.clearInterval(hintLoop);
      hintDelay = null;
      hintLoop = null;
    }

    function markInteracted() {
      interacted = true;
      stopHints();
    }

    motionListeners.push(function () { if (reduceMotion) { stopHints(); } else { startHints(); } });

    if (hasIO) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          visible = entry.isIntersecting;
          if (visible) { startHints(); } else { stopHints(); }
        });
      }, { threshold: 0.3 }).observe(demo);
    }
  }
})();
