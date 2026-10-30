# Layouts

Two page shapes cover most screens. Both sit under the sticky header from `references/components.md` and share the `max-w-[1400px] px-6` content edge. Narrower pages use `max-w-[1160px]`.

## Shape 1: hero over a card grid

Use for a home or index page where the main action is starting something new.

```html
<main class="mx-auto w-full max-w-[1160px] px-6 pb-24 pt-14">
  <section class="mx-auto mb-16 max-w-[720px] text-center">
    <p class="m-0 mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-accent-ink">Eyebrow</p>
    <h1 class="m-0 text-[40px] leading-[1.1] font-bold tracking-[-0.03em]">One-line promise</h1>
    <p class="mx-auto mt-3.5 mb-8 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">Two sentences on what happens next.</p>
    <div class="text-left"><!-- primary input, e.g. the composer --></div>
    <div class="mt-4 flex flex-wrap justify-center gap-2"><!-- pill suggestions --></div>
  </section>
  <section aria-labelledby="items">
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <h2 id="items" class="m-0 flex items-baseline gap-2 text-sm font-semibold tracking-[-0.01em]">Items <span class="text-[13px] font-medium text-muted">12</span></h2>
      <div class="ml-auto"><!-- segmented filter --></div>
    </div>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4"><!-- link cards --></div>
  </section>
</main>
```

- The hero leads with the action itself, such as an input with clickable starter suggestions, rather than a button that opens a form.
- While the action runs, disable the suggestions and show a status line ("Starting…") under the input.
- The card grid reflows from three columns to one with no breakpoints.

## Shape 2: split pane

Use for a workspace where an input pane (chat, form, editor) drives an output pane (preview, explorer, results).

```html
<div class="flex min-h-screen flex-col lg:h-dvh lg:min-h-0">
  <header><!-- sticky header --></header>
  <main class="flex min-h-0 flex-1 flex-col">
    <div class="border-b border-line bg-canvas/70"><!-- toolbar: back, title, meta, actions --></div>
    <div class="mx-auto grid min-h-0 w-full max-w-[1400px] flex-1 grid-cols-1 lg:grid-cols-[minmax(360px,460px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <section class="flex min-h-[60vh] flex-col border-line lg:min-h-0 lg:border-r">
        <div class="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-6"><!-- scrolling content --></div>
        <div class="border-t border-line bg-canvas/70 p-4"><!-- pinned input --></div>
      </section>
      <section class="flex min-h-0 min-w-0 flex-col bg-soft/50">
        <div class="flex flex-wrap items-center gap-3 border-b border-line px-6 py-3"><!-- tabs, status on the right --></div>
        <div class="flex-1 overflow-y-auto px-6 py-5"><!-- cards --></div>
      </section>
    </div>
  </main>
</div>
```

- **Desktop:** the page is exactly viewport-high, and each pane scrolls on its own. Every class marked in the Gotchas (`h-dvh`, `grid-rows-[minmax(0,1fr)]`, `min-h-0`, `min-w-0`, `minmax(0,1fr)`) is load-bearing.
- **Below `lg`:** the panes stack, and the page scrolls normally. The input pane keeps `min-h-[60vh]` so its pinned input stays reachable.
- **Pane backgrounds:** the output pane is `bg-soft/50`, so `bg-surface` cards stand out on it. The input pane stays on the canvas.
- **Status:** show it at the right of the output toolbar, for example a "Working…" note in `text-xs text-muted` and a success or error pill.
- **Links between panes:** when an output item can be sent back to the input (a comment or a question), focus the input and show a context chip there.
- **After a change:** highlight what changed in the output until the next input, so people can see what to review.

## Hash routing for static hosting

When the app is served as static files under a path prefix, route with `location.hash` (`#/item/123`) and listen for `hashchange`. The hash never reaches the server, so deep links work without rewrite rules. Use relative asset paths (`base: './'` in Vite) and reference public assets as `./logo.svg`.
