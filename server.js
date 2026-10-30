"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "").replace(/\s+/g, "");
const SMTP_HOST = String(process.env.SMTP_HOST || "smtp.mail.yahoo.com").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_SECURE = process.env.SMTP_SECURE !== "false";
const CONTACT_TO = String(process.env.CONTACT_TO || "melany.from@yahoo.com").trim();

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

function createTransporter(overrides) {
  const options = overrides || {};
  const port = Number(options.port || SMTP_PORT);
  const secure = options.secure != null ? options.secure : SMTP_SECURE && port === 465;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: port,
    secure: secure,
    requireTLS: port === 587,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

function buildMailOptions(nom, email, sujet, message) {
  return {
    from: '"' + nom.replace(/"/g, "") + '" <' + SMTP_USER + ">",
    to: CONTACT_TO,
    replyTo: email,
    subject: "[Portfolio] " + sujet,
    text:
      "Nouveau message depuis le portfolio\n\n" +
      "Nom : " +
      nom +
      "\nE-mail : " +
      email +
      "\nSujet : " +
      sujet +
      "\n\n" +
      message,
    html:
      "<p>Nouveau message depuis le portfolio</p>" +
      "<p><strong>Nom :</strong> " +
      escapeHtml(nom) +
      "<br><strong>E-mail :</strong> " +
      escapeHtml(email) +
      "<br><strong>Sujet :</strong> " +
      escapeHtml(sujet) +
      "</p>" +
      "<p>" +
      escapeHtml(message).replace(/\n/g, "<br>") +
      "</p>",
  };
}

async function sendContactMail(mailOptions) {
  try {
    const primary = createTransporter();
    await primary.sendMail(mailOptions);
    return;
  } catch (primaryErr) {
    console.error("[smtp] échec port", SMTP_PORT, primaryErr);
    if (SMTP_PORT === 465) {
      console.error("[smtp] tentative de repli STARTTLS port 587");
      const fallback = createTransporter({ port: 587, secure: false });
      await fallback.sendMail(mailOptions);
      return;
    }
    throw primaryErr;
  }
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
    smtpConfigured: Boolean(SMTP_USER && SMTP_PASS),
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
      message: "Message envoyé avec succès !",
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

  if (!SMTP_USER || !SMTP_PASS) {
    console.error("[smtp] SMTP_USER ou SMTP_PASS manquant. Vérifiez le fichier .env ou les variables Render.");
    return sendJson(res, 500, {
      success: false,
      error: "L'envoi est temporairement indisponible (SMTP non configuré).",
    });
  }

  try {
    await sendContactMail(buildMailOptions(nom, email, sujet, message));
    return sendJson(res, 200, {
      success: true,
      message: "Message envoyé avec succès !",
    });
  } catch (err) {
    console.error("[smtp] envoi impossible:", err);
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
  console.log("[smtp] host=%s port=%s user=%s configured=%s", SMTP_HOST, SMTP_PORT, SMTP_USER || "(vide)", Boolean(SMTP_USER && SMTP_PASS));
});

server.on("error", function (err) {
  if (err.code === "EADDRINUSE") {
    var nextPort = Number(PORT) + 1;
    console.log("Le port " + PORT + " est déjà utilisé. Essai sur le port " + nextPort + "...");
    app.listen(nextPort, function () {
      console.log("Serveur démarré sur http://localhost:" + nextPort);
      console.log("[smtp] host=%s port=%s user=%s configured=%s", SMTP_HOST, SMTP_PORT, SMTP_USER || "(vide)", Boolean(SMTP_USER && SMTP_PASS));
    });
  } else {
    console.error("[server] impossible de démarrer:", err);
  }
});
