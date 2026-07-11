import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/* ============================================================
   STREAMSEER — multiview broadcast console
   - paste twitch / youtube / kick links, the wall auto-organizes
   - hovering a feed boosts its gain +50% over its set level
   - chat panel follows whichever feed the cursor targets
   ============================================================ */

const MAX_FEEDS = 12
const DEFAULT_VOL = 0.5
const STORE_KEY = 'streamseer:v1'
const AUTH_KEY = 'streamseer:auth'

/* twitch app client id — public by design (implicit oauth has no secret).
   unset → chat stays anonymous + read-only, everything else works. */
const TWITCH_CLIENT_ID = import.meta.env.VITE_TWITCH_CLIENT_ID || ''

/* ---------- css ---------- */
const css = `
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,500;0,600;0,700;1,700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

:root{
  --bg:#06070a;
  --panel:#0c0f14;
  --panel2:#11151d;
  --line:#222a37;
  --line2:#33405494;
  --amber:#ffb52e;
  --red:#ff4438;
  --green:#58e07c;
  --text:#e9e4d6;
  --dim:#8391a9;
  --faint:#4a5468;
  --tw:#a970ff;
  --yt:#ff4438;
  --kk:#53fc18;
  --mono:'IBM Plex Mono',ui-monospace,monospace;
  --disp:'Chakra Petch',sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%}
body{
  background:var(--bg);
  color:var(--text);
  font-family:var(--mono);
  overflow:hidden;
}
body::before{ /* vignette + ambient glow */
  content:'';position:fixed;inset:0;pointer-events:none;z-index:40;
  background:
    radial-gradient(120% 90% at 50% -10%, rgba(255,181,46,.05), transparent 55%),
    radial-gradient(140% 120% at 50% 55%, transparent 60%, rgba(0,0,0,.55) 100%);
}
body::after{ /* scanlines */
  content:'';position:fixed;inset:0;pointer-events:none;z-index:41;opacity:.5;
  background:repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,.12) 2px 3px);
}
.grain{ /* film grain */
  position:fixed;inset:-100px;pointer-events:none;z-index:42;opacity:.05;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E");
  animation:grain 1.4s steps(4) infinite;
}
@keyframes grain{
  0%{transform:translate(0,0)} 25%{transform:translate(-30px,18px)}
  50%{transform:translate(22px,-26px)} 75%{transform:translate(-14px,-8px)} 100%{transform:translate(0,0)}
}

.app{height:100%;display:flex;flex-direction:column}

/* ---------- header ---------- */
header{
  height:58px;flex:none;display:flex;align-items:center;gap:18px;
  padding:0 16px;border-bottom:1px solid var(--line);
  background:linear-gradient(180deg,var(--panel2),var(--panel));
}
.brand{display:flex;align-items:center;gap:12px;user-select:none}
.brand-bars{display:flex;align-items:flex-end;gap:2px;height:20px}
.brand-bars i{width:3px;background:var(--amber);animation:bar 1.1s ease-in-out infinite;transform-origin:bottom}
.brand-bars i:nth-child(1){height:30%;animation-delay:0s}
.brand-bars i:nth-child(2){height:70%;animation-delay:.15s}
.brand-bars i:nth-child(3){height:100%;animation-delay:.3s}
.brand-bars i:nth-child(4){height:55%;animation-delay:.45s}
.brand-bars i:nth-child(5){height:80%;animation-delay:.6s}
@keyframes bar{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}
.brand h1{
  font-family:var(--disp);font-weight:700;font-style:italic;font-size:21px;
  letter-spacing:.06em;color:var(--text);line-height:1;
}
.brand h1 em{color:var(--amber);font-style:italic}
.brand h1 small{display:block;font-family:var(--mono);font-weight:400;font-size:8px;
  font-style:normal;letter-spacing:.34em;color:var(--faint);margin-top:3px}

.addform{display:flex;gap:8px;flex:1;max-width:560px}
.addform input{
  flex:1;min-width:0;background:#080a0e;border:1px solid var(--line);color:var(--text);
  font-family:var(--mono);font-size:12px;padding:9px 12px;outline:none;
  transition:border-color .15s, box-shadow .15s;
}
.addform input::placeholder{color:var(--faint)}
.addform input:focus{border-color:var(--amber);box-shadow:0 0 0 1px #ffb52e33, 0 0 18px #ffb52e14}
.addform button{
  background:var(--amber);color:#141005;border:1px solid var(--amber);
  font-family:var(--disp);font-weight:700;font-size:12px;letter-spacing:.18em;
  padding:0 18px;cursor:pointer;transition:transform .1s, background .15s;
}
.addform button:hover{background:#ffc95e}
.addform button:active{transform:translateY(1px)}

.hd-right{margin-left:auto;display:flex;align-items:center;gap:14px}
.feedcount{font-size:10px;letter-spacing:.22em;color:var(--dim);white-space:nowrap}
.feedcount b{color:var(--amber);font-weight:600}
.chatbtn{
  background:transparent;border:1px solid var(--line);color:var(--dim);
  font-family:var(--mono);font-size:10px;letter-spacing:.2em;padding:8px 12px;
  cursor:pointer;transition:all .15s;white-space:nowrap;
}
.chatbtn:hover{border-color:var(--amber);color:var(--amber)}
.chatbtn.on{border-color:var(--amber);color:var(--amber);background:#ffb52e12}

.authbtn{
  display:flex;align-items:center;gap:7px;
  background:transparent;border:1px solid var(--tw);color:var(--tw);
  font-family:var(--mono);font-size:10px;letter-spacing:.18em;padding:8px 12px;
  cursor:pointer;transition:all .15s;white-space:nowrap;
}
.authbtn:hover{background:#a970ff1a;box-shadow:0 0 16px #a970ff26}
.authbtn.on{color:var(--green);border-color:#58e07c66}
.authbtn.on:hover{background:#ff44381a;border-color:var(--red);color:var(--red)}
.authbtn .av{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}

.composer{flex:none;display:flex;gap:6px;padding:7px;border-top:1px solid var(--line);
  background:var(--panel2)}
.composer input{
  flex:1;min-width:0;background:#080a0e;border:1px solid var(--line);color:var(--text);
  font-family:var(--mono);font-size:11px;padding:7px 9px;outline:none;transition:border-color .15s}
.composer input:focus{border-color:var(--tw)}
.composer input::placeholder{color:var(--faint)}
.composer button{
  flex:none;background:var(--tw);color:#0d0616;border:none;cursor:pointer;
  font-size:11px;padding:0 12px;transition:opacity .15s}
.composer button:disabled{opacity:.3;cursor:default}
.msg.mine{background:#a970ff12;margin:0 -10px;padding:0 10px;
  box-shadow:inset 2px 0 0 var(--tw)}

/* ---------- main ---------- */
main{flex:1;display:flex;min-height:0}
.deck{flex:1;display:flex;flex-direction:column;gap:8px;padding:8px;min-width:0}
.deckrow{flex:1;display:flex;gap:8px;min-height:0;
  transition:flex-grow .4s cubic-bezier(.25,.8,.25,1)}
.deckrow.grow{flex-grow:1.55}
.herocol{flex:1;display:flex;flex-direction:column;gap:8px;min-width:0;
  transition:flex-grow .4s cubic-bezier(.25,.8,.25,1)}
.herocol.grow{flex-grow:2.1}
/* hovering a small tile in the 3-up layout dethrones the hero */
.deckrow.colhov > .tile.hero{flex-grow:.8}
.herocol .tile.hov{flex-grow:2.2}

/* ---------- tile ---------- */
.tile{
  flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;
  background:var(--panel);border:1px solid var(--line);position:relative;
  animation:tileIn .45s cubic-bezier(.2,.9,.3,1) both;
  transition:border-color .15s, box-shadow .2s,
    flex-grow .4s cubic-bezier(.25,.8,.25,1);
}
.tile.hov{border-color:var(--amber);box-shadow:0 0 0 1px #ffb52e40, 0 0 34px #ffb52e1c;
  flex-grow:1.75}
.tile.hero{flex:2}
.tile.hero.hov{flex-grow:3}
@keyframes tileIn{from{opacity:0;transform:scale(.97) translateY(8px)}to{opacity:1;transform:none}}

.tile-top{
  flex:none;height:34px;display:flex;align-items:center;gap:8px;padding:0 8px;
  background:var(--panel2);border-bottom:1px solid var(--line);
}
.plat{
  flex:none;font-size:9px;font-weight:600;letter-spacing:.12em;padding:2px 5px;
  border:1px solid currentColor;
}
.plat-twitch{color:var(--tw)} .plat-youtube{color:var(--yt)} .plat-kick{color:var(--kk)}
.tile-name{
  font-family:var(--disp);font-weight:600;font-size:12px;letter-spacing:.08em;
  text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  color:var(--text);
}
.tile.hov .tile-name{color:var(--amber)}
.tile-ctl{margin-left:auto;display:flex;align-items:center;gap:8px;flex:none}

.mutebtn{
  background:transparent;border:1px solid #ff443855;cursor:pointer;
  font-family:var(--mono);font-size:9px;letter-spacing:.14em;padding:3px 7px;
  color:var(--red);transition:all .15s;white-space:nowrap;
}
.mutebtn.onair{color:var(--green);border-color:#58e07c55}
.mutebtn:hover{border-color:currentColor}

.vol{appearance:none;-webkit-appearance:none;width:74px;height:2px;background:var(--line2);outline:none;cursor:pointer}
.vol::-webkit-slider-thumb{
  appearance:none;-webkit-appearance:none;width:9px;height:14px;background:var(--amber);
  border:none;cursor:pointer;
}
.vol::-moz-range-thumb{width:9px;height:14px;background:var(--amber);border:none;border-radius:0;cursor:pointer}
.volpct{font-size:9px;color:var(--dim);width:34px;text-align:right}
.volpct.boost{color:var(--amber)}
.novol{font-size:9px;color:var(--faint);letter-spacing:.1em}

.killbtn{
  background:transparent;border:none;color:var(--faint);cursor:pointer;
  font-family:var(--mono);font-size:12px;padding:2px 4px;line-height:1;transition:color .15s;
}
.killbtn:hover{color:var(--red)}

.tile-body{flex:1;position:relative;min-height:0;background:#000}
.tile-body .mount{position:absolute;inset:0}
.tile-body .mount iframe{width:100%;height:100%;border:0;display:block}

/* hover-capture overlay — iframes swallow mouse events.
   upper 90% = click to lock/unlock; bottom 10% = drop the shield so the
   native player controls underneath become clickable */
.shield{position:absolute;inset:0 0 10% 0;z-index:5;cursor:pointer}
.shield-ctl{position:absolute;left:0;right:0;bottom:0;height:10%;z-index:5;cursor:pointer}
.hint{
  position:absolute;right:8px;bottom:calc(10% + 8px);z-index:6;
  font-size:9px;letter-spacing:.16em;pointer-events:none;
  color:#ffffff70;background:#000000a8;border:1px solid #ffffff22;padding:3px 7px;
  opacity:0;transition:opacity .2s;
}
.tile.hov .hint{opacity:1}
.lockbadge{
  position:absolute;left:8px;top:8px;z-index:7;pointer-events:none;
  font-family:var(--mono);font-size:9px;letter-spacing:.18em;color:#141005;
  background:var(--green);padding:3px 8px;font-weight:600;
}
.tile.locked{border-color:var(--green);box-shadow:0 0 0 1px #58e07c55, 0 0 34px #58e07c1f}
.tile.locked .tile-name{color:var(--green)}
.tile.locked .corner{opacity:1;border-color:var(--green)}
.tile.locked .gainbadge{background:var(--green)}
.gainbadge{
  position:absolute;left:8px;top:8px;z-index:6;pointer-events:none;
  font-family:var(--mono);font-size:9px;letter-spacing:.18em;color:#141005;
  background:var(--amber);padding:3px 8px;font-weight:600;
  opacity:0;transform:translateY(-4px);transition:all .18s;
}
.tile.hov .gainbadge{opacity:1;transform:none}

/* corner brackets on hover */
.corner{position:absolute;width:14px;height:14px;z-index:6;pointer-events:none;
  opacity:0;transition:opacity .18s}
.tile.hov .corner{opacity:1}
.corner.tl{left:4px;top:4px;border-left:2px solid var(--amber);border-top:2px solid var(--amber)}
.corner.tr{right:4px;top:4px;border-right:2px solid var(--amber);border-top:2px solid var(--amber)}
.corner.bl{left:4px;bottom:4px;border-left:2px solid var(--amber);border-bottom:2px solid var(--amber)}
.corner.br{right:4px;bottom:4px;border-right:2px solid var(--amber);border-bottom:2px solid var(--amber)}

/* ---------- chat panel ---------- */
.chatpanel{
  width:340px;flex:none;display:flex;flex-direction:column;
  border-left:1px solid var(--line);background:var(--panel);
}
.chat-hd{
  flex:none;height:34px;display:flex;align-items:center;gap:8px;padding:0 10px;
  border-bottom:1px solid var(--line);background:var(--panel2);
}
.chat-hd .lbl{font-size:9px;letter-spacing:.26em;color:var(--faint);white-space:nowrap}
.chat-hd .who{font-family:var(--disp);font-weight:600;font-size:12px;letter-spacing:.08em;
  text-transform:uppercase;color:var(--amber);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chat-hd .popout{margin-left:auto;font-size:9px;letter-spacing:.16em;color:var(--faint);
  text-decoration:none;border:1px solid var(--line);padding:3px 7px;white-space:nowrap;
  transition:all .15s}
.chat-hd .popout:hover{color:var(--amber);border-color:var(--amber)}

/* ---------- custom twitch chat w/ 7tv ---------- */
.stchat{position:absolute;inset:0;flex-direction:column;font-size:12px}
.stchat .msgs{flex:1;overflow-y:auto;overflow-x:hidden;padding:8px 10px 10px;
  display:flex;flex-direction:column;gap:6px;
  scrollbar-width:thin;scrollbar-color:#33405494 transparent}
.stchat .msgs::-webkit-scrollbar{width:6px}
.stchat .msgs::-webkit-scrollbar-thumb{background:var(--line)}
.msg{line-height:1.55;overflow-wrap:anywhere;animation:msgIn .15s ease both}
@keyframes msgIn{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
.msg .nick{font-weight:600}
.msg .sep{color:var(--faint)}
.msg .txt{color:var(--text)}
.msg .txt.action{font-style:italic}
.msg .badge{display:inline-block;font-size:8px;font-weight:600;letter-spacing:.08em;
  border:1px solid currentColor;padding:0 3px;margin-right:4px;vertical-align:1px;line-height:1.5}
.b-bc{color:var(--red)} .b-mod{color:var(--green)} .b-vip{color:#ff8ab5} .b-sub{color:var(--amber)}
.emw{display:inline-block;position:relative;vertical-align:middle;margin:-4px 1px}
.emw img{height:24px;max-width:84px;object-fit:contain;vertical-align:middle;display:inline-block}
.emw img.zw{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}
.stchat .conn{
  flex:none;display:flex;align-items:center;gap:10px;padding:5px 10px;
  border-top:1px solid var(--line);background:var(--panel2);
  font-size:8px;letter-spacing:.2em;color:var(--faint);white-space:nowrap}
.stchat .conn .st-live{color:var(--green)}
.stchat .conn .st-sync{color:var(--amber)}
.stchat .conn .st-reconn{color:var(--red)}
.stchat .conn .stv{color:var(--dim);margin-left:auto}
.chat-body{flex:1;position:relative;min-height:0}
.chat-body iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.chat-idle{
  position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:10px;color:var(--faint);text-align:center;padding:24px;
}
.chat-idle .glyph{font-size:26px;color:var(--line2)}
.chat-idle p{font-size:10px;letter-spacing:.2em;line-height:2}

/* ---------- empty state ---------- */
.empty{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:32px;animation:tileIn .5s ease both;
}
.empty .mark{
  font-family:var(--disp);font-style:italic;font-weight:700;
  font-size:clamp(44px,7vw,84px);letter-spacing:.04em;line-height:1;
  color:var(--text);text-shadow:0 0 44px #ffb52e2e;
}
.empty .mark em{color:var(--amber)}
.empty .tag{font-size:10px;letter-spacing:.5em;color:var(--faint);margin:14px 0 34px}
.empty .how{display:flex;border:1px solid var(--line);margin-bottom:30px}
.empty .how div{
  padding:14px 22px;font-size:10px;letter-spacing:.14em;color:var(--dim);line-height:1.9;
  border-right:1px solid var(--line);
}
.empty .how div:last-child{border-right:none}
.empty .how b{display:block;color:var(--amber);font-weight:600;letter-spacing:.22em}
.empty .try{font-size:9px;letter-spacing:.3em;color:var(--faint);margin-bottom:12px}
.chips{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.chips button{
  background:transparent;border:1px solid var(--line);color:var(--dim);
  font-family:var(--mono);font-size:10px;letter-spacing:.1em;padding:7px 14px;
  cursor:pointer;transition:all .15s;
}
.chips button:hover{border-color:var(--amber);color:var(--amber);background:#ffb52e0d}

/* ---------- status bar ---------- */
.statusbar{
  flex:none;height:26px;display:flex;align-items:center;gap:18px;padding:0 14px;
  border-top:1px solid var(--line);background:var(--panel);
  font-size:9px;letter-spacing:.18em;color:var(--faint);
}
.statusbar .dot{width:6px;height:6px;background:var(--green);border-radius:50%;
  animation:pulse 1.6s ease-in-out infinite;flex:none}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
.statusbar .target{margin-left:auto;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.statusbar .target b{color:var(--amber);font-weight:600}
.cursor-blink{animation:blink 1.1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}

/* ---------- toast ---------- */
.toast{
  position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:60;
  background:#16100a;border:1px solid var(--amber);color:var(--amber);
  font-size:11px;letter-spacing:.12em;padding:10px 18px;white-space:nowrap;
  animation:tileIn .25s ease both;box-shadow:0 8px 30px #000c;
}

@media (max-width:900px){
  .addform{max-width:none}
  .chatpanel{width:280px}
  header{flex-wrap:wrap;height:auto;padding:10px 12px;gap:10px}
}
`

/* ---------- link parsing ---------- */
function parseStream(raw) {
  const t = raw.trim()
  if (!t) return null
  // bare word → treat as a twitch channel
  if (!t.includes('.') && !t.includes('/') && /^[A-Za-z0-9_]{3,25}$/.test(t)) {
    return { platform: 'twitch', id: t.toLowerCase(), label: t }
  }
  let url
  try {
    url = new URL(t.includes('://') ? t : 'https://' + t)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')
  const seg = url.pathname.split('/').filter(Boolean)

  if (host === 'twitch.tv' || host === 'player.twitch.tv') {
    const skip = ['videos', 'directory', 'popout', 'embed', 'settings', 'downloads']
    if (seg[0] && !skip.includes(seg[0])) {
      return { platform: 'twitch', id: seg[0].toLowerCase(), label: seg[0] }
    }
    return null
  }
  if (host === 'youtu.be') {
    return seg[0] ? { platform: 'youtube', id: seg[0], label: 'YT ' + seg[0] } : null
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    const v = url.searchParams.get('v')
    if (v) return { platform: 'youtube', id: v, label: 'YT ' + v }
    if ((seg[0] === 'live' || seg[0] === 'embed') && seg[1]) {
      return { platform: 'youtube', id: seg[1], label: 'YT ' + seg[1] }
    }
    return null
  }
  if (host === 'kick.com' || host === 'player.kick.com') {
    if (seg[0] && seg[0] !== 'popout') {
      return { platform: 'kick', id: seg[0].toLowerCase(), label: seg[0] }
    }
    return null
  }
  return null
}

/* ---------- embed api script loaders ---------- */
let twitchReady = null
function loadTwitch() {
  if (!twitchReady) {
    twitchReady = new Promise(res => {
      if (window.Twitch && window.Twitch.Player) return res()
      const s = document.createElement('script')
      s.src = 'https://player.twitch.tv/js/embed/v1.js'
      s.onload = () => res()
      document.head.appendChild(s)
    })
  }
  return twitchReady
}
let ytReady = null
function loadYT() {
  if (!ytReady) {
    ytReady = new Promise(res => {
      if (window.YT && window.YT.Player) return res()
      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); res() }
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(s)
    })
  }
  return ytReady
}

/* ---------- layout: rows adapt to how many feeds are up ---------- */
function rowsFor(n) {
  const table = {
    1: [1], 2: [2], 4: [2, 2], 5: [2, 3], 6: [3, 3],
    7: [3, 4], 8: [4, 4], 9: [3, 3, 3], 10: [3, 3, 4], 11: [3, 4, 4], 12: [4, 4, 4],
  }
  if (table[n]) return table[n]
  const rows = Math.max(1, Math.ceil(n / 4))
  const base = Math.floor(n / rows)
  const extra = n % rows
  return Array.from({ length: rows }, (_, i) => base + (i >= rows - extra ? 1 : 0))
}

/* ---------- player mounts ---------- */
function TwitchMount({ id, onApi }) {
  const ref = useRef(null)
  useEffect(() => {
    let dead = false
    const el = ref.current
    loadTwitch().then(() => {
      if (dead || !el) return
      const player = new window.Twitch.Player(el, {
        channel: id, width: '100%', height: '100%',
        parent: [window.location.hostname], autoplay: true, muted: true,
      })
      player.addEventListener(window.Twitch.Player.READY, () => {
        if (dead) return
        onApi({
          setVol: v => player.setVolume(v),
          setMuted: m => player.setMuted(m),
        })
      })
    })
    return () => { dead = true; onApi(null); if (el) el.innerHTML = '' }
  }, [id, onApi])
  return <div className="mount" ref={ref} />
}

function YouTubeMount({ id, onApi, onTitle }) {
  const ref = useRef(null)
  useEffect(() => {
    let dead = false
    let player = null
    const el = ref.current
    const inner = document.createElement('div')
    el.appendChild(inner)
    loadYT().then(() => {
      if (dead) return
      player = new window.YT.Player(inner, {
        videoId: id, width: '100%', height: '100%',
        playerVars: { autoplay: 1, mute: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: e => {
            if (dead) return
            const data = e.target.getVideoData && e.target.getVideoData()
            if (data && data.title) onTitle(data.title)
            onApi({
              setVol: v => e.target.setVolume(Math.round(v * 100)),
              setMuted: m => (m ? e.target.mute() : e.target.unMute()),
            })
          },
        },
      })
    })
    return () => {
      dead = true; onApi(null)
      try { if (player && player.destroy) player.destroy() } catch { /* already gone */ }
      if (el) el.innerHTML = ''
    }
  }, [id, onApi, onTitle])
  return <div className="mount" ref={ref} />
}

function KickMount({ id }) {
  return (
    <div className="mount">
      <iframe
        src={`https://player.kick.com/${id}?autoplay=true&muted=true`}
        allow="autoplay; fullscreen; encrypted-media"
        allowFullScreen
        title={`kick:${id}`}
      />
    </div>
  )
}

/* ---------- chat urls ---------- */
function chatUrl(s) {
  const host = window.location.hostname
  if (s.platform === 'youtube') return `https://www.youtube.com/live_chat?v=${s.id}&embed_domain=${host}&dark_theme=1`
  return `https://kick.com/popout/${s.id}/chat`
}
function popoutUrl(s) {
  if (s.platform === 'twitch') return `https://www.twitch.tv/popout/${s.id}/chat`
  if (s.platform === 'youtube') return `https://www.youtube.com/live_chat?is_popout=1&v=${s.id}`
  return `https://kick.com/popout/${s.id}/chat`
}

/* ============================================================
   custom twitch chat — anonymous IRC over websocket, rendered
   locally so 7tv channel + global emotes can be mixed in
   ============================================================ */
const TW_EMOTE_CDN = id => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`
const NICK_COLORS = ['#ff7a59', '#58e07c', '#6fc3ff', '#ffb52e', '#d59aff', '#ff8ab5', '#7de8d8', '#c9e07a']

function nickColor(tags, login) {
  if (tags.color) return tags.color
  let h = 0
  for (let i = 0; i < login.length; i++) h = (h * 31 + login.charCodeAt(i)) >>> 0
  return NICK_COLORS[h % NICK_COLORS.length]
}

/* 7tv: global set + channel set (channel looked up by twitch user id via ivr.fi) */
async function fetch7tv(channel) {
  const map = new Map()
  const add = list => {
    for (const e of list || []) {
      const base = e.data && e.data.host && e.data.host.url
      map.set(e.name, {
        url: base ? `https:${base}/2x.webp` : `https://cdn.7tv.app/emote/${e.id}/2x.webp`,
        zw: !!((e.flags & 1) || (e.data && e.data.flags & 256)),
      })
    }
  }
  try {
    const g = await (await fetch('https://7tv.io/v3/emote-sets/global')).json()
    add(g.emotes)
  } catch { /* no globals — chat still works */ }
  try {
    const u = await (await fetch(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(channel)}`)).json()
    const id = Array.isArray(u) && u[0] && u[0].id
    if (id) {
      const s = await (await fetch(`https://7tv.io/v3/users/twitch/${id}`)).json()
      add(s.emote_set && s.emote_set.emotes)
    }
  } catch { /* channel has no 7tv set */ }
  return map
}

/* twitch "emotes" tag gives codepoint ranges — slice on codepoints, not utf-16 */
function segmentTwitchEmotes(text, emotesTag) {
  if (!emotesTag) return [{ t: 'text', s: text }]
  const chars = Array.from(text)
  const ranges = []
  for (const part of emotesTag.split('/')) {
    const [id, list] = part.split(':')
    if (!list) continue
    for (const r of list.split(',')) {
      const [a, b] = r.split('-').map(Number)
      ranges.push({ id, a, b })
    }
  }
  ranges.sort((x, y) => x.a - y.a)
  const out = []
  let pos = 0
  for (const r of ranges) {
    if (r.a > pos) out.push({ t: 'text', s: chars.slice(pos, r.a).join('') })
    out.push({ t: 'emote', id: r.id, name: chars.slice(r.a, r.b + 1).join('') })
    pos = r.b + 1
  }
  if (pos < chars.length) out.push({ t: 'text', s: chars.slice(pos).join('') })
  return out
}

const BADGE_MAP = { broadcaster: ['BC', 'b-bc'], moderator: ['MOD', 'b-mod'], vip: ['VIP', 'b-vip'], subscriber: ['SUB', 'b-sub'] }

function MsgBody({ text, emotesTag, emoteMap }) {
  const pieces = []
  for (const seg of segmentTwitchEmotes(text, emotesTag)) {
    if (seg.t === 'emote') {
      pieces.push({ url: TW_EMOTE_CDN(seg.id), name: seg.name, zw: false, overlays: [] })
    } else {
      for (const w of seg.s.split(/(\s+)/)) {
        if (!w) continue
        const e = /\S/.test(w) ? emoteMap.get(w) : null
        pieces.push(e ? { url: e.url, name: w, zw: e.zw, overlays: [] } : w)
      }
    }
  }
  /* fold zero-width 7tv emotes onto the emote before them */
  const folded = []
  for (const p of pieces) {
    if (typeof p === 'object' && p.zw) {
      let j = folded.length - 1
      while (j >= 0 && typeof folded[j] === 'string' && !folded[j].trim()) j--
      if (j >= 0 && typeof folded[j] === 'object') {
        folded[j].overlays.push(p)
        folded.length = j + 1
        continue
      }
    }
    folded.push(p)
  }
  return folded.map((p, i) =>
    typeof p === 'string' ? p : (
      <span className="emw" key={i} title={p.name}>
        <img src={p.url} alt={p.name} loading="lazy" />
        {p.overlays.map((o, k) => <img className="zw" key={k} src={o.url} alt={o.name} loading="lazy" />)}
      </span>
    )
  )
}

/* ---------- twitch oauth (implicit flow — no backend, no secret) ---------- */
const SCOPES = 'chat:read chat:edit'

function beginLogin() {
  const state = Math.random().toString(36).slice(2)
  sessionStorage.setItem('streamseer:state', state)
  const p = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: window.location.origin + window.location.pathname,
    response_type: 'token',
    scope: SCOPES,
    state,
  })
  window.location.href = 'https://id.twitch.tv/oauth2/authorize?' + p
}

function loadAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* corrupt — re-login */ }
  return null
}

/* pull the token out of the redirect fragment, verify it, learn our login name */
async function consumeRedirect() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  if (!hash.includes('access_token')) return null
  const p = new URLSearchParams(hash)
  const token = p.get('access_token')
  const state = p.get('state')
  history.replaceState(null, '', window.location.pathname + window.location.search)
  if (!token || state !== sessionStorage.getItem('streamseer:state')) return null
  sessionStorage.removeItem('streamseer:state')
  return validateToken(token)
}

async function validateToken(token) {
  try {
    const r = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: 'OAuth ' + token },
    })
    if (!r.ok) return null
    const d = await r.json()
    return { token, login: d.login, userId: d.user_id }
  } catch {
    return null
  }
}

function TwitchChat({ channel, visible, auth }) {
  const [msgs, setMsgs] = useState([])
  const [emoteMap, setEmoteMap] = useState(() => new Map())
  const [status, setStatus] = useState('sync')
  const [draft, setDraft] = useState('')
  const scrollRef = useRef(null)
  const sockRef = useRef(null)
  const pinned = useRef(true)
  const nextId = useRef(0)

  useEffect(() => {
    let dead = false
    fetch7tv(channel).then(m => { if (!dead) setEmoteMap(m) })
    return () => { dead = true }
  }, [channel])

  useEffect(() => {
    let retry = null
    let dead = false
    const connect = () => {
      const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
      sockRef.current = ws
      ws.onopen = () => {
        ws.send('CAP REQ :twitch.tv/tags')
        /* logged in → PASS + real nick lets us send; else anonymous justinfan */
        if (auth) {
          ws.send('PASS oauth:' + auth.token)
          ws.send('NICK ' + auth.login)
        } else {
          ws.send('NICK justinfan' + Math.floor(100000 + Math.random() * 900000))
        }
        ws.send('JOIN #' + channel)
        setStatus('live')
      }
      ws.onmessage = ev => {
        const batch = []
        for (const line of String(ev.data).split('\r\n')) {
          if (!line) continue
          if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue }
          const m = line.match(/^@([^ ]+) :([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/)
          if (!m) continue
          const tags = {}
          for (const kv of m[1].split(';')) {
            const eq = kv.indexOf('=')
            tags[kv.slice(0, eq)] = kv.slice(eq + 1).replace(/\\s/g, ' ')
          }
          let text = m[3]
          let action = false
          if (text.charCodeAt(0) === 1) { action = true; text = text.slice(8, -1) }
          batch.push({ id: ++nextId.current, login: m[2], text, tags, action })
        }
        if (batch.length) setMsgs(prev => {
          const next = [...prev, ...batch]
          return next.length > 220 ? next.slice(-160) : next
        })
      }
      ws.onclose = () => {
        if (!dead) { setStatus('reconn'); retry = setTimeout(connect, 2500) }
      }
    }
    connect()
    return () => {
      dead = true
      clearTimeout(retry)
      const ws = sockRef.current
      try { if (ws) { ws.onclose = null; ws.close() } } catch { /* already closed */ }
      sockRef.current = null
    }
  }, [channel, auth])

  const send = e => {
    e.preventDefault()
    const text = draft.trim()
    const ws = sockRef.current
    if (!text || !auth || !ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(`PRIVMSG #${channel} :${text}`)
    /* twitch doesn't echo our own message back, so render it locally */
    setMsgs(prev => [...prev, {
      id: ++nextId.current,
      login: auth.login,
      text,
      tags: { 'display-name': auth.login, badges: '', emotes: '' },
      action: false,
      mine: true,
    }])
    pinned.current = true
    setDraft('')
  }

  /* stay pinned to the newest message unless the user scrolled up */
  useEffect(() => {
    const el = scrollRef.current
    if (el && pinned.current && visible) el.scrollTop = el.scrollHeight
  }, [msgs, visible])

  return (
    <div className="stchat" style={{ display: visible ? 'flex' : 'none' }}>
      <div
        className="msgs" ref={scrollRef}
        onScroll={e => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
        }}
      >
        {msgs.map(msg => (
          <div className={'msg' + (msg.mine ? ' mine' : '')} key={msg.id}>
            {(msg.tags.badges || '').split(',').map(b => {
              const info = BADGE_MAP[b.split('/')[0]]
              return info ? <span className={`badge ${info[1]}`} key={b}>{info[0]}</span> : null
            })}
            <span className="nick" style={{ color: nickColor(msg.tags, msg.login) }}>
              {msg.tags['display-name'] || msg.login}
            </span>
            <span className="sep">{msg.action ? ' ' : ': '}</span>
            <span className={'txt' + (msg.action ? ' action' : '')}>
              <MsgBody text={msg.text} emotesTag={msg.tags.emotes} emoteMap={emoteMap} />
            </span>
          </div>
        ))}
      </div>
      {auth && (
        <form className="composer" onSubmit={send}>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            maxLength={480}
            placeholder={`send as ${auth.login}…`}
            spellCheck="false"
          />
          <button type="submit" disabled={!draft.trim()}>▶</button>
        </form>
      )}
      <div className="conn">
        <span className={'st-' + status}>
          {status === 'live' ? '● IRC LIVE' : status === 'sync' ? '◌ SYNCING' : '○ RECONNECTING'}
        </span>
        <span>{auth ? auth.login.toUpperCase() : 'ANON · READ-ONLY'}</span>
        <span className="stv">7TV ×{emoteMap.size}</span>
      </div>
    </div>
  )
}

const PLAT_TAG = { twitch: 'TTV', youtube: 'YT', kick: 'KICK' }

/* ---------- tile ---------- */
function Tile({ stream, hovered, locked, interactive, vol, muted, index, hero,
  onEnter, onLeave, onLock, onControls, onVol, onMute, onKill, onApi, onTitle }) {
  const shownPct = Math.round(vol * (hovered ? 150 : 100))
  const hasVolApi = stream.platform !== 'kick'
  const apiCb = useCallback(api => onApi(stream.key, api), [onApi, stream.key])
  const titleCb = useCallback(t => onTitle(stream.key, t), [onTitle, stream.key])

  return (
    <div
      className={'tile' + (hovered ? ' hov' : '') + (locked ? ' locked' : '') + (hero ? ' hero' : '')}
      style={{ animationDelay: `${index * 60}ms` }}
      onMouseEnter={() => onEnter(stream.key)}
      onMouseLeave={() => onLeave(stream.key)}
    >
      <div className="tile-top">
        <span className={`plat plat-${stream.platform}`}>{PLAT_TAG[stream.platform]}</span>
        <span className="tile-name" title={stream.label}>{stream.label}</span>
        <div className="tile-ctl">
          {hasVolApi ? (
            <>
              <button
                className={'mutebtn' + (muted ? '' : ' onair')}
                onClick={() => onMute(stream.key)}
                title={muted ? 'Unmute feed' : 'Mute feed'}
              >{muted ? 'MUTED' : 'ON AIR'}</button>
              <input
                className="vol" type="range" min="0" max="100" value={Math.round(vol * 100)}
                onChange={e => onVol(stream.key, Number(e.target.value) / 100)}
                title="Feed volume"
              />
              <span className={'volpct' + (hovered && !muted ? ' boost' : '')}>{shownPct}%</span>
            </>
          ) : (
            <span className="novol">VOL IN PLAYER</span>
          )}
          <button className="killbtn" onClick={() => onKill(stream.key)} title="Remove feed">✕</button>
        </div>
      </div>
      <div className="tile-body">
        {stream.platform === 'twitch' && <TwitchMount id={stream.id} onApi={apiCb} />}
        {stream.platform === 'youtube' && <YouTubeMount id={stream.id} onApi={apiCb} onTitle={titleCb} />}
        {stream.platform === 'kick' && <KickMount id={stream.id} />}
        {locked ? <span className="lockbadge">◉ LOCKED</span> : <span className="gainbadge">▲ GAIN +50%</span>}
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
        {!interactive && (
          <>
            <div className="shield" onClick={() => onLock(stream.key)} />
            <div className="shield-ctl" onClick={() => onControls(stream.key)} />
            <span className="hint">
              {locked ? 'CLICK TO UNLOCK · BOTTOM EDGE = CONTROLS' : 'CLICK TO LOCK · BOTTOM EDGE = CONTROLS'}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------- persistence ---------- */
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const d = JSON.parse(raw)
      if (Array.isArray(d.streams)) return { streams: d.streams, vols: d.vols || {}, muted: d.muted || {} }
    }
  } catch { /* fresh start */ }
  return { streams: [], vols: {}, muted: {} }
}

/* ---------- app ---------- */
export default function App() {
  const boot = useMemo(loadStore, [])
  const [streams, setStreams] = useState(boot.streams)
  const [vols, setVols] = useState(boot.vols)
  const [muted, setMuted] = useState(boot.muted)
  const [hovered, setHovered] = useState(null)
  const [locked, setLocked] = useState(null)
  const [activeChat, setActiveChat] = useState(null)
  const [interactive, setInteractive] = useState(null)
  const [chatOpen, setChatOpen] = useState(true)
  const [input, setInput] = useState('')
  const [toast, setToast] = useState(null)
  const [auth, setAuth] = useState(loadAuth)
  const [, setApiTick] = useState(0)

  const apis = useRef(new Map())
  const chatLoaded = useRef(new Set())

  /* a locked feed stays the active one no matter where the cursor goes */
  const active = locked || hovered

  /* persist */
  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ streams, vols, muted }))
  }, [streams, vols, muted])

  /* auth: absorb the oauth redirect, then keep the stored token verified.
     twitch tokens expire (~60d) and can be revoked — drop a dead one. */
  useEffect(() => {
    let dead = false
    ;(async () => {
      const fresh = await consumeRedirect()
      if (dead) return
      if (fresh) {
        setAuth(fresh)
        localStorage.setItem(AUTH_KEY, JSON.stringify(fresh))
        say('CONNECTED AS ' + fresh.login.toUpperCase())
        return
      }
      const stored = loadAuth()
      if (!stored) return
      const ok = await validateToken(stored.token)
      if (dead) return
      if (!ok) {
        setAuth(null)
        localStorage.removeItem(AUTH_KEY)
        say('TWITCH SESSION EXPIRED — RECONNECT')
      }
    })()
    return () => { dead = true }
  }, [say])

  const logout = useCallback(() => {
    setAuth(null)
    localStorage.removeItem(AUTH_KEY)
    say('DISCONNECTED FROM TWITCH')
  }, [say])

  /* toast helper */
  const toastTimer = useRef(null)
  const say = useCallback(msg => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  /* push audio state to every live player (runs after every render —
     also catches players that finish loading late).
     headroom mix: embeds can't amplify past their own max, so the player's
     true max is "150%" on our scale — idle feeds run at base/1.5 of player
     range, and hover uses the reserved third for an unclipped +50% boost */
  useEffect(() => {
    for (const s of streams) {
      const api = apis.current.get(s.key)
      if (!api) continue
      const base = vols[s.key] ?? DEFAULT_VOL
      api.setVol(active === s.key ? base : base / 1.5)
      /* the active feed solos: everything else mutes until it's released,
         then each feed's own mute state is restored */
      api.setMuted(muted[s.key] === true || (active !== null && active !== s.key))
    }
  })

  /* players mount muted to satisfy autoplay policy; after the first user
     gesture, re-run the audio sync so default-unmuted feeds go audible */
  useEffect(() => {
    const arm = () => setApiTick(t => t + 1)
    window.addEventListener('pointerdown', arm, { once: true })
    window.addEventListener('keydown', arm, { once: true })
    return () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
    }
  }, [])

  const onApi = useCallback((key, api) => {
    if (api) apis.current.set(key, api)
    else apis.current.delete(key)
    setApiTick(t => t + 1)
  }, [])

  const onTitle = useCallback((key, title) => {
    setStreams(prev => prev.map(s => (s.key === key && s.label !== title ? { ...s, label: title } : s)))
  }, [])

  const addStream = useCallback(raw => {
    const parsed = parseStream(raw)
    if (!parsed) { say('UNRECOGNIZED LINK — TWITCH / YOUTUBE / KICK'); return }
    setStreams(prev => {
      if (prev.length >= MAX_FEEDS) { say(`WALL FULL — MAX ${MAX_FEEDS} FEEDS`); return prev }
      if (prev.some(s => s.platform === parsed.platform && s.id === parsed.id)) {
        say('FEED ALREADY ON THE WALL'); return prev
      }
      return [...prev, { ...parsed, key: `${parsed.platform}:${parsed.id}` }]
    })
    setInput('')
  }, [say])

  const onKill = useCallback(key => {
    setStreams(prev => prev.filter(s => s.key !== key))
    setVols(prev => { const n = { ...prev }; delete n[key]; return n })
    setMuted(prev => { const n = { ...prev }; delete n[key]; return n })
    apis.current.delete(key)
    chatLoaded.current.delete(key)
    setHovered(h => (h === key ? null : h))
    setLocked(l => (l === key ? null : l))
    setActiveChat(c => (c === key ? null : c))
    setInteractive(i => (i === key ? null : i))
  }, [])

  const onEnter = useCallback(key => {
    setHovered(key)
    /* a locked feed owns the chat panel — hovering elsewhere won't steal it */
    setLocked(l => {
      if (!l) { setActiveChat(key); chatLoaded.current.add(key) }
      return l
    })
  }, [])
  const onLeave = useCallback(key => {
    setHovered(h => (h === key ? null : h))
    setInteractive(i => (i === key ? null : i))
  }, [])
  const onLock = useCallback(key => {
    setLocked(l => {
      const next = l === key ? null : key
      if (next) { setActiveChat(next); chatLoaded.current.add(next) }
      return next
    })
  }, [])
  const onControls = useCallback(key => setInteractive(key), [])
  const onVol = useCallback((key, v) => setVols(prev => ({ ...prev, [key]: v })), [])
  const onMute = useCallback(key => setMuted(prev => ({ ...prev, [key]: !prev[key] })), [])

  /* build the wall */
  const n = streams.length
  const activeStream = streams.find(s => s.key === active)
  const chatStream = streams.find(s => s.key === activeChat)
  const chatFeeds = streams.filter(s => chatLoaded.current.has(s.key))

  const tileProps = (s, i, hero = false) => ({
    stream: s, index: i, hero,
    hovered: active === s.key,
    locked: locked === s.key,
    interactive: interactive === s.key,
    vol: vols[s.key] ?? DEFAULT_VOL,
    muted: muted[s.key] === true,
    onEnter, onLeave, onLock, onControls, onVol, onMute, onKill, onApi, onTitle,
  })

  let wall
  if (n === 0) {
    wall = (
      <div className="empty">
        <div className="mark">STREAM<em>SEER</em></div>
        <div className="tag">MULTIVIEW · CONSOLE</div>
        <div className="how">
          <div><b>01 · PATCH IN</b>paste any twitch, youtube<br />or kick stream link above</div>
          <div><b>02 · AUTO WALL</b>the grid re-organizes itself<br />around how many feeds are up</div>
          <div><b>03 · SEEK BY EAR</b>hover to solo at +50% gain<br />click to lock it there</div>
        </div>
        <div className="try">NO SIGNAL — TRY A 24/7 FEED</div>
        <div className="chips">
          {['monstercat', 'esl_csgo', 'bobross'].map(c => (
            <button key={c} onClick={() => addStream('twitch.tv/' + c)}>twitch.tv/{c}</button>
          ))}
        </div>
      </div>
    )
  } else if (n === 3) {
    const colHover = active === streams[1].key || active === streams[2].key
    wall = (
      <div className="deck">
        <div className={'deckrow' + (colHover ? ' colhov' : '')}>
          <Tile key={streams[0].key} {...tileProps(streams[0], 0, true)} />
          <div className={'herocol' + (colHover ? ' grow' : '')}>
            <Tile key={streams[1].key} {...tileProps(streams[1], 1)} />
            <Tile key={streams[2].key} {...tileProps(streams[2], 2)} />
          </div>
        </div>
      </div>
    )
  } else {
    const rows = rowsFor(n)
    let idx = 0
    wall = (
      <div className="deck">
        {rows.map((count, r) => {
          const slice = streams.slice(idx, idx + count)
          const start = idx
          idx += count
          const rowHover = slice.some(s => s.key === active)
          return (
            <div className={'deckrow' + (rowHover ? ' grow' : '')} key={r}>
              {slice.map((s, i) => <Tile key={s.key} {...tileProps(s, start + i)} />)}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="app">
      <style>{css}</style>
      <div className="grain" />
      <header>
        <div className="brand">
          <div className="brand-bars"><i /><i /><i /><i /><i /></div>
          <h1>STREAM<em>SEER</em><small>MULTIVIEW CONSOLE</small></h1>
        </div>
        <form className="addform" onSubmit={e => { e.preventDefault(); addStream(input) }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="patch in a feed — twitch.tv/…  youtube.com/watch?v=…  kick.com/…"
            spellCheck="false"
          />
          <button type="submit">+ ADD</button>
        </form>
        <div className="hd-right">
          <span className="feedcount">FEEDS <b>{String(n).padStart(2, '0')}</b>/{MAX_FEEDS}</span>
          {TWITCH_CLIENT_ID && (auth ? (
            <button className="authbtn on" onClick={logout} title="Disconnect from Twitch">
              <i className="av" />{auth.login}
            </button>
          ) : (
            <button className="authbtn" onClick={beginLogin} title="Sign in to send chat messages">
              CONNECT TWITCH
            </button>
          ))}
          <button className={'chatbtn' + (chatOpen ? ' on' : '')} onClick={() => setChatOpen(o => !o)}>
            CHAT {chatOpen ? '◨' : '◧'}
          </button>
        </div>
      </header>

      <main>
        {wall}
        {chatOpen && (
          <aside className="chatpanel">
            <div className="chat-hd">
              <span className="lbl">CHAT</span>
              {chatStream
                ? <span className="who">{chatStream.label}</span>
                : <span className="lbl">— AWAITING TARGET</span>}
              {chatStream && (
                <a className="popout" href={popoutUrl(chatStream)} target="_blank" rel="noreferrer">
                  POPOUT ↗
                </a>
              )}
            </div>
            <div className="chat-body">
              {chatFeeds.map(s => s.platform === 'twitch' ? (
                <TwitchChat key={s.key} channel={s.id} visible={activeChat === s.key} auth={auth} />
              ) : (
                <iframe
                  key={s.key}
                  src={chatUrl(s)}
                  style={{ display: activeChat === s.key ? 'block' : 'none' }}
                  title={`chat:${s.key}`}
                />
              ))}
              {!chatStream && (
                <div className="chat-idle">
                  <span className="glyph">◬</span>
                  <p>HOVER A FEED<br />ITS CHAT REPORTS HERE<br />AND STAYS UNTIL THE NEXT TARGET</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </main>

      <div className="statusbar">
        <span className="dot" />
        <span>SIGNAL OK</span>
        <span>HOVER = SOLO · CLICK = LOCK · BOTTOM EDGE = CONTROLS</span>
        <span className="target">
          {activeStream
            ? <>{locked ? 'LOCKED' : 'TARGET'}: <b>{activeStream.label}</b> · GAIN {Math.round((vols[activeStream.key] ?? DEFAULT_VOL) * 150)}%</>
            : <>NO TARGET · AMBIENT MIX <span className="cursor-blink">▌</span></>}
        </span>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
