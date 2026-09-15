const DISCIPLINES = Object.freeze({
  normal: 20,
  rescue50: 2,
  rescue100: 2,
  lifesaver100: 3,
  medley100: 3,
  superLifesaver200: 7,
  obstacle200: 4,
});

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function fail(message, status = 400) {
  return json({ error: message }, status);
}

function cleanText(value, field, max = 120, required = true) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new Error(`${field} fehlt.`);
  if (text.length > max) throw new Error(`${field} ist zu lang.`);
  return text;
}

async function bodyOf(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error("JSON erwartet.");
  return request.json();
}

async function eventExists(db, id) {
  return db.prepare("SELECT id FROM events WHERE id = ?").bind(id).first();
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const method = request.method;

  if (parts.length === 1 && parts[0] === "api") {
    return json({ name: "Lifesaving Timer API", ok: true });
  }

  if (parts[1] !== "events") return fail("Nicht gefunden.", 404);

  if (parts.length === 2 && method === "GET") {
    const { results } = await env.DB.prepare(`
      SELECT e.*, COUNT(DISTINCT p.id) AS participant_count, COUNT(DISTINCT r.id) AS result_count
      FROM events e
      LEFT JOIN participants p ON p.event_id = e.id
      LEFT JOIN results r ON r.event_id = e.id
      GROUP BY e.id
      ORDER BY COALESCE(e.event_date, e.created_at) DESC, e.created_at DESC
    `).all();
    return json({ events: results });
  }

  if (parts.length === 2 && method === "POST") {
    const body = await bodyOf(request);
    const id = crypto.randomUUID();
    const name = cleanText(body.name, "Eventname");
    const location = cleanText(body.location, "Ort", 120, false);
    const eventDate = body.eventDate ? cleanText(body.eventDate, "Datum", 10) : null;
    if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new Error("Ungültiges Datum.");
    await env.DB.prepare("INSERT INTO events (id, name, event_date, location) VALUES (?, ?, ?, ?)")
      .bind(id, name, eventDate, location).run();
    return json({ id }, 201);
  }

  const eventId = parts[2];
  if (!eventId) return fail("Nicht gefunden.", 404);

  if (parts.length === 3 && method === "GET") {
    const event = await env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(eventId).first();
    if (!event) return fail("Event nicht gefunden.", 404);
    const { results: participants } = await env.DB.prepare(`
      SELECT p.*, COUNT(r.id) AS result_count
      FROM participants p LEFT JOIN results r ON r.participant_id = p.id
      WHERE p.event_id = ? GROUP BY p.id ORDER BY p.name COLLATE NOCASE
    `).bind(eventId).all();
    return json({ event, participants });
  }

  if (parts.length === 3 && method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM events WHERE id = ?").bind(eventId).run();
    if (!result.meta.changes) return fail("Event nicht gefunden.", 404);
    return json({ ok: true });
  }

  if (!(await eventExists(env.DB, eventId))) return fail("Event nicht gefunden.", 404);

  if (parts[3] === "participants" && parts.length === 4 && method === "POST") {
    const body = await bodyOf(request);
    const id = crypto.randomUUID();
    const name = cleanText(body.name, "Name");
    const birthYear = Number(body.birthYear);
    if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > 2200) throw new Error("Ungültiger Jahrgang.");
    const ageGroup = cleanText(body.ageGroup, "Altersklasse", 40);
    if (!['male', 'female'].includes(body.gender)) throw new Error("Ungültiges Geschlecht.");
    const organization = cleanText(body.organization, "Gliederung");
    await env.DB.prepare(`
      INSERT INTO participants (id, event_id, name, birth_year, age_group, gender, organization)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, eventId, name, birthYear, ageGroup, body.gender, organization).run();
    return json({ id }, 201);
  }

  if (parts[3] === "participants" && parts[4] && parts.length === 5 && method === "PATCH") {
    const body = await bodyOf(request);
    const name = cleanText(body.name, "Name");
    const birthYear = Number(body.birthYear);
    if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > 2200) throw new Error("Ungültiger Jahrgang.");
    const ageGroup = cleanText(body.ageGroup, "Altersklasse", 40);
    if (!['male', 'female'].includes(body.gender)) throw new Error("Ungültiges Geschlecht.");
    const organization = cleanText(body.organization, "Gliederung");
    const result = await env.DB.prepare(`
      UPDATE participants
      SET name = ?, birth_year = ?, age_group = ?, gender = ?, organization = ?
      WHERE id = ? AND event_id = ?
    `).bind(name, birthYear, ageGroup, body.gender, organization, parts[4], eventId).run();
    if (!result.meta.changes) return fail("Person nicht gefunden.", 404);
    return json({ ok: true });
  }

  if (parts[3] === "participants" && parts[4] && parts.length === 5 && method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM participants WHERE id = ? AND event_id = ?")
      .bind(parts[4], eventId).run();
    if (!result.meta.changes) return fail("Person nicht gefunden.", 404);
    return json({ ok: true });
  }

  if (parts[3] === "results" && parts.length === 4 && method === "GET") {
    const discipline = url.searchParams.get("discipline");
    const gender = url.searchParams.get("gender");
    const conditions = ["r.event_id = ?"];
    const bindings = [eventId];
    if (discipline) {
      if (!(discipline in DISCIPLINES)) throw new Error("Ungültige Disziplin.");
      conditions.push("r.discipline = ?");
      bindings.push(discipline);
    }
    if (gender) {
      if (!['male', 'female'].includes(gender)) throw new Error("Ungültiges Geschlecht.");
      conditions.push("p.gender = ?");
      bindings.push(gender);
    }
    const { results } = await env.DB.prepare(`
      SELECT r.*, p.name AS participant_name, p.birth_year, p.age_group, p.gender, p.organization
      FROM results r JOIN participants p ON p.id = r.participant_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY r.total_centiseconds ASC, r.created_at ASC
    `).bind(...bindings).all();
    return json({ results: results.map((row) => ({ ...row, segments: JSON.parse(row.segments_json) })) });
  }

  if (parts[3] === "results" && parts.length === 4 && method === "POST") {
    const body = await bodyOf(request);
    if (!(body.discipline in DISCIPLINES)) throw new Error("Ungültige Disziplin.");
    const participant = await env.DB.prepare("SELECT id FROM participants WHERE id = ? AND event_id = ?")
      .bind(body.participantId, eventId).first();
    if (!participant) throw new Error("Person gehört nicht zu diesem Event.");
    if (!Array.isArray(body.segments) || !body.segments.length) throw new Error("Keine Zeiten vorhanden.");
    const segments = body.segments.map(Number);
    if (segments.some((value) => !Number.isInteger(value) || value <= 0)) throw new Error("Ungültige Abschnittszeit.");
    const maxSegments = DISCIPLINES[body.discipline];
    if (body.discipline === "normal" ? segments.length > maxSegments : segments.length !== maxSegments) {
      throw new Error(`Für diese Disziplin werden ${maxSegments} Abschnitte erwartet.`);
    }
    const segmentTotal = segments.reduce((sum, value) => sum + value, 0);
    const officialTime = body.officialTime === undefined ? segmentTotal : Number(body.officialTime);
    if (!Number.isInteger(officialTime) || officialTime <= 0) throw new Error("Ungültige offizielle Zeit.");
    if (officialTime > 86_400_000) throw new Error("Zeit ist zu lang.");
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO results (id, event_id, participant_id, discipline, total_centiseconds, segments_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, eventId, body.participantId, body.discipline, officialTime, JSON.stringify(segments)).run();
    return json({ id, totalCentiseconds: officialTime }, 201);
  }

  if (parts[3] === "results" && parts[4] && parts.length === 5 && method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM results WHERE id = ? AND event_id = ?")
      .bind(parts[4], eventId).run();
    if (!result.meta.changes) return fail("Ergebnis nicht gefunden.", 404);
    return json({ ok: true });
  }

  return fail("Nicht gefunden.", 404);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return fail(error instanceof Error ? error.message : "Unbekannter Fehler.", 400);
    }
  },
};
