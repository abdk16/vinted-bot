require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { Monitor } = require('vinted-monitor');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const VINTED_URL = process.env.VINTED_URL;
const CHANNEL_ID = process.env.CHANNEL_ID;
const INTERVAL = Number(process.env.INTERVAL || 30) * 1000; // en ms

// Évite les doublons (garde les 200 derniers IDs vus)
const seenIds = new Set();
const SEEN_LIMIT = 200;
function rememberId(id) {
  seenIds.add(id);
  if (seenIds.size > SEEN_LIMIT) {
    const it = seenIds.values();
    for (let i = 0; i < seenIds.size - SEEN_LIMIT; i++) it.next();
    const oldest = it.next().value;
    seenIds.delete(oldest);
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
    if (!item || seenIds.has(item.id)) return;
    rememberId(item.id);

    const embed = new EmbedBuilder()
      .setColor(0x09b1ba)
      .setTitle(item.title || 'Nouvelle annonce')
      .setURL(item.url)
      .addFields(
        { name: 'Prix', value: item.price ?? 'N/A', inline: true },
        { name: 'Marque', value: item.brandTitle ?? 'N/A', inline: true },
        { name: 'Taille', value: item.size ?? 'N/A', inline: true }
      )
      .setTimestamp();

    if (item.photo) embed.setThumbnail(item.photo);

    channel
      .send({ content: '🔥 Nouvelle annonce Vinted !', embeds: [embed] })
      .catch((err) => console.error(`Erreur envoi Discord : ${err.message}`));
  };

  // vinted-monitor : selon la version, la méthode s'appelle run() ou watch()
  const monitor = new Monitor({
    interval: INTERVAL,
    requestConfig: {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    },
  });

  const watch = typeof monitor.run === 'function' ? monitor.run : monitor.watch;
  watch.call(monitor, VINTED_URL, sendItem);

  console.log(`👀 Surveillance de ${VINTED_URL} toutes les ${INTERVAL / 1000}s`);
});

client.on('error', (err) => console.error('Erreur client Discord :', err.message));

client.login(process.env.DISCORD_TOKEN);
