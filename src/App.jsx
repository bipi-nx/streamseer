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

/* ---------- main ---------- */
main{flex:1;display:flex;min-height:0}
.deck{flex:1;display:flex;flex-direction:column;gap:8px;padding:8px;min-width:0}
.deckrow{flex:1;display:flex;gap:8px;min-height:0}
.herocol{flex:1;display:flex;flex-direction:column;gap:8px;min-width:0}

/* ---------- tile ---------- */
.tile{
  flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;
  background:var(--panel);border:1px solid var(--line);position:relative;
  animation:tileIn .45s cubic-bezier(.2,.9,.3,1) both;
  transition:border-color .15s, box-shadow .2s;
}
.tile.hov{border-color:var(--amber);box-shadow:0 0 0 1px #ffb52e40, 0 0 34px #ffb52e1c}
.tile.hero{flex:2}
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

/* hover-capture overlay — iframes swallow mouse events; click passes through */
.shield{position:absolute;inset:0;z-index:5;cursor:pointer}
.shield .hint{
  position:absolute;right:8px;bottom:8px;font-size:9px;letter-spacing:.16em;
  color:#ffffff70;background:#000000a8;border:1px solid #ffffff22;padding:3px 7px;
  opacity:0;transition:opacity .2s;
}
.tile.hov .shield .hint{opacity:1}
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
  if (s.platform === 'twitch') return `https://www.twitch.tv/embed/${s.id}/chat?parent=${host}&darkpopout`
  if (s.platform === 'youtube') return `https://www.youtube.com/live_chat?v=${s.id}&embed_domain=${host}&dark_theme=1`
  return `https://kick.com/popout/${s.id}/chat`
}

const PLAT_TAG = { twitch: 'TTV', youtube: 'YT', kick: 'KICK' }

/* ---------- tile ---------- */
function Tile({ stream, hovered, interactive, vol, muted, index, hero,
  onEnter, onLeave, onShieldClick, onVol, onMute, onKill, onApi, onTitle }) {
  const shownPct = Math.round((hovered ? Math.min(1, vol * 1.5) : vol) * 100)
  const hasVolApi = stream.platform !== 'kick'
  const apiCb = useCallback(api => onApi(stream.key, api), [onApi, stream.key])
  const titleCb = useCallback(t => onTitle(stream.key, t), [onTitle, stream.key])

  return (
    <div
      className={'tile' + (hovered ? ' hov' : '') + (hero ? ' hero' : '')}
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
        <span className="gainbadge">▲ GAIN +50%</span>
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
        {!interactive && (
          <div className="shield" onClick={() => onShieldClick(stream.key)}>
            <span className="hint">CLICK FOR PLAYER CONTROLS</span>
          </div>
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
  const [activeChat, setActiveChat] = useState(null)
  const [interactive, setInteractive] = useState(null)
  const [chatOpen, setChatOpen] = useState(true)
  const [input, setInput] = useState('')
  const [toast, setToast] = useState(null)
  const [, setApiTick] = useState(0)

  const apis = useRef(new Map())
  const chatLoaded = useRef(new Set())

  /* persist */
  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ streams, vols, muted }))
  }, [streams, vols, muted])

  /* toast helper */
  const toastTimer = useRef(null)
  const say = useCallback(msg => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  /* push audio state to every live player (runs after every render —
     also catches players that finish loading late) */
  useEffect(() => {
    for (const s of streams) {
      const api = apis.current.get(s.key)
      if (!api) continue
      const base = vols[s.key] ?? DEFAULT_VOL
      api.setVol(hovered === s.key ? Math.min(1, base * 1.5) : base)
      api.setMuted(muted[s.key] === true)
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
    setActiveChat(c => (c === key ? null : c))
    setInteractive(i => (i === key ? null : i))
  }, [])

  const onEnter = useCallback(key => {
    setHovered(key)
    setActiveChat(key)
    chatLoaded.current.add(key)
  }, [])
  const onLeave = useCallback(key => {
    setHovered(h => (h === key ? null : h))
    setInteractive(i => (i === key ? null : i))
  }, [])
  const onShieldClick = useCallback(key => setInteractive(key), [])
  const onVol = useCallback((key, v) => setVols(prev => ({ ...prev, [key]: v })), [])
  const onMute = useCallback(key => setMuted(prev => ({ ...prev, [key]: !prev[key] })), [])

  /* build the wall */
  const n = streams.length
  const hoveredStream = streams.find(s => s.key === hovered)
  const chatStream = streams.find(s => s.key === activeChat)
  const chatFeeds = streams.filter(s => chatLoaded.current.has(s.key))

  const tileProps = (s, i, hero = false) => ({
    key: s.key, stream: s, index: i, hero,
    hovered: hovered === s.key,
    interactive: interactive === s.key,
    vol: vols[s.key] ?? DEFAULT_VOL,
    muted: muted[s.key] === true,
    onEnter, onLeave, onShieldClick, onVol, onMute, onKill, onApi, onTitle,
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
          <div><b>03 · SEEK BY EAR</b>hover a feed → gain +50%<br />and its chat takes the panel</div>
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
    wall = (
      <div className="deck">
        <div className="deckrow">
          <Tile {...tileProps(streams[0], 0, true)} />
          <div className="herocol">
            <Tile {...tileProps(streams[1], 1)} />
            <Tile {...tileProps(streams[2], 2)} />
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
          return (
            <div className="deckrow" key={r}>
              {slice.map((s, i) => <Tile {...tileProps(s, start + i)} />)}
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
            </div>
            <div className="chat-body">
              {chatFeeds.map(s => (
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
        <span>HOVER = GAIN +50% · CHAT FOLLOWS CURSOR</span>
        <span className="target">
          {hoveredStream
            ? <>TARGET: <b>{hoveredStream.label}</b> · GAIN {Math.round(Math.min(1, (vols[hoveredStream.key] ?? DEFAULT_VOL) * 1.5) * 100)}%</>
            : <>NO TARGET · AMBIENT MIX <span className="cursor-blink">▌</span></>}
        </span>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
