import process from "node:process";

import { AdvisoryError, mapUpstreamError } from "./advisory-error";
import type { ForecastDay, RateLimitInfo, TreeAnalysis, WeatherResult } from "./advisory.types";

// Server-only WeatherAI client. The `.server.ts` suffix keeps Vite from ever
// bundling this into the client, so WEATHERAI_API_KEY cannot leak to the
// browser. The key is read per-call (request time) — see config.server.ts for
// why module-scope reads are unsafe on edge runtimes.

const BASE_URL = "https://api.weather-ai.co";

function authHeader(): string {
  const key = process.env.WEATHERAI_API_KEY;
  if (!key) {
    // 401 → mapped to a generic "configuration error" before reaching the client.
    throw mapUpstreamError(401);
  }
  return `Bearer ${key}`;
}

function readRateLimit(res: Response): RateLimitInfo {
  const num = (h: string) => {
    const v = res.headers.get(h);
    return v == null || v === "" ? null : Number(v);
  };
  return {
    limit: num("X-RateLimit-Limit"),
    remaining: num("X-RateLimit-Remaining"),
    reset: num("X-RateLimit-Reset"),
  };
}

// POST /v1/trees/analyze — counts trees and canopy health from the image (CV).
export async function analyzeTrees(form: FormData): Promise<TreeAnalysis> {
  const res = await fetch(`${BASE_URL}/v1/trees/analyze`, {
    method: "POST",
    headers: { Authorization: authHeader() },
    body: form,
  });
  if (!res.ok) throw mapUpstreamError(res.status);

  const data = (await res.json()) as Record<string, unknown>;
  const health = (data.tree_health ?? {}) as Record<string, unknown>;
  return {
    total_tree_count: numberOr(data.total_tree_count, 0),
    canopy_coverage_pct: numberOr(data.canopy_coverage_pct, 0),
    tree_health: {
      healthy: numberOr(health.healthy, 0),
      needs_care: numberOr(health.needs_care, 0),
      needs_replacement: numberOr(health.needs_replacement, 0),
    },
    confidence_score: numberOr(data.confidence_score, 0),
    observations: stringArray(data.observations),
    recommendations: stringArray(data.recommendations),
    overlay_image_url:
      typeof data.overlay_image_url === "string" ? data.overlay_image_url : undefined,
    original_image_url:
      typeof data.original_image_url === "string" ? data.original_image_url : undefined,
  };
}

// GET /v1/weather — current conditions + forecast. Called with ai=false so the
// scarce AI summary quota is preserved; the advisory is built from structured
// fields only.
//
// NOTE (per the technical doc §10): the weather *response* body is not pinned
// down in the WeatherAI docs. This normalizer is tolerant of several likely
// field names; verify against a real key and tighten if needed.
export async function getWeather(
  lat: number,
  lon: number,
): Promise<{ weather: WeatherResult; rateLimit: RateLimitInfo }> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    days: "7",
    ai: "false",
    units: "metric",
  });
  const res = await fetch(`${BASE_URL}/v1/weather?${params.toString()}`, {
    method: "GET",
    headers: { Authorization: authHeader() },
  });
  const rateLimit = readRateLimit(res);
  if (!res.ok) throw mapUpstreamError(res.status);

  const data = (await res.json()) as Record<string, unknown>;
  return { weather: normalizeWeather(data, lat, lon), rateLimit };
}

function normalizeWeather(data: Record<string, unknown>, lat: number, lon: number): WeatherResult {
  const current = (data.current ?? data.now ?? data) as Record<string, unknown>;
  const rawForecast = pickArray(data.forecast ?? data.daily ?? data.days);

  const forecast: ForecastDay[] = rawForecast.slice(0, 7).map((d, i) => {
    const day = d as Record<string, unknown>;
    return {
      day: stringOr(day.day ?? day.date ?? day.name, "") || (i === 0 ? "Today" : `Day ${i + 1}`),
      high: numberOr(day.high ?? day.temp_high ?? day.max_temp, 0),
      low: numberOr(day.low ?? day.temp_low ?? day.min_temp, 0),
      rain_mm: numberOr(day.rain_mm ?? day.precip_mm ?? day.precipitation, 0),
      conditions: stringOr(day.conditions ?? day.summary ?? day.weather, "—"),
    };
  });

  const rainNext24 =
    numberOr(data.rain_mm_next_24h ?? current.rain_mm_next_24h, NaN) || (forecast[0]?.rain_mm ?? 0);

  return {
    location: stringOr(
      data.location ?? data.name ?? current.location,
      `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`,
    ),
    temp_c: numberOr(current.temp_c ?? current.temp ?? current.temperature, 0),
    conditions: stringOr(current.conditions ?? current.summary ?? current.weather, "—"),
    rain_mm_next_24h: rainNext24,
    forecast,
  };
}

// --- small, defensive coercions ------------------------------------------
function numberOr(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}
function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}
function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function pickArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export { AdvisoryError };
