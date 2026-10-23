# bonnie-previews-copy

> **Temporary review copy.** This repo exists for one external review round only and will be removed after the review.

## Context for reviewers

Please review this as **one three-layer system sharing one harness**, not as separate apps. The shared harness is
[`rules/phi-timing-rules.md`](rules/phi-timing-rules.md): golden-ratio (phi) timing, palettes, Ask Dad, the Simmie terminal,
the message-status layer, meters and haptics.

1. **Rebella: Bonnie's world.** Her teen magazine site, her pastel palette and her content. Rebella's own public site is
   **not included** in this copy; it is described here in words only.
2. **Dad's world.** Dad's palette (deep ocean teal, sunset amber, sand, charcoal); what he's doing with Simmie (the assistant,
   its terminal and space set, the mission log); the backend (relay, pipeline, routines; described only, no endpoints are
   included); Dad's messages; Dad's questionnaires; and more of Dad's things to come. The chat page (`previews/chat/`,
   `side-copies/chat/`) lives mostly here.
3. **Bonnie's Dashboard: the crossover point** in the middle, where the two worlds meet. Its palette is a halfway zone between
   Rebella's pastels and Dad's palette (`previews/bonnies-dashboard/`, `side-copies/dashboard/`).

## What this is

A **read-only snapshot copy** of preview work. It is **not** the live sites, has no git history from the original repos,
and **all sends are disabled**: nothing here can reach the chat relay, the moderation queue or any backend.

| Folder | Source |
|---|---|
| `previews/bonnies-dashboard/`, `previews/chat/` | EdgerEquals/simmie-chat `main` @ `81db44665fa3369077cf55d5de4a31db59ae997e` |
| `side-copies/dashboard/` | EdgerEquals/rebella, local branch `moderation-weather-chip` @ `b227245e49dd6016804d07743ac96c48a494ebf0` (`moderation/` front-end files only; uncommitted edits not included) |
| `side-copies/chat/` | EdgerEquals/simmie-chat, local branch `chat-terminal-box` @ `9358837d586c19e7aae5bc6463e55451ed9d825a` (chat page front-end only) |
| `rules/phi-timing-rules.md` | the shared phi timing rules (snapshot) |

## Scrubbed for this copy

- Passcode gate config (`js/config.js`) replaced with `unset: true` and `REPLACE_ME` salt/hash. The dashboards show
  "Passcode not set up yet" and never unlock.
- Every fetch of encrypted config, queue or log data points at `REPLACE_ME/...`. No relay or topic config exists in this repo.
- Not included: encrypted config/log/queue files, build and relay scripts, the fact bank, age-dial config, pipeline stats,
  media loops, magazine source material and any real chat or queue content. The chat preview's thread is built-in sample text.

## Viewing

Open `previews/chat/index.html` or `previews/bonnies-dashboard/index.html` via any static server
(e.g. `python3 -m http.server`). Live weather (Open-Meteo) and Google Fonts load from the public web; everything that
would need a secret is stubbed out. Side copies are reference source; their locked screens will not open.
