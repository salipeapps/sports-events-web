import { expect, it } from "vitest";
import { decodePublicRegistration, isRegistrationDestination, isSafeRegistrationUrl } from "./registration";
it.each([
  ["WEB", "https://example.org/book", "OPEN_HTTPS"],
  ["WHATSAPP", "+34600111222", "COPY_NUMBER"],
  ["PHONE", "+14155552671", "CALL"],
  ["EMAIL", "reservas+sport@example.org", "COMPOSE_EMAIL"],
])("accepts an explicit %s instruction", (method, destination, action) => {
  expect(decodePublicRegistration({ method, destination, action })).toEqual({ method, destination, action });
});
it.each([
  ["WEB", "https://wa.me/34600111222"],
  ["WEB", "https://api.whatsapp.com/send"],
  ["PHONE", "+012345678"],
  ["WHATSAPP", "600111222"],
  ["EMAIL", "mailto:person@example.org"],
  ["EMAIL", "person@example.local"],
  ["EMAIL", "person@example.org?subject=private"],
])("rejects %s %s", (method, value) => expect(isRegistrationDestination(method, value)).toBe(false));
it.each([
  "http://example.org/",
  "https://example.org/book?x=tracking",
  "https://user:pass@example.org/book",
  "https://127.0.0.1/book",
  "https://example.org/book#secret",
  "https://example.org/abcdefghijklmnopqrstuvwxyz0123456789",
])("rejects unsafe URLs %s", (url) => expect(isSafeRegistrationUrl(url)).toBe(false));
