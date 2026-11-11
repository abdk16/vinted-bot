require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// ==================== DIAGNOSTIC AU DÉMARRAGE ====================
console.log('🚀 Démarrage du bot v2 (diagnostic)...');
console.log('📋 Node version :', process.version);

// Ne jamais crasher silencieusement : on log et on continue
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught exception :', err && err.message ? err.message : err);
  console.error(err && err.stack ? err.stack : '');
});
process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled rejection :', err && err.message ? err.message : err);
});

// ==================== VÉRIFICATION DES VARIABLES ====================
const VINTED_URL = process.env.VINTED_URL || '';
const CHANNEL_ID = process.env.CHANNEL_ID || '';
const TIME_RANGE_MIN = Number(process.env.TIME_RANGE_MIN || 10); // minutes

console.log('--- Vérification des variables ---');
console.log(`   DISCORD_TOKEN : ${process.env.DISCORD_TOKEN ? '✅ présent (' + process.env.DISCORD_TOKEN.length + ' caractères)' : '❌ MANQUANT'}`);
if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN !== process.env.DISCORD_TOKEN.trim()) {
  console.error('❌ ATTENTION : DISCORD_TOKEN a des espaces invisibles au début ou à la fin !');
}
console.log(`   CHANNEL_ID    : ${CHANNEL_ID ? '✅ présent (' + CHANNEL_ID + ')' : '❌ MANQUANT'}`);
if (CHANNEL_ID && !/^\d+$/.test(CHANNEL_ID.trim())) {
  console.error('❌ ATTENTION : CHANNEL_ID doit contenir uniquement des chiffres !');
}
console.log(`   VINTED_URL    : ${VINTED_URL ? '✅ présent' : '❌ MANQUANT'}`);
if (VINTED_URL && !/https:\/\/www\.vinted\.\w{2}\/vetements\?/.test(VINTED_URL)) {
  console.error('❌ ATTENTION : VINTED_URL doit ressembler à https://www.vinted.fr/vetements?search_text=...&order=newest_first');
}
console.log(`   TIME_RANGE_MIN: ${TIME_RANGE_MIN}`);
console.log('----------------------------------');

// ==================== IMPORT VINTED-MONITOR ====================
const vintedMod = require('vinted-monitor');
const VintedMonitor = vintedMod && (vintedMod.default || vintedMod);
console.log(`📦 vinted-monitor chargé : ${typeof VintedMonitor === 'function' ? '✅ OK' : '❌ PROBLÈME'}`);

// ==================== CLIENT DISCORD ====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

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

  // Envoyer un message de démarrage dans le salon cible
  if (CHANNEL_ID) {
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      await channel.send(
        `🟢 **Bot en ligne !**\nJe surveille Vinted et j'enverrai les nouvelles annonces Ralph Lauren ici.\nBot : ${client.user.tag}`
      );
      console.log('📨 Message "Bot en ligne" envoyé dans le salon ✅');
    } catch (err) {
      console.error(`❌ Impossible d'envoyer le message de démarrage (${CHANNEL_ID}) : ${err.message}`);
      console.error('   → Vérifie que CHANNEL_ID est correct et que le bot a accès au salon.');
    }
  }

  if (!VINTED_URL || !CHANNEL_ID) {
    console.error('❌ Variables manquantes : VINTED_URL et CHANNEL_ID sont obligatoires.');
    return;
  }

  if (typeof VintedMonitor !== 'function') {
    console.error('❌ vinted-monitor illisible, impossible de surveiller Vinted.');
    return;
  }

  if (!/https:\/\/www\.vinted\.\w{2}\/vetements\?/.test(VINTED_URL)) {
    console.error('❌ VINTED_URL invalide. Elle doit ressembler à :', 'https://www.vinted.fr/vetements?search_text=...&order=newest_first');
    return;
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

      client.channels
        .fetch(CHANNEL_ID)
        .then((channel) => channel.send({ content: '🔥 Nouvelle annonce Vinted !', embeds: [embed] }))
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
    console.log(`👀 Surveillance lancée : ${VINTED_URL}`);
    console.log(`⏱️  Fenêtre de détection : ${TIME_RANGE_MIN} dernières minutes`);
  } catch (err) {
    console.error('❌ Erreur du monitor Vinted :', err.message || err);
  }
});

client.on('error', (err) => console.error('Erreur client Discord :', err.message));

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN manquant : le bot ne peut pas se connecter.');
} else {
  console.log('🔑 Connexion à Discord en cours...');
  client.login(process.env.DISCORD_TOKEN).catch((err) => {
    console.error('❌ Connexion Discord impossible :', err.message);
    if (String(err.message).includes('invalid token')) {
      console.error('   → Ton token est invalide. Va sur le portail Discord, Bot, Reset Token, copie le NOUVEAU token et colle-le dans Railway Variables.');
    }
  });
}
