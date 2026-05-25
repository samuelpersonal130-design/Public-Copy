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

// ═══════════════════════════════════════════════════════════════
// Spotify PKCE Integration — spotify.js
// Include on any page: <script src="spotify.js"></script>
// Access via: window.SpotifyAPI
//
// SETUP:
//  1. Go to https://developer.spotify.com/dashboard
//  2. Select your app → Edit Settings
//  3. Add your page URL to "Redirect URIs" — e.g.:
//     http://127.0.0.1:5500/home.html   (VS Code Live Server)
//  4. Save. Then click Connect in the dashboard Settings popup.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const CLIENT_ID    = localStorage.getItem('topbar:spotifyClientId') || '';
  const SCOPES       = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
  const TOKEN_KEY    = 'spotify:tokens';
  const VERIFIER_KEY = 'spotify:verifier';

  // Always redirect back to home.html — register this one URL in Spotify Dashboard
  function _redirectUri() {
    return window.location.origin + '/home.html';
  }

  // ── PKCE helpers ──────────────────────────────────────────────
  function _base64url(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function _genVerifier() {
    return _base64url(crypto.getRandomValues(new Uint8Array(64)));
  }

  async function _genChallenge(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return _base64url(digest);
  }

  // ── Token storage ─────────────────────────────────────────────
  function _getTokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { return null; }
  }
  function _setTokens(t) { localStorage.setItem(TOKEN_KEY, JSON.stringify(t)); }
  function _clearTokens() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(VERIFIER_KEY); }

  // ── Auth flow ─────────────────────────────────────────────────
  async function login() {
    if (!CLIENT_ID) { alert('Enter your Spotify Client ID in Settings → Media & Spotify first.'); return; }
    const verifier   = await _genVerifier();
    const challenge  = await _genChallenge(verifier);
    localStorage.setItem(VERIFIER_KEY, verifier);

    const params = new URLSearchParams({
      client_id:             CLIENT_ID,
      response_type:         'code',
      redirect_uri:          _redirectUri(),
      scope:                 SCOPES,
      code_challenge_method: 'S256',
      code_challenge:        challenge,
    });
    window.location.href = 'https://accounts.spotify.com/authorize?' + params;
  }

  async function _handleCallback(code) {
    const verifier = localStorage.getItem(VERIFIER_KEY);
    if (!verifier) return false;
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     CLIENT_ID,
          grant_type:    'authorization_code',
          code,
          redirect_uri:  _redirectUri(),
          code_verifier: verifier,
        }),
      });
      if (!res.ok) { console.error('[Spotify] Token exchange failed', await res.text()); return false; }
      const data = await res.json();
      _setTokens({
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    Date.now() + data.expires_in * 1000,
      });
      localStorage.removeItem(VERIFIER_KEY);
      // Clean code from URL
      const url = new URL(window.location.href);
      url.searchParams.delete('code'); url.searchParams.delete('state');
      window.history.replaceState({}, '', url.toString());
      return true;
    } catch (e) { console.error('[Spotify] Token exchange error', e); return false; }
  }

  async function _refreshToken() {
    const tokens = _getTokens();
    if (!tokens || !tokens.refresh_token) return false;
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     CLIENT_ID,
          grant_type:    'refresh_token',
          refresh_token: tokens.refresh_token,
        }),
      });
      if (!res.ok) { _clearTokens(); return false; }
      const data = await res.json();
      _setTokens({
        access_token:  data.access_token,
        refresh_token: data.refresh_token || tokens.refresh_token,
        expires_at:    Date.now() + data.expires_in * 1000,
      });
      return true;
    } catch { _clearTokens(); return false; }
  }

  async function getAccessToken() {
    let tokens = _getTokens();
    if (!tokens) return null;
    if (Date.now() > tokens.expires_at - 60_000) {
      const ok = await _refreshToken();
      if (!ok) return null;
      tokens = _getTokens();
    }
    return tokens ? tokens.access_token : null;
  }

  function isConnected() { return !!_getTokens(); }

  function logout() {
    _clearTokens();
    _currentTrack = null;
    _stopPolling();
    window.dispatchEvent(new CustomEvent('spotify-updated', { detail: null }));
  }

  // ── API calls ─────────────────────────────────────────────────
  async function _apiGet(endpoint) {
    const token = await getAccessToken();
    if (!token) return null;
    try {
      const res = await fetch('https://api.spotify.com/v1' + endpoint, {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.status === 204 || res.status === 202) return null;
      if (res.status === 401) { _clearTokens(); return null; }
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  async function _apiPut(endpoint, body) {
    const token = await getAccessToken();
    if (!token) return false;
    try {
      const res = await fetch('https://api.spotify.com/v1' + endpoint, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401) { _clearTokens(); return false; }
      return res.ok || res.status === 204;
    } catch { return false; }
  }

  async function _apiPost(endpoint) {
    const token = await getAccessToken();
    if (!token) return false;
    try {
      const res = await fetch('https://api.spotify.com/v1' + endpoint, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.status === 401) { _clearTokens(); return false; }
      return res.ok || res.status === 204;
    } catch { return false; }
  }

  // ── Playback controls ─────────────────────────────────────────
  async function play() {
    const ok = await _apiPut('/me/player/play');
    if (ok) setTimeout(fetchCurrentlyPlaying, 300);
    return ok;
  }

  async function pause() {
    const ok = await _apiPut('/me/player/pause');
    if (ok) setTimeout(fetchCurrentlyPlaying, 300);
    return ok;
  }

  async function togglePlay() {
    return _currentTrack && _currentTrack.isPlaying ? pause() : play();
  }

  async function next() {
    const ok = await _apiPost('/me/player/next');
    if (ok) setTimeout(fetchCurrentlyPlaying, 600);
    return ok;
  }

  async function previous() {
    const ok = await _apiPost('/me/player/previous');
    if (ok) setTimeout(fetchCurrentlyPlaying, 600);
    return ok;
  }

  // ── Now Playing ───────────────────────────────────────────────
  let _currentTrack = null;
  let _pollTimer    = null;

  async function fetchCurrentlyPlaying() {
    const data = await _apiGet('/me/player/currently-playing');
    if (!data || !data.item) {
      _currentTrack = null;
    } else {
      _currentTrack = {
        name:     data.item.name,
        artist:   data.item.artists.map(a => a.name).join(', '),
        album:    data.item.album.name,
        albumArt: (data.item.album.images[0] || {}).url || null,
        duration: data.item.duration_ms || 0,
        progress: data.progress_ms || 0,
        isPlaying: !!data.is_playing,
      };
    }
    window.dispatchEvent(new CustomEvent('spotify-updated', { detail: _currentTrack }));
    return _currentTrack;
  }

  function getCurrentTrack() { return _currentTrack; }

  function startPolling(ms = 15000) {
    _stopPolling();
    fetchCurrentlyPlaying();
    _pollTimer = setInterval(fetchCurrentlyPlaying, ms);
  }

  function _stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  // ── Init (handles OAuth callback) ────────────────────────────
  async function init() {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('code');
    if (code) {
      const ok = await _handleCallback(code);
      if (ok) {
        window.dispatchEvent(new CustomEvent('spotify-connected'));
        startPolling();
      }
      return;
    }
    if (isConnected()) startPolling();
  }

  // ── Public API ────────────────────────────────────────────────
  window.SpotifyAPI = {
    login,
    logout,
    isConnected,
    getCurrentTrack,
    fetchCurrentlyPlaying,
    startPolling,
    stopPolling: _stopPolling,
    getAccessToken,
    init,
    play,
    pause,
    togglePlay,
    next,
    previous,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
