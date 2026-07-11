import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

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
const MAX_MSGS = 150     // twitch's own scrollback depth
const FLUSH_MS = 120     // commit incoming chat in batches, not per-message

/* twitch app client id — public by design (implicit oauth has no secret).
   unset → chat stays anonymous + read-only, everything else works. */
const TWITCH_CLIENT_ID = import.meta.env.VITE_TWITCH_CLIENT_ID || ''

/* ---------- css ---------- */
const css = `
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,500;0,600;0,700;1,700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;600;700&display=swap');

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
.authbtn.armed,.authbtn.armed:hover{
  color:var(--red);border-color:var(--red);background:#ff44381f;
  animation:armPulse 1s ease-in-out infinite;
}
@keyframes armPulse{0%,100%{box-shadow:0 0 0 0 #ff443800}50%{box-shadow:0 0 14px 0 #ff443859}}
.authbtn .av{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}

.composer{flex:none;position:relative;display:flex;gap:6px;padding:7px;
  border-top:1px solid var(--line);background:var(--panel2)}

/* ---------- emote tab-completion bubble ---------- */
.sugg{
  position:absolute;left:7px;right:7px;bottom:calc(100% + 6px);z-index:20;
  background:#0a0d13f2;border:1px solid var(--tw);
  box-shadow:0 10px 34px #000d, 0 0 22px #a970ff22;
  backdrop-filter:blur(4px);
  animation:suggIn .13s ease both;
}
@keyframes suggIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.sugg::after{ /* little pointer down at the text */
  content:'';position:absolute;left:14px;bottom:-5px;width:8px;height:8px;
  background:#0a0d13;border-right:1px solid var(--tw);border-bottom:1px solid var(--tw);
  transform:rotate(45deg);
}
.sugg-list{max-height:216px;overflow-y:auto;scrollbar-width:thin;
  scrollbar-color:#33405494 transparent}
.sugg-list::-webkit-scrollbar{width:6px}
.sugg-list::-webkit-scrollbar-thumb{background:var(--line)}
.sugg-row{
  width:100%;display:flex;align-items:center;gap:9px;padding:5px 8px;
  background:transparent;border:none;border-left:2px solid transparent;cursor:pointer;
  font-family:var(--mono);text-align:left;
}
.sugg-row.on{background:#a970ff1f;border-left-color:var(--tw)}
.sugg-img{flex:none;width:30px;height:30px;display:flex;align-items:center;justify-content:center}
.sugg-img img{max-width:30px;max-height:30px;object-fit:contain}
.sugg-emoji{font-size:20px;line-height:1}
.sugg-name{flex:1;min-width:0;font-size:12px;color:var(--text);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sugg-row.on .sugg-name{color:#fff}
.sugg-src{flex:none;font-size:8px;letter-spacing:.12em;text-transform:uppercase;
  padding:1px 4px;border:1px solid currentColor;opacity:.75}
.src-7tv{color:#29d8a4} .src-twitch{color:var(--tw)}
.src-channel{color:var(--amber)} .src-sub{color:#ff8ab5} .src-emoji{color:var(--dim)}
.composer input{
  flex:1;min-width:0;background:#080a0e;border:1px solid var(--line);color:var(--text);
  font-family:var(--mono);font-size:11px;padding:7px 9px;outline:none;transition:border-color .15s}
.composer input:focus{border-color:var(--tw)}
.composer input::placeholder{color:#adadb8}
/* scoped to the send button — .sugg-row is also a button inside .composer */
.composer > button[type=submit]{
  flex:none;background:var(--tw);color:#0d0616;border:none;cursor:pointer;
  font-size:11px;padding:0 12px;transition:opacity .15s}
.composer > button[type=submit]:disabled{opacity:.3;cursor:default}

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
  background:var(--panel2);border-bottom:1px solid var(--line);overflow:hidden;
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

/* secondary control — bare icon, deliberately not the amber accent */
.fsbtn{
  display:flex;align-items:center;justify-content:center;flex:none;
  background:transparent;border:none;color:var(--faint);
  padding:2px;cursor:pointer;transition:color .15s;
}
.fsbtn:hover{color:var(--dim)}
.fsbtn.on{color:var(--dim)}

/* fullscreen deck: single tile, no entrance stagger (FLIP drives the motion) */
.fsdeck .tile{animation:none}
.tile.fs{flex:1}
.tile.fs .corner{opacity:0}

/* overflow:hidden clips the control-strip curve to this tile — without it the
   curve is drawn wider than the tile and bleeds over the neighbouring feed.
   z-index lifts the video above the fixed scanline/grain overlays so the
   stream itself stays clean; the texture still sits over the surrounding UI */
.tile-body{flex:1;position:relative;z-index:50;min-height:0;background:#000;overflow:hidden}
.tile-body .mount{position:absolute;inset:0}
.tile-body .mount iframe{width:100%;height:100%;border:0;display:block}

/* hover-capture overlay — iframes swallow mouse events.
   upper 90% = click to lock/unlock; bottom 10% = drop the shield so the
   native player controls underneath become clickable */
.shield{position:absolute;inset:0 0 10% 0;z-index:5;cursor:pointer}
.shield-ctl{position:absolute;left:0;right:0;bottom:0;height:10%;z-index:5;cursor:pointer}

/* hovering the control strip surfaces a curved shelf + hairline, hinting
   that the player's own controls live underneath */
.shield-ctl::before{
  content:'';position:absolute;left:-8%;right:-8%;bottom:0;height:230%;
  border-radius:50% 50% 0 0 / 30px 30px 0 0;
  background:
    linear-gradient(180deg, transparent 30%, #ffb52e1f 62%, #ffb52e2e),
    linear-gradient(180deg, transparent 22%, #000000c4 60%, #000000e8);
  border-top:1px solid #ffb52e5c;
  backdrop-filter:blur(2px);
  opacity:0;transform:translateY(72%);
  transition:opacity .26s ease, transform .4s cubic-bezier(.22,.9,.28,1);
  pointer-events:none;
}
.shield-ctl:hover::before{opacity:1;transform:translateY(50%)}
.tile.locked{border-color:var(--green);box-shadow:0 0 0 1px #58e07c55, 0 0 34px #58e07c1f}
.tile.locked .tile-name{color:var(--green)}
.tile.locked .corner{opacity:1;border-color:var(--green)}
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
  text-transform:uppercase;color:var(--amber);white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;animation:whoIn .22s cubic-bezier(.22,.9,.28,1) both}
@keyframes whoIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:none}}
.chat-hd .popout{margin-left:auto;font-size:9px;letter-spacing:.16em;color:var(--faint);
  text-decoration:none;border:1px solid var(--line);padding:3px 7px;white-space:nowrap;
  transition:all .15s}
.chat-hd .popout:hover{color:var(--amber);border-color:var(--amber)}

/* ---------- twitch chat — matched to twitch's own chat rendering ----------
   twitch: Inter 13px / 20px line-height, 5px 20px row padding, #18181b bg,
   #efeff1 text, 28px emotes, ~150-message scrollback */
.stchat{display:flex;flex-direction:column;background:#18181b}
.stchat .msgs{
  flex:1;overflow-y:auto;overflow-x:hidden;padding:10px 0;
  font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;
  font-size:13px;line-height:20px;color:#efeff1;
  scrollbar-width:thin;scrollbar-color:#3f3f46 transparent;
}
.stchat .msgs::-webkit-scrollbar{width:8px}
.stchat .msgs::-webkit-scrollbar-thumb{background:#3f3f46;border-radius:4px}
.msg{position:relative;padding:5px 20px;overflow-wrap:anywhere;word-break:break-word}
.msg:hover{background:#1f1f23}

.reply-ctx{
  font-size:11px;line-height:16px;color:#adadb8;margin-bottom:1px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.reply-ctx b{font-weight:600;color:#adadb8}

/* copy / reply, revealed on message hover (twitch puts them here too) */
.msg-acts{
  position:absolute;top:2px;right:8px;display:none;gap:2px;z-index:2;
  background:#18181bf2;border:1px solid #3f3f46;border-radius:4px;padding:2px;
}
.msg:hover .msg-acts{display:flex}
.msg-acts button{
  display:flex;align-items:center;justify-content:center;
  width:22px;height:22px;padding:0;border:none;border-radius:3px;cursor:pointer;
  background:transparent;color:#adadb8;transition:background .1s, color .1s;
}
.msg-acts button:hover{background:#3f3f46;color:#efeff1}

.copied{
  position:absolute;left:50%;bottom:58px;transform:translateX(-50%);z-index:30;
  background:#efeff1;color:#18181b;font-family:Inter,sans-serif;font-size:11px;
  font-weight:600;padding:5px 10px;border-radius:4px;pointer-events:none;
  animation:tileIn .12s ease both;
}

.replybar{
  position:absolute;left:0;right:0;bottom:100%;display:flex;align-items:center;gap:8px;
  padding:6px 10px;background:#1f1f23;border-top:1px solid #3f3f46;
  font-family:Inter,sans-serif;font-size:12px;color:#adadb8;
}
.rb-txt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rb-txt b{color:#efeff1;font-weight:600}
.rb-x{
  flex:none;background:transparent;border:none;color:#adadb8;cursor:pointer;
  font-size:12px;padding:2px 4px;line-height:1;border-radius:3px;
}
.rb-x:hover{background:#3f3f46;color:#efeff1}
.msg .nick{font-weight:700}
.msg .sep{color:#efeff1}
.msg .txt{color:#efeff1}
.msg .txt.action{font-style:italic}
.msg .badge{
  display:inline-block;font-size:9px;font-weight:600;line-height:14px;
  height:16px;min-width:16px;padding:0 3px;margin-right:4px;text-align:center;
  border-radius:2px;vertical-align:-3px;color:#fff;border:none;
}
.b-bc{background:#e91916} .b-mod{background:#00ad03}
.b-vip{background:#e005b9} .b-sub{background:#6441a5}
.emw{display:inline-block;position:relative;vertical-align:middle;margin:-5px 2px}
.emw img{height:28px;max-width:112px;object-fit:contain;vertical-align:middle;display:inline-block}
.emw img.zw{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}
.stchat .conn{
  flex:none;display:flex;align-items:center;gap:10px;padding:5px 10px;
  border-top:1px solid var(--line);background:var(--panel2);
  font-size:8px;letter-spacing:.2em;color:var(--faint);white-space:nowrap}
.stchat .conn .st-live{color:var(--green)}
.stchat .conn .st-sync{color:var(--amber)}
.stchat .conn .st-reconn{color:var(--red)}
.stchat .conn .stv{color:var(--dim);margin-left:auto}
.chat-body{flex:1;position:relative;min-height:0;overflow:hidden}
.chat-body iframe{width:100%;height:100%;border:0}

/* chats stay mounted (instant switch back, no IRC reconnect) — so the swap is
   a quick fade+swipe rather than a remount. visibility is delayed off the
   outgoing pane so it can finish fading before it stops painting. */
.chatpane{
  position:absolute;inset:0;
  opacity:0;visibility:hidden;transform:translateX(14px);
  transition:opacity .14s ease, transform .2s cubic-bezier(.22,.9,.28,1),
    visibility 0s linear .2s;
}
.chatpane.on{
  opacity:1;visibility:visible;transform:none;
  transition:opacity .16s ease, transform .22s cubic-bezier(.22,.9,.28,1),
    visibility 0s;
}

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
.empty .tag{font-size:10px;letter-spacing:.5em;color:var(--faint);margin:14px 0 36px}
.chips{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.chips button{
  background:transparent;border:1px solid var(--line);color:var(--dim);
  font-family:var(--mono);font-size:10px;letter-spacing:.1em;padding:7px 14px;
  cursor:pointer;transition:all .15s;
}
.chips button:hover{border-color:var(--amber);color:var(--amber);background:#ffb52e0d}

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
function TwitchMount({ id, onApi, onLive }) {
  const ref = useRef(null)
  useEffect(() => {
    let dead = false
    let poll = null
    const el = ref.current
    loadTwitch().then(() => {
      if (dead || !el) return
      const P = window.Twitch.Player
      const player = new P(el, {
        channel: id, width: '100%', height: '100%',
        parent: [window.location.hostname], autoplay: true, muted: true,
      })
      player.addEventListener(P.READY, () => {
        if (dead) return
        onApi({
          setVol: v => player.setVolume(v),
          setMuted: m => player.setMuted(m),
        })
      })
      /* Eligible for activation once it has actually started playing. Gates
         the LOADING window only — mid-stream buffering or a deliberate pause
         must NOT drop it back out, or a hiccup would yank away the audio and
         chat. Only offline/ended makes a feed ineligible again.
         Events alone are unreliable here (constants vary by embed version), so
         poll the player for real playback progress as the source of truth. */
      const up = () => { if (!dead) onLive(true) }
      const down = () => { if (!dead) onLive(false) }
      const on = (evt, fn) => { if (evt) { try { player.addEventListener(evt, fn) } catch { /* unsupported */ } } }
      on(P.PLAY, up)
      on(P.PLAYING, up)
      on(P.ONLINE, up)
      on(P.OFFLINE, down)
      on(P.ENDED, down)

      let last = -1
      poll = setInterval(() => {
        if (dead) return
        try {
          const t = player.getCurrentTime()
          /* the clock advancing is the only unambiguous "it is playing" signal */
          if (typeof t === 'number' && t > 0 && t !== last) { last = t; up() }
        } catch { /* player not ready yet */ }
      }, 500)
    })
    return () => {
      dead = true
      clearInterval(poll)
      onApi(null); onLive(false)
      if (el) el.innerHTML = ''
    }
  }, [id, onApi, onLive])
  return <div className="mount" ref={ref} />
}

function YouTubeMount({ id, onApi, onTitle, onLive }) {
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
          /* PLAYING(1) marks the end of loading. UNSTARTED(-1)/BUFFERING(3)
             mean it hasn't got there yet; ENDED(0) means there's nothing to
             play. A pause mid-video keeps it eligible. */
          onStateChange: e => {
            if (dead) return
            if (e.data === 1) onLive(true)
            else if (e.data === 0) onLive(false)
          },
          onError: () => { if (!dead) onLive(false) },
        },
      })
    })
    return () => {
      dead = true; onApi(null); onLive(false)
      try { if (player && player.destroy) player.destroy() } catch { /* already gone */ }
      if (el) el.innerHTML = ''
    }
  }, [id, onApi, onTitle, onLive])
  return <div className="mount" ref={ref} />
}

function KickMount({ id, onLive }) {
  /* kick exposes no player API, so there is no load/play signal to gate on —
     treat it as eligible once its iframe has loaded */
  return (
    <div className="mount">
      <iframe
        src={`https://player.kick.com/${id}?autoplay=true&muted=true`}
        allow="autoplay; fullscreen; encrypted-media"
        allowFullScreen
        title={`kick:${id}`}
        onLoad={() => onLive(true)}
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

/* ---------- emote index: 7tv + twitch natives + emoji ----------
   one Map<name, {url|char, zw, src}> feeding both message rendering and
   tab-completion. src labels the provider in the completion bubble. */

/* a compact emoji set keyed the way chat clients key them (:name:) */
const EMOJI = {
  smile: '😄', grin: '😁', joy: '😂', rofl: '🤣', sob: '😭', cry: '😢',
  heart: '❤️', fire: '🔥', skull: '💀', clown: '🤡', eyes: '👀', brain: '🧠',
  ok: '👌', pray: '🙏', clap: '👏', wave: '👋', muscle: '💪', point_up: '☝️',
  thumbsup: '👍', thumbsdown: '👎', poop: '💩', ghost: '👻', alien: '👽',
  robot: '🤖', cat: '🐱', dog: '🐶', monkey: '🐵', frog: '🐸', snake: '🐍',
  pizza: '🍕', burger: '🍔', beer: '🍺', coffee: '☕', cake: '🎂', popcorn: '🍿',
  rocket: '🚀', star: '⭐', sparkles: '✨', zap: '⚡', boom: '💥', tada: '🎉',
  trophy: '🏆', crown: '👑', money: '💰', gem: '💎', bulb: '💡', bell: '🔔',
  check: '✅', x: '❌', warning: '⚠️', question: '❓', exclamation: '❗',
  hundred: '💯', eggplant: '🍆', peach: '🍑', snowflake: '❄️', sun: '☀️',
  moon: '🌙', wave_hand: '🌊', sleep: '😴', thinking: '🤔', shrug: '🤷',
  facepalm: '🤦', sunglasses: '😎', wink: '😉', kiss: '😘', angry: '😠',
  rage: '😡', scream: '😱', nauseated: '🤢', sick: '🤒', party: '🥳',
  salute: '🫡', melting: '🫠', pleading: '🥺', cold: '🥶', hot: '🥵',
}

function emojiEntries() {
  return Object.entries(EMOJI).map(([name, char]) => [`:${name}:`, { char, src: 'emoji' }])
}

/* 7tv: global set + the channel's set (channel resolved by twitch user id) */
async function fetch7tv(channelId) {
  const out = []
  const add = list => {
    for (const e of list || []) {
      const base = e.data && e.data.host && e.data.host.url
      out.push([e.name, {
        url: base ? `https:${base}/2x.webp` : `https://cdn.7tv.app/emote/${e.id}/2x.webp`,
        zw: !!((e.flags & 1) || (e.data && e.data.flags & 256)),
        src: '7tv',
      }])
    }
  }
  try {
    const g = await (await fetch('https://7tv.io/v3/emote-sets/global')).json()
    add(g.emotes)
  } catch { /* no globals — chat still works */ }
  if (channelId) {
    try {
      const s = await (await fetch(`https://7tv.io/v3/users/twitch/${channelId}`)).json()
      add(s.emote_set && s.emote_set.emotes)
    } catch { /* channel has no 7tv set */ }
  }
  return out
}

/* twitch's own emotes via Helix — needs a user token, which we only have
   when logged in (and that's also the only time you can type, so it lines up).
   global + this channel's emotes + the ones the logged-in user owns. */
async function fetchTwitchEmotes(channelId, auth) {
  if (!auth) return []
  const head = { 'Client-Id': TWITCH_CLIENT_ID, Authorization: 'Bearer ' + auth.token }
  /* /chat/emotes/user is paginated — subs with many emotes come back in
     pages of 100, so a single call silently truncates the list */
  const get = async (url, paged = false) => {
    const out = []
    let cursor = ''
    try {
      do {
        const r = await fetch(url + (cursor ? '&after=' + cursor : ''), { headers: head })
        if (!r.ok) {
          console.warn('[streamseer] twitch emotes %s -> %s %s', url, r.status, await r.text())
          break
        }
        const d = await r.json()
        out.push(...(d.data || []))
        cursor = paged && d.pagination ? (d.pagination.cursor || '') : ''
      } while (cursor)
    } catch (e) { console.warn('[streamseer] twitch emotes failed', e) }
    return out
  }
  const canUserEmotes = !auth.scopes || auth.scopes.includes('user:read:emotes')
  const [glob, chan, mine] = await Promise.all([
    get('https://api.twitch.tv/helix/chat/emotes/global?'),
    channelId ? get('https://api.twitch.tv/helix/chat/emotes?broadcaster_id=' + channelId) : [],
    canUserEmotes ? get('https://api.twitch.tv/helix/chat/emotes/user?user_id=' + auth.userId, true) : [],
  ])
  /* the user-emotes endpoint returns no `images` block — build the CDN url
     from the id instead, or those emotes come back with an undefined src */
  const pick = e => (e.images && (e.images.url_2x || e.images.url_1x)) || TW_EMOTE_CDN(e.id)
  return [
    ...glob.map(e => [e.name, { url: pick(e), zw: false, src: 'twitch' }]),
    ...chan.map(e => [e.name, { url: pick(e), zw: false, src: 'channel' }]),
    ...mine.map(e => [e.name, { url: pick(e), zw: false, src: 'sub' }]),
  ]
}

async function resolveChannelId(channel) {
  try {
    const u = await (await fetch(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(channel)}`)).json()
    return (Array.isArray(u) && u[0] && u[0].id) || null
  } catch { return null }
}

/* rank completions: prefix matches first, then substring; shorter names win */
function completionsFor(word, index) {
  if (!word) return []
  const w = word.toLowerCase()
  const pre = []
  const sub = []
  for (const [name, e] of index) {
    const n = name.toLowerCase()
    if (n.startsWith(w)) pre.push([name, e])
    else if (w.length >= 2 && n.includes(w)) sub.push([name, e])
  }
  const bylen = (a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0])
  return [...pre.sort(bylen), ...sub.sort(bylen)].slice(0, 10)
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

/* memoised so a burst of new messages doesn't re-render the whole backlog —
   in a fast chat that re-render is what stops the pane keeping up with scroll */
const Msg = memo(function Msg({ msg, emoteMap, canReply, onCopy, onReply }) {
  const parent = msg.tags['reply-parent-display-name']
  return (
    <div className="msg">
      {parent && (
        <div className="reply-ctx" title={msg.tags['reply-parent-msg-body']}>
          ↩ Replying to <b>@{parent}</b>
        </div>
      )}
      <div className="msg-acts">
        <button type="button" title="Copy message" onClick={() => onCopy(msg)}>
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="4.5" y="4.5" width="8" height="8" rx="1" />
            <path d="M9.5 2.5h-7a1 1 0 0 0-1 1v7" />
          </svg>
        </button>
        {canReply && (
          <button type="button" title="Reply" onClick={() => onReply(msg)}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M5.5 2.5 1.5 6l4 3.5" />
              <path d="M1.5 6h6a5 5 0 0 1 5 5v.5" />
            </svg>
          </button>
        )}
      </div>
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
  )
})

function MsgBody({ text, emotesTag, emoteMap }) {
  const pieces = []
  for (const seg of segmentTwitchEmotes(text, emotesTag)) {
    if (seg.t === 'emote') {
      pieces.push({ url: TW_EMOTE_CDN(seg.id), name: seg.name, zw: false, overlays: [] })
    } else {
      for (const w of seg.s.split(/(\s+)/)) {
        if (!w) continue
        const e = /\S/.test(w) ? emoteMap.get(w) : null
        if (!e) { pieces.push(w); continue }
        if (e.char) { pieces.push(e.char); continue }   // emoji → plain glyph
        pieces.push({ url: e.url, name: w, zw: e.zw, overlays: [] })
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
const SCOPES = 'chat:read chat:edit user:read:emotes'

/* twitch matches this literally against the app's registered redirect urls —
   it must be byte-identical to one of them, trailing slash and all */
function redirectUri() {
  return window.location.origin + window.location.pathname.replace(/\/$/, '')
}

function beginLogin() {
  const state = Math.random().toString(36).slice(2)
  sessionStorage.setItem('streamseer:state', state)
  const p = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPES,
    state,
    /* re-prompt for consent — without this twitch silently reissues the
       previously-granted scope set, so newly-added scopes never take effect */
    force_verify: 'true',
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

/* Grab the oauth result from the URL at MODULE SCOPE — before React mounts.
   This is a one-shot read (it clears the hash and the state key), and under
   StrictMode the auth effect mounts twice; doing it inside the effect meant
   the first mount consumed the token and its teardown discarded it, leaving
   the second mount with an empty URL. Reading it once here is immune to that. */
const REDIRECT = (() => {
  if (typeof window === 'undefined') return null
  const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const err = frag.get('error') || query.get('error')
  const token = frag.get('access_token')
  if (!err && !token) return null

  history.replaceState(null, '', window.location.pathname)

  if (err) {
    const desc = frag.get('error_description') || query.get('error_description') || err
    return { err: desc.replace(/\+/g, ' ') }
  }
  const expected = sessionStorage.getItem('streamseer:state')
  sessionStorage.removeItem('streamseer:state')
  if (frag.get('state') !== expected) return { err: 'state mismatch — login blocked, try again' }
  return { token }
})()

/* verify the captured token and learn our login name */
async function consumeRedirect() {
  if (!REDIRECT) return null
  if (REDIRECT.err) return { err: REDIRECT.err }
  const ok = await validateToken(REDIRECT.token)
  return ok ? { ok } : { err: 'twitch rejected the token' }
}

async function validateToken(token) {
  try {
    const r = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: 'OAuth ' + token },
    })
    if (!r.ok) return null
    const d = await r.json()
    /* keep the granted scopes — twitch can hand back a token with FEWER
       scopes than requested (silent re-auth reuses a prior grant), and that
       silently disables the user's own emote list */
    return { token, login: d.login, userId: d.user_id, scopes: d.scopes || [] }
  } catch {
    return null
  }
}

function TwitchChat({ channel, visible, auth }) {
  const [msgs, setMsgs] = useState([])
  const [emoteMap, setEmoteMap] = useState(() => new Map())
  const [status, setStatus] = useState('sync')
  const [draft, setDraft] = useState('')
  const [sugg, setSugg] = useState(null)      // {items, idx, from, to} — tab-completion
  const [replyTo, setReplyTo] = useState(null) // {id, name, body} — native twitch reply
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef(null)
  const sockRef = useRef(null)
  const inputRef = useRef(null)
  const pinned = useRef(true)
  const nextId = useRef(0)
  const inbox = useRef([])        // messages awaiting the next flush
  const flushTimer = useRef(null)

  useEffect(() => {
    let dead = false
    ;(async () => {
      const id = await resolveChannelId(channel)
      if (dead) return
      const [stv, tw] = await Promise.all([fetch7tv(id), fetchTwitchEmotes(id, auth)])
      if (dead) return
      /* later entries win: channel/sub emotes override globals, 7tv overrides
         twitch on name clashes (matching what chat clients actually render) */
      setEmoteMap(new Map([...emojiEntries(), ...tw, ...stv]))
    })()
    return () => { dead = true }
  }, [channel, auth])

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
          inbox.current.push({ id: ++nextId.current, login: m[2], text, tags, action })
        }
        /* Flush on a timer instead of per-message. In a chat like caedrel's,
           committing every line re-renders and re-pins the scroll dozens of
           times a second and the pane can't keep up. One paint per FLUSH_MS
           with a memoised row keeps it glued to the bottom. */
        if (inbox.current.length && !flushTimer.current) {
          flushTimer.current = setTimeout(() => {
            flushTimer.current = null
            const batch = inbox.current
            inbox.current = []
            if (!batch.length) return
            setMsgs(prev => {
              const next = prev.length ? [...prev, ...batch] : batch
              return next.length > MAX_MSGS ? next.slice(-MAX_MSGS) : next
            })
          }, FLUSH_MS)
        }
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

  /* ---- tab-completion (chatterino / 7tv style) ----
     the word under the caret is the search term; Tab opens the bubble and
     cycles through matches, arrows move, Enter/Tab accept, Esc dismisses */
  const wordAtCaret = () => {
    const el = inputRef.current
    const caret = el ? el.selectionStart : draft.length
    const from = draft.lastIndexOf(' ', caret - 1) + 1
    return { word: draft.slice(from, caret), from, to: caret }
  }

  const accept = item => {
    const [name, e] = item
    const insert = e.char || name
    const next = draft.slice(0, sugg.from) + insert + ' ' + draft.slice(sugg.to)
    setDraft(next)
    setSugg(null)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) {
        const pos = sugg.from + insert.length + 1
        el.focus()
        el.setSelectionRange(pos, pos)
      }
    })
  }

  const onKeyDown = e => {
    if (e.key === 'Tab') {
      e.preventDefault()
      if (sugg && sugg.items.length) {
        // cycle: shift+tab walks backwards
        const step = e.shiftKey ? -1 : 1
        const idx = (sugg.idx + step + sugg.items.length) % sugg.items.length
        setSugg({ ...sugg, idx })
        return
      }
      const { word, from, to } = wordAtCaret()
      const items = completionsFor(word, emoteMap)
      if (items.length) setSugg({ items, idx: 0, from, to })
      return
    }
    if (!sugg) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setSugg({ ...sugg, idx: (sugg.idx + step + sugg.items.length) % sugg.items.length })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      accept(sugg.items[sugg.idx])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setSugg(null)
    }
  }

  /* keep the bubble in sync while typing continues after it opened */
  const onDraft = v => {
    setDraft(v)
    if (!sugg) return
    const el = inputRef.current
    const caret = el ? el.selectionStart : v.length
    const from = v.lastIndexOf(' ', caret - 1) + 1
    const word = v.slice(from, caret)
    const items = completionsFor(word, emoteMap)
    setSugg(items.length ? { items, idx: 0, from, to: caret } : null)
  }

  const onCopy = useCallback(msg => {
    navigator.clipboard.writeText(msg.text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }).catch(() => { /* clipboard blocked — nothing useful to do */ })
  }, [])

  const onReply = useCallback(msg => {
    setReplyTo({
      id: msg.tags.id,
      name: msg.tags['display-name'] || msg.login,
      body: msg.text,
    })
    inputRef.current?.focus()
  }, [])

  const send = e => {
    e.preventDefault()
    if (sugg) { accept(sugg.items[sugg.idx]); return }   // Enter accepts, doesn't send
    const text = draft.trim()
    const ws = sockRef.current
    if (!text || !auth || !ws || ws.readyState !== WebSocket.OPEN) return

    /* a real twitch reply is an IRCv3 tag on the PRIVMSG, not an @mention —
       this threads under the parent message in every twitch client */
    const tag = replyTo && replyTo.id ? `@reply-parent-msg-id=${replyTo.id} ` : ''
    ws.send(`${tag}PRIVMSG #${channel} :${text}`)

    /* twitch doesn't echo our own message back, so render it locally */
    const tags = { 'display-name': auth.login, badges: '', emotes: '' }
    if (replyTo && replyTo.id) {
      tags['reply-parent-display-name'] = replyTo.name
      tags['reply-parent-msg-body'] = replyTo.body
    }
    setMsgs(prev => [...prev, {
      id: ++nextId.current, login: auth.login, text, tags, action: false,
    }])
    pinned.current = true
    setReplyTo(null)
    setDraft('')
  }

  /* stay pinned to the newest message unless the user scrolled up.
     layout effect so the jump happens before paint — with useEffect a fast
     chat visibly shudders as each batch paints un-scrolled, then snaps. */
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && pinned.current && visible) el.scrollTop = el.scrollHeight
  }, [msgs, visible])

  useEffect(() => () => clearTimeout(flushTimer.current), [])

  return (
    <div className={'stchat chatpane' + (visible ? ' on' : '')}>
      <div
        className="msgs" ref={scrollRef}
        onScroll={e => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
        }}
      >
        {msgs.map(msg => (
          <Msg
            key={msg.id}
            msg={msg}
            emoteMap={emoteMap}
            canReply={!!auth && !!msg.tags.id}
            onCopy={onCopy}
            onReply={onReply}
          />
        ))}
      </div>
      {copied && <div className="copied">COPIED</div>}
      {auth && (
        <form className="composer" onSubmit={send}>
          {replyTo && (
            <div className="replybar">
              <span className="rb-txt">↩ Replying to <b>@{replyTo.name}</b></span>
              <button type="button" className="rb-x" onClick={() => setReplyTo(null)} title="Cancel reply">✕</button>
            </div>
          )}
          {sugg && (
            <div className="sugg">
              <div className="sugg-list">
                {sugg.items.map(([name, e], i) => (
                  <button
                    type="button"
                    key={name + i}
                    className={'sugg-row' + (i === sugg.idx ? ' on' : '')}
                    onMouseDown={ev => { ev.preventDefault(); accept([name, e]) }}
                    onMouseEnter={() => setSugg(s => ({ ...s, idx: i }))}
                  >
                    <span className="sugg-img">
                      {e.char ? <span className="sugg-emoji">{e.char}</span> : <img src={e.url} alt="" />}
                    </span>
                    <span className="sugg-name">{name}</span>
                    <span className={'sugg-src src-' + e.src}>{e.src}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <input
            ref={inputRef}
            value={draft}
            onChange={e => onDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => setSugg(null)}
            maxLength={480}
            placeholder="Send a message"
            spellCheck="false"
            autoComplete="off"
          />
          <button type="submit" disabled={!draft.trim()}>▶</button>
        </form>
      )}
      <div className="conn">
        <span className={'st-' + status}>
          {status === 'live' ? '● IRC LIVE' : status === 'sync' ? '◌ SYNCING' : '○ RECONNECTING'}
        </span>
        <span className="stv">7TV ×{emoteMap.size}</span>
      </div>
    </div>
  )
}

const PLAT_TAG = { twitch: 'TTV', youtube: 'YT', kick: 'KICK' }

/* ---------- tile ---------- */
function Tile({ stream, hovered, locked, interactive, vol, muted, index, hero, fullscreen,
  onEnter, onLeave, onLock, onControls, onVol, onKill, onApi, onTitle, onFullscreen, onLive, nodeRef }) {
  const shownPct = Math.round(vol * (hovered ? 150 : 100))
  const hasVolApi = stream.platform !== 'kick'
  const apiCb = useCallback(api => onApi(stream.key, api), [onApi, stream.key])
  const titleCb = useCallback(t => onTitle(stream.key, t), [onTitle, stream.key])
  const liveCb = useCallback(v => onLive(stream.key, v), [onLive, stream.key])

  return (
    <div
      ref={el => nodeRef(stream.key, el)}
      className={'tile' + (hovered ? ' hov' : '') + (locked ? ' locked' : '')
        + (hero ? ' hero' : '') + (fullscreen ? ' fs' : '')}
      style={fullscreen ? undefined : { animationDelay: `${index * 60}ms` }}
      onMouseEnter={() => onEnter(stream.key)}
      onMouseLeave={() => onLeave(stream.key)}
    >
      <div className="tile-top">
        <span className={`plat plat-${stream.platform}`}>{PLAT_TAG[stream.platform]}</span>
        <span className="tile-name" title={stream.label}>{stream.label}</span>
        <div className="tile-ctl">
          <button
            className={'fsbtn' + (fullscreen ? ' on' : '')}
            onClick={() => onFullscreen(stream.key)}
            title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen this feed'}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen this feed'}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
              {fullscreen ? (
                <g>
                  <path d="M6 1.5V6H1.5" /><path d="M8 12.5V8h4.5" />
                </g>
              ) : (
                <g>
                  <path d="M1.5 5V1.5H5" /><path d="M9 1.5h3.5V5" />
                  <path d="M12.5 9v3.5H9" /><path d="M5 12.5H1.5V9" />
                </g>
              )}
            </svg>
          </button>
          {hasVolApi ? (
            <>
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
        {stream.platform === 'twitch' && <TwitchMount id={stream.id} onApi={apiCb} onLive={liveCb} />}
        {stream.platform === 'youtube' && <YouTubeMount id={stream.id} onApi={apiCb} onTitle={titleCb} onLive={liveCb} />}
        {stream.platform === 'kick' && <KickMount id={stream.id} onLive={liveCb} />}
        <i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" />
        {!interactive && (
          <>
            <div className="shield" onClick={() => onLock(stream.key)} />
            <div className="shield-ctl" onClick={() => onControls(stream.key)} />
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
  const [fullscreen, setFullscreen] = useState(null)
  const [activeChat, setActiveChat] = useState(null)
  const [interactive, setInteractive] = useState(null)
  const [chatOpen, setChatOpen] = useState(true)
  const [input, setInput] = useState('')
  const [toast, setToast] = useState(null)
  const [auth, setAuth] = useState(loadAuth)
  const [, setApiTick] = useState(0)

  const apis = useRef(new Map())
  const chatLoaded = useRef(new Set())
  const tileEls = useRef(new Map())
  const flip = useRef(null)   // {key, rect} captured before a fullscreen toggle

  /* which feeds have actually started playing — a still-loading feed must
     never become active (no solo, no gain, no zoom, no chat takeover) */
  const [live, setLive] = useState({})
  const liveRef = useRef(live)
  liveRef.current = live

  const onLive = useCallback((key, v) => {
    setLive(prev => (prev[key] === v ? prev : { ...prev, [key]: v }))
    if (!v) {
      setHovered(h => (h === key ? null : h))
      setLocked(l => (l === key ? null : l))
    }
  }, [])

  /* fullscreen is an explicit click, so it wins; hover/lock only count for a
     feed that is up and playing */
  const eligible = key => !!key && live[key] === true
  const active = fullscreen || (eligible(locked) ? locked : null) || (eligible(hovered) ? hovered : null)

  const nodeRef = useCallback((key, el) => {
    if (el) tileEls.current.set(key, el)
    else tileEls.current.delete(key)
  }, [])

  const onFullscreen = useCallback(key => {
    const el = tileEls.current.get(key)
    flip.current = { key, rect: el ? el.getBoundingClientRect() : null }
    setFullscreen(f => (f === key ? null : key))
    setActiveChat(key)
    chatLoaded.current.add(key)
  }, [])

  /* FLIP: the tile is measured before the layout change, then inverted and
     released, so it visibly expands from where it sat into the full frame
     (and collapses back). Cheaper and smoother than animating width/height. */
  useLayoutEffect(() => {
    const f = flip.current
    flip.current = null
    if (!f || !f.rect) return
    const el = tileEls.current.get(f.key)
    if (!el) return
    const to = el.getBoundingClientRect()
    if (!to.width || !to.height) return
    const dx = f.rect.left - to.left
    const dy = f.rect.top - to.top
    const sx = f.rect.width / to.width
    const sy = f.rect.height / to.height
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01) return

    el.style.transition = 'none'
    el.style.transformOrigin = 'top left'
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
    el.getBoundingClientRect()   // flush the inverted position before releasing
    requestAnimationFrame(() => {
      el.style.transition = 'transform .44s cubic-bezier(.22,.9,.28,1)'
      el.style.transform = 'none'
      const done = () => {
        el.style.transition = ''
        el.style.transform = ''
        el.style.transformOrigin = ''
        el.removeEventListener('transitionend', done)
      }
      el.addEventListener('transitionend', done)
    })
  }, [fullscreen])

  /* esc leaves fullscreen */
  useEffect(() => {
    if (!fullscreen) return
    const onKey = e => { if (e.key === 'Escape') onFullscreen(fullscreen) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, onFullscreen])

  /* toast helper — declared before the effects below that depend on it */
  const toastTimer = useRef(null)
  const say = useCallback((msg, ms = 2600) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), ms)
  }, [])

  /* persist */
  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ streams, vols, muted }))
  }, [streams, vols, muted])

  /* auth: absorb the oauth redirect, then keep the stored token verified.
     twitch tokens expire (~60d) and can be revoked — drop a dead one. */
  useEffect(() => {
    let dead = false
    ;(async () => {
      const res = await consumeRedirect()
      if (dead) return
      if (res && res.err) {
        say('TWITCH LOGIN FAILED — ' + res.err.toUpperCase(), 8000)
        return
      }
      if (res && res.ok) {
        setAuth(res.ok)
        localStorage.setItem(AUTH_KEY, JSON.stringify(res.ok))
        say('CONNECTED AS ' + res.ok.login.toUpperCase())
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

  /* first click arms, second confirms — disarms on blur or after 4s so a
     stray click can't leave it primed */
  const [armed, setArmed] = useState(false)
  const armTimer = useRef(null)
  useEffect(() => () => clearTimeout(armTimer.current), [])

  const logout = useCallback(() => {
    if (!armed) {
      setArmed(true)
      clearTimeout(armTimer.current)
      armTimer.current = setTimeout(() => setArmed(false), 4000)
      return
    }
    clearTimeout(armTimer.current)
    setArmed(false)
    setAuth(null)
    localStorage.removeItem(AUTH_KEY)
    say('DISCONNECTED FROM TWITCH')
  }, [armed, say])

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
    setFullscreen(f => (f === key ? null : f))
    setStreams(prev => prev.filter(s => s.key !== key))
    setVols(prev => { const n = { ...prev }; delete n[key]; return n })
    setMuted(prev => { const n = { ...prev }; delete n[key]; return n })
    setLive(prev => { const n = { ...prev }; delete n[key]; return n })
    apis.current.delete(key)
    chatLoaded.current.delete(key)
    setHovered(h => (h === key ? null : h))
    setLocked(l => (l === key ? null : l))
    setActiveChat(c => (c === key ? null : c))
    setInteractive(i => (i === key ? null : i))
  }, [])

  const onEnter = useCallback(key => {
    /* a feed that hasn't started playing yet is not activatable at all */
    if (liveRef.current[key] !== true) return
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
    if (liveRef.current[key] !== true) return
    setLocked(l => {
      const next = l === key ? null : key
      if (next) { setActiveChat(next); chatLoaded.current.add(next) }
      return next
    })
  }, [])
  const onControls = useCallback(key => setInteractive(key), [])
  const onVol = useCallback((key, v) => setVols(prev => ({ ...prev, [key]: v })), [])

  /* build the wall */
  const n = streams.length
  const chatStream = streams.find(s => s.key === activeChat)
  const chatFeeds = streams.filter(s => chatLoaded.current.has(s.key))

  const tileProps = (s, i, hero = false) => ({
    stream: s, index: i, hero,
    hovered: active === s.key,
    locked: locked === s.key,
    interactive: interactive === s.key,
    fullscreen: fullscreen === s.key,
    vol: vols[s.key] ?? DEFAULT_VOL,
    muted: muted[s.key] === true,
    onEnter, onLeave, onLock, onControls, onVol, onKill, onApi, onTitle, onFullscreen, onLive, nodeRef,
  })

  const fsStream = fullscreen && streams.find(s => s.key === fullscreen)

  let wall
  if (fsStream) {
    /* only the fullscreened feed is mounted — the rest are torn down, which
       stops their players outright rather than merely muting them */
    wall = (
      <div className="deck fsdeck">
        <div className="deckrow">
          <Tile key={fsStream.key} {...tileProps(fsStream, 0)} />
        </div>
      </div>
    )
  } else if (n === 0) {
    wall = (
      <div className="empty">
        <div className="mark">STREAM<em>SEER</em></div>
        <div className="tag">MULTIVIEW · CONSOLE</div>
        {/* no instructions here — the input and the chips are the affordance */}
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
            placeholder="twitch.tv/…   youtube.com/watch?v=…   kick.com/…"
            spellCheck="false"
          />
          <button type="submit">+ ADD</button>
        </form>
        <div className="hd-right">
          <span className="feedcount"><b>{String(n).padStart(2, '0')}</b>/{MAX_FEEDS}</span>
          {TWITCH_CLIENT_ID && (auth ? (
            <button
              className={'authbtn on' + (armed ? ' armed' : '')}
              onClick={logout}
              onBlur={() => setArmed(false)}
              title={armed ? 'Click again to disconnect' : 'Disconnect from Twitch'}
            >
              {armed
                ? <>LOG OUT?</>
                : <><i className="av" />{auth.login}</>}
            </button>
          ) : (
            <button className="authbtn" onClick={beginLogin} title="Sign in to send chat messages">
              CONNECT TWITCH
            </button>
          ))}
          <button
            className={'chatbtn' + (chatOpen ? ' on' : '')}
            onClick={() => setChatOpen(o => !o)}
            title={chatOpen ? 'Hide chat' : 'Show chat'}
            aria-label={chatOpen ? 'Hide chat' : 'Show chat'}
          >
            {/* arrow into a wall: |→ collapses the panel, ←| reopens it */}
            <svg width="20" height="12" viewBox="0 0 20 12" aria-hidden="true">
              {chatOpen ? (
                <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="square">
                  <path d="M2 1.5v9" />
                  <path d="M6 6h11" />
                  <path d="M13.5 2.5 17 6l-3.5 3.5" />
                </g>
              ) : (
                <g stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="square">
                  <path d="M18 1.5v9" />
                  <path d="M14 6H3" />
                  <path d="M6.5 2.5 3 6l3.5 3.5" />
                </g>
              )}
            </svg>
          </button>
        </div>
      </header>

      <main>
        {wall}
        {chatOpen && (
          <aside className="chatpanel">
            <div className="chat-hd">
              <span className="lbl">CHAT</span>
              {chatStream && <span className="who" key={chatStream.key}>{chatStream.label}</span>}
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
                  className={'chatpane' + (activeChat === s.key ? ' on' : '')}
                  src={chatUrl(s)}
                  title={`chat:${s.key}`}
                />
              ))}
              {/* no chat target yet — the panel stays empty, no instructions */}
            </div>
          </aside>
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
