const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

const disciplines = {
  normal: { name: "Normal", laps: 20, flexible: true },
  rescue50: { name: "50 m Retten", laps: 2 },
  rescue100: { name: "100 m Retten", laps: 2 },
  lifesaver100: { name: "100 m Lifesaver", laps: 3 },
  medley100: { name: "100 m Kombi", laps: 3 },
  superLifesaver200: { name: "200 m Super Lifesaver", laps: 7 },
  obstacle200: { name: "200 m Hindernis", laps: 4 },
};

let refreshTimer = null;
let cooldownTimer = null;
let animationFrame = null;
let toastTimer = null;

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="/icons.svg#${name}"></use></svg>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: options.body ? { "content-type": "application/json", ...options.headers } : options.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Die Anfrage ist fehlgeschlagen.");
  return data;
}

function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return { page: parts[0] || "home", id: parts[1] || null };
}

function dateText(value) {
  if (!value) return "Kein Datum";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(new Date(`${value}T12:00:00`));
}

function formatTime(centiseconds) {
  const safe = Math.max(0, Math.floor(Number(centiseconds) || 0));
  const minutes = Math.floor(safe / 6000);
  const seconds = Math.floor((safe % 6000) / 100);
  const hundredths = safe % 100;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(hundredths).padStart(2, "0")}`;
}

function parseTime(value) {
  const match = String(value).trim().match(/^(\d{1,3}):([0-5]\d)[,.](\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 6000 + Number(match[2]) * 100 + Number(match[3]);
}

function disciplineOptions(selected = "normal") {
  return Object.entries(disciplines).map(([id, item]) =>
    `<option value="${id}" ${id === selected ? "selected" : ""}>${item.name} · ${item.flexible ? "max. " : ""}${item.laps} Laps</option>`
  ).join("");
}

function setDocumentTitle(title) {
  document.title = title ? `${title} · Lifesaving Timer` : "Lifesaving Timer";
}

function renderError(error, back = "#/", backText = "Zurück zur Übersicht") {
  app.innerHTML = `
    <a class="back" href="${back}">${icon("arrow-left")} ${backText}</a>
    <div class="card"><h1>Fehler</h1><p class="lead">${escapeHtml(error.message)}</p>
    <button class="button secondary" id="retry">${icon("refresh")} Erneut versuchen</button></div>`;
  document.querySelector("#retry").addEventListener("click", renderRoute);
}

function openDialog(id) {
  const dialog = document.querySelector(id);
  dialog.showModal();
  dialog.querySelector("input, select")?.focus();
}

function bindDialogClose(dialog) {
  dialog.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

async function renderHome() {
  setDocumentTitle("");
  const { events } = await api("/events");
  app.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">Rettungssport</p><h1>Events</h1></div>
      <button class="button" id="new-event">${icon("plus")} Neues Event</button>
    </div>
    <div class="notice">Öffentlich · ohne Anmeldung</div>
    <section class="section" aria-labelledby="events-heading">
      <div class="section-head"><h2 id="events-heading">Alle Events</h2><span class="muted">${events.length} ${events.length === 1 ? "Event" : "Events"}</span></div>
      ${events.length ? `<div class="stack">${events.map((event) => `
        <article class="card event-row">
          <div><h3>${escapeHtml(event.name)}</h3><div class="event-meta">
            <span class="meta-item">${icon("calendar")} ${escapeHtml(dateText(event.event_date))}</span>
            ${event.location ? `<span class="meta-item">${icon("location")} ${escapeHtml(event.location)}</span>` : ""}
            <span class="meta-item">${icon("users")} ${event.participant_count}</span><span class="meta-item">${icon("flag")} ${event.result_count}</span>
          </div></div>
          <a class="button secondary" href="#/event/${event.id}">Öffnen ${icon("arrow-right")}</a>
        </article>`).join("")}</div>` : `<div class="empty">Noch kein Event vorhanden. Lege das erste Event an.</div>`}
    </section>
    <dialog id="event-dialog"><form class="dialog-body" id="event-form">
      <h2>Neues Event</h2>
      <div class="form-grid">
        <div class="field full"><label for="event-name">Eventname</label><input id="event-name" name="name" maxlength="120" required placeholder="z. B. Vereinsmeisterschaft 2026"></div>
        <div class="field"><label for="event-date">Datum</label><input id="event-date" name="eventDate" type="date"></div>
        <div class="field"><label for="event-location">Ort</label><input id="event-location" name="location" maxlength="120" placeholder="z. B. Berlin"></div>
      </div>
      <p class="form-error" id="event-error" role="alert"></p>
      <div class="form-actions"><button type="button" class="button secondary" data-close>Abbrechen</button><button class="button">Event anlegen</button></div>
    </form></dialog>`;

  const dialog = document.querySelector("#event-dialog");
  bindDialogClose(dialog);
  document.querySelector("#new-event").addEventListener("click", () => openDialog("#event-dialog"));
  document.querySelector("#event-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.submitter;
    const error = document.querySelector("#event-error");
    try {
      submit.disabled = true;
      error.textContent = "";
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const created = await api("/events", { method: "POST", body: JSON.stringify(values) });
      dialog.close();
      location.hash = `#/event/${created.id}`;
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
    }
  });
}

async function renderEvent(id) {
  const { event, participants } = await api(`/events/${id}`);
  setDocumentTitle(event.name);
  app.innerHTML = `
    <a class="back" href="#/">${icon("arrow-left")} Events</a>
    <div class="page-head"><div><p class="eyebrow">${escapeHtml(dateText(event.event_date))}</p><h1>${escapeHtml(event.name)}</h1>
      <p class="lead">${event.location ? escapeHtml(event.location) : "Kein Ort angegeben"} · ${participants.length} Personen</p></div>
      <button class="button danger small" id="delete-event">${icon("trash")} Löschen</button>
    </div>
    <div class="grid">
      <article class="card action-card"><span class="action-icon">${icon("timer")}</span><h2>Timer</h2><p>Stoppen und Laps erfassen</p><a class="button" href="#/timer/${id}">${icon("play")} Öffnen</a></article>
      <article class="card action-card"><span class="action-icon">${icon("eye")}</span><h2>Ergebnisse</h2><p>Ranglisten live ansehen</p><a class="button secondary" href="#/viewer/${id}">${icon("eye")} Öffnen</a></article>
    </div>
    <section class="section" aria-labelledby="people-heading">
      <div class="section-head"><h2 id="people-heading">Personen</h2><button class="button secondary" id="new-person">${icon("user-plus")} Hinzufügen</button></div>
      ${participants.length ? `<div class="person-list">
        ${participants.map((person) => `<article class="person-card">
          <div class="person-head"><strong>${escapeHtml(person.name)}</strong><button class="button danger small icon-button delete-person" data-id="${person.id}" data-name="${escapeHtml(person.name)}" data-results="${person.result_count}" aria-label="${escapeHtml(person.name)} löschen" title="Löschen">${icon("trash")}</button></div>
          <div class="person-details"><span>${person.gender === "male" ? "Männlich" : "Weiblich"} · Jg. ${person.birth_year} · ${escapeHtml(person.age_group)}</span><span>${escapeHtml(person.organization)}</span><span>${person.result_count} ${person.result_count === 1 ? "Ergebnis" : "Ergebnisse"}</span></div>
        </article>`).join("")}</div>` : `<div class="empty">Noch keine Personen.</div>`}
    </section>
    <dialog id="person-dialog"><form class="dialog-body" id="person-form">
      <h2>Person hinzufügen</h2><div class="form-grid">
        <div class="field full"><label for="person-name">Name</label><input id="person-name" name="name" maxlength="120" autocomplete="name" required></div>
        <div class="field"><label for="birth-year">Jahrgang</label><input id="birth-year" name="birthYear" type="number" min="1900" max="2200" inputmode="numeric" required></div>
        <div class="field"><label for="age-group">Altersklasse</label><input id="age-group" name="ageGroup" maxlength="40" required placeholder="z. B. AK 15/16"></div>
        <div class="field"><label for="gender">Geschlecht</label><select id="gender" name="gender" required><option value="female">Weiblich</option><option value="male">Männlich</option></select></div>
        <div class="field"><label for="organization">Gliederung</label><input id="organization" name="organization" maxlength="120" required placeholder="Verein / Ortsgruppe"></div>
      </div><p class="form-error" id="person-error" role="alert"></p>
      <div class="form-actions"><button type="button" class="button secondary" data-close>Abbrechen</button><button class="button">Person speichern</button></div>
    </form></dialog>`;

  const dialog = document.querySelector("#person-dialog");
  bindDialogClose(dialog);
  document.querySelector("#new-person").addEventListener("click", () => openDialog("#person-dialog"));
  document.querySelector("#person-form").addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const button = submitEvent.submitter;
    try {
      button.disabled = true;
      const values = Object.fromEntries(new FormData(submitEvent.currentTarget));
      await api(`/events/${id}/participants`, { method: "POST", body: JSON.stringify(values) });
      showToast("Person wurde hinzugefügt.");
      await renderEvent(id);
    } catch (err) {
      document.querySelector("#person-error").textContent = err.message;
      button.disabled = false;
    }
  });

  document.querySelectorAll(".delete-person").forEach((button) => button.addEventListener("click", async () => {
    const warning = Number(button.dataset.results) > 0 ? " Dabei werden auch alle Ergebnisse dieser Person gelöscht." : "";
    if (!confirm(`${button.dataset.name} wirklich löschen?${warning}`)) return;
    try {
      button.disabled = true;
      await api(`/events/${id}/participants/${button.dataset.id}`, { method: "DELETE" });
      showToast("Person wurde gelöscht.");
      await renderEvent(id);
    } catch (err) { showToast(err.message); button.disabled = false; }
  }));

  document.querySelector("#delete-event").addEventListener("click", async () => {
    if (!confirm(`Event „${event.name}“ mit allen Personen und Ergebnissen unwiderruflich löschen?`)) return;
    try {
      await api(`/events/${id}`, { method: "DELETE" });
      showToast("Event wurde gelöscht.");
      location.hash = "#/";
    } catch (err) { showToast(err.message); }
  });
}

async function renderTimer(id) {
  const { event, participants } = await api(`/events/${id}`);
  setDocumentTitle(`Timer – ${event.name}`);
  const timer = {
    status: "idle",
    startedAt: 0,
    displayed: 0,
    segments: [],
    discipline: "normal",
  };

  app.innerHTML = `
    <div class="timer-shell"><a class="back" href="#/event/${id}">${icon("arrow-left")} ${escapeHtml(event.name)}</a>
      <h1>Timer</h1>
      <div class="timer-setup"><div class="field"><label for="discipline">Stoppmodus</label><select id="discipline">${disciplineOptions()}</select></div>
        <span class="muted" id="lap-limit">Bis zu 20 Abschnitte</span></div>
      <section class="card clock-card" aria-label="Stoppuhr">
        <div class="clock-status" id="clock-status">Bereit</div><div class="clock" id="clock" aria-live="off">00:00,00</div>
        <div class="timer-actions">
          <button class="button" id="start">${icon("play")} Start</button><button class="button secondary" id="lap" disabled>${icon("lap")} Lap</button><button class="button danger" id="stop" disabled>${icon("stop")} Stopp</button>
        </div>
        <div class="timer-secondary"><button class="button secondary small" id="undo" disabled>${icon("undo")} Lap zurück</button><button class="button secondary small" id="abort" disabled>${icon("x")} Verwerfen</button></div>
        <p class="progress-note" id="progress">Bereit</p>
      </section>
      <div class="card lap-list" id="lap-list" hidden></div>
      <section class="card save-panel" id="save-panel" hidden></section>
    </div>`;

  const elements = Object.fromEntries(["discipline", "clock-status", "clock", "start", "lap", "stop", "undo", "abort", "progress", "lap-list", "save-panel", "lap-limit"].map((key) => [key, document.querySelector(`#${key}`)]));

  const currentCs = () => timer.status === "running" ? Math.floor((performance.now() - timer.startedAt) / 10) : timer.displayed;
  const capturedTotal = () => timer.segments.reduce((sum, value) => sum + value, 0);
  const config = () => disciplines[timer.discipline];

  function drawClock() {
    elements.clock.textContent = formatTime(currentCs());
    if (timer.status === "running") animationFrame = requestAnimationFrame(drawClock);
  }

  function renderLaps() {
    elements["lap-list"].hidden = timer.segments.length === 0;
    elements["lap-list"].innerHTML = timer.segments.length ? `<h2>Abschnitte</h2>${timer.segments.map((value, index) =>
      `<div class="lap-row"><span>Lap ${index + 1}</span><strong>${formatTime(value)}</strong></div>`).join("")}` : "";
  }

  function updateProgress() {
    const item = config();
    elements.progress.textContent = timer.status === "idle" ? "Bereit" :
      item.flexible ? `${timer.segments.length} von maximal ${item.laps} Abschnitten erfasst.` :
      `${timer.segments.length} von ${item.laps} Abschnitten erfasst.`;
    elements["lap-limit"].textContent = item.flexible ? `Bis zu ${item.laps} Abschnitte` : `${item.laps} Abschnitte fest vorgegeben`;
  }

  function resetTimer() {
    cancelAnimationFrame(animationFrame);
    Object.assign(timer, { status: "idle", startedAt: 0, displayed: 0, segments: [] });
    elements.clock.textContent = "00:00,00";
    elements["clock-status"].textContent = "Bereit";
    elements.start.disabled = false;
    elements.start.hidden = false;
    elements.lap.disabled = true;
    elements.stop.disabled = true;
    elements.undo.disabled = true;
    elements.abort.disabled = true;
    elements.discipline.disabled = false;
    elements["save-panel"].hidden = true;
    renderLaps(); updateProgress();
  }

  function addSegment() {
    const total = currentCs();
    const segment = total - capturedTotal();
    if (segment <= 0) return false;
    timer.segments.push(segment);
    renderLaps(); updateProgress();
    return true;
  }

  function renderSavePanel() {
    const panel = elements["save-panel"];
    panel.hidden = false;
    panel.innerHTML = `<h2>Ergebnis</h2>
      <div class="edit-times">${timer.segments.map((value, index) => `<div class="field"><label for="segment-${index}">Lap ${index + 1}</label><input class="segment-input" id="segment-${index}" inputmode="decimal" value="${formatTime(value)}" aria-describedby="save-error"></div>`).join("")}</div>
      <div class="total-summary"><span>Gesamtzeit</span><strong id="save-total">${formatTime(capturedTotal())}</strong></div>
      <div class="field"><label for="participant">Person</label><select id="participant"><option value="">Auswählen …</option>${participants.map((person) =>
        `<option value="${person.id}">${escapeHtml(person.name)} · ${escapeHtml(person.age_group)} · ${escapeHtml(person.organization)}</option>`).join("")}</select></div>
      ${participants.length ? "" : `<p class="notice">Zuerst eine Person im Event hinzufügen.</p>`}
      <p class="form-error" id="save-error" role="alert"></p>
      <div class="form-actions"><button class="button secondary" id="new-attempt">${icon("x")} Verwerfen</button><button class="button" id="save-result" ${participants.length ? "" : "disabled"}>${icon("save")} Speichern</button></div>`;

    const inputs = [...panel.querySelectorAll(".segment-input")];
    function readCorrections(showError = false) {
      const values = inputs.map((input) => parseTime(input.value));
      const invalid = values.some((value) => value === null || value <= 0);
      panel.querySelector("#save-error").textContent = showError && invalid ? "Bitte alle Zeiten als mm:ss,00 eingeben." : "";
      panel.querySelector("#save-total").textContent = invalid ? "–" : formatTime(values.reduce((sum, value) => sum + value, 0));
      return invalid ? null : values;
    }
    inputs.forEach((input) => input.addEventListener("input", () => readCorrections(false)));
    panel.querySelector("#new-attempt").addEventListener("click", resetTimer);
    panel.querySelector("#save-result").addEventListener("click", async (event) => {
      const segments = readCorrections(true);
      const participantId = panel.querySelector("#participant").value;
      if (!segments || !participantId) {
        if (!participantId) panel.querySelector("#save-error").textContent = "Bitte eine Person auswählen.";
        return;
      }
      try {
        event.currentTarget.disabled = true;
        await api(`/events/${id}/results`, { method: "POST", body: JSON.stringify({ participantId, discipline: timer.discipline, segments }) });
        showToast("Ergebnis wurde gespeichert. Bereit für die nächste Person.");
        resetTimer();
      } catch (err) {
        panel.querySelector("#save-error").textContent = err.message;
        event.currentTarget.disabled = false;
      }
    });
    panel.scrollIntoView({ behavior: "auto", block: "nearest" });
  }

  elements.discipline.addEventListener("change", () => { timer.discipline = elements.discipline.value; updateProgress(); });
  elements.start.addEventListener("click", () => {
    timer.status = "running";
    timer.startedAt = performance.now();
    timer.segments = [];
    elements["clock-status"].textContent = "Läuft";
    elements.start.disabled = true;
    elements.start.hidden = true;
    elements.lap.disabled = false;
    elements.stop.disabled = !config().flexible;
    elements.undo.disabled = true;
    elements.abort.disabled = false;
    elements.discipline.disabled = true;
    updateProgress(); drawClock();
  });
  elements.lap.addEventListener("click", () => {
    const item = config();
    const maxIntermediate = item.laps - 1;
    if (timer.segments.length >= maxIntermediate || !addSegment()) return;
    elements.undo.disabled = false;
    if (!item.flexible && timer.segments.length === maxIntermediate) {
      elements.lap.disabled = true;
      elements.stop.disabled = false;
    }
    if (item.flexible && timer.segments.length === maxIntermediate) elements.lap.disabled = true;
  });
  elements.undo.addEventListener("click", () => {
    if (timer.status !== "running" || !timer.segments.length) return;
    timer.segments.pop();
    elements.lap.disabled = false;
    elements.stop.disabled = !config().flexible && timer.segments.length !== config().laps - 1;
    elements.undo.disabled = timer.segments.length === 0;
    renderLaps(); updateProgress();
  });
  elements.stop.addEventListener("click", () => {
    if (timer.status !== "running") return;
    timer.displayed = currentCs();
    if (!addSegment()) return;
    timer.status = "stopped";
    cancelAnimationFrame(animationFrame);
    elements.clock.textContent = formatTime(timer.displayed);
    elements["clock-status"].textContent = "Gestoppt";
    elements.lap.disabled = true;
    elements.stop.disabled = true;
    elements.undo.disabled = true;
    elements.abort.disabled = true;
    updateProgress(); renderSavePanel();
  });
  elements.abort.addEventListener("click", () => {
    if (confirm("Diesen laufenden Versuch wirklich verwerfen?")) resetTimer();
  });
}

async function renderViewer(id) {
  const { event } = await api(`/events/${id}`);
  setDocumentTitle(`Ergebnisse – ${event.name}`);
  app.innerHTML = `
    <a class="back" href="#/event/${id}">${icon("arrow-left")} ${escapeHtml(event.name)}</a>
    <div class="page-head"><div><p class="eyebrow">Live</p><h1>Ergebnisse</h1></div>
      <div class="viewer-refresh"><div class="live-note"><span class="live-dot"></span><span id="live-status">Live · jede Minute</span></div>
      <button class="button secondary small" id="refresh-results">${icon("refresh")} Aktualisieren</button></div></div>
    <div class="filters"><div class="field"><label for="viewer-discipline">Disziplin</label><select id="viewer-discipline">${disciplineOptions()}</select></div>
      <div class="field"><label for="viewer-gender">Geschlecht</label><select id="viewer-gender"><option value="female">Weiblich</option><option value="male">Männlich</option></select></div></div>
    <div id="results"><div class="loading">Ergebnisse werden geladen …</div></div>`;

  const discipline = document.querySelector("#viewer-discipline");
  const gender = document.querySelector("#viewer-gender");
  const resultsRoot = document.querySelector("#results");
  const refreshButton = document.querySelector("#refresh-results");
  let loading = false;

  function startManualCooldown() {
    const readyAt = Date.now() + 10_000;
    refreshButton.disabled = true;
    clearInterval(cooldownTimer);
    const updateButton = () => {
      const remaining = Math.ceil((readyAt - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
        refreshButton.disabled = false;
        refreshButton.innerHTML = `${icon("refresh")} Aktualisieren`;
      } else {
        refreshButton.textContent = `Erneut in ${remaining} s`;
      }
    };
    updateButton();
    cooldownTimer = setInterval(updateButton, 1000);
  }

  async function loadResults(silent = false) {
    if (loading) return;
    loading = true;
    try {
      const data = await api(`/events/${id}/results?discipline=${encodeURIComponent(discipline.value)}&gender=${encodeURIComponent(gender.value)}`);
      resultsRoot.innerHTML = data.results.length ? `<div class="result-list">
        ${data.results.map((result, index) => `<article class="result-card">
          <div class="result-head"><span class="rank-badge">${index + 1}</span><div><strong>${escapeHtml(result.participant_name)}</strong><div class="result-meta">Jg. ${result.birth_year} · ${escapeHtml(result.age_group)} · ${escapeHtml(result.organization)}</div></div>
          <button class="button danger small icon-button delete-result" data-id="${result.id}" aria-label="Ergebnis von ${escapeHtml(result.participant_name)} löschen" title="Löschen">${icon("trash")}</button></div>
          <div class="result-time">${formatTime(result.total_centiseconds)}</div>
          <div class="result-segments">${result.segments.map((value, lap) => `<span>Lap ${lap + 1}<strong>${formatTime(value)}</strong></span>`).join("")}</div>
        </article>`).join("")}</div>` :
        `<div class="empty">Für diese Disziplin und dieses Geschlecht gibt es noch keine Ergebnisse.</div>`;
      document.querySelector("#live-status").textContent = `Live · aktualisiert ${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date())}`;
      resultsRoot.querySelectorAll(".delete-result").forEach((button) => button.addEventListener("click", async () => {
        if (!confirm("Dieses Ergebnis unwiderruflich löschen?")) return;
        try { await api(`/events/${id}/results/${button.dataset.id}`, { method: "DELETE" }); showToast("Ergebnis wurde gelöscht."); await loadResults(); }
        catch (err) { showToast(err.message); }
      }));
    } catch (err) {
      if (!silent) resultsRoot.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
      document.querySelector("#live-status").textContent = "Verbindung unterbrochen";
    } finally { loading = false; }
  }
  discipline.addEventListener("change", () => loadResults());
  gender.addEventListener("change", () => loadResults());
  refreshButton.addEventListener("click", () => {
    startManualCooldown();
    loadResults();
  });
  await loadResults();
  refreshTimer = setInterval(() => loadResults(true), 60_000);
}

async function renderRoute() {
  clearInterval(refreshTimer);
  refreshTimer = null;
  clearInterval(cooldownTimer);
  cooldownTimer = null;
  cancelAnimationFrame(animationFrame);
  app.innerHTML = `<div class="loading">Wird geladen …</div>`;
  const current = route();
  try {
    if (current.page === "home") return await renderHome();
    if (!current.id) throw new Error("Die Adresse ist unvollständig.");
    if (current.page === "event") return await renderEvent(current.id);
    if (current.page === "timer") return await renderTimer(current.id);
    if (current.page === "viewer") return await renderViewer(current.id);
    throw new Error("Diese Seite gibt es nicht.");
  } catch (error) {
    renderError(error);
  } finally {
    app.focus({ preventScroll: true });
  }
}

window.addEventListener("hashchange", renderRoute);
renderRoute();
