require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const VintedMonitor = require('vinted-monitor').default;

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const VINTED_URL = process.env.VINTED_URL;
const CHANNEL_ID = process.env.CHANNEL_ID;
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

client.once('ready', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);

  if (!VINTED_URL || !CHANNEL_ID) {
    console.error(
      '❌ Variables manquantes : vérifie VINTED_URL et CHANNEL_ID dans les variables d\'environnement.'
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
      .setURL(info.url)
      .addFields(
        { name: 'Prix', value: price, inline: true },
        { name: 'Marque', value: info.brand_title || 'N/A', inline: true },
        { name: 'Taille', value: info.size_title || 'N/A', inline: true }
      )
      .setTimestamp();

    const photoUrl = info.photo && (info.photo.full_size_url || info.photo.url);
    if (photoUrl) embed.setThumbnail(photoUrl);

    channel
      .send({ content: '🔥 Nouvelle annonce Vinted !', embeds: [embed] })
      .catch((err) => console.error('Erreur envoi Discord :', err.message));
  };

  try {
    const monitor = new VintedMonitor(TIME_RANGE_MIN * 60 * 1000);
    monitor.onItemFound(sendItem);
    monitor.watch(VINTED_URL);
    console.log(`👀 Surveillance de ${VINTED_URL} (items des ${TIME_RANGE_MIN} dernières minutes)`);
  } catch (err) {
    console.error('❌ Erreur du monitor Vinted :', err.message || err);
    console.error(
      "ℹ️ L'URL doit ressembler à : https://www.vinted.fr/vetements?search_text=...&order=newest_first"
    );
  }
});

client.on('error', (err) => console.error('Erreur client Discord :', err.message));

client.login(process.env.DISCORD_TOKEN);
