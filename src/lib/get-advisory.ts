import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";

import { AdvisoryError } from "./advisory-error";
import type { Advisory } from "./advisory.types";
import * as cache from "./cache.server";
import { buildAdvisory } from "./fusion";
import { checkRateLimit } from "./rate-limit.server";
import { analyzeTrees, getWeather } from "./weatherai.server";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — matches WeatherAI's cap
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const WEATHER_TTL_MS = 30 * 60 * 1000; // 30-minute forecast bucket

// Orchestrates the full advisory flow on the server. The browser sends one
// multipart request (image + optional lat/lon + context); the key is applied
// here and never leaves the server.
export const getAdvisory = createServerFn({ method: "POST" }).handler(
  async ({ data }): Promise<Advisory> => {
    const form = data as FormData;

    // --- Rate limit (protects the metered upstream quota). ---------------
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const limit = checkRateLimit(ip);
    if (!limit.ok) {
      const where = limit.reason === "global" ? "Daily demo limit reached." : "Too many requests.";
      throw new AdvisoryError(`${where} Try again in ${limit.retryAfterSec}s.`, 429);
    }

    // --- Validate the upload before any upstream call. -------------------
    const image = form.get("image");
    if (!(image instanceof File) || image.size === 0) {
      throw new AdvisoryError("An image file is required.", 400);
    }
    if (!ALLOWED_TYPES.includes(image.type)) {
      throw new AdvisoryError("Image must be JPEG, PNG, or WEBP.", 400);
    }
    if (image.size > MAX_BYTES) {
      throw new AdvisoryError("Image must be 20 MB or smaller.", 400);
    }

    // Coordinates are optional. Missing/invalid → "analysis only" rather than
    // a hard failure.
    const coords = parseCoords(form.get("lat"), form.get("lon"));

    // --- Tree analysis (metered; never cached — each is a real analysis). -
    const treeForm = forwardTreeFields(form, image);
    const trees = await analyzeTrees(treeForm);

    // --- Weather (cached by coarse coords + 30-min bucket). --------------
    let weather: Advisory["weather"] = null;
    let rateLimit: Advisory["rateLimit"];
    if (coords) {
      const key = weatherKey(coords.lat, coords.lon);
      const res = await cache.cached(key, WEATHER_TTL_MS, () => getWeather(coords.lat, coords.lon));
      weather = res.weather;
      rateLimit = res.rateLimit;
    }

    const { advisory, note } = buildAdvisory(trees, weather);
    return { trees, weather, advisory, rateLimit, note };
  },
);

// Forward only the fields the CV endpoint understands, plus the image.
function forwardTreeFields(form: FormData, image: File): FormData {
  const out = new FormData();
  out.set("image", image);
  for (const field of ["farmerId", "county", "landAcres", "location", "notes"]) {
    const v = form.get(field);
    if (typeof v === "string" && v.length > 0) out.set(field, v);
  }
  return out;
}

function parseCoords(
  latRaw: FormDataEntryValue | null,
  lonRaw: FormDataEntryValue | null,
): { lat: number; lon: number } | null {
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

// Round to ~1 km so nearby plots share a cached forecast.
function weatherKey(lat: number, lon: number): string {
  return `weather:${lat.toFixed(2)}:${lon.toFixed(2)}`;
}
