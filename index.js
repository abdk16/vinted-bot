require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// Ne jamais crasher silencieusement : on log et on continue
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught exception :', err && err.message ? err.message : err);
  console.error(err && err.stack ? err.stack : '');
});
process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled rejection :', err && err.message ? err.message : err);
});

// Import robuste de vinted-monitor (module ESM/TS : l'export peut être sur .default)
const vintedMod = require('vinted-monitor');
const VintedMonitor = vintedMod && (vintedMod.default || vintedMod);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const VINTED_URL = process.env.VINTED_URL || '';
const CHANNEL_ID = process.env.CHANNEL_ID || '';
const TIME_RANGE_MIN = Number(process.env.TIME_RANGE_MIN || 10); // minutes

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

function isValidHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

client.once('ready', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);

  if (!VINTED_URL || !CHANNEL_ID) {
    console.error(
      "❌ Variables manquantes : vérifie VINTED_URL et CHANNEL_ID dans les variables d'environnement."
    );
    return;
  }

  if (typeof VintedMonitor !== 'function') {
    console.error(
      '❌ Impossible de charger vinted-monitor (export introuvable). Version installée :',
      require('vinted-monitor/package.json').version || 'inconnue'
    );
    return;
  }

  if (!/https:\/\/www\.vinted\.\w{2}\/vetements\?/.test(VINTED_URL)) {
    console.error(
      '❌ VINTED_URL invalide. Elle doit ressembler à :',
      'https://www.vinted.fr/vetements?search_text=...&order=newest_first'
    );
    return;
  }

  let channel;
  try {
    channel = await client.channels.fetch(CHANNEL_ID);
  } catch (err) {
    console.error(`❌ Impossible de récupérer le salon (${CHANNEL_ID}) : ${err.message}`);
    return;
  }

  const sendItem = (item) => {
    try {
      const info = item && item.info ? item.info : item;
      if (!info || !info.id || seenIds.has(String(info.id))) return;
      rememberId(info.id);

      const price = info.total_item_price
        ? `${info.total_item_price} ${info.currency || ''}`.trim()
        : info.price
          ? `${info.price} ${info.currency || ''}`.trim()
          : 'N/A';

      const embed = new EmbedBuilder()
        .setColor(0x09b1ba)
        .setTitle(info.title || 'Nouvelle annonce')
        .addFields(
          { name: 'Prix', value: String(price).slice(0, 1024) || 'N/A', inline: true },
          { name: 'Marque', value: String(info.brand_title || 'N/A').slice(0, 1024), inline: true },
          { name: 'Taille', value: String(info.size_title || 'N/A').slice(0, 1024), inline: true }
        )
        .setTimestamp();

      if (isValidHttpUrl(info.url)) embed.setURL(info.url);

      const photoUrl = info.photo && (info.photo.full_size_url || info.photo.url);
      if (isValidHttpUrl(photoUrl)) embed.setThumbnail(photoUrl);

      channel
        .send({ content: '🔥 Nouvelle annonce Vinted !', embeds: [embed] })
        .catch((err) => console.error('Erreur envoi Discord :', err.message));
    } catch (err) {
      console.error('Erreur traitement item :', err.message);
    }
  };

  try {
    const timeRange = TIME_RANGE_MIN * 60 * 1000;
    const monitor = new VintedMonitor(timeRange >= 60000 ? timeRange : 60000);
    monitor.onItemFound(sendItem);
    monitor.watch(VINTED_URL);
    console.log(`👀 Surveillance de ${VINTED_URL} (items des ${TIME_RANGE_MIN} dernières minutes)`);
  } catch (err) {
    console.error('❌ Erreur du monitor Vinted :', err.message || err);
  }
});

client.on('error', (err) => console.error('Erreur client Discord :', err.message));

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN manquant dans les variables d\'environnement.');
} else {
  client.login(process.env.DISCORD_TOKEN).catch((err) => {
    console.error('❌ Connexion Discord impossible :', err.message);
  });
}
