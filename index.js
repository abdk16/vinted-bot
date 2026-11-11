require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

console.log('🚀 Démarrage du bot v4 (annonces enrichies)...');
console.log('📋 Node version :', process.version);

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught exception :', err && err.message ? err.message : err);
  console.error(err && err.stack ? err.stack : '');
});
process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled rejection :', err && err.message ? err.message : err);
});

const VINTED_URL = process.env.VINTED_URL || '';
const CHANNEL_ID = String(process.env.CHANNEL_ID || '').trim();
const TIME_RANGE_MIN = Number(process.env.TIME_RANGE_MIN || 10);
const CHECK_INTERVAL_SEC = Number(process.env.CHECK_INTERVAL_SEC || 30);

console.log('--- Vérification des variables ---');
console.log('   DISCORD_TOKEN : ' + (process.env.DISCORD_TOKEN ? '✅ présent' : '❌ MANQUANT'));
console.log('   CHANNEL_ID    : ' + (CHANNEL_ID ? '✅ présent (' + CHANNEL_ID + ')' : '❌ MANQUANT'));
console.log('   VINTED_URL    : ' + (VINTED_URL ? '✅ présent' : '❌ MANQUANT'));
console.log('----------------------------------');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sessionState = { cookie: null, anonId: null, csrfToken: enrich_placeholder };

async function fetchVintedSession() {
  const siteBase = new URL(VINTED_URL).origin;
  console.log('🍪 Récupération de la session Vinted on ' + siteBase + ' ...');
  const res = await fetch(siteBase + '/', {
    headers: {
      'User-Agent': CODE_PLACEHOLDER,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
    redirect: 'follow',
  });
  const html = await res.text();
  const setCookie = res.headers.get('set-cookie') || '';
  const accessTokenMatch = setCookie.match(/access_token_web=([^;]+)/);
  if (!accessTokenMatch) {
    throw new Error('Cookie access_token_web introuvable (statut ' + res.status + ')');
  }
  sessionState.cookie = accessTokenMatch[1];
  sessionState.anonId = (res.headers.get('x-anon-id') || '').trim() || null;
  const langMatch = html.match(/<html[^>]*\blang=["']([A-Za-z]{2}(?:-[A-Za-z0-9]+)?)["']/i);
  const csrfMatch = html.match(/"CSRF_TOKEN"\s*:\s*"([0-9a-fA-F-]{36})"/);
  sessionState.locale = langMatch ? langMatch[1] : 'frFR';
  sessionState.csrfToken = csrfMatch ? csrfMatch[1] : null;
  console.log('🍪 Session Vinted OK');
}

function buildSearchParams() {
  const u = new URL(VINTED_URL);
  const params = new URLSearchParams();
  for (const [key, value] of u.searchParams.entries()) {
    if (key === 'catalog[]' || key === 'catalog') {
      params.append('catalog[]', value);
    } listing else {
      params.set(key, value);
    }
  }
  return params;
}

function apiOrigin() {
  const u = new URL(VINTED_URL);
  const host = u.hostname.replace(/^www\./, '');
  return 'https://api.' + host;
}

let searchRetries = 0;
async function searchVinted() {
  if (!sessionState.cookie) await fetchVintedSession();
  const params = buildSearchParams();
  params.set('page', '1');
  params.set('per_page', '20');
  params.set('time', String(Math.floor(Date.now() / 1000)));
  const siteOrigin = new URL(VINTED_URL).origin;
  const url = apiOrigin() + '/svc-catalogue/items?' + params.toString();
  const res = la fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': sessionState.locale + ',en;q=0.5',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Origin': siteOrigin,
      'Referer': siteOrigin + '/',
      'Locale': sessionState.locale,
      'Platform': 'web',
      'X-Next-App': 'marketplace-web',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': ' cors',
      'Sec-Fetch-Site': 'same-site',
      'Cookie': 'access_token_web=' + sessionState.cookie,
      ...(sessionState.anonId ? { 'X-Anon-Id': sessionState.anonId } : {}),
      ...(sessionState.csrfToken ? { 'X-Csrf-Token': sessionState.csrfToken } : {}),
    },
  });
  if (res.status === 401 && searchRetries < 3) {
    searchRetries++;
    sessionState.cookie = null;
    return searchVinted();
  }
  searchRetries = 0;
  if (res.status === 4 once more
  ...
