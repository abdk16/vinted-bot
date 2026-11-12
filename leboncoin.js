require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

console.log('Demarrage du bot Leboncoin (via API LeBonDeal)');

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err && err.message ? err.message : err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err && err.message ? err.message : err);
});

const LBC_API_KEY = process.env.LBC_API_KEY || '';
const LBC_SEARCH_URL = process.env.LBC_SEARCH_URL || '';
const CHANNEL_ID = String(process.env.CHANNEL_ID || '').trim();
const CHECK_INTERVAL_SEC = Number(process.env.CHECK_INTERVAL_SEC || 60);

console.log('--- Variables ---');
console.log('DISCORD_TOKEN : ' + (process.env.DISCORD_TOKEN ? 'OK present' : 'MANQUANT'));
console.log('CHANNEL_ID : ' + (CHANNEL_ID || 'MANQUANT'));
console.log('LBC_API_KEY : ' + (LBC_API_KEY ? 'OK present' : 'MANQUANT'));
console.log('LBC_SEARCH_URL : ' + (LBC_SEARCH_URL || 'MANQUANT'));
console.log('-----------------');

const API_ENDPOINT = 'https://bot.lebondeal-bot.fr/api/v1/leboncoin/search?url=';

function isValidHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function textValue(value, fallback = 'N/A') {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'object') return String(value);
  const nested = value.title ?? value.name ?? value.label ?? value.value ?? value.amount;
  return nested == null || nested === '' ? fallback : String(nested);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const seenIds = new Set();

function rememberId(id) {
  seenIds.add(String(id));
  if (seenIds.size > 500) {
    seenIds.delete(seenIds.values().next().value);
  }
}

async function searchLeboncoin() {
  const url = API_ENDPOINT + encodeURIComponent(LBC_SEARCH_URL);
  const res = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + LBC_API_KEY,
      Accept: 'application/json',
    },
  });
  if (res.status === 401) throw new Error('Cle API LeBonDeal invalide (401)');
  if (res.status === 429) throw new Error('Limite de debit atteinte (429)');
  if (!res.ok) throw new Error('API LeBonDeal statut ' + res.status);
  const data = await res.json();
  return (data && (data.items || data.ads)) || [];
}

function sendItem(channel, ad) {
  try {
    const price = ad.price != null ? textValue(ad.price) + ' €' : 'N/A';
    const photos = ad.images || ad.photos;
    const photoUrl = Array.isArray(photos) ? photos[0] : photos;
    const seller = textValue(ad.seller_name ?? (ad.owner && ad.owner.name), 'inconnu');
    const url = isValidHttpUrl(ad.url) ? ad.url : 'https://www.leboncoin.fr/ad/' + ad.id;

const embed = new EmbedBuilder()
      .setColor(0xFF6600)
      .setTitle(textValue(ad.title, 'Nouvelle annonce').slice(0, 256))
      .setURL(url)
      .addFields(
        { name: 'Prix', value: price.slice(0, 1024), inline: true },
        { name: 'Ville', value: textValue(ad.city ?? ad.location, 'N/A').slice(0, 1024), inline: true },
        { name: 'Vendeur', value: seller.slice(0, 1024), inline: true },
      )
      .setTimestamp();

if (isValidHttpUrl(photoUrl)) embed.setThumbnail(photoUrl);

const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Voir l'annonce")
        .setStyle(ButtonStyle.Link)
        .setURL(url),
    );

channel
      .send({ content: 'Nouvelle annonce Leboncoin', embeds: [embed], components: [row] })
      .catch((err) => console.error('Erreur envoi Discord: ' + err.message));
  } catch (err) {
    console.error('Erreur embed: ' + err.message);
  }
}

client.once('ready', async () => {
  console.log('Connecte en tant que ' + client.user.tag);

if (!LBC_API_KEY || !LBC_SEARCH_URL || !CHANNEL_ID) {
    console.error('LBC_API_KEY, LBC_SEARCH_URL et CHANNEL_ID sont obligatoires.');
    return;
  }

console.log('Surveillance Leboncoin: ' + LBC_SEARCH_URL);

const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error('Salon introuvable');
    return;
  }

try {
    const ads = await searchLeboncoin();
    ads.forEach((ad) => rememberId(String(ad.id || '')));
    console.log(ads.length + ' annonces existantes marquees comme vues');
    console.log('En ecoute des nouvelles annonces Leboncoin...');
  } catch (err) {
    console.error('Erreur API LeBonDeal au demarrage: ' + err.message);
  }

const checkNewItems = async () => {
    try {
      const ads = await searchLeboncoin();
      for (const ad of ads) {
        const id = String(ad.id || '');
        if (!id || seenIds.has(id)) continue;
        rememberId(id);
        sendItem(channel, ad);
      }
    } catch (err) {
      console.error('Erreur API Leboncoin: ' + err.message);
    }
  };

setInterval(() => {
    checkNewItems().catch((e) => console.error('Erreur cycle: ' + e.message));
  }, Math.max(CHECK_INTERVAL_SEC, 60) * 1000);
});

client.on('error', (err) => console.error('Erreur client Discord: ' + err.message));

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN manquant.');
} else {
  client.login(process.env.DISCORD_TOKEN).catch((err) => {
    console.error('Connexion Discord impossible: ' + err.message);
  });
}
