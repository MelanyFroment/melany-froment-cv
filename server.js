"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const BREVO_API_KEY = String(process.env.BREVO_API_KEY || "").trim();
const CONTACT_TO = String(process.env.CONTACT_TO || "melany.from@yahoo.com").trim();
const CONTACT_FROM = String(process.env.CONTACT_FROM || "melany.from@yahoo.com").trim();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 8;
const rateHits = new Map();

const BLOCKED_PATHS = new Set([
  "/server.js",
  "/package.json",
  "/package-lock.json",
  "/.env.example",
  "/.gitignore",
]);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function sendJson(res, status, payload) {
  res.set("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}

function allowRequest(ip) {
  const now = Date.now();
  const previous = rateHits.get(ip) || [];
  const recent = previous.filter(function (stamp) {
    return now - stamp < RATE_WINDOW_MS;
  });
  if (recent.length >= RATE_MAX) {
    rateHits.set(ip, recent);
    return false;
  }
  recent.push(now);
  rateHits.set(ip, recent);
  return true;
}

function buildContactEmailHtml(nom, email, sujet, message) {
  var safeNom = escapeHtml(nom);
  var safeEmail = escapeHtml(email);
  var safeSujet = escapeHtml(sujet);
  var safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

  return (
    '<!DOCTYPE html>' +
    '<html lang="fr">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    "<title>Nouveau message</title></head>" +
    '<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">' +
    "<tr><td align=\"center\">" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#1e293b;border-radius:12px;overflow:hidden;">' +
    "<tr><td style=\"padding:28px 32px 12px 32px;\">" +
    '<p style="margin:0;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#f7f3ec;">MF. CV</p>' +
    '<p style="margin:6px 0 0 0;font-size:13px;color:#94a3b8;">Mélany Froment</p>' +
    "</td></tr>" +
    "<tr><td style=\"padding:8px 32px 24px 32px;\">" +
    '<h1 style="margin:0;font-size:28px;line-height:1.25;font-weight:500;color:#f8fafc;">Nouveau ' +
    '<span style="display:inline-block;padding:2px 10px;border-radius:999px;background-color:#22c55e;color:#052e16;font-size:22px;font-weight:600;vertical-align:middle;">message</span></h1>' +
    '<p style="margin:14px 0 0 0;font-size:15px;line-height:1.6;color:#cbd5e1;">' +
    safeNom +
    " vous a envoyé un message depuis votre site internet. Répondez directement à cet e-mail pour lui écrire." +
    "</p>" +
    "</td></tr>" +
    "<tr><td style=\"padding:0 24px 28px 24px;\">" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;border-radius:12px;border:1px solid #334155;">' +
    "<tr><td style=\"padding:22px 24px;\">" +
    '<p style="margin:0 0 4px 0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">Nom</p>' +
    '<p style="margin:0 0 16px 0;font-size:16px;color:#f8fafc;">' +
    safeNom +
    "</p>" +
    '<p style="margin:0 0 4px 0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">Email</p>' +
    '<p style="margin:0 0 16px 0;font-size:16px;color:#93c5fd;">' +
    '<a href="mailto:' +
    safeEmail +
    '" style="color:#93c5fd;text-decoration:none;">' +
    safeEmail +
    "</a></p>" +
    '<p style="margin:0 0 4px 0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">Sujet</p>' +
    '<p style="margin:0 0 16px 0;font-size:16px;color:#f8fafc;">' +
    safeSujet +
    "</p>" +
    '<p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">Message</p>' +
    '<p style="margin:0;font-size:15px;line-height:1.7;color:#e2e8f0;white-space:pre-wrap;">' +
    safeMessage +
    "</p>" +
    "</td></tr></table>" +
    "</td></tr>" +
    "<tr><td style=\"padding:0 32px 28px 32px;\">" +
    '<p style="margin:0;font-size:12px;color:#64748b;">Envoyé depuis le formulaire de contact du portfolio.</p>' +
    "</td></tr>" +
    "</table></td></tr></table></body></html>"
  );
}

async function sendViaBrevo(nom, email, sujet, message) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Site CV Mélany", email: CONTACT_FROM },
      to: [{ email: CONTACT_TO, name: "Mélany Froment" }],
      replyTo: { email: email, name: nom },
      subject: "[Contact CV] " + sujet,
      htmlContent: buildContactEmailHtml(nom, email, sujet, message),
    }),
  });

  var payload = {};
  try {
    payload = await response.json();
  } catch (parseErr) {
    payload = {};
  }

  if (!response.ok) {
    console.error("[brevo] HTTP", response.status, payload);
    var err = new Error("Brevo a refusé l'envoi.");
    err.status = response.status;
    err.details = payload;
    throw err;
  }

  return payload;
}

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"],
    optionsSuccessStatus: 204,
  })
);
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));

app.use(function (req, res, next) {
  const pathname = req.path.toLowerCase();
  if (
    pathname.startsWith("/node_modules") ||
    BLOCKED_PATHS.has(pathname) ||
    pathname.endsWith(".env") ||
    pathname.includes("/.env")
  ) {
    return res.status(404).end();
  }
  next();
});

app.get("/api/health", function (req, res) {
  res.json({
    ok: true,
    brevoConfigured: Boolean(BREVO_API_KEY),
  });
});

app.post("/api/contact", async function (req, res) {
  if (!allowRequest(clientIp(req))) {
    return sendJson(res, 429, {
      success: false,
      error: "Trop de tentatives. Réessayez dans quelques minutes.",
    });
  }

  const body = req.body || {};
  const honeypot = String(body.website || "").trim();
  if (honeypot) {
    return sendJson(res, 200, {
      success: true,
      message: "E-mail envoyé avec succès",
    });
  }

  const nom = String(body.nom || "").trim();
  const email = String(body.email || "").trim();
  const sujet = String(body.sujet || "").trim();
  const message = String(body.message || "").trim();

  if (nom.length < 2 || nom.length > 100) {
    return sendJson(res, 400, { success: false, error: "Indiquez un nom valide." });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return sendJson(res, 400, { success: false, error: "Indiquez une adresse e-mail valide." });
  }
  if (sujet.length < 2 || sujet.length > 150) {
    return sendJson(res, 400, { success: false, error: "Indiquez un sujet." });
  }
  if (message.length < 10 || message.length > 4000) {
    return sendJson(res, 400, {
      success: false,
      error: "Le message doit contenir entre 10 et 4000 caractères.",
    });
  }

  if (!BREVO_API_KEY) {
    console.error("[brevo] BREVO_API_KEY manquant. Vérifiez le fichier .env ou les variables Render.");
    return sendJson(res, 500, {
      success: false,
      error: "L'envoi est temporairement indisponible.",
    });
  }

  try {
    await sendViaBrevo(nom, email, sujet, message);
    return sendJson(res, 200, {
      success: true,
      message: "E-mail envoyé avec succès",
    });
  } catch (err) {
    console.error("[brevo] envoi impossible:", err);
    return sendJson(res, 500, {
      success: false,
      error: "Impossible d'envoyer le message. Réessayez plus tard.",
    });
  }
});

app.use("/api", function (req, res) {
  res.status(404).json({
    success: false,
    error: "Route API introuvable.",
    path: req.path,
  });
});

app.use(
  express.static(ROOT, {
    dotfiles: "deny",
    index: "index.html",
  })
);

app.use(function (err, req, res, next) {
  console.error("[server]", err);
  if (res.headersSent) {
    return next(err);
  }
  const isJsonError = err.type === "entity.parse.failed";
  res.status(isJsonError ? 400 : err.status || 500).json({
    success: false,
    error: isJsonError ? "Requête invalide." : "Erreur serveur.",
  });
});

const server = app.listen(PORT, function () {
  console.log("Serveur démarré sur http://localhost:" + PORT);
  console.log("[brevo] configured=%s", Boolean(BREVO_API_KEY));
});

server.on("error", function (err) {
  if (err.code === "EADDRINUSE") {
    var nextPort = Number(PORT) + 1;
    console.log("Le port " + PORT + " est déjà utilisé. Essai sur le port " + nextPort + "...");
    app.listen(nextPort, function () {
      console.log("Serveur démarré sur http://localhost:" + nextPort);
      console.log("[brevo] configured=%s", Boolean(BREVO_API_KEY));
    });
  } else {
    console.error("[server] impossible de démarrer:", err);
  }
});
