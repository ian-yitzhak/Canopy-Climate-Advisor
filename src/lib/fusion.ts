// Deterministic fusion: combine the tree analysis and the weather forecast into
// timed, actionable advice. Pure function — no secrets, no I/O — so it is fully
// testable and can be reasoned about independently of the upstream APIs.

import type { Advisory, TreeAnalysis, WeatherResult } from "./advisory.types";

// Thresholds, in millimetres of rain, used to classify a day.
const WET_DAY_MM = 5; // enough that irrigation is wasteful / spraying washes off
const DRY_DAY_MM = 1; // effectively no rain — good window for field work
const SOAKING_MM = 10; // heavy rain that locks moisture into the soil

export function buildAdvisory(
  trees: TreeAnalysis,
  weather: WeatherResult | null,
): { advisory: Advisory["advisory"]; note?: string } {
  const steps: Advisory["advisory"] = [];

  // --- Weather is unavailable: advise from canopy health alone. ----------
  if (!weather) {
    if (trees.tree_health.needs_replacement > 0) {
      steps.push({
        when: "Soon",
        action: `Plan replacement for ${trees.tree_health.needs_replacement} declining tree(s)`,
        reason: "These trees are flagged as beyond recovery in the canopy scan.",
      });
    }
    if (trees.tree_health.needs_care > 0) {
      steps.push({
        when: "This week",
        action: `Inspect ${trees.tree_health.needs_care} tree(s) showing stress`,
        reason: "Early intervention keeps stressed trees from declining further.",
      });
    }
    // Surface the upstream agronomic recommendations as fallback steps.
    for (const rec of trees.recommendations.slice(0, 3 - steps.length)) {
      steps.push({ when: "When practical", action: rec, reason: "From the canopy analysis." });
    }
    if (steps.length === 0) {
      steps.push({
        when: "No action needed",
        action: "Canopy looks healthy",
        reason: "No stressed or declining trees were detected.",
      });
    }
    return {
      advisory: steps,
      note: "Share your location to fuse this with the local forecast for day-by-day timing.",
    };
  }

  // --- Weather-aware fusion. ---------------------------------------------
  const rain24 = weather.rain_mm_next_24h;

  // Irrigation timing keyed off the next 24h of rain.
  if (rain24 >= WET_DAY_MM) {
    steps.push({
      when: "Today",
      action: "Hold off on irrigation",
      reason: `About ${Math.round(rain24)} mm of rain is expected within 24 hours.`,
    });
  } else if (rain24 < DRY_DAY_MM) {
    steps.push({
      when: "Today",
      action: "Irrigate the drier rows",
      reason: "No meaningful rain in the next 24 hours; soil moisture will keep dropping.",
    });
  }

  // Find the first dry window beyond today for field work (pruning, inspection).
  const dryDay = weather.forecast.slice(1).find((d) => d.rain_mm < DRY_DAY_MM);
  const needsAttention = trees.tree_health.needs_care + trees.tree_health.needs_replacement;
  if (dryDay && needsAttention > 0) {
    steps.push({
      when: dryDay.day,
      action: `Inspect and prune the ${needsAttention} flagged tree(s)`,
      reason: `${dryDay.day} stays dry (${Math.round(dryDay.rain_mm)} mm), a clean window before the next rain.`,
    });
  }

  // A soaking day is the moment to lock moisture in — mulch exposed soil first.
  const soakingDay = weather.forecast.find((d) => d.rain_mm >= SOAKING_MM);
  if (soakingDay && trees.canopy_coverage_pct < 60) {
    steps.push({
      when: `Before ${soakingDay.day}`,
      action: "Mulch exposed rows",
      reason: `${Math.round(soakingDay.rain_mm)} mm forecast on ${soakingDay.day} will drive that moisture into mulched soil.`,
    });
  }

  // Always give at least one step; fall back to the upstream recommendation.
  if (steps.length === 0) {
    const rec = trees.recommendations[0];
    steps.push(
      rec
        ? { when: "This week", action: rec, reason: "From the canopy analysis." }
        : {
            when: "This week",
            action: "Maintain current routine",
            reason: "Canopy health and the forecast are both stable.",
          },
    );
  }

  return { advisory: steps.slice(0, 4) };
}
