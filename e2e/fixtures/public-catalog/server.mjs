// Explicit offline H0 simulation. It does not prove Engine #122 SQL/RLS or editorial atomicity.
import { createServer } from "node:http";
import { createHash } from "node:crypto";

let scenario = "populated";
let rows = [];
let lastHeaders = {};
let withdrawn = new Set();
function reset(next) {
  scenario = next;
  withdrawn = new Set();
  const now = Date.now();
  rows = Array.from({ length: 31 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    title:
      index === 27
        ? "TEST · Borrador privado"
        : index === 28
          ? "TEST · Conflicto privado"
          : index === 29
            ? "TEST · Cancelada privada"
            : index === 30
              ? "TEST · Histórica"
              : `TEST · Actividad ${String(index + 1).padStart(2, "0")}`,
    status: index === 27 ? "draft" : index === 28 ? "conflict" : index === 29 ? "cancelled" : "published",
    contractVersion: 1,
    organizerName: "TEST · Club de ejemplo",
    startInstant: new Date(index === 30 ? now - 3600_000 : now + 3600_000 + index * 60_000).toISOString(),
    endInstant: index === 0 ? new Date(now + 3600_000 + 4 * 3600_000).toISOString() : null,
    timeZone: "Europe/Madrid",
    registrationUrl: index === 0 ? "https://example.org/inscripcion" : null,
    activityLanguage: index === 1 ? "es" : index === 8 ? "en" : null,
    // Indices 3, 8, 13, 18 and 23 are yoga; everything else running (simulated editorial category).
    category: index % 5 === 3 ? "yoga" : "running",
    level: { es: index === 1 ? "Iniciación" : null, en: null },
    requirements: { es: index === 1 ? "TEST · Ropa cómoda y agua" : null, en: null },
    lastVerifiedAt: new Date(now - 86_400_000).toISOString(),
    verifiedUntil: new Date(now + 6 * 86_400_000).toISOString(),
    locations:
      index === 0
        ? [
            {
              role: "destination",
              municipality: "Serra",
              neighborhood: null,
              pointName: "TEST · Destino de la excursión",
              address: null,
              latitude: null,
              longitude: null,
            },
            {
              role: "departure",
              municipality: "Alboraia",
              neighborhood: "Patacona",
              pointName: "TEST · Punto de encuentro",
              address: null,
              latitude: null,
              longitude: null,
            },
          ]
        : index === 3
          ? [
              {
                role: "activity",
                municipality: "València",
                neighborhood: "Russafa",
                pointName: "TEST · Sala de yoga",
                address: null,
                latitude: null,
                longitude: null,
              },
            ]
          : [],
    prices:
      index === 1
        ? [
            {
              type: "free",
              scope: "per_session",
              amount: null,
              currency: null,
              conditions: null,
              validFrom: null,
              validTo: null,
              transportCost: "unknown",
            },
          ]
        : index === 2
          ? [
              {
                type: "subscription",
                scope: "per_month",
                amount: 25,
                currency: "EUR",
                conditions: "TEST · Cuota mensual",
                validFrom: null,
                validTo: null,
                transportCost: "unknown",
              },
            ]
          : index === 5
            ? [
                {
                  type: "fixed",
                  scope: "per_session",
                  amount: 10,
                  currency: "EUR",
                  conditions: null,
                  validFrom: null,
                  validTo: null,
                  transportCost: "not_applicable",
                },
              ]
            : [],
    updatedAt: new Date(now - 86_400_000).toISOString(),
  }));
}
reset("populated");

createServer(async (request, response) => {
  const reply = (value, status = 200) => {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(value));
  };
  if (request.url === "/health") return reply({ ok: true });
  if (request.url === "/test/headers") return reply(lastHeaders);
  if (request.url?.startsWith("/test/scenario/") && request.method === "POST") {
    reset(request.url.split("/").at(-1));
    return reply({ ok: true });
  }
  // Simulates an editorial SUSPEND: the projection no longer contains the row.
  if (request.url?.startsWith("/test/withdraw/") && request.method === "POST") {
    withdrawn.add(request.url.split("/").at(-1));
    return reply({ ok: true });
  }
  const rpc = /^\/rest\/v1\/rpc\/(catalog_occurrences?)_v([12])$/.exec(request.url ?? "");
  if (!rpc || request.method !== "POST") return reply({}, 404);
  const version = Number(rpc[2]);
  const detail = rpc[1] === "catalog_occurrence";
  lastHeaders = {
    authorization: request.headers.authorization ?? null,
    cookie: request.headers.cookie ?? null,
    apikey: request.headers.apikey,
  };
  if (
    request.headers.apikey !== "sb_publishable_offline_catalog" ||
    request.headers["content-profile"] !== "api" ||
    lastHeaders.authorization ||
    lastHeaders.cookie
  )
    return reply({}, 403);
  if (scenario === "error") return reply({ message: "PRIVATE_SQL_TOKEN_DO_NOT_RENDER" }, 500);
  if (scenario === "slow") await new Promise((resolve) => setTimeout(resolve, 1500));
  let body = "";
  for await (const chunk of request) body += chunk;
  const query = JSON.parse(body);
  if (detail) {
    const index = rows.findIndex((row) => row.id === query.id);
    const row = rows[index];
    if (
      scenario === "empty" ||
      !row ||
      row.status !== "published" ||
      withdrawn.has(row.id) ||
      Date.parse(row.startInstant) <= Date.now()
    )
      return reply({ code: "PT404", message: "NOT_FOUND" }, 404);
    return reply({ contractVersion: version, item: publicItem(row, index, version) });
  }
  const context = createHash("sha256")
    .update(
      JSON.stringify([
        query.desde,
        query.hasta,
        query.municipio?.trim().toLowerCase() ?? null,
        query.categoria ?? null,
        query.idioma ?? null,
        query.precioComparable ?? null,
      ]),
    )
    .digest("hex");
  const from = Date.parse(query.desde),
    to = Date.parse(query.hasta);
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    to <= from ||
    to - from > 31 * 86_400_000 ||
    query.limit !== 24 ||
    (query.categoria !== undefined &&
      !["yoga", "running", "hiking", "cycling", "fitness", "swimming", "dance", "other"].includes(query.categoria)) ||
    (query.idioma !== undefined && !["es", "en", "ca", "other"].includes(query.idioma)) ||
    (query.precioComparable !== undefined && typeof query.precioComparable !== "boolean") ||
    (query.municipio !== undefined && (typeof query.municipio !== "string" || query.municipio.length > 100))
  )
    return reply({ code: "PT400", message: "INVALID_REQUEST" }, 400);
  let offset = 0;
  if (query.cursor) {
    try {
      const cursor = JSON.parse(Buffer.from(query.cursor, "base64url").toString());
      if (cursor.context !== context || !Number.isInteger(cursor.offset)) return reply({}, 400);
      offset = cursor.offset;
    } catch {
      return reply({}, 400);
    }
  }
  const eligible =
    scenario === "empty"
      ? []
      : rows.filter(
          (row) =>
            row.status === "published" &&
            !withdrawn.has(row.id) &&
            matchesFilters(row, query) &&
            Date.parse(row.startInstant) >= Math.max(from, Date.now()) &&
            Date.parse(row.startInstant) < to,
        );
  const items = eligible.slice(offset, offset + query.limit).map((row) => publicItem(row, rows.indexOf(row), version));
  const nextCursor =
    offset + query.limit < eligible.length
      ? Buffer.from(JSON.stringify({ context, offset: offset + query.limit })).toString("base64url")
      : null;
  reply({ contractVersion: version, items, nextCursor });
}).listen(3122, "127.0.0.1");

function publicItem(row, index, version) {
  const item = {
    ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== "status")),
    titleTranslations: { es: row.title, en: null },
    status: "upcoming",
  };
  if (version === 2) {
    delete item.registrationUrl;
    item.contractVersion = 2;
    item.sourceUrl = "https://example.org/activity";
    item.registration = [
      { method: "WEB", destination: "https://example.org/book", action: "OPEN_HTTPS" },
      { method: "WHATSAPP", destination: "+34600111222", action: "COPY_NUMBER" },
      { method: "PHONE", destination: "+34600111333", action: "CALL" },
      { method: "EMAIL", destination: "reservas@example.org", action: "COMPOSE_EMAIL" },
    ][index % 4];
  }
  return item;
}

// Same semantics as Engine V021: unknown values never satisfy an exact filter; destinations do not count.
function matchesFilters(row, query) {
  if (query.categoria !== undefined && row.category !== query.categoria) return false;
  if (query.idioma !== undefined && row.activityLanguage !== query.idioma) return false;
  if (
    query.municipio !== undefined &&
    !row.locations.some(
      (location) =>
        ["activity", "departure", "meeting_point"].includes(location.role) &&
        location.municipality?.toLowerCase() === query.municipio.trim().toLowerCase(),
    )
  )
    return false;
  if (query.precioComparable !== undefined) {
    const comparable = row.prices.some(
      (price) => price.type === "fixed" && price.scope === "per_session" && price.currency === "EUR",
    );
    if (comparable !== query.precioComparable) return false;
  }
  return true;
}
