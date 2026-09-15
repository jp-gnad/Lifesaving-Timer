const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const viewportMeta = document.querySelector('meta[name="viewport"]');
const defaultViewport = viewportMeta.content;

const disciplines = {
  normal: { name: "Normal", laps: 20, flexible: true, group: "normal" },
  rescue50: { name: "50 m Retten", laps: 2, group: "individual" },
  rescue100: { name: "100 m Retten", laps: 2, group: "individual" },
  lifesaver100: { name: "100 m Lifesaver", laps: 3, group: "individual" },
  medley100: { name: "100 m Kombi", laps: 3, group: "individual" },
  superLifesaver200: { name: "200 m Super Lifesaver", laps: 7, group: "individual" },
  obstacle200: { name: "200 m Hindernis", laps: 4, group: "individual" },
  manikinRelay4x25: { name: "4 × 25 m Puppenstaffel", laps: 4, group: "team", team: true },
  rescueTubeRelay4x50: { name: "4 × 50 m Gurtretterstaffel", laps: 4, group: "team", team: true },
  rescueRelay4x50: { name: "4 × 50 m Rettungsstaffel", laps: 4, group: "team", team: true },
  obstacleRelay4x50: { name: "4 × 50 m Hindernisstaffel", laps: 4, group: "team", team: true },
  mixedRelay4x50: { name: "4 × 50 m Mixed Staffel", laps: 4, group: "team", team: true },
  lineThrow: { name: "LineThrow", laps: 2, group: "team", team: true },
};

const disciplineGroups = [
  { id: "normal", name: "Normal" },
  { id: "individual", name: "Einzel" },
  { id: "team", name: "Mannschaft" },
];

let refreshTimer = null;
let cooldownTimer = null;
let animationFrame = null;
let toastTimer = null;

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="/icons.svg?v=lap-glue#${name}"></use></svg>`;
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
  return { page: parts[0] || "home", id: parts[1] || null, discipline: parts[2] || null, gender: parts[3] || null };
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

function formatReviewTime(centiseconds) {
  const safe = Math.max(0, Math.floor(Number(centiseconds) || 0));
  return `${Math.floor(safe / 100)},${String(safe % 100).padStart(2, "0")}`;
}

function formatCumulativeReviewTime(centiseconds) {
  const safe = Math.max(0, Math.floor(Number(centiseconds) || 0));
  const minutes = Math.floor(safe / 6000);
  const seconds = Math.floor((safe % 6000) / 100);
  const hundredths = safe % 100;
  return `${minutes}:${String(seconds).padStart(2, "0")},${String(hundredths).padStart(2, "0")}`;
}

function parseTime(value) {
  const match = String(value).trim().match(/^(\d{1,3}):([0-5]\d)[,.](\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 6000 + Number(match[2]) * 100 + Number(match[3]);
}

function parseReviewTime(value) {
  const match = String(value).trim().match(/^(\d{1,7})[,.](\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 100 + Number(match[2]);
}

function lapRangeLabel(laps, prefix = "Lap") {
  const safeLaps = Array.isArray(laps) && laps.length ? laps : [];
  if (!safeLaps.length) return prefix;
  return safeLaps.length === 1
    ? `${prefix} ${safeLaps[0]}`
    : `${prefix} ${safeLaps[0]}–${safeLaps[safeLaps.length - 1]}`;
}

function resultLapGroups(result) {
  const stored = Array.isArray(result.lap_groups) ? result.lap_groups : [];
  if (stored.length === result.segments.length && stored.every((group) => Array.isArray(group) && group.length)) return stored;
  return result.segments.map((_, index) => [index + 1]);
}

function disciplineOptions(selected = "normal") {
  return Object.entries(disciplines).map(([id, item]) =>
    `<option value="${id}" ${id === selected ? "selected" : ""}>${item.name} · ${item.flexible ? "max. " : ""}${item.laps} Laps</option>`
  ).join("");
}

function setDocumentTitle(title) {
  document.title = title ? `${title} · Lifesaving Timer` : "Lifesaving Timer";
}

function updateViewportLock() {
  const locked = document.body.classList.contains("timer-locked")
    || document.body.classList.contains("review-active")
    || document.body.classList.contains("event-page");
  viewportMeta.content = locked
    ? "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
    : defaultViewport;
}

function setTimerInteractionLock(locked) {
  document.body.classList.toggle("timer-locked", locked);
  updateViewportLock();
}

function setReviewInteractionLock(locked) {
  document.body.classList.toggle("review-active", locked);
  updateViewportLock();
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
      <h1>Events</h1>
      <button class="button" id="new-event">${icon("plus")} Neues Event</button>
    </div>
    <section class="section event-list-section" aria-label="Events">
      ${events.length ? `<div class="stack">${events.map((event) => `
        <a class="card event-row" href="#/event/${event.id}" aria-label="${escapeHtml(event.name)} öffnen">
          <div><h3>${escapeHtml(event.name)}</h3><div class="event-meta">
            <span class="meta-item">${icon("calendar")} ${escapeHtml(dateText(event.event_date))}</span>
            ${event.location ? `<span class="meta-item">${icon("location")} ${escapeHtml(event.location)}</span>` : ""}
          </div></div>
          <span class="event-row-arrow">${icon("arrow-right")}</span>
        </a>`).join("")}</div>` : `<div class="empty">Noch kein Event vorhanden. Lege das erste Event an.</div>`}
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
    <div class="page-head event-page-head"><div><div class="event-title-row"><h1>${escapeHtml(event.name)}</h1><button class="button secondary icon-button" id="edit-event" type="button" aria-label="Event bearbeiten" title="Event bearbeiten">${icon("pencil")}</button></div>
      <p class="event-summary">${escapeHtml(dateText(event.event_date))} · ${event.location ? escapeHtml(event.location) : "Kein Ort"} · ${participants.length} Personen</p></div>
    </div>
    <div class="event-action-grid">
      <a class="card event-action-tile" href="#/timer/${id}"><span class="event-action-icon">${icon("timer")}</span><strong>Timer</strong></a>
      <a class="card event-action-tile" href="#/viewer/${id}"><span class="event-action-icon">${icon("table")}</span><strong>Ergebnisse</strong></a>
    </div>
    <section class="section" aria-labelledby="people-heading">
      <div class="section-head"><h2 id="people-heading">Personen</h2><button class="button secondary" id="new-person">${icon("user-plus")} Hinzufügen</button></div>
      ${participants.length ? `<div class="person-list">
        ${participants.map((person) => `<button class="person-card person-card-button edit-person" type="button" data-id="${person.id}" aria-label="${escapeHtml(person.name)} bearbeiten">
          <div class="person-head"><strong>${escapeHtml(person.name)} (${String(person.birth_year).slice(-2)})</strong></div>
          <div class="person-details"><span>${escapeHtml(person.organization)} - ${escapeHtml(person.age_group)} - ${person.gender === "male" ? "m" : "w"}</span></div>
        </button>`).join("")}</div>` : `<div class="empty">Noch keine Personen.</div>`}
    </section>
    <dialog id="event-edit-dialog"><form class="dialog-body" id="event-edit-form">
      <h2>Event bearbeiten</h2>
      <div class="form-grid">
        <div class="field full"><label for="edit-event-name">Eventname</label><input id="edit-event-name" name="name" maxlength="120" required value="${escapeHtml(event.name)}"></div>
        <div class="field"><label for="edit-event-date">Datum</label><input id="edit-event-date" name="eventDate" type="date" value="${escapeHtml(event.event_date || "")}"></div>
        <div class="field"><label for="edit-event-location">Ort</label><input id="edit-event-location" name="location" maxlength="120" value="${escapeHtml(event.location || "")}"></div>
      </div>
      <p class="form-error" id="event-edit-error" role="alert"></p>
      <div class="form-actions"><button type="button" class="button secondary" data-close>Abbrechen</button><button class="button">Event speichern</button></div>
      <div class="dialog-delete-row"><button type="button" class="button danger small" id="delete-event-dialog">${icon("trash")} Event löschen</button></div>
    </form></dialog>
    <dialog id="person-dialog"><form class="dialog-body" id="person-form">
      <h2 id="person-dialog-title">Person hinzufügen</h2><div class="form-grid">
        <div class="field full"><label for="person-name">Name</label><input id="person-name" name="name" maxlength="120" autocomplete="name" required></div>
        <div class="field"><label for="birth-year">Jahrgang</label><input id="birth-year" name="birthYear" type="number" min="1900" max="2200" inputmode="numeric" required></div>
        <div class="field"><label for="age-group">Altersklasse</label><input id="age-group" name="ageGroup" maxlength="40" required placeholder="z. B. AK 15/16"></div>
        <div class="field"><label for="gender">Geschlecht</label><select id="gender" name="gender" required><option value="female">Weiblich</option><option value="male">Männlich</option></select></div>
        <div class="field"><label for="organization">Gliederung</label><input id="organization" name="organization" maxlength="120" required placeholder="Verein / Ortsgruppe"></div>
      </div><p class="form-error" id="person-error" role="alert"></p>
      <div class="form-actions"><button type="button" class="button secondary" data-close>Abbrechen</button><button class="button">Person speichern</button></div>
      <div class="dialog-delete-row"><button type="button" class="button danger small" id="delete-person-dialog" hidden>${icon("trash")} Person löschen</button></div>
    </form></dialog>`;

  const eventDialog = document.querySelector("#event-edit-dialog");
  const eventForm = document.querySelector("#event-edit-form");
  bindDialogClose(eventDialog);
  document.querySelector("#edit-event").addEventListener("click", () => {
    document.querySelector("#event-edit-error").textContent = "";
    openDialog("#event-edit-dialog");
  });
  eventForm.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const submitButton = submitEvent.submitter;
    try {
      submitButton.disabled = true;
      document.querySelector("#event-edit-error").textContent = "";
      const values = Object.fromEntries(new FormData(eventForm));
      await api(`/events/${id}`, { method: "PATCH", body: JSON.stringify(values) });
      showToast("Event wurde aktualisiert.");
      await renderEvent(id);
    } catch (err) {
      document.querySelector("#event-edit-error").textContent = err.message;
      submitButton.disabled = false;
    }
  });

  const dialog = document.querySelector("#person-dialog");
  const personForm = document.querySelector("#person-form");
  const personDialogTitle = document.querySelector("#person-dialog-title");
  const deletePersonButton = document.querySelector("#delete-person-dialog");
  bindDialogClose(dialog);
  document.querySelector("#new-person").addEventListener("click", () => {
    personForm.reset();
    personForm.dataset.editId = "";
    personDialogTitle.textContent = "Person hinzufügen";
    deletePersonButton.hidden = true;
    document.querySelector("#person-error").textContent = "";
    openDialog("#person-dialog");
  });
  document.querySelectorAll(".edit-person").forEach((button) => button.addEventListener("click", () => {
    const person = participants.find((item) => item.id === button.dataset.id);
    if (!person) return;
    personForm.dataset.editId = person.id;
    personDialogTitle.textContent = "Person bearbeiten";
    deletePersonButton.hidden = false;
    personForm.elements.name.value = person.name;
    personForm.elements.birthYear.value = person.birth_year;
    personForm.elements.ageGroup.value = person.age_group;
    personForm.elements.gender.value = person.gender;
    personForm.elements.organization.value = person.organization;
    document.querySelector("#person-error").textContent = "";
    openDialog("#person-dialog");
  }));
  personForm.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const button = submitEvent.submitter;
    try {
      button.disabled = true;
      const values = Object.fromEntries(new FormData(submitEvent.currentTarget));
      const editId = submitEvent.currentTarget.dataset.editId;
      await api(`/events/${id}/participants${editId ? `/${editId}` : ""}`, { method: editId ? "PATCH" : "POST", body: JSON.stringify(values) });
      showToast(editId ? "Person wurde aktualisiert." : "Person wurde hinzugefügt.");
      await renderEvent(id);
    } catch (err) {
      document.querySelector("#person-error").textContent = err.message;
      button.disabled = false;
    }
  });

  deletePersonButton.addEventListener("click", async () => {
    const person = participants.find((item) => item.id === personForm.dataset.editId);
    if (!person) return;
    const warning = Number(person.result_count) > 0 ? " Dabei werden auch alle Ergebnisse dieser Person gelöscht." : "";
    if (!confirm(`${person.name} wirklich löschen?${warning}`)) return;
    try {
      deletePersonButton.disabled = true;
      await api(`/events/${id}/participants/${person.id}`, { method: "DELETE" });
      showToast("Person wurde gelöscht.");
      await renderEvent(id);
    } catch (err) { showToast(err.message); deletePersonButton.disabled = false; }
  });

  document.querySelector("#delete-event-dialog").addEventListener("click", async (deleteEvent) => {
    if (!confirm(`Event „${event.name}“ mit allen Personen und Ergebnissen unwiderruflich löschen?`)) return;
    try {
      deleteEvent.currentTarget.disabled = true;
      await api(`/events/${id}`, { method: "DELETE" });
      showToast("Event wurde gelöscht.");
      location.hash = "#/";
    } catch (err) { showToast(err.message); deleteEvent.currentTarget.disabled = false; }
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
    frequencies: [],
    lapGroups: [],
    frequencyStartedAt: null,
    frequencyTaps: 0,
    officialTime: null,
    discipline: "normal",
  };

  app.innerHTML = `
    <div class="timer-shell">
      <div id="timer-view">
      <div class="timer-topbar">
        <a class="button secondary icon-button" href="#/event/${id}" aria-label="Zurück zu ${escapeHtml(event.name)}">${icon("arrow-left")}</a>
        <button class="mode-button" id="mode-button" aria-haspopup="dialog"><span><strong id="mode-name">Normal</strong><small id="mode-laps">max. 20 Laps</small></span>${icon("chevron-down")}</button>
      </div>
      <section class="card clock-card" aria-label="Stoppuhr">
        <div class="clock-status" id="clock-status">Bereit</div><div class="clock" id="clock" aria-live="off">00:00,00</div>
        <div class="frequency-progress" id="frequency-progress" aria-hidden="true"><span id="frequency-bar"></span></div>
        <p class="progress-note" id="progress">0 / 20 Laps</p>
        <div class="timer-actions">
          <button class="button secondary timer-control" id="left-action" disabled>${icon("trash")} Löschen</button>
          <button class="button timer-control" id="right-action">${icon("play")} Start</button>
        </div>
      </section>
      <div class="card lap-list" id="lap-list" hidden></div>
      <dialog id="discipline-dialog"><div class="dialog-body mode-dialog-body"><div class="mode-dialog-header"><button class="button secondary icon-button" id="mode-back" type="button" aria-label="Zurück zu den Kategorien" hidden>${icon("arrow-left")}</button><h2 id="mode-dialog-title">Stoppmodus</h2><button class="button secondary icon-button" id="close-mode" aria-label="Menü schließen">${icon("x")}</button></div>
        <div class="discipline-list" id="mode-category-list"></div>
        <div class="discipline-list" id="mode-discipline-list" hidden></div>
      </div></dialog>
      </div>
      <section class="review-view" id="review-view" hidden></section>
    </div>`;

  const elements = Object.fromEntries(["timer-view", "review-view", "mode-button", "mode-name", "mode-laps", "discipline-dialog", "clock-status", "clock", "frequency-progress", "frequency-bar", "left-action", "right-action", "progress", "lap-list"].map((key) => [key, document.querySelector(`#${key}`)]));

  const currentCs = () => timer.status === "running" ? timer.displayed + Math.floor((performance.now() - timer.startedAt) / 10) : timer.displayed;
  const capturedTotal = () => timer.segments.reduce((sum, value) => sum + value, 0);
  const config = () => disciplines[timer.discipline];
  const modeTitle = document.querySelector("#mode-dialog-title");
  const modeBack = document.querySelector("#mode-back");
  const modeCategoryList = document.querySelector("#mode-category-list");
  const modeDisciplineList = document.querySelector("#mode-discipline-list");

  function renderModeCategories() {
    const selectedGroup = config().group;
    modeTitle.textContent = "Stoppmodus";
    modeBack.hidden = true;
    modeCategoryList.hidden = false;
    modeDisciplineList.hidden = true;
    modeCategoryList.innerHTML = disciplineGroups.map((group) => {
      const groupDisciplines = Object.values(disciplines).filter((item) => item.group === group.id);
      const selected = selectedGroup === group.id;
      const isNormal = group.id === "normal";
      const detail = isNormal ? "max. 20 Laps" : `${groupDisciplines.length} Disziplinen`;
      const action = isNormal ? `data-discipline="normal"` : `data-mode-group="${group.id}"`;
      const trailingIcon = selected ? icon("check") : (isNormal ? "" : icon("arrow-right"));
      return `<button class="discipline-choice mode-category ${selected ? "selected" : ""}" type="button" ${action}><span><strong>${group.name}</strong><small>${detail}</small></span><span class="choice-check">${trailingIcon}</span></button>`;
    }).join("");
  }

  function renderModeGroup(groupId) {
    const group = disciplineGroups.find((item) => item.id === groupId);
    if (!group || group.id === "normal") return;
    modeTitle.textContent = group.name;
    modeBack.hidden = false;
    modeCategoryList.hidden = true;
    modeDisciplineList.hidden = false;
    modeDisciplineList.innerHTML = Object.entries(disciplines)
      .filter(([, item]) => item.group === groupId)
      .map(([disciplineId, item]) => {
        const selected = disciplineId === timer.discipline;
        return `<button class="discipline-choice ${selected ? "selected" : ""}" type="button" data-discipline="${disciplineId}"><span><strong>${item.name}</strong><small>${item.laps} Laps</small></span><span class="choice-check">${selected ? icon("check") : ""}</span></button>`;
      }).join("");
  }

  function drawClock() {
    const total = currentCs();
    elements.clock.textContent = formatTime(total);
    const liveLap = document.querySelector("#live-lap-time");
    if (liveLap) liveLap.textContent = formatTime(total - capturedTotal());
    updateFrequencyProgress();
    if (timer.status === "running") animationFrame = requestAnimationFrame(drawClock);
  }

  function resetFrequencyCapture() {
    timer.frequencyStartedAt = null;
    timer.frequencyTaps = 0;
    elements["frequency-progress"].classList.remove("active");
    elements["frequency-bar"].style.transform = "scaleX(0)";
  }

  function finishFrequency(endedAt = performance.now()) {
    if (timer.frequencyStartedAt === null) return;
    const elapsedMs = Math.min(10_000, Math.max(1, endedAt - timer.frequencyStartedAt));
    timer.frequencies[timer.segments.length] = Math.round((timer.frequencyTaps * 60_000) / elapsedMs);
    resetFrequencyCapture();
  }

  function updateFrequencyProgress(now = performance.now()) {
    if (timer.frequencyStartedAt === null) return;
    const elapsedMs = now - timer.frequencyStartedAt;
    if (elapsedMs >= 10_000) {
      finishFrequency(timer.frequencyStartedAt + 10_000);
      renderLaps();
      return;
    }
    elements["frequency-progress"].classList.add("active");
    elements["frequency-bar"].style.transform = `scaleX(${1 - elapsedMs / 10_000})`;
  }

  function tapFrequency() {
    if (timer.status !== "running" || timer.frequencies[timer.segments.length] !== undefined) return;
    const now = performance.now();
    if (timer.frequencyStartedAt === null) {
      timer.frequencyStartedAt = now;
      timer.frequencyTaps = 1;
    } else if (now - timer.frequencyStartedAt < 10_000) {
      timer.frequencyTaps += 1;
    }
    updateFrequencyProgress(now);
  }

  function lapValues(time, index, isCurrent = false, isPlaceholder = false) {
    const frequency = timer.frequencies[index];
    return `<span class="lap-values"><strong ${isCurrent ? 'id="live-lap-time"' : (isPlaceholder ? 'class="lap-placeholder"' : "")}>${time}</strong>${Number.isInteger(frequency) ? `<small>${frequency}/min</small>` : ""}</span>`;
  }

  function renderLaps() {
    const item = config();
    const hasLiveLap = timer.status === "running";

    if (!item.flexible) {
      elements["lap-list"].hidden = false;
      elements["lap-list"].innerHTML = Array.from({ length: item.laps }, (_, index) => {
        const value = timer.segments[index];
        const isCurrent = hasLiveLap && index === timer.segments.length;
        const time = value !== undefined
          ? formatTime(value)
          : (isCurrent ? formatTime(currentCs() - capturedTotal()) : "–");
        return `<div class="lap-row ${isCurrent ? "current" : ""}"><span>Runde ${index + 1}</span>${lapValues(time, index, isCurrent, value === undefined && !isCurrent)}</div>`;
      }).join("");
      return;
    }

    elements["lap-list"].hidden = timer.segments.length === 0 && !hasLiveLap;
    const liveRow = hasLiveLap ? `<div class="lap-row current"><span>Runde ${timer.segments.length + 1}</span>${lapValues(formatTime(currentCs() - capturedTotal()), timer.segments.length, true)}</div>` : "";
    const completedRows = timer.segments.map((value, index) => ({ value, index })).reverse().map(({ value, index }) => {
      return `<div class="lap-row"><span>Runde ${index + 1}</span>${lapValues(formatTime(value), index)}</div>`;
    }).join("");
    elements["lap-list"].innerHTML = liveRow + completedRows;
  }

  function updateProgress() {
    const item = config();
    elements.progress.textContent = `${timer.segments.length} / ${item.flexible ? "max. " : ""}${item.laps} Laps`;
  }

  function updateMode() {
    const item = config();
    elements["mode-name"].textContent = item.name;
    elements["mode-laps"].textContent = `${item.flexible ? "max. " : ""}${item.laps} Laps`;
    renderLaps();
    updateProgress();
  }

  function setControl(button, label, iconName, style, disabled = false) {
    button.className = `button timer-control ${style}`.trim();
    button.textContent = label;
    button.disabled = disabled;
  }

  function updateControls() {
    const item = config();
    const actions = elements["left-action"].parentElement;
    elements["left-action"].hidden = false;
    actions.classList.remove("final-lap");
    if (timer.status === "idle") {
      setControl(elements["left-action"], "Löschen", "trash", "secondary", true);
      setControl(elements["right-action"], "Start", "play", "", false);
      return;
    }
    if (timer.status === "running") {
      const lapLimitReached = timer.segments.length >= item.laps - 1;
      setControl(elements["left-action"], "Runde", "lap", "secondary", lapLimitReached);
      setControl(elements["right-action"], "Stopp", "stop", "danger", false);
      if (lapLimitReached) {
        elements["left-action"].hidden = true;
        actions.classList.add("final-lap");
      }
      return;
    }
    setControl(elements["left-action"], "Löschen", "trash", "danger", false);
    setControl(elements["right-action"], "Weiter", "play", "", false);
  }

  function resetTimer() {
    cancelAnimationFrame(animationFrame);
    Object.assign(timer, { status: "idle", startedAt: 0, displayed: 0, segments: [], frequencies: [], lapGroups: [], officialTime: null });
    resetFrequencyCapture();
    elements.clock.textContent = "00:00,00";
    elements["clock-status"].textContent = "Bereit";
    elements["mode-button"].disabled = false;
    elements["timer-view"].hidden = false;
    elements["review-view"].hidden = true;
    elements["review-view"].innerHTML = "";
    setReviewInteractionLock(false);
    setTimerInteractionLock(true);
    setDocumentTitle(`Timer – ${event.name}`);
    renderLaps(); updateProgress(); updateControls();
  }

  function addSegment() {
    if (timer.status !== "running" || timer.segments.length >= config().laps - 1) return false;
    const total = currentCs();
    const segment = total - capturedTotal();
    if (segment <= 0) return false;
    finishFrequency();
    if (timer.frequencies[timer.segments.length] === undefined) timer.frequencies[timer.segments.length] = null;
    timer.segments.push(segment);
    renderLaps(); updateProgress();
    return true;
  }

  function showReview() {
    const review = elements["review-view"];
    const item = config();
    const reviewSegments = item.flexible
      ? timer.segments
      : Array.from({ length: item.laps }, (_, index) => timer.segments[index] ?? null);
    const reviewFrequencies = reviewSegments.map((_, index) => timer.frequencies[index] ?? null);
    let lapGroups = timer.lapGroups.length === timer.segments.length
      ? timer.lapGroups.map((laps, index) => ({ laps: [...laps], value: timer.segments[index] ?? null, frequency: timer.frequencies[index] ?? null }))
      : reviewSegments.map((value, index) => ({ laps: [index + 1], value, frequency: reviewFrequencies[index] }));
    let timeMode = "segment";
    let editMode = false;
    let glueMode = false;
    const glueHistory = [];
    const optionMarkup = () => participants.map((person) => `<option value="${person.id}">${escapeHtml(person.name)} · ${escapeHtml(person.age_group)} · ${escapeHtml(person.organization)}</option>`).join("");
    const assignmentMarkup = item.team
      ? `<fieldset class="team-assignment"><legend>Mannschaft</legend>${Array.from({ length: 4 }, (_, index) => `<div class="field"><label for="participant-${index + 1}">Position ${index + 1}</label><select class="participant-select" id="participant-${index + 1}"><option value="">Auswählen …</option>${optionMarkup()}</select></div>`).join("")}</fieldset>`
      : `<div class="field"><label for="participant">Person</label><select class="participant-select" id="participant"><option value="">Auswählen …</option>${optionMarkup()}</select></div>`;
    setTimerInteractionLock(false);
    setReviewInteractionLock(true);
    elements["timer-view"].hidden = true;
    review.hidden = false;
    setDocumentTitle(`Ergebnis prüfen – ${event.name}`);
    review.innerHTML = `<div class="review-topbar"><button class="button secondary icon-button" id="close-review" aria-label="Zurück zum Timer">${icon("arrow-left")}</button><h1>Ergebnis prüfen</h1><button class="button danger icon-button" id="discard-review" aria-label="Messung löschen" title="Messung löschen">${icon("trash")}</button></div>
      <div class="review-content">
      <div class="review-tools"><div class="time-mode-toggle" role="group" aria-label="Zeitdarstellung"><button type="button" class="active" data-time-mode="segment" aria-pressed="true">Sekunden</button><button type="button" data-time-mode="cumulative" aria-pressed="false">Kumuliert</button></div><div class="review-mode-actions"><button class="button secondary small edit-mode-toggle" id="edit-mode" type="button" aria-pressed="false">${icon("pencil")} Bearbeiten</button><button class="button secondary small glue-mode-toggle" id="glue-mode" type="button" aria-pressed="false">${icon("link")} Kleben</button></div></div>
      <div class="glue-hint" id="glue-hint" hidden><span>Verbinde benachbarte Lap-Bereiche über das Kettensymbol.</span><button class="button secondary small" id="undo-glue" type="button" hidden>${icon("undo")} Rückgängig</button></div>
      <div class="edit-times" id="edit-times"></div>
      <div class="review-time-summary"><div class="field official-time-field"><label for="official-time">Offizielle Zeit</label><input id="official-time" inputmode="decimal" placeholder="00:00,00" value="${timer.officialTime === null ? "" : formatTime(timer.officialTime)}" aria-describedby="save-error" readonly></div>
      <div class="total-summary"><span>Gestoppt</span><strong id="save-total" aria-live="polite">${formatTime(capturedTotal())}</strong></div></div>
      ${item.team ? `${assignmentMarkup}<button class="button secondary add-review-person" id="new-review-person" type="button">${icon("user-plus")} Neue Person</button>` : `<div class="review-assignment-row">${assignmentMarkup}<button class="button secondary add-review-person" id="new-review-person" type="button">${icon("user-plus")} Neu</button></div>`}
      <p class="form-error" id="save-error" role="alert"></p>
      <div class="form-actions save-actions"><button class="button" id="save-result" ${participants.length >= (item.team ? 4 : 1) ? "" : "disabled"}>${icon("save")} Ergebnis speichern</button></div></div>
      <dialog id="review-person-dialog"><form class="dialog-body" id="review-person-form">
        <div class="dialog-title-row"><h2>Neue Person</h2><button type="button" class="button secondary icon-button" data-close aria-label="Schließen">${icon("x")}</button></div>
        <div class="form-grid">
          <div class="field full"><label for="review-person-name">Name</label><input id="review-person-name" name="name" maxlength="120" autocomplete="name" required></div>
          <div class="field"><label for="review-birth-year">Jahrgang</label><input id="review-birth-year" name="birthYear" type="number" min="1900" max="2200" inputmode="numeric" required></div>
          <div class="field"><label for="review-age-group">Altersklasse</label><input id="review-age-group" name="ageGroup" maxlength="40" required placeholder="z. B. AK 15/16"></div>
          <div class="field"><label for="review-gender">Geschlecht</label><select id="review-gender" name="gender" required><option value="female">Weiblich</option><option value="male">Männlich</option></select></div>
          <div class="field"><label for="review-organization">Gliederung</label><input id="review-organization" name="organization" maxlength="120" required placeholder="Verein / Ortsgruppe"></div>
        </div>
        <p class="form-error" id="review-person-error" role="alert"></p>
        <div class="form-actions"><button type="button" class="button secondary" data-close>Abbrechen</button><button type="submit" class="button">Hinzufügen</button></div>
      </form></dialog>`;

    const editTimes = review.querySelector("#edit-times");
    const officialInput = review.querySelector("#official-time");
    const participantSelects = [...review.querySelectorAll(".participant-select")];
    const saveResult = review.querySelector("#save-result");
    const personDialog = review.querySelector("#review-person-dialog");
    const personForm = review.querySelector("#review-person-form");

    function syncLapGroupsFromInputs() {
      const timeInputs = [...editTimes.querySelectorAll(".segment-input")];
      const frequencyInputs = [...editTimes.querySelectorAll(".frequency-input")];
      let previousCumulative = 0;
      lapGroups.forEach((group, index) => {
        const timeText = timeInputs[index]?.value.trim() || "";
        if (!timeText) {
          group.value = null;
        } else if (timeMode === "segment") {
          group.value = parseReviewTime(timeText) ?? Number.NaN;
        } else {
          const cumulative = parseTime(timeText);
          group.value = cumulative !== null && cumulative > previousCumulative
            ? cumulative - previousCumulative
            : Number.NaN;
          if (cumulative !== null && cumulative > previousCumulative) previousCumulative = cumulative;
        }
        const frequencyText = frequencyInputs[index]?.value.trim() || "";
        group.frequency = !frequencyText
          ? null
          : (/^\d{1,3}$/.test(frequencyText) && Number(frequencyText) > 0 ? Number(frequencyText) : Number.NaN);
      });
    }

    function renderLapFields() {
      let cumulative = 0;
      editTimes.innerHTML = lapGroups.map((group, index) => {
        const validValue = Number.isInteger(group.value) && group.value > 0;
        if (validValue) cumulative += group.value;
        const displayedTime = !validValue
          ? ""
          : (timeMode === "segment" ? formatReviewTime(group.value) : formatCumulativeReviewTime(cumulative));
        const range = lapRangeLabel(group.laps, "Runde");
        const glueButton = glueMode && index < lapGroups.length - 1
          ? `<button class="glue-next" type="button" data-glue-index="${index}" aria-label="${range} mit ${lapRangeLabel(lapGroups[index + 1].laps, "Runde")} verbinden" title="Mit nächster Runde verbinden">${icon("link")}</button>`
          : "";
        return `<div class="field review-lap-field ${group.laps.length > 1 ? "glued" : ""} ${editMode ? "editable" : ""}"><div class="review-lap-title"><strong>${range}</strong>${glueButton}</div><div class="review-lap-inputs"><label><span>${timeMode === "segment" ? "Zeit (s)" : "Kumuliert"}</span><input class="segment-input" id="segment-${index}" inputmode="decimal" value="${displayedTime}" aria-label="Zeit ${range}" aria-describedby="save-error" ${editMode ? "" : "readonly"}></label><label><span>Freq.</span><input class="frequency-input" id="frequency-${index}" inputmode="numeric" value="${Number.isInteger(group.frequency) ? group.frequency : ""}" aria-label="Frequenz ${range}" aria-describedby="save-error" ${editMode ? "" : "readonly"}></label></div></div>`;
      }).join("");
      officialInput.readOnly = !editMode;
      editTimes.querySelectorAll("input").forEach((input) => input.addEventListener("input", () => readCorrections(false)));
      editTimes.querySelectorAll(".glue-next").forEach((button) => button.addEventListener("click", () => {
        syncLapGroupsFromInputs();
        const index = Number(button.dataset.glueIndex);
        const left = lapGroups[index];
        const right = lapGroups[index + 1];
        if (!left || !right) return;
        glueHistory.push(lapGroups.map((group) => ({ laps: [...group.laps], value: group.value, frequency: group.frequency })));
        const leftValue = Number.isInteger(left.value) && left.value > 0 ? left.value : null;
        const rightValue = Number.isInteger(right.value) && right.value > 0 ? right.value : null;
        const mergedFrequency = Number.isInteger(left.frequency) && Number.isInteger(right.frequency)
          ? (left.frequency === right.frequency ? left.frequency : null)
          : (Number.isInteger(left.frequency) ? left.frequency : (Number.isInteger(right.frequency) ? right.frequency : null));
        lapGroups.splice(index, 2, {
          laps: [...left.laps, ...right.laps],
          value: leftValue !== null || rightValue !== null ? (leftValue || 0) + (rightValue || 0) : null,
          frequency: mergedFrequency,
        });
        review.querySelector("#undo-glue").hidden = false;
        renderLapFields();
        readCorrections(false);
      }));
    }

    function readCorrections(showError = false) {
      syncLapGroupsFromInputs();
      const segments = lapGroups.map((group) => group.value);
      const frequencies = lapGroups.map((group) => group.frequency);
      const officialText = officialInput.value.trim();
      const officialTime = officialText ? parseTime(officialText) : null;
      const invalidSegments = segments.some((value) => value !== null && (!Number.isInteger(value) || value <= 0));
      const missingSegments = !segments.some((value) => Number.isInteger(value) && value > 0);
      const invalidFrequencies = frequencies.some((value) => Number.isNaN(value));
      const invalidOfficialTime = Boolean(officialText) && (officialTime === null || officialTime <= 0);
      const stoppedTime = segments.reduce((sum, value) => sum + (Number.isInteger(value) && value > 0 ? value : 0), 0);
      review.querySelector("#save-total").textContent = formatTime(stoppedTime);
      review.querySelector("#save-error").textContent = showError
        ? (invalidSegments || missingSegments
          ? (timeMode === "segment"
            ? "Abschnittszeiten bitte als Sekunden, z. B. 61,00, eingeben. Leere Runden sind erlaubt."
            : "Kumulierte Zeiten bitte aufsteigend im Format mm:ss,00 eingeben. Leere Runden sind erlaubt.")
          : (invalidOfficialTime
            ? "Bitte die offizielle Zeit im Format mm:ss,00 eingeben."
            : (invalidFrequencies ? "Frequenzen bitte als ganze Zahl von 1 bis 999 eingeben." : "")))
        : "";
      return invalidSegments || missingSegments || invalidOfficialTime || invalidFrequencies ? null : {
        segments,
        frequencies,
        officialTime,
        lapGroups: lapGroups.map((group) => [...group.laps]),
      };
    }
    renderLapFields();
    const editModeButton = review.querySelector("#edit-mode");
    const glueModeButton = review.querySelector("#glue-mode");
    function updateReviewModes() {
      editModeButton.classList.toggle("active", editMode);
      editModeButton.setAttribute("aria-pressed", String(editMode));
      glueModeButton.classList.toggle("active", glueMode);
      glueModeButton.setAttribute("aria-pressed", String(glueMode));
      review.querySelector("#glue-hint").hidden = !glueMode;
      renderLapFields();
    }
    review.querySelectorAll("[data-time-mode]").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.timeMode === timeMode) return;
      syncLapGroupsFromInputs();
      timeMode = button.dataset.timeMode;
      review.querySelectorAll("[data-time-mode]").forEach((candidate) => {
        const active = candidate.dataset.timeMode === timeMode;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      renderLapFields();
      readCorrections(false);
    }));
    editModeButton.addEventListener("click", () => {
      syncLapGroupsFromInputs();
      editMode = !editMode;
      if (editMode) glueMode = false;
      updateReviewModes();
      if (editMode) editTimes.querySelector(".segment-input")?.focus();
    });
    glueModeButton.addEventListener("click", () => {
      syncLapGroupsFromInputs();
      glueMode = !glueMode;
      if (glueMode) editMode = false;
      updateReviewModes();
    });
    review.querySelector("#undo-glue").addEventListener("click", () => {
      const previous = glueHistory.pop();
      if (!previous) return;
      lapGroups = previous;
      review.querySelector("#undo-glue").hidden = glueHistory.length === 0;
      renderLapFields();
      readCorrections(false);
    });
    officialInput.addEventListener("input", () => readCorrections(false));
    bindDialogClose(personDialog);
    review.querySelector("#new-review-person").addEventListener("click", () => {
      personForm.reset();
      personForm.querySelector('[type="submit"]').disabled = false;
      review.querySelector("#review-person-error").textContent = "";
      personDialog.showModal();
      personForm.elements.name.focus();
    });
    personForm.addEventListener("submit", async (submitEvent) => {
      submitEvent.preventDefault();
      const submitButton = submitEvent.submitter;
      try {
        submitButton.disabled = true;
        review.querySelector("#review-person-error").textContent = "";
        const values = Object.fromEntries(new FormData(personForm));
        const created = await api(`/events/${id}/participants`, { method: "POST", body: JSON.stringify(values) });
        const person = { id: created.id, name: values.name, birth_year: Number(values.birthYear), age_group: values.ageGroup, gender: values.gender, organization: values.organization };
        participants.push(person);
        participantSelects.forEach((select) => {
          const option = document.createElement("option");
          option.value = person.id;
          option.textContent = `${person.name} · ${person.age_group} · ${person.organization}`;
          select.append(option);
        });
        const emptySelect = participantSelects.find((select) => !select.value) || participantSelects[0];
        emptySelect.value = person.id;
        saveResult.disabled = participants.length < (item.team ? 4 : 1);
        personDialog.close();
        showToast("Person wurde hinzugefügt und ausgewählt.");
      } catch (err) {
        review.querySelector("#review-person-error").textContent = err.message;
        submitButton.disabled = false;
      }
    });
    review.querySelector("#close-review").addEventListener("click", () => {
      const corrections = readCorrections(false);
      if (corrections) {
        timer.segments = corrections.segments;
        timer.frequencies = corrections.frequencies;
        timer.lapGroups = corrections.lapGroups;
        timer.displayed = corrections.segments.reduce((sum, value) => sum + (value || 0), 0);
        timer.officialTime = corrections.officialTime;
        elements.clock.textContent = formatTime(timer.displayed);
      }
      review.hidden = true;
      elements["timer-view"].hidden = false;
      setReviewInteractionLock(false);
      setTimerInteractionLock(true);
      setDocumentTitle(`Timer – ${event.name}`);
      renderLaps(); updateProgress();
    });
    review.querySelector("#discard-review").addEventListener("click", resetTimer);
    saveResult.addEventListener("click", async (event) => {
      const corrections = readCorrections(true);
      const participantIds = participantSelects.map((select) => select.value);
      const missingAssignment = participantIds.some((participantId) => !participantId);
      const duplicateAssignment = item.team && new Set(participantIds).size !== participantIds.length;
      if (!corrections || missingAssignment || duplicateAssignment) {
        if (missingAssignment) review.querySelector("#save-error").textContent = item.team ? "Bitte alle vier Positionen besetzen." : "Bitte eine Person auswählen.";
        else if (duplicateAssignment) review.querySelector("#save-error").textContent = "Jede Person darf nur eine Position besetzen.";
        return;
      }
      try {
        event.currentTarget.disabled = true;
        const assignment = item.team ? { participantIds } : { participantId: participantIds[0] };
        await api(`/events/${id}/results`, { method: "POST", body: JSON.stringify({ ...assignment, discipline: timer.discipline, segments: corrections.segments, frequencies: corrections.frequencies, lapGroups: corrections.lapGroups, officialTime: corrections.officialTime }) });
        showToast("Ergebnis wurde gespeichert. Bereit für die nächste Person.");
        resetTimer();
      } catch (err) {
        review.querySelector("#save-error").textContent = err.message;
        event.currentTarget.disabled = false;
      }
    });
    window.scrollTo(0, 0);
  }

  bindDialogClose(elements["discipline-dialog"]);
  elements["mode-button"].addEventListener("click", () => {
    renderModeCategories();
    elements["discipline-dialog"].showModal();
  });
  document.querySelector("#close-mode").addEventListener("click", () => elements["discipline-dialog"].close());
  modeBack.addEventListener("click", renderModeCategories);
  elements["discipline-dialog"].addEventListener("click", (event) => {
    const groupChoice = event.target.closest("[data-mode-group]");
    if (groupChoice) {
      renderModeGroup(groupChoice.dataset.modeGroup);
      return;
    }
    const disciplineChoice = event.target.closest("[data-discipline]");
    if (!disciplineChoice) return;
    timer.discipline = disciplineChoice.dataset.discipline;
    updateMode();
    elements["discipline-dialog"].close();
  });
  elements["left-action"].addEventListener("click", () => {
    if (timer.status === "stopped") {
      resetTimer();
      return;
    }
    if (!addSegment()) return;
    updateControls();
  });

  elements["timer-view"].addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, select, dialog")) return;
    if (timer.status !== "running") return;
    const actionsTop = elements["left-action"].parentElement.getBoundingClientRect().top;
    if (event.clientY < actionsTop) {
      tapFrequency();
      return;
    }
    if (event.clientY < document.documentElement.clientHeight / 2) return;
    if (!addSegment()) return;
    updateControls();
  });

  elements["right-action"].addEventListener("click", () => {
    if (timer.status === "idle") {
      timer.status = "running";
      timer.startedAt = performance.now();
      timer.displayed = 0;
      timer.segments = [];
      timer.frequencies = [];
      timer.lapGroups = [];
      resetFrequencyCapture();
      elements["clock-status"].textContent = "Läuft";
      elements["mode-button"].disabled = true;
      renderLaps(); updateProgress(); updateControls(); drawClock();
      return;
    }
    if (timer.status === "running") {
      const finalTime = currentCs();
      const finalSegment = finalTime - capturedTotal();
      if (finalSegment <= 0) return;
      timer.displayed = finalTime;
      timer.officialTime = null;
      timer.status = "stopped";
      finishFrequency();
      if (timer.frequencies[timer.segments.length] === undefined) timer.frequencies[timer.segments.length] = null;
      timer.segments.push(finalSegment);
      cancelAnimationFrame(animationFrame);
      elements.clock.textContent = formatTime(timer.displayed);
      elements["clock-status"].textContent = "Gestoppt";
      renderLaps(); updateProgress(); updateControls();
      showReview();
      return;
    }
    timer.segments.pop();
    timer.frequencies.pop();
    resetFrequencyCapture();
    timer.officialTime = null;
    timer.status = "running";
    timer.startedAt = performance.now();
    elements["clock-status"].textContent = "Läuft";
    renderLaps(); updateProgress(); updateControls(); drawClock();
  });

  updateMode();
  updateControls();
  setTimerInteractionLock(true);
}

async function renderViewer(id, initialDiscipline = null, initialGender = null) {
  const { event } = await api(`/events/${id}`);
  let selected = disciplines[initialDiscipline] && ["female", "male"].includes(initialGender)
    ? { discipline: initialDiscipline, gender: initialGender }
    : null;
  setDocumentTitle(`Ergebnisse – ${event.name}`);
  app.innerHTML = `
    <div id="viewer-overview-head" ${selected ? "hidden" : ""}>
    <a class="back" href="#/event/${id}">${icon("arrow-left")} ${escapeHtml(event.name)}</a>
    <div class="page-head viewer-page-head"><h1>Ergebnisse</h1>
      <div class="viewer-refresh"><div class="live-note"><span class="live-dot"></span><span id="live-status">Live · jede Minute</span></div>
      <button class="button secondary small" id="refresh-results">${icon("refresh")} Aktualisieren</button></div></div></div>
    <div id="results"><div class="loading">Ergebnisse werden geladen …</div></div>`;

  const overviewHead = document.querySelector("#viewer-overview-head");
  const resultsRoot = document.querySelector("#results");
  const refreshButton = document.querySelector("#refresh-results");
  let loading = false;
  let allResults = [];
  let resultView = "cards";

  const genderName = (gender) => gender === "female" ? "Weiblich" : "Männlich";

  function renderSelection() {
    overviewHead.hidden = false;
    setDocumentTitle(`Ergebnisse – ${event.name}`);
    const counts = new Map();
    allResults.forEach((result) => {
      const key = `${result.discipline}:${result.gender}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const availableDisciplines = Object.entries(disciplines).map(([disciplineId, item]) => ({
      disciplineId,
      item,
      femaleCount: counts.get(`${disciplineId}:female`) || 0,
      maleCount: counts.get(`${disciplineId}:male`) || 0,
    })).filter(({ femaleCount, maleCount }) => femaleCount > 0 || maleCount > 0);
    const resultButton = (disciplineId, item, gender, count) => count
      ? `<button class="result-choice ${gender === "female" ? "female" : "male"}" data-discipline="${disciplineId}" data-gender="${gender}" aria-label="${escapeHtml(item.name)}, ${genderName(gender)}, ${count} ${count === 1 ? "Ergebnis" : "Ergebnisse"}"><strong>${escapeHtml(item.name)}</strong><span>${genderName(gender)}</span></button>`
      : `<span class="result-choice-space" aria-hidden="true"></span>`;
    resultsRoot.innerHTML = availableDisciplines.length
      ? `<div class="result-selection" aria-label="Ergebnisgruppen">${availableDisciplines.map(({ disciplineId, item, femaleCount, maleCount }) =>
        `<div class="result-selection-row">${resultButton(disciplineId, item, "female", femaleCount)}${resultButton(disciplineId, item, "male", maleCount)}</div>`
      ).join("")}</div>`
      : `<div class="empty">Noch keine Ergebnisse.</div>`;
    resultsRoot.querySelectorAll(".result-choice").forEach((button) => button.addEventListener("click", () => {
      window.scrollTo(0, 0);
      location.hash = `#/viewer/${id}/${button.dataset.discipline}/${button.dataset.gender}`;
    }));
  }

  function renderResultList() {
    const item = disciplines[selected.discipline];
    overviewHead.hidden = true;
    setDocumentTitle(`${item.name} · ${genderName(selected.gender)} – ${event.name}`);
    const results = allResults.filter((result) => result.discipline === selected.discipline && result.gender === selected.gender);
    const lapCount = results.reduce((maximum, result) => {
      const coveredLaps = resultLapGroups(result).flat();
      return Math.max(maximum, coveredLaps.length ? Math.max(...coveredLaps) : result.segments.length);
    }, 0);
    const cardView = `<div class="result-list">
      ${results.map((result, index) => {
        const teamMembers = result.team_members || [];
        const lapGroups = resultLapGroups(result);
        const displayName = teamMembers.length ? "Mannschaft" : `${result.participant_name} (${String(result.birth_year).slice(-2)})`;
        const details = teamMembers.length
          ? `<div class="result-team-members">${teamMembers.map((member) => `<span>${member.position}. ${escapeHtml(member.name)} (${String(member.birth_year).slice(-2)})</span>`).join("")}</div>`
          : `<div class="result-meta">${escapeHtml(result.age_group)} · ${escapeHtml(result.organization)}</div>`;
        return `<article class="result-card">
        <div class="result-head"><span class="rank-badge">${index + 1}</span><div><strong>${escapeHtml(displayName)}</strong>${details}</div>
        <button class="button danger small icon-button delete-result" data-id="${result.id}" aria-label="Ergebnis ${index + 1} löschen" title="Löschen">${icon("trash")}</button></div>
        <div class="result-time">${formatTime(result.total_centiseconds)}</div>
        <div class="result-segments">${result.segments.map((value, lap) => {
          const group = lapGroups[lap] || [lap + 1];
          const glued = group.length > 1;
          return `<span class="${glued ? "glued-result-lap" : ""}"><span class="result-lap-label">${lapRangeLabel(group)}${Number.isInteger(result.frequencies?.[lap]) ? `<small>${result.frequencies[lap]}/min</small>` : ""}</span><strong>${value === null ? "–" : formatTime(value)}</strong></span>`;
        }).join("")}</div>
      </article>`;
      }).join("")}</div>`;
    const tableView = `<div class="result-table-wrap"><table class="result-table">
      <caption class="sr-only">Ergebnisse ${escapeHtml(item.name)}, ${genderName(selected.gender)}</caption>
      <thead><tr><th>Person</th><th>Offizielle Zeit</th>${Array.from({ length: lapCount }, (_, lap) => `<th>Lap ${lap + 1}</th>`).join("")}<th><span class="sr-only">Aktionen</span></th></tr></thead>
      <tbody>${results.map((result, index) => {
        const teamMembers = result.team_members || [];
        const lapGroups = resultLapGroups(result);
        const displayName = teamMembers.length ? "Mannschaft" : `${result.participant_name} (${String(result.birth_year).slice(-2)})`;
        const details = teamMembers.length ? teamMembers.map((member) => `${member.position}. ${escapeHtml(member.name)} (${String(member.birth_year).slice(-2)})`).join("<br>") : `${escapeHtml(result.age_group)} · ${escapeHtml(result.organization)}`;
        return `<tr><td><strong>${index + 1}. ${escapeHtml(displayName)}</strong><small>${details}</small></td>
        <td class="official-result">${formatTime(result.total_centiseconds)}</td>
        ${result.segments.map((value, lap) => {
          const group = lapGroups[lap] || [lap + 1];
          const span = Math.max(1, group.length);
          return `<td colspan="${span}" class="${span > 1 ? "glued-result-cell" : ""}" aria-label="${lapRangeLabel(group)}">${value ? `<span class="table-lap-value">${formatTime(value)}${Number.isInteger(result.frequencies?.[lap]) ? `<small>${result.frequencies[lap]}/min</small>` : ""}</span>` : "–"}</td>`;
        }).join("")}${Array.from({ length: Math.max(0, lapCount - lapGroups.flat().length) }, () => "<td>–</td>").join("")}
        <td><button class="button danger small icon-button delete-result" data-id="${result.id}" aria-label="Ergebnis ${index + 1} löschen" title="Löschen">${icon("trash")}</button></td></tr>`;
      }).join("")}</tbody>
    </table></div>`;
    resultsRoot.innerHTML = `<a class="viewer-list-back" id="viewer-list-back" href="#/viewer/${id}">${icon("arrow-left")} Ergebnisse</a>
      <div class="viewer-list-heading"><div class="viewer-list-title"><p class="eyebrow">${genderName(selected.gender)}</p><h2>${escapeHtml(item.name)}</h2></div>
        <div class="result-view-toggle" role="group" aria-label="Darstellung"><button data-result-view="cards" class="${resultView === "cards" ? "active" : ""}" aria-pressed="${resultView === "cards"}">${icon("cards")} Karten</button><button data-result-view="table" class="${resultView === "table" ? "active" : ""}" aria-pressed="${resultView === "table"}">${icon("table")} Tabelle</button></div></div>
      ${results.length ? (resultView === "table" ? tableView : cardView) : `<div class="empty">Noch keine Ergebnisse.</div>`}`;
    resultsRoot.querySelectorAll("[data-result-view]").forEach((button) => button.addEventListener("click", () => {
      resultView = button.dataset.resultView;
      renderResultList();
    }));
    resultsRoot.querySelectorAll(".delete-result").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Dieses Ergebnis unwiderruflich löschen?")) return;
      try { await api(`/events/${id}/results/${button.dataset.id}`, { method: "DELETE" }); showToast("Ergebnis wurde gelöscht."); await loadResults(); }
      catch (err) { showToast(err.message); }
    }));
  }

  function renderContent() {
    if (selected) renderResultList();
    else renderSelection();
  }

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
      const data = await api(`/events/${id}/results`);
      allResults = data.results;
      renderContent();
      document.querySelector("#live-status").textContent = `Live · aktualisiert ${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date())}`;
    } catch (err) {
      if (!silent) resultsRoot.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
      document.querySelector("#live-status").textContent = "Verbindung unterbrochen";
    } finally { loading = false; }
  }
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
  document.body.classList.toggle("timer-page", current.page === "timer");
  document.body.classList.toggle("event-page", current.page === "event");
  setReviewInteractionLock(false);
  setTimerInteractionLock(false);
  try {
    if (current.page === "home") return await renderHome();
    if (!current.id) throw new Error("Die Adresse ist unvollständig.");
    if (current.page === "event") return await renderEvent(current.id);
    if (current.page === "timer") return await renderTimer(current.id);
    if (current.page === "viewer") return await renderViewer(current.id, current.discipline, current.gender);
    throw new Error("Diese Seite gibt es nicht.");
  } catch (error) {
    renderError(error);
  } finally {
    app.focus({ preventScroll: true });
  }
}

window.addEventListener("hashchange", renderRoute);
renderRoute();
