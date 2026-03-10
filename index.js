const express = require('express');
const { Client } = require('discord.js-selfbot-v13');
const { createWorker } = require('tesseract.js');

console.log('[Startup] Pokétwo Bot Initializing...');

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('[Error] TOKEN not set');
  process.exit(1);
}

const POKETWO_ID = '716390085896962058';
const SPAM_CHANNEL_ID = process.env.SPAM_CHANNEL_ID;
const PORT = process.env.PORT || 3000;

console.log('[Config] SPAM_CHANNEL_ID:', SPAM_CHANNEL_ID || 'NOT SET');
console.log('[Config] PORT:', PORT);

let discordReady = false;
let worker = null;
let messageCount = 0;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

const app = express();

app.get('/', (req, res) => {
  res.json({
    status: discordReady ? 'ready' : 'connecting',
    uptime: process.uptime(),
    messages_received: messageCount,
    bot_user: discordReady && client.user ? client.user.tag : 'Not logged in'
  });
});

app.get('/health', (req, res) => {
  res.status(discordReady ? 200 : 503).json({
    healthy: discordReady,
    timestamp: new Date().toISOString()
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('[Server] Running on port', PORT);
  console.log('[Server] Health endpoint available at /health');
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

const client = new Client({
  intents: 32767,
  partials: ['MESSAGE', 'CHANNEL', 'GUILD_MEMBER', 'USER', 'GUILD'],
  allowWebAssembly: false,
  retryLimit: 5,
  restRequestTimeout: 30000,
  ws: {
    large_threshold: 50,
    compress: true
  }
});

console.log('[Init] Discord client created');

async function initOCR() {
  try {
    console.log('[OCR] Initializing...');
    worker = await createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log('[OCR]', Math.round(m.progress * 100) + '%');
        }
      }
    });
    console.log('[OCR] Ready');
  } catch (e) {
    console.error('[OCR] Failed:', e.message);
    console.log('[OCR] Bot will continue without OCR support');
  }
}

function extractPokemonName(text) {
  if (!text || text.length === 0) return null;

  const clean = text.replace(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF\u3400-\u4DBF]|\uD83C[\uDDE6-\uDDFF]\uD83C[\uDDE6-\uDDFF]/g, '').trim();
  const lines = clean.split('\n').filter(l => l.trim().length > 2);

  if (!lines.length) return null;

  let name = lines[0].split(/\s{2,}/)[0].split('(')[0].split(',')[0].trim();
  const match = name.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?(?:\-[A-Z][a-z]+)?)/);

  if (!match) return null;

  name = match[1].trim();
  if (name.length > 20) name = name.split(/\s+/).slice(0, 2).join(' ');

  name = name.replace(/cuscHoo/i, 'Cubchoo').replace(/[^a-zA-Z\s\-]/g, '').trim();
  return (name.length > 3 && name.length <= 20) ? name : null;
}

let spamInterval = null;

function startSpammer() {
  if (!SPAM_CHANNEL_ID) {
    console.log('[Spammer] Disabled - SPAM_CHANNEL_ID not set');
    return;
  }

  console.log('[Spammer] Starting on channel:', SPAM_CHANNEL_ID);
  spamInterval = setInterval(async () => {
    if (!discordReady) return;

    try {
      const ch = await client.channels.fetch(SPAM_CHANNEL_ID);
      if (ch) {
        const msg = Math.random().toString(36).substring(2, 8) + ' made by quaxly';
        await ch.send(msg);
        console.log('[Spammer] Sent message');
      }
    } catch (e) {
      console.error('[Spammer Error]', e.message);
    }
  }, 2000);
}

function stopSpammer() {
  if (spamInterval) {
    clearInterval(spamInterval);
    spamInterval = null;
    console.log('[Spammer] Stopped');
  }
}

async function connectBot() {
  try {
    console.log('[Login] Attempt', reconnectAttempts + 1, 'of', MAX_RECONNECT_ATTEMPTS);
    await client.login(TOKEN);
  } catch (e) {
    console.error('[Login Failed]', e.message);

    reconnectAttempts++;
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(5000 * reconnectAttempts, 30000);
      console.log(`[Reconnect] Waiting ${delay}ms before retry...`);
      setTimeout(connectBot, delay);
    } else {
      console.error('[Fatal] Max reconnection attempts reached');
      process.exit(1);
    }
  }
}

client.once('ready', () => {
  discordReady = true;
  reconnectAttempts = 0;
  console.log('\n[SUCCESS] BOT LOGGED IN AS:', client.user.tag);
  console.log('[Info] Bot ID:', client.user.id);
  console.log('[Info] Guilds:', client.guilds.cache.size);
  console.log('[Info] Channels:', client.channels.cache.size);
  console.log('[Info] Ready to receive messages\n');

  startSpammer();
  initOCR();
});

client.on('error', (e) => {
  console.error('[Discord Error]', e.message);
});

client.on('warn', (w) => {
  console.warn('[Discord Warn]', w);
});

client.on('shardDisconnect', (event, id) => {
  console.warn('[Disconnect] Shard', id, 'disconnected:', event.reason);
  discordReady = false;
  stopSpammer();
});

client.on('shardReconnecting', (id) => {
  console.log('[Reconnecting] Shard', id, 'is reconnecting...');
  discordReady = false;
});

client.on('shardResume', (id) => {
  console.log('[Resume] Shard', id, 'resumed');
  discordReady = true;
  if (SPAM_CHANNEL_ID && !spamInterval) {
    startSpammer();
  }
});

client.on('messageCreate', async (msg) => {
  try {
    messageCount++;

    if (msg.author.id === client.user.id) {
      return;
    }

    console.log(`[Message #${messageCount}] From ${msg.author.username} in ${msg.channel?.name || 'DM'}: ${msg.content?.substring(0, 50) || '(embeds)'}`);

    if (!msg.embeds.length) {
      if (msg.content.includes('Possible pokemons:') || msg.content.includes('Possible Pokémon:')) {
        console.log('[Hints] Found hint list');
        const hints = msg.content.split(/Possible Pok[eé]mons?:/i)[1];
        if (hints) {
          const names = hints.split(/,|\s+/).map(n => n.trim().replace(/[^a-zA-Z0-9\-]/g, '')).filter(n => n.length > 2);
          names.forEach((n, i) => {
            setTimeout(() => {
              msg.channel.send(`<@${POKETWO_ID}> catch ${n.toLowerCase()}`).catch(e => console.error('[Send Error]', e.message));
            }, i * 3000 + 500);
          });
        }
      }

      if (msg.content.includes('⏳')) {
        console.log('[Cooldown] Detected');
        setTimeout(() => {
          msg.channel.send(`<@${POKETWO_ID}> h`).catch(e => console.error('[Send Error]', e.message));
        }, 3500);
      }

      return;
    }

    if (msg.author.username.includes('Poké-Name') || msg.author.username.includes('P2 Assistant')) {
      console.log('[Poké-Name] Found message from', msg.author.username);
      const emb = msg.embeds[0];
      let poke = null;

      const text = (emb.title || '') + ' ' + (emb.description || '');
      console.log('[Poké-Name] Text:', text.substring(0, 100));

      if (text.includes('Name of the Pokemon') || text.includes('Possible')) {
        console.log('[Poké-Name] Trying text extraction');
        const m = text.match(/(?:\d+\)\s+|Pokémon:\s+|pokemons:\s+)([a-zA-Z0-9\- ]+)/i);
        if (m) {
          poke = extractPokemonName(m[1]);
          console.log('[Poké-Name] Text extraction result:', poke);
        }
      }

      if (!poke && (emb.image?.url || emb.thumbnail?.url)) {
        const url = emb.image?.url || emb.thumbnail?.url;
        console.log('[Poké-Name] No text match, trying OCR on:', url.substring(0, 50));
        try {
          if (worker) {
            const res = await worker.recognize(url);
            poke = extractPokemonName(res.data.text);
            console.log('[OCR] Extracted:', poke || 'none');
          } else {
            console.log('[OCR] Worker not ready yet');
          }
        } catch (e) {
          console.error('[OCR Error]', e.message);
        }
      }

      if (poke) {
        console.log('[CATCH] Sending catch for:', poke);
        setTimeout(() => {
          msg.channel.send(`<@${POKETWO_ID}> catch ${poke.toLowerCase()}`).catch(e => console.error('[Send Error]', e.message));
        }, 500);
      }
    }

    if (msg.author.id === POKETWO_ID) {
      console.log('[Pokétwo] Message from Pokétwo:', msg.content.substring(0, 100));
      if (msg.content.includes('verify') || msg.content.includes('captcha') || msg.content.includes('human')) {
        console.log('[Captcha] Detected - sending recovery');
        msg.channel.send(`<@${POKETWO_ID}> inc p`).catch(() => {});
        msg.channel.send(`<@${POKETWO_ID}> inc p all -y`).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[Message Error]', e.message, e.stack);
  }
});

process.on('unhandledRejection', (e) => {
  console.error('[Rejection]', e);
});

process.on('uncaughtException', (e) => {
  console.error('[Exception]', e);
  if (e.message.includes('ECONNRESET') || e.message.includes('ETIMEDOUT')) {
    console.log('[Recovery] Network error, attempting to continue...');
  }
});

process.on('SIGTERM', () => {
  console.log('[Shutdown] SIGTERM received, cleaning up...');
  stopSpammer();
  client.destroy();
  server.close(() => {
    console.log('[Shutdown] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Shutdown] SIGINT received, cleaning up...');
  stopSpammer();
  client.destroy();
  server.close(() => {
    console.log('[Shutdown] Server closed');
    process.exit(0);
  });
});

console.log('[Login] Connecting to Discord...');
connectBot();

setTimeout(() => {
  if (!discordReady) {
    console.log('[Waiting] Still connecting...');
  }
}, 10000);
