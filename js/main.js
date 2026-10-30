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

  function initContactForm() {
    var form = document.getElementById("contact-form");
    var submitBtn = document.getElementById("contact-submit");
    var statusEl = document.getElementById("form-status");
    var toast = document.getElementById("contact-toast");
    if (!form || !submitBtn) return;

    var idleEl = submitBtn.querySelector(".submit-idle");
    var loadingEl = submitBtn.querySelector(".submit-loading");
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var toastTimer;
    var toastHideTimer;

    function field(name) {
      return form.elements[name];
    }

    function errorEl(name) {
      return form.querySelector('[data-error-for="' + name + '"]');
    }

    function setFieldError(name, message) {
      var input = field(name);
      var hint = errorEl(name);
      if (input) {
        if (message) {
          input.classList.add("is-invalid");
        } else {
          input.classList.remove("is-invalid");
        }
      }
      if (hint) {
        hint.textContent = message || "";
        hint.classList.toggle("hidden", !message);
      }
    }

    function clearErrors() {
      ["nom", "email", "sujet", "message"].forEach(function (name) {
        setFieldError(name, "");
      });
      if (statusEl) {
        statusEl.textContent = "";
        statusEl.classList.add("hidden");
        statusEl.classList.remove("text-red-300", "text-emerald-300");
      }
    }

    function setLoading(isLoading) {
      submitBtn.disabled = isLoading;
      if (idleEl) idleEl.classList.toggle("hidden", isLoading);
      if (loadingEl) {
        loadingEl.classList.toggle("hidden", !isLoading);
        loadingEl.classList.toggle("inline-flex", isLoading);
      }
    }

    function hideToast() {
      if (!toast) return;
      toast.classList.remove("is-visible");
      toastHideTimer = setTimeout(function () {
        toast.hidden = true;
      }, 280);
    }

    function showToast(message, isError) {
      if (!toast) return;
      toast.textContent = message;
      toast.classList.toggle("contact-toast--error", Boolean(isError));
      toast.hidden = false;
      window.requestAnimationFrame(function () {
        toast.classList.add("is-visible");
      });
      clearTimeout(toastTimer);
      clearTimeout(toastHideTimer);
      toastTimer = setTimeout(hideToast, 4200);
    }

    function validate() {
      var nom = String(field("nom").value || "").trim();
      var email = String(field("email").value || "").trim();
      var sujet = String(field("sujet").value || "").trim();
      var message = String(field("message").value || "").trim();
      var ok = true;

      if (nom.length < 2) {
        setFieldError("nom", "Indiquez votre nom.");
        ok = false;
      } else {
        setFieldError("nom", "");
      }

      if (!emailRe.test(email)) {
        setFieldError("email", "Indiquez une adresse e-mail valide.");
        ok = false;
      } else {
        setFieldError("email", "");
      }

      if (sujet.length < 2) {
        setFieldError("sujet", "Indiquez un sujet.");
        ok = false;
      } else {
        setFieldError("sujet", "");
      }

      if (message.length < 10) {
        setFieldError("message", "Quelques lignes suffisent — au moins 10 caractères.");
        ok = false;
      } else {
        setFieldError("message", "");
      }

      return ok
        ? { nom: nom, email: email, sujet: sujet, message: message, website: String(field("website").value || "") }
        : null;
    }

    var CONTACT_API_PRODUCTION = "https://melany-cv-web.onrender.com/api/contact";
    var FETCH_TIMEOUT_MS = 60000;

    function isLocalHostname() {
      var host = window.location.hostname;
      return !host || host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    }

    function getContactUrl() {
      if (window.CONTACT_API_URL) return String(window.CONTACT_API_URL);
      var host = window.location.hostname;
      var port = window.location.port;
      if (window.location.protocol === "file:") {
        return "http://localhost:3000/api/contact";
      }
      if (isLocalHostname()) {
        if (!port || port === "3000") return "/api/contact";
        return "http://localhost:3000/api/contact";
      }
      if (host === "melany-cv-web.onrender.com") return "/api/contact";
      return CONTACT_API_PRODUCTION;
    }

    function showFormError(message) {
      if (statusEl) {
        statusEl.textContent = message;
        statusEl.classList.remove("hidden", "text-emerald-300");
        statusEl.classList.add("text-red-300");
      }
      showToast(message, true);
    }

    function showFormSuccess(message) {
      var text = message || "Message envoyé ! Je vous réponds dès que possible.";
      form.reset();
      clearErrors();
      if (statusEl) {
        statusEl.textContent = text;
        statusEl.classList.remove("hidden", "text-red-300");
        statusEl.classList.add("text-emerald-300");
      }
      showToast(text, false);
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      clearErrors();
      var payload = validate();
      if (!payload) return;

      var url = getContactUrl();
      var controller = new AbortController();
      var timeoutId = setTimeout(function () {
        controller.abort();
      }, FETCH_TIMEOUT_MS);

      setLoading(true);
      console.log("[contact] POST", url);

      try {
        var response = await fetch(url, {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        var data = {};
        try {
          data = await response.json();
        } catch (parseErr) {
          console.error("[contact] JSON illisible:", parseErr);
        }

        console.log("[contact] HTTP", response.status, data);

        if (response.ok) {
          showFormSuccess(
            (data && data.message) || "Message envoyé ! Je vous réponds dès que possible."
          );
        } else {
          showFormError(
            (data && data.error) || "Impossible d'envoyer le message. Réessayez plus tard."
          );
        }
      } catch (err) {
        console.error("[contact] échec:", err);
        var message = "Connexion impossible. Réessayez dans un instant.";
        if (err && err.name === "AbortError") {
          message =
            "Le serveur met trop de temps à répondre (réveil Render). Réessayez dans une minute.";
        }
        showFormError(message);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    });
  }

  initReveal();
  initSmoothAnchors();
  initMobileNav();
  initContactForm();

  var style = document.createElement("style");
  style.textContent =
    "#site-header.header--scrolled { background-color: rgba(26,37,51,0.98); box-shadow: 0 10px 32px rgba(0,0,0,0.35); border-bottom-color: rgba(255,255,255,0.12); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }";
  document.head.appendChild(style);
})();
