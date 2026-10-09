// Kontaktskjema: sendes med fetch, faller tilbake til vanlig POST uten JavaScript.
(() => {
  const form = document.querySelector(".contact-form");
  if (!form) return;
  const status = form.querySelector(".form-status");
  const button = form.querySelector('button[type="submit"]');

  const setStatus = (text, kind) => {
    status.textContent = text;
    status.className = `form-status ${kind || ""}`;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const navn = form.navn.value.trim();
    const telefon = form.telefon.value.trim();
    const epost = form.epost.value.trim();
    const melding = form.melding.value.trim();

    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    const mangler = [];
    if (navn.length < 2) { mangler.push("navn"); form.navn.setAttribute("aria-invalid", "true"); }
    if (!telefon && !epost) { mangler.push("telefon eller e-post"); form.telefon.setAttribute("aria-invalid", "true"); form.epost.setAttribute("aria-invalid", "true"); }
    if (melding.length < 5) { mangler.push("beskrivelse av oppdraget"); form.melding.setAttribute("aria-invalid", "true"); }
    if (mangler.length) {
      setStatus(`Fyll inn ${mangler.join(", ")}.`, "feil");
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    button.disabled = true;
    setStatus("Sender …");
    try {
      const res = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        form.reset();
        if (window.turnstile) window.turnstile.reset();
        setStatus("Forespørselen er sendt. Vi tar kontakt så snart vi kan.", "ok");
      } else {
        setStatus(data.error || "Forespørselen ble ikke sendt. Prøv igjen, eller ring oss.", "feil");
      }
    } catch {
      setStatus("Ingen forbindelse. Sjekk nettet og prøv igjen, eller ring oss.", "feil");
    } finally {
      button.disabled = false;
    }
  });
})();
