---
name: design-frontend
description: >
  Builds web interfaces in a calm, minimal house style that follows the user's light or dark
  theme. Use when creating or restyling a page, dashboard, internal tool, or chat or editor
  screen, or when asked for a clean, polished UI. Not for native mobile apps or projects with
  a mandated design system.
license: MIT
metadata:
  author: fagerbergj
  author_url: https://github.com/fagerbergj
  repository: https://github.com/fagerbergj/dotagents
  version: "1.0"
---

# Design Frontend

A design system for product screens and internal tools that should feel calm and finished. The canvas is plain, one accent color is used sparingly, and type and spacing carry the hierarchy instead of color and chrome. Every color is a semantic token that resolves for both light and dark themes, following the operating system by default. This skill covers visual language, layout, and component recipes. It does not cover information architecture, copywriting, or data fetching.

## When to Use

- Building a new web frontend or page when no design system is mandated.
- Restyling a UI that looks unstyled, cluttered, or form-heavy.
- Adding screens to an app that already uses these tokens, so new work stays consistent.
- Chat, editor, explorer, or dashboard layouts where one pane drives another.

## When NOT to Use

- The project already has a design system (Material, an in-house component kit). Follow it, and borrow only layout ideas from here.
- Native mobile, email templates, or print.
- Marketing pages that need a bold, illustration-led treatment. This system is deliberately quiet.

## Principles

1. **Plain canvas, ink type.** Pages are `bg-canvas` with `text-ink`, and cards and inputs are `bg-surface`. Hierarchy comes from size, weight, and three text tones (`ink`, `ink-2`, `muted`), not from colored backgrounds.
2. **Semantic tokens only.** Never write `bg-white`, `text-black`, `text-white`, or hex values in markup. Each token has a light and a dark value, so a literal color breaks one of the two themes.
3. **One accent, rarely.** The accent marks identity (logo, eyebrow text, change highlights) and is never a button fill. Primary actions are ink buttons with `text-on-ink`.
4. **Hairlines and soft fills.** Separate with `border-line` and `bg-soft`, not shadows. Use the theme shadows (`shadow-card`, `shadow-lift`, `shadow-float`, `shadow-ring`) only for hover lift, floating inputs, and focus rings.
5. **Generous radius, tight type.** Cards are `rounded-2xl`, controls `rounded-[10px]`, and chips `rounded-md` or `rounded-full`. Headings use negative letter-spacing.
6. **Quiet until needed.** Row-level secondary actions stay hidden until hover or focus, and always show on touch screens. Empty states say what will appear there and how to get it.
7. **Native elements first.** Style buttons, selects, `details`/`summary`, tables, and textareas with utilities, without a component kit. Add ARIA (`role="tablist"`, `aria-pressed`, `aria-live`) only where native semantics run out.

## Procedure

1. [ ] **Install the tokens.** Add Tailwind v4: install `tailwindcss` and `@tailwindcss/vite`, and add `plugins: [tailwindcss()]` to the Vite config. Then copy `assets/theme.css` into the app's stylesheet and import it once from the entry point.
2. [ ] **Set the accent.** Keep the neutrals and status colors. To rebrand, change `--color-accent`, both values of `--color-accent-ink`, and the first gradient in `body::before`. Then confirm `accent-ink` is at least 4.5:1 on `surface` in both themes.
3. [ ] **Choose the page shape** from `references/layouts.md`: a centered hero over a card grid, or a viewport-high split pane.
4. [ ] **Build from the recipes** in `references/components.md`. Copy the class strings instead of inventing new sizes, radii, shadows, or colors.
5. [ ] **Cover every state**: loading text, empty state, error (`role="alert"` in `text-accent-ink`), disabled, busy (a spinner in the button), and read-only.
6. [ ] **Offer a theme override only if asked.** By default the page follows the OS. To add a toggle, set `data-theme="light"` or `data-theme="dark"` on `<html>`, store the choice, and remove the attribute to return to the system setting.
7. [ ] **Run the validation loop** below.

## Gotchas

- **`light-dark()` only resolves colors.** Shadows, gradients, and images don't switch on their own. Shadows switch because they're built from the `--color-shade` tokens. Images that need both themes should use `<picture>` with a `prefers-color-scheme` source, or transparent SVGs.
- **`light-dark()` follows `color-scheme`, not a class.** The theme comes from `color-scheme` on `:root`, set by `assets/theme.css`. A Tailwind `dark:` variant does not see the `data-theme` override, so don't mix the two.
- **`light-dark()` needs a 2024-era browser** (Chrome 123, Safari 17.5, Firefox 120). On an older browser target, move the dark values into a `@media (prefers-color-scheme: dark)` block that redefines the same variables.
- **The accent fails contrast as text or as a button fill** (3.3:1 on white). Use `text-accent-ink`, and keep `accent` for borders, dots, and translucent glows.
- **`text-muted` on `bg-soft` fails AA in the light theme** (4.4:1), although it passes in dark. Use `text-ink-2` for small text on soft fills.
- **Disabled ink buttons** switch to `disabled:bg-line-strong`. Add `disabled:text-muted` too, or the on-ink text disappears in the dark theme.
- **Tailwind v4 `space-y-*` has zero specificity**, so a child's `m-0` cancels it and the stack collapses. Use `flex flex-col gap-*`.
- **A `1fr` grid column grows to fit its widest content**, so one long line of code squeezes the sibling pane. Use `minmax(0,1fr)` columns, and put `min-w-0` on the grid or flex child that scrolls.
- **Independent pane scrolling needs a bounded height at every level.** The root is `lg:h-dvh`, the grid has `lg:grid-rows-[minmax(0,1fr)]`, and each pane is `min-h-0` with an inner `overflow-y-auto`. If any level is unbounded, the whole page scrolls instead.
- **Hover-only controls need focus and touch fallbacks**: `focus-visible:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100`.
- **A busy button must not look disabled.** Keep its fill and show a spinner.
- **Rendered Markdown** inserted with `dangerouslySetInnerHTML` is safe only when the renderer has HTML disabled (for example markdown-it's `{ html: false }`). Wrap it in `.md`, because Tailwind's preflight strips list and code styling.
- **In React effects, use a block body for DOM calls.** `useEffect(() => el.scrollIntoView())` returns whatever the call returns, which is a Promise in recent Chrome, and React treats it as a cleanup function and throws.
- **Truncated text needs a `title` attribute** so the full value can still be read.

## Validation Loop

Repeat until every item passes:

1. Load the page at 1440×900, 1280×560 (a short viewport), and 390×844 (mobile), in both the light and dark themes. Emulate them with DevTools' `prefers-color-scheme` setting or `data-theme`.
2. Search the markup for literal colors (`bg-white`, `text-white`, `text-black`, `#`, `rgb(`) outside `assets/theme.css`. Replace each one with a token.
3. Check for horizontal page scroll: `document.documentElement.scrollWidth` must equal `innerWidth`. For a split pane, the document height must equal the viewport height and each pane must scroll on its own.
4. Tab through every control in both themes. Focus is visible, hover-only actions appear on focus, and toggles report `aria-pressed` or `aria-selected`.
5. Check text contrast against the Gotchas: no `accent` text, no `muted` text on soft fills, and readable disabled buttons.
6. Trigger every state, including very long content such as titles, code, and names. Long values truncate or wrap without breaking the layout.
7. Turn on reduced motion and confirm nothing animates.

## Resources

- `assets/theme.css`: copy into the app's stylesheet in procedure step 1. It holds the light/dark tokens, theme shadows, base type, top wash, Markdown styles, typing indicator, and the reduced-motion rule.
- `references/components.md`: read in step 4 for the type scale and exact class recipes for every component and status color.
- `references/layouts.md`: read in step 3 to choose a page shape and its responsive behavior.
