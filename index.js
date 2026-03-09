const express = require('express');
const { Client } = require('discord.js-selfbot-v13');
const { createWorker } = require('tesseract.js');

console.log('[Startup] ============================================');
console.log('[Startup] Pokétwo Discord Bot Starting');
console.log('[Startup] Node version:', process.version);
console.log('[Startup] Platform:', process.platform);
console.log('[Startup] Arch:', process.arch);
console.log('[Startup] ============================================');

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('[Startup] CRITICAL: TOKEN environment variable is not set!');
  process.exit(1);
}

console.log('[Startup] ✓ TOKEN detected (length:', TOKEN.length + ')');

const POKETWO_ID = '716390085896962058';
const SPAM_CHANNEL_ID = process.env.SPAM_CHANNEL_ID;

if (SPAM_CHANNEL_ID) {
  console.log('[Startup] ✓ SPAM_CHANNEL_ID detected:', SPAM_CHANNEL_ID);
}

const client = new Client({
  allowWebAssembly: true,
  retryLimit: 3
});

console.log('[Startup] ✓ Discord client created');
console.log('[Startup] ✓ Setting up event handlers...');

let worker = null;
let tesseractReady = false;
let discordReady = false;
let attemptedLogin = false;

async function getWorker() {
  if (worker) return worker;
  if (!tesseractReady) {
    console.log('[OCR] Initializing Tesseract worker...');
    try {
      worker = await createWorker('eng');
      tesseractReady = true;
      console.log('[OCR] ✓ Tesseract worker ready');
    } catch (err) {
      console.error('[OCR] ✗ Failed to initialize Tesseract:', err.message);
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
    console.log('[Spammer] Disabled (no SPAM_CHANNEL_ID)');
    return;
  }
  if (spamInterval) clearInterval(spamInterval);
  
  console.log('[Spammer] ✓ Starting on channel:', SPAM_CHANNEL_ID);
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

client.once('ready', () => {
  discordReady = true;
  console.log('\n[Bot] ========================================');
  console.log('[Bot] ✓✓✓ DISCORD READY ✓✓✓');
  console.log('[Bot] Logged in as:', client.user.tag);
  console.log('[Bot] User ID:', client.user.id);
  console.log('[Bot] ========================================\n');
  startSpammer();
  getWorker().catch(err => console.error('[Bot] OCR initialization error:', err));
});

client.on('error', error => {
  console.error('[Bot] ERROR EVENT:', error.message);
  console.error('[Bot] Error code:', error.code);
  console.error('[Bot] Error type:', error.constructor.name);
});

client.on('disconnect', () => {
  console.warn('[Bot] ⚠ Disconnected from Discord');
  discordReady = false;
});

client.on('reconnecting', () => {
  console.log('[Bot] Attempting to reconnect...');
});

client.on('warn', warning => {
  console.warn('[Bot] Warning:', warning);
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
            console.log('[Auto-Catch] OCR extracted:', pokemonName || 'None');
          }
        } catch (err) {
          console.error('[Auto-Catch] OCR Error:', err.message);
        }
      }

      if (pokemonName) {
        console.log('[Auto-Catch] ✓ Sending catch command for:', pokemonName);
        setTimeout(() => {
          message.channel.send(`<@${POKETWO_ID}> catch ${pokemonName.toLowerCase()}`).catch(console.error);
        }, 500);
        return;
      }
    }

    if (message.author.id === POKETWO_ID) {
      if (message.content.includes('verify') || message.content.includes('captcha') || message.content.includes('human')) {
        console.log('[Bot] ⚠ Captcha detected! Sending recovery...');
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
    console.error('[Bot] Error in messageCreate:', err.message);
  }
});

process.on('unhandledRejection', err => {
  console.error('[Error] Unhandled Promise Rejection:', err);
});

process.on('uncaughtException', err => {
  console.error('[Error] Uncaught Exception:', err);
});

const app = express();

app.get('/', (req, res) => {
  const status = {
    bot: discordReady ? 'ready' : 'connecting',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    loginAttempted: attemptedLogin
  };
  res.json(status);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('[Server] ✓ Express server running on port', PORT);
});

console.log('[Startup] Initiating Discord login...');
console.log('[Startup] Token prefix:', TOKEN.substring(0, 15) + '...');

attemptedLogin = true;

client.login(TOKEN)
  .then(() => {
    console.log('[Startup] ✓ Login call successful');
    console.log('[Startup] Waiting for ready event (checking gateway connection)...');
  })
  .catch(err => {
    console.error('[Startup] ✗ Login failed with error:', err.message);
    console.error('[Startup] Error code:', err.code);
    console.error('[Startup] Error type:', err.constructor.name);
    if (err.code === 'TOKEN_INVALID') {
      console.error('[Startup] Token is invalid. Please get a fresh token from Discord.');
    }
    setTimeout(() => process.exit(1), 2000);
  });

let readyCheckInterval = setInterval(() => {
  if (!discordReady) {
    const elapsed = Math.floor(process.uptime());
    console.log('[Startup] Still connecting... (' + elapsed + 's)');
  } else {
    clearInterval(readyCheckInterval);
  }
}, 5000);

setTimeout(() => {
  if (!discordReady) {
    console.error('\n[Startup] ✗ TIMEOUT: Discord did not ready within 60 seconds');
    console.error('[Startup] Possible causes:');
    console.error('[Startup]   1. Token is invalid or expired (try getting a fresh one)');
    console.error('[Startup]   2. Discord account is locked or banned');
    console.error('[Startup]   3. Network issue between Render and Discord');
    console.error('[Startup]   4. Discord is blocking the connection\n');
    console.log('[Startup] The bot will keep retrying...\n');
  }
}, 60000);

console.log('[Startup] ============================================');
console.log('[Startup] Initialization complete');
console.log('[Startup] ============================================\n');
