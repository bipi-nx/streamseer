# StreamSeer

Multiview console for watching several live streams at once. Paste Twitch / YouTube / Kick
links; the wall lays itself out based on how many feeds are up. Hovering a feed solos it —
the tile grows, its volume boosts +50% over its set level, every other feed mutes until
unhover — and the chat panel swaps to that stream's chat.

## Stack
- Vite + React (single page, no router)
- All styles in-component via CSS string + `<style>` tag in `src/App.jsx`
- Google Fonts (Chakra Petch + IBM Plex Mono) loaded via `@import` in the CSS string
- No external component libraries
- Embeds: Twitch Embed JS API, YouTube IFrame API, Kick plain iframe

## How the core mechanics work (don't "fix" these)
- **Gain**: `gainFor(key, isActive)` is the single source of truth — the audio effect and the
  on-tile percentage both read it, so they can't disagree. `base = vol * master`, then:
  - `headroom: false` (**default**) — feeds run flat out (`base`), the hover boost clips
    against the ceiling. 100% genuinely means the player's max.
  - `headroom: true` — idle feeds sit at `base / (1 + boost)` so the boost is unclipped at any
    level. The cost is that a feed set to 100% idles at 67%, which reads as *"100% is quiet"*.
    This used to be the default and was a real complaint. Don't make it the default again.
- **Volume cannot exceed 100%.** Embeds are cross-origin iframes, so a Web Audio gain node
  can't be attached to the media element — only the player's own `setVolume` is reachable, and
  it caps at its max. Browser extensions boost past this because they run privileged code
  *inside* the iframe. Don't add a >100% slider; it would silently clamp.
- **Only a LOCK solos, never a hover.** Hovering boosts the target's gain but leaves the
  other feeds audible — muting on mere hover made the mix flicker as the cursor crossed the
  wall. Locking mutes everything else; unlocking restores each feed to its own mute state and
  level (nothing is persisted on the feeds, so `setMuted(muted[key] || (locked && locked !==
  key))` restores itself). Kick feeds can't be muted — no JS API.
- **Hover zoom**: hovered tile animates `flex-grow` (1 → 1.75, hero 2 → 3) and its
  row/column gets a `.grow` class — pure CSS flex-grow transitions, no layout thrash.
- **Hover over iframes**: cross-origin iframes swallow mouse events, so each tile is covered
  by overlays that capture hover. The top 90% (`.shield`) toggles **lock** on click; the
  bottom 10% (`.shield-ctl`) drops both overlays so the player's own control bar underneath
  becomes clickable (restored when the mouse leaves the tile).
- **Lock**: clicking a feed pins it as the active one — it stays soloed, enlarged, and owns
  the chat panel even as the cursor moves over other feeds. Clicking it again releases it.
  `active = locked || hovered` drives audio, zoom, and chat everywhere.
- **Chat follows cursor**: chats are created lazily on first hover and kept mounted
  (display:none) so switching back is instant.
- **Twitch chat is custom-rendered with 7TV**: the Twitch chat embed can't be modified
  (cross-origin iframe), so `TwitchChat` connects to Twitch IRC anonymously over WebSocket
  (`justinfan` login, read-only — POPOUT link in the header for typing), parses PRIVMSG
  tags itself, and renders native Twitch emotes (from the `emotes` tag, codepoint-indexed)
  plus 7TV global + channel emotes (channel twitch-id resolved via api.ivr.fi, emote sets
  from 7tv.io/v3; zero-width emotes overlay the previous emote). YouTube/Kick chats remain
  plain iframes — 7TV has no presence there.
- **No instructional copy anywhere in the UI.** The user has asked twice to strip hint text
  ("hover a feed…", the 01/02/03 empty-state panel, "TAB = EMOTES"). Interactions must be
  discoverable without narration — do not reintroduce explainer captions, empty-state
  how-tos, or hint strips.
- **Loading feeds are inert**: a feed that hasn't started playing can never become active —
  no hover-solo, no gain boost, no zoom, no chat takeover, and it can't be locked. Liveness
  comes from the player itself (twitch: `getCurrentTime()` advancing, polled — event
  constants vary by embed version so events alone are unreliable; youtube: `onStateChange`
  PLAYING; kick: no API, so iframe load is the only signal). This gates the LOADING window
  only — mid-stream buffering or a deliberate pause does NOT deactivate a feed, or a hiccup
  would yank the audio and chat away. Only offline/ended makes a feed ineligible again.
  NOTE: twitch embeds do not autoplay in headless chrome, so the positive path can only be
  exercised with a stubbed `window.Twitch.Player` (see scratchpad probe15).
- **Tiles must NEVER be unmounted by a layout change.** Every tile is a permanent sibling in
  one flat `.deck`, absolutely positioned by a %-rect from `computeLayout()`; layout changes
  are pure CSS transitions on that rect. Nesting tiles inside per-row containers (the old
  approach) moves a tile to a different parent when the wall re-organises, which makes React
  destroy and rebuild its iframe — i.e. every stream reloads on fullscreen / add / remove.
  Do not reintroduce row wrappers.
- **Fullscreen**: the tile's rect goes to 0,0,100,100; the others stay MOUNTED but hidden
  (`.tile.off`), muted, and dropped to their **lowest rendition** via `api.setLowQuality`
  (twitch: last entry of `getQualities()`, restored to the saved quality on exit). Esc exits.
  Do NOT pause them — that was the old behaviour and it forces a rebuffer and a jump to the
  live edge on the way back, i.e. exactly the interruption fullscreen is supposed to avoid.
  (YouTube ignores quality requests these days, so it's best-effort there; Kick has no player
  API at all.)
- **Keyboard** (acts on the active feed, ignored while typing in any input): `m` mute,
  `space` play/pause, `f` fullscreen, `esc` exit fullscreen, `h` hide/pin the top bar,
  `c` toggle chat.
- **True fullscreen**: `onFullscreen` calls `requestFullscreen()` on the **app root**, not the
  tile — so the header and chat panel come with it and stay usable (chat toggles with the
  button or `c`). It must be called straight from the click/keypress or the browser rejects it
  as a non-gesture. A `fullscreenchange` listener syncs our state when the user leaves via
  Esc/F11, or the wall would stay expanded with no way back.
- **Hidden top bar** (`h`, or the caret button beside the feed count): the header leaves the
  flow when hidden, so the wall claims the full viewport height; nudging the cursor to the top
  edge peeks it back (it overlays, so the wall doesn't reflow). Persisted in localStorage so a
  lobby screen stays clean across reloads. `h` is a no-op on an empty wall — otherwise it
  silently arms the hidden state and the bar vanishes the moment the first feed is added.
  (An earlier version used hover-triggered half-disc pull-tabs; removed — too much hover
  activity on a wall that already reacts to hover everywhere. Keep chrome controls as plain
  low-key buttons in the bar.)
- **Settings** (gear beside the feed count, `SET_KEY` in localStorage, `DEFAULTS` is the
  source of truth): hover boost amount, lock-mutes-others, new-feed volume, new-feeds-muted,
  active-feed zoom, retro texture, chat panel width, chat text size. The hover boost feeds the
  headroom mix (idle = `base / (1 + boost)`), so changing it re-tunes both the gain and the
  displayed percentage.
- **Mention ping**: a message that @mentions you, names you bare, or replies to one of yours
  flashes that feed's tile red and plays a synthesised two-blip tone (no audio asset). This is
  why **every twitch feed keeps an IRC socket open**, not just the one whose chat is on screen
  — the mention you'd actually miss is on the stream you're not looking at. YouTube/Kick chats
  are heavyweight iframes so those stay lazy. Toggle + volume live in settings.
- **Fast-chat throughput**: incoming IRC lines buffer in a ref and commit once every
  `FLUSH_MS` (120ms), and each row is a memoised `<Msg>`. Committing per message re-rendered
  the whole 150-row backlog and re-pinned the scroll dozens of times a second, which is what
  made a fast chat (caedrel et al) fall off the bottom. The scroll pin is a `useLayoutEffect`
  so it lands before paint. Load-tested pinned at 150 msg/s.
- **Message actions**: hovering a message reveals copy + reply. Reply is a *native* twitch
  reply — an IRCv3 `@reply-parent-msg-id=<id>` tag on the PRIVMSG, which threads properly in
  every twitch client, not an `@mention`. Needs `msg.tags.id`, so it only shows for messages
  received over IRC (and when logged in).
- **Emote tab-completion**: the composer completes emote names Chatterino-style — Tab opens
  a suggestion bubble over the input, Tab/shift-Tab and arrows cycle, Enter/click inserts,
  Esc dismisses. The index merges 7TV (global + channel), Twitch natives via Helix (global +
  channel + the logged-in user's own/sub emotes, needs `user:read:emotes`), and a `:name:`
  emoji set. Same index renders messages, so your own sent messages show emotes too.
- **Control-strip affordance**: hovering the bottom 10% of a tile raises a translucent curved
  shelf. `.tile-body` must keep `overflow:hidden` — the curve is drawn wider than the tile and
  will bleed onto the neighbouring feed without it.
- **Auth is per-platform and contextual**: a platform's login button only renders when a feed
  of that platform is on the wall (a twitch login is noise if you're only watching youtube).
  Only twitch is implemented. YouTube would need Google OAuth + YouTube Data API v3
  `liveChatMessages.insert` (50 quota units per message against a 10k/day default = ~200
  messages/day) and its own Google Cloud client ID. Kick has no public OAuth/chat-send API.
- **YouTube autoplay**: the `autoplay` playerVar is unreliable through the IFrame API — the
  feed sits UNSTARTED until something calls `playVideo()`. `YouTubeMount` calls it explicitly
  on ready, retries on UNSTARTED(-1)/CUED(5), and `api.ensurePlaying()` is called on the first
  user gesture and on clicking a not-yet-playing tile. It never forces play on a feed that has
  already started, so a deliberate pause is respected. Twitch's embed autostarts on its own.
- **The token survives deploys.** It lives in localStorage per-origin, so shipping new code
  never signs anyone out. It IS dropped (with a toast naming the reason) when: the token
  expired; its `client_id` doesn't match the app this origin now uses (a token from the dev app
  validates fine against the prod app but 401s on every Helix call — don't let it half-work);
  or it lacks a scope added since sign-in (re-auth is the only way to gain a scope). Adding a
  scope or switching the app therefore forces one re-login for everyone — batch those changes.
- **Twitch login is optional**: `VITE_TWITCH_CLIENT_ID` (in `.env`, committed — implicit
  OAuth has no secret, the ID is public). CONNECT TWITCH runs the implicit flow, the token
  lands in the URL fragment, is validated against id.twitch.tv/oauth2/validate, and is kept
  in localStorage; the IRC socket then authenticates with `PASS oauth:<token>` so the user
  can send. Without a token everything still works, anonymously and read-only.
  **The Twitch app's OAuth Redirect URLs must list every origin the site is served from**
  (`http://localhost:5173` + the production domain) or login will fail.
- **Layout**: `rowsFor(n)` maps feed count → row arrangement; exactly 3 feeds gets a
  hero-left layout.
- **Default audio is ON**: every feed plays at its set level whether hovered or not; the
  MUTED button is an opt-out. Players still *mount* muted (browser autoplay policy) and a
  one-time pointerdown/keydown listener re-syncs audio after the first user gesture.
- **Kick**: no volume/chat JS API — volume is controlled inside the player (tile shows
  "VOL IN PLAYER"); chat uses the popout URL, which Kick may block from framing.

## What's Stubbed (don't fix unless asked)
- Viewer-count-based sorting — layout adapts to feed *count* only; real viewer counts need
  authenticated Twitch/YouTube APIs. `// TODO: wire up`
- YouTube chat only works for currently-live videos (platform limitation, not a bug)
- No routing — single screen
- No auth, no server — feeds persist in localStorage only

## To Wire Up Next
- [ ] Viewer counts → sort/scale tiles by live viewers (needs Twitch Helix + YouTube Data API)
- [ ] Drag-to-reorder tiles
- [ ] Shareable wall URLs (encode feed list in query string)

## Deploy
- GitHub: github.com/bipi-nx/streamseer
- Vercel: streamseer.vercel.app (repo is connected — every push to master auto-deploys)
- Manual redeploy if ever needed: `vercel --prod` from this folder
