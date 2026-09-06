/**
 * mailer.js — outbound SMTP, wrapped so nothing else has to know about it.
 *
 * Same graceful-degrade contract as utils/cloudinary.js and the Gemini
 * client: with MAIL_HOST/MAIL_USER unset, every send logs once and no-ops.
 * A teammate cloning the repo gets a working app, not a crash on the first
 * leave approval.
 *
 * The transporter is built lazily and cached. Building it at import time
 * would make the module's behaviour depend on whether dotenv had run yet,
 * which is exactly the kind of ordering bug that only shows up in
 * production.
 */

import nodemailer from "nodemailer";

let transporter = null;
let warnedDisabled = false;

export function mailEnabled() {
  return Boolean(process.env.MAIL_HOST && process.env.MAIL_USER);
}

function getTransporter() {
  if (transporter) return transporter;

  const port = Number(process.env.MAIL_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port,
    // 465 is implicit TLS; 587 starts plaintext and upgrades via STARTTLS.
    // Getting this backwards produces a connection that hangs rather than a
    // clear error, so derive it instead of asking for another env var.
    secure: port === 465,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
  return transporter;
}

/**
 * Send one message. Never throws — a bounced email must not fail the request
 * that produced the notification.
 *
 * @returns {{ ok: boolean, disabled?: boolean, error?: string }}
 */
export async function sendMail({ to, subject, html, text }) {
  if (!mailEnabled()) {
    if (!warnedDisabled) {
      console.log("[mailer] MAIL_HOST/MAIL_USER not set — email delivery disabled");
      warnedDisabled = true;
    }
    return { ok: false, disabled: true };
  }
  if (!to) return { ok: false, error: "no recipient" };

  try {
    await getTransporter().sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to,
      subject,
      // Always both. Some corporate clients strip HTML entirely, and a
      // text/plain part is also what stops a message scoring as spam for
      // being HTML-only.
      text,
      html,
    });
    return { ok: true };
  } catch (err) {
    console.error(`[mailer] send failed for ${to}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/** Test seam — lets a suite reset the cached transporter and the once-only log. */
export function resetMailer() {
  transporter = null;
  warnedDisabled = false;
}

export default sendMail;
