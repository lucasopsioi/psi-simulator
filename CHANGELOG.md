# Changelog

Version numbers follow the in-app `APP_VER` (one increment per shipped build; the portable exe on the Releases page is built from the tagged commit). Condensed from the working notes; the Chinese original with implementation detail is in `README.zh.md`.

| Version | What changed |
|---|---|
| **V79** | Board consolidation, final step: the whole app folds into **five views** (channel list · simulation editor · monitoring & targets · channel architecture · rules & model). |
| V74–V78 | Board consolidation stages 4a–4e: inventory / downstream / audio boards → one *channel list*; detail / summary / month-end DOS → three modes of the *simulation editor*; monitoring + SO targets → one page; reconciliation moved into the architecture page; settings + coefficients → *rules & model*. |
| V71–V73 | Numeric gate infrastructure (per-view, per-cell baselines), a single write entry point behind an engine query layer, "pending confirmation" items grouped by cause with one switch. |
| V69–V70 | Performance: hand-set number recalculation 302 ms → 3–14 ms; pasting an external table 3.9 s → 54 ms. |
| V66–V68 | Three rounds of multi-agent audits on hand-set numbers: 12 confirmed defects traced to 6 root causes, all fixed (lock pre-deduction across time, parent/child overlap, inventory carry-over alignment, no silent clamping). |
| V60–V65 | Data-accuracy audit: month-end DOS uses the real day count everywhere; Excel-equivalent editing in the simulation editor; audio always from its dedicated table; quarter/year DOS caliber fixed; product P&L board with revenue formulas taken straight from the finance sheet. |
| V51–V59 | Sell-in ⇄ downstream reconciliation; channel-architecture board with drag-to-link, direct-to-consumer vs. with-downstream channel types, mirror rows, top-up recommendations; downstream lock-quantity ceilings and rounding. |
| V45–V50 | Lock quantity = full-lifecycle available-to-promise, carried through downstream purchases and the next-year extension; finance quarter table integration; new-product planning rebuilt (add/edit, multi-country scope, launch date, retired products as anchors). |
| V38–V44 | Year-end profile learned from back-tests instead of a hard deadline; smarter replenishment; cumulative rounding; "normal operating stock level"; hand-set numbers cascade with visible calculation steps; indirect channels share the learning chain; long-table export by default. |
| V34–V37 | Purchase simulation for downstream/audio; per-channel replenishment policy typing (stock-level vs. days-of-stock) learned from history; one-shot stocking review loop; composition-effect and manual-override ledgers. |
| V32–V33 | App icon; multi-dimensional simulation editing matrix (four rows on one screen); editable extrapolation years; undo (Ctrl+Z); plan version snapshots. |
| V28–V31 | Excel-style grid interaction; built-in AI analyst (multi-provider LLM, per-board caliber cards, next-year risk tool, 30-question eval set, scope-query tool); agent panel in English. |
| V27 | Product control tower (model-level cockpit), lock-quantity engine, burst coefficients, performance cache layer. |
| V23–V24 | Baseline engine (strips launch, decay, promo and stock-out weeks), country promo calendars, product lifecycle (last sell-in, retirement, succession), new-product planning, model back-test bench, screenshot/diagnostic mode. |
| V18–V21 | Country SO-target loop: fourth data source, target tracking views, channel attributes, market growth multipliers, replenishment back-tests, week→month attribution, unmapped-product warnings. |
| V10 | Version discipline established (2026-08-26): every shipped build bumps `APP_VER` and `package.json`. |
