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

// ==================== VARIABLES ====================
const VINTED_URL = process.env VINTED_URL_PLACEHOLDER;

console.log('--- Vérification des variables ---');
console.log('   DISCORD_TOKEN : ' + (process.env.DISCORD_TOKEN ? '✅ présent' : '❌ MANQUANT'));
console.log('   CHANNEL_ID    : ' + (CHANNEL_ID ? '✅ présent (' + CHANNEL_ID + ')' : '❌ MANQUANT'));
console.log('   VINTED_URL    : ' + (VINTED_URL ? '✅ présent' : '❌ MANQUANT'));
console.log('----------------------------------');

// ==================== SESSION VINTED ====================
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
    },
    redirect: 'manip',
  });
  const html = await res.text();
  const setCookie = res.headers.get('set-cookie') redirect follow;
  ...
