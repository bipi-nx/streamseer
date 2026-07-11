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
- **Hover gain**: volume state lives in React (`vols`, 0–1). Embeds can't amplify past
  their own max, so the mix reserves headroom: idle feeds play at `vol / 1.5` of player
  range and hover uses the full range — a true, unclipped +50% at any slider level (UI
  shows up to 150%). A post-render effect pushes this to every live player.
- **Hover solo**: while a feed is hovered, all other feeds are muted via the same effect;
  on unhover each feed's own mute state is restored. (Kick feeds can't be soloed/muted —
  no JS API.)
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
