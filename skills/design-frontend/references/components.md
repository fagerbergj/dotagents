# Component recipes

Copy these class strings as they are. Colors refer to the tokens in `assets/theme.css`.

## Type scale

| Use | Classes |
|---|---|
| Hero title | `text-[40px] leading-[1.1] font-bold tracking-[-0.03em]` |
| Hero lede | `text-[16px] leading-relaxed text-ink-2 max-w-[56ch]` |
| Eyebrow | `text-xs font-semibold uppercase tracking-[0.08em] text-accent-ink` |
| Page title (toolbar) | `text-[17px] font-semibold tracking-[-0.015em]` |
| Card title | `text-[15.5px] leading-tight font-semibold tracking-[-0.015em]` |
| Section heading | `text-sm font-semibold tracking-[-0.01em]`, with a count in `text-[13px] font-medium text-muted` |
| Column or group label | `text-[11px] font-semibold uppercase tracking-[0.06em] text-muted` |
| Body | `text-sm leading-relaxed text-ink-2`; chat text is `text-[14.5px] leading-relaxed` |
| Secondary and meta | `text-[13px] text-muted`; timestamps add `tabular-nums whitespace-nowrap` |
| Code and identifiers | `font-mono text-[13px]` (`text-xs` in chips) |

Paragraphs start with `m-0` and are spaced by their parent's `gap`.

## Header

```html
<header class="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur-md backdrop-saturate-150">
  <div class="mx-auto flex max-w-[1400px] items-center gap-5 px-6 py-3">
    <a class="flex items-center gap-2.5 whitespace-nowrap text-[17px] font-bold tracking-[-0.02em] text-ink no-underline">
      <img width="30" height="30" alt="" class="drop-shadow-[0_2px_5px_color-mix(in_oklab,var(--color-accent)_28%,transparent)]" /> Product name
    </a>
    <div class="ml-auto flex items-center gap-2.5 text-[13px] text-ink-2">
      <span class="hidden sm:inline">user@example.com</span>
      <span aria-hidden="true" class="grid h-[30px] w-[30px] place-items-center rounded-full bg-info-bg text-[11px] font-semibold text-info uppercase">JD</span>
    </div>
  </div>
</header>
```

The logo is a 96×96 rounded-square SVG (`rx="22"`) filled with an accent gradient and a white glyph. It carries its own background, so it reads in both themes without a variant.

## Toolbar under the header

`border-b border-line bg-canvas/70`, with an inner `mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3`. It holds a back link (`text-[13px] text-muted no-underline hover:text-ink`), the page title, meta text, and the actions pushed right with `ml-auto`.

## Buttons

All buttons are `cursor-pointer` with `disabled:cursor-not-allowed`.

| Kind | Classes |
|---|---|
| Primary | `h-[34px] rounded-[10px] bg-ink px-3.5 text-[13px] font-semibold text-on-ink transition hover:bg-ink-2 disabled:bg-line-strong disabled:text-muted` |
| Secondary | `h-[34px] rounded-[10px] border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 transition hover:text-ink` |
| Destructive (secondary until hover) | Secondary plus `hover:border-danger-line hover:text-danger` |
| Small | `rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 hover:text-ink`; the small primary is `rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-on-ink` |
| Quiet row action | `rounded-lg px-2 py-1 text-xs font-medium text-muted opacity-0 transition hover:bg-soft hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100` (put `group` on the row) |
| Icon send | `grid h-10 w-10 place-items-center rounded-xl bg-ink text-on-ink hover:bg-ink-2 disabled:bg-line-strong disabled:text-muted` |
| Pill suggestion | `rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] text-ink-2 transition hover:border-line-strong hover:text-ink` |

**Split button** (one action with several formats): the wrapper is `inline-flex h-[34px] items-center overflow-hidden rounded-[10px] bg-ink text-[13px] font-semibold text-on-ink`. It holds a label span, then segments with `h-full border-l border-on-ink/20 px-3 uppercase hover:bg-ink-2`.

**Busy state:** replace the icon or label with `<span class="h-4 w-4 animate-spin rounded-full border-2 border-on-ink/40 border-t-on-ink">` and keep the fill. Set `aria-busy`.

## Segmented control and tabs

```html
<div role="group" aria-label="Filter" class="inline-flex rounded-[10px] border border-line bg-soft p-[3px]">
  <button aria-pressed="true" class="h-[30px] rounded-[7px] border-0 px-3 text-[13px] font-medium bg-surface text-ink shadow-thumb">All</button>
  <button aria-pressed="false" class="h-[30px] rounded-[7px] border-0 px-3 text-[13px] font-medium bg-transparent text-muted hover:text-ink">Mine</button>
</div>
```

For tabs, use `role="tablist"` with `role="tab"` and `aria-selected` instead. A compact variant uses `h-[26px] px-2.5 text-xs font-semibold uppercase`. Unavailable options get `disabled:opacity-40` and a `title` that explains why.

## Cards

- **Panel:** `rounded-2xl border border-line bg-surface p-5 shadow-card`.
- **Link card**, for grids: `flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 text-ink no-underline transition duration-150 hover:-translate-y-px hover:border-line-strong hover:shadow-lift`. Lay out a title and meta line, a description clamped with `line-clamp-2`, then a footer with `mt-auto flex items-center justify-between` holding chips on the left and the timestamp on the right.
- **Highlighted** (just changed): replace the border with `border-accent/40 shadow-glow`. Highlight changed rows with `bg-warm/60`.
- **Card grid:** `grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4`.

## Badges and chips

| Kind | Classes |
|---|---|
| Status pill | `rounded-full px-2 py-0.5 text-[11px] font-semibold`, paired with a status color below; inline after a title, add `ml-2 align-[2px]` |
| Neutral pill | `rounded-full bg-soft px-2 py-0.5 text-[11px] font-semibold text-muted` (for example "Read only") |
| Tag chip | `rounded-md bg-soft px-2 py-0.5 text-xs text-ink-2`, with `font-mono` for identifiers; overflow becomes a `+N` chip |
| Context chip | `rounded-md bg-info-bg px-2 py-0.5 text-[11px] font-medium text-info` (for example "Replying to X") |
| Severity tag | `rounded-md px-1.5 py-0.5 text-[10px] font-bold` |
| Fixed-width label | `w-[58px] flex-none rounded-md py-0.5 text-center font-mono text-[11px] font-bold uppercase` (for example HTTP methods) |
| File chip | `flex items-center gap-1.5 rounded-lg border border-line bg-soft py-1 pl-2.5 pr-1 text-xs text-ink-2`, with an icon, a truncated name, the size in `text-muted`, and a `×` remove button |

## Status colors

All pairs are at least 4.5:1.

| Meaning | Text | Background |
|---|---|---|
| Success | `text-success` | `bg-success-bg` |
| Warning / changed | `text-warning` | `bg-warning-bg` |
| Danger / error | `text-danger` | `bg-danger-bg` (border `border-danger-line`) |
| Info / selected | `text-info` | `bg-info-bg` |
| Link / read action | `text-link` | `bg-link-bg` |
| Accent text | `text-accent-ink` | `bg-warm` |

Error messages are `role="alert"` with `text-sm text-accent-ink`. For an error block, use `rounded-xl bg-warm px-3.5 py-2.5 text-[13.5px] text-accent-ink`.

## Composer (message input)

- **Wrapper:** a `<form>` with `rounded-2xl border border-line-strong bg-surface shadow-float transition focus-within:border-ink-2/40 focus-within:shadow-ring`.
- **Optional top strips**, each with `border-b border-line px-3.5 py-2`: a context chip with a `×`, and a row of file chips.
- **Row:** `flex items-end gap-1.5 p-2.5` containing an icon button (`h-10 w-10 rounded-xl text-muted hover:bg-soft hover:text-ink`), a textarea, and the send button.
- **Textarea:** `max-h-[220px] min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-relaxed outline-none placeholder:text-muted`. It grows with its content: set `height = 'auto'`, then `height = min(scrollHeight, 220)px`.
- **Keys:** Enter sends, and Shift+Enter adds a line. Skip Enter while `isComposing` is true.
- **Drag-over:** switch the border to `border-accent border-dashed`.
- **Failed send:** restore the draft and its attachments.

## Chat

- **Message list:** `flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-6` with `aria-live="polite"`. Scroll to the end in an effect with a block body.
- **Own message:** `self-end max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-[14.5px] leading-relaxed text-on-ink`.
- **Other person:** `self-start`, with `rounded-bl-md border border-line bg-surface text-ink`. Put their name above the bubble in `px-1 text-[11px] font-medium text-muted`.
- **Assistant:** no bubble. Use `md max-w-[95%] text-[14.5px] leading-relaxed text-ink` with rendered Markdown.
- **System note:** `flex items-center gap-1.5 text-xs font-medium text-muted`, led by a 16px `bg-warm` dot holding a check in `text-accent-ink`.
- **Typing indicator:** the `.typing` markup from `assets/theme.css`, with `aria-label="Replying"`.

## Tables

- **Table:** `w-full border-collapse text-[13px]`.
- **Header row:** group-label type, `text-left`, and `border-b border-line pb-1.5` on each cell.
- **Body cells:** `border-b border-line py-2 pr-3 align-top`, with `font-mono whitespace-nowrap` for keys.
- **Required marker:** `*` in `text-accent-ink`, with `title="Required"`.
- **Scrolling:** wrap the table in `overflow-x-auto` so it scrolls sideways on mobile.

## Disclosure rows

- **List:** `ul.divide-y divide-line`.
- **Each row:** a `<details>` whose `<summary>` is `flex cursor-pointer list-none items-center gap-3 py-2.5 [&::-webkit-details-marker]:hidden`.
- **Detail body:** indented under the label, for example `ml-[70px] mb-3 flex flex-col gap-2 text-[13px] text-ink-2`.
- **Buttons inside the summary:** call `preventDefault` on their wrapper so a click doesn't toggle the row.

## Code block

- **Block:** `m-0 overflow-x-auto rounded-2xl border border-line bg-surface p-5 font-mono text-[12.5px] leading-relaxed text-ink-2`.
- **Toolbar above it:** a compact segmented control for format, with a small secondary Copy button pushed right that reads "Copied" for 1.5s.

## Empty, loading, and list states

- **Empty (dashed):** `rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center` with `role="status"`. It holds a title in `text-base font-semibold` and a hint in `mt-1.5 text-sm text-muted` that says how to fill it.
- **Empty (in a pane):** `grid h-full place-items-center`, with a `max-w-[44ch] text-center` block.
- **Loading:** specific text in `text-sm text-muted`, such as "Loading projects…". Avoid a lone spinner. Render the page frame first and load data into it, rather than blocking the whole screen.

## Form fields

- **Search or text input:** `h-[38px] w-full rounded-[10px] border border-line bg-soft px-3 text-sm outline-none transition focus:border-line-strong focus:bg-surface focus:shadow-ring`.
- **Select:** `h-[34px] cursor-pointer rounded-[10px] border border-line bg-soft px-2.5 text-[13px] outline-none focus:border-line-strong focus:bg-surface`. Long option text gets `max-w-[260px] truncate` with a `title`.
- **Labels:** a visible label, or `sr-only` when the context makes the purpose obvious. Every control needs one.
