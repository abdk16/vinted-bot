 'Nouvelle annonce Vinted', embeds: [embed], components: [row] })
      .catch((err) => console.error('Erreur envoi Discord: ' + err.message));
  } catch (err) {
    console.error('Erreur embed: ' + err.message);
  }
}

const seenLbcIds = new Set();

function rememberLbcId(id) {
  seenLbcIds.add(String(id));
  if (seenLbcIds.size > 500) {
    seenLbcIds.delete(seenLbcIds.values().next().value);
  }
}

function normalizeLbc(ad) {
  return {
    id: ad.list_id || ad.id || ad.ad_id,
    title: ad.subject || ad.title || 'Annonce Leboncoin',
    price: ad.price != null ? ad.price + ' EUR' : 'N/A',
    city: (ad.location && ad.location.city) || ad.city || 'N/A',
    url: ad.url || ad.link || (ad.list_id ? 'https://www.leboncoin.fr/ad/' + ad.list_id : null),
    image: (ad.images && (ad.images.url || ad.images.small_url || ad.images.thumb_url)) || null,
  };
}

async function searchLbc() {
  if (!LBC_API_KEY) {
    throw new Error('LBC_API_KEY absent : Leboncoin desactive');
  }
  const query = (LBC_URL && new URL(LBC_URL).searchParams.get('text')) || 'pc gamer';
  const res = await fetch('https://api.piloterr.com/v2/leboncoin/search?query=' + encodeURIComponent(query), {
    headers: { 'x-api-key': LBC_API_KEY, Accept: 'application/json' },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Cle Piloterr invalide (statut ' + res.status + ')');
  }
  if (!res.ok) {
    throw new Error('Piloterr statut ' + res.status);
  }
  const data = await res.json();
  const list = data.ads || data.results || data.data || data.listings || [];
  return list.map(normalizeLbc);
}

function sendLbcItem(channel, ad) {
  try {
    if (!ad.url) return;
    const embed = new EmbedBuilder()
      .setColor(0xff6600)
      .setTitle(String(ad.title).slice(0, 256))
      .setURL(ad.url)
      .addFields(
        { name: 'Prix', value: String(ad.price).slice(0, 1024), inline: true },
        { name: 'Ville', value: String(ad.city).slice(0, 1024), inline: true },
      )
      .setTimestamp();

if (isValidHttpUrl(ad.image)) embed.setThumbnail(ad.image);

const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Voir l'annonce").setStyle(ButtonStyle.Link).setURL(ad.url),
    );

channel
      .send({ content: 'Nouvelle annonce Leboncoin', embeds: [embed], components: [row] })
      .catch((err) => console.error('Erreur envoi Discord LBC: ' + err.message));
  } catch (err) {
    console.error('Erreur embed LBC: ' + err.message);
  }
}

async function checkLbc(channel) {
  try {
    const ads = await searchLbc();
    for (const ad of ads) {
      const id = String(ad.id || '');
      if (!id || seenLbcIds.has(id) || !ad.url) continue;
      rememberLbcId(id);
      sendLbcItem(channel, ad);
    }
  } catch (err) {
    console.error('Erreur Leboncoin: ' + err.message);
  }
}

client.once('ready', async () => {
  console.log('Connecte en tant que ' + client.user.tag);

if (CHANNEL_ID) {
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      await channel.send('Bot en ligne ! Je surveille Vinted' + (LBC_URL && LBC_API_KEY ? ' et Leboncoin' : '') + '.');
      console.log('Message de demarrage envoye');
    } catch (err) {
      console.error('Impossible d envoyer le message de demarrage: ' + err.message);
    }
  }

if (!VINTED_URL || !CHANNEL_ID) {
    console.error('VINTED_URL et CHANNEL_ID sont obligatoires.');
    return;
  }

console.log('Surveillance Vinted: ' + VINTED_URL);

try {
    const data = await searchVinted();
    const items = (data && data.items) || [];
    items.forEach((it) => rememberId(String(it.id || '')));
    console.log(items.length + ' annonces Vinted existantes marquees comme vues');
  } catch (err) {
    console.error('Erreur API Vinted au demarrage: ' + err.message);
  }

if (LBC_URL && LBC_API_KEY) {
    console.log('Surveillance Leboncoin: ' + LBC_URL);
    try {
      const lbcChannel = await client.channels.fetch(LBC_CHANNEL_ID);
      const ads = await searchLbc();
      ads.forEach((ad) => rememberLbcId(String(ad.id || '')));
      console.log(ads.length + ' annonces Leboncoin existantes marquees comme vues');
      setInterval(() => checkLbc(lbcChannel), Math.max(LBC_CHECK_INTERVAL_SEC, 60) * 1000);
    } catch (err) {
      console.error('Erreur Leboncoin au demarrage: ' + err.message);
    }
  } else {
    console.log('Leboncoin desactive (LBC_URL ou LBC_API_KEY absent)');
  }

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
