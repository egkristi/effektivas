# effektivas.no

Nettsiden til **Effektiv AS** – vaktmester- og entreprenørfirma på Fevik.

Statisk side servert fra Cloudflare sitt edge med **Workers Static Assets**, og en liten Worker for kontaktskjemaet. Deployes med `wrangler`. Ingen byggesteg og ingen runtime-avhengigheter.

## Struktur

```
public/              Statiske filer (serveres som de er)
  index.html         Forsiden
  personvern.html    Personvernerklæring
  takk.html          Kvittering etter skjema uten JavaScript
  404.html           Ikke funnet
  assets/            CSS, JS, favicon, delingsbilde
  robots.txt, sitemap.xml
src/worker.js        Worker: /api/kontakt, www→apex-redirect, sikkerhetsheadere
wrangler.jsonc       Cloudflare-konfigurasjon (domene, assets, e-postbinding)
.github/workflows/   Automatisk deploy ved push til main
```

## Lokal utvikling

```bash
npm install
npm run dev          # http://localhost:8787
npm run check        # validerer konfig uten å deploye
```

## Deploy

Første gang, fra egen maskin:

```bash
npx wrangler login
npm run deploy
```

Forutsetninger i Cloudflare:

1. **Sonen `effektivas.no` må ligge i Cloudflare-kontoen.** `routes` med `custom_domain: true` oppretter da DNS og sertifikat for `effektivas.no` og `www.effektivas.no` automatisk. Eksisterende A/CNAME-poster på disse navnene må fjernes først.
2. **Email Routing** må være aktivert på sonen, og `post@effektivas.no` må være en verifisert mottaker (Email → Email Routing → Destination addresses). Ellers feiler sending fra skjemaet. Uten `send_email`-bindingen logges henvendelsene bare (se `wrangler tail`).

### Automatisk deploy (GitHub Actions)

Legg inn to repository secrets:

- `CLOUDFLARE_API_TOKEN` – token med malen «Edit Cloudflare Workers» (+ Zone: Workers Routes / DNS edit på effektivas.no)
- `CLOUDFLARE_ACCOUNT_ID`

Hver push til `main` deployes da automatisk.

## Spam-vern (valgfritt)

Skjemaet har honeypot og server-side validering. For Turnstile:

1. Opprett en Turnstile-widget for `effektivas.no` i Cloudflare.
2. `npx wrangler secret put TURNSTILE_SECRET`
3. Fjern kommentaren rundt Turnstile-blokken i `public/index.html` og sett `data-sitekey`.

## Må fylles inn før lansering

Disse er plassholdere i `public/*.html` (søk etter `000`):

- [ ] Telefonnummer (`000 00 000` / `tel:+4700000000`) – også i JSON-LD i `index.html`
- [ ] Organisasjonsnummer (`Org.nr. 000 000 000`)
- [ ] Postadresse / gateadresse hvis ønsket
- [ ] Bekreft tjenestelisten og områdene
- [ ] Bekreft e-postadressene i `wrangler.jsonc` (`CONTACT_TO`, `CONTACT_FROM`)
