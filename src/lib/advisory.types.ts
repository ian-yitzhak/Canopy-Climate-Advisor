// Shared types for the advisory flow. No secrets, no server-only imports —
// safe to use from both the browser and server-side code.

export type TreeHealth = {
  healthy: number;
  needs_care: number;
  needs_replacement: number;
};

export type TreeAnalysis = {
  total_tree_count: number;
  canopy_coverage_pct: number;
  tree_health: TreeHealth;
  confidence_score: number;
  observations: string[];
  recommendations: string[];
  overlay_image_url?: string;
  original_image_url?: string;
};

export type ForecastDay = {
  day: string;
  high: number;
  low: number;
  rain_mm: number;
  conditions: string;
};

export type WeatherResult = {
  location: string;
  temp_c: number;
  conditions: string;
  rain_mm_next_24h: number;
  forecast: ForecastDay[];
};

export type AdvisoryStep = {
  when: string;
  action: string;
  reason: string;
};

export type RateLimitInfo = {
  limit: number | null;
  remaining: number | null;
  reset: number | null;
};

export type Advisory = {
  trees: TreeAnalysis;
  // null when no coordinates were supplied — the response is "analysis only".
  weather: WeatherResult | null;
  advisory: AdvisoryStep[];
  rateLimit?: RateLimitInfo;
  note?: string;
};
