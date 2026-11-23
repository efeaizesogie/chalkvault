# Chalkvault: design

**One line:** a teacher's ruled markbook on warm paper. Serif headings, hairline rules, one flat colour per class and one yellow "ticket" for the main action. It should feel like stationery, not a dashboard.

## References

| Source | What we took |
|---|---|
| Refero **Steep** ("serif analytics on warm paper") | Regular-weight serif display (never bold), tight tracking at large sizes, an almost colourless system, peach `#fbe1d1` + sienna `#5d2a1a` as the only warm pair, pill buttons, hairline borders, almost no shadows. |
| Framer **Nixole** ("ruled, colour-coded school") | Page split into ruled cells with 1px ink lines, a flat colour block per subject/class with its own ink colour, rows that lift on hover, a single yellow ticket as the primary action that "presses onto its slip". |

Changes for Chalkvault:
- Paper is warm (`#f7f4ee`) instead of Steep's pure white, because this is a markbook.
- Peach/sienna is used for one thing only: **anything leaving the device** (the cloud stamp, the "what gets sent" slip). Warmth means attention.

## Tokens

### Colour
| Token | Hex | Use |
|---|---|---|
| `--paper` | `#f7f4ee` | Page canvas |
| `--sheet` | `#fffdf8` | Ruled sheet, inputs, cards |
| `--paper-2` | `#efe9dd` | Hover rows, quiet fills |
| `--ink` | `#17191c` | Text, rules, filled pills |
| `--ink-2` | `#45484f` | Body secondary |
| `--muted` | `#777b86` | Helper text, meta |
| `--rule` | `#ddd6c8` | Hairline ruled lines |
| `--ticket` | `#f4d64e` | **The single primary action** per screen |
| `--peach` / `--sienna` | `#fbe1d1` / `#5d2a1a` | Cloud and data-leaving-device surfaces only |
| `--device` | `#17191c` on `--sheet` | On-device stamp (ink, with a solid dot) |

Class colours. Each has its own ink, and the teacher picks one per class:
`chalk #dfef4f / ink`, `cobalt #2440e6 / white`, `vermilion #ff6b3d / ink`, `moss #2f6b4f / white`, `lilac #c9b8ff / ink`, `teal #0f7f86 / white`.

Banned: gradients, purple-blue AI glow, sparkle icons, glassmorphism, drop shadows on content cards.

### Type
- **Display:** Newsreader 400 (italic allowed for emphasis), sizes 64 / 44 / 30 / 22, letter-spacing -0.02em at 44 and above. Never bold.
- **Body/UI:** Instrument Sans 400/500, 15px base, line-height 1.5.
- **Labels and stamps:** JetBrains Mono 500, 11px, uppercase, +0.06em tracking. Used for column heads, the on-device/cloud stamps and the request ledger.

### Shape and space
- 4px base unit; gaps 8/12/16/24; 48 between sections.
- Ruled cells have square corners (the sheet is paper). Floating things (dialogs, toasts, the result card) use a 20px radius. Buttons are always pills (9999px).
- Borders are 1px `--rule` inside the sheet and 1px `--ink` for the sheet's outer frame and section breaks.
- Only one elevated thing at a time (a dialog), with shadow `0 24px 60px -24px rgba(23,25,28,.35)`.

## Components
- **Ticket button** (primary): `--ticket` fill, ink text, 1px ink border, pill, with a 3px ink "slip" offset underneath (`box-shadow: 0 3px 0 var(--ink)`). On press it moves down 3px and the slip disappears. Exactly one per view.
- **Ghost pill** (secondary): transparent, 1px ink border.
- **Class tab:** flat colour block with the class name in the class ink and a mono student count; the active class gets an ink outline.
- **Student row:** a ruled row with name in serif 20px, a mono status (`NOTES` / `DRAFTED` / `FINAL`) and a single-line preview. Lifts 2px with a `--paper-2` fill on hover.
- **Source stamp:** a mono capsule. `● ON THIS DEVICE` in ink on sheet, or `↗ CLOUD · NAMES REMOVED` in sienna on peach. Every AI result shows one.
- **Outbound slip:** a peach card showing the exact text that will be sent to the cloud, with names shown struck through and replaced. You must confirm it before anything leaves the device.
- **Ledger:** a ruled list of every AI request: time, task, source, characters sent. Off-device rows are tinted peach.

## Motion
Short and purposeful: the ticket press (80ms), rows lifting (120ms), the result card writing in (200ms fade and rise). Everything respects `prefers-reduced-motion`.

## Voice
Plain and teacher-to-teacher. "Write comment", not "Generate". "Stays on this laptop", not "edge inference".
