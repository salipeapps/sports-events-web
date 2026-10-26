// Explicit offline H0 simulation. It does not prove Engine #122 SQL/RLS or editorial atomicity.
import { createServer } from "node:http";
import { createHash } from "node:crypto";

let scenario = "populated";
let rows = [];
let lastHeaders = {};
function reset(next) {
  scenario = next;
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
    endInstant: null,
    timeZone: "Europe/Madrid",
    registrationUrl: null,
    activityLanguage: index === 1 ? "es" : null,
    category: "running",
    level: { es: index === 1 ? "Iniciación" : null, en: null },
    requirements: { es: null, en: null },
    lastVerifiedAt: new Date(now - 86_400_000).toISOString(),
    verifiedUntil: new Date(now + 6 * 86_400_000).toISOString(),
    locations:
      index === 0
        ? [
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
  if (request.url !== "/rest/v1/rpc/catalog_occurrences_v1" || request.method !== "POST") return reply({}, 404);
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
  const context = createHash("sha256")
    .update(JSON.stringify([query.desde, query.hasta]))
    .digest("hex");
  const from = Date.parse(query.desde),
    to = Date.parse(query.hasta);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 31 * 86_400_000 || query.limit !== 24)
    return reply({}, 400);
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
            Date.parse(row.startInstant) >= Math.max(from, Date.now()) &&
            Date.parse(row.startInstant) < to,
        );
  const items = eligible.slice(offset, offset + query.limit).map((row) => ({
    ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== "status")),
    titleTranslations: { es: row.title, en: null },
    status: "upcoming",
  }));
  const nextCursor =
    offset + query.limit < eligible.length
      ? Buffer.from(JSON.stringify({ context, offset: offset + query.limit })).toString("base64url")
      : null;
  reply({ contractVersion: 1, items, nextCursor });
}).listen(3122, "127.0.0.1");
