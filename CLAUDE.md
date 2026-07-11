# StreamSeer

Multiview console for watching several live streams at once. Paste Twitch / YouTube / Kick
links; the wall lays itself out based on how many feeds are up. Hovering a feed boosts its
volume +50% over its set level (via the Twitch/YouTube player APIs) and swaps the chat panel
to that stream's chat.

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
- **Hover over iframes**: cross-origin iframes swallow mouse events, so each tile has a
  transparent `.shield` overlay that captures hover. Clicking the shield removes it until
  the mouse leaves the tile ("CLICK FOR PLAYER CONTROLS") so the native player UI stays usable.
- **Chat follows cursor**: chat iframes are created lazily on first hover and kept mounted
  (display:none) so switching back is instant.
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
- GitHub: github.com/<username>/streamseer
- Vercel: streamseer.vercel.app
- To redeploy: `vercel --prod` from this folder
