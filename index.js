require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

console.log('Demarrage du bot v5 (annonces enrichies)');

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err && err.message ? err.message : err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err && err.message ? err.message : err);
});

const VINTED_URL = process.env.VINTED_URL || '';
const CHANNEL_ID = String(process.env.CHANNEL_ID || '').trim();
const TIME_RANGE_MIN = Number(process.env.TIME_RANGE_MIN || 10);
const CHECK_INTERVAL_SEC = Number(process.env.CHECK_INTERVAL_SEC || 30);

console.log('--- Variables ---');
console.log('DISCORD_TOKEN : ' + (process.env.DISCORD_TOKEN ? 'OK present' : 'MANQUANT'));
console.log('CHANNEL_ID : ' + (CHANNEL_ID || 'MANQUANT'));
console.log('VINTED_URL : ' + (VINTED_URL || 'MANQUANT'));
console.log('-----------------');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sessionState = { cookie: null, anonId: null, csrfToken: null, locale: 'fr-FR' };

function siteOrigin() {
  return new URL(VINTED_URL).origin;
}

function apiOrigin() {
  const host = new URL(VINTED_URL).hostname.replace(/^www\./, '');
  return 'https://api.' + host;
}

async function fetchVintedSession() {
  const base = siteOrigin();
  console.log('Recuperation session Vinted sur ' + base);
  const res = await fetch(base + '/', {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
    redirect: 'follow',
  });
  const html = await res.text();
  const setCookie = res.headers.get('set-cookie') || '';
  const m = setCookie.match(/access_token_web=([^;]+)/);
  if (!m) {
    throw new Error('Cookie access_token_web introuvable (statut ' + res.status + ')');
  }
  sessionState.cookie = m[1];
  sessionState.anonId = (res.headers.get('x-anon-id') || '').trim() || null;
  const lang = html.match(/<html[^>]*\blang=["']([A-Za-z]{2}(?:-[A-Za-z0-9]+)?)["']/i);
  const csrf = html.match(/"CSRF_TOKEN"\s*:\s*"([0-9a-fA-F-]{36})"/);
  sessionState.locale = lang ? lang[1] : 'fr-FR';
  sessionState.csrfToken = csrf ? csrf[1] : null;
  console.log('Session Vinted OK');
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

let searchRetries = 0;

async function searchVinted() {
  if (!sessionState.cookie) {
    await fetchVintedSession();
  }
  const params = buildSearchParams();
  params.set('page', '1');
  params.set('per_page', '20');
  params.set('time', String(Math.floor(Date.now() / 1000)));
  const origin = siteOrigin();
  const url = apiOrigin() + '/svc-catalogue/items?' + params.toString();
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': sessionState.locale + ',en;q=0.5',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      Origin: origin,
      Referer: origin + '/',
      Locale: sessionState.locale,
      Platform: 'web',
      'X-Next-App': 'marketplace-web',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      Cookie: 'access_token_web=' + sessionState.cookie,
      ...(sessionState.anonId ? { 'X-Anon-Id': sessionState.anonId } : {}),
      ...(sessionState.csrfToken ? { 'X-Csrf-Token': sessionState.csrfToken } : {}),
    },
  });
  if (res.status === 401 && searchRetries < 3) {
    searchRetries += 1;
    sessionState.cookie = null;
    return searchVinted();
  }
  searchRetries = 0;
  if (!res.ok) {
    throw new Error('API Vinted statut ' + res.status);
  }
  return res.json();
}

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

function rememberId(id) {
  seenIds.add(String(id));
  if (seenIds.size > 500) {
    seenIds.delete(seenIds.values().next().value);
  }
}

function buildItemUrl(item) {
  const base = siteOrigin();
  const raw = item.url || '';
  if (isValidHttpUrl(raw)) return raw;
  if (raw) return base + raw;
  return base + '/items/' + item.id;
}

function sendItem(channel, item) {
  try {
    const cur = item.currency || '';
    const priceVal = item.total_item_price != null ? item.total_item_price : (item.price != null ? item.price : null);
    const price = priceVal != null ? priceVal + ' ' + cur : 'N/A';

const user = item.user || {};
    const login = user.login || item.user_login || 'inconnu';
    const rep = user.feedback_reputation != null ? user.feedback_reputation : item.user_feedback_reputation;
    const cnt = user.feedback_count != null ? user.feedback_count : item.user_feedback_count;
    const note = rep != null ? rep + '%' : '-';
    const avis = cnt != null ? String(cnt) : '0';

const url = buildItemUrl(item);
    const memberUrl = login !== 'inconnu' ? siteOrigin() + '/member/' + login : null;

const photoUrl = item.photo && (item.photo.full_size_url || (item.photo.high_resolution && item.photo.high_resolution.url) || item.photo.url);

const embed = new EmbedBuilder()
      .setColor(0x09b1ba)
      .setTitle(String(item.title || 'Nouvelle annonce').slice(0, 256))
      .setURL(url)
      .addFields(
        { name: 'Prix', value: String(price).slice(0, 1024), inline: true },
        { name: 'Marque', value: String(item.brand_title || 'N/A').slice(0, 1024), inline: true },
        { name: 'Taille', value: String(item.size || item.size_title || 'N/A').slice(0, 1024), inline: true },
        { name: 'Etat', value: String(item.status || item.state || 'N/A').slice(0, 1024), inline: true },
        { name: 'Ville', value: String(item.city || 'N/A').slice(0, 1024), inline: true },
        { name: 'Vendeur', value: login, inline: true },
        { name: 'Note vendeur', value: note + ' (' + avis + ' avis)', inline: false },
      )
      .setTimestamp();

if (isValidHttpUrl(photoUrl)) embed.setThumbnail(photoUrl);
    if (memberUrl) embed.setAuthor({ name: 'Vendeur : ' + login, url: memberUrl });

const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Voir l'annonce")
        .setStyle(ButtonStyle.Link)
        .setURL(url)
    );

channel
      .send({ content: 'Nouvelle annonce Vinted', embeds: [embed], components: [row] })
      .catch((err) => console.error('Erreur envoi Discord: ' + err.message));
  } catch (err) {
    console.error('Erreur embed: ' + err.message);
  }
}

client.once('ready', async () => {
  console.log('Connecte en tant que ' + client.user.tag);

if (CHANNEL_ID) {
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      await channel.send('Bot en ligne ! Annonces enrichies activees.');
      console.log('Message de demarrage envoye');
    } catch (err) {
      console.error('Impossible d envoyer le message de demarrage: ' + err.message);
    }
  }

if (!VINTED_URL || !CHANNEL_ID) {
    console.error('VINTED_URL et CHANNEL_ID sont obligatoires.');
    return;
  }

console.log('Surveillance: ' + VINTED_URL);

const checkNewItems = async () => {
    let channel;
    try {
      channel = await client.channels.fetch(CHANNEL_ID);
    } catch (err) {
      console.error('Salon introuvable: ' + err.message);
      return;
    }
    let data;
    try {
      data = await searchVinted();
    } catch (err) {
      console.error('Erreur API Vinted: ' + err.message);
      return;
    }
    const items = (data && data.items) || [];
    const now = Date.now();
    const windowMs = Math.max(TIME_RANGE_MIN, 1) * 60 * 1000;
    for (const item of items) {
      const id = String(item.id || '');
      if (!id || seenIds.has(id)) continue;
      const ts = item.photo && item.photo.high_resolution && item.photo.high_resolution.timestamp;
      const fresh = ts ? now - ts * 1000 <= windowMs : true;
      rememberId(id);
      if (fresh) {
        try {
          sendItem(channel, item);
        } catch (err) {
          console.error('Erreur embed: ' + err.message);
        }
      }
    }
  };

try {
    const data = await searchVinted();
    const items = (data && data.items) || [];
    items.forEach((it) => rememberId(String(it.id || '')));
    console.log(items.length + ' annonces existantes marquees comme vues');
    console.log('En ecoute des nouvelles annonces...');
  } catch (err) {
    console.error('Erreur API Vinted au demarrage: ' + err.message);
  }

setInterval(() => {
    checkNewItems().catch((e) => console.error('Erreur cycle: ' + e.message));
  }, CHECK_INTERVAL_SEC * 1000);
});

client.on('error', (err) => console.error('Erreur client Discord: ' + err.message));

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN manquant.');
} else {
  client.login(process.env.DISCORD_TOKEN).catch((err) => {
    console.error('Connexion Discord impossible: ' + err.message);
  });
}
