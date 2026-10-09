import { EmailMessage } from "cloudflare:email";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

const MAX = { navn: 120, telefon: 40, epost: 200, adresse: 200, tjeneste: 80, melding: 4000 };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // www.effektivas.no -> effektivas.no
    if (env.CANONICAL_HOST && url.hostname === `www.${env.CANONICAL_HOST}`) {
      url.hostname = env.CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/api/kontakt") {
      if (request.method === "POST") {
        const res = await handleContact(request, env);
        // Uten JavaScript poster skjemaet direkte – send brukeren til en vanlig side.
        const wantsJson = (request.headers.get("accept") || "").includes("application/json");
        if (!wantsJson) {
          const target = res.ok ? "/takk" : "/#kontakt";
          return withHeaders(Response.redirect(new URL(target, url).toString(), 303));
        }
        return withHeaders(res);
      }
      return withHeaders(json({ ok: false, error: "Metoden er ikke tillatt." }, 405, { Allow: "POST" }));
    }

    if (url.pathname === "/api/helse") {
      return withHeaders(json({ ok: true, tid: new Date().toISOString() }));
    }

    if (url.pathname.startsWith("/api/")) {
      return withHeaders(json({ ok: false, error: "Ikke funnet." }, 404));
    }

    const asset = withHeaders(await env.ASSETS.fetch(request));
    if (url.pathname.startsWith("/assets/") && asset.ok) {
      asset.headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    }
    return asset;
  },
};

async function handleContact(request, env) {
  const type = request.headers.get("content-type") || "";
  let data;
  try {
    if (type.includes("application/json")) {
      data = await request.json();
    } else {
      data = Object.fromEntries(await request.formData());
    }
  } catch {
    return json({ ok: false, error: "Kunne ikke lese skjemaet." }, 400);
  }

  // Honeypot – ekte brukere ser ikke dette feltet.
  if (data.nettsted) return json({ ok: true });

  const felt = {};
  for (const [key, max] of Object.entries(MAX)) {
    felt[key] = String(data[key] ?? "").trim().slice(0, max);
  }

  const feil = [];
  if (felt.navn.length < 2) feil.push("Navn mangler.");
  if (!felt.telefon && !felt.epost) feil.push("Oppgi telefon eller e-post.");
  if (felt.epost && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(felt.epost)) feil.push("E-postadressen ser ikke riktig ut.");
  if (felt.melding.length < 5) feil.push("Skriv litt om oppdraget.");
  if (feil.length) return json({ ok: false, error: feil.join(" ") }, 422);

  if (env.TURNSTILE_SECRET) {
    const token = String(data["cf-turnstile-response"] || "");
    const ok = await verifyTurnstile(token, env.TURNSTILE_SECRET, request.headers.get("CF-Connecting-IP"));
    if (!ok) return json({ ok: false, error: "Spam-sjekken feilet. Prøv igjen." }, 403);
  }

  const emne = `Forespørsel fra nettsiden: ${felt.tjeneste || "Generelt"} – ${felt.navn}`;
  const tekst = [
    `Navn:     ${felt.navn}`,
    `Telefon:  ${felt.telefon || "-"}`,
    `E-post:   ${felt.epost || "-"}`,
    `Adresse:  ${felt.adresse || "-"}`,
    `Tjeneste: ${felt.tjeneste || "-"}`,
    "",
    felt.melding,
    "",
    `Sendt ${new Date().toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })} via effektivas.no`,
  ].join("\n");

  if (!env.CONTACT_EMAIL) {
    console.log("Kontaktskjema (ingen e-postbinding konfigurert):", { emne, tekst });
    return json({ ok: true });
  }

  try {
    const raw = buildMime({
      from: env.CONTACT_FROM,
      to: env.CONTACT_TO,
      replyTo: felt.epost || undefined,
      subject: emne,
      text: tekst,
    });
    await env.CONTACT_EMAIL.send(new EmailMessage(env.CONTACT_FROM, env.CONTACT_TO, raw));
    return json({ ok: true });
  } catch (err) {
    console.error("Sending av e-post feilet:", err);
    return json({ ok: false, error: "Vi fikk ikke sendt meldingen. Ring oss gjerne i stedet." }, 502);
  }
}

async function verifyTurnstile(token, secret, ip) {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const out = await res.json().catch(() => ({}));
  return out.success === true;
}

// Minimal RFC 5322-melding uten eksterne avhengigheter. Emne og brødtekst kodes
// slik at æ/ø/å kommer trygt fram.
function buildMime({ from, to, replyTo, subject, text }) {
  const enc = (s) => `=?UTF-8?B?${b64(s)}?=`;
  const domain = String(from).split("@")[1] || "effektivas.no";
  const headers = [
    `From: ${enc("Effektiv AS – nettside")} <${from}>`,
    `To: <${to}>`,
    replyTo ? `Reply-To: <${replyTo.replace(/[\r\n<>]/g, "")}>` : null,
    `Subject: ${enc(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);
  const bodyB64 = b64(text).replace(/.{1,76}/g, "$&\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${bodyB64}`;
}

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

function withHeaders(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}
