import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";

import type { Advisory } from "../lib/advisory.types";
import { getAdvisory } from "../lib/get-advisory";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Canopy — Climate Advisor for Farms" },
      {
        name: "description",
        content:
          "Upload an aerial photo of your plot and get a timed advisory fused with the local weather forecast.",
      },
      { property: "og:title", content: "Canopy — Climate Advisor for Farms" },
      {
        property: "og:description",
        content:
          "Tree counts, canopy health, and weather-aware recommendations from a single aerial photo.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [coordStatus, setCoordStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Advisory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = useCallback((f: File | null) => {
    setError(null);
    setResult(null);
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      setError("Please upload a JPEG, PNG, or WEBP image.");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setError("Image must be 20 MB or smaller.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }, []);

  const getLocation = () => {
    if (!("geolocation" in navigator)) {
      setCoordStatus("Geolocation not available in this browser.");
      return;
    }
    setCoordStatus("Locating…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setCoordStatus("Location captured.");
      },
      () => setCoordStatus("Could not get location. Analysis will run without weather."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const analyze = async () => {
    if (!file) {
      setError("Upload an image first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("image", file);
      if (coords) {
        form.set("lat", String(coords.lat));
        form.set("lon", String(coords.lon));
      }
      const advisory = await getAdvisory({ data: form });
      setResult(advisory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <section className="grid gap-6 lg:grid-cols-5">
          {/* Upload card */}
          <div className="rounded-lg border border-border bg-card p-5 sm:p-6 lg:col-span-3">
            <h2 className="text-lg font-semibold">1. Upload your plot photo</h2>
            <p className="mt-1 text-sm text-muted-foreground">JPEG, PNG, or WEBP. Up to 20 MB.</p>

            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0] ?? null;
                onFile(f);
              }}
              className={`mt-4 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed p-6 text-center transition-colors ${
                dragOver ? "border-primary bg-accent" : "border-border bg-secondary hover:bg-accent"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              {preview ? (
                <img
                  src={preview}
                  alt="Selected plot"
                  className="max-h-64 w-full rounded-sm object-contain"
                />
              ) : (
                <>
                  <div className="text-sm font-medium">Drop an image here</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    or click to choose a file
                  </div>
                </>
              )}
            </label>

            {file && (
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={reset}
                  className="ml-3 underline-offset-2 hover:underline"
                >
                  Remove
                </button>
              </div>
            )}

            <div className="mt-6 border-t border-border pt-5">
              <h3 className="text-sm font-semibold">2. Share your location</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Used once to pull the local forecast. Skip to get analysis only.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={getLocation}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  Use my location
                </button>
                {coords && (
                  <span className="text-xs text-muted-foreground">
                    {coords.lat.toFixed(3)}°, {coords.lon.toFixed(3)}°
                  </span>
                )}
                {!coords && coordStatus && (
                  <span className="text-xs text-muted-foreground">{coordStatus}</span>
                )}
              </div>
            </div>

            {error && (
              <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={analyze}
                disabled={!file || loading}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Analyzing…" : "Get my advisory"}
              </button>
              {result && (
                <button
                  type="button"
                  onClick={reset}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Start over
                </button>
              )}
            </div>
          </div>

          {/* Side info card */}
          <aside
            className="rounded-lg border border-border bg-card p-5 sm:p-6 lg:col-span-2"
            id="how"
          >
            <h2 className="text-lg font-semibold">How it works</h2>
            <ol className="mt-4 space-y-4 text-sm">
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium">
                  1
                </span>
                <div>
                  <div className="font-medium">You upload one aerial photo</div>
                  <div className="text-muted-foreground">
                    Drone, plane, or satellite. We never store it.
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium">
                  2
                </span>
                <div>
                  <div className="font-medium">Computer vision counts the canopy</div>
                  <div className="text-muted-foreground">
                    Tree count, coverage, and per-tree health states.
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium">
                  3
                </span>
                <div>
                  <div className="font-medium">We fuse it with your forecast</div>
                  <div className="text-muted-foreground">
                    You get specific actions tied to the right day.
                  </div>
                </div>
              </li>
            </ol>
          </aside>
        </section>

        {result && (
          <section className="mt-12 space-y-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-2xl font-semibold">Your advisory</h2>
              <span className="text-xs text-muted-foreground">
                Confidence {Math.round(result.trees.confidence_score * 100)}%
              </span>
            </div>

            {result.note && (
              <p className="rounded-md border border-l-2 border-border border-l-primary bg-card px-4 py-3 text-sm text-muted-foreground">
                {result.note}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Trees detected" value={result.trees.total_tree_count.toString()} />
              <Stat label="Canopy coverage" value={`${result.trees.canopy_coverage_pct}%`} />
              {result.weather ? (
                <Stat
                  label="Rain next 24h"
                  value={`${Math.round(result.weather.rain_mm_next_24h)} mm`}
                />
              ) : (
                <Stat
                  label="Confidence"
                  value={`${Math.round(result.trees.confidence_score * 100)}%`}
                />
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-5">
              <div className="rounded-lg border border-border bg-card p-5 sm:p-6 lg:col-span-3">
                <h3 className="text-base font-semibold">Recommended actions</h3>
                <ul className="mt-4 divide-y divide-border">
                  {result.advisory.map((a, i) => (
                    <li key={i} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-4">
                        <div className="text-sm font-medium">{a.action}</div>
                        <div className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-primary">
                          {a.when}
                        </div>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{a.reason}</p>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 border-t border-border pt-5">
                  <h4 className="text-sm font-semibold">Field observations</h4>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {result.trees.observations.map((o, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="space-y-6 lg:col-span-2">
                <div className="rounded-lg border border-border bg-card p-5 sm:p-6">
                  <h3 className="text-base font-semibold">Canopy health</h3>
                  <HealthBar
                    healthy={result.trees.tree_health.healthy}
                    care={result.trees.tree_health.needs_care}
                    replace={result.trees.tree_health.needs_replacement}
                  />
                </div>

                {result.weather && (
                  <div className="rounded-lg border border-border bg-card p-5 sm:p-6">
                    <h3 className="text-base font-semibold">Forecast</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {result.weather.location} · {result.weather.conditions} ·{" "}
                      {Math.round(result.weather.temp_c)}°C
                    </p>
                    <ul className="mt-4 space-y-2">
                      {result.weather.forecast.map((d) => (
                        <li key={d.day} className="flex items-center justify-between text-sm">
                          <span className="w-12 text-muted-foreground">{d.day}</span>
                          <span className="flex-1 truncate px-3 text-foreground">
                            {d.conditions}
                          </span>
                          <span className="w-16 text-right text-muted-foreground">
                            {Math.round(d.rain_mm)} mm
                          </span>
                          <span className="w-16 text-right font-medium">
                            {Math.round(d.high)}° / {Math.round(d.low)}°
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-3xl font-semibold">{value}</div>
    </div>
  );
}

function HealthBar({ healthy, care, replace }: { healthy: number; care: number; replace: number }) {
  const total = Math.max(1, healthy + care + replace);
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="mt-4">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div style={{ width: seg(healthy) }} className="bg-primary" />
        <div style={{ width: seg(care) }} className="bg-amber-500" />
        <div style={{ width: seg(replace) }} className="bg-red-500" />
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        <Row dotClass="bg-primary" label="Healthy" value={healthy} total={total} />
        <Row dotClass="bg-amber-500" label="Needs care" value={care} total={total} />
        <Row dotClass="bg-red-500" label="Needs replacement" value={replace} total={total} />
      </ul>
    </div>
  );
}

function Row({
  dotClass,
  label,
  value,
  total,
}: {
  dotClass: string;
  label: string;
  value: number;
  total: number;
}) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        {label}
      </span>
      <span className="text-muted-foreground">
        {value} · {Math.round((value / total) * 100)}%
      </span>
    </li>
  );
}
