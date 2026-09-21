---
description: How to analyze data in the Countdown (RMNCAH/Vaxx/Pooled) Shiny apps, backed by cd2030.core.
---

# Countdown Analysis (cd2030.core apps)

The active Shiny app is one of the built-in Countdown apps (RMNCAH, Vaxx, or Pooled), all backed by the `cd2030.core` R package's `CacheConnection` R6 class. See the "Shiny App" chat context for the active app's id and selected file.

## Before writing any R code

1. Call `cd2030Docs` with the app id to see which pages/functions exist and what `CacheConnection` methods/fields each one reads. Do this before guessing method names or output meaning -- `CacheConnection`'s surface is app-specific and not standard R.
2. Call `analysisMemory` with `getContext` (`scope: "shiny"`, the active `appId` + `filePath`) if the auto-injected summary in your context mentions prior glossary terms or decisions -- read the full text before repeating or contradicting a past choice (e.g. a COC-selection method, an analysis period restriction).

## Loading the cache

Use `readCd2030Cache` (not hand-written `cd2030.core::init_CacheConnection()` via `runR`) to load the app's `.rds` cache into the managed R session as `.datasuite_cache`. It always reopens fresh, so it's safe to call again any time you suspect the Shiny app changed the underlying data -- never assume a `.datasuite_cache` from earlier in the conversation is still current.

## Running the analysis

Use `runR` against the loaded `.datasuite_cache` for calculations, tables, and plots. Prefer the methods/fields `cd2030Docs` told you about over re-deriving indicators from raw fields yourself -- `cd2030.core` encodes methodology decisions (denominators, exclusions, adjustments) that are easy to get subtly wrong by hand.

## Recording durable decisions

Once you make a real, durable analysis choice for this dataset (which COC-selection method, which time period, which indicator definition when more than one is plausible, why a data element or district was excluded), call `analysisMemory`'s `recordDecision` so it isn't silently re-decided differently next time. Use `addGlossaryTerm` for domain terms specific to this analysis (e.g. what "coverage rate" means for this dataset's indicator set). Don't record trivial or obvious choices.

## Output and reports

See the output-and-reports guidance for how to surface results and generate a report from this analysis.
