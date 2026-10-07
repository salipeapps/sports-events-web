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

const editablePriceKinds: PriceDetails["kind"][] = [
  "free",
  "fixed",
  "trial",
  "payment_variant",
  "transport_included",
  "membership",
  "annual_membership",
  "annual_insurance",
  "donation",
];

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

function timezoneValue(field: EventDetails["timezone"]): string {
  return field.state === "known" ? field.value : "";
}

function booleanValue(field: EventDetails["individualAccess"]): string {
  return field.state === "known" ? String(field.value) : "";
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

export function editablePriceKind(field: EventDetails["price"]): string {
  return field.state === "known" ? field.value.kind : "";
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

function parseTimezone(value: string): EventDetails["timezone"] {
  if (!value) return unknown("not_provided");
  if (value !== "Europe/Madrid") throw new Error("La zona horaria seleccionada no es válida.");
  return known("Europe/Madrid");
}

function parseIndividualAccess(value: string): EventDetails["individualAccess"] {
  if (!value) return unknown("not_provided");
  if (value === "true") return known(true);
  if (value === "false") return known(false);
  throw new Error("El valor de acceso individual no es válido.");
}

function parsePriceKind(value: string): PriceDetails["kind"] | null {
  if (!value) return null;
  if (!editablePriceKinds.some((kind) => kind === value)) {
    throw new Error("El tipo de precio seleccionado no es válido.");
  }
  return value as PriceDetails["kind"];
}

function parsePrice(value: string, kindValue: string, currentField: EventDetails["price"]): EventDetails["price"] {
  const trimmed = value.trim();
  const kind = parsePriceKind(kindValue);

  if (!kind && !trimmed) return unknown("not_provided");
  if (!kind) throw new Error("Selecciona el tipo de precio para guardar el importe.");

  if (kind === "free") {
    return known<PriceDetails>({ kind: "free", options: [], perSessionComparable: true });
  }

  if (!trimmed) return unknown("not_provided");

  const segments = trimmed.split("/").map((segment) => segment.trim());
  const parsedOptions = segments.map((segment) => {
    const match = segment.match(/^([+-]?\d+(?:[.,]\d+)?)\s*€?\s*(.*?)\s*$/);
    if (!match) {
      throw new Error('Introduce un precio como "8 €", "8 € / 9 € Bizum" o selecciona "Gratis".');
    }

    const amount = Number.parseFloat(match[1].replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Introduce un precio como "8 €", "8 € / 9 € Bizum" o selecciona "Gratis".');
    }

    return { amount, paymentMethod: match[2].trim() };
  });

  if (parsedOptions.length === 0) {
    throw new Error('Introduce un precio como "8 €", "8 € / 9 € Bizum" o selecciona "Gratis".');
  }

  const current = currentField.state === "known" && currentField.value.kind === kind ? currentField.value : null;

  return known<PriceDetails>({
    kind,
    options: parsedOptions.map(({ amount, paymentMethod }, index) => {
      const existing = current?.options[index];
      const option: PriceDetails["options"][number] = {
        ...existing,
        amount,
        currency: "EUR",
      };

      if (paymentMethod) option.paymentMethod = paymentMethod;
      else delete option.paymentMethod;

      return option;
    }),
    perSessionComparable: current?.perSessionComparable ?? !["annual_membership", "annual_insurance"].includes(kind),
    note: current?.note ?? trimmed,
  });
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function buildCandidateCorrections(formData: FormData, candidate: AdminCandidate): Partial<EventDetails> {
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
      key: "timezone",
      submitted: formString(formData, "timezone"),
      currentDisplay: timezoneValue(candidate.final.timezone),
      parsed: parseTimezone(formString(formData, "timezone")),
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
    {
      key: "registrationUrl",
      submitted: formString(formData, "registrationUrl"),
      currentDisplay: stringValue(candidate.final.registrationUrl),
      parsed: parseTextField(formString(formData, "registrationUrl")),
    },
    {
      key: "individualAccess",
      submitted: formString(formData, "individualAccess"),
      currentDisplay: booleanValue(candidate.final.individualAccess),
      parsed: parseIndividualAccess(formString(formData, "individualAccess")),
    },
  ];

  for (const field of candidates) {
    if (field.submitted.trim() === field.currentDisplay.trim()) continue;

    const current = candidate.final[field.key];
    if (!sameValue(field.parsed, current)) {
      (corrections as Record<string, FieldValue<unknown>>)[field.key] = field.parsed;
    }
  }

  const submittedPrice = formString(formData, "price");
  const submittedPriceKind = formString(formData, "priceKind");
  if (
    submittedPrice.trim() !== formatEditablePrice(candidate.final.price).trim() ||
    submittedPriceKind !== editablePriceKind(candidate.final.price)
  ) {
    const parsedPrice = parsePrice(submittedPrice, submittedPriceKind, candidate.final.price);
    if (!sameValue(parsedPrice, candidate.final.price)) corrections.price = parsedPrice;
  }

  return corrections;
}
