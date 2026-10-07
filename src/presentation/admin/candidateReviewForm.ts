import {
  activityCategories,
  known,
  unknown,
  type ActivityCategory,
  type AdminCandidate,
  type EventDetails,
  type FieldValue,
  type PriceDetails,
} from "@/domain/admin";

function stringValue(field: FieldValue<string>): string {
  return field.state === "known" ? field.value : "";
}

function categoryValue(field: FieldValue<ActivityCategory>): string {
  return field.state === "known" ? field.value : "";
}

function languagesValue(field: EventDetails["languages"]): string {
  return field.state === "known" ? field.value.join(", ") : "";
}

function organizerValue(field: EventDetails["organizerId"]): string {
  return field.state === "known" ? field.value : "";
}

export function formatEditablePrice(field: EventDetails["price"]): string {
  if (field.state === "unknown") return "";
  if (field.value.kind === "free") return "Gratis";

  if (field.value.options.length === 0) return field.value.note ?? "";

  return field.value.options
    .map((option) => {
      const amount = Number.isInteger(option.amount) ? String(option.amount) : String(option.amount).replace(".", ",");
      const method = option.paymentMethod ? ` ${option.paymentMethod}` : "";
      return `${amount} €${method}`;
    })
    .join(" / ");
}

function parseTextField(value: string): FieldValue<string> {
  const trimmed = value.trim();
  return trimmed ? known(trimmed) : unknown("not_provided");
}

function parseCategory(value: string): EventDetails["category"] {
  if (!value) return unknown("not_provided");
  if (!activityCategories.some((category) => category === value)) {
    throw new Error("La categoría seleccionada no es válida.");
  }
  return known(value as ActivityCategory);
}

function parseLanguages(value: string): EventDetails["languages"] {
  const languages = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return languages.length > 0 ? known(languages) : unknown("not_provided");
}

function parsePrice(value: string): EventDetails["price"] {
  const trimmed = value.trim();
  if (!trimmed) return unknown("not_provided");

  if (/^(gratis|free)$/i.test(trimmed)) {
    return known<PriceDetails>({ kind: "free", options: [], perSessionComparable: true });
  }

  const amounts = Array.from(trimmed.matchAll(/\d+(?:[.,]\d+)?/g)).map((match) =>
    Number.parseFloat(match[0].replace(",", ".")),
  );

  if (amounts.length === 0 || amounts.some((amount) => !Number.isFinite(amount) || amount < 0)) {
    throw new Error('Introduce un precio como "8 €", "8 € / 9 € Bizum" o "Gratis".');
  }

  const lower = trimmed.toLowerCase();
  const kind: PriceDetails["kind"] =
    amounts.length > 1
      ? "payment_variant"
      : lower.includes("prueba") || lower.includes("trial")
        ? "trial"
        : lower.includes("donación") || lower.includes("donation")
          ? "donation"
          : "fixed";

  return known<PriceDetails>({
    kind,
    options: amounts.map((amount, index) => ({
      amount,
      currency: "EUR",
      ...(lower.includes("bizum") && index === amounts.length - 1 ? { paymentMethod: "Bizum" } : {}),
      ...(lower.includes("efectivo") && index === 0 ? { paymentMethod: "Efectivo" } : {}),
    })),
    perSessionComparable: true,
    note: trimmed,
  });
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function buildCandidateCorrections(
  formData: FormData,
  candidate: AdminCandidate,
): Partial<EventDetails> {
  const corrections: Partial<EventDetails> = {};

  const candidates: Array<{
    key: keyof EventDetails;
    submitted: string;
    currentDisplay: string;
    parsed: FieldValue<unknown>;
  }> = [
    {
      key: "title",
      submitted: formString(formData, "title"),
      currentDisplay: stringValue(candidate.final.title),
      parsed: parseTextField(formString(formData, "title")),
    },
    {
      key: "category",
      submitted: formString(formData, "category"),
      currentDisplay: categoryValue(candidate.final.category),
      parsed: parseCategory(formString(formData, "category")),
    },
    {
      key: "description",
      submitted: formString(formData, "description"),
      currentDisplay: stringValue(candidate.final.description),
      parsed: parseTextField(formString(formData, "description")),
    },
    {
      key: "startLocal",
      submitted: formString(formData, "startLocal"),
      currentDisplay: stringValue(candidate.final.startLocal),
      parsed: parseTextField(formString(formData, "startLocal")),
    },
    {
      key: "location",
      submitted: formString(formData, "location"),
      currentDisplay: stringValue(candidate.final.location),
      parsed: parseTextField(formString(formData, "location")),
    },
    {
      key: "organizerId",
      submitted: formString(formData, "organizerId"),
      currentDisplay: organizerValue(candidate.final.organizerId),
      parsed: parseTextField(formString(formData, "organizerId")),
    },
    {
      key: "price",
      submitted: formString(formData, "price"),
      currentDisplay: formatEditablePrice(candidate.final.price),
      parsed: parsePrice(formString(formData, "price")),
    },
    {
      key: "level",
      submitted: formString(formData, "level"),
      currentDisplay: stringValue(candidate.final.level),
      parsed: parseTextField(formString(formData, "level")),
    },
    {
      key: "languages",
      submitted: formString(formData, "languages"),
      currentDisplay: languagesValue(candidate.final.languages),
      parsed: parseLanguages(formString(formData, "languages")),
    },
  ];

  for (const field of candidates) {
    if (field.submitted.trim() === field.currentDisplay.trim()) continue;

    const current = candidate.final[field.key];
    if (!sameValue(field.parsed, current)) {
      (corrections as Record<string, FieldValue<unknown>>)[field.key] = field.parsed;
    }
  }

  return corrections;
}
