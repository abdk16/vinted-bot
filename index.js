require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

console.log('🚀 Démarrage du bot v3 (API Vinted directe)...');
console.log('📋 Node version :', process.version);

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught exception :', err && err.message ? err.message : err);
  console.error(err && err.stack ? err.stack : '');
});
process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled rejection :', err && err.message ? err.message : err);
});

// ==================== VARIABLES ====================
const VINTED_URL = process.env.VINTED_URL || '';
const CHANNEL_ID = String(process.env.CHANNEL_ID || '').trim();
const TIME_RANGE_MIN = Number(process.env.TIME_RANGE_MIN || 10);
const CHECK_INTERVAL_SEC = Number(process.env.CHECK_INTERVAL_SEC || 30);

console.log('--- Vérification des variables ---');
console.log('   DISCORD_TOKEN : ' + (process.env.DISCORD_TOKEN ? '✅ présent (' + process.env.DISCORD_TOKEN.length + ' caractères)' : '❌ MANQUANT'));
if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN !== process.env.DISCORD_TOKEN.trim()) {
  console.error('❌ ATTENTION : DISCORD_TOKEN a des espaces invisibles au début ou à la fin !');
}
console.log('   CHANNEL_ID    : ' + (CHANNEL_ID ? '✅ présent (' + CHANNEL_ID + ')' : '❌ MANQUANT'));
console.log('   VINTED_URL    : ' + (VINTED_URL ? '✅ présent' : '❌ MANQUANT'));
console.log('   TIME_RANGE_MIN: ' + TIME_RANGE_MIN);
console.log('----------------------------------');

// ==================== SESSION VINTED (nouvelle API) ====================
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sessionState = { cookie: null, anonId: null, csrfToken: null, locale: 'fr-FR' };

async function fetchVintedSession() {
  const siteBase = new URL(VINTED_URL).origin;
  console.log('🍪 Récupération de la session Vinted sur ' + siteBase + ' ...');
  const res = await fetch(siteBase + '/', {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
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
  sessionState.locale = langMatch ? langMatch[1] : 'fr-FR';
  sessionState.csrfToken = csrfMatch ? csrfMatch[1] : null;
  console.log('🍪 Session Vinted OK (locale ' + sessionState.locale + ')');
}

function buildSearchParams() {
  const u = new URL(VINTED_URL);
  const params = new URLSearchParams();
  for (const [key, value] of u.searchParams.entries()) {
    if (key === 'catalog[]' || key === 'catalog') {
      params.append('catalog[]', value);
    } else {
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
  const res = await fetch(url, {
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
      'Sec-Fetch-Mode': 'cors',
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
  if (res.status === 429) {
    throw new Error('Rate limit Vinted (429)');
  }
  if (!res.ok) {
    throw new Error('API Vinted statut ' + res.status);
  }
  return res.json();
}

// ==================== CLIENT DISCORD ====================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function isValidHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

const seenIds = new Set();
const SEEN_LIMIT = 500;

function rememberId(id) {
  seenIds.add(String(id));
  if (seenIds.size > SEEN_LIMIT) {
    const it = seenIds.values();
    for (let i = 0; i < seenIds.size - SEEN_LIMIT; i++) it.next();
    seenIds.delete(it.next().value);
  }
}

function sendItem(channel, item) {
  try {
    const price = item.total_item_price
      ? (item.total_item_price + ' ' + (item.currency || '')).trim()
      : item.price
        ? (item.price + ' ' + (item.currency || '')).trim()
        : 'N/A';
    const embed = new EmbedBuilder()
      .setColor(0x09b1ba)
      .setTitle(String(item.title || 'Nouvelle annonce').slice(0, 256))
      .addFields(
        { name: 'Prix', value: String(price).slice(0, 1024) || 'N/A', inline: true },
        { name: 'Marque', value: String(item.brand_title || 'N/A').slice(0, 1024), inline: true },
        { name: 'Taille', value: String(item.size_title || 'N/A').slice(0, 1024), inline: true }
      )
      .setTimestamp();
    if (isValidHttpUrl(item.url)) embed.setURL(item.url);
    const photoUrl = item.photo && (item.photo.full_size_url || (item.photo.high_resolution && item.photo.high_resolution.url) || item.photo.url);
    if (isValidHttpUrl(photoUrl)) embed.setThumbnail(photoUrl);
    channel
      .send({ content: '🔥 Nouvelle annonce Vinted !', embeds: [embed] })
      .catch((err) => console.error('Erreur envoi Discord :', err.message));
  } catch (err) {
    console.error('Erreur embed :', err.message);
  }
}

client.once('ready', async () => {
  console.log('✅ Connecté en tant que ' + client.user.tag);

if (CHANNEL_ID) {
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      await channel.send('🟢 **Bot en ligne !**\nJe surveille Vinted et j envoie les nouvelles annonces ici.\nBot : ' + client.user.tag);
      console.log('📨 Message "Bot en ligne" envoyé dans le salon ✅');
    } catch (err) {
      console.error('❌ Impossible d envoyer le message de démarrage : ' + err.message);
    }
  }

if (!VINTED_URL || !CHANNEL_ID) {
    console.error('❌ Variables manquantes : VINTED_URL et CHANNEL_ID sont obligatoires.');
    return;
  }

console.log('👀 Surveillance lancée : ' + VINTED_URL);

const checkNewItems = async () => {
    let channel;
    try {
      channel = await client.channels.fetch(CHANNEL_ID);
    } catch (err) {
      console.error('❌ Salon introuvable : ' + err.message);
      return;
    }
    let data;
    try {
      data = await searchVinted();
    } catch (err) {
      console.error('❌ Erreur API Vinted : ' + err.message);
      return;
    }
    const items = (data && data.items) || [];
    const now = Date.now();
    const windowMs = Math.max(TIME_RANGE_MIN, 1) * 60 * 1000;
    for (const item of items) {
      try {
        const id = String(item.id || '');
        if (!id || seenIds.has(id)) continue;
        const ts = item.photo && item.photo.high_resolution && item.photo.high_resolution.timestamp;
        const ageMs = ts ? now - ts * 1000 : 0;
        const fresh = ts ? ageMs <= windowMs : true;
        rememberId(id);
        if (fresh) sendItem(channel, item);
      } catch (err) {
        console.error('Erreur traitement item :', err.message);
      }
    }
  };

// Premier passage : marquer les annonces existantes comme vues (anti-spam)
  try {
    const data = await searchVinted();
    const items = (data && data.items) || [];
    items.forEach((it) => rememberId(String(it.id || '')));
    console.log('📦 ' + items.length + ' annonces existantes marquées comme vues');
    console.log('👂 En écoute des nouvelles annonces...');
  } catch (err) {
    console.error('❌ Erreur API Vinted au démarrage : ' + err.message);
  }

setInterval(() => {
    checkNewItems().catch((e) => console.error('Erreur cycle :', e.message));
  }, CHECK_INTERVAL_SEC * 1000);
});

client.on('error', (err) => console.error('Erreur client Discord :', err.message));

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN manquant : le bot ne peut pas se connecter.');
} else {
  console.log('🔑 Connexion à Discord en cours...');
  client.login(process.env.DISCORD_TOKEN).catch((err) => {
    console.error('❌ Connexion Discord impossible :', err.message);
    if (String(err.message).includes('invalid token')) {
      console.error('   → Token invalide : Reset Token sur le portail Discord puis recoller dans Railway.');
    }
  });
}
