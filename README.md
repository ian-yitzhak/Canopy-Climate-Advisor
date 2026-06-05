# Canopy — Climate Advisor for Farms

Canopy lets a user upload a drone, aerial, or satellite photo of a farm plot and
receive a single advisory: how many trees there are, how healthy the canopy is,
and — fused with the local weather forecast — what to do and when.

The computer vision and AI run entirely on the WeatherAI platform. This
application is a thin, authenticated orchestration layer: it relays the image,
fetches the matching forecast, and fuses the two results into timed advice. It
holds no durable state of its own.


## How it works

1. The browser collects the plot photo and, optionally, the plot's coordinates.
2. It sends one request to the `getAdvisory` server function with the image and
   any coordinates.
3. The server validates the input, then calls WeatherAI to analyse the image
   (tree count and canopy health).
4. If the analysis finds a real canopy, and coordinates were supplied, the
   server fetches the matching weather forecast.
5. A deterministic fusion step combines the analysis and the forecast into a
   short list of timed actions.
6. The server returns the trees, the weather, and the advisory as one JSON
   object, which the page renders.

The browser never talks to WeatherAI directly and never sees the API key. All
upstream calls happen on the server.


## Tech stack

| Layer      | Choice                | Role                                            |
| ---------- | --------------------- | ----------------------------------------------- |
| Framework  | TanStack Start        | React UI plus server functions in one app       |
| Language   | TypeScript            | Type safety across client and server            |
| Styling    | Tailwind CSS v4       | Card UI and layout                              |
| UI library | Radix primitives      | Accessible components under `src/components/ui` |
| Build      | Vite                  | Dev server and production build                 |
| Upload     | Native file input     | Photo selection with drag and drop              |
| Location   | Browser Geolocation   | Captures plot latitude and longitude            |
| Cache      | In-memory TTL         | Conserves the metered WeatherAI quota           |

There is no database. WeatherAI persists prior analyses on its own platform, so
this app stores nothing.


## Project structure

```
src/
  routes/
    __root.tsx          App shell: HTML document, error and not-found pages.
    index.tsx           The home page: upload form, location, and results UI.
  lib/
    get-advisory.ts     The getAdvisory server function (orchestration).
    weatherai.server.ts Server-only WeatherAI client (analyze + weather).
    fusion.ts           Pure logic: trees + weather -> timed advisory steps.
    cache.server.ts     In-memory TTL cache (get / set / cached).
    rate-limit.server.ts Per-IP token bucket plus a global daily cap.
    advisory-error.ts   Client-safe error type and upstream status mapping.
    advisory.types.ts   Shared types used by both client and server.
    config.server.ts    Helper for reading server-only environment values.
  server.ts             SSR entry with a catch-all error wrapper.
  start.ts              Request middleware (error handling).
  router.tsx            Router and query-client setup.
  styles.css            Tailwind theme tokens and base styles.
```

Files ending in `.server.ts` are never bundled into the client, so the secrets
and upstream logic they contain cannot reach the browser. The `getAdvisory`
function lives in `get-advisory.ts` (not a `.server.ts` file and not under a
`server/` folder) because TanStack Start needs to import it from client code to
build the call bridge; the build strips the function body out of the client
bundle automatically.


## Getting started

Requirements: Node 20 or newer, and a package manager (npm is assumed below).

1. Install dependencies:

   ```
   npm install
   ```

2. Create a local environment file from the example and add a real key:

   ```
   cp .env.example .env.local
   ```

   Then edit `.env.local` and set `WEATHERAI_API_KEY` to your key.

3. Start the dev server:

   ```
   npm run dev
   ```

4. Open the URL printed in the terminal.


## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Start the development server.                 |
| `npm run build`     | Build the production client and server.       |
| `npm run preview`   | Serve the production build locally.           |
| `npm run lint`      | Run ESLint over the project.                  |
| `npm run format`    | Format the project with Prettier.             |


## Configuration

| Variable             | Where set               | Notes                                  |
| -------------------- | ----------------------- | -------------------------------------- |
| `WEATHERAI_API_KEY`  | `.env.local` / host env | Server-only secret. Never expose it.   |

The key is read on the server, per request, inside the WeatherAI client. It must
never be given a `VITE_` prefix, because Vite inlines only `VITE_*` variables
into the client bundle. `.env.local` is gitignored; commit only `.env.example`.


## Security model

The whole posture centres on one fact: the WeatherAI key is a billable secret and
the deployment is public. Everything below protects it.

- The key never reaches the browser. It is read from `process.env` inside
  `weatherai.server.ts`, which the build keeps out of the client bundle. No
  client component imports it.
- Secrets are never committed. `.env.local` is gitignored; the repository ships
  only `.env.example` with a placeholder.
- The endpoint is rate limited. `rate-limit.server.ts` applies a per-IP token
  bucket plus a global daily cap, so an anonymous visitor cannot drain the
  metered quota. Both are in-memory and can be backed by Redis for multiple
  instances.
- Input is validated before any upstream call: an image is required; only JPEG,
  PNG, and WEBP are accepted; the 20 MB size limit is enforced; and coordinates
  outside valid ranges are treated as "analysis only" rather than failing.
- Off-subject uploads are rejected. If the analysis finds no canopy or returns
  low confidence, the request stops with a friendly message instead of fusing a
  meaningless advisory — and before any weather call is made.
- Errors are mapped, not leaked. Upstream status codes are translated into safe,
  readable messages in `advisory-error.ts`; raw upstream bodies and stack traces
  never reach the client.


## The advisory flow in detail

`getAdvisory` (`src/lib/get-advisory.ts`) runs these steps on the server:

1. Rate limit the caller by IP and against the global daily cap.
2. Validate the uploaded image (presence, type, size).
3. Parse optional coordinates; ignore them if missing or out of range.
4. Call WeatherAI `POST /v1/trees/analyze` with the image.
5. Reject the request if no trees are detected or confidence is below the
   threshold defined by `MIN_CONFIDENCE`.
6. If coordinates exist, fetch the forecast with WeatherAI `GET /v1/weather`,
   called with `ai=false` so the scarce AI-summary quota is preserved. Results
   are cached by coarse coordinates and a 30-minute time bucket.
7. Fuse the analysis and the forecast into timed steps with `buildAdvisory`.
8. Return `{ trees, weather, advisory, rateLimit, note }`.

The fusion logic (`src/lib/fusion.ts`) is a pure function. It keys irrigation
advice off the next 24 hours of rain, looks for a dry window to schedule
inspection or pruning, and suggests mulching before a soaking day. When no
coordinates are supplied it falls back to advice based on canopy health alone.


## Caching and quota strategy

| Resource      | Strategy                                                          |
| ------------- | ----------------------------------------------------------------- |
| Weather       | Cached by coarse coordinates plus a 30-minute bucket; hits are free. |
| Tree analysis | Never cached; each call is a real, metered analysis.              |
| AI summaries  | Skipped by calling weather with `ai=false`.                       |

The cache module exposes a small `get` / `set` / `cached` interface, so the
in-memory store can be replaced with Redis or a KV store without changing call
sites.


## Note on the WeatherAI weather response

The WeatherAI documentation specifies the weather request parameters but not the
exact weather response body. The client in `weatherai.server.ts` normalises the
response tolerantly, accepting several likely field names. Call the weather
endpoint once with a real key, confirm the field names, and tighten the
normaliser and the rain-detection logic in the fusion module accordingly. The
`MIN_CONFIDENCE` threshold for rejecting off-subject photos should be verified
the same way.
