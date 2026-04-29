/**
 * Script principal :
 * - Navigation collante + opacité au scroll
 * - Menu burger plein écran en dessous de lg ; menu horizontal à partir de lg
 * - Apparitions au scroll (Intersection Observer), ancres avec fermeture du menu mobile
 */

(function () {
  "use strict";

  /** Largeur Tailwind lg (1024px) : même seuil pour la barre desktop */
  var LG_BREAKPOINT = 1024;

  var HEADER = document.getElementById("site-header");
  var YEAR = document.getElementById("year");
  var NAV_TOGGLE = document.getElementById("nav-toggle");
  var NAV_OVERLAY = document.getElementById("nav-overlay");
  var NAV_OVERLAY_CLOSE = document.getElementById("nav-overlay-close");

  /** État ouvert du menu plein écran */
  function isMobileNavOpen() {
    return document.body.classList.contains("nav-open");
  }

  function openMobileNav() {
    if (!NAV_OVERLAY || !NAV_TOGGLE) return;
    NAV_OVERLAY.classList.remove("hidden");
    NAV_OVERLAY.classList.add("flex", "flex-col");
    NAV_OVERLAY.setAttribute("aria-hidden", "false");
    NAV_TOGGLE.setAttribute("aria-expanded", "true");
    NAV_TOGGLE.setAttribute("aria-label", "Fermer le menu");
    document.body.classList.add("nav-open", "overflow-hidden");
  }

  function closeMobileNav() {
    if (!NAV_OVERLAY || !NAV_TOGGLE) return;
    NAV_OVERLAY.classList.add("hidden");
    NAV_OVERLAY.classList.remove("flex", "flex-col");
    NAV_OVERLAY.setAttribute("aria-hidden", "true");
    NAV_TOGGLE.setAttribute("aria-expanded", "false");
    NAV_TOGGLE.setAttribute("aria-label", "Ouvrir le menu");
    document.body.classList.remove("nav-open", "overflow-hidden");
  }

  function toggleMobileNav() {
    if (window.innerWidth >= LG_BREAKPOINT) return;
    if (isMobileNavOpen()) {
      closeMobileNav();
    } else {
      openMobileNav();
    }
  }

  /** Scroll : fond et bordure de la navigation */
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    var threshold = 24;
    if (!HEADER) return;

    if (y > threshold) {
      HEADER.classList.add("header--scrolled");
    } else {
      HEADER.classList.remove("header--scrolled");
    }
  }

  /** Fade-in lors du défilement */
  function initReveal() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll(".reveal").forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        root: null,
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.08,
      }
    );

    document.querySelectorAll(".reveal").forEach(function (el) {
      observer.observe(el);
    });
  }

  /**
   * Ancres : défilement doux ; si le menu mobile est ouvert, on le ferme d'abord
   * pour éviter une page bloquée en overflow:hidden.
   */
  function initSmoothAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener("click", function (e) {
        var id = anchor.getAttribute("href");
        if (!id || id === "#") return;
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        var wasOverlayLink = anchor.classList.contains("mobile-nav-link");
        if (wasOverlayLink || isMobileNavOpen()) {
          closeMobileNav();
        }
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  /** Fermeture du menu lors du passage en vue desktop */
  function onViewportResize() {
    if (window.innerWidth >= LG_BREAKPOINT && isMobileNavOpen()) {
      closeMobileNav();
    }
  }

  /** Burger, overlay, Escape */
  function initMobileNav() {
    if (!NAV_TOGGLE || !NAV_OVERLAY) return;

    NAV_TOGGLE.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleMobileNav();
    });

    if (NAV_OVERLAY_CLOSE) {
      NAV_OVERLAY_CLOSE.addEventListener("click", function () {
        closeMobileNav();
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isMobileNavOpen()) {
        closeMobileNav();
      }
    });

    window.addEventListener("resize", onViewportResize);

    NAV_OVERLAY.addEventListener("click", function (e) {
      if (e.target === NAV_OVERLAY) {
        closeMobileNav();
      }
    });
  }

  /** Année du footer */
  if (YEAR) {
    YEAR.textContent = String(new Date().getFullYear());
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  initReveal();
  initSmoothAnchors();
  initMobileNav();

  var style = document.createElement("style");
  style.textContent =
    "#site-header.header--scrolled { background-color: rgba(26,37,51,0.98); box-shadow: 0 10px 32px rgba(0,0,0,0.35); border-bottom-color: rgba(255,255,255,0.12); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }";
  document.head.appendChild(style);
})();
