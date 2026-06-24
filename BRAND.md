# GGG — Brand & Design System

This is the visual contract for GGG (Good Game Guild). It is extracted directly from the provided mock screens (Referee Settlement Console, Tournament Creator, Live Prize Pool) and codified for implementation in Tailwind CSS v4. When a screen isn't specified, derive from these tokens — don't invent a parallel system.

The aesthetic is **kinetic crypto-brutalism**: a near-black competitive-gaming surface, an electric acid-yellow as the protocol's voice, an electric violet for action, hard offset shadows for high-stakes moments, and frosted "kinetic glass" for everything fluid. Monospace for anything that is data or on-chain; a tight geometric sans for everything human.

---

## 1. Design thesis

- **Trustless, on-chain, live.** The UI should feel like a settlement terminal, not a marketing site. Money is real, the ledger is immutable, and the interface signals that with monospaced addresses, live pulses, and decisive hard-edged controls.
- **Two surface registers, one system.** High-stakes / irreversible screens (settlement, the prize pool itself) use **brutalist** hard borders with `4px 4px 0` offset shadows and zero radius. Configuration / browsing screens (create tournament, lists) use softer **kinetic glass** panels with subtle radii. Both draw from the same palette and type.
- **Acid is the brand; violet is the verb.** Acid-yellow marks identity, live state, and on-chain truth. Electric violet marks the primary irreversible action (deploy, finalize).

---

## 2. Color tokens

Near-black canvas, high-contrast accents. Hex values are taken verbatim from the mock's Tailwind config. In Tailwind v4 declare these in an `@theme` block as `--color-*` custom properties.

### Brand accents
| Token | Hex | Role |
|---|---|---|
| `acid-yellow` | `#cdf200` | **Primary brand accent.** Logo, live indicators, on-chain truth, key data, focus on brutalist screens. |
| `acid-yellow-bright` | `#d9ff00` | Brighter acid variant used on the darkest canvas (`#0A0A0B`). |
| `secondary-fixed-dim` | `#b4d400` | Dim acid for secondary data / progress fills. |
| `electric-violet` | `#a078ff` | **Primary action accent** (finalize/deploy buttons, violet left-borders, links). |
| `electric-violet-strong` | `#8B5CF6` | Stronger violet for solid primary buttons + focus rings on glass screens. |
| `primary` | `#d0bcff` | Light-violet for headings/highlights on dark surfaces. |
| `inverse-primary` | `#6d3bd7` | Deep violet for inverse contexts. |

### Surfaces (dark ramp)
| Token | Hex |
|---|---|
| `background` | `#131314` (primary canvas) / `#0A0A0B` (deepest canvas, creator screens) |
| `surface-container-lowest` | `#0e0e0f` |
| `surface-container-low` | `#1c1b1c` |
| `surface-container` | `#201f20` |
| `surface-container-high` | `#2a2a2b` |
| `surface-container-highest` | `#353436` |
| `surface-variant` | `#353436` |
| `surface-bright` | `#3a393a` |

### Text & lines
| Token | Hex | Role |
|---|---|---|
| `on-background` / `on-surface` | `#e5e2e3` | Primary text on dark. |
| `on-surface-variant` | `#cbc3d7` | Secondary / muted text. |
| `outline` | `#958ea0` | Default borders, incl. brutalist border color. |
| `outline-variant` | `#494454` | Hairline dividers, subtle borders. |
| `secondary` | `#ffffff` | Pure white for 2nd-place / max-emphasis text. |

### Semantic / state
| Token | Hex | Role |
|---|---|---|
| `error` | `#ffb4ab` | Error text / "remove" affordances. |
| `error-container` | `#93000a` | Error surface. |
| `on-error-container` | `#ffdad6` | Text on error surface. |
| `on-secondary-fixed` | `#181e00` | Text on acid-yellow fills. |
| `on-secondary-container` | `#000000` / `#5a6b00` | Text on acid containers (black on bright acid). |

### Usage rules
- **Text on acid-yellow** is always near-black (`on-secondary-fixed` `#181e00` or `#000000`) — never white. Acid is bright; preserve legibility.
- **Acid-yellow is a highlight, not a background field.** Reserve it for the logo, live dots, key numbers, active nav, and the borders of "live"/active states. Large acid fills are only for small badges and the single hero prize number.
- **Violet drives the eye to the one irreversible action** on a screen. Don't scatter it.
- Maintain WCAG AA contrast: body text uses `on-surface` `#e5e2e3` on the dark ramp; muted text uses `on-surface-variant` and is never used for critical small print.

---

## 3. Typography

Three roles, two families. Load via Google Fonts: **Sora** (400/600/700/800) and **Space Mono** (400/700). Icons via **Material Symbols Outlined**.

| Family | Role |
|---|---|
| **Sora** | Display + body — every human-readable headline and paragraph. |
| **Space Mono** | Data + labels — wallet addresses, amounts, tx hashes, tournament IDs, and all-caps eyebrow labels. |
| **Material Symbols Outlined** | Iconography. Default `FILL 0, wght 400`; switch to `FILL 1` for active/selected icons. |

### Type scale (verbatim from mock)
| Token | Size / line / tracking / weight | Use |
|---|---|---|
| `headline-xl` | 48px / 1.1 / −0.04em / 800 | Page hero titles (e.g. tournament name, "Create Tournament"). |
| `headline-lg` | 32px / 1.2 / −0.02em / 700 | Section headings, large numbers. |
| `headline-lg-mobile` | 24px / 1.2 / −0.02em / 700 | Mobile hero / card titles. |
| `body-lg` | 18px / 1.6 / 0 / 400 | Lead paragraphs. |
| `body-md` | 16px / 1.5 / 0 / 400 | Default body. |
| `data-mono` | 14px / 1.4 / −0.01em / 500 | Wallet/tx/data values (Space Mono). |
| `label-caps` | 12px / 1 / 0.1em / 700 | Uppercase eyebrows, nav, button labels (Space Mono). |

### Typographic mannerisms (from the mock)
- **All-caps mono labels** with wide tracking (`0.1em`) for nav, section eyebrows, badges, and button text on brutalist screens.
- **Italic + uppercase + tight tracking** for the most charged moments — the "GGG" wordmark on the live screen, "Finalize Payouts", winner names in settlement slots. Use italics sparingly, as an accent.
- Big **number-forward** displays: the prize pool renders at up to 100–160px in `headline-xl` weight, acid-yellow, with the unit ("XLM") set small and dim beside it.
- Addresses, hashes, IDs are **always Space Mono**, often tinted acid or violet and set on a subtle surface chip (`bg-surface-container px-2`).

---

## 4. Spacing, radius, layout

### Spacing tokens (verbatim)
`unit` 4px · `stack-tight` 8px · `stack-dense` 12px · `gutter` 16px · `margin-mobile` 16px · `margin-desktop` 40px · `container-max` 1440px.

### Radius
`DEFAULT` 0.25rem · `lg` 0.5rem · `xl` 0.75rem · `full` 9999px.
- **Brutalist surfaces use `rounded-none`** (settlement, prize pool, high-contrast cards).
- **Glass / config surfaces use `rounded-xl`/`rounded-2xl`** (creation form, preview cards, list rows).
- Pills (`rounded-full`) for wallet chips and small status badges on the softer screens.

### Layout
- Max content width `1440px` (`container-max`); desktop page margins `40px`, mobile `16px`.
- App shell: sticky **top nav** (h-20), a **left side-nav** (w-64, sticky, hidden on mobile), and a content area. On mobile the side-nav collapses to a fixed bottom tab bar.
- Detail/console screens use a 12-column grid (`lg:grid-cols-12`): primary content `col-span-8`, live feed / candidate pool `col-span-4`.
- Generous internal padding on panels (`p-6` to `p-12`); dense data rows separated by hairline `outline-variant` dividers.

---

## 5. Signature elements

These are the parts GGG should be remembered by. Reproduce them faithfully.

### Brutalist border
```css
.brutalist-border        { border: 2px solid #958ea0; box-shadow: 4px 4px 0 #000; }
.brutalist-border-active { border-color: #cdf200; box-shadow: 4px 4px 0 #cdf200; }
```
Used on high-stakes panels and cards. The active (acid) variant marks selected/filled/live state.

### Kinetic glass
```css
.kinetic-glass { background: rgba(32,31,32,0.6); backdrop-filter: blur(12px); border: 2px solid #353436; }
.glass-panel   { background: #201f20; border: 1px solid #494454; }   /* opaque variant */
```
Frosted panels for fluid/secondary content (stat cards, pools, candidate lists, preview cards).

### High-contrast hero card
```css
.high-contrast-card { background: #0e0e0f; border: 2px solid #cdf200; }
.acid-glow          { box-shadow: 0 0 40px rgba(205,242,0,0.15); }
```
The prize-pool centrepiece: deepest surface, acid border, soft acid glow, optional faint grid overlay, subtle 3D mouse-parallax tilt on hover.

### Violet accent edge
```css
.violet-accent { border-left: 4px solid #a078ff; }
```
A 4px violet left-border to flag informational/feature cards.

### Buttons
- **Primary irreversible action** (Deploy / Finalize): solid `electric-violet` / `electric-violet-strong`, near-black or white text, brutalist offset shadow, uppercase, often italic; hover lifts (`translateY(-2px)`, shadow grows to `6px 6px 0`), active presses (`translateY(2px)`, shadow `2px 2px 0`). Disabled drops to ~20% opacity.
- **Acid CTA** (Connect Wallet on glass screens): `bg-secondary-container` (`#cdf200`/`#D9FF00`) with black text, `rounded-lg`, subtle scale on active.
- **Secondary**: transparent with `2px outline` border, muted text, fills to `surface-container-highest` on hover.
- All button labels use `label-caps` (uppercase, mono, wide tracking).

### Badges & chips
- **LIVE badge:** small acid-yellow fill, black text, `label-caps`, sometimes paired with a pulsing dot.
- **Wallet chip:** `surface-container-high` pill or `2px outline` box, wallet icon + truncated `G…`/`0x…` address in `data-mono`, acid- or violet-tinted.
- **Status chips:** active = acid border/text; finished = muted; cancelled = error tint.

### Inputs
- `surface-container-low` background, `outline-variant` border, `rounded-xl`, generous padding.
- **Focus:** border switches to `electric-violet-strong` with a 1px violet ring; the field's wrapper may scale `1.01` for a kinetic micro-interaction. Numeric/data inputs (entry fee, splits) render their value in `data-mono`, acid-tinted.

---

## 6. Motion

Motion reinforces "live and on-chain" — keep it purposeful, and respect `prefers-reduced-motion`.

| Name | Behaviour | Where |
|---|---|---|
| `glow-pulse-acid` | 1.5s alternating acid box-shadow glow (5px→20px) | Live status dots. |
| `pulse-live` | 2s opacity/scale pulse | "LIVE" indicators, countdown seconds, live address dots. |
| `ticker-scroll` | 30s linear vertical loop | Registration feed ticker. |
| Hero parallax | Mouse-driven `perspective(1000px) rotateX/Y` tilt | High-contrast prize card. |
| Live counter | Prize number ticks up with a brief `scale(1.05)` pop | Live pool. |
| Drag-and-drop | Cards are `cursor: grab`; on grab `translate(2px,2px)` + reduced shadow; drop zones highlight to acid (`drop-zone-active`) | Settlement console. |
| Button press | Lift on hover, press on active via translate + shadow swap | Primary buttons. |
| Settlement modal | Full-screen blurred overlay, spinning acid ring, animated progress bar, status text ("SIGNING…") | Finalisation in progress. |

---

## 7. Iconography & imagery

- **Material Symbols Outlined** throughout (e.g. `account_balance_wallet`, `sports_esports`, `gavel`, `workspace_premium`, `military_tech`, `stars`, `verified_user`, `token`, `shield`, `terminal`). Active/selected icons use `FILL 1`.
- Player/avatar imagery sits in **2px-bordered square frames** (no rounding), often **grayscale by default, de-saturating to full color on hover** — reinforcing the "candidate becomes selected" idea.
- Decorative grid overlays (40px) at low opacity add a "ledger/terminal" texture behind hero numbers.
- QR codes render on a **white padded tile** for scan reliability, set inside a glass or violet-accented card.

---

## 8. Voice & microcopy

- **Plain, decisive, terminal-flavoured.** Active voice. Buttons name the exact effect: "Deploy Soroban Contract", "Finalize Payouts", "Connect Wallet". The action keeps its name through the flow (a "Finalize" button leads to a "Settlement Success" result).
- **On-chain literacy is part of the brand:** show real artifacts — contract IDs, tx hashes, ledger language, "escrow", "settlement", "verified", basis-point splits — but always with a human-readable gloss next to the raw value.
- **All-caps mono** for labels and system status; **sentence case** for explanatory body copy.
- Errors and empty states speak in the interface's voice: explain what happened and the next step, never vague, never apologetic. An empty tournament list invites "Create your first tournament."
- Numbers are honest and precise: amounts in `data-mono`, split percentages shown both as % (UI) and basis points (contract).

---

## 9. Tailwind v4 implementation note

Translate the mock's `tailwind.config` into a CSS-first `@theme` block (Tailwind v4 has no required JS config):

```css
@import "tailwindcss";

@theme {
  --color-background: #131314;
  --color-acid-yellow: #cdf200;
  --color-electric-violet: #a078ff;
  --color-electric-violet-strong: #8B5CF6;
  --color-primary: #d0bcff;
  --color-surface-container: #201f20;
  --color-surface-container-low: #1c1b1c;
  --color-surface-container-lowest: #0e0e0f;
  --color-surface-container-high: #2a2a2b;
  --color-surface-container-highest: #353436;
  --color-on-surface: #e5e2e3;
  --color-on-surface-variant: #cbc3d7;
  --color-outline: #958ea0;
  --color-outline-variant: #494454;
  --color-error: #ffb4ab;
  /* …complete with the full table in §2… */

  --font-display: "Sora", sans-serif;
  --font-body: "Sora", sans-serif;
  --font-mono: "Space Mono", monospace;

  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;

  --spacing-gutter: 16px;
  --spacing-margin-desktop: 40px;
  --spacing-container-max: 1440px;
}
```

Signature classes (`.brutalist-border`, `.kinetic-glass`, `.high-contrast-card`, `.acid-glow`, `.violet-accent`, the keyframes) live in a global stylesheet exactly as in the mock. Keep the dark theme as the default (`<html class="dark">`); GGG ships dark-only.
