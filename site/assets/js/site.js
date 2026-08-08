/* ==========================================================================
   The Junior Bag — site behaviour
   Small, dependency-free. Three jobs: mobile nav, star ratings, card filters.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- nav --- */
  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.getAttribute("data-open") === "true";
      nav.setAttribute("data-open", String(!open));
      toggle.setAttribute("aria-expanded", String(!open));
    });

    // Close the menu when a link is tapped or the viewport grows.
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        nav.setAttribute("data-open", "false");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* -------------------------------------------------------------- stars --- */
  // <span class="stars" data-rating="4"></span> -> five SVG stars, N filled.
  var STAR =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 2.6l2.9 5.88 6.5.95-4.7 4.58 1.11 6.47L12 17.44l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95z"/>' +
    "</svg>";

  document.querySelectorAll(".stars").forEach(function (el) {
    var rating = Math.max(0, Math.min(5, parseFloat(el.getAttribute("data-rating")) || 0));
    var html = "";
    for (var i = 1; i <= 5; i++) {
      html += '<span class="' + (i <= rating ? "star-on" : "star-off") + '">' + STAR + "</span>";
    }
    el.innerHTML = html;
    if (!el.getAttribute("aria-label")) {
      el.setAttribute("aria-label", rating + " out of 5 stars");
    }
    el.setAttribute("role", "img");
  });

  /* ------------------------------------------------------------ filters --- */
  // Buttons carry data-filter="all|gear|courses|<category>"; cards carry
  // data-category="driver" data-type="gear". Filtering is pure show/hide so
  // every card stays in the HTML for search engines.
  var filterBar = document.querySelector("[data-filters]");

  if (filterBar) {
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-review-card]"));
    var empty = document.querySelector("[data-empty]");
    var counter = document.querySelector("[data-count]");

    var apply = function (value) {
      var shown = 0;

      cards.forEach(function (card) {
        var match =
          value === "all" ||
          card.getAttribute("data-type") === value ||
          card.getAttribute("data-category") === value;
        card.hidden = !match;
        if (match) shown++;
      });

      if (empty) empty.style.display = shown === 0 ? "block" : "none";
      if (counter) counter.textContent = shown + (shown === 1 ? " review" : " reviews");
    };

    filterBar.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-filter]");
      if (!btn) return;

      filterBar.querySelectorAll("button[data-filter]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b === btn));
      });
      apply(btn.getAttribute("data-filter"));
    });

    // Deep links like gear.html#drivers preselect a filter.
    var hash = window.location.hash.replace("#", "");
    var preset = hash && filterBar.querySelector('button[data-filter="' + hash + '"]');
    if (preset) preset.click();
    else apply("all");
  }

  /* --------------------------------------------------------------- year --- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ------------------------------------------------------------ signup --- */
  // Placeholder handler — wire this to your real list provider (or let
  // Framer/Zite's own form component replace it) before launch.
  document.querySelectorAll("[data-signup]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var note = form.parentElement.querySelector("[data-signup-note]");
      if (note) note.textContent = "Thanks! Hook this form up to your email list to go live.";
      form.reset();
    });
  });
})();
