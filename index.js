require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

console.log('Demarrage du bot Vinted + Leboncoin');

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

const LBC_URL = process.env.LBC_URL || '';
const LBC_CHANNEL_ID = String(process.env.LBC_CHANNEL_ID || CHANNEL_ID).trim();
const LBC_API_KEY = process.env.LBC_API_KEY || '';
const LBC_CHECK_INTERVAL_SEC = Number(process.env.LBC_CHECK_INTERVAL_SEC || 60);

console.log('--- Variables ---');
console.log('DISCORD_TOKEN : ' + (process.env.DISCORD_TOKEN ? 'OK present' : 'MANQUANT'));
console.log('CHANNEL_ID : ' + (CHANNEL_ID || 'MANQUANT'));
console.log('VINTED_URL : ' + (VINTED_URL || 'MANQUANT'));
console.log('LBC_URL : ' + (LBC_URL || 'MANQUANT (Leboncoin desactive)'));
console.log('LBC_API_KEY : ' + (LBC_API_KEY ? 'OK present' : 'MANQUANT (Leboncoin desactive)'));
console.log('-----------------');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

const sessionState = { cookie: null, anonId: null, csrfToken: null, locale: 'fr-FR' };

function siteOrigin() {
  return new URL(VINTED_URL).origin;
}

function apiOrigin() {
  const host = new URL(VINTED_URL).hostname.replace(/^www\./, '');
  return 'https://api.' + host;
}

