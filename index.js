const express = require('express');
const { Client, Intents } = require('discord.js-selfbot-v13');
const { createWorker } = require('tesseract.js');

console.log('[Startup] Initializing Pokétwo bot...');
console.log('[Startup] Node version:', process.version);

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('[Startup] CRITICAL: TOKEN environment variable is not set!');
  process.exit(1);
}

console.log('[Startup] Discord token detected, length:', TOKEN.length);

const POKETWO_ID = '716390085896962058';
const SPAM_CHANNEL_ID = process.env.SPAM_CHANNEL_ID;

let intentsValue = 0;
try {
  intentsValue = Intents.FLAGS.GUILDS | Intents.FLAGS.GUILD_MESSAGES | Intents.FLAGS.MESSAGE_CONTENT;
} catch (err) {
  console.warn('[Startup] Could not set intents with FLAGS, using default configuration');
}

const clientOptions = {
  intents: intentsValue || undefined,
  failIfNotExists: false
};

const client = new Client(clientOptions);

console.log('[Startup] Discord client initialized with options:', Object.keys(clientOptions));

let worker = null;
let tesseractReady = false;

async function getWorker() {
  if (worker) return worker;
  if (!tesseractReady) {
    console.log('[OCR] Initializing Tesseract worker...');
    try {
      worker = await createWorker('eng');
      tesseractReady = true;
      console.log('[OCR] Tesseract worker ready');
    } catch (err) {
      console.error('[OCR] Failed to initialize Tesseract:', err.message);
      return null;
    }
  }
  return worker;
}

function extractPokemonName(text) {
  if (!text || text.length === 0) return null;

  const cleanText = text
    .replace(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF\u3400-\u4DBF]|\uD83C[\uDDE6-\uDDFF]\uD83C[\uDDE6-\uDDFF]/g, '')
    .trim();
  
  const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  
  if (lines.length === 0) return null;

  let rawName = lines[0];
  
  rawName = rawName.split(/\s{2,}/)[0].split('(')[0].split(',')[0].trim();

  const nameMatch = rawName.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?(?:\-[A-Z][a-z]+)?)/);
  
  if (nameMatch) {
    let pokemonName = nameMatch[1].trim();
    
    if (pokemonName.length > 20) {
      const words = pokemonName.split(/\s+/);
      pokemonName = words.slice(0, 2).join(' ');
    }

    pokemonName = pokemonName
      .replace(/cuscHoo/i, 'Cubchoo')
      .replace(/fA$/i, '')
      .replace(/f=.$/i, '')
      .replace(/[^a-zA-Z\s\-]/g, '')
      .trim();

    if (pokemonName.length > 3 && pokemonName.length <= 20) {
      return pokemonName;
    }
  }

  return null;
}

let spamInterval = null;

function startSpammer() {
  if (!SPAM_CHANNEL_ID) {
    console.log('[Spammer] SPAM_CHANNEL_ID not set, spammer disabled');
    return;
  }
  if (spamInterval) clearInterval(spamInterval);
  
  console.log('[Spammer] Starting spammer on channel:', SPAM_CHANNEL_ID);
  spamInterval = setInterval(async () => {
    try {
      const channel = await client.channels.fetch(SPAM_CHANNEL_ID);
      if (channel) {
        const randomStr = Math.random().toString(36).substring(2, 8);
        await channel.send(`${randomStr} made by quaxly`);
      }
    } catch (err) {
      console.error('[Spammer] Error:', err.message);
    }
  }, 2000);
}

client.on('ready', () => {
  console.log('[Bot] ========================================');
  console.log('[Bot] Discord Ready Event Fired!');
  console.log('[Bot] Logged in as:', client.user.tag);
  console.log('[Bot] User ID:', client.user.id);
  console.log('[Bot] ========================================');
  startSpammer();
  getWorker().catch(err => console.error('[Bot] OCR initialization error:', err));
});

client.on('error', error => {
  console.error('[Bot] Discord client error:', error.message);
});

client.on('disconnect', () => {
  console.warn('[Bot] Client disconnected from Discord');
});

client.on('warn', warning => {
  console.warn('[Bot] Discord warning:', warning);
});

client.on('messageCreate', async message => {
  try {
    const hasEmbeds = message.embeds.length > 0;
    if (message.author.id === client.user.id) return;

    if (hasEmbeds && (message.author.username.includes('Poké-Name') || message.author.username.includes('P2 Assistant'))) {
      const embed = message.embeds[0];
      let pokemonName = null;

      const textToScan = (embed.title || '') + ' ' + (embed.description || '');
      if (textToScan.includes('Name of the Pokemon') || textToScan.includes('Possible')) {
        const match = textToScan.match(/(?:\d+\)\s+|Pokémon:\s+|pokemons:\s+)([a-zA-Z0-9\- ]+)/i);
        if (match) {
          pokemonName = extractPokemonName(match[1]);
        }
      }

      if (!pokemonName && (embed.image?.url || embed.thumbnail?.url)) {
        const imageUrl = embed.image?.url || embed.thumbnail?.url;
        console.log('[Auto-Catch] Running OCR on image...');
        try {
          const w = await getWorker();
          if (w) {
            const { data: { text } } = await w.recognize(imageUrl);
            pokemonName = extractPokemonName(text);
            console.log('[Auto-Catch] OCR result -> Extracted:', pokemonName || 'None');
          }
        } catch (err) {
          console.error('[Auto-Catch] OCR Error:', err.message);
        }
      }

      if (pokemonName) {
        console.log('[Auto-Catch] Sending catch command for:', pokemonName);
        setTimeout(() => {
          message.channel.send(`<@${POKETWO_ID}> catch ${pokemonName.toLowerCase()}`).catch(console.error);
        }, 500);
        return;
      }
    }

    if (message.author.id === POKETWO_ID) {
      if (message.content.includes('verify') || message.content.includes('captcha') || message.content.includes('human')) {
        console.log('[Bot] Captcha detected! Sending recovery commands...');
        message.channel.send(`<@${POKETWO_ID}> inc p`).catch(console.error);
        message.channel.send(`<@${POKETWO_ID}> inc p all -y`).catch(console.error);
        return;
      }
    }

    if (message.content.includes('Possible pokemons:') || message.content.includes('Possible Pokémon:')) {
      const hintPart = message.content.split(/Possible Pok[eé]mons?:/i)[1]?.trim();
      if (hintPart) {
        const names = hintPart.split(/,|\s+/).map(n => n.trim().replace(/[^a-zA-Z0-9\-]/g, '')).filter(n => n.length > 2);
        names.forEach((name, index) => {
          setTimeout(() => {
            message.channel.send(`<@${POKETWO_ID}> catch ${name.toLowerCase()}`).catch(console.error);
          }, index * 3000 + 500);
        });
      }
    }

    if (message.content.includes('⏳')) {
      console.log('[Bot] Cooldown detected, waiting...');
      setTimeout(() => {
        message.channel.send(`<@${POKETWO_ID}> h`).catch(console.error);
      }, 3500);
    }
  } catch (err) {
    console.error('[Bot] Error in messageCreate handler:', err.message);
  }
});

process.on('unhandledRejection', err => {
  console.error('[Error] Unhandled Promise Rejection:', err);
});

process.on('uncaughtException', err => {
  console.error('[Error] Uncaught Exception:', err);
  process.exit(1);
});

const app = express();

app.get('/', (req, res) => {
  res.send('Bot is alive');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('[Server] Express server running on port', PORT);
});

console.log('[Startup] Attempting Discord login with token...');
console.log('[Startup] Token begins with:', TOKEN.substring(0, 10) + '...');

client.login(TOKEN)
  .then(() => {
    console.log('[Startup] Login promise resolved successfully');
  })
  .catch(err => {
    console.error('[Startup] Login failed with error:', err.message);
    console.error('[Startup] Full error:', err);
    process.exit(1);
  });

console.log('[Startup] Bot initialization complete, waiting for Discord connection...');
