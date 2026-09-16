const DISCIPLINES = Object.freeze({
  normal: { laps: 20, flexible: true },
  rescue50: { laps: 2 },
  rescue100: { laps: 3 },
  lifesaver100: { laps: 3 },
  medley100: { laps: 3 },
  superLifesaver200: { laps: 7 },
  obstacle200: { laps: 4 },
  manikinRelay4x25: { laps: 4, team: true },
  rescueTubeRelay4x50: { laps: 4, team: true },
  rescueRelay4x50: { laps: 4, team: true },
  obstacleRelay4x50: { laps: 4, team: true },
  mixedRelay4x50: { laps: 4, team: true },
  lineThrow: { laps: 2, team: true },
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
      SELECT p.*, (
        SELECT COUNT(*) FROM results r
        WHERE r.event_id = p.event_id AND (
          r.participant_id = p.id OR EXISTS (
            SELECT 1 FROM result_members rm WHERE rm.result_id = r.id AND rm.participant_id = p.id
          )
        )
      ) AS result_count
      FROM participants p
      WHERE p.event_id = ? ORDER BY p.name COLLATE NOCASE
    `).bind(eventId).all();
    return json({ event, participants });
  }

  if (parts.length === 3 && method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM events WHERE id = ?").bind(eventId).run();
    if (!result.meta.changes) return fail("Event nicht gefunden.", 404);
    return json({ ok: true });
  }

  if (parts.length === 3 && method === "PATCH") {
    const body = await bodyOf(request);
    const name = cleanText(body.name, "Eventname");
    const location = cleanText(body.location, "Ort", 120, false);
    const eventDate = body.eventDate ? cleanText(body.eventDate, "Datum", 10) : null;
    if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new Error("Ungültiges Datum.");
    const result = await env.DB.prepare("UPDATE events SET name = ?, event_date = ?, location = ? WHERE id = ?")
      .bind(name, eventDate, location, eventId).run();
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
    const [, result] = await env.DB.batch([
      env.DB.prepare(`DELETE FROM results WHERE event_id = ? AND id IN (
        SELECT result_id FROM result_members WHERE participant_id = ?
      )`).bind(eventId, parts[4]),
      env.DB.prepare("DELETE FROM participants WHERE id = ? AND event_id = ?").bind(parts[4], eventId),
    ]);
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
      ORDER BY COALESCE(r.official_centiseconds, r.total_centiseconds) ASC, r.created_at ASC
    `).bind(...bindings).all();
    const { results: memberRows } = await env.DB.prepare(`
      SELECT rm.result_id, rm.position, p.id, p.name, p.birth_year, p.age_group, p.gender, p.organization
      FROM result_members rm
      JOIN results r ON r.id = rm.result_id
      JOIN participants p ON p.id = rm.participant_id
      WHERE r.event_id = ?
      ORDER BY rm.result_id, rm.position
    `).bind(eventId).all();
    const membersByResult = new Map();
    memberRows.forEach((member) => {
      if (!membersByResult.has(member.result_id)) membersByResult.set(member.result_id, []);
      membersByResult.get(member.result_id).push(member);
    });
    return json({ results: results.map((row) => ({
      ...row,
      segments: JSON.parse(row.segments_json),
      frequencies: JSON.parse(row.frequencies_json || "[]"),
      lap_groups: JSON.parse(row.lap_groups_json || "[]"),
      team_members: membersByResult.get(row.id) || [],
    })) });
  }

  if (parts[3] === "results" && parts.length === 4 && method === "POST") {
    const body = await bodyOf(request);
    if (!(body.discipline in DISCIPLINES)) throw new Error("Ungültige Disziplin.");
    const discipline = DISCIPLINES[body.discipline];
    const participantIds = discipline.team ? body.participantIds : [body.participantId];
    if (!Array.isArray(participantIds) || participantIds.some((id) => typeof id !== "string" || !id)) throw new Error("Personenzuordnung fehlt.");
    if (discipline.team && (participantIds.length !== 4 || new Set(participantIds).size !== 4)) throw new Error("Eine Mannschaft benötigt vier unterschiedliche Personen.");
    const placeholders = participantIds.map(() => "?").join(",");
    const { results: assignedParticipants } = await env.DB.prepare(`SELECT id FROM participants WHERE event_id = ? AND id IN (${placeholders})`)
      .bind(eventId, ...participantIds).all();
    if (assignedParticipants.length !== participantIds.length) throw new Error("Mindestens eine Person gehört nicht zu diesem Event.");
    if (!Array.isArray(body.segments) || !body.segments.length) throw new Error("Keine Zeiten vorhanden.");
    const segments = body.segments.map((value) => value === null ? null : Number(value));
    if (segments.some((value) => value !== null && (!Number.isInteger(value) || value <= 0))) throw new Error("Ungültige Abschnittszeit.");
    if (!segments.some((value) => Number.isInteger(value) && value > 0)) throw new Error("Keine Zeiten vorhanden.");
    if (segments.length > discipline.laps) throw new Error(`Für diese Disziplin sind höchstens ${discipline.laps} Abschnitte erlaubt.`);
    const lapGroups = body.lapGroups === undefined
      ? segments.map((_, index) => [index + 1])
      : body.lapGroups;
    if (!Array.isArray(lapGroups) || lapGroups.length !== segments.length) throw new Error("Ungültige Lap-Bereiche.");
    const coveredLaps = [];
    lapGroups.forEach((group) => {
      if (!Array.isArray(group) || !group.length || group.some((lap) => !Number.isInteger(lap) || lap < 1 || lap > discipline.laps)) {
        throw new Error("Ungültige Lap-Bereiche.");
      }
      if (group.some((lap, index) => index > 0 && lap !== group[index - 1] + 1)) throw new Error("Es dürfen nur benachbarte Laps verbunden werden.");
      coveredLaps.push(...group);
    });
    if ((!discipline.flexible && coveredLaps.length !== discipline.laps) || coveredLaps.some((lap, index) => lap !== index + 1) || coveredLaps.length > discipline.laps) {
      throw new Error(`Für diese Disziplin müssen die Lap-Bereiche 1 bis ${discipline.laps} lückenlos abdecken.`);
    }
    const frequencies = body.frequencies === undefined
      ? segments.map(() => null)
      : body.frequencies;
    if (!Array.isArray(frequencies) || frequencies.length !== segments.length) throw new Error("Ungültige Frequenzwerte.");
    if (frequencies.some((value) => value !== null && (!Number.isInteger(value) || value < 1 || value > 999))) {
      throw new Error("Frequenzen müssen ganze Zahlen von 1 bis 999 sein.");
    }
    const segmentTotal = segments.reduce((sum, value) => sum + (value || 0), 0);
    const officialTime = body.officialTime == null ? null : Number(body.officialTime);
    if (officialTime !== null && (!Number.isInteger(officialTime) || officialTime <= 0)) throw new Error("Ungültige offizielle Zeit.");
    if (officialTime !== null && officialTime > 86_400_000) throw new Error("Zeit ist zu lang.");
    const id = crypto.randomUUID();
    const resultInsert = env.DB.prepare(`
      INSERT INTO results (id, event_id, participant_id, discipline, total_centiseconds, official_centiseconds, segments_json, frequencies_json, lap_groups_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, eventId, participantIds[0], body.discipline, segmentTotal, officialTime, JSON.stringify(segments), JSON.stringify(frequencies), JSON.stringify(lapGroups));
    if (discipline.team) {
      await env.DB.batch([resultInsert, ...participantIds.map((participantId, index) => env.DB.prepare(`
        INSERT INTO result_members (result_id, participant_id, position) VALUES (?, ?, ?)
      `).bind(id, participantId, index + 1))]);
    } else {
      await resultInsert.run();
    }
    return json({ id, totalCentiseconds: segmentTotal, officialCentiseconds: officialTime }, 201);
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
      const response = await env.ASSETS.fetch(request);
      if (!response.headers.get("content-type")?.includes("text/html")) return response;
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-store");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error(error);
      return fail(error instanceof Error ? error.message : "Unbekannter Fehler.", 400);
    }
  },
};
