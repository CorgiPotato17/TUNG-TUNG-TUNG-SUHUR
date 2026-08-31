# Service — restaurant management, with Orion

A restaurant management dashboard: tickets, the floor, menu &amp; stock, and
crew scheduling, plus **Orion**, an on-shift assistant that reads your live
data (stock levels, open tickets, table status) and answers questions or
flags what needs attention — low stock colliding with a best-seller, a
ticket that's been fired too long, a floor that's about to fill up.

No build step, no server, no API key required. It's a static site — open
it, or deploy it in two minutes with GitHub Pages.

## Features

- **The Pass** — tonight's revenue, open tickets, table load, average
  check, a covers-by-hour chart, and Orion's live findings.
- **Tickets** — a kanban-style board of every order, filterable by status,
  with one click to move a ticket from seated → fired → check dropped → closed.
- **Floor** — a clickable table plan; tap a table to cycle its status.
- **Menu & Stock** — on-hand vs. par by station, editable in place, with
  low-stock and reorder flags.
- **Crew** — who's on shift and where.
- **Orion** — a slide-out assistant. Ask it things like *"what's running
  low?"*, *"what's selling best tonight?"*, or *"any tickets dragging?"*
  Its answers come from analyzing the data on the page in real time.
- **Every section has its own dashboard** — Tickets, Floor, Menu & Stock,
  and Crew each open with their own KPI row (not just The Pass), and each
  gets its own accent color pulled from a shared dark-blue palette so the
  views read as distinct places rather than the same template repeated.
- **Night / day service toggle** — the app opens in a deep midnight-blue
  night theme by default, with a paler blue day theme for prep hours.

All data lives in `localStorage` in your browser, seeded with a demo
Sunday-night service. Nothing is sent anywhere.

## Running it locally

You don't need Node, npm, or a build step — it's plain HTML/CSS/JS.

```bash
git clone https://github.com/<your-username>/service-orion.git
cd service-orion
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just double-click `index.html` (some browsers restrict `localStorage`
on `file://` URLs, so a local server is the more reliable option).

## Deploying to GitHub Pages

1. Push this folder to a new GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`. Save.
4. GitHub will publish the site at
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.

A ready-to-go GitHub Actions workflow is also included at
`.github/workflows/deploy.yml` — if you'd rather deploy via Actions, set
**Settings → Pages → Source** to `GitHub Actions` instead, and it'll
redeploy automatically on every push to `main`.

## Deploying to Render

This repo includes a `render.yaml` blueprint, so it's a static site with
nothing to build.

**Option A — Blueprint (one click):**
1. Push this folder to a GitHub repo.
2. In the Render dashboard, click **New → Blueprint**, connect the repo.
   Render reads `render.yaml` and creates a static site with the publish
   path already set to the repo root — no build command needed.
3. Click **Apply**. Your site is live at `https://service-orion.onrender.com`
   (or whatever name you choose) within a minute.

**Option B — Manual static site:**
1. **New → Static Site**, connect the repo.
2. **Build Command**: leave blank.
3. **Publish Directory**: `.` (repo root, since `index.html` lives there).
4. Create Static Site.

Either way, every push to your default branch redeploys automatically.

## Project structure

```
service-orion/
├── index.html            # markup + all views
├── styles.css            # design tokens, layout, night/day + per-dashboard accents
├── js/state.js           # seed data + localStorage persistence
├── js/orion.js           # Orion's analysis + question-answering logic
├── js/app.js             # rendering and interaction glue
├── render.yaml           # Render static-site blueprint
└── .github/workflows/deploy.yml   # GitHub Pages workflow
```

## Making it useful for a real restaurant

This ships as a realistic front end over demo data so it's honest about
what it is: a starting point, not a POS. To take it further:

- **Swap `js/state.js` for a real backend.** Replace `loadState()` /
  `saveState()` with `fetch()` calls to your API (or something like
  Supabase/Firebase) and keep the rest of the app as-is — every view
  renders from the same `state` object.
- **Multi-user sync.** Right now state lives in one browser's
  `localStorage`, so two people won't see the same floor. A shared
  backend (websocket or polling) fixes that.
- **Connect Orion to a real model.** `js/orion.js` is intentionally
  dependency-free rule-based logic, so the whole app works with zero
  setup. To use an actual LLM instead:

  ```js
  // in js/orion.js, replace answerQuestion() with:
  async function answerQuestion(state, question) {
    const context = buildContextSummary(state); // write this: a short
                                                   // text dump of stock,
                                                   // open tickets, floor
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": YOUR_KEY,        // never ship a key client-side —
        "anthropic-version": "2023-06-01",  // proxy this through your
        "content-type": "application/json"    // own backend instead
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        system: `You are Orion, an assistant for restaurant staff. Here is
tonight's live data:\n${context}`,
        messages: [{ role: "user", content: question }]
      })
    });
    const data = await res.json();
    return data.content.map(b => b.text || "").join("");
  }
  ```

  Keep the API key on a server you control (a small proxy endpoint) —
  never embed it in client-side code you deploy publicly.

## License

MIT — see `LICENSE`. Do what you like with it.
