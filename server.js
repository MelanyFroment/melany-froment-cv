"use strict";

require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.mail.yahoo.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_SECURE = process.env.SMTP_SECURE !== "false";
const CONTACT_TO = process.env.CONTACT_TO || "melany.from@yahoo.com";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 5;
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

function createTransporter() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

const corsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(function (origin) {
    return origin.trim();
  })
  .filter(Boolean);

app.disable("x-powered-by");
app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : true,
    methods: ["POST", "OPTIONS"],
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

app.post("/api/contact", async function (req, res) {
  if (!allowRequest(clientIp(req))) {
    return res.status(429).json({
      success: false,
      error: "Trop de tentatives. Réessayez dans quelques minutes.",
    });
  }

  const body = req.body || {};
  const honeypot = String(body.website || "").trim();
  if (honeypot) {
    return res.json({ success: true });
  }

  const nom = String(body.nom || "").trim();
  const email = String(body.email || "").trim();
  const sujet = String(body.sujet || "").trim();
  const message = String(body.message || "").trim();

  if (nom.length < 2 || nom.length > 100) {
    return res.status(400).json({ success: false, error: "Indiquez un nom valide." });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ success: false, error: "Indiquez une adresse e-mail valide." });
  }
  if (sujet.length < 2 || sujet.length > 150) {
    return res.status(400).json({ success: false, error: "Indiquez un sujet." });
  }
  if (message.length < 10 || message.length > 4000) {
    return res.status(400).json({
      success: false,
      error: "Le message doit contenir entre 10 et 4000 caractères.",
    });
  }

  if (!SMTP_USER || !SMTP_PASS) {
    console.error("SMTP_USER ou SMTP_PASS manquant.");
    return res.status(500).json({
      success: false,
      error: "L'envoi est temporairement indisponible.",
    });
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
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
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("Envoi du message impossible:", err && err.message);
    return res.status(500).json({
      success: false,
      error: "Impossible d'envoyer le message. Réessayez plus tard.",
    });
  }
});

app.use(
  express.static(ROOT, {
    dotfiles: "deny",
    index: "index.html",
  })
);

app.listen(PORT, function () {
  console.log("Serveur démarré sur le port " + PORT);
});
