// =====================================================
// © 2026 SamG° & Rowan Thistlebrooke — All Rights Reserved
//
// Personal & Educational Use Only.
// You may view and run this code locally for learning.
// You may NOT use this code or data in a commercial
// product, redistribute it, or republish it as your own.
//
// Unauthorized use may be subject to copyright enforcement.
// =====================================================

// =============================================================
// Living Interface Layer — sky engine + live strip + bottom nav
// Drop on any page with: <script src="topbar.js" defer></script>
// =============================================================
(function () {
  'use strict';
  if (window.self !== window.top) return;

  const STRIP_H = 44;
  const NAV_BOTTOM = 20; // px from viewport bottom

  // ─────────────────────── Local time helpers ────────────────────────
  function getLocalHour() {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false
      }).formatToParts(new Date());
      const h = parseInt(parts.find(p=>p.type==='hour').value);
      const m = parseInt(parts.find(p=>p.type==='minute').value);
      const s = parseInt(parts.find(p=>p.type==='second').value)||0;
      return (h===24?0:h)+m/60+s/3600;
    } catch(e) {
      const d=new Date(); return d.getHours()+d.getMinutes()/60+d.getSeconds()/3600;
    }
  }
  function getLocalDate() {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        year:'numeric',month:'numeric',day:'numeric'
      }).formatToParts(new Date());
      return {
        year: parseInt(parts.find(p=>p.type==='year').value),
        month: parseInt(parts.find(p=>p.type==='month').value),
        day: parseInt(parts.find(p=>p.type==='day').value)
      };
    } catch(e) {
      const d=new Date(); return {year:d.getFullYear(),month:d.getMonth()+1,day:d.getDate()};
    }
  }
  function getLocalSunTimes() {
    const {year,month,day}=getLocalDate();
    const lat = _latitude  !== null ? _latitude  : 40.0;
    const lon = _longitude !== null ? _longitude : -75.0;
    const doy=Math.floor((new Date(year,month-1,day)-new Date(year,0,0))/86400000);
    const D=doy+0.5;
    const g=(357.5291+0.98560028*D)*Math.PI/180;
    const q=280.459+0.98564736*D;
    const L=(q+1.9148*Math.sin(g)+0.02*Math.sin(2*g))*Math.PI/180;
    const e=23.4393*Math.PI/180;
    const sinDec=Math.sin(e)*Math.sin(L);
    const dec=Math.asin(sinDec);
    const cosH=(Math.sin(-0.8333*Math.PI/180)-Math.sin(lat*Math.PI/180)*sinDec)/(Math.cos(lat*Math.PI/180)*Math.cos(dec));
    if(cosH<=-1) return {rise:0,set:24};
    if(cosH>=1)  return {rise:12,set:12};
    const H=Math.acos(cosH)*180/Math.PI;
    const Eo=1440*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.04089*Math.sin(2*g));
    const EqT=Eo/3600;
    const noonUTC=12-lon/15-EqT;
    const utcOff = -(new Date().getTimezoneOffset() / 60);
    return {rise:noonUTC-H/15+utcOff, set:noonUTC+H/15+utcOff};
  }
  // Map local time to SKY_STOPS coordinate (where 6=sunrise, 18=sunset)
  function _pHrToStop(phr,sun) {
    const {rise,set}=sun;
    if(phr<=rise) return phr*6/Math.max(rise,0.5);
    if(phr>=set)  return 18+(phr-set)*6/Math.max(24-set,0.5);
    return 6+(phr-rise)/Math.max(set-rise,1)*12;
  }
  // Format local clock time
  function fmtLocalClock() {
    try {
      return new Intl.DateTimeFormat('en-US',{
        hour:'numeric',minute:'2-digit',hour12:true
      }).format(new Date());
    } catch(e) {
      const d=new Date(); let h=d.getHours(); const m=String(d.getMinutes()).padStart(2,'0'),ap=h>=12?'PM':'AM'; h=h%12||12; return h+':'+m+' '+ap;
    }
  }

  // ─────────────────────────── CSS ────────────────────────────
  const css = `
/* Stable frosted-glass vars — defaults overridden by updateSky() */
:root {
  --nav-bg:               rgba(15,15,18,0.78);
  --strip-bg:             rgba(15,15,18,0.58);
  --strip-blur:           blur(26px) saturate(1.35);
  --strip-border-color:   rgba(255,255,255,.06);
  --strip-track-bg:       rgba(128,128,128,.13);
  --strip-ctrl-color:     rgba(255,255,255,.60);
  --strip-ctrl-hover-bg:  rgba(255,255,255,.12);
  --strip-ctrl-hover-cl:  #fff;
  --font-body: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --fw-body:  500;
  --fw-label: 700;
  --fw-heading: 800;
}

/* Sky overlay */
#topbar-sky {
  position: fixed; inset: 0; z-index: -1; pointer-events: none;
  filter: blur(60px);
  will-change: transform;
  animation: sky-drift 90s alternate infinite ease-in-out;
  transition: opacity 0.8s ease;
}
@keyframes sky-drift {
  0%   { transform: translate(0,0) scale(1); }
  25%  { transform: translate(14px,-10px) scale(1.03); }
  50%  { transform: translate(-8px,8px) scale(1.02); }
  75%  { transform: translate(18px,-5px) scale(1.04); }
  100% { transform: translate(-4px,-16px) scale(1.05); }
}

body {
  background: #050506;
  background-attachment: fixed;
  transition: color 6s ease;
  font-family: var(--font-body);
  font-weight: var(--fw-body);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  padding-bottom: 180px;
  padding-top: 64px;
}

/* ── Bottom fog — atmospheric diffusion system ──
   Multi-layer radial ellipses originating BELOW the viewport.
   Source is hidden; effect rises upward and fades non-linearly.
   DO NOT replace with a flat linear-gradient.                    ── */
#bottom-fog {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 38vh;
  min-height: 210px;
  max-height: 360px;
  pointer-events: none;
  z-index: 39;
  background:
    /* L1 — Left side column. Tall ellipse at bottom-left corner.
       Reaches element top at left edge; fades out before center. */
    radial-gradient(ellipse 68% 115% at 2% 106%,
      var(--fog-bloom,     rgba(5,5,6,0.54)) 0%,
      var(--fog-bloom-mid, rgba(5,5,6,0.18)) 42%,
      transparent 62%),
    /* L2 — Right side column (mirror of L1) */
    radial-gradient(ellipse 68% 115% at 98% 106%,
      var(--fog-bloom2,    rgba(5,5,6,0.54)) 0%,
      var(--fog-bloom-mid, rgba(5,5,6,0.18)) 42%,
      transparent 62%),
    /* L3 — Low center bridge. Short — fills bottom gap without raising center. */
    radial-gradient(ellipse 75% 48% at 50% 120%,
      var(--fog-tint,      rgba(5,5,6,0.22)) 0%,
      transparent 58%),
    /* L4 — Hard anchor at very bottom edge only */
    linear-gradient(to top,
      var(--fog-edge,     rgba(5,5,6,0.75)) 0%,
      var(--fog-edge-mid, rgba(5,5,6,0.22)) 15%,
      transparent 30%);
  transition: background 8s ease;
}

/* ── Fog theme: color vars only. Shape is separate (fshape-* classes). ── */
body.ftheme-light {
  --fog-bloom:     rgba(248,252,255,0.78);
  --fog-bloom-mid: rgba(248,252,255,0.24);
  --fog-bloom2:    rgba(248,252,255,0.78);
  --fog-tint:      rgba(235,245,255,0.28);
  --fog-edge:      rgba(245,250,255,0.90);
  --fog-edge-mid:  rgba(245,250,255,0.30);
}
body.ftheme-dark {
  --fog-bloom:     rgba(0,0,0,0.86);
  --fog-bloom-mid: rgba(0,0,0,0.30);
  --fog-bloom2:    rgba(0,0,0,0.86);
  --fog-tint:      rgba(0,0,0,0.28);
  --fog-edge:      rgba(0,0,0,0.96);
  --fog-edge-mid:  rgba(0,0,0,0.42);
}
/* ── Fog shape overrides (body.fshape-* set by JS). Default = sides. ── */
/* Center high, sides low */
body.fshape-center #bottom-fog {
  background:
    radial-gradient(ellipse 68% 115% at 50% 106%,
      var(--fog-bloom,     rgba(5,5,6,0.54)) 0%,
      var(--fog-bloom-mid, rgba(5,5,6,0.18)) 42%,
      transparent 62%),
    radial-gradient(ellipse 65% 50% at 12% 120%,
      var(--fog-tint,      rgba(5,5,6,0.22)) 0%,
      transparent 58%),
    radial-gradient(ellipse 65% 50% at 88% 120%,
      var(--fog-tint,      rgba(5,5,6,0.22)) 0%,
      transparent 58%),
    linear-gradient(to top,
      var(--fog-edge,     rgba(5,5,6,0.75)) 0%,
      var(--fog-edge-mid, rgba(5,5,6,0.22)) 15%,
      transparent 30%);
}
/* Linear: flat horizontal band */
body.fshape-linear #bottom-fog {
  background:
    radial-gradient(ellipse 520% 32% at 50% 138%,
      var(--fog-bloom,     rgba(5,5,6,0.46)) 0%,
      var(--fog-bloom-mid, rgba(5,5,6,0.14)) 50%,
      transparent 68%),
    radial-gradient(ellipse 720% 22% at 50% 130%,
      var(--fog-bloom2,    rgba(5,5,6,0.26)) 0%,
      transparent 58%),
    linear-gradient(to top,
      var(--fog-edge,     rgba(5,5,6,0.75)) 0%,
      var(--fog-edge-mid, rgba(5,5,6,0.22)) 15%,
      transparent 30%);
}
/* Waves: 200%-wide element scrolls seamlessly via translateX — 4 crest/trough pairs */
body.fshape-waves #bottom-fog {
  right: auto;
  width: 200%;
  will-change: transform;
  animation: fog-wave-scroll 22s linear infinite;
  background:
    radial-gradient(ellipse 14% 72% at  12.5%  94%, var(--fog-bloom,      rgba(5,5,6,0.54)) 0%, var(--fog-bloom-mid, rgba(5,5,6,0.18)) 46%, transparent 66%),
    radial-gradient(ellipse 13% 44% at  25%   110%, var(--fog-tint,        rgba(5,5,6,0.24)) 0%, var(--fog-bloom-mid, rgba(5,5,6,0.08)) 44%, transparent 62%),
    radial-gradient(ellipse 14% 78% at  37.5%  92%, var(--fog-bloom2,      rgba(5,5,6,0.58)) 0%, var(--fog-bloom-mid, rgba(5,5,6,0.20)) 46%, transparent 68%),
    radial-gradient(ellipse 13% 44% at  50%   110%, var(--fog-tint,        rgba(5,5,6,0.24)) 0%, var(--fog-bloom-mid, rgba(5,5,6,0.08)) 44%, transparent 62%),
    radial-gradient(ellipse 14% 72% at  62.5%  94%, var(--fog-bloom,       rgba(5,5,6,0.54)) 0%, var(--fog-bloom-mid, rgba(5,5,6,0.18)) 46%, transparent 66%),
    radial-gradient(ellipse 13% 44% at  75%   110%, var(--fog-tint,        rgba(5,5,6,0.24)) 0%, var(--fog-bloom-mid, rgba(5,5,6,0.08)) 44%, transparent 62%),
    radial-gradient(ellipse 14% 78% at  87.5%  92%, var(--fog-bloom2,      rgba(5,5,6,0.58)) 0%, var(--fog-bloom-mid, rgba(5,5,6,0.20)) 46%, transparent 68%),
    radial-gradient(ellipse 13% 44% at 100%   110%, var(--fog-tint,        rgba(5,5,6,0.24)) 0%, var(--fog-bloom-mid, rgba(5,5,6,0.08)) 44%, transparent 62%),
    linear-gradient(to top,
      var(--fog-edge,      rgba(5,5,6,0.82)) 0%,
      var(--fog-edge-mid,  rgba(5,5,6,0.32)) 9%,
      var(--fog-bloom-mid, rgba(5,5,6,0.14)) 20%,
      transparent 36%);
}
@keyframes fog-wave-scroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}

/* ── Clear-mode blur layer ──
   z-index 38 = above widgets, below #bottom-fog (39).
   Backdrop-filter blurs everything beneath it including widgets — frosted glass effect.
   Mask creates "more blur at bottom, dissolves upward" effect.    ── */
#bottom-blur {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 38vh;
  min-height: 210px;
  max-height: 360px;
  pointer-events: none;
  z-index: 38;
  backdrop-filter: blur(30px) saturate(1.15);
  -webkit-backdrop-filter: blur(30px) saturate(1.15);
  -webkit-mask-image: linear-gradient(to top,
    black 0%, black 14%,
    rgba(0,0,0,0.82) 28%,
    rgba(0,0,0,0.44) 50%,
    rgba(0,0,0,0.12) 68%,
    transparent 82%);
  mask-image: linear-gradient(to top,
    black 0%, black 14%,
    rgba(0,0,0,0.82) 28%,
    rgba(0,0,0,0.44) 50%,
    rgba(0,0,0,0.12) 68%,
    transparent 82%);
  opacity: 0;
  transition: opacity 0.6s ease;
}
body.ftheme-clear #bottom-fog { background: transparent !important; }
body.ftheme-clear #bottom-blur { opacity: 1; }
/* Shape-aware masks for blur mode — mirrors the fog shape variants */
body.fshape-center #bottom-blur {
  -webkit-mask-image: radial-gradient(ellipse 70% 130% at 50% 110%,
    black 0%, black 28%,
    rgba(0,0,0,0.70) 50%,
    rgba(0,0,0,0.20) 70%,
    transparent 85%);
  mask-image: radial-gradient(ellipse 70% 130% at 50% 110%,
    black 0%, black 28%,
    rgba(0,0,0,0.70) 50%,
    rgba(0,0,0,0.20) 70%,
    transparent 85%);
}
body.fshape-linear #bottom-blur {
  -webkit-mask-image: linear-gradient(to top,
    black 0%, black 22%,
    rgba(0,0,0,0.78) 38%,
    rgba(0,0,0,0.38) 56%,
    rgba(0,0,0,0.08) 72%,
    transparent 84%);
  mask-image: linear-gradient(to top,
    black 0%, black 22%,
    rgba(0,0,0,0.78) 38%,
    rgba(0,0,0,0.38) 56%,
    rgba(0,0,0,0.08) 72%,
    transparent 84%);
}
/* ── Bottom halftone dot overlay ── */
#bottom-halftone {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: 340px;
  pointer-events: none;
  z-index: 40;
  background-image:
    radial-gradient(circle, var(--halftone-dot, rgba(255,255,255,0.11)) 2px, transparent 2px),
    radial-gradient(circle, var(--halftone-dot-sm, rgba(255,255,255,0.055)) 1px, transparent 1px);
  background-size: 14px 14px, 7px 7px;
  background-position: 0 0, 3.5px 3.5px;
  -webkit-mask-image: linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.50) 18%, rgba(0,0,0,0.24) 42%, rgba(0,0,0,0.08) 62%, transparent 80%);
  mask-image: linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.50) 18%, rgba(0,0,0,0.24) 42%, rgba(0,0,0,0.08) 62%, transparent 80%);
  opacity: 0;
  transition: opacity 0.8s ease;
}
#bottom-halftone.active { opacity: 1; }

/* ── Top Fog — atmospheric ceiling diffusion system ──
   Multi-layer radial ellipses originating ABOVE the viewport.
   Source is hidden above the screen edge; effect descends and fades rapidly.
   DO NOT replace with a flat linear-gradient.                    ── */
#top-fog {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 42vh;
  min-height: 200px;
  max-height: 380px;
  pointer-events: none;
  z-index: 2;
  background:
    radial-gradient(ellipse 200% 85% at 50% -8%,
      var(--top-fog-bloom,    rgba(10,18,52,0.32)) 0%,
      var(--top-fog-mid,      rgba(10,18,52,0.10)) 40%,
      transparent 62%),
    radial-gradient(ellipse 340% 52% at 50% -12%,
      var(--top-fog-tint,     rgba(10,18,52,0.16)) 0%,
      transparent 50%),
    linear-gradient(to bottom,
      var(--top-fog-edge,     rgba(4,5,12,0.40)) 0%,
      var(--top-fog-edge-mid, rgba(4,5,12,0.12)) 15%,
      transparent 32%);
  opacity: 0;
  transition: background 8s ease, opacity 0.6s ease;
}
body.topfog-on #top-fog { opacity: 1; }

/* ── Top fog theme overrides ── */
body.tftheme-light #top-fog {
  background:
    radial-gradient(ellipse 200% 85% at 50% -8%,
      rgba(255,248,228,0.24) 0%,
      rgba(255,248,228,0.07) 40%,
      transparent 62%),
    radial-gradient(ellipse 340% 52% at 50% -12%,
      rgba(255,248,228,0.13) 0%,
      transparent 50%),
    linear-gradient(to bottom,
      rgba(255,244,218,0.32) 0%,
      rgba(255,244,218,0.09) 15%,
      transparent 32%);
}
body.tftheme-dark #top-fog {
  background:
    radial-gradient(ellipse 200% 85% at 50% -8%,
      rgba(4,6,22,0.48) 0%,
      rgba(4,6,22,0.14) 40%,
      transparent 62%),
    radial-gradient(ellipse 340% 52% at 50% -12%,
      rgba(4,6,22,0.22) 0%,
      transparent 50%),
    linear-gradient(to bottom,
      rgba(2,4,18,0.54) 0%,
      rgba(2,4,18,0.14) 15%,
      transparent 32%);
}
body.topfog-on.tftheme-blur #top-fog { background: transparent !important; }

/* ── Top blur layer (shown in Blur mode, mirrors #bottom-blur) ── */
#top-blur {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 42vh;
  min-height: 200px;
  max-height: 380px;
  pointer-events: none;
  z-index: 1;
  backdrop-filter: blur(30px) saturate(1.15);
  -webkit-backdrop-filter: blur(30px) saturate(1.15);
  -webkit-mask-image: linear-gradient(to bottom,
    black 0%, black 14%,
    rgba(0,0,0,0.82) 28%,
    rgba(0,0,0,0.44) 50%,
    rgba(0,0,0,0.12) 68%,
    transparent 82%);
  mask-image: linear-gradient(to bottom,
    black 0%, black 14%,
    rgba(0,0,0,0.82) 28%,
    rgba(0,0,0,0.44) 50%,
    rgba(0,0,0,0.12) 68%,
    transparent 82%);
  opacity: 0;
  transition: opacity 0.6s ease;
}
body.topfog-on.tftheme-blur #top-blur { opacity: 1; }

/* ── Live info strip (fixed floating pill) ── */
#topbar-strip {
  position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
  z-index: 40; height: ${STRIP_H}px;
  max-width: 668px; width: calc(100vw - 24px);
  display: flex; align-items: stretch; overflow: hidden;
  backdrop-filter: var(--strip-blur, blur(36px) saturate(1.9));
  -webkit-backdrop-filter: var(--strip-blur, blur(36px) saturate(1.9));
  background: var(--strip-bg, rgba(15,15,18,0.74));
  border-radius: 14px;
  box-shadow:
    0 2px 16px rgba(0,0,0,.18),
    0 1px 4px  rgba(0,0,0,.10),
    inset 0 0 0 1px var(--strip-border-color, rgba(255,255,255,.06));
  transition: background 8s ease, box-shadow 8s ease;
  font-family: var(--font-body, -apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif);
}
#topbar-strip-inner { position: relative; width: 100%; height: 100%; }

/* Strip frame — two-row layout */
.strip-item {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; justify-content: center; gap: 4px;
  padding: 5px 76px 5px 20px;
  color: var(--text-primary,#FAFAFA);
  transform: translateY(${STRIP_H}px); opacity: 0; pointer-events: none;
  overflow: hidden;
}
.strip-item.strip-active {
  transform: translateY(0); opacity: 1;
  transition: transform .48s cubic-bezier(.22,1,.36,1), opacity .32s ease;
}
.strip-item.strip-leave {
  transform: translateY(-${STRIP_H}px); opacity: 0;
  transition: transform .42s cubic-bezier(.55,0,.55,1), opacity .28s ease;
}
.si-row {
  display: flex; align-items: center; gap: 7px;
  font-size: 11.5px; font-weight: 600; letter-spacing: .008em;
  font-family: var(--font-body, -apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif);
  white-space: nowrap; overflow: hidden;
}
.si-text { overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
.si-controls { display: flex; align-items: center; gap: 1px; flex-shrink: 0; margin-left: 4px; }
.si-ctrl {
  background: none; border: none; cursor: pointer; padding: 3px 5px;
  font-size: 11px; color: var(--strip-ctrl-color, rgba(255,255,255,.6)); border-radius: 5px;
  line-height: 1; transition: background .1s, color .1s;
}
.si-ctrl:hover { background: var(--strip-ctrl-hover-bg, rgba(255,255,255,.12)); color: var(--strip-ctrl-hover-cl, #fff); }
.si-art { width: 26px; height: 26px; border-radius: 5px; object-fit: cover; flex-shrink: 0; }
.strip-icon { font-size: 13px; flex-shrink: 0; }
.strip-label {
  font-size: 9px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
  color: var(--text-tertiary,rgba(255,255,255,.45)); flex-shrink: 0;
}
.strip-sep { color: var(--text-tertiary,rgba(255,255,255,.3)); flex-shrink: 0; font-size: 10px; }
.si-bar-track {
  position: relative; width: 100%; height: 7px; border-radius: 4px;
  background: var(--strip-track-bg, rgba(128,128,128,.13)); overflow: hidden; flex-shrink: 0;
}
.si-bar-fill {
  position: absolute; top: 0; left: 0; bottom: 0;
  width: 0; border-radius: 5px; overflow: hidden;
  background: var(--strip-accent,#6ee7b7);
  transition: width .65s cubic-bezier(.22,1,.36,1) .1s;
}
.si-bar-inner {
  position: absolute; top: 0; left: 0; bottom: 0;
  width: calc(100% * 100 / var(--fill,50));
  display: flex; align-items: center; justify-content: center;
  font-size: 7.5px; font-weight: 900; letter-spacing: .06em;
  color: var(--body-bg,#050506); white-space: nowrap;
}
.si-bar-outer {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 7.5px; font-weight: 900; letter-spacing: .06em;
  color: var(--text-tertiary,rgba(255,255,255,.35)); white-space: nowrap;
}

/* ── Floating pill navigation (bottom-center) ── */
.topbar {
  position: fixed;
  bottom: ${NAV_BOTTOM}px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 42;
  display: flex;
  padding: 6px 8px;
  border-radius: 22px;
  background: var(--nav-bg-dynamic, rgba(15,15,18,0.80));
  backdrop-filter: var(--strip-blur, blur(16px) saturate(1.5));
  -webkit-backdrop-filter: var(--strip-blur, blur(16px) saturate(1.5));
  box-shadow:
    0 16px 56px rgba(0,0,0,0.52),
    0 4px 16px rgba(0,0,0,0.34),
    inset 0 0 0 1px var(--nav-border-dynamic, rgba(255,255,255,0.07));
  font-family: var(--font-body, -apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif);
  max-width: calc(100vw - 32px);
  white-space: nowrap;
}
.topbar-main-row { display: flex; gap: 2px; }
/* ── Contextual subtab tray — independent fixed pill above nav ── */
#topbar-subtabs {
  display: none;
  position: fixed;
  bottom: calc(var(--nav-bar-h, 72px) + ${NAV_BOTTOM}px + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 41;
  gap: 3px;
  padding: 5px 8px;
  background: var(--nav-bg-dynamic, rgba(12,12,16,0.88));
  backdrop-filter: var(--strip-blur, blur(18px) saturate(1.7));
  -webkit-backdrop-filter: var(--strip-blur, blur(18px) saturate(1.7));
  border-radius: 16px;
  box-shadow: 0 6px 28px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.09), inset 0 0 0 1px var(--nav-border-dynamic, rgba(255,255,255,.07));
  white-space: nowrap;
  max-width: calc(100vw - 32px);
  overflow-x: auto;
  scrollbar-width: none;
}
#topbar-subtabs::-webkit-scrollbar { display: none; }
#topbar-subtabs.visible { display: flex; }
.tb-stab {
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: 10px;
  background: none;
  border: none;
  color: rgba(255,255,255,.38);
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  font-family: var(--font-body, -apple-system, sans-serif);
  transition: background .18s cubic-bezier(.22,1,.36,1), color .15s ease, box-shadow .18s ease;
  -webkit-tap-highlight-color: transparent;
  letter-spacing: .02em;
}
.tb-stab.active {
  background: rgba(255,255,255,.13);
  color: #FAFAFA;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.16),
    inset 0 0 0 1px rgba(255,255,255,.11),
    0 1px 6px rgba(0,0,0,.14);
}
.tb-stab:hover:not(.active) { background: rgba(255,255,255,.07); color: rgba(255,255,255,.65); }
.tb-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 16px;
  border-radius: 999px;
  text-decoration: none;
  color: rgba(255,255,255,0.35);
  position: relative;
  transition: background .22s ease, color .22s ease, box-shadow .22s ease;
  -webkit-tap-highlight-color: transparent;
  min-width: 56px;
}
.tb-item:hover  { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.65); }
.tb-item.active {
  background: rgba(255,255,255,0.12);
  color: #FAFAFA;
  backdrop-filter: blur(8px) saturate(1.2);
  -webkit-backdrop-filter: blur(8px) saturate(1.2);
  box-shadow:
    0 0 20px rgba(255,255,255,.10),
    inset 0 1px 0 rgba(255,255,255,.20),
    inset 0 0 0 1px rgba(255,255,255,.13);
}
.tb-item.warn   { color: #fbbf24; }
.tb-item.miss   { color: #ff8a8a; animation: tb-miss-glow 1.6s ease-in-out infinite; }
@keyframes tb-miss-glow {
  0%,100% { box-shadow: none; }
  50%     { box-shadow: 0 0 14px rgba(255,107,107,0.38); }
}
.tb-icon {
  font-size: 20px; line-height: 1; display: block;
}
.tb-icon-img {
  width: 22px; height: 22px; object-fit: contain; display: block;
  opacity: 0.35; transition: opacity .22s ease, filter .22s ease;
  filter: brightness(2);
}
.tb-item:hover .tb-icon-img { opacity: 0.65; }
.tb-item.active .tb-icon-img {
  opacity: 1;
  filter: brightness(2) drop-shadow(0 0 5px rgba(255,255,255,0.55));
}
.tb-lbl {
  font-size: 8.5px; font-weight: 700; letter-spacing: .07em;
  text-transform: uppercase; line-height: 1;
}
.tb-badge {
  position: absolute;
  top: 5px; right: 8px;
  font-family: ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  font-size: 7.5px; font-weight: 800; font-variant-numeric: tabular-nums;
  padding: 1px 4px; border-radius: 999px;
  min-width: 14px; text-align: center; line-height: 1.5;
  background: rgba(107,227,164,0.92); color: #050606;
  display: none;
}
.tb-badge.show { display: block; }
.tb-item.warn .tb-badge { background: rgba(251,191,36,0.92); }
.tb-item.miss .tb-badge { background: rgba(255,138,138,0.92); }

/* Dash-title inherits time-of-day text */
.dash-title {
  background: linear-gradient(155deg, var(--text-primary,#fff) 0%, var(--text-secondary,#aaa) 100%) !important;
  -webkit-background-clip: text !important; background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
}

/* Global utilities */
html,body { -webkit-text-size-adjust: 100%; }
@media (max-width: 768px) {
  html { touch-action: pan-y; }
  ::-webkit-scrollbar { width: 0; height: 0; display: none; }
  html,body { scrollbar-width: none; -ms-overflow-style: none; }
}
.modal-bg,.modal,.po-modal-bg,.po-modal,.wt-overlay,.wt-viewer { overscroll-behavior: contain; }
body.topbar-modal-open { overflow: hidden; touch-action: none; }
@media (max-width: 480px) {
  .modal-bg,.po-modal-bg { padding:0!important; align-items:stretch!important; justify-content:stretch!important; }
  .modal,.po-modal {
    width:100%!important; max-width:100%!important; max-height:100vh!important; height:100vh!important;
    border-radius:0!important;
    padding-top:max(20px,env(safe-area-inset-top))!important;
    padding-bottom:max(28px,env(safe-area-inset-bottom))!important;
    overflow-y:auto!important; overscroll-behavior:contain;
  }
}
@media (max-width: 420px) {
  .tb-item { padding: 8px 10px; min-width: 48px; }
  .tb-icon { font-size: 18px; }
  .tb-lbl  { font-size: 8px; }
}

/* ── Mobile: push nav above browser chrome ── */
@media (max-width: 768px) {
  /* Samsung Internet / Chrome show ~50-56px browser toolbar at the bottom.
     The layout viewport includes this area, but the visual viewport does not.
     Fixed elements at bottom: 20px end up BEHIND the browser toolbar.
     Adding ~60px clearance keeps the pill above the browser chrome. */
  .topbar {
    bottom: max(${NAV_BOTTOM + 60}px, calc(${NAV_BOTTOM}px + env(safe-area-inset-bottom, 60px)));
    left: 12px;
    right: 12px;
    transform: none;
    max-width: none;
  }
  .topbar-main-row { flex: 1; justify-content: space-around; gap: 0; }
  #topbar-subtabs {
    bottom: calc(var(--nav-bar-h, 72px) + ${NAV_BOTTOM + 60}px + 6px);
    left: 12px;
    right: 12px;
    transform: none;
    max-width: none;
  }
  #topbar-strip {
    width: calc(100vw - 24px);
    top: max(10px, env(safe-area-inset-top, 10px));
  }
  body { padding-bottom: 220px; }
}

/* ── Fixed full-viewport background (gradient coverage fix) ── */
#topbar-bg {
  position: fixed; inset: 0; z-index: -3; pointer-events: none;
  background: #050506;
}

/* ── Settings popup — toggle rows ── */
.tsp-toggle-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,.05);
  font-size: 12px; font-weight: 600; color: var(--text-secondary); cursor: pointer;
}
.tsp-toggle-row:last-child { border-bottom: none; }
.tsp-toggle {
  position: relative; width: 34px; height: 20px; flex-shrink: 0;
  background: rgba(255,255,255,.12); border-radius: 10px;
  transition: background .2s;
}
.tsp-toggle::after {
  content: ''; position: absolute; top: 3px; left: 3px;
  width: 14px; height: 14px; border-radius: 50%;
  background: #fff; transition: transform .2s;
}
.tsp-toggle.on { background: rgba(107,227,164,.65); }
.tsp-toggle.on::after { transform: translateX(14px); }
.tsp-input {
  width: 100%; padding: 8px 10px; margin-top: 6px;
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
  border-radius: 10px; color: var(--text-primary);
  font-size: 12px; font-family: var(--font-body); outline: none;
}
.tsp-input:focus { border-color: rgba(255,255,255,.25); }
.tsp-input::placeholder { color: rgba(255,255,255,.3); }
.tsp-spotify-status {
  font-size: 11px; color: var(--text-tertiary); padding: 5px 0 9px;
  display: flex; align-items: center; gap: 6px;
}
.tsp-spotify-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: rgba(255,255,255,.25); flex-shrink: 0;
}
.tsp-spotify-dot.connected { background: #1DB954; box-shadow: 0 0 6px rgba(29,185,84,.5); }
.tsp-redirect-box {
  display: flex; align-items: center; gap: 6px; margin-bottom: 8px;
  background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.08);
  border-radius: 8px; padding: 6px 8px;
}
.tsp-redirect-uri {
  flex: 1; font-family: var(--font-mono); font-size: 9.5px; color: rgba(255,255,255,.5);
  word-break: break-all; line-height: 1.4;
}
.tsp-copy-btn {
  flex-shrink: 0; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12);
  border-radius: 5px; padding: 3px 7px; font-size: 10px; font-weight: 700;
  color: var(--text-secondary); cursor: pointer; font-family: inherit; white-space: nowrap;
}
.tsp-copy-btn:hover { background: rgba(255,255,255,.14); }
/* ── Settings popup scrollable on small screens ── */
#topbar-settings-popup { max-height: calc(100vh - 80px); overflow-y: auto; }

/* ── Settings button (inside strip, right side) ── */
#topbar-settings-btn {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  background: none; border: none;
  color: var(--text-tertiary, rgba(255,255,255,.42));
  font-size: 15px; cursor: pointer; padding: 6px 8px;
  border-radius: 8px; z-index: 1; line-height: 1;
  transition: color .15s, background .15s;
  -webkit-tap-highlight-color: transparent;
}
#topbar-settings-btn:hover { color: var(--text-primary); background: rgba(255,255,255,.08); }
#topbar-settings-btn.open { color: var(--text-primary); background: rgba(255,255,255,.10); }
/* ── Focus / Status page button (strip, right side) ── */
#topbar-focus-btn {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  background: none; border: none;
  color: var(--text-tertiary, rgba(255,255,255,.38));
  font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
  cursor: pointer; padding: 5px 9px; border-radius: 7px; z-index: 1; line-height: 1;
  text-decoration: none; font-family: var(--font-body, -apple-system, sans-serif);
  transition: color .15s, background .15s;
  -webkit-tap-highlight-color: transparent;
  display: flex; align-items: center; gap: 4px;
}
#topbar-focus-btn:hover { color: rgba(255,255,255,.78); background: rgba(255,255,255,.08); }
#topbar-focus-btn.active { color: #6BE3A4; }

/* ── Settings popup ── */
#topbar-settings-popup {
  position: fixed; top: 62px; right: 12px; z-index: 50;
  background: rgba(14,14,18,0.97);
  backdrop-filter: blur(24px) saturate(1.6);
  -webkit-backdrop-filter: blur(24px) saturate(1.6);
  border-radius: 18px;
  box-shadow: 0 8px 44px rgba(0,0,0,.52), inset 0 0 0 1px rgba(255,255,255,.09);
  padding: 18px 16px; min-width: 256px;
  display: none;
  font-family: var(--font-body, -apple-system, sans-serif);
}
#topbar-settings-popup.open { display: block; }
.tsp-head {
  font-size: 9.5px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
  color: var(--text-tertiary, rgba(255,255,255,.4)); margin-bottom: 9px; margin-top: 12px;
}
.tsp-head:first-child { margin-top: 0; }
.tsp-row { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 4px; }
.tsp-btn {
  flex: 1; min-width: 52px; padding: 8px 10px; text-align: center;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
  border-radius: 10px; color: var(--text-tertiary, rgba(255,255,255,.4));
  font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
  font-family: var(--font-body, -apple-system, sans-serif); transition: all .15s;
}
.tsp-btn:hover { background: rgba(255,255,255,.09); color: var(--text-secondary); }
.tsp-btn.active { background: rgba(255,255,255,.14); color: var(--text-primary, #FAFAFA); border-color: rgba(255,255,255,.2); }
.tsp-ai-status {
  font-size: 11px; min-height: 14px; padding: 3px 0 6px;
  color: var(--text-tertiary, rgba(255,255,255,.4)); line-height: 1.4;
  transition: color .2s;
}
.tsp-divider { border: none; border-top: 1px solid rgba(255,255,255,.06); margin: 10px 0; }

/* ── Typography system ── */
html, body {
  font-family: var(--font-body);
  font-size: 14px;
  letter-spacing: -0.003em;
}

/* Headings */
.sec-hdr-title, .modal-title, .dash-title {
  font-family: var(--font-body);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.modal-title { font-size: 20px; }
.sec-hdr-title { font-size: 15px; }

/* Body text */
.goal-row-text, .routine-text {
  font-family: var(--font-body);
  font-weight: 600;
  line-height: 1.4;
}

/* Labels / metadata — smaller, reduced emphasis but crisp */
.m-label, .strip-label, .prog-label, .sched-tag,
.cat-bar-lbl, .streak-sub, .ring-mini-sub,
.goal-row-sub, .routine-sched {
  font-family: var(--font-body);
  font-weight: 700;
  letter-spacing: 0.06em;
}

/* Chips and interactive labels */
.cat-chip, .cat-sel-btn, .sched-pill, .tb-lbl {
  font-family: var(--font-body);
  font-weight: 700;
}

/* Progress bar text on bars */
.si-bar-inner, .si-bar-outer {
  font-family: var(--font-body);
  font-weight: 800;
  letter-spacing: 0.04em;
}

/* ── Contextual subtabs — segmented control inside page sections ── */
.ctx-subtabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 16px;
  margin: 12px 0 18px;
  backdrop-filter: blur(12px) saturate(1.3);
  -webkit-backdrop-filter: blur(12px) saturate(1.3);
}
.ctx-stab {
  flex: 1;
  padding: 9px 14px;
  border-radius: 12px;
  border: none;
  background: none;
  color: var(--text-tertiary, rgba(255,255,255,.4));
  font-family: var(--font-body, -apple-system, sans-serif);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background .22s cubic-bezier(.22,1,.36,1), color .18s ease, box-shadow .22s ease;
  white-space: nowrap;
  text-align: center;
  -webkit-tap-highlight-color: transparent;
  position: relative;
}
.ctx-stab.active {
  background: rgba(255,255,255,.11);
  color: var(--text-primary, #FAFAFA);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow:
    0 2px 10px rgba(0,0,0,.18),
    inset 0 1px 0 rgba(255,255,255,.14),
    inset 0 0 0 1px rgba(255,255,255,.09);
}
.ctx-stab:not(.active):hover {
  background: rgba(255,255,255,.06);
  color: var(--text-secondary, #B8B6B0);
}

/* ── Per-tab custom background layer ── */
#page-bg-layer {
  position: fixed; inset: 0; z-index: -2; pointer-events: none;
  opacity: 0; transition: opacity 1.2s ease;
}
/* Explicit stacking: topbar-bg(-3) → page-bg-layer(-2) → topbar-sky(-1) → content(0+) */
#page-bg-layer.active { opacity: 1; }
#page-bg-img {
  position: absolute; inset: 0;
  background-size: cover; background-position: center; background-repeat: no-repeat;
  transition: filter 1.4s ease;
}
#page-bg-glass {
  position: absolute; inset: 0;
  transition: background 1.4s ease;
}

/* Settings — background section */
.tsp-bg-preview {
  width: 100%; height: 68px; border-radius: 10px; overflow: hidden;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
  background-size: cover; background-position: center;
  margin-top: 6px; display: none;
  position: relative;
}
.tsp-bg-preview.has-img { display: block; }
.tsp-bg-preview-label {
  position: absolute; bottom: 5px; right: 7px;
  font-size: 8.5px; font-weight: 700; letter-spacing: .08em;
  color: rgba(255,255,255,.7); text-shadow: 0 1px 4px rgba(0,0,0,.7);
}
.ui-icon{display:inline-block;width:1em;height:1em;vertical-align:-0.15em;filter:brightness(0) invert(1);opacity:.9;flex-shrink:0;pointer-events:none}

/* ── Settings micro-tab — minimal half-pill protrusion, no text/icons ── */
.tb-settings-tab {
  width: 14px !important;
  min-width: 14px !important;
  padding: 0 !important;
  margin-left: 3px;
  align-self: stretch;
  border-radius: 2px 10px 10px 2px !important;
  background: rgba(255,255,255,.045) !important;
  border: none !important;
  box-shadow: inset -1px 0 0 rgba(255,255,255,.13) !important;
  transition: background .22s ease, box-shadow .22s ease !important;
  gap: 0 !important;
  flex-shrink: 0;
}
.tb-settings-tab .tb-lbl,
.tb-settings-tab .tb-icon,
.tb-settings-tab .tb-icon-img { display: none !important; }
.tb-settings-tab:hover {
  background: rgba(255,255,255,.09) !important;
  box-shadow: inset -1px 0 0 rgba(255,255,255,.22) !important;
}
.tb-settings-tab.active {
  background: rgba(255,255,255,.11) !important;
  box-shadow: inset -1px 0 0 rgba(255,255,255,.28), 0 0 12px rgba(255,255,255,.06) !important;
}

/* ── Settings popup — repositioned above nav bar ── */
#topbar-settings-popup {
  position: fixed !important;
  top: auto !important;
  right: auto !important;
  bottom: calc(var(--nav-bar-h, 72px) + 20px + 14px) !important;
  left: 50%;
  transform: translateX(-50%);
  width: min(320px, calc(100vw - 24px));
}

/* ── Collapsible settings groups ── */
.tsp-group { border-bottom: 1px solid rgba(255,255,255,.05); }
.tsp-group:last-child { border-bottom: none; }
.tsp-group-head {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  padding: 10px 2px; background: none; border: none; cursor: pointer;
  font-family: var(--font-body); font-size: 12px; font-weight: 700;
  color: var(--text-secondary, rgba(255,255,255,.6)); text-align: left;
  transition: color .15s;
  -webkit-tap-highlight-color: transparent;
}
.tsp-group-head:hover { color: var(--text-primary, #FAFAFA); }
.tsp-group-icon { font-size: 13px; margin-right: 7px; }
.tsp-group-arrow {
  font-size: 9px; color: var(--text-tertiary);
  transition: transform .22s cubic-bezier(.22,1,.36,1); flex-shrink: 0;
}
.tsp-group.open .tsp-group-arrow { transform: rotate(90deg); }
.tsp-group-body { display: none; padding: 6px 0 10px; }
.tsp-group.open .tsp-group-body { display: block; }

/* ── Theme mode indicator (dot badge on theme btn) ── */
.tsp-active-theme-dot {
  width: 5px; height: 5px; border-radius: 50%; background: #6BE3A4;
  display: inline-block; margin-left: 4px; vertical-align: middle;
  box-shadow: 0 0 5px rgba(107,227,164,.7);
}

/* ── Gemini wallpaper section ── */
.tsp-gemini-phases {
  display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin: 6px 0;
}
.tsp-phase-preview {
  height: 44px; border-radius: 8px; position: relative; overflow: hidden;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
  cursor: pointer; transition: border-color .15s;
}
.tsp-phase-preview.generated { border-color: rgba(107,227,164,.4); }
.tsp-phase-preview .ph-img {
  position: absolute; inset: 0; background-size: cover; background-position: center;
  opacity: .85;
}
.tsp-phase-preview .ph-label {
  position: absolute; bottom: 3px; left: 5px;
  font-size: 8px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;
  color: rgba(255,255,255,.9); text-shadow: 0 1px 3px rgba(0,0,0,.7);
}
.tsp-phase-preview .ph-status {
  position: absolute; top: 3px; right: 4px;
  font-size: 9px; color: rgba(255,255,255,.6);
}
.tsp-phase-preview.generated .ph-status { color: #6BE3A4; }

/* ── Instant theme apply — bypasses sky/color transitions for explicit user changes ── */
body.theme-instant,
body.theme-instant #topbar-sky,
body.theme-instant #topbar-bg,
body.theme-instant #page-bg-layer,
body.theme-instant #page-bg-img,
body.theme-instant #page-bg-glass,
body.theme-instant #bottom-fog,
body.theme-instant #top-fog,
body.theme-instant #top-blur {
  transition-duration: 0s !important;
}

/* ── Light theme overrides — ensure dark text on bright surfaces ── */
body.theme-light .widget-title,
body.theme-light .widget-action,
body.theme-light .tb-lbl { color: inherit; }

/* ── Performance mode — reduces GPU compositor load ── */
body.perf-reduced #topbar-sky {
  animation: none !important;
  filter: blur(30px) !important;
}
body.perf-reduced .topbar {
  backdrop-filter: blur(8px) saturate(1.2) !important;
  -webkit-backdrop-filter: blur(8px) saturate(1.2) !important;
}
body.perf-reduced #topbar-subtabs {
  backdrop-filter: blur(8px) saturate(1.2) !important;
  -webkit-backdrop-filter: blur(8px) saturate(1.2) !important;
}
body.perf-reduced #topbar-strip {
  backdrop-filter: blur(10px) saturate(1.1) !important;
  -webkit-backdrop-filter: blur(10px) saturate(1.1) !important;
}
body.perf-reduced .ctx-subtabs {
  backdrop-filter: blur(6px) !important;
  -webkit-backdrop-filter: blur(6px) !important;
}
body.perf-reduced #topbar-settings-popup {
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
}
body.perf-reduced #bottom-fog { opacity: 0.6 !important; }
body.perf-reduced #top-blur {
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
}

/* ── Settings panel style variants ── */
body.spanel-glass #topbar-settings-popup {
  background: rgba(20,20,30,0.42);
  backdrop-filter: blur(36px) saturate(1.9);
  -webkit-backdrop-filter: blur(36px) saturate(1.9);
  border-color: rgba(255,255,255,.16);
}
body.spanel-frosted #topbar-settings-popup {
  background: rgba(28,28,38,0.76);
  backdrop-filter: blur(52px) saturate(2.1);
  -webkit-backdrop-filter: blur(52px) saturate(2.1);
  border-color: rgba(255,255,255,.11);
}
body.spanel-solid #topbar-settings-popup {
  background: #0d0d14;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-color: rgba(255,255,255,.09);
}
body.spanel-dynamic #topbar-settings-popup {
  background: var(--nav-bg, rgba(15,15,18,0.78));
  backdrop-filter: var(--strip-blur, blur(26px) saturate(1.35));
  -webkit-backdrop-filter: var(--strip-blur, blur(26px) saturate(1.35));
  border-color: rgba(255,255,255,.10);
}
body.spanel-minimal #topbar-settings-popup {
  background: rgba(6,6,10,0.50);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-color: rgba(255,255,255,.04);
  box-shadow: 0 2px 14px rgba(0,0,0,.25);
}

/* ── No background mode ── */
body.bg-none { background-image: none !important; background-color: #050506 !important; }
body.bg-none #topbar-sky { display: none !important; }
body.bg-none #topbar-bg { background-image: none !important; background-color: #050506 !important; }
body.bg-none #bottom-fog { display: none !important; }
body.bg-none #top-fog    { display: none !important; }
body.bg-none #top-blur   { display: none !important; }
body.bg-none #page-bg-layer { display: none !important; }

/* ── Image background mode: suppress sky/bg overlay so image shows through ── */
body.bg-image-active #topbar-sky { opacity: 0 !important; animation-play-state: paused !important; }
body.bg-image-active #topbar-bg { opacity: 0 !important; }
/* bg-image-active + dynamic: use sky-computed vars, no override needed */

/* ── Widget theme overrides ──
   CSS vars are scoped to .widget subtrees so only widget children are affected —
   the top bar, strip, and fog remain untouched by widget theme changes.       ── */

/* Light: airy frosted glass — premium, atmospheric, restrained */
body.wtheme-light .hero,
body.wtheme-light .widget,
body.wtheme-light .goal-section-glass,
body.wtheme-light .ov-stat {
  /* Text colors — cascade to all children inside the widget */
  --text-primary:   #1F2A37;
  --text-secondary: #607089;
  --text-tertiary:  rgba(55,75,100,0.52);
  /* Inner nested-card vars (.hero-stat, .finance-stat, dividers, etc.) */
  --card-bg:        rgba(200,218,240,0.22);
  --card-border:    rgba(30,50,80,0.07);
  --card-bg-hover:  rgba(200,218,240,0.34);
  /* Surface */
  background:       rgba(232,241,252,0.64) !important;
  border-color:     rgba(255,255,255,0.42) !important;
  backdrop-filter:  blur(22px) saturate(1.55) !important;
  -webkit-backdrop-filter: blur(22px) saturate(1.55) !important;
  box-shadow:       0 4px 28px rgba(60,80,120,0.07),
                    inset 0 1px 0 rgba(255,255,255,0.52) !important;
}
/* Hero: restore dynamic border + inset glow overridden by shared rule above */
body.wtheme-light .hero {
  border-color: var(--hero-border-color, rgba(255,255,255,0.06)) !important;
  box-shadow:   0 4px 28px rgba(60,80,120,0.07),
                inset 0 0 72px var(--hero-inset-glow, transparent),
                inset 0 0 32px var(--hero-inset-glow-2, transparent) !important;
}
/* Spotify: dark visual anchor in light mode — stays charcoal */
body.wtheme-light #w-spotify {
  background:   transparent !important;
  border-color: transparent !important;
  box-shadow:   none !important;
}
body.wtheme-light #w-spotify .sp-np {
  background:       rgba(18,24,38,0.88) !important;
  --text-primary:   #E8EEF7;
  --text-secondary: #94A3B8;
  --text-tertiary:  rgba(148,163,184,0.55);
}

/* Dark: cinematic navy-charcoal glass */
body.wtheme-dark .hero,
body.wtheme-dark .widget,
body.wtheme-dark .goal-section-glass,
body.wtheme-dark .ov-stat {
  --text-primary:   #E8EEF7;
  --text-secondary: #94A3B8;
  --text-tertiary:  rgba(148,163,184,0.50);
  --card-bg:        rgba(22,31,45,0.48);
  --card-border:    rgba(255,255,255,0.055);
  --card-bg-hover:  rgba(22,31,45,0.65);
  background:       rgba(22,31,45,0.82) !important;
  border-color:     rgba(255,255,255,0.055) !important;
  backdrop-filter:  blur(30px) saturate(1.28) !important;
  -webkit-backdrop-filter: blur(30px) saturate(1.28) !important;
  box-shadow:       0 8px 40px rgba(0,0,0,0.35),
                    inset 0 1px 0 rgba(255,255,255,0.04) !important;
}

/* Hero dark: restore dynamic border + inset glow */
body.wtheme-dark .hero {
  border-color: var(--hero-border-color, rgba(255,255,255,0.06)) !important;
  box-shadow:   0 8px 40px rgba(0,0,0,0.35),
                inset 0 0 72px var(--hero-inset-glow, transparent),
                inset 0 0 32px var(--hero-inset-glow-2, transparent) !important;
}
/* Clear: minimal, wallpaper breathes through */
body.wtheme-clear .widget,
body.wtheme-clear .goal-section-glass,
body.wtheme-clear .ov-stat {
  background:   rgba(255,255,255,.04) !important;
  border-color: rgba(255,255,255,.07) !important;
  backdrop-filter:  blur(20px) saturate(1.1) !important;
  -webkit-backdrop-filter: blur(20px) saturate(1.1) !important;
}
/* ── Tab bar theme overrides ── */
body.nbtheme-light .topbar {
  background: rgba(240,246,255,0.78) !important;
  backdrop-filter: blur(28px) saturate(1.7) !important;
  -webkit-backdrop-filter: blur(28px) saturate(1.7) !important;
  box-shadow: 0 16px 56px rgba(0,0,0,.10), 0 4px 12px rgba(0,0,0,.08),
    inset 0 0 0 1px rgba(255,255,255,.60) !important;
}
body.nbtheme-light .topbar .tb-lbl,
body.nbtheme-light .topbar .tb-icon { color: rgba(20,20,35,.65) !important; filter: none !important; }
body.nbtheme-light .topbar .tb-btn.active .tb-lbl,
body.nbtheme-light .topbar .tb-btn.active .tb-icon { color: rgba(10,10,25,.92) !important; }
body.nbtheme-dark .topbar {
  background: rgba(4,4,8,0.94) !important;
  backdrop-filter: blur(24px) saturate(1.2) !important;
  -webkit-backdrop-filter: blur(24px) saturate(1.2) !important;
  box-shadow: 0 16px 56px rgba(0,0,0,.65), 0 4px 16px rgba(0,0,0,.45),
    inset 0 0 0 1px rgba(255,255,255,.05) !important;
}
body.nbtheme-blur .topbar {
  background: rgba(15,15,18,0.22) !important;
  backdrop-filter: blur(52px) saturate(2.2) !important;
  -webkit-backdrop-filter: blur(52px) saturate(2.2) !important;
  box-shadow: 0 16px 56px rgba(0,0,0,.18), 0 4px 12px rgba(0,0,0,.12),
    inset 0 0 0 1px rgba(255,255,255,.14) !important;
}
/* ── Subtab tray inherits tab bar theme ── */
body.nbtheme-light #topbar-subtabs {
  background: rgba(240,246,255,0.78) !important;
  backdrop-filter: blur(28px) saturate(1.7) !important;
  -webkit-backdrop-filter: blur(28px) saturate(1.7) !important;
  box-shadow: 0 6px 24px rgba(0,0,0,.10), inset 0 0 0 1px rgba(255,255,255,.60) !important;
}
body.nbtheme-light #topbar-subtabs .tb-stab { color: rgba(20,20,35,.55) !important; }
body.nbtheme-light #topbar-subtabs .tb-stab.active {
  background: rgba(255,255,255,.70) !important; color: rgba(10,10,25,.92) !important;
  box-shadow: 0 1px 6px rgba(0,0,0,.12) !important;
}
body.nbtheme-dark #topbar-subtabs {
  background: rgba(4,4,8,0.94) !important;
  backdrop-filter: blur(24px) saturate(1.2) !important;
  -webkit-backdrop-filter: blur(24px) saturate(1.2) !important;
  box-shadow: 0 6px 24px rgba(0,0,0,.65), inset 0 0 0 1px rgba(255,255,255,.05) !important;
}
body.nbtheme-blur #topbar-subtabs {
  background: rgba(15,15,18,0.22) !important;
  backdrop-filter: blur(52px) saturate(2.2) !important;
  -webkit-backdrop-filter: blur(52px) saturate(2.2) !important;
  box-shadow: 0 6px 24px rgba(0,0,0,.18), inset 0 0 0 1px rgba(255,255,255,.14) !important;
}
/* ── Page subtabs (ctx-subtabs) theme overrides ── */
body.stheme-light .ctx-subtabs {
  background: rgba(235,242,255,0.76) !important;
  backdrop-filter: blur(22px) saturate(1.6) !important;
  -webkit-backdrop-filter: blur(22px) saturate(1.6) !important;
  border-color: rgba(255,255,255,.55) !important;
}
body.stheme-light .ctx-stab { color: rgba(20,20,35,.60) !important; }
body.stheme-light .ctx-stab.active {
  background: rgba(255,255,255,.72) !important; color: rgba(10,10,25,.92) !important;
  box-shadow: 0 2px 8px rgba(0,0,0,.10), inset 0 1px 0 rgba(255,255,255,.8) !important;
}
body.stheme-dark .ctx-subtabs {
  background: rgba(4,4,8,0.92) !important;
  backdrop-filter: blur(20px) saturate(1.1) !important;
  -webkit-backdrop-filter: blur(20px) saturate(1.1) !important;
  border-color: rgba(255,255,255,.06) !important;
}
body.stheme-glass .ctx-subtabs {
  background: rgba(255,255,255,0.06) !important;
  backdrop-filter: blur(32px) saturate(2.0) !important;
  -webkit-backdrop-filter: blur(32px) saturate(2.0) !important;
  border-color: rgba(255,255,255,.13) !important;
}
body.stheme-glass .ctx-stab.active {
  background: rgba(255,255,255,.16) !important;
  box-shadow: 0 2px 10px rgba(0,0,0,.14), inset 0 1px 0 rgba(255,255,255,.22) !important;
}
body.stheme-accent .ctx-subtabs {
  background: linear-gradient(135deg, rgba(107,227,164,.14), rgba(125,211,252,.09)) !important;
  border-color: rgba(107,227,164,.25) !important;
}
body.stheme-accent .ctx-stab.active {
  background: linear-gradient(135deg, rgba(107,227,164,.30), rgba(125,211,252,.22)) !important;
  color: var(--text-primary, #FAFAFA) !important;
  box-shadow: 0 2px 10px rgba(107,227,164,.18) !important;
}

/* ── Settings page: groups rendered as expanded standalone cards ── */
#settings-page-content .tsp-group {
  border: 1px solid rgba(255,255,255,.08) !important;
  border-radius: 18px !important;
  background: rgba(255,255,255,.04) !important;
  backdrop-filter: blur(20px) saturate(1.4) !important;
  -webkit-backdrop-filter: blur(20px) saturate(1.4) !important;
  padding: 20px 22px !important;
  margin-bottom: 14px !important;
  overflow: visible !important;
}
#settings-page-content .tsp-group-body {
  display: block !important;
  padding: 0 !important;
}
#settings-page-content .tsp-group-head {
  display: flex !important;
  align-items: center !important;
  cursor: default !important;
  pointer-events: none !important;
  padding: 0 0 14px !important;
  margin-bottom: 14px !important;
  border-bottom: 1px solid rgba(255,255,255,.07) !important;
  font-size: 13px !important;
  font-weight: 800 !important;
  letter-spacing: .01em !important;
  color: var(--text-primary, #FAFAFA) !important;
  background: none !important;
  border-top: none !important;
  border-left: none !important;
  border-right: none !important;
  width: 100% !important;
}
#settings-page-content .tsp-group-arrow { display: none !important; }
#settings-page-content .tsp-group-icon { font-size: 16px !important; margin-right: 8px !important; }

/* ── BMI display card (in Health Profile settings group) ── */
.tsp-bmi-card {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.08);
}
.tsp-bmi-num { font-size: 28px; font-weight: 800; letter-spacing: -.03em; }
.tsp-bmi-cat { font-size: 11px; font-weight: 700; margin-left: 8px; vertical-align: middle; }
.tsp-bmi-meta { font-size: 10px; color: var(--text-tertiary, rgba(255,255,255,.38)); margin-top: 4px; line-height: 1.5; }
.tsp-bmi-bar {
  height: 5px; border-radius: 999px; margin-top: 10px;
  background: linear-gradient(to right, #7DD3FC 0% 22%, #6BE3A4 22% 58%, #F2C063 58% 76%, #F87171 76% 100%);
  position: relative;
}
.tsp-bmi-bar-marker {
  position: absolute; top: -3px; width: 11px; height: 11px;
  border-radius: 50%; background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,.5);
  transform: translateX(-50%);
  transition: left .4s cubic-bezier(.22,1,.36,1);
}
`;



  // ─────────────────────────── HTML ────────────────────────────
  const stripHTML = `<div id="topbar-strip"><div id="topbar-strip-inner"></div><a href="status.html" id="topbar-focus-btn" title="Focus Status">⊙ Focus</a></div>`;

  const navHTML = `
<div id="topbar-subtabs"></div>
<nav class="topbar" id="topbar" role="navigation" aria-label="Dashboard navigation">
  <div class="topbar-main-row">
    <a href="home.html" class="tb-item" id="tbHome">
      <img class="tb-icon-img" src="themes/icons/home.png" alt="">
      <span class="tb-lbl">Home</span>
    </a>
    <a href="index.html" class="tb-item" id="tbGoals">
      <img class="tb-icon-img" src="themes/icons/goal.png" alt="">
      <span class="tb-lbl">Goals</span>
      <span class="tb-badge" id="topbarGoalsCount"></span>
    </a>
    <a href="health.html" class="tb-item" id="tbHealth">
      <img class="tb-icon-img" src="themes/icons/health.png" alt="">
      <span class="tb-lbl">Health</span>
      <span class="tb-badge" id="topbarHealthCount"></span>
    </a>
    <a href="academics.html" class="tb-item" id="tbAcad">
      <img class="tb-icon-img" src="themes/icons/academic.png" alt="">
      <span class="tb-lbl">Acad</span>
      <span class="tb-badge" id="topbarAcademicsCount"></span>
    </a>
    <a href="finance.html" class="tb-item" id="tbFinance">
      <img class="tb-icon-img" src="themes/icons/finance.png" alt="">
      <span class="tb-lbl">Finance</span>
      <span class="tb-badge" id="topbarFinanceCount"></span>
    </a>
    <a href="settings.html" class="tb-item tb-settings-tab" id="tbSettings" aria-label="Settings"></a>
  </div>
</nav>`;

  const settingsPopupHTML = `
<div id="topbar-settings-popup">

  <!-- ── Atmosphere ── -->
  <div class="tsp-group open" id="tspg-atmo">
    <button class="tsp-group-head"><span><span class="tsp-group-icon">🌅</span> Atmosphere</span><span class="tsp-group-arrow">›</span></button>
    <div class="tsp-group-body">
      <div class="tsp-head">Mode</div>
      <div class="tsp-row">
        <button class="tsp-btn" data-theme="auto"><img class="ui-icon" src="themes/icons/icons8-rainbow-64.png" alt="" style="width:13px;height:13px"> Auto</button>
        <button class="tsp-btn" data-theme="light"><img class="ui-icon" src="themes/icons/icons8-sun-64.png" alt="" style="width:13px;height:13px"> Light</button>
        <button class="tsp-btn" data-theme="dark"><img class="ui-icon" src="themes/icons/icons8-moon-50.png" alt="" style="width:13px;height:13px"> Dark</button>
      </div>
      <div class="tsp-head" style="margin-top:8px">Time Preview</div>
      <div class="tsp-row" style="flex-wrap:wrap">
        <button class="tsp-btn" data-sim="null" style="min-width:44px">● Live</button>
        <button class="tsp-btn" data-sim="6.5"><img class="ui-icon" src="themes/icons/icons8-sunrise-50.png" alt="" style="width:11px;height:11px"> Sunrise</button>
        <button class="tsp-btn" data-sim="10"><img class="ui-icon" src="themes/icons/icons8-sun-64.png" alt="" style="width:11px;height:11px"> Day</button>
        <button class="tsp-btn" data-sim="18.5"><img class="ui-icon" src="themes/icons/icons8-sunrise-50.png" alt="" style="width:11px;height:11px"> Sunset</button>
        <button class="tsp-btn" data-sim="22"><img class="ui-icon" src="themes/icons/icons8-moon-50.png" alt="" style="width:11px;height:11px"> Night</button>
      </div>
      <div class="tsp-head" style="margin-top:8px">Bottom Fog</div>
      <div class="tsp-row" id="tsp-ftheme-row" style="flex-wrap:wrap">
        <button class="tsp-btn tsp-ftheme" data-ftheme="dynamic">◈ Dynamic</button>
        <button class="tsp-btn tsp-ftheme" data-ftheme="light">Light</button>
        <button class="tsp-btn tsp-ftheme" data-ftheme="dark">Dark</button>
        <button class="tsp-btn tsp-ftheme" data-ftheme="clear">Clear</button>
      </div>
      <label class="tsp-toggle-row" style="margin-top:4px" id="tsp-halftone-row">
        <span>Halftone dots</span>
        <div class="tsp-toggle" id="tsp-halftone-toggle"></div>
      </label>
      <div class="tsp-head" style="margin-top:8px">Fog Shape</div>
      <div class="tsp-row" id="tsp-fshape-row" style="flex-wrap:wrap">
        <button class="tsp-btn tsp-fshape" data-fshape="sides">Sides High</button>
        <button class="tsp-btn tsp-fshape" data-fshape="center">Center High</button>
        <button class="tsp-btn tsp-fshape" data-fshape="linear">Linear</button>
        <button class="tsp-btn tsp-fshape" data-fshape="waves">Waves</button>
      </div>
      <div class="tsp-head" style="margin-top:8px">Top Fog</div>
      <label class="tsp-toggle-row" id="tsp-topfog-row">
        <span>Atmospheric ceiling layer</span>
        <div class="tsp-toggle" id="tsp-topfog-toggle"></div>
      </label>
      <div class="tsp-row" id="tsp-tftheme-row" style="flex-wrap:wrap">
        <button class="tsp-btn tsp-tftheme" data-tftheme="dynamic">◈ Dynamic</button>
        <button class="tsp-btn tsp-tftheme" data-tftheme="light">Light</button>
        <button class="tsp-btn tsp-tftheme" data-tftheme="dark">Dark</button>
        <button class="tsp-btn tsp-tftheme" data-tftheme="blur">Blur</button>
      </div>
    </div>
  </div>

  <!-- ── Interface ── -->
  <div class="tsp-group" id="tspg-interface">
    <button class="tsp-group-head"><span><span class="tsp-group-icon">🪟</span> Interface</span><span class="tsp-group-arrow">›</span></button>
    <div class="tsp-group-body">
      <div class="tsp-head">Widget Style</div>
      <div class="tsp-row" id="tsp-wtheme-row" style="flex-wrap:wrap">
        <button class="tsp-btn tsp-wtheme" data-wtheme="dynamic">◈ Dynamic</button>
        <button class="tsp-btn tsp-wtheme" data-wtheme="light">Light</button>
        <button class="tsp-btn tsp-wtheme" data-wtheme="dark">Dark</button>
        <button class="tsp-btn tsp-wtheme" data-wtheme="clear">Clear</button>
      </div>
      <div class="tsp-head" style="margin-top:8px">Live Bar Style</div>
      <div class="tsp-row" id="tsp-btheme-row" style="flex-wrap:wrap">
        <button class="tsp-btn tsp-btheme" data-btheme="dynamic">◈ Dynamic</button>
        <button class="tsp-btn tsp-btheme" data-btheme="light">Light</button>
        <button class="tsp-btn tsp-btheme" data-btheme="dark">Dark</button>
        <button class="tsp-btn tsp-btheme" data-btheme="clear">Clear</button>
      </div>
      <div class="tsp-head" style="margin-top:8px">Tab Bar Style</div>
      <div class="tsp-row" id="tsp-nbtheme-row" style="flex-wrap:wrap">
        <button class="tsp-btn tsp-nbtheme" data-nbtheme="dynamic">◈ Dynamic</button>
        <button class="tsp-btn tsp-nbtheme" data-nbtheme="light">Light</button>
        <button class="tsp-btn tsp-nbtheme" data-nbtheme="dark">Dark</button>
        <button class="tsp-btn tsp-nbtheme" data-nbtheme="blur">Blurred</button>
      </div>
      <div class="tsp-head" style="margin-top:8px">Page Subtabs Style</div>
      <div class="tsp-row" id="tsp-stheme-row" style="flex-wrap:wrap">
        <button class="tsp-btn tsp-stheme" data-stheme="dynamic">◈ Dynamic</button>
        <button class="tsp-btn tsp-stheme" data-stheme="light">Light</button>
        <button class="tsp-btn tsp-stheme" data-stheme="dark">Dark</button>
        <button class="tsp-btn tsp-stheme" data-stheme="glass">Glass</button>
        <button class="tsp-btn tsp-stheme" data-stheme="accent">Accent</button>
      </div>
    </div>
  </div>

  <!-- ── Backgrounds ── -->
  <div class="tsp-group" id="tspg-bg">
    <button class="tsp-group-head"><span><span class="tsp-group-icon">🖼️</span> Backgrounds</span><span class="tsp-group-arrow">›</span></button>
    <div class="tsp-group-body">
      <div class="tsp-row" id="tsp-bg-tabs" style="flex-wrap:nowrap;overflow-x:auto;gap:3px;scrollbar-width:none">
        <button class="tsp-btn tsp-bg-tab" data-bgtab="home"      style="min-width:36px;padding:7px 6px;font-size:11px">Home</button>
        <button class="tsp-btn tsp-bg-tab" data-bgtab="goals"     style="min-width:36px;padding:7px 6px;font-size:11px">Goals</button>
        <button class="tsp-btn tsp-bg-tab" data-bgtab="health"    style="min-width:40px;padding:7px 6px;font-size:11px">Health</button>
        <button class="tsp-btn tsp-bg-tab" data-bgtab="finance"   style="min-width:44px;padding:7px 6px;font-size:11px">Finance</button>
        <button class="tsp-btn tsp-bg-tab" data-bgtab="academics" style="min-width:36px;padding:7px 6px;font-size:11px">Acad</button>
      </div>
      <div class="tsp-head" style="margin-top:6px">Mode</div>
      <div class="tsp-row" id="tsp-bg-mode-row" style="flex-wrap:wrap">
        <button class="tsp-btn tsp-bg-mode" data-bgmode="dynamic"><img class="ui-icon" src="themes/icons/icons8-rainbow-64.png" alt="" style="width:12px;height:12px"> Dynamic</button>
        <button class="tsp-btn tsp-bg-mode" data-bgmode="image"><img class="ui-icon" src="themes/icons/icons8-image-50.png" alt="" style="width:12px;height:12px"> Image</button>
        <button class="tsp-btn tsp-bg-mode" data-bgmode="solid"><img class="ui-icon" src="themes/icons/icons8-square-50.png" alt="" style="width:12px;height:12px"> Solid</button>
        <button class="tsp-btn tsp-bg-mode" data-bgmode="ai" id="tsp-bg-mode-ai">✦ AI Adaptive</button>
        <button class="tsp-btn tsp-bg-mode" data-bgmode="none" style="min-width:44px">✕ None</button>
      </div>
      <div id="tsp-bg-image-panel" style="display:none">
        <div id="tsp-bg-preview" class="tsp-bg-preview"><span class="tsp-bg-preview-label">Current image</span></div>
        <div class="tsp-row" style="margin-top:6px">
          <button class="tsp-btn" id="tsp-bg-upload">Upload Image</button>
          <button class="tsp-btn" id="tsp-bg-clear" style="color:#F87171;border-color:rgba(248,113,113,.22)">Clear</button>
        </div>
        <div class="tsp-head" style="margin-top:6px">Blur</div>
        <div class="tsp-row" id="tsp-bg-blur-row">
          <button class="tsp-btn tsp-bg-blur" data-bgblur="none">None</button>
          <button class="tsp-btn tsp-bg-blur" data-bgblur="light">Light</button>
          <button class="tsp-btn tsp-bg-blur" data-bgblur="medium">Medium</button>
          <button class="tsp-btn tsp-bg-blur" data-bgblur="heavy">Heavy</button>
        </div>
        <div class="tsp-head" style="margin-top:6px">Glass</div>
        <div class="tsp-row" id="tsp-bg-glass-row">
          <button class="tsp-btn tsp-bg-glass" data-bgglass="none">None</button>
          <button class="tsp-btn tsp-bg-glass" data-bgglass="frosted">Frosted</button>
          <button class="tsp-btn tsp-bg-glass" data-bgglass="dark">Dark</button>
          <button class="tsp-btn tsp-bg-glass" data-bgglass="light">Light</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Live Bar ── -->
  <div class="tsp-group" id="tspg-livebar">
    <button class="tsp-group-head"><span><span class="tsp-group-icon">📊</span> Live Bar</span><span class="tsp-group-arrow">›</span></button>
    <div class="tsp-group-body">
      <div class="tsp-head">Widgets</div>
      <div id="tsp-bar-toggles">
        <label class="tsp-toggle-row"><span>Day Progress</span><div class="tsp-toggle on" data-bar="dayProgress"></div></label>
        <label class="tsp-toggle-row"><span>Goals</span><div class="tsp-toggle on" data-bar="goals"></div></label>
        <label class="tsp-toggle-row"><span>Assignments</span><div class="tsp-toggle on" data-bar="assignments"></div></label>
        <label class="tsp-toggle-row"><span>Grades</span><div class="tsp-toggle on" data-bar="grades"></div></label>
        <label class="tsp-toggle-row"><span>Finance</span><div class="tsp-toggle on" data-bar="finance"></div></label>
        <label class="tsp-toggle-row"><span>Now Playing</span><div class="tsp-toggle on" data-bar="spotify"></div></label>
      </div>
      <input type="text" class="tsp-input" id="tsp-custom-quote" placeholder="Custom quote (shows in bar)…" style="margin-top:8px">
    </div>
  </div>

  <!-- ── Health Profile ── -->
  <div class="tsp-group" id="tspg-profile">
    <button class="tsp-group-head"><span><span class="tsp-group-icon">👤</span> Health Profile</span><span class="tsp-group-arrow">›</span></button>
    <div class="tsp-group-body">
      <div class="tsp-head">Your Age</div>
      <input type="number" class="tsp-input" id="tsp-age-input" placeholder="e.g. 20" min="1" max="120" style="max-width:120px">
      <div class="tsp-head" style="margin-top:14px">BMI</div>
      <div class="tsp-bmi-card" id="tsp-bmi-display">
        <div style="font-size:12px;color:var(--text-tertiary,rgba(255,255,255,.38))">No data yet — visit the Home tab to sync Samsung Health.</div>
      </div>
      <div style="font-size:10px;color:var(--text-tertiary,rgba(255,255,255,.38));margin-top:6px;line-height:1.5">Calculated from Samsung Health weight & height.</div>
    </div>
  </div>

  <!-- ── Settings Style ── -->
  <div class="tsp-group" id="tspg-spanel">
    <button class="tsp-group-head"><span><span class="tsp-group-icon">✨</span> Settings Style</span><span class="tsp-group-arrow">›</span></button>
    <div class="tsp-group-body">
      <div class="tsp-head">Panel Appearance</div>
      <div class="tsp-row" id="tsp-spanel-row" style="flex-wrap:wrap">
        <button class="tsp-btn tsp-spanel" data-spanel="default">◈ Default</button>
        <button class="tsp-btn tsp-spanel" data-spanel="glass">Glass</button>
        <button class="tsp-btn tsp-spanel" data-spanel="frosted">Frosted</button>
        <button class="tsp-btn tsp-spanel" data-spanel="solid">Solid</button>
        <button class="tsp-btn tsp-spanel" data-spanel="dynamic">Dynamic</button>
        <button class="tsp-btn tsp-spanel" data-spanel="minimal">Minimal</button>
      </div>
    </div>
  </div>

  <!-- ── Performance ── -->
  <div class="tsp-group" id="tspg-perf">
    <button class="tsp-group-head"><span><span class="tsp-group-icon">⚡</span> Performance</span><span class="tsp-group-arrow">›</span></button>
    <div class="tsp-group-body">
      <div class="tsp-row" id="tsp-perf-row">
        <button class="tsp-btn tsp-perf-mode" data-perf="quality">Quality</button>
        <button class="tsp-btn tsp-perf-mode" data-perf="balanced">Balanced</button>
        <button class="tsp-btn tsp-perf-mode" data-perf="performance">Perf</button>
      </div>
    </div>
  </div>

  <!-- ── AI ── -->
  <div class="tsp-group" id="tspg-ai">
    <button class="tsp-group-head"><span><span class="tsp-group-icon">🧠</span> AI</span><span class="tsp-group-arrow">›</span></button>
    <div class="tsp-group-body">
      <label class="tsp-toggle-row">
        <span>Enable AI Summaries</span>
        <div class="tsp-toggle" id="tsp-ai-toggle"></div>
      </label>
      <div class="tsp-head" style="margin-top:8px">Claude API Key</div>
      <input type="password" class="tsp-input" id="tsp-ai-key" placeholder="sk-ant-…" autocomplete="off" spellcheck="false">
      <div class="tsp-row" style="margin-top:6px">
        <button class="tsp-btn" id="tsp-ai-test">Test Connection</button>
      </div>
      <div class="tsp-ai-status" id="tsp-ai-status"></div>
      <div class="tsp-head" style="margin-top:8px">Summary Position</div>
      <div class="tsp-row" id="tsp-ai-pos-row">
        <button class="tsp-btn" data-pos="top">Top</button>
        <button class="tsp-btn" data-pos="bottom">Bottom</button>
        <button class="tsp-btn" data-pos="left">Left</button>
        <button class="tsp-btn" data-pos="right">Right</button>
      </div>
      <hr class="tsp-divider">
      <div class="tsp-head">AI Adaptive Wallpapers</div>
      <label class="tsp-toggle-row">
        <span>Enable Adaptive Wallpapers</span>
        <div class="tsp-toggle" id="tsp-gemini-toggle"></div>
      </label>
      <div id="tsp-gemini-panel" style="display:none">
        <div class="tsp-head" style="margin-top:8px">OpenAI API Key</div>
        <input type="password" class="tsp-input" id="tsp-gemini-key" placeholder="sk-…" autocomplete="off" spellcheck="false">
        <div class="tsp-row" style="margin-top:6px">
          <button class="tsp-btn" id="tsp-openai-test">Test Key</button>
        </div>
        <div class="tsp-ai-status" id="tsp-gemini-status"></div>
        <div class="tsp-head" style="margin-top:8px">Source Image</div>
        <div id="tsp-gemini-preview" class="tsp-bg-preview"><span class="tsp-bg-preview-label">Upload a base image</span></div>
        <div class="tsp-row" style="margin-top:6px">
          <button class="tsp-btn" id="tsp-gemini-upload">Upload Image</button>
          <button class="tsp-btn" id="tsp-gemini-regen">Regenerate All</button>
        </div>
        <div class="tsp-head" style="margin-top:8px">Generated Variants</div>
        <div class="tsp-gemini-phases" id="tsp-gemini-phases">
          <div class="tsp-phase-preview" data-phase="sunrise"><div class="ph-img" id="ph-img-sunrise"></div><div class="ph-label">Sunrise</div><div class="ph-status" id="ph-status-sunrise">○</div></div>
          <div class="tsp-phase-preview" data-phase="day"><div class="ph-img" id="ph-img-day"></div><div class="ph-label">Day</div><div class="ph-status" id="ph-status-day">○</div></div>
          <div class="tsp-phase-preview" data-phase="sunset"><div class="ph-img" id="ph-img-sunset"></div><div class="ph-label">Sunset</div><div class="ph-status" id="ph-status-sunset">○</div></div>
          <div class="tsp-phase-preview" data-phase="night"><div class="ph-img" id="ph-img-night"></div><div class="ph-label">Night</div><div class="ph-status" id="ph-status-night">○</div></div>
        </div>
        <div class="tsp-row" style="margin-top:4px">
          <button class="tsp-btn" id="tsp-gemini-clear" style="color:#F87171;border-color:rgba(248,113,113,.22)">Clear All Variants</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Database & Sync ── -->
  <div class="tsp-group" id="tspg-database">
    <button class="tsp-group-head"><span><span class="tsp-group-icon">🗄️</span> Database &amp; Sync</span><span class="tsp-group-arrow">›</span></button>
    <div class="tsp-group-body">
      <div style="font-size:9.5px;color:rgba(255,255,255,.3);margin-bottom:8px;line-height:1.5">Enables cross-device sync via <a href="https://supabase.com" target="_blank" style="color:rgba(255,255,255,.45)">Supabase</a>. Create a free project and paste your Project URL and publishable key below. Leave blank to use local storage only.</div>
      <div class="tsp-head">Supabase Project URL</div>
      <input type="text" class="tsp-input" id="tsp-supa-url" placeholder="https://xxxx.supabase.co" autocomplete="off" spellcheck="false">
      <div class="tsp-head" style="margin-top:8px">Supabase Publishable Key</div>
      <input type="password" class="tsp-input" id="tsp-supa-key" placeholder="sb_publishable_…" autocomplete="off" spellcheck="false">
      <div style="font-size:9.5px;color:rgba(255,255,255,.3);margin-top:6px;line-height:1.4">Changes take effect after reloading the page.</div>
    </div>
  </div>

  <!-- ── Location & Time ── -->
  <div class="tsp-group" id="tspg-location">
    <button class="tsp-group-head"><span><span class="tsp-group-icon">📍</span> Location &amp; Time</span><span class="tsp-group-arrow">›</span></button>
    <div class="tsp-group-body">
      <div style="font-size:9.5px;color:rgba(255,255,255,.3);margin-bottom:8px;line-height:1.5">Used to calculate accurate sunrise/sunset for the sky theme. Leave blank to use a generic day/night cycle. Stored locally only — never shared.</div>
      <div class="tsp-head">Latitude</div>
      <input type="number" class="tsp-input" id="tsp-latitude" placeholder="e.g. 40.71" step="0.01" min="-90" max="90" style="max-width:160px">
      <div class="tsp-head" style="margin-top:8px">Longitude</div>
      <input type="number" class="tsp-input" id="tsp-longitude" placeholder="e.g. -74.01" step="0.01" min="-180" max="180" style="max-width:160px">
    </div>
  </div>

  <!-- ── Media & Spotify ── -->
  <div class="tsp-group" id="tspg-spotify">
    <button class="tsp-group-head"><span><span class="tsp-group-icon">🎧</span> Media &amp; Spotify</span><span class="tsp-group-arrow">›</span></button>
    <div class="tsp-group-body">
      <div class="tsp-head">Spotify App Client ID</div>
      <input type="text" class="tsp-input" id="tsp-spotify-client-id" placeholder="Get from developer.spotify.com/dashboard" autocomplete="off" spellcheck="false">
      <div style="font-size:9.5px;color:rgba(255,255,255,.3);margin-bottom:8px;margin-top:4px;line-height:1.4">Create a free Spotify app at <a href="https://developer.spotify.com/dashboard" target="_blank" style="color:rgba(255,255,255,.45)">developer.spotify.com</a> and paste your Client ID above. Changes take effect after reloading.</div>
      <div class="tsp-spotify-status" id="tsp-spotify-status">
        <div class="tsp-spotify-dot" id="tsp-spotify-dot"></div>
        <span id="tsp-spotify-status-text">Not connected</span>
      </div>
      <div class="tsp-redirect-box">
        <span class="tsp-redirect-uri" id="tsp-redirect-uri"></span>
        <button class="tsp-copy-btn" id="tsp-copy-redirect">Copy</button>
      </div>
      <div style="font-size:9.5px;color:rgba(255,255,255,.3);margin-bottom:8px;line-height:1.4">Register this exact URL in your <a href="https://developer.spotify.com/dashboard" target="_blank" style="color:rgba(255,255,255,.45)">Spotify Dashboard</a> → App Settings → Redirect URIs.</div>
      <div class="tsp-row" id="tsp-spotify-btns">
        <button class="tsp-btn" id="tsp-spotify-connect">Connect Spotify</button>
      </div>
    </div>
  </div>

</div>`;

  function injectStyleAndHTML() {
    if (document.getElementById('topbar')) return;

    // Google Font — Plus Jakarta Sans (One UI-inspired soft geometry)
    if (!document.getElementById('topbar-font')) {
      const link = document.createElement('link');
      link.id  = 'topbar-font';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap';
      document.head.insertBefore(link, document.head.firstChild);
    }

    const style = document.createElement('style');
    style.id = 'topbar-style'; style.textContent = css;
    document.head.appendChild(style);

    // Per-tab custom background layer (must be injected first so topbar-bg inserts before it)
    if (!document.getElementById('page-bg-layer')) {
      const bl = document.createElement('div'); bl.id = 'page-bg-layer';
      bl.innerHTML = '<div id="page-bg-img"></div><div id="page-bg-glass"></div>';
      document.body.insertBefore(bl, document.body.firstChild);
    }

    // Fixed full-viewport background — gradient coverage fix
    if (!document.getElementById('topbar-bg')) {
      const bg = document.createElement('div'); bg.id = 'topbar-bg';
      document.body.insertBefore(bg, document.body.firstChild);
    }

    // Sky overlay — fixed, z-index -1, append anywhere
    if (!document.getElementById('topbar-sky')) {
      const sky = document.createElement('div'); sky.id = 'topbar-sky';
      document.body.appendChild(sky);
    }

    // Bottom fog — fixed, z-index 39, append
    if (!document.getElementById('bottom-fog')) {
      const fog = document.createElement('div'); fog.id = 'bottom-fog';
      document.body.appendChild(fog);
    }
    // Top fog — fixed, z-index 2 (behind content, above bg layers), append
    if (!document.getElementById('top-fog')) {
      const tfog = document.createElement('div'); tfog.id = 'top-fog';
      document.body.appendChild(tfog);
    }
    // Top blur — fixed, z-index 1, shown in blur mode
    if (!document.getElementById('top-blur')) {
      const tbl = document.createElement('div'); tbl.id = 'top-blur';
      document.body.appendChild(tbl);
    }
    // Halftone dot overlay — fixed, z-index 40, append
    if (!document.getElementById('bottom-halftone')) {
      const ht = document.createElement('div'); ht.id = 'bottom-halftone';
      document.body.appendChild(ht);
    }
    // Clear-mode blur layer — z-index 38 (above widgets, below fog at 39)
    if (!document.getElementById('bottom-blur')) {
      const bl = document.createElement('div'); bl.id = 'bottom-blur';
      document.body.appendChild(bl);
    }

    // Strip — fixed floating pill, prepend so it's early in DOM
    const sw = document.createElement('div'); sw.innerHTML = stripHTML.trim();
    document.body.insertBefore(sw.firstChild, document.body.firstChild);

    // Settings popup — only inject on non-settings pages
    const _isSettingsPage = location.pathname.toLowerCase().includes('settings');
    if (!_isSettingsPage && !document.getElementById('topbar-settings-popup')) {
      const pw = document.createElement('div'); pw.innerHTML = settingsPopupHTML.trim();
      document.body.appendChild(pw.firstChild);
    }
    // On settings page: inject settingsPopupHTML groups into settings-page-content
    if (_isSettingsPage) {
      const sc = document.getElementById('settings-page-content');
      if (sc && !sc.dataset.injected) {
        const pw = document.createElement('div'); pw.innerHTML = settingsPopupHTML.trim();
        const popup = pw.firstChild;
        while (popup.firstChild) sc.appendChild(popup.firstChild);
        sc.dataset.injected = '1';
        sc.querySelectorAll('.tsp-group').forEach(g => g.classList.add('open'));
      }
    }

    // Nav + subtabs tray — inject both children (subtabs div precedes nav in navHTML)
    const nw = document.createElement('div'); nw.innerHTML = navHTML.trim();
    while (nw.firstChild) document.body.appendChild(nw.firstChild);

    // Mark active tab
    _markActiveTab();
    // Mark focus btn active on status page
    const focusBtn = document.getElementById('topbar-focus-btn');
    if (focusBtn && location.pathname.toLowerCase().includes('status')) focusBtn.classList.add('active');
  }

  // ─────────────────────────── Active tab ──────────────────────
  const _SUBTAB_DEFS = {
    'health': [
      { panel:'overview', label:'<img class="ui-icon" src="themes/icons/icons8-arm-muscle-60.png" alt="" style="width:14px;height:14px"> Overview' },
      { panel:'workouts', label:'<img class="ui-icon" src="themes/icons/icons8-workout-24.png" alt="" style="width:14px;height:14px"> Workouts' },
      { panel:'sleep',    label:'<img class="ui-icon" src="themes/icons/icons8-sleep-64.png" alt="" style="width:14px;height:14px"> Sleep' },
      { panel:'food',     label:'<img class="ui-icon" src="themes/icons/icons8-organic-food-50.png" alt="" style="width:14px;height:14px"> Food' },
      { panel:'goals',    label:'<img class="ui-icon" src="themes/icons/icons8-sparkle-50.png" alt="" style="width:14px;height:14px"> Goals' },
    ],
    'academics': [
      { panel:'overview', label:'<img class="ui-icon" src="themes/icons/icons8-graduation-64.png" alt="" style="width:14px;height:14px"> Overview' },
      { panel:'college',  label:'<img class="ui-icon" src="themes/icons/icons8-graduation-64.png" alt="" style="width:14px;height:14px"> College' },
    ],
    'goals': [
      { panel:'overview',  label:'Overview' },
      { panel:'goals',     label:'Goals' },
      { panel:'tasks',     label:'Tasks' },
      { panel:'routines',  label:'Routines' },
    ],
    'home': [
      { panel:'plan', label:'<img class="ui-icon" src="themes/icons/icons8-calendar-64.png" alt="" style="width:14px;height:14px"> Plan', href:'schedule.html' },
    ],
  };

  function _syncSubtabs() {
    const stRow = document.getElementById('topbar-subtabs');
    const nav   = document.getElementById('topbar');
    if (!stRow) return;
    const path = location.pathname.toLowerCase();
    let pageKey = null;
    if (path.includes('home') || path.includes('schedule')) pageKey = 'home';
    else if (path.includes('health'))       pageKey = 'health';
    else if (path.includes('finance')) pageKey = 'finance';
    else if (path.includes('academics')) pageKey = 'academics';
    else if (path.includes('index') || path === '/' || path.endsWith('/')) pageKey = 'goals';

    if (!pageKey || !_SUBTAB_DEFS[pageKey]) {
      stRow.classList.remove('visible');
      return;
    }

    const _navIdFor = k => ({ health:'hSubnav', finance:'finSubnav', academics:'acadSubnav', goals:'goalsSubnav' })[k] || null;

    const defs = _SUBTAB_DEFS[pageKey];
    stRow.innerHTML = '';
    defs.forEach((def, i) => {
      const btn = document.createElement('button');
      // href-based subtabs: active when current page matches the href target
      const isActive = def.href
        ? path.includes(def.href.toLowerCase().replace('.html', ''))
        : i === 0;
      btn.className = 'tb-stab' + (isActive ? ' active' : '');
      btn.innerHTML = def.label;
      if (def.href) btn.dataset.href = def.href;
      else btn.dataset.panel = def.panel;
      btn.addEventListener('click', () => {
        if (def.href) { window.location.href = def.href; return; }
        const navId = _navIdFor(pageKey);
        const stab  = document.querySelector('#' + navId + ' [data-panel="' + def.panel + '"]');
        if (stab) stab.click();
        stRow.querySelectorAll('.tb-stab').forEach(b => b.classList.toggle('active', b === btn));
      });
      stRow.appendChild(btn);
    });

    stRow.classList.add('visible');

    // Watch in-page subtab changes to keep nav in sync (panel-based pages only)
    const navId = _navIdFor(pageKey);
    const inPageNav = document.getElementById(navId);
    if (inPageNav && !inPageNav._navSynced) {
      inPageNav._navSynced = true;
      inPageNav.addEventListener('click', e => {
        const stab = e.target.closest('.ctx-stab');
        if (!stab) return;
        const panel = stab.dataset.panel;
        stRow.querySelectorAll('.tb-stab').forEach(b => {
          b.classList.toggle('active', b.dataset.panel === panel);
        });
      });
    }
  }

  function _markActiveTab() {
    const path = location.pathname.toLowerCase();
    let activeId = 'tbGoals'; // default
    if (path.includes('home') || path.includes('schedule')) activeId = 'tbHome';
    else if (path.includes('health'))    activeId = 'tbHealth';
    else if (path.includes('academics')) activeId = 'tbAcad';
    else if (path.includes('finance'))   activeId = 'tbFinance';
    else if (path.includes('settings'))  activeId = 'tbSettings';
    else if (path.includes('index') || path === '/' || path.endsWith('/')) activeId = 'tbGoals';

    document.querySelectorAll('.tb-item').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(activeId);
    if (el) el.classList.add('active');
    _syncSubtabs();
  }

  // ─────────────────────────── Date helpers ────────────────────
  function activeDateKey() {
    const now = new Date(), d = new Date(now);
    if (now.getHours() < 6) d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  function calendarMonthKey() {
    const d = new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function fmtClock(d) {
    let h = d.getHours(); const m = String(d.getMinutes()).padStart(2,'0'), ap = h>=12?'PM':'AM';
    h = h%12||12; return h+':'+m+' '+ap;
  }
  function fmtHM(mins) {
    const h = Math.floor(mins/60), m = Math.round(mins%60);
    if(h>0&&m>0) return h+'h '+m+'m'; if(h>0) return h+'h'; return m+'m';
  }

  // ─────────────────────────── Progress readers ─────────────────
  function getGoalsProgress() {
    let goals = [];
    try { goals = JSON.parse(localStorage.getItem('goals:'+activeDateKey()))||[]; } catch{}
    return { done: goals.filter(g=>g&&g.done).length, total: goals.length };
  }
  function getHealthProgress() {
    let s = null; try { s = JSON.parse(localStorage.getItem('health:water:v2')||localStorage.getItem('po_water_v1')); } catch{}
    if (!s) return { done:0, total:0 };
    const done = (s.logs||{})[new Date().toISOString().slice(0,10)]||0;
    const goal = s.goal||8;
    return { done: Math.min(done, goal), total: goal };
  }
  function getAcademicsProgress() {
    let data=null; try{data=JSON.parse(localStorage.getItem('academic:v1'));}catch{}
    const a=(data&&data.assignments)||[];
    return { done:a.filter(x=>x&&x.done).length, total:a.length };
  }
  function getFinanceSummary() {
    let data=null; try{data=JSON.parse(localStorage.getItem('finance:v1'));}catch{}
    if(!data) return {spent:0,budget:0};
    const month=calendarMonthKey();
    const spent=(data.transactions||[]).filter(t=>t&&t.date&&t.date.startsWith(month)&&t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);
    const budget=(data.categories||[]).reduce((s,c)=>s+(c.budget||0),0);
    return {spent,budget};
  }
  function classifyStatus(done,total) {
    if(total===0) return 'idle'; if(done>=total) return 'good';
    if(new Date().getHours()>=18&&done<total*.5) return 'miss'; return 'warn';
  }
  function _setBadge(id, text, show, parentStatus) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('show', show && parentStatus !== 'good');
  }
  function _setItemStatus(el, status) {
    if (!el) return;
    el.classList.remove('warn','miss');
    if (status==='warn'||status==='miss') el.classList.add(status);
  }
  function render() {
    const goalsEl   = document.getElementById('tbGoals');
    const healthEl  = document.getElementById('tbHealth');
    const acadEl    = document.getElementById('tbAcad');
    const finEl     = document.getElementById('tbFinance');
    if (!goalsEl) return;
    const g=getGoalsProgress(), h=getHealthProgress(), a=getAcademicsProgress(), f=getFinanceSummary();
    const gs=classifyStatus(g.done,g.total), hs=classifyStatus(h.done,h.total), as_=classifyStatus(a.done,a.total);
    _setBadge('topbarGoalsCount',     g.done+'/'+g.total,   g.total>0, gs);
    _setBadge('topbarHealthCount',    h.done+'/'+h.total,   h.total>0, hs);
    _setBadge('topbarAcademicsCount', a.done+'/'+a.total,   a.total>0, as_);
    const fBudget = f.budget>0;
    const fOver   = fBudget && f.spent>f.budget;
    const fWarn   = fBudget && f.spent>f.budget*.8;
    _setBadge('topbarFinanceCount', '$'+Math.round(f.spent), f.spent>0, fOver?'miss':fWarn?'warn':'good');
    _setItemStatus(goalsEl,  gs);
    _setItemStatus(healthEl, hs);
    _setItemStatus(acadEl,   as_);
    finEl.classList.remove('warn','miss');
    if(fOver) finEl.classList.add('miss'); else if(fWarn) finEl.classList.add('warn');
  }

  // ─────────────────────────── Gestures + modal lock ───────────
  function lockGestures() {
    const blk=e=>e.preventDefault();
    ['gesturestart','gesturechange','gestureend'].forEach(ev=>document.addEventListener(ev,blk,{passive:false}));
    let last=0;
    document.addEventListener('touchend',e=>{const n=Date.now();if(n-last<=300)e.preventDefault();last=n;},{passive:false});
  }
  function startModalLock() {
    const SELS=['.modal-bg','.po-modal-bg','.wt-overlay','.wt-viewer','.wt-cam'];
    function any(){return SELS.some(s=>[...document.querySelectorAll(s)].some(el=>el.classList.contains('show')||el.classList.contains('is-open')));}
    new MutationObserver(()=>document.body.classList.toggle('topbar-modal-open',any()))
      .observe(document.body,{attributes:true,attributeFilter:['class'],subtree:true});
  }

  // ─────────────────────────── Sky engine ──────────────────────
  const SKY_STOPS = [
    {h:0,  a:[20,12,60,.12],  b:[8,5,35,.07],    tp:[250,250,250],ts:[185,183,177],tt:[118,116,110],bg:[5,5,6],       cb:[255,255,255,.040],cbo:[255,255,255,.060], gt:[10,18,52],   gm:[18,12,58],   gb:[4,5,12]},
    {h:4,  a:[20,12,60,.12],  b:[8,5,35,.07],    tp:[250,250,250],ts:[185,183,177],tt:[118,116,110],bg:[5,5,6],       cb:[255,255,255,.040],cbo:[255,255,255,.060], gt:[10,18,52],   gm:[18,12,58],   gb:[4,5,12]},
    {h:5,  a:[242,112,52,.48],b:[255,178,92,.32], tp:[255,244,228],ts:[202,180,155],tt:[150,128,108],bg:[16,10,7],    cb:[255,255,255,.058],cbo:[255,255,255,.088], gt:[130,55,75],  gm:[75,22,75],   gb:[12,6,5]},
    {h:6,  a:[255,202,82,.58],b:[255,162,62,.42], tp:[44,32,16],   ts:[102,86,60],  tt:[142,120,90], bg:[222,194,150],cb:[255,255,255,.52], cbo:[0,0,0,.082],       gt:[255,162,95], gm:[255,105,140],gb:[255,210,155]},
    {h:7,  a:[255,222,92,.62],b:[255,178,68,.44], tp:[36,26,10],   ts:[88,74,48],   tt:[130,110,78], bg:[230,202,154],cb:[255,255,255,.55], cbo:[0,0,0,.080],       gt:[138,192,252],gm:[192,230,255],gb:[255,248,225]},
    {h:9,  a:[142,207,255,.64],b:[192,234,255,.46],tp:[12,20,46],  ts:[50,76,122],  tt:[88,124,170], bg:[190,220,254],cb:[255,255,255,.58], cbo:[0,0,0,.085],       gt:[72,155,252], gm:[125,215,255],gb:[232,250,255]},
    {h:11, a:[168,220,255,.70],b:[218,242,255,.52],tp:[8,16,40],   ts:[44,70,118],  tt:[80,116,165], bg:[206,233,255],cb:[255,255,255,.62], cbo:[0,0,0,.090],       gt:[65,148,252], gm:[115,212,255],gb:[236,252,255]},
    {h:13, a:[168,220,255,.72],b:[218,242,255,.54],tp:[6,14,38],   ts:[42,68,116],  tt:[78,114,163], bg:[212,236,255],cb:[255,255,255,.64], cbo:[0,0,0,.092],       gt:[60,142,252], gm:[110,208,255],gb:[232,250,255]},
    {h:15, a:[168,220,255,.70],b:[218,242,255,.52],tp:[8,16,40],   ts:[44,70,118],  tt:[80,116,165], bg:[206,233,255],cb:[255,255,255,.62], cbo:[0,0,0,.090],       gt:[65,148,252], gm:[115,212,255],gb:[236,252,255]},
    {h:16, a:[255,214,90,.62], b:[255,240,145,.44],tp:[36,24,6],   ts:[88,68,38],   tt:[130,102,66], bg:[248,224,164],cb:[255,255,255,.55], cbo:[0,0,0,.082],       gt:[255,170,62], gm:[255,202,115],gb:[255,236,188]},
    {h:17, a:[255,158,55,.58], b:[255,208,98,.38], tp:[50,22,4],   ts:[106,62,28],  tt:[148,96,58],  bg:[242,172,100],cb:[255,255,255,.42], cbo:[0,0,0,.090],       gt:[255,105,42], gm:[200,62,182], gb:[68,14,88]},
    {h:18, a:[255,88,32,.50],  b:[212,55,162,.38], tp:[255,246,240],ts:[202,180,170],tt:[146,124,116],bg:[32,12,18],  cb:[255,255,255,.052],cbo:[255,255,255,.078], gt:[172,42,62],  gm:[92,14,122],  gb:[20,6,48]},
    {h:20, a:[80,20,132,.28],  b:[26,8,82,.16],    tp:[250,248,252],ts:[185,183,188],tt:[120,116,124],bg:[8,6,14],   cb:[255,255,255,.043],cbo:[255,255,255,.064], gt:[22,10,68],   gm:[14,7,48],    gb:[5,3,15]},
    {h:22, a:[20,12,60,.12],   b:[8,5,35,.07],     tp:[250,250,250],ts:[185,183,177],tt:[118,116,110],bg:[5,5,6],    cb:[255,255,255,.040],cbo:[255,255,255,.060], gt:[10,18,52],   gm:[18,12,58],   gb:[4,5,12]},
    {h:24, a:[20,12,60,.12],   b:[8,5,35,.07],     tp:[250,250,250],ts:[185,183,177],tt:[118,116,110],bg:[5,5,6],    cb:[255,255,255,.040],cbo:[255,255,255,.060], gt:[10,18,52],   gm:[18,12,58],   gb:[4,5,12]},
  ];
  function _lerpN(a,b,t){return a+(b-a)*t}
  function _lerpArr(a,b,t){return a.map((v,i)=>_lerpN(v,b[i],t))}
  function _rgba(c){return 'rgba('+Math.round(c[0])+','+Math.round(c[1])+','+Math.round(c[2])+','+c[3].toFixed(3)+')'}
  function _rgb(c){return 'rgb('+Math.round(c[0])+','+Math.round(c[1])+','+Math.round(c[2])+')'}

  function updateSky() {
    const _sunTimes = getLocalSunTimes();
    const _pHr = _getSimHour();
    const hr = _pHrToStop(_pHr, _sunTimes);
    let lo=SKY_STOPS[0],hi=SKY_STOPS[1];
    for(let i=0;i<SKY_STOPS.length-1;i++){
      if(hr>=SKY_STOPS[i].h&&hr<SKY_STOPS[i+1].h){lo=SKY_STOPS[i];hi=SKY_STOPS[i+1];break;}
    }
    const t=Math.max(0,Math.min(1,(hr-lo.h)/(hi.h-lo.h)));
    const a=_lerpArr(lo.a,hi.a,t), b=_lerpArr(lo.b,hi.b,t);
    const tp=_lerpArr(lo.tp,hi.tp,t), ts=_lerpArr(lo.ts,hi.ts,t), tt=_lerpArr(lo.tt,hi.tt,t);
    const bg=_lerpArr(lo.bg,hi.bg,t);
    const cb=_lerpArr(lo.cb,hi.cb,t), cbo=_lerpArr(lo.cbo,hi.cbo,t);
    const cbh=[cb[0],cb[1],cb[2],Math.min(1,cb[3]*1.5)];
    const isLight = bg[0]>80||bg[1]>80||bg[2]>80;

    const gt=_lerpArr(lo.gt,hi.gt,t), gm=_lerpArr(lo.gm,hi.gm,t), gb=_lerpArr(lo.gb,hi.gb,t);

    // Sun / moon arc position (using stop-space hr, 6=sunrise, 18=sunset)
    const isSunUp=hr>=6&&hr<=18;
    let glowX=50, glowY=78;
    if(isSunUp){const p=(hr-6)/12; glowX=Math.round(8+p*84); glowY=Math.round(90-Math.sin(p*Math.PI)*68);}

    // Expose local sunrise/set as CSS vars for other pages
    document.documentElement.style.setProperty('--sky-sunrise', _sunTimes.rise.toFixed(2));
    document.documentElement.style.setProperty('--sky-sunset', _sunTimes.set.toFixed(2));
    document.documentElement.style.setProperty('--sky-hr', _pHr.toFixed(3));

    // Body gradient + fixed #topbar-bg for full-viewport gradient coverage
    const grad = 'linear-gradient(185deg,'+_rgb(gt)+' 0%,'+_rgb(gm)+' 52%,'+_rgb(gb)+' 100%)';
    document.body.style.backgroundImage = grad;
    document.body.style.backgroundColor = _rgb(gb);
    const bgEl = document.getElementById('topbar-bg');
    if (bgEl) { bgEl.style.backgroundImage = grad; bgEl.style.backgroundColor = _rgb(gb); }

    // Hero ambient glow vars (used by home.html day-progress circle)
    const heroAlpha = isSunUp ? 0.22 : 0.10;
    const _de = document.documentElement;
    _de.style.setProperty('--hero-glow',   `radial-gradient(ellipse at 50% 60%, rgba(${Math.round(gm[0])},${Math.round(gm[1])},${Math.round(gm[2])},${heroAlpha}) 0%, transparent 68%)`);
    _de.style.setProperty('--hero-glow-2', `radial-gradient(ellipse at 50% 40%, rgba(${Math.round(gt[0])},${Math.round(gt[1])},${Math.round(gt[2])},${(heroAlpha*0.6).toFixed(3)}) 0%, transparent 55%)`);

    // Hero dynamic border — sky-tinted, diffuses inward from the edge
    const hmR = Math.round(gm[0]), hmG = Math.round(gm[1]), hmB = Math.round(gm[2]);
    _de.style.setProperty('--hero-border-color', `rgba(${hmR},${hmG},${hmB},${isSunUp ? 0.42 : 0.26})`);
    _de.style.setProperty('--hero-inset-glow',   `rgba(${hmR},${hmG},${hmB},${isSunUp ? 0.18 : 0.10})`);
    _de.style.setProperty('--hero-inset-glow-2', `rgba(${hmR},${hmG},${hmB},${isSunUp ? 0.10 : 0.06})`);

    // Sky overlay
    const skyEl=document.getElementById('topbar-sky');
    if(skyEl) skyEl.style.background=
      'radial-gradient(ellipse at '+glowX+'% '+glowY+'%,'+_rgba(a)+' 0%,transparent 62%),'+
      'radial-gradient(ellipse at '+(100-glowX)+'% '+(100-glowY)+'%,'+_rgba(b)+' 0%,transparent 58%)';

    const r=document.documentElement;
    r.style.setProperty('--text-primary',   _rgb(tp));
    r.style.setProperty('--text-secondary', _rgb(ts));
    r.style.setProperty('--text-tertiary',  _rgb(tt));
    r.style.setProperty('--body-bg',        _rgb(bg));
    r.style.setProperty('--grad-top',       _rgb(gt));
    r.style.setProperty('--grad-mid',       _rgb(gm));
    r.style.setProperty('--grad-bot',       _rgb(gb));
    // Dynamic card background — sky-tinted glass, not pure white.
    // Daytime: mostly-white surface with sky mid colour bled in lightly.
    // Nighttime: dark sky-tinted surface so widgets feel grounded in the sky.
    const gmR = Math.round(gm[0]), gmG = Math.round(gm[1]), gmB = Math.round(gm[2]);
    let dBgR, dBgG, dBgB, dBgA;
    if (isLight) {
      // Light sky: blend gm toward near-white (15% colour, 85% white base)
      dBgR = Math.min(255, Math.round(gmR * 0.15 + 218));
      dBgG = Math.min(255, Math.round(gmG * 0.15 + 218));
      dBgB = Math.min(255, Math.round(gmB * 0.15 + 218));
      dBgA = 0.58;
    } else {
      // Dark sky: dampen gm to a visible but not overwhelming surface
      dBgR = Math.round(Math.max(0, gmR * 0.60));
      dBgG = Math.round(Math.max(0, gmG * 0.60));
      dBgB = Math.round(Math.max(0, gmB * 0.60));
      dBgA = 0.68;
    }
    r.style.setProperty('--card-bg',       `rgba(${dBgR},${dBgG},${dBgB},${dBgA})`);
    r.style.setProperty('--card-bg-hover', `rgba(${dBgR},${dBgG},${dBgB},${Math.min(1, dBgA + 0.08)})`);
    r.style.setProperty('--card-border',    _rgba(cbo));

    // Accent color
    const accent = hr>=6&&hr<18
      ? 'rgb('+Math.round(_lerpN(250,107,Math.max(0,(hr-6)/12)))+','+Math.round(_lerpN(180,227,Math.max(0,(hr-6)/12)))+',50)'
      : '#6ee7b7';
    r.style.setProperty('--strip-accent', accent);

    // ── Adaptive AI gradient vars — maintain contrast on both light & dark backgrounds ──
    const bgLum01 = Math.min(1, (bg[0]*0.299 + bg[1]*0.587 + bg[2]*0.114) / 255);
    const isLightBg = bgLum01 > 0.45;
    if (isLightBg) {
      // Darken gradients for readability on bright backgrounds
      const darken = (c, amount) => Math.max(0, Math.round(c - amount));
      const aiG1 = [darken(gt[0],80), darken(gt[1],60), darken(gt[2],20)];
      const aiG2 = [darken(gm[0],80), darken(gm[1],60), darken(gm[2],20)];
      r.style.setProperty('--ai-grad-1', _rgb(aiG1));
      r.style.setProperty('--ai-grad-2', _rgb(aiG2));
      // Light bg: use dark overlays for glass elements
      r.style.setProperty('--nav-bg', 'rgba(255,255,255,0.70)');
      r.style.setProperty('--card-bg-solid', _rgb(bg));
      document.body.classList.add('theme-light-bg');
    } else {
      r.style.setProperty('--ai-grad-1', _rgb(gt));
      r.style.setProperty('--ai-grad-2', _rgb(gm));
      r.style.setProperty('--nav-bg', 'rgba(15,15,18,0.80)');
      document.body.classList.remove('theme-light-bg');
    }

    // ── Strip glass: brightness / contrast adapts to time-of-day ──
    const bgLum = Math.min(1, (bg[0]*0.299 + bg[1]*0.587 + bg[2]*0.114) / 220);
    const bgWarmRatio = Math.max(0, Math.min(1, (bg[0] - bg[2]) / 160));
    let sBg, sBlur, sBorderColor, sTrack, sCtrl, sCtrlHoverBg, sCtrlHoverCl;
    if (bgLum > 0.50) {
      // Daytime: light frosted glass — airy, vibrant, clean
      if (bgWarmRatio > 0.28) {
        // Warm: golden hour / morning / afternoon sun
        const a = (0.11 + bgLum * 0.06).toFixed(3);
        sBg          = `rgba(255,240,208,${a})`;
        sBlur        = 'blur(24px) saturate(1.55)';
        sBorderColor = 'rgba(255,210,140,.18)';
        sTrack       = 'rgba(0,0,0,.07)';
        sCtrl        = 'rgba(40,18,0,.55)';
        sCtrlHoverBg = 'rgba(0,0,0,.07)';
        sCtrlHoverCl = 'rgba(30,12,0,.85)';
      } else {
        // Cool: blue sky midday
        const a = (0.12 + bgLum * 0.06).toFixed(3);
        sBg          = `rgba(215,238,255,${a})`;
        sBlur        = 'blur(22px) saturate(1.65)';
        sBorderColor = 'rgba(180,220,255,.18)';
        sTrack       = 'rgba(0,40,100,.07)';
        sCtrl        = 'rgba(0,28,75,.55)';
        sCtrlHoverBg = 'rgba(0,0,0,.06)';
        sCtrlHoverCl = 'rgba(0,20,60,.85)';
      }
    } else if (bgLum > 0.04) {
      // Transition: sunrise glow / dusk / post-sunset
      const tBlend   = (bgLum - 0.04) / 0.46;
      const bgOpacity = (0.56 - tBlend * 0.08).toFixed(3);
      const warmR    = Math.round(12 + bgWarmRatio * 36 + tBlend * 12);
      const warmG    = Math.round(12 + bgWarmRatio * 6);
      const warmB    = Math.round(16 - bgWarmRatio * 4);
      sBg          = `rgba(${warmR},${warmG},${warmB},${bgOpacity})`;
      sBlur        = `blur(${Math.round(30 - tBlend * 6)}px) saturate(${(1.35 + tBlend * 0.30).toFixed(2)})`;
      const bA     = (0.06 + bgWarmRatio * 0.10 + tBlend * 0.04).toFixed(3);
      const bG     = Math.round(180 + bgWarmRatio * 40);
      const bB     = Math.round(120 + bgWarmRatio * 25);
      sBorderColor = `rgba(255,${bG},${bB},${bA})`;
      sTrack       = 'rgba(128,128,128,.11)';
      sCtrl        = 'rgba(255,255,255,.52)';
      sCtrlHoverBg = 'rgba(255,255,255,.10)';
      sCtrlHoverCl = '#fff';
    } else {
      // Night: restrained, calm glass
      sBg          = 'rgba(12,12,16,0.60)';
      sBlur        = 'blur(28px) saturate(1.3)';
      sBorderColor = 'rgba(255,255,255,.06)';
      sTrack       = 'rgba(128,128,128,.11)';
      sCtrl        = 'rgba(255,255,255,.52)';
      sCtrlHoverBg = 'rgba(255,255,255,.10)';
      sCtrlHoverCl = '#fff';
    }
    // Bar theme override — static modes bypass the adaptive computation above
    if (_barTheme === 'light') {
      sBg = 'rgba(240,246,255,.17)'; sBlur = 'blur(24px) saturate(1.55)';
      sBorderColor = 'rgba(255,255,255,.24)'; sTrack = 'rgba(0,0,0,.07)';
      sCtrl = 'rgba(20,20,35,.62)'; sCtrlHoverBg = 'rgba(0,0,0,.07)'; sCtrlHoverCl = 'rgba(10,10,25,.88)';
    } else if (_barTheme === 'dark') {
      sBg = 'rgba(8,8,14,.72)'; sBlur = 'blur(28px) saturate(1.30)';
      sBorderColor = 'rgba(255,255,255,.07)'; sTrack = 'rgba(128,128,128,.12)';
      sCtrl = 'rgba(255,255,255,.56)'; sCtrlHoverBg = 'rgba(255,255,255,.10)'; sCtrlHoverCl = '#fff';
    } else if (_barTheme === 'clear') {
      sBg = 'rgba(255,255,255,.06)'; sBlur = 'blur(20px) saturate(1.15)';
      sBorderColor = 'rgba(255,255,255,.09)'; sTrack = 'rgba(128,128,128,.10)';
      sCtrl = 'rgba(255,255,255,.50)'; sCtrlHoverBg = 'rgba(255,255,255,.08)'; sCtrlHoverCl = '#fff';
    }

    r.style.setProperty('--strip-bg',            sBg);
    r.style.setProperty('--strip-blur',          sBlur);
    r.style.setProperty('--strip-border-color',  sBorderColor);
    r.style.setProperty('--strip-track-bg',      sTrack);
    r.style.setProperty('--strip-ctrl-color',    sCtrl);
    r.style.setProperty('--strip-ctrl-hover-bg', sCtrlHoverBg);
    r.style.setProperty('--strip-ctrl-hover-cl', sCtrlHoverCl);

    // Nav bar dynamic background — same color family as the strip but more opaque
    // so the tab bar and subtray also shift with the sky theme in dynamic mode
    const navBgDynamic = sBg.replace(/,\s*([\d.]+)\)$/, (_, a) =>
      ',' + Math.min(0.92, parseFloat(a) + 0.38) + ')'
    );
    r.style.setProperty('--nav-bg-dynamic', navBgDynamic);
    r.style.setProperty('--nav-border-dynamic', sBorderColor);

    _applyWidgetTheme();
    _applyFogTheme();

    // ── Bottom fog: atmospheric diffusion vars for multi-layer radial system ──
    // Bloom — slightly brightened for light-scattering effect
    const bR = Math.min(255, Math.round(gb[0]*0.82 + 16));
    const bG = Math.min(255, Math.round(gb[1]*0.84 + 18));
    const bB = Math.min(255, Math.round(gb[2]*0.90 + 20));
    // Edge anchor — slightly darker than sky bottom
    const eR = Math.round(Math.max(0, gb[0]*0.70));
    const eG = Math.round(Math.max(0, gb[1]*0.70));
    const eB = Math.round(Math.max(0, gb[2]*0.76));
    r.style.setProperty('--fog-bloom',     `rgba(${bR},${bG},${bB},0.44)`);
    r.style.setProperty('--fog-bloom-mid', `rgba(${bR},${bG},${bB},0.16)`);
    r.style.setProperty('--fog-bloom2',    `rgba(${bR},${bG},${bB},0.26)`);
    r.style.setProperty('--fog-tint',      `rgba(${bR},${bG},${bB},0.12)`);
    r.style.setProperty('--fog-edge',      `rgba(${eR},${eG},${eB},0.72)`);
    r.style.setProperty('--fog-edge-mid',  `rgba(${eR},${eG},${eB},0.20)`);

    // ── Top fog: ceiling diffusion — uses gt (sky top color), not gb (sky bottom) ──
    const tR = Math.min(255, Math.round(gt[0]*0.85 + 8));
    const tG = Math.min(255, Math.round(gt[1]*0.87 + 10));
    const tB = Math.min(255, Math.round(gt[2]*0.92 + 14));
    const teR = Math.round(Math.max(0, gt[0]*0.65));
    const teG = Math.round(Math.max(0, gt[1]*0.65));
    const teB = Math.round(Math.max(0, gt[2]*0.72));
    r.style.setProperty('--top-fog-bloom',    `rgba(${tR},${tG},${tB},0.32)`);
    r.style.setProperty('--top-fog-mid',      `rgba(${tR},${tG},${tB},0.10)`);
    r.style.setProperty('--top-fog-tint',     `rgba(${tR},${tG},${tB},0.16)`);
    r.style.setProperty('--top-fog-edge',     `rgba(${teR},${teG},${teB},0.40)`);
    r.style.setProperty('--top-fog-edge-mid', `rgba(${teR},${teG},${teB},0.12)`);
  }

  // ─────────────────────────── Live info strip ─────────────────
  let _stripItems=[], _stripIdx=0, _stripTimer=null;

  function _gradeColor(p){if(p>=90)return'#6BE3A4';if(p>=80)return'#7DD3FC';if(p>=70)return'#F2C063';if(p>=60)return'#FB923C';return'#F87171';}
  function _letterGrade(p){if(p>=93)return'A';if(p>=90)return'A-';if(p>=87)return'B+';if(p>=83)return'B';if(p>=80)return'B-';if(p>=77)return'C+';if(p>=73)return'C';if(p>=70)return'C-';return'D/F';}
  function _calcGrade(s,asgns){
    const done=asgns.filter(a=>a.subjectId===s.id&&a.done&&(a.pointsTotal||0)>0);
    if(!done.length)return null;
    if(!s.categories||!s.categories.length){
      const e=done.reduce((t,a)=>t+(a.pointsEarned||0),0),tt=done.reduce((t,a)=>t+a.pointsTotal,0);
      return tt>0?e/tt*100:null;
    }
    let ws=0,wu=0;
    for(const c of s.categories){const ca=done.filter(a=>a.categoryId===c.id);if(!ca.length)continue;
      const e=ca.reduce((t,a)=>t+(a.pointsEarned||0),0),tt=ca.reduce((t,a)=>t+a.pointsTotal,0);
      if(!tt)continue;ws+=(e/tt)*c.weight;wu+=c.weight;}
    return wu>0?ws/wu*100:null;
  }

  function _buildStrip() {
    const items=[], hr=_getSimHour();
    const sun=getLocalSunTimes();
    const bar=_barSettings;

    const _si=(s,n=14)=>`<img class="ui-icon" src="${s}" alt="" style="width:${n}px;height:${n}px">`;
    const phases=[
      [0,sun.rise-1,_si('themes/icons/icons8-moon-50.png'),'Late night'],[sun.rise-1,sun.rise+0.5,_si('themes/icons/icons8-sunrise-50.png'),'Sunrise'],
      [sun.rise+0.5,12,_si('themes/icons/icons8-sun-64.png'),'Morning'],[12,13.5,_si('themes/icons/icons8-sun-64.png'),'Midday'],
      [13.5,sun.set-1.5,_si('themes/icons/icons8-sun-64.png'),'Afternoon'],[sun.set-1.5,sun.set,_si('themes/icons/icons8-sunrise-50.png'),'Golden Hour'],
      [sun.set,sun.set+1.5,_si('themes/icons/icons8-moon-50.png'),'Evening'],[sun.set+1.5,24,_si('themes/icons/icons8-moon-50.png'),'Night']
    ];
    const ph=phases.find(([s,e])=>hr>=s&&hr<e)||phases[0];
    items.push({icon:ph[2], label:'Now', text:ph[3]+' · '+fmtLocalClock(), pct:null});

    // Day progress
    const WAKE=sun.rise, SLEEP=sun.set;
    if(bar.dayProgress!==false && hr>=WAKE&&hr<=SLEEP){
      const pct=Math.round((hr-WAKE)/(SLEEP-WAKE)*100);
      items.push({icon:_si('themes/icons/icons8-hourglass-64.png'), label:'Day', text:pct+'% complete  ·  '+fmtHM((SLEEP-hr)*60)+' left', pct});
    }

    // Goals
    if(bar.goals!==false){
      let goals=[]; try{goals=JSON.parse(localStorage.getItem('goals:'+activeDateKey()))||[];}catch{}
      if(goals.length){
        const done=goals.filter(g=>g.done).length, total=goals.length;
        const pct=Math.round(done/total*100);
        items.push({icon:_si('themes/icons/icons8-sparkle-50.png'), label:'Goals', text:done===total?'All done!':done+'/'+total+' complete', pct:done===total?100:pct});
      }
    }

    // Assignments
    let acad=null; try{acad=JSON.parse(localStorage.getItem('academic:v1'));}catch{}
    if(bar.assignments!==false && acad&&acad.assignments){
      const today=new Date(); today.setHours(0,0,0,0);
      const week=new Date(today); week.setDate(week.getDate()+7);
      const up=acad.assignments
        .filter(a=>!a.done&&a.due)
        .map(a=>({...a,_d:new Date(a.due+'T00:00:00')}))
        .filter(a=>a._d>=today&&a._d<=week)
        .sort((a,b)=>a._d-b._d);
      up.slice(0,4).forEach(a=>{
        const diff=Math.round((a._d-today)/86400000);
        const when=diff===0?'today':diff===1?'tomorrow':'in '+diff+'d';
        items.push({icon:_si('themes/icons/icons8-book-50.png'), label:'Due '+when, text:(a.title||a.text||'Assignment'), pct:null});
      });
    }

    // Grades
    if(bar.grades!==false && acad&&acad.subjects&&acad.subjects.length){
      acad.subjects.slice(0,4).forEach(s=>{
        const g=_calcGrade(s,acad.assignments||[]);
        if(g!=null) items.push({icon:_si('themes/icons/icons8-graduation-64.png'),label:s.name,text:Math.round(g)+'% · '+_letterGrade(g),pct:g,barColor:_gradeColor(g)});
      });
    }

    // Finance
    if(bar.finance!==false){
      const f=getFinanceSummary();
      if(f.budget>0){
        const pct=Math.round(f.spent/f.budget*100);
        items.push({icon:_si('themes/icons/icons8-dollar-24.png'), label:'Budget', text:'$'+Math.round(f.spent)+' of $'+Math.round(f.budget)+' ('+pct+'%)', pct});
      }
    }

    // Spotify Now Playing
    if(bar.spotify!==false && window.SpotifyAPI && window.SpotifyAPI.isConnected()){
      const track=window.SpotifyAPI.getCurrentTrack();
      if(track){
        const prog=track.duration>0?Math.round(track.progress/track.duration*100):0;
        items.push({icon:track.isPlaying?_si('themes/icons/icons8-musical-note-50.png'):_si('themes/icons/icons8-pause-50.png'), label:'Playing', text:track.name+' — '+track.artist, pct:prog, controls:true, art:track.albumArt||null});
      }
    }

    // Custom quote
    if(_customQuote&&_customQuote.trim()){
      items.push({icon:_si('themes/icons/icons8-quote-24.png'), label:'', text:_customQuote.trim(), pct:null});
    }

    return items.length?items:[{icon:_si('themes/icons/icons8-sparkle-50.png'), label:'', text:'Welcome to your dashboard', pct:null}];
  }

  function _stripTick() {
    const container=document.getElementById('topbar-strip-inner');
    if(!container||!_stripItems.length) return;
    _stripIdx=(_stripIdx+1)%_stripItems.length;
    const item=_stripItems[_stripIdx];
    const old=container.querySelector('.strip-active');
    const el=_makeStripEl(item);
    container.appendChild(el);
    el.getBoundingClientRect();
    if(old){old.classList.add('strip-leave');setTimeout(()=>old.remove(),520);}
    el.classList.add('strip-active');
    _animateBar(el);
  }

  function _makeStripEl(item) {
    const el=document.createElement('div'); el.className='strip-item';
    let html='<div class="si-row">';
    if(item.art){
      html+='<img class="si-art" src="'+item.art+'" alt="">';
    } else {
      html+='<span class="strip-icon">'+item.icon+'</span>';
      if(item.label) html+='<span class="strip-label">'+item.label+'</span><span class="strip-sep">·</span>';
    }
    html+='<span class="si-text">'+item.text+'</span>';
    if(item.controls){
      html+='<div class="si-controls">'
        +'<button class="si-ctrl" data-ctrl="prev" title="Previous"><img class="ui-icon" src="themes/icons/icons8-previous-50.png" alt="" style="width:12px;height:12px"></button>'
        +'<button class="si-ctrl" data-ctrl="toggle" title="Play/Pause"><img class="ui-icon" src="themes/icons/icons8-play-50.png" alt="" style="width:12px;height:12px"></button>'
        +'<button class="si-ctrl" data-ctrl="next" title="Next"><img class="ui-icon" src="themes/icons/icons8-next-50.png" alt="" style="width:12px;height:12px"></button>'
        +'</div>';
    }
    html+='</div>';
    if(item.pct!=null){
      const pct=Math.min(100,Math.max(1,item.pct));
      const fillColor=item.barColor||'var(--strip-accent,#6ee7b7)';
      const label=Math.round(pct)+'%';
      html+='<div class="si-bar-track">'+
        '<div class="si-bar-fill" data-pct="'+pct+'" style="width:0%;--fill:'+pct+';background:'+fillColor+'">'+
          '<span class="si-bar-inner">'+label+'</span>'+
        '</div>'+
        '<span class="si-bar-outer">'+label+'</span>'+
      '</div>';
    }
    el.innerHTML=html;
    if(item.controls){
      el.querySelectorAll('.si-ctrl').forEach(btn=>{
        btn.addEventListener('click', e=>{
          e.stopPropagation();
          const api=window.SpotifyAPI; if(!api) return;
          const a=btn.dataset.ctrl;
          if(a==='prev')    api.previous();
          else if(a==='toggle') api.togglePlay();
          else if(a==='next')   api.next();
        });
      });
    }
    return el;
  }

  function _animateBar(el) {
    const fill=el.querySelector('.si-bar-fill');
    if(!fill) return;
    requestAnimationFrame(()=>{ fill.style.width=fill.dataset.pct+'%'; });
  }

  function startStrip() {
    const container=document.getElementById('topbar-strip-inner');
    if(!container) return;
    _stripItems=_buildStrip(); if(!_stripItems.length) return;
    container.innerHTML='';
    const first=_makeStripEl(_stripItems[0]);
    first.classList.add('strip-active'); container.appendChild(first);
    _animateBar(first);
    if(_stripTimer) clearInterval(_stripTimer);
    _stripTimer=setInterval(()=>{_stripItems=_buildStrip();_stripTick();},5000);
  }

  // ─────────────────────────── Settings ────────────────────────
  let _simTime = null;      // null = live, or numeric hour override
  let _themeMode = 'auto';  // 'auto' | 'light' | 'dark'
  const _BAR_DEFAULTS = { dayProgress:true, goals:true, assignments:true, grades:true, finance:true, spotify:true };
  let _barSettings = Object.assign({}, _BAR_DEFAULTS);
  let _customQuote = '';
  let _aiEnabled  = false;
  let _aiApiKey   = '';
  let _aiSummaryPosition = 'bottom';
  let _supabaseUrl = '';
  let _supabaseKey = '';
  let _spotifyClientId = '';
  let _latitude  = null;
  let _longitude = null;
  let _tabBackgrounds = {}; // { pageKey: { mode, blur, glass } }
  let _tabBgSelected  = 'home'; // which tab is being edited in settings
  // AI wallpaper state
  let _geminiEnabled = false;
  let _openaiApiKey  = '';
  let _geminiPhases  = {}; // { sunrise|day|sunset|night: { generated: bool, blobUrl?: string } }
  let _lastWallpaperPhase = null; // which phase is currently applied
  let _geminiGenerating = false;
  let _perfMode = 'balanced';    // 'quality' | 'balanced' | 'performance'
  let _widgetTheme   = 'dynamic'; // 'dynamic' | 'light' | 'dark' | 'clear'
  let _barTheme      = 'dynamic'; // 'dynamic' | 'light' | 'dark' | 'clear'
  let _fogTheme      = 'dynamic'; // 'dynamic' | 'light' | 'dark' | 'clear'
  let _fogShape      = 'sides';   // 'sides' | 'center' | 'linear'
  let _halftoneEnabled = false;
  let _topFogEnabled   = false;
  let _topFogTheme     = 'dynamic'; // 'dynamic' | 'light' | 'dark' | 'blur'
  let _navBarTheme   = 'dynamic'; // 'dynamic' | 'light' | 'dark' | 'blur'
  let _subtabTheme   = 'dynamic'; // 'dynamic' | 'light' | 'dark' | 'glass' | 'accent'
  let _settingsPanelStyle = 'default'; // 'default' | 'glass' | 'frosted' | 'solid' | 'dynamic' | 'minimal'
  let _userAge = null; // stored as integer or null

  function _getSimHour() {
    if (_themeMode === 'light') return 10;
    if (_themeMode === 'dark')  return 1;
    if (_simTime !== null)      return _simTime;
    return getLocalHour();
  }

  function _initSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('topbar:settings') || '{}');
      _themeMode          = saved.themeMode  || 'auto';
      _simTime            = saved.simTime    !== undefined ? saved.simTime : null;
      _barSettings        = Object.assign({}, _BAR_DEFAULTS, saved.barSettings || {});
      _customQuote        = saved.customQuote || '';
      _aiEnabled          = !!saved.aiEnabled;
      _aiApiKey           = saved.aiApiKey   || '';
      _aiSummaryPosition  = saved.aiSummaryPosition || 'bottom';
      _supabaseUrl        = saved.supabaseUrl || '';
      _supabaseKey        = saved.supabaseKey || '';
      _spotifyClientId    = saved.spotifyClientId || '';
      _latitude           = saved.latitude  !== undefined && saved.latitude  !== null && saved.latitude  !== '' ? parseFloat(saved.latitude)  : null;
      _longitude          = saved.longitude !== undefined && saved.longitude !== null && saved.longitude !== '' ? parseFloat(saved.longitude) : null;
      _tabBackgrounds     = saved.tabBackgrounds || {};
      _geminiEnabled      = !!saved.geminiEnabled;
      _openaiApiKey       = saved.openaiApiKey || saved.geminiApiKey || '';
      _geminiPhases       = saved.geminiPhases || {};
      _perfMode           = saved.perfMode || 'balanced';
      _widgetTheme        = saved.widgetTheme    || 'dynamic';
      _barTheme           = saved.barTheme      || 'dynamic';
      _fogTheme           = saved.fogTheme      || 'dynamic';
      _fogShape           = saved.fogShape      || 'sides';
      _halftoneEnabled    = saved.halftoneEnabled || false;
      _topFogEnabled      = saved.topFogEnabled  || false;
      _topFogTheme        = saved.topFogTheme   || 'dynamic';
      _navBarTheme        = saved.navBarTheme   || 'dynamic';
      _subtabTheme        = saved.subtabTheme   || 'dynamic';
      _settingsPanelStyle = saved.settingsPanelStyle || 'default';
      _userAge            = saved.userAge !== undefined && saved.userAge !== null ? parseInt(saved.userAge, 10) || null : null;
    } catch(e) {}
    _tabBgSelected = _getPageKey();
    _refreshSettingsUI();
    _applyWidgetTheme();
    _applyFogTheme();
    _applyFogShape();
    _applyTopFog();
    _applyTopFogTheme();
    _applyNavBarTheme();
    _applySubtabTheme();
    _applySettingsPanelStyle();
    // Pre-apply bg-image-active so sky doesn't flash before the image loads
    const _preKey = _getPageKey();
    const _preCfg = _tabBackgrounds[_preKey] || {};
    if (!_geminiEnabled && _preCfg.mode === 'image') {
      document.body.classList.add('bg-image-active');
    }
    // Load Gemini blob URLs from IndexedDB
    if (_geminiEnabled) _loadGeminiPhaseUrls();
  }

  function _saveSettings() {
    try {
      localStorage.setItem('topbar:settings', JSON.stringify({
        themeMode: _themeMode, simTime: _simTime,
        barSettings: _barSettings, customQuote: _customQuote,
        aiEnabled: _aiEnabled, aiApiKey: _aiApiKey, aiSummaryPosition: _aiSummaryPosition,
        tabBackgrounds: _tabBackgrounds,
        geminiEnabled: _geminiEnabled, openaiApiKey: _openaiApiKey,
        geminiPhases: _geminiPhases,
        perfMode: _perfMode,
        widgetTheme: _widgetTheme, barTheme: _barTheme,
        fogTheme: _fogTheme, fogShape: _fogShape, halftoneEnabled: _halftoneEnabled,
        topFogEnabled: _topFogEnabled,
        topFogTheme: _topFogTheme,
        navBarTheme: _navBarTheme,
        subtabTheme: _subtabTheme,
        settingsPanelStyle: _settingsPanelStyle,
        userAge: _userAge,
        supabaseUrl: _supabaseUrl,
        supabaseKey: _supabaseKey,
        spotifyClientId: _spotifyClientId,
        latitude: _latitude,
        longitude: _longitude,
      }));
      // Also write as dedicated keys so inline page scripts can read them before topbar.js runs
      localStorage.setItem('topbar:supabaseUrl', _supabaseUrl);
      localStorage.setItem('topbar:supabaseKey', _supabaseKey);
      localStorage.setItem('topbar:spotifyClientId', _spotifyClientId);
    } catch(e) {}
  }

  function _refreshSettingsUI() {
    const popup = document.getElementById('topbar-settings-popup') || document.getElementById('settings-page-content');
    if (!popup) return;
    popup.querySelectorAll('.tsp-btn[data-theme]').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === _themeMode);
    });
    popup.querySelectorAll('.tsp-btn[data-sim]').forEach(b => {
      const val = b.dataset.sim === 'null' ? null : parseFloat(b.dataset.sim);
      b.classList.toggle('active', val === _simTime);
    });
    popup.querySelectorAll('.tsp-toggle[data-bar]').forEach(tog => {
      tog.classList.toggle('on', _barSettings[tog.dataset.bar] !== false);
    });
    const qInput = document.getElementById('tsp-custom-quote');
    if (qInput && qInput !== document.activeElement) qInput.value = _customQuote;
    const aiToggle = document.getElementById('tsp-ai-toggle');
    if (aiToggle) aiToggle.classList.toggle('on', _aiEnabled);
    const aiKeyEl = document.getElementById('tsp-ai-key');
    if (aiKeyEl && aiKeyEl !== document.activeElement) aiKeyEl.value = _aiApiKey;
    popup.querySelectorAll('.tsp-btn[data-pos]').forEach(b => {
      b.classList.toggle('active', b.dataset.pos === _aiSummaryPosition);
    });
    // Gemini UI
    const gemToggle = document.getElementById('tsp-gemini-toggle');
    if (gemToggle) gemToggle.classList.toggle('on', _geminiEnabled);
    const gemPanel = document.getElementById('tsp-gemini-panel');
    if (gemPanel) gemPanel.style.display = _geminiEnabled ? '' : 'none';
    const gemKeyEl = document.getElementById('tsp-gemini-key');
    if (gemKeyEl && gemKeyEl !== document.activeElement) gemKeyEl.value = _openaiApiKey;
    popup.querySelectorAll('.tsp-perf-mode').forEach(b => {
      b.classList.toggle('active', b.dataset.perf === _perfMode);
    });
    popup.querySelectorAll('.tsp-wtheme').forEach(b => {
      b.classList.toggle('active', b.dataset.wtheme === _widgetTheme);
    });
    popup.querySelectorAll('.tsp-btheme').forEach(b => {
      b.classList.toggle('active', b.dataset.btheme === _barTheme);
    });
    popup.querySelectorAll('.tsp-ftheme').forEach(b => {
      b.classList.toggle('active', b.dataset.ftheme === _fogTheme);
    });
    popup.querySelectorAll('.tsp-fshape').forEach(b => {
      b.classList.toggle('active', b.dataset.fshape === _fogShape);
    });
    const htTog = document.getElementById('tsp-halftone-toggle');
    if (htTog) htTog.classList.toggle('on', _halftoneEnabled);
    const tfTog = document.getElementById('tsp-topfog-toggle');
    if (tfTog) tfTog.classList.toggle('on', _topFogEnabled);
    popup.querySelectorAll('.tsp-tftheme').forEach(b => {
      b.classList.toggle('active', b.dataset.tftheme === _topFogTheme);
    });
    popup.querySelectorAll('.tsp-nbtheme').forEach(b => {
      b.classList.toggle('active', b.dataset.nbtheme === _navBarTheme);
    });
    popup.querySelectorAll('.tsp-stheme').forEach(b => {
      b.classList.toggle('active', b.dataset.stheme === _subtabTheme);
    });
    popup.querySelectorAll('.tsp-spanel').forEach(b => {
      b.classList.toggle('active', b.dataset.spanel === _settingsPanelStyle);
    });
    const ageInput = document.getElementById('tsp-age-input');
    if (ageInput && ageInput !== document.activeElement) ageInput.value = _userAge !== null ? _userAge : '';
    const latEl = document.getElementById('tsp-latitude');
    if (latEl && latEl !== document.activeElement) latEl.value = _latitude !== null ? _latitude : '';
    const lonEl = document.getElementById('tsp-longitude');
    if (lonEl && lonEl !== document.activeElement) lonEl.value = _longitude !== null ? _longitude : '';
    const supaUrlEl = document.getElementById('tsp-supa-url');
    if (supaUrlEl && supaUrlEl !== document.activeElement) supaUrlEl.value = _supabaseUrl;
    const supaKeyEl = document.getElementById('tsp-supa-key');
    if (supaKeyEl && supaKeyEl !== document.activeElement) supaKeyEl.value = _supabaseKey;
    const spotifyClientEl = document.getElementById('tsp-spotify-client-id');
    if (spotifyClientEl && spotifyClientEl !== document.activeElement) spotifyClientEl.value = _spotifyClientId;
    _refreshBMIDisplay();
    _refreshGeminiPhasesUI();
    _refreshSpotifyUI();
    _refreshBgUI();
  }

  function _refreshBMIDisplay() {
    const el = document.getElementById('tsp-bmi-display');
    if (!el) return;
    try {
      const cached = JSON.parse(localStorage.getItem('health:bmi:v1') || 'null');
      if (!cached || !cached.bmi) {
        el.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary,rgba(255,255,255,.38))">No data yet — visit the Home tab to sync Samsung Health.</div>';
        return;
      }
      const bmi = cached.bmi;
      const weightLbs = cached.weightLbs;
      const heightM = cached.heightM;
      const age = _userAge;
      // Determine category
      let cat, catColor;
      if (bmi < 18.5)      { cat = 'Underweight'; catColor = '#7DD3FC'; }
      else if (bmi < 25)   { cat = 'Normal';      catColor = '#6BE3A4'; }
      else if (bmi < 30)   { cat = 'Overweight';  catColor = '#F2C063'; }
      else                 { cat = 'Obese';        catColor = '#F87171'; }
      // Bar marker position: map BMI 15–40 → 0–100%
      const pct = Math.max(0, Math.min(100, (bmi - 15) / 25 * 100));
      // Height in ft/in
      let heightStr = '';
      if (heightM) {
        const totalIn = heightM / 0.0254;
        const ft = Math.floor(totalIn / 12);
        const inch = Math.round(totalIn % 12);
        heightStr = ft + '\'' + inch + '"';
      }
      const weightStr = weightLbs ? weightLbs.toFixed(1) + ' lbs' : '';
      const metaParts = [];
      if (heightStr) metaParts.push(heightStr);
      if (weightStr) metaParts.push(weightStr);
      if (age) metaParts.push('Age ' + age);
      el.innerHTML =
        '<div>' +
          '<span class="tsp-bmi-num">' + bmi.toFixed(1) + '</span>' +
          '<span class="tsp-bmi-cat" style="color:' + catColor + '">' + cat + '</span>' +
        '</div>' +
        (metaParts.length ? '<div class="tsp-bmi-meta">' + metaParts.join(' · ') + '</div>' : '') +
        '<div class="tsp-bmi-bar"><div class="tsp-bmi-bar-marker" style="left:' + pct + '%"></div></div>';
    } catch(e) {
      el.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary,rgba(255,255,255,.38))">No data yet.</div>';
    }
  }

  function _refreshGeminiPhasesUI() {
    const phases = ['sunrise','day','sunset','night'];
    phases.forEach(ph => {
      const preview = document.querySelector(`.tsp-phase-preview[data-phase="${ph}"]`);
      const imgEl = document.getElementById(`ph-img-${ph}`);
      const statusEl = document.getElementById(`ph-status-${ph}`);
      if (!preview) return;
      const info = _geminiPhases[ph];
      if (info && info.generated) {
        preview.classList.add('generated');
        if (statusEl) statusEl.textContent = '✓';
        if (imgEl && info.blobUrl) imgEl.style.backgroundImage = `url(${info.blobUrl})`;
        else if (imgEl && !info.blobUrl) {
          // Load from IndexedDB
          _bgLoad('gemini-' + ph).then(blob => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              if (!_geminiPhases[ph]) _geminiPhases[ph] = {};
              _geminiPhases[ph].blobUrl = url;
              if (imgEl) imgEl.style.backgroundImage = `url(${url})`;
            }
          }).catch(() => {});
        }
      } else {
        preview.classList.remove('generated');
        if (statusEl) statusEl.textContent = '○';
        if (imgEl) imgEl.style.backgroundImage = 'none';
      }
    });
    // Also show source image preview
    const gemPreview = document.getElementById('tsp-gemini-preview');
    if (gemPreview) {
      _bgLoad('gemini-source').then(blob => {
        if (blob) {
          if (!_geminiPhases._sourceBlobUrl) _geminiPhases._sourceBlobUrl = URL.createObjectURL(blob);
          gemPreview.style.backgroundImage = `url(${_geminiPhases._sourceBlobUrl})`;
          gemPreview.classList.add('has-img');
        }
      }).catch(() => {});
    }
  }

  function _refreshSpotifyUI() {
    const dot  = document.getElementById('tsp-spotify-dot');
    const text = document.getElementById('tsp-spotify-status-text');
    const btns = document.getElementById('tsp-spotify-btns');
    if (!dot) return;
    const connected = window.SpotifyAPI && window.SpotifyAPI.isConnected();
    dot.classList.toggle('connected', !!connected);
    if (text) text.textContent = connected ? 'Connected' : 'Not connected';
    // Populate redirect URI
    const uriEl = document.getElementById('tsp-redirect-uri');
    const copyBtn = document.getElementById('tsp-copy-redirect');
    const redirectUri = window.location.origin + window.location.pathname.split('?')[0];
    if (uriEl) uriEl.textContent = redirectUri;
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(redirectUri).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        }).catch(() => {
          prompt('Copy this URL:', redirectUri);
        });
      };
    }
    if (btns) {
      btns.innerHTML = connected
        ? `<button class="tsp-btn" id="tsp-spotify-disconnect">Disconnect</button>`
        : `<button class="tsp-btn" id="tsp-spotify-connect">Connect Spotify</button>`;
      const cb = btns.querySelector('#tsp-spotify-connect');
      const db = btns.querySelector('#tsp-spotify-disconnect');
      if (cb) cb.addEventListener('click', () => { window.SpotifyAPI && window.SpotifyAPI.login(); });
      if (db) db.addEventListener('click', () => { window.SpotifyAPI && window.SpotifyAPI.logout(); _refreshSpotifyUI(); startStrip(); });
    }
  }

  // ─────────────────────────── Background image store (IndexedDB) ─────────
  let _bgDB = null;
  let _bgBlobUrls = {}; // pageKey → object URL (cached for current session)
  const _BG_DB = 'topbar-bg-v1', _BG_STORE = 'images';

  function _openBgDB() {
    return new Promise((resolve, reject) => {
      if (_bgDB) { resolve(_bgDB); return; }
      const req = indexedDB.open(_BG_DB, 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore(_BG_STORE);
      req.onsuccess  = e => { _bgDB = e.target.result; resolve(_bgDB); };
      req.onerror    = e => reject(e.target.error);
    });
  }
  function _bgSave(key, blob) {
    return _openBgDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(_BG_STORE, 'readwrite');
      tx.objectStore(_BG_STORE).put(blob, key);
      tx.oncomplete = resolve; tx.onerror = e => reject(e.target.error);
    }));
  }
  function _bgLoad(key) {
    return _openBgDB().then(db => new Promise((resolve, reject) => {
      const req = db.transaction(_BG_STORE, 'readonly').objectStore(_BG_STORE).get(key);
      req.onsuccess = e => resolve(e.target.result || null);
      req.onerror   = e => reject(e.target.error);
    }));
  }
  function _bgDelete(key) {
    // Revoke any cached object URL first
    if (_bgBlobUrls[key]) { URL.revokeObjectURL(_bgBlobUrls[key]); delete _bgBlobUrls[key]; }
    return _openBgDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(_BG_STORE, 'readwrite');
      tx.objectStore(_BG_STORE).delete(key);
      tx.oncomplete = resolve; tx.onerror = e => reject(e.target.error);
    }));
  }
  function _bgMigrateLocalStorage() {
    // One-time migration: move old base64 localStorage images into IndexedDB
    ['home','goals','health','finance','academics'].forEach(key => {
      const old = localStorage.getItem('topbar:bg:' + key);
      if (!old) return;
      try {
        const [hdr, data] = old.split(',');
        const mime = (hdr.match(/:(.*?);/) || [])[1] || 'image/jpeg';
        const bytes = atob(data), arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        _bgSave(key, new Blob([arr], { type: mime }))
          .then(() => localStorage.removeItem('topbar:bg:' + key))
          .catch(() => {});
      } catch(e) {}
    });
  }

  // ─────────────────────────── Performance mode ─────────────────
  function _applyPerfMode() {
    document.body.classList.toggle('perf-reduced', _perfMode === 'performance');
    const sky = document.getElementById('topbar-sky');
    if (!sky) return;
    if (_perfMode === 'quality') {
      sky.style.filter = 'blur(70px)';
      sky.style.animationDuration = '90s';
    } else if (_perfMode === 'performance') {
      sky.style.filter = 'blur(30px)';
    } else {
      sky.style.filter = '';
      sky.style.animationDuration = '';
    }
  }

  function _applyWidgetTheme() {
    document.body.classList.remove('wtheme-light', 'wtheme-dark', 'wtheme-clear');
    if (_widgetTheme !== 'dynamic') document.body.classList.add('wtheme-' + _widgetTheme);
  }

  function _applyNavBarTheme() {
    document.body.classList.remove('nbtheme-light', 'nbtheme-dark', 'nbtheme-blur');
    if (_navBarTheme !== 'dynamic') document.body.classList.add('nbtheme-' + _navBarTheme);
  }

  function _applySubtabTheme() {
    document.body.classList.remove('stheme-light', 'stheme-dark', 'stheme-glass', 'stheme-accent');
    if (_subtabTheme !== 'dynamic') document.body.classList.add('stheme-' + _subtabTheme);
  }

  function _applyFogShape() {
    document.body.classList.remove('fshape-center', 'fshape-linear', 'fshape-waves');
    if (_fogShape !== 'sides') document.body.classList.add('fshape-' + _fogShape);
  }

  function _applyTopFog() {
    document.body.classList.toggle('topfog-on', _topFogEnabled);
  }

  function _applyTopFogTheme() {
    document.body.classList.remove('tftheme-light','tftheme-dark','tftheme-blur');
    if (_topFogTheme !== 'dynamic') document.body.classList.add('tftheme-' + _topFogTheme);
  }

  function _applySettingsPanelStyle() {
    document.body.classList.remove('spanel-glass','spanel-frosted','spanel-solid','spanel-dynamic','spanel-minimal');
    if (_settingsPanelStyle !== 'default') document.body.classList.add('spanel-' + _settingsPanelStyle);
  }

  function _applyFogTheme() {
    document.body.classList.remove('ftheme-light', 'ftheme-dark', 'ftheme-clear');
    if (_fogTheme !== 'dynamic') document.body.classList.add('ftheme-' + _fogTheme);
    const ht = document.getElementById('bottom-halftone');
    if (ht) {
      ht.classList.toggle('active', _halftoneEnabled);
      const r = document.documentElement;
      if (_fogTheme === 'light') {
        r.style.setProperty('--halftone-dot',    'rgba(0,0,0,0.09)');
        r.style.setProperty('--halftone-dot-sm', 'rgba(0,0,0,0.04)');
      } else if (_fogTheme === 'dark') {
        r.style.setProperty('--halftone-dot',    'rgba(255,255,255,0.07)');
        r.style.setProperty('--halftone-dot-sm', 'rgba(255,255,255,0.035)');
      } else if (_fogTheme === 'clear') {
        r.style.setProperty('--halftone-dot',    'rgba(255,255,255,0.05)');
        r.style.setProperty('--halftone-dot-sm', 'rgba(255,255,255,0.025)');
      } else {
        // Dynamic: dots use a slightly brightened version of the current fog color
        r.style.setProperty('--halftone-dot',    'rgba(255,255,255,0.10)');
        r.style.setProperty('--halftone-dot-sm', 'rgba(255,255,255,0.05)');
      }
    }
  }

  // ─────────────────────────── Page background ─────────────────
  function _getPageKey() {
    const p = location.pathname.toLowerCase();
    if (p.includes('home'))      return 'home';
    if (p.includes('health'))    return 'health';
    if (p.includes('finance'))   return 'finance';
    if (p.includes('academics')) return 'academics';
    if (p.includes('index') || p === '/' || p.endsWith('/')) return 'goals';
    return 'home';
  }

  const _BG_BLUR = {
    none:   'none',
    light:  'blur(4px) brightness(.92)',
    medium: 'blur(12px) brightness(.88)',
    heavy:  'blur(24px) brightness(.82)',
  };
  const _BG_GLASS = {
    none:    { bg: 'transparent',        bd: 'none' },
    frosted: { bg: 'rgba(12,12,18,.20)', bd: 'blur(10px) saturate(1.4)' },
    clear:   { bg: 'rgba(255,255,255,.05)', bd: 'none' },
    dark:    { bg: 'rgba(0,0,0,.52)',    bd: 'none' },
    light:   { bg: 'rgba(255,255,255,.26)', bd: 'none' },
  };

  async function _applyPageBackground() {
    if (_geminiEnabled) {
      document.body.classList.remove('bg-none');
      document.body.classList.remove('bg-image-active');
      await _checkAndTransitionWallpaper();
      return;
    }
    const pageKey = _getPageKey();
    const cfg = _tabBackgrounds[pageKey] || { mode: 'dynamic' };
    const effectiveKey = pageKey;
    const layer   = document.getElementById('page-bg-layer');
    const bgImg   = document.getElementById('page-bg-img');
    const bgGlass = document.getElementById('page-bg-glass');
    if (!layer) return;

    if (cfg.mode === 'image') {
      // Use cached blob URL or load from IndexedDB
      let url = _bgBlobUrls[effectiveKey] || null;
      if (!url) {
        try {
          const blob = await _bgLoad(effectiveKey);
          if (blob) {
            url = URL.createObjectURL(blob);
            _bgBlobUrls[effectiveKey] = url;
          }
        } catch(e) {}
      }
      if (url && bgImg) {
        bgImg.style.backgroundImage = 'url(' + url + ')';
        bgImg.style.filter = _BG_BLUR[cfg.blur || 'none'] || 'none';
        const g = _BG_GLASS[cfg.glass || 'none'] || _BG_GLASS.none;
        if (bgGlass) {
          bgGlass.style.background = g.bg;
          bgGlass.style.backdropFilter = g.bd;
          bgGlass.style.webkitBackdropFilter = g.bd;
        }
        layer.classList.add('active');
      } else {
        layer.classList.remove('active');
      }
    } else if (cfg.mode === 'solid') {
      if (bgImg)   bgImg.style.backgroundImage = 'none';
      if (bgGlass) {
        // Use the current theme's body-bg color for a solid (non-gradient) surface
        const themeBg = getComputedStyle(document.documentElement).getPropertyValue('--body-bg').trim() || 'rgb(5,5,6)';
        bgGlass.style.background = themeBg;
        bgGlass.style.backdropFilter = 'none';
        bgGlass.style.webkitBackdropFilter = 'none';
      }
      layer.classList.add('active');
    } else if (cfg.mode === 'none') {
      if (bgImg)   bgImg.style.backgroundImage = 'none';
      if (bgGlass) {
        bgGlass.style.background = 'none';
        bgGlass.style.backdropFilter = 'none';
        bgGlass.style.webkitBackdropFilter = 'none';
      }
      layer.classList.remove('active');
    } else {
      layer.classList.remove('active');
    }
    document.body.classList.toggle('bg-none', cfg.mode === 'none');
    document.body.classList.toggle('bg-image-active', cfg.mode === 'image' && layer.classList.contains('active'));
  }

  function _refreshBgUI() {
    const popup = document.getElementById('topbar-settings-popup') || document.getElementById('settings-page-content');
    if (!popup) return;
    // Tab highlight
    popup.querySelectorAll('.tsp-bg-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.bgtab === _tabBgSelected);
    });
    const cfg = _tabBackgrounds[_tabBgSelected] || { mode: 'dynamic' };
    const effectiveMode = _geminiEnabled ? 'ai' : (cfg.mode || 'dynamic');
    // Mode
    popup.querySelectorAll('.tsp-bg-mode').forEach(b => {
      b.classList.toggle('active', b.dataset.bgmode === effectiveMode);
    });
    // Image panel visibility
    const panel = document.getElementById('tsp-bg-image-panel');
    if (panel) panel.style.display = cfg.mode === 'image' && !_geminiEnabled ? '' : 'none';
    // Gemini panel: show when AI Adaptive is active
    const gemPanel = document.getElementById('tsp-gemini-panel');
    if (gemPanel) gemPanel.style.display = _geminiEnabled ? '' : 'none';
    const gemToggle = document.getElementById('tsp-gemini-toggle');
    if (gemToggle) gemToggle.classList.toggle('on', _geminiEnabled);
    // Thumbnail — use cached blob URL or async-load from IndexedDB
    const preview = document.getElementById('tsp-bg-preview');
    if (preview) {
      const cached = _bgBlobUrls[_tabBgSelected];
      if (cached) {
        preview.classList.add('has-img');
        preview.style.backgroundImage = 'url(' + cached + ')';
      } else {
        preview.classList.remove('has-img');
        preview.style.backgroundImage = 'none';
        _bgLoad(_tabBgSelected).then(blob => {
          if (!blob) return;
          if (!_bgBlobUrls[_tabBgSelected]) _bgBlobUrls[_tabBgSelected] = URL.createObjectURL(blob);
          // Only update if the user is still on the same tab
          const cur = document.getElementById('tsp-bg-preview');
          if (cur) { cur.classList.add('has-img'); cur.style.backgroundImage = 'url(' + _bgBlobUrls[_tabBgSelected] + ')'; }
        }).catch(() => {});
      }
    }
    // Blur
    popup.querySelectorAll('.tsp-bg-blur').forEach(b => {
      b.classList.toggle('active', b.dataset.bgblur === (cfg.blur || 'none'));
    });
    // Glass
    popup.querySelectorAll('.tsp-bg-glass').forEach(b => {
      b.classList.toggle('active', b.dataset.bgglass === (cfg.glass || 'none'));
    });
  }

  function _bgCfgSet(key, val) {
    if (!_tabBackgrounds[_tabBgSelected]) _tabBackgrounds[_tabBgSelected] = {};
    _tabBackgrounds[_tabBgSelected][key] = val;
    // AI Adaptive mode toggles the global Gemini flag
    if (key === 'mode') {
      if (val === 'ai') {
        _geminiEnabled = true;
      } else if (_geminiEnabled && val !== 'ai') {
        // Switching away from AI mode disables it
        _geminiEnabled = false;
        const layer = document.getElementById('page-bg-layer');
        if (layer) layer.classList.remove('active');
      }
    }
    _saveSettings();
    if (_tabBgSelected === _getPageKey()) _applyPageBackground();
    _refreshBgUI();
  }

  // ── Gemini wallpaper time-phase detection ──────────────────────
  function _getWallpaperPhase(hr) {
    const sun = getLocalSunTimes();
    const stopHr = _pHrToStop(hr, sun);
    if (stopHr >= 5  && stopHr < 7.5)  return 'sunrise';
    if (stopHr >= 7.5 && stopHr < 16)  return 'day';
    if (stopHr >= 16 && stopHr < 19)   return 'sunset';
    return 'night';
  }

  async function _loadGeminiPhaseUrls() {
    const phases = ['sunrise','day','sunset','night'];
    for (const ph of phases) {
      if (_geminiPhases[ph] && _geminiPhases[ph].generated && !_geminiPhases[ph].blobUrl) {
        try {
          const blob = await _bgLoad('gemini-' + ph);
          if (blob) _geminiPhases[ph].blobUrl = URL.createObjectURL(blob);
        } catch(e) {}
      }
    }
  }

  async function _applyGeminiWallpaper(phase) {
    if (!_geminiEnabled) return;
    const info = _geminiPhases[phase];
    if (!info || !info.generated) {
      // Try to generate if we have source + key
      if (_openaiApiKey) {
        await _generateAIVariant(phase, true); // silent
      }
      return;
    }
    let url = info.blobUrl;
    if (!url) {
      try {
        const blob = await _bgLoad('gemini-' + phase);
        if (blob) { url = URL.createObjectURL(blob); _geminiPhases[phase].blobUrl = url; }
      } catch(e) {}
    }
    if (!url) return;
    // Apply as global background overlay
    const bgImg = document.getElementById('page-bg-img');
    const layer = document.getElementById('page-bg-layer');
    if (bgImg && layer) {
      bgImg.style.backgroundImage = `url(${url})`;
      bgImg.style.filter = 'none';
      const bgGlass = document.getElementById('page-bg-glass');
      if (bgGlass) { bgGlass.style.background = 'rgba(0,0,0,.18)'; bgGlass.style.backdropFilter = 'none'; }
      layer.classList.add('active');
    }
    _lastWallpaperPhase = phase;
  }

  async function _generateAIVariant(phase, silent) {
    if (_geminiGenerating) return;
    const sourceBlob = await _bgLoad('gemini-source').catch(() => null);
    if (!sourceBlob) {
      if (!silent) _setGeminiStatus('Upload a source image first', '#F87171');
      return;
    }
    if (!_openaiApiKey) {
      if (!silent) _setGeminiStatus('Enter your OpenAI API key', '#F87171');
      return;
    }
    _geminiGenerating = true;
    if (!silent) _setGeminiStatus(`Generating ${phase} variant…`, '#F2C063');
    try {
      const prompts = {
        sunrise: 'Relight this scene with warm golden-pink sunrise light, long soft shadows, misty horizon, dawn atmosphere. Keep the original subjects and composition intact.',
        day: 'Relight this scene with bright clear midday sunlight, vibrant natural colors, sharp crisp shadows. Keep the original subjects and composition intact.',
        sunset: 'Relight this scene with deep amber-orange-purple sunset sky, warm golden hour light, long dramatic shadows. Keep the original subjects and composition intact.',
        night: 'Relight this scene for nighttime: deep indigo-blue sky, moonlight, calm serene atmosphere, subtle cool luminescence. Keep the original subjects and composition intact.',
      };

      // Step 1: Use GPT-4o-mini vision to describe the source image
      let imageDescription = '';
      try {
        const b64src = await new Promise((res, rej) => {
          const r = new FileReader(); r.onload = e => res(e.target.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(sourceBlob);
        });
        const mimeType = sourceBlob.type || 'image/jpeg';
        const visionResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_openaiApiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            max_tokens: 300,
            messages: [{ role: 'user', content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${b64src}`, detail: 'low' } },
              { type: 'text', text: 'Describe this image in detail: the subjects, composition, setting, colors, and visual style. Be specific about spatial arrangement. Keep it under 200 words.' }
            ]}]
          })
        });
        if (visionResp.ok) {
          const vd = await visionResp.json();
          imageDescription = vd.choices?.[0]?.message?.content || '';
        }
      } catch(e) { /* vision step optional — proceed without */ }

      // Step 2: Generate with DALL-E 3
      const basePrompt = imageDescription
        ? `A photorealistic wallpaper based on this scene: ${imageDescription}. `
        : 'A photorealistic landscape suitable as a widescreen dashboard background. ';
      const fullPrompt = basePrompt + prompts[phase] + ' Photorealistic, high quality, widescreen dashboard background wallpaper.';

      const dalleResp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_openaiApiKey}` },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: fullPrompt,
          n: 1,
          size: '1536x1024',
          quality: 'high',
        })
      });
      if (!dalleResp.ok) {
        const errBody = await dalleResp.json().catch(() => ({}));
        throw new Error(errBody.error?.message || 'OpenAI error ' + dalleResp.status);
      }
      const dalleData = await dalleResp.json();
      let outBlob;
      const b64 = dalleData.data?.[0]?.b64_json;
      if (b64) {
        const bytes = atob(b64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        outBlob = new Blob([arr], { type: 'image/png' });
      } else {
        const imgUrl = dalleData.data?.[0]?.url;
        if (!imgUrl) throw new Error('No image returned from OpenAI');
        const imgFetch = await fetch(imgUrl);
        if (!imgFetch.ok) throw new Error('Failed to download generated image');
        outBlob = await imgFetch.blob();
      }

      await _bgSave('gemini-' + phase, outBlob);
      if (_geminiPhases[phase]?.blobUrl) URL.revokeObjectURL(_geminiPhases[phase].blobUrl);
      if (!_geminiPhases[phase]) _geminiPhases[phase] = {};
      _geminiPhases[phase].generated = true;
      _geminiPhases[phase].blobUrl = URL.createObjectURL(outBlob);
      _saveSettings();
      _refreshGeminiPhasesUI();
      if (!silent) _setGeminiStatus(`${phase} generated!`, '#6BE3A4');
      if (_getWallpaperPhase(_getSimHour()) === phase) _applyGeminiWallpaper(phase);
    } catch(e) {
      if (!silent) _setGeminiStatus('✗ ' + e.message, '#F87171');
    } finally {
      _geminiGenerating = false;
    }
  }

  function _setGeminiStatus(msg, color) {
    const el = document.getElementById('tsp-gemini-status');
    if (el) { el.textContent = msg; el.style.color = color || ''; }
  }

  async function _checkAndTransitionWallpaper() {
    if (!_geminiEnabled) return;
    const currentPhase = _getWallpaperPhase(_getSimHour());
    if (currentPhase !== _lastWallpaperPhase) {
      await _applyGeminiWallpaper(currentPhase);
    }
  }

  async function _loadAgeFromDB() {
    try {
      const r = await fetch('/api/profile');
      if (!r.ok) return;
      const d = await r.json();
      if (d.age !== null && d.age !== undefined) {
        const dbAge = parseInt(d.age, 10) || null;
        if (dbAge && dbAge !== _userAge) {
          _userAge = dbAge;
          _saveSettings();
          _refreshSettingsUI();
        }
      }
    } catch {}
  }

  function _saveAgeToDB(age) {
    fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ age })
    }).catch(() => {});
  }

  function _bindSettings() {
    const isSettingsPage = !!document.getElementById('settings-page-content');
    const popup = isSettingsPage
      ? document.getElementById('settings-page-content')
      : document.getElementById('topbar-settings-popup');
    if (!popup) return;

    // On settings page: populate UI immediately; no popup toggle needed
    if (isSettingsPage) {
      _tabBgSelected = _getPageKey();
      _refreshSettingsUI();
    } else {
      // On non-settings pages: close popup on outside click
      document.addEventListener('click', e => {
        const settingsTabEl = document.getElementById('tbSettings');
        if (!popup.contains(e.target) && !settingsTabEl?.contains(e.target)) {
          popup.classList.remove('open');
          if (settingsTabEl) settingsTabEl.classList.remove('open');
        }
      });
    }

    // Legacy: settings button fallback (no longer in HTML but keep safely)
    const btn = document.getElementById('topbar-settings-btn');
    if (btn) {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const open = popup.classList.toggle('open');
        btn.classList.toggle('open', open);
        if (open) { _tabBgSelected = _getPageKey(); _refreshSettingsUI(); }
      });
    }

    popup.addEventListener('click', e => {
      // Collapsible group heads
      const groupHead = e.target.closest('.tsp-group-head');
      if (groupHead) {
        const group = groupHead.closest('.tsp-group');
        if (group) group.classList.toggle('open');
        return;
      }

      const b = e.target.closest('.tsp-btn[data-theme], .tsp-btn[data-sim]');
      if (b) {
        if (b.dataset.theme !== undefined) {
          // Bypass sky/body transitions so the theme snaps instantly
          document.body.classList.add('theme-instant');
          _themeMode = b.dataset.theme;
          document.body.classList.toggle('theme-light', _themeMode === 'light');
          document.body.classList.toggle('theme-dark',  _themeMode === 'dark');
          updateSky();
          _applyPageBackground();
          requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('theme-instant')));
        }
        if (b.dataset.sim !== undefined) { _simTime = b.dataset.sim === 'null' ? null : parseFloat(b.dataset.sim); updateSky(); startStrip(); _applyPageBackground(); }
        _saveSettings(); _refreshSettingsUI();
      }
      // Bar toggle clicks
      const tog = e.target.closest('.tsp-toggle[data-bar]');
      if (tog) {
        const key = tog.dataset.bar;
        _barSettings[key] = !(_barSettings[key] !== false);
        tog.classList.toggle('on', _barSettings[key]);
        _saveSettings(); startStrip();
      }
      // AI position button clicks
      const posBtn = e.target.closest('.tsp-btn[data-pos]');
      if (posBtn) {
        _aiSummaryPosition = posBtn.dataset.pos;
        popup.querySelectorAll('.tsp-btn[data-pos]').forEach(pb => pb.classList.toggle('active', pb.dataset.pos === _aiSummaryPosition));
        _saveSettings();
        window.dispatchEvent(new CustomEvent('ai-settings-changed'));
      }
      // Background tab selector
      const bgTabBtn = e.target.closest('.tsp-bg-tab');
      if (bgTabBtn) { _tabBgSelected = bgTabBtn.dataset.bgtab; _refreshBgUI(); }
      // Background mode
      const bgModeBtn = e.target.closest('.tsp-bg-mode');
      if (bgModeBtn) _bgCfgSet('mode', bgModeBtn.dataset.bgmode);
      // Background blur
      const bgBlurBtn = e.target.closest('.tsp-bg-blur');
      if (bgBlurBtn) _bgCfgSet('blur', bgBlurBtn.dataset.bgblur);
      // Background glass
      const bgGlassBtn = e.target.closest('.tsp-bg-glass');
      if (bgGlassBtn) _bgCfgSet('glass', bgGlassBtn.dataset.bgglass);

      // Performance mode
      const perfBtn = e.target.closest('.tsp-perf-mode');
      if (perfBtn) {
        _perfMode = perfBtn.dataset.perf;
        _applyPerfMode();
        _saveSettings();
        popup.querySelectorAll('.tsp-perf-mode').forEach(b => b.classList.toggle('active', b.dataset.perf === _perfMode));
      }
      // Widget theme
      const wthemeBtn = e.target.closest('.tsp-wtheme');
      if (wthemeBtn) {
        _widgetTheme = wthemeBtn.dataset.wtheme;
        _applyWidgetTheme();
        _saveSettings();
        popup.querySelectorAll('.tsp-wtheme').forEach(b => b.classList.toggle('active', b.dataset.wtheme === _widgetTheme));
      }
      // Bar theme
      const bthemeBtn = e.target.closest('.tsp-btheme');
      if (bthemeBtn) {
        _barTheme = bthemeBtn.dataset.btheme;
        updateSky();
        _saveSettings();
        popup.querySelectorAll('.tsp-btheme').forEach(b => b.classList.toggle('active', b.dataset.btheme === _barTheme));
      }
      // Fog theme
      const fthemeBtn = e.target.closest('.tsp-ftheme');
      if (fthemeBtn) {
        _fogTheme = fthemeBtn.dataset.ftheme;
        _applyFogTheme(); _saveSettings();
        popup.querySelectorAll('.tsp-ftheme').forEach(b => b.classList.toggle('active', b.dataset.ftheme === _fogTheme));
      }
      // Fog shape
      const fshapeBtn = e.target.closest('.tsp-fshape');
      if (fshapeBtn) {
        _fogShape = fshapeBtn.dataset.fshape;
        _applyFogShape(); _saveSettings();
        popup.querySelectorAll('.tsp-fshape').forEach(b => b.classList.toggle('active', b.dataset.fshape === _fogShape));
      }
      // Halftone toggle
      const htTogBtn = e.target.closest('#tsp-halftone-toggle');
      if (htTogBtn) {
        _halftoneEnabled = !_halftoneEnabled;
        htTogBtn.classList.toggle('on', _halftoneEnabled);
        _applyFogTheme(); _saveSettings();
      }
      // Top fog toggle
      const tfTogBtn = e.target.closest('#tsp-topfog-toggle');
      if (tfTogBtn) {
        _topFogEnabled = !_topFogEnabled;
        tfTogBtn.classList.toggle('on', _topFogEnabled);
        _applyTopFog(); _saveSettings();
      }
      // Top fog theme
      const tfthemeBtn = e.target.closest('.tsp-tftheme');
      if (tfthemeBtn) {
        _topFogTheme = tfthemeBtn.dataset.tftheme;
        _applyTopFogTheme(); _saveSettings();
        popup.querySelectorAll('.tsp-tftheme').forEach(b => b.classList.toggle('active', b.dataset.tftheme === _topFogTheme));
      }
      // Nav bar theme
      const nbthemeBtn = e.target.closest('.tsp-nbtheme');
      if (nbthemeBtn) {
        _navBarTheme = nbthemeBtn.dataset.nbtheme;
        _applyNavBarTheme(); _saveSettings();
        popup.querySelectorAll('.tsp-nbtheme').forEach(b => b.classList.toggle('active', b.dataset.nbtheme === _navBarTheme));
      }
      // Page subtabs theme
      const sthemeBtn = e.target.closest('.tsp-stheme');
      if (sthemeBtn) {
        _subtabTheme = sthemeBtn.dataset.stheme;
        _applySubtabTheme(); _saveSettings();
        popup.querySelectorAll('.tsp-stheme').forEach(b => b.classList.toggle('active', b.dataset.stheme === _subtabTheme));
      }
      // Settings panel style
      const spanelBtn = e.target.closest('.tsp-spanel');
      if (spanelBtn) {
        _settingsPanelStyle = spanelBtn.dataset.spanel;
        _applySettingsPanelStyle(); _saveSettings();
        popup.querySelectorAll('.tsp-spanel').forEach(b => b.classList.toggle('active', b.dataset.spanel === _settingsPanelStyle));
      }

      // Gemini phase preview click → generate individual phase
      const phasePreview = e.target.closest('.tsp-phase-preview');
      if (phasePreview && _geminiEnabled) {
        const ph = phasePreview.dataset.phase;
        if (ph) _generateAIVariant(ph, false);
      }
    });

    // AI enable toggle
    const aiToggle = document.getElementById('tsp-ai-toggle');
    if (aiToggle) {
      aiToggle.addEventListener('click', () => {
        _aiEnabled = !_aiEnabled;
        aiToggle.classList.toggle('on', _aiEnabled);
        _saveSettings();
        window.dispatchEvent(new CustomEvent('ai-settings-changed'));
      });
    }

    // AI key input
    const aiKeyEl = document.getElementById('tsp-ai-key');
    if (aiKeyEl) {
      aiKeyEl.addEventListener('input',  () => { _aiApiKey = aiKeyEl.value; });
      aiKeyEl.addEventListener('change', () => { _saveSettings(); });
    }

    // AI test connection button
    const aiTestBtn = document.getElementById('tsp-ai-test');
    const aiStatusEl = document.getElementById('tsp-ai-status');
    if (aiTestBtn) {
      aiTestBtn.addEventListener('click', async () => {
        if (!_aiApiKey) {
          if (aiStatusEl) { aiStatusEl.textContent = 'Enter an API key first'; aiStatusEl.style.color = 'rgba(255,200,80,.8)'; }
          return;
        }
        aiTestBtn.textContent = 'Testing…'; aiTestBtn.disabled = true;
        if (aiStatusEl) { aiStatusEl.textContent = ''; aiStatusEl.style.color = ''; }
        try {
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': _aiApiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
              'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:10, messages:[{role:'user',content:'Reply: ok'}] })
          });
          if (resp.ok) {
            if (aiStatusEl) { aiStatusEl.textContent = '✓ Connected'; aiStatusEl.style.color = '#6BE3A4'; }
            _saveSettings();
            window.dispatchEvent(new CustomEvent('ai-settings-changed'));
          } else {
            const err = await resp.json().catch(()=>({}));
            if (aiStatusEl) { aiStatusEl.textContent = '✗ ' + (err.error?.message || 'Error ' + resp.status); aiStatusEl.style.color = '#F87171'; }
          }
        } catch(e) {
          if (aiStatusEl) { aiStatusEl.textContent = '✗ ' + e.message; aiStatusEl.style.color = '#F87171'; }
        } finally {
          aiTestBtn.textContent = 'Test Connection'; aiTestBtn.disabled = false;
        }
      });
    }

    // Gemini toggle
    const geminiToggle = document.getElementById('tsp-gemini-toggle');
    if (geminiToggle) {
      geminiToggle.addEventListener('click', () => {
        _geminiEnabled = !_geminiEnabled;
        geminiToggle.classList.toggle('on', _geminiEnabled);
        const panel = document.getElementById('tsp-gemini-panel');
        if (panel) panel.style.display = _geminiEnabled ? '' : 'none';
        _saveSettings();
        if (_geminiEnabled) { _loadGeminiPhaseUrls().then(() => { _refreshGeminiPhasesUI(); _checkAndTransitionWallpaper(); }); }
        else { _applyPageBackground(); } // Revert to normal bg
      });
    }
    // Gemini API key
    const gemKeyEl = document.getElementById('tsp-gemini-key');
    if (gemKeyEl) {
      gemKeyEl.addEventListener('input', () => { _openaiApiKey = gemKeyEl.value; });
      gemKeyEl.addEventListener('change', () => { _saveSettings(); });
    }
    // OpenAI key test button
    const openaiTestBtn = document.getElementById('tsp-openai-test');
    if (openaiTestBtn) {
      openaiTestBtn.addEventListener('click', async () => {
        openaiTestBtn.disabled = true; openaiTestBtn.textContent = 'Testing…';
        try {
          const resp = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${_openaiApiKey}` }
          });
          if (resp.ok) {
            _setGeminiStatus('✓ Key valid', '#6BE3A4');
          } else {
            const e = await resp.json().catch(() => ({}));
            _setGeminiStatus('✗ ' + (e.error?.message || 'Invalid key'), '#F87171');
          }
        } catch(e) {
          _setGeminiStatus('✗ ' + e.message, '#F87171');
        }
        openaiTestBtn.textContent = 'Test Key'; openaiTestBtn.disabled = false;
      });
    }
    // Gemini source image upload
    const gemUploadBtn = document.getElementById('tsp-gemini-upload');
    if (gemUploadBtn) {
      gemUploadBtn.addEventListener('click', () => {
        const fi = document.createElement('input'); fi.type='file'; fi.accept='image/*';
        fi.addEventListener('change', async ev => {
          const file = ev.target.files[0]; if (!file) return;
          if (_geminiPhases._sourceBlobUrl) { URL.revokeObjectURL(_geminiPhases._sourceBlobUrl); delete _geminiPhases._sourceBlobUrl; }
          await _bgSave('gemini-source', file).catch(e => alert('Failed to save: ' + e.message));
          _geminiPhases._sourceBlobUrl = URL.createObjectURL(file);
          // Reset all generated phases since source changed
          ['sunrise','day','sunset','night'].forEach(ph => {
            if (_geminiPhases[ph]?.blobUrl) URL.revokeObjectURL(_geminiPhases[ph].blobUrl);
            delete _geminiPhases[ph];
            _bgDelete('gemini-' + ph).catch(() => {});
          });
          _saveSettings(); _refreshGeminiPhasesUI();
          // Auto-generate current phase
          if (_geminiEnabled && _openaiApiKey) {
            const curPhase = _getWallpaperPhase(_getSimHour());
            _generateAIVariant(curPhase, false);
          }
        });
        fi.click();
      });
    }
    // Gemini regenerate all
    const gemRegenBtn = document.getElementById('tsp-gemini-regen');
    if (gemRegenBtn) {
      gemRegenBtn.addEventListener('click', async () => {
        gemRegenBtn.disabled = true; gemRegenBtn.textContent = 'Generating…';
        // Reset all phases
        ['sunrise','day','sunset','night'].forEach(ph => {
          if (_geminiPhases[ph]?.blobUrl) URL.revokeObjectURL(_geminiPhases[ph].blobUrl);
          delete _geminiPhases[ph];
          _bgDelete('gemini-' + ph).catch(() => {});
        });
        _saveSettings();
        // Generate current phase first, then others lazily
        const curPhase = _getWallpaperPhase(_getSimHour());
        const others = ['sunrise','day','sunset','night'].filter(p => p !== curPhase);
        await _generateAIVariant(curPhase, false);
        for (const ph of others) await _generateAIVariant(ph, false);
        gemRegenBtn.disabled = false; gemRegenBtn.textContent = 'Regenerate All';
      });
    }
    // Gemini clear all
    const gemClearBtn = document.getElementById('tsp-gemini-clear');
    if (gemClearBtn) {
      gemClearBtn.addEventListener('click', () => {
        ['sunrise','day','sunset','night'].forEach(ph => {
          if (_geminiPhases[ph]?.blobUrl) URL.revokeObjectURL(_geminiPhases[ph].blobUrl);
          delete _geminiPhases[ph];
          _bgDelete('gemini-' + ph).catch(() => {});
        });
        _saveSettings(); _refreshGeminiPhasesUI(); _applyPageBackground();
        _lastWallpaperPhase = null;
      });
    }

    // Background image upload
    const uploadBtn = document.getElementById('tsp-bg-upload');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        const fi = document.createElement('input');
        fi.type = 'file'; fi.accept = 'image/*';
        fi.addEventListener('change', ev => {
          const file = ev.target.files[0];
          if (!file) return;
          // Invalidate any cached blob URL for this tab so it reloads fresh
          if (_bgBlobUrls[_tabBgSelected]) { URL.revokeObjectURL(_bgBlobUrls[_tabBgSelected]); delete _bgBlobUrls[_tabBgSelected]; }
          _bgSave(_tabBgSelected, file)
            .then(() => _bgCfgSet('mode', 'image'))
            .catch(e => alert('Failed to save image: ' + e.message));
        });
        fi.click();
      });
    }
    // Background image clear
    const clearBtn = document.getElementById('tsp-bg-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        _bgDelete(_tabBgSelected).catch(() => {});
        _bgCfgSet('mode', 'dynamic');
      });
    }

    const qInput = document.getElementById('tsp-custom-quote');
    if (qInput) {
      qInput.addEventListener('input', () => { _customQuote = qInput.value; });
      qInput.addEventListener('change', () => { _saveSettings(); startStrip(); });
    }

    // Age input
    const ageInput = document.getElementById('tsp-age-input');
    if (ageInput) {
      ageInput.addEventListener('input', () => {
        const v = parseInt(ageInput.value, 10);
        _userAge = (v > 0 && v <= 120) ? v : null;
        _refreshBMIDisplay();
      });
      ageInput.addEventListener('change', () => {
        _saveSettings();
        _saveAgeToDB(_userAge);
      });
    }

    // Location
    const latEl = document.getElementById('tsp-latitude');
    if (latEl) {
      latEl.addEventListener('input',  () => { const v = parseFloat(latEl.value); _latitude  = isNaN(v) ? null : v; });
      latEl.addEventListener('change', () => { _saveSettings(); updateSky(); });
    }
    const lonEl = document.getElementById('tsp-longitude');
    if (lonEl) {
      lonEl.addEventListener('input',  () => { const v = parseFloat(lonEl.value); _longitude = isNaN(v) ? null : v; });
      lonEl.addEventListener('change', () => { _saveSettings(); updateSky(); });
    }

    // Supabase credentials
    const supaUrlEl = document.getElementById('tsp-supa-url');
    if (supaUrlEl) {
      supaUrlEl.addEventListener('input', () => { _supabaseUrl = supaUrlEl.value.trim(); });
      supaUrlEl.addEventListener('change', () => { _saveSettings(); });
    }
    const supaKeyEl = document.getElementById('tsp-supa-key');
    if (supaKeyEl) {
      supaKeyEl.addEventListener('input', () => { _supabaseKey = supaKeyEl.value.trim(); });
      supaKeyEl.addEventListener('change', () => { _saveSettings(); });
    }

    // Spotify Client ID
    const spotifyClientEl = document.getElementById('tsp-spotify-client-id');
    if (spotifyClientEl) {
      spotifyClientEl.addEventListener('input', () => { _spotifyClientId = spotifyClientEl.value.trim(); });
      spotifyClientEl.addEventListener('change', () => { _saveSettings(); });
    }

    // Refresh Spotify UI when SpotifyAPI fires events
    window.addEventListener('spotify-connected', () => { _refreshSpotifyUI(); startStrip(); });
    window.addEventListener('spotify-updated',   () => { startStrip(); });
  }

  // ─────────────────────────── Sync heights ────────────────────
  function _syncNavH() {
    const strip = document.getElementById('topbar-strip');
    const nav   = document.getElementById('topbar');
    const stripH = strip ? strip.offsetHeight : STRIP_H;
    const navH   = nav   ? nav.offsetHeight   : 72;
    const r = document.documentElement;
    r.style.setProperty('--nav-h',    '0px');
    r.style.setProperty('--nav-bar-h', navH + 'px');
    r.style.setProperty('--header-h', (stripH + 10) + 'px');
  }

  // ─────────────────────────── Boot ────────────────────────────
  function boot() {
    injectStyleAndHTML();
    _syncNavH();
    updateSky();
    render();
    startStrip();
    lockGestures();
    startModalLock();
    _initSettings();
    _loadAgeFromDB(); // async, updates _userAge if DB has a newer value
    _applyPerfMode();
    _bgMigrateLocalStorage();
    _applyPageBackground();
    _bindSettings();
    // Apply theme body classes on boot
    document.body.classList.toggle('theme-light', _themeMode === 'light');
    document.body.classList.toggle('theme-dark',  _themeMode === 'dark');

    window.addEventListener('resize', _syncNavH);
    const refresh=()=>{render();startStrip();};
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('goals-changed', refresh);
    window.addEventListener('academic-changed', refresh);
    window.addEventListener('finance-changed', refresh);
    window.addEventListener('spotify-updated', ()=>startStrip());
    document.addEventListener('visibilitychange', () => {
      const sky = document.getElementById('topbar-sky');
      if (document.hidden) {
        if (sky) sky.style.animationPlayState = 'paused';
      } else {
        if (sky && _perfMode !== 'performance') sky.style.animationPlayState = 'running';
        refresh();
      }
    });
    setInterval(render, 30000);
    setInterval(updateSky, 30000);
    // Gemini wallpaper: check for phase transitions every 5 minutes
    setInterval(_checkAndTransitionWallpaper, 300000);
    // Subtab sync — re-run after a tick so in-page navs are present in the DOM
    setTimeout(_syncSubtabs, 50);

    // Expose AI module for pages to call
    window.TopbarAI = {
      isEnabled:          () => _aiEnabled,
      getApiKey:          () => _aiApiKey,
      getSummaryPosition: () => _aiSummaryPosition,
      getUserAge:         () => _userAge,
      async generateSummary(prompt) {
        if (!_aiEnabled || !_aiApiKey) return null;
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key':  _aiApiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 380,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error?.message || 'API error ' + resp.status);
        }
        const data = await resp.json();
        return data.content[0].text.trim();
      }
    };
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  } else {
    boot();
  }
})();
