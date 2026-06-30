# GGG — Brand & Design System

This is the visual contract for GGG (Good Game Guild). It is extracted directly from the provided mock screens (Referee Settlement Console, Tournament Creator, Live Prize Pool) and codified for implementation in Tailwind CSS. When a screen isn't specified, derive from these tokens — don't invent a parallel system.

The aesthetic is **Titanium Carbon**: a technical-noir settlement terminal milled from carbon fibre and titanium, lit by burnt **bronze/amber** as the protocol's single voice. Recessed "milled" inputs, hard 1px industrial borders, frosted glass for fluid content, and a low bronze glow on every high-stakes control. Monospace for anything that is data or on-chain; a tight geometric sans for everything human.

---

## 1. Design thesis

- **Trustless, on-chain, live.** The UI should feel like a precision-engineered settlement terminal, not a marketing site. Money is real, the ledger is immutable, and the interface signals that with monospaced addresses, live pulses, recessed machined fields, and decisive bronze controls.
- **Two surface registers, one system.** High-stakes / structural screens (settlement, the prize pool, contract config) use hard **industrial / titanium** 1px borders with inset "milled" shadows and a low bronze glow. Fluid / secondary content (candidate lists, stat cards, live feeds) uses frosted **kinetic glass** panels. Both draw from the same palette and type.
- **Bronze is the brand and the verb.** Burnt amber (`#f7bd48`) marks identity, live state, on-chain truth **and** the primary irreversible action (deploy, finalize, connect). There is no second action color — bronze carries the eye to the one decisive control on each screen. Don't scatter it.

---

## 2. Color tokens

Near-black canvas, warm bronze accents. Hex values are taken verbatim from the mock's Tailwind config. Declare these as Tailwind theme colors (or `--color-*` custom properties in a v4 `@theme` block).

### Brand accents
| Token | Hex | Role |
|---|---|---|
| `primary` / `primary-fixed-dim` / `surface-tint` | `#f7bd48` | **Primary brand + action accent.** Logo, live indicators, on-chain truth, key data, focus rings, and the primary CTA. |
| `primary-container` | `#ba880f` | Deep bronze — the dark stop of the bronze gradient; hover/active container fills. |
| `primary-fixed` | `#ffdea6` | Light amber for subtle valuation / sub-labels. |
| `on-primary` | `#412d00` | Near-black-brown text **on** bronze fills. |
| `on-primary-container` | `#392700` | Text on deep-bronze containers. |
| `secondary` / `secondary-fixed-dim` | `#fbb980` | Warm peach — status accents, "READY" states, secondary indicator dots. |
| `secondary-container` | `#693c0e` | Bronze-brown fill for the active nav item. |
| `on-secondary-container` | `#e7a871` | Text/icons on the active nav fill. |
| `tertiary` / `tertiary-fixed-dim` | `#a1c9ff` | Cool blue — used sparingly for code syntax (type names) and informational contrast only. |

### Surfaces (dark ramp)
| Token | Hex |
|---|---|
| `background` / `surface` / `surface-dim` | `#131313` (primary canvas) |
| `surface-container-lowest` | `#0e0e0e` (milled-input floor, deepest panels) |
| `surface-container-low` | `#1c1b1b` |
| `surface-container` | `#201f1f` |
| `surface-container-high` | `#2a2a2a` |
| `surface-container-highest` / `surface-variant` | `#353534` |
| `surface-bright` | `#393939` |

> Code/terminal panes drop even lower to `#0a0a0a` / `#0A0A0A` (raw hex in the mock) for the contract source view and milled fields.

### Text & lines
| Token | Hex | Role |
|---|---|---|
| `on-background` / `on-surface` | `#e5e2e1` | Primary text on dark. |
| `on-surface-variant` | `#d3c4af` | Secondary / muted text (warm taupe). |
| `outline` | `#9c8f7b` | Default borders, muted labels, drop-zone glyphs. |
| `outline-variant` | `#4f4535` | Hairline dividers, dashed winner-slot borders. |
| `secondary` (white-ish) | — | Max emphasis handled by `on-surface` `#e5e2e1`; true white reserved for tiny accent strips. |

### Semantic / state
| Token | Hex | Role |
|---|---|---|
| `error` | `#ffb4ab` | Error text / "remove" affordances, idle status dots. |
| `error-container` | `#93000a` | Error surface. |
| `on-error` | `#690005` | Text on error fills. |
| `on-error-container` | `#ffdad6` | Text on error surface. |
| `tertiary-container` | `#5594db` | Informational blue container (rare). |

### Usage rules
- **Text on bronze (`#f7bd48`) is always near-black-brown** (`on-primary` `#412d00`) — never white. Bronze is bright; preserve legibility.
- **Bronze is a highlight, not a background field.** Reserve solid bronze for the logo, live dots, key numbers, active nav border, badges, and the single primary CTA per screen. Large bronze appears only as the hero prize number (via `bronze-gradient` text clip) and small badges/buttons.
- **One bronze action per screen.** Because bronze is also the brand color, the irreversible CTA earns the most saturated treatment (solid fill or `bronze-gradient-btn`); everything else uses bronze sparingly as tint or border.
- Maintain WCAG AA contrast: body text uses `on-surface` `#e5e2e1`; muted text uses `on-surface-variant` `#d3c4af` and is never used for critical small print.

---

## 3. Typography

Three roles, two families. Load via Google Fonts: **Sora** (400/500/600/700/800) and **JetBrains Mono** (400/500/700). Icons via **Material Symbols Outlined**.

| Family | Role |
|---|---|
| **Sora** | Display + body — every human-readable headline and paragraph. |
| **JetBrains Mono** | Data + labels — wallet addresses, amounts, tx hashes, tournament/match IDs, contract source, telemetry, and all-caps eyebrow labels. |
| **Material Symbols Outlined** | Iconography. Default `FILL 0, wght 400, GRAD 0, opsz 24`; switch to `FILL 1` (`.fill-icon`) for active/selected icons. |

### Type scale (verbatim from mock)
| Token | Size / line / tracking / weight | Use |
|---|---|---|
| `display-lg` | 48px / 1.1 / −0.02em / 800 | Page hero titles ("Referee Console") and the prize-pool number. |
| `headline-lg` | 32px / 1.2 / 700 | Section headings, large stat numbers, settlement modal title. |
| `headline-md` | 24px / 1.3 / 600 | Page/sub-section headings, panel titles, top-bar title. |
| `headline-lg-mobile` | 24px / 1.2 / 700 | Mobile hero / card titles. |
| `body-lg` | 18px / 1.6 / 400 | Lead paragraphs, prominent button labels. |
| `body-md` | 16px / 1.5 / 400 | Default body. |
| `data-value` | 14px / 1.2 / 700 | Wallet/tx/amount values (JetBrains Mono). |
| `data-label` | 14px / 1.2 / 0.05em / 500 | Mono eyebrows, telemetry, all-caps system labels (JetBrains Mono). |
| `caption` | 12px / 1.4 / 500 | Fine print, timestamps, sub-labels (Sora). |

### Typographic mannerisms (from the mock)
- **All-caps mono labels** (`data-label`) with wide inline tracking (`tracking-widest`, `tracking-[0.2em]`, `tracking-[0.3em]`) for nav eyebrows, section labels, badges, button text, and system status.
- **Tight uppercase + negative tracking** for the wordmark and the most charged moments — "GGG PROTOCOL", "Referee Console", "Powered by Soroban" (italic). Use italics sparingly, as an accent.
- Big **number-forward** displays: the prize pool renders large in `display-lg` weight via the **`bronze-gradient`** text clip, with the unit ("XLM") set small and dim beside it. Countdown digits use `display-lg`/`headline-lg`, the live seconds tinted `primary`.
- Addresses, hashes, IDs, fees, basis-point splits are **always JetBrains Mono** (`data-value`), often tinted `primary` and set on a subtle surface chip (`bg-surface-container-high px-2`).

---

## 4. Spacing, radius, layout

### Spacing tokens (verbatim)
`xs` 4px · `sm` 8px · `base` 8px · `md` 16px · `lg` 24px · `gutter` 24px · `margin` 32px · `xl` 48px.

> Note the gutter is now **24px** and the desktop margin **32px** (both larger/tighter than the prior system). Content panels breathe with `p-lg` (24px) to `p-xl` (48px); dense data rows are separated by hairline `surface-variant`/`outline-variant` dividers.

### Radius
`DEFAULT` 0.25rem · `lg` 0.5rem · `xl` 0.75rem · `full` 9999px.
- **Industrial / structural surfaces use `rounded-none`** (contract config form, deploy panel) for a milled-plate look.
- **Titanium & glass cards use `rounded-xl`** (prize ticker, feed, join, timer/stats) or **`rounded-sm`** (referee glass panels, candidate cards).
- Pills (`rounded-full`) for live dots, avatar frames, progress tracks, and small status indicators.

### Layout
- Content max width is **`max-w-7xl`** (≈1280px) on dashboard/console screens, `max-w-6xl` for the referee body; full-bleed nav.
- App shell: sticky **top nav** (px-gutter py-md), a **left side-nav** (`w-64`, sticky, hidden on mobile / collapsing to a bottom action bar), and a content area.
- Console / dashboard screens use a 12-column grid (`grid-cols-12` / `md:grid-cols-12`): primary content `col-span-7`/`col-span-8`, secondary feed / sidebar `col-span-4`/`col-span-5`. Bento-style nesting within.
- Custom **4px technical scrollbar**: track `#131313`, thumb `#353534`, thumb-hover `#f7bd48`.

---

## 5. Signature elements

These are the parts GGG should be remembered by. Reproduce them faithfully.

### Industrial border (structural, with bronze hairline)
```css
.industrial-border { border: 1px solid #353534; position: relative; }
.industrial-border::before {
  content: ''; position: absolute; top: 0; left: 0;
  width: 100%; height: 1px;
  background: linear-gradient(90deg, transparent, #f7bd48, transparent);
  opacity: 0.3;
}
```
A 1px titanium border with a faint bronze gradient hairline along the top edge — the default for config/contract panels. Pair with `.glow-hover` for interactivity.

### Titanium border (plain hard edge)
```css
.titanium-border { border: 1px solid #353534; }
```
The lighter-weight structural border for cards on the live screens.

### Milled input (recessed machined field)
```css
.milled-input {
  background: #0e0e0e;                 /* #0A0A0A on the referee console */
  border: 1px solid #353534;          /* #3D3D3D on the referee console */
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
}
.milled-input:focus {
  border-color: #f7bd48;
  outline: none;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.5), 0 0 8px rgba(247,189,72,0.2);
}
```
The signature input: a deep recessed well with an inset shadow, machined into the surface. On focus the border lights bronze with a soft outer glow. Numeric/data values inside render in `data-value` (JetBrains Mono).

### Kinetic glass
```css
.glass-panel {
  background: rgba(42,42,42,0.6);
  backdrop-filter: blur(12px);
  border: 1px solid #3D3D3D;
}
```
Frosted panels for fluid/secondary content (candidate lists, settlement preview, status logs, stat cards). Often topped with a 2px bronze accent (`border-t-2 border-t-primary`).

### Bronze glow
```css
.low-glow,
.glow-hover:hover { box-shadow: 0 0 15px rgba(247,189,72,0.15); }
.bronze-glow      { box-shadow: 0 0 15px rgba(247,189,72,0.15); }
.bronze-glow:hover{ box-shadow: 0 0 20px rgba(247,189,72,0.25); }
```
The low ambient bronze glow applied to primary CTAs and hover states — replaces the old hard offset shadow. Quiet, warm, "powered-on".

### Bronze gradient (text + buttons)
```css
.bronze-gradient {           /* hero numbers */
  background: linear-gradient(180deg, #f7bd48 0%, #ba880f 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.bronze-gradient-btn {       /* primary action buttons */
  background: linear-gradient(180deg, #f7bd48 0%, #ba880f 100%);
  transition: all 0.2s ease;
}
```
A top-to-bottom bronze gradient — clipped to text for the hero prize number, filled for the primary "Deploy" / "Finalize" buttons.

### Winner slot (drag target)
```css
.winner-slot { border: 2px dashed #4f4535; transition: all 0.2s ease; }
.winner-slot.drag-over { border-color: #f7bd48; background: rgba(247,189,72,0.05); }
```
Dashed placeholder podium slots in the settlement console; light bronze on drag-over.

### Buttons
- **Primary irreversible action** (Connect Wallet / Join Pool / Deploy to Network / Finalize Payouts): solid `bg-primary` (`#f7bd48`) with `on-primary` (`#412d00`) text, **or** `bronze-gradient-btn`; uppercase, wide tracking (`label`/`data-label`), with `bronze-glow`/`low-glow`; hover `brightness-110`, active `scale-95`/`scale-[0.98]`.
- **Secondary**: transparent / `surface-container-high` with a `1px` outline (`border-surface-variant`, or `border-primary text-primary` for the inverted Connect Wallet); hover brightens or fills.
- **Tertiary (side-nav launch)**: `surface-variant`/`secondary-container` fill, muted text, uppercase.
- All button labels are uppercase mono/caption with wide tracking.

### Badges & chips
- **LIVE / REAL-TIME badge:** small bronze-tinted fill (`bg-primary/10 text-primary border border-primary/20`), `data-label`, often paired with a pulsing dot (`bg-error` or `bg-primary animate-pulse`).
- **Wallet chip:** milled or `surface-container-high` box, wallet glyph + truncated `0x…` address in `data-value`, bronze-tinted.
- **Status chips:** ready = `secondary` peach (`READY_FOR_COMPILATION`); active = bronze; locked = `bg-primary/20 text-primary`; finished = muted; cancelled = error tint.

### Inputs
- `milled-input` background (`#0e0e0e`/`#0A0A0A`), 1px `#353534`/`#3D3D3D` border, inset shadow, generous `p-md`.
- **Focus:** border → bronze `#f7bd48` with a soft outer glow; the field's mono label brightens to bronze via JS micro-interaction.
- Numeric/data inputs (entry fee, splits) render their value in `data-value`, with a unit chip ("LUMEN") appended in a bordered box.

---

## 6. Motion

Motion reinforces "live, on-chain, machined" — keep it purposeful, and respect `prefers-reduced-motion`.

| Name | Behaviour | Where |
|---|---|---|
| Live pulse | `animate-pulse` opacity loop on dots | LIVE indicators, "secure" dots, status-log heartbeat, idle 1st-place glyph. |
| Prize ticker | Number ticks up every ~3s with a brief `scale-[1.01]` pop | Live global prize pool. |
| Countdown | 1s tick on Hrs/Min/Sec, live seconds tinted bronze | Pool-closes-in timer. |
| Feed stream | New entries `prepend` with `fade-in slide-in-from-left duration-500`; trailing items fade to `opacity-60` | Live activity / registration feed. |
| Glow-hover | Bronze `0 0 15px` glow grows on hover | Industrial panels, CTAs. |
| Label focus | Mono input label brightens to bronze on field focus | Milled inputs. |
| Drag-and-drop | Cards are `cursor: grab`; on grab `scale(0.98)` + `opacity-50`; slots highlight to bronze (`.drag-over`); drop swaps to a "PLAYER SELECTED / VERIFYING DATA…" state | Settlement console. |
| Button press | `brightness-110` hover, `scale-95`/`scale-[0.98]` active | Primary buttons. |
| Settlement modal | Full-screen `bg-background/90` overlay, spinning bronze ring (`border-primary border-t-transparent animate-spin`), scrolling proof log, pulsing "Estimated Time" | Finalisation in progress. |

---

## 7. Iconography & imagery

- **Material Symbols Outlined** throughout (e.g. `account_balance_wallet`, `sports_esports`, `emoji_events`, `military_tech`, `verified_user`, `token`, `rocket_launch`, `code`, `groups`, `drag_indicator`, `terminal`, `dashboard`, `settings`). Active/selected icons use `FILL 1` (`.fill-icon`).
- Player/avatar imagery sits in **rounded square or pill frames** with a 1px bronze/outline border; the aesthetic is **technical-noir**: low-key industrial lighting, polished carbon fibre and titanium, burnt-bronze accents, shallow depth of field. Banner imagery defaults to `grayscale brightness-50`, lifting on hover (`group-hover:scale-105`).
- **Contract source** renders in a near-black (`#0a0a0a`) pane with JetBrains Mono syntax coloring: keywords `primary` bronze, comments/strings `secondary` peach, type names `tertiary` blue.
- QR codes render on a **white padded tile** (`bg-white p-sm`, `mix-blend-multiply`) for scan reliability, set inside a milled card.

---

## 8. Voice & microcopy

- **Plain, decisive, terminal-flavoured.** Active voice. Buttons name the exact effect: "Deploy to Network", "Finalize Payouts", "Join Pool Now", "Connect Wallet". The action keeps its name through the flow (a "Finalize" button leads to a "Settling Chain" overlay → settlement result).
- **On-chain literacy is part of the brand:** show real artifacts — contract IDs, tx hashes, Merkle proofs, ledger/block height, "escrow", "settlement", "validators", basis-point and percentage splits, platform fee, gas strategy — but always with a human-readable gloss next to the raw value.
- **Two chains appear in the mocks:** the Creator and Live Prize Pool speak **Stellar / Soroban** ("Deploy Soroban Contract", `XLM`/`LUMEN`, `deploy_escrow`), while the Referee Console speaks **Ethereum L2** (`ETH`, Merkle proof, mainnet RPC). Keep on-chain language accurate to whichever network a screen settles on; don't mix them within one flow.
- **All-caps mono** for labels and system status (`READY_FOR_COMPILATION`, `NETWORK_TELEMETRY`, `VALIDATOR_STATUS: OPTIMAL`); **sentence case** for explanatory body copy.
- Errors and empty states speak in the interface's voice: explain what happened and the next step, never vague, never apologetic (e.g. "[Awaiting Final Winner Selection…]").
- Numbers are honest and precise: amounts in `data-value`, split percentages shown both as % (UI) and basis points / contract logic (e.g. 60/30/10 distribution echoed in the Soroban source).

---

## 9. Tailwind implementation note

The mocks ship a JS `tailwind.config` (`darkMode: "class"`). Mirror it exactly — colors, the four-step `borderRadius`, the named `spacing` scale, and the `fontFamily`/`fontSize` roles below. (For Tailwind v4, translate the same values into a CSS-first `@theme` block; there is no behavioural difference.)

```js
tailwind.config = {
  darkMode: "class",
  theme: { extend: {
    colors: {
      background: "#131313", surface: "#131313",
      primary: "#f7bd48", "primary-fixed-dim": "#f7bd48", "surface-tint": "#f7bd48",
      "primary-container": "#ba880f", "primary-fixed": "#ffdea6",
      "on-primary": "#412d00", "on-primary-container": "#392700",
      secondary: "#fbb980", "secondary-fixed-dim": "#fbb980",
      "secondary-container": "#693c0e", "on-secondary-container": "#e7a871",
      tertiary: "#a1c9ff", "tertiary-fixed-dim": "#a1c9ff", "tertiary-container": "#5594db",
      "surface-container-lowest": "#0e0e0e", "surface-container-low": "#1c1b1b",
      "surface-container": "#201f1f", "surface-container-high": "#2a2a2a",
      "surface-container-highest": "#353534", "surface-variant": "#353534",
      "surface-bright": "#393939",
      "on-surface": "#e5e2e1", "on-background": "#e5e2e1",
      "on-surface-variant": "#d3c4af",
      outline: "#9c8f7b", "outline-variant": "#4f4535",
      error: "#ffb4ab", "error-container": "#93000a",
      "on-error": "#690005", "on-error-container": "#ffdad6",
      /* …complete with the full table in §2… */
    },
    borderRadius: { DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem", full: "9999px" },
    spacing: { xs:"4px", sm:"8px", base:"8px", md:"16px", lg:"24px", gutter:"24px", margin:"32px", xl:"48px" },
    fontFamily: {
      "display-lg": ["Sora"], "headline-lg": ["Sora"], "headline-md": ["Sora"],
      "headline-lg-mobile": ["Sora"], "body-lg": ["Sora"], "body-md": ["Sora"], caption: ["Sora"],
      "data-label": ["JetBrains Mono"], "data-value": ["JetBrains Mono"],
    },
    fontSize: {
      "display-lg": ["48px", { lineHeight:"1.1", letterSpacing:"-0.02em", fontWeight:"800" }],
      "headline-lg": ["32px", { lineHeight:"1.2", fontWeight:"700" }],
      "headline-md": ["24px", { lineHeight:"1.3", fontWeight:"600" }],
      "headline-lg-mobile": ["24px", { lineHeight:"1.2", fontWeight:"700" }],
      "body-lg": ["18px", { lineHeight:"1.6", fontWeight:"400" }],
      "body-md": ["16px", { lineHeight:"1.5", fontWeight:"400" }],
      "data-value": ["14px", { lineHeight:"1.2", fontWeight:"700" }],
      "data-label": ["14px", { lineHeight:"1.2", letterSpacing:"0.05em", fontWeight:"500" }],
      caption: ["12px", { lineHeight:"1.4", fontWeight:"500" }],
    },
  }},
}
```

Signature classes (`.industrial-border`, `.titanium-border`, `.milled-input`, `.glass-panel`, `.bronze-gradient`, `.bronze-gradient-btn`, `.bronze-glow`/`.low-glow`/`.glow-hover`, `.winner-slot`, the custom scrollbar, and the keyframes) live in a global stylesheet exactly as in the mock. Keep the dark theme as the default (`<html class="dark">`); GGG ships dark-only.