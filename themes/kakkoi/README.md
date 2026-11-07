# The Kakkoi style

Black text on white paper, set in Bebas Neue and Inter, divided by hairlines. Nothing is added unless it carries meaning. Confirmed against kakkoi.dev on 7 Nov 2026.

Frames: https://claude.ai/code/artifact/41493272-af23-486c-b807-433f3e10ae3f · How to save this in the repos: `HANDOFF.md`.

## Rules an agent can apply

1. **Two colours.** Foreground `#000` on background `#fff`; dark mode is a straight inversion. Grey `#595959` is for secondary text only.
2. **Colour means state.** Red `#c4161c` = error, green `#1e7a34` = success, amber `#8a5a00` = warning. Each always comes with a word or an icon. No accent or brand colour.
3. **Hierarchy comes from type.** Bebas Neue for the wordmark and section titles (capitals, never sentences, never model output). Inter for everything people read. Noto Sans JP for Japanese, including Japanese headings (700, about 75% of the Bebas size).
4. **One column**, 768 px at most. Side panels (history, Activity, Tasks) sit beside it.
5. **Hairlines, not boxes.** 1 px `#d4d4d4` between rows and sections; 1 px foreground under headers. A full border only around things you act on, or third-party content (web results, files, generated apps).
6. **Square edges.** Radius 0. No shadows, except a 4 px hard offset under floating menus.
7. **Underlined links, outlined buttons.** One filled black button per area.
8. **44 px targets, 8 px apart.**
9. **Focus** is a 2 px foreground outline with a 2 px gap. Hover fills grey or un-fills the primary. Pressed inverts. Disabled uses a dashed edge, not grey alone.
10. **Words over icons.** Lucide outlines beside a label. Icon-only only for send, stop, close, menu (and phone headers), always with an accessible name.
11. **The cube is the only motif**: app icon, empty states, model loading. Never behind text. Still when reduced motion is on.
12. **Calm motion.** 120 ms state, 200 ms panels, no bounce. Waiting is shown as words and elapsed time.

## Plain words

Never say "tool call", "token", "artifact" or "service worker". Say what happened: "Searched the web", "Built the app", "Waiting for Gemma 4 12B". Say when text leaves the Mac: "Sent online", "Hosted: text leaves this device".

## Decisions

- **Brand hierarchy:** KAKKOI is the maker brand (cube + wordmark). KakkoiSchool is the programme, named in text only. The product is **Kakkoi Chat** (home-screen label "Kakkoi Chat", 11 characters). Proposal; confirm.
- **Dark mode:** yes, straight inversion, follows the system with an override.
- **Generated apps:** get the inline subset (`kakkoi-inline.css`, 2.7 KB): black and white, square, 44 px controls, system fonts only. Apps may override it.
- **Model choice for students:** visible (which model, where it ran), changeable by teachers only. Default is local.

## Files

- `kakkoi-tokens.json`: Basecoat token values (light/dark), type scale, space, motion, contrast ratios
- `kakkoi.css`: the theme plus primitives (buttons, fields, chips, badges, status)
- `kakkoi-inline.css`: subset injected into every generated app
- `svg/`: wordmarks (outlined), lockup, master/mono mark, app icon light/dark, maskable icon, generated-app template + example
- `fonts/`: Bebas Neue TTF + OFL texts for Bebas Neue, Inter and Noto Sans JP (all SIL OFL 1.1; get Inter and Noto Sans JP files from google/fonts `ofl/inter` and `ofl/notosansjp`)
- `copy-deck.json`: every status and error string, EN/JA

## In visual-core

This folder is the designer's hand-back of 7 Nov 2026, kept unchanged apart from this section. If the canvas and
`kakkoi-tokens.json` disagree, the JSON wins.

- **Basecoat pages:** load Basecoat, then `kakkoi.css`, and put `class="k"` on the page or app root. Basecoat's
  components read the token values; `.k-light` and `.k-dark` override the system setting.
- **Generated apps:** the host adds `kakkoi-inline.css` before the app's own CSS, so the app can override it. It uses
  system fonts only.
- **Chat (OpenUI):** `kakkoi.openui.json` holds `lightTheme` and `darkTheme` for OpenUI's ThemeProvider, made by
  `visual.py theme-openui` ([theme tools](../../recipes/theme-tools.md)).
- **App icons:** `png/` holds the light, dark and maskable icons at 16, 32, 180, 192 and 512 px, made by `visual.py icons`.
- **Checked by** the scenario "The Kakkoi theme stays in step with its tokens" in [SCENARIOS.md](../../SCENARIOS.md):
  every colour in both stylesheets matches the tokens in light and dark, every claimed contrast ratio matches
  `visual.py contrast`, the inline subset stays under 4 KB, and no file loads anything from outside.

Known gaps:

- `fonts/` holds the full Bebas Neue, Inter and Noto Sans JP files (all SIL OFL 1.1; versions and hashes in
  [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)) and the two files to serve: `bebas-neue-latin.woff2` (14 KB)
  and `inter-latin.woff2` (31 KB, optical size fixed at 14, weights 400–700), loaded by `kakkoi-fonts.css`. Noto Sans JP
  is not sliced yet (9.6 MB in full), so Japanese uses the system's Japanese font for now.
- `--chart-4` is 1.67:1 on white and 1.93:1 on black, below the 3:1 that chart marks need, and `--chart-3` is just
  above it on white (3.03:1). Charts with four series must also tell series 4 apart with a pattern or a direct label.
- The Japanese copy has not been read by a native speaker (the owner's decision, 7 Nov 2026).
