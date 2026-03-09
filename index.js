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

let discordReady = false;
let worker = null;

const client = new Client({
  intents: [],
  failIfNotExists: false,
  allowWebAssembly: true,
  retryLimit: 5,
  messageCacheLifetime: 3600,
  messageSweepInterval: 3600,
  invalidRequestWarningInterval: 0,
  http: {
    agent: null,
    version: 10
  }
});

console.log('[Init] Discord client created');

async function initOCR() {
  try {
    console.log('[OCR] Initializing...');
    worker = await createWorker('eng');
    console.log('[OCR] Ready');
  } catch (e) {
    console.error('[OCR] Failed:', e.message);
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
  if (!SPAM_CHANNEL_ID) return;
  
  spamInterval = setInterval(async () => {
    try {
      const ch = await client.channels.fetch(SPAM_CHANNEL_ID);
      if (ch) ch.send(Math.random().toString(36).substring(2, 8) + ' made by quaxly').catch(() => {});
    } catch (e) {}
  }, 2000);
}

client.once('ready', () => {
  discordReady = true;
  console.log('\n[SUCCESS] BOT LOGGED IN AS:', client.user.tag, '\n');
  startSpammer();
  initOCR();
});

client.on('error', (e) => {
  console.error('[Discord Error]', e.message);
});

client.on('warn', (w) => {
  console.warn('[Discord Warn]', w);
});

client.on('disconnect', () => {
  console.warn('[Disconnect] Attempting reconnect...');
  discordReady = false;
});

client.on('messageCreate', async (msg) => {
  try {
    if (msg.author.id === client.user.id || !msg.embeds.length) return;
    
    if (msg.author.username.includes('Poké-Name') || msg.author.username.includes('P2 Assistant')) {
      const emb = msg.embeds[0];
      const text = (emb.title || '') + ' ' + (emb.description || '');
      let poke = null;
      
      if (text.includes('Name of the Pokemon') || text.includes('Possible')) {
        const m = text.match(/(?:\d+\)\s+|Pokémon:\s+|pokemons:\s+)([a-zA-Z0-9\- ]+)/i);
        if (m) poke = extractPokemonName(m[1]);
      }
      
      if (!poke && (emb.image?.url || emb.thumbnail?.url)) {
        const url = emb.image?.url || emb.thumbnail?.url;
        try {
          if (worker) {
            const res = await worker.recognize(url);
            poke = extractPokemonName(res.data.text);
            console.log('[OCR] Extracted:', poke || 'none');
          }
        } catch (e) {
          console.error('[OCR Error]', e.message);
        }
      }
      
      if (poke) {
        console.log('[Catch]', poke);
        setTimeout(() => {
          msg.channel.send(`<@${POKETWO_ID}> catch ${poke.toLowerCase()}`).catch(() => {});
        }, 500);
      }
    }
    
    if (msg.author.id === POKETWO_ID) {
      if (msg.content.includes('verify') || msg.content.includes('captcha') || msg.content.includes('human')) {
        console.log('[Captcha] Sending recovery');
        msg.channel.send(`<@${POKETWO_ID}> inc p`).catch(() => {});
        msg.channel.send(`<@${POKETWO_ID}> inc p all -y`).catch(() => {});
      }
    }
    
    if (msg.content.includes('Possible pokemons:') || msg.content.includes('Possible Pokémon:')) {
      const hints = msg.content.split(/Possible Pok[eé]mons?:/i)[1];
      if (hints) {
        const names = hints.split(/,|\s+/).map(n => n.trim().replace(/[^a-zA-Z0-9\-]/g, '')).filter(n => n.length > 2);
        names.forEach((n, i) => {
          setTimeout(() => {
            msg.channel.send(`<@${POKETWO_ID}> catch ${n.toLowerCase()}`).catch(() => {});
          }, i * 3000 + 500);
        });
      }
    }
    
    if (msg.content.includes('⏳')) {
      setTimeout(() => {
        msg.channel.send(`<@${POKETWO_ID}> h`).catch(() => {});
      }, 3500);
    }
  } catch (e) {
    console.error('[Message Error]', e.message);
  }
});

process.on('unhandledRejection', (e) => console.error('[Rejection]', e));
process.on('uncaughtException', (e) => console.error('[Exception]', e));

const app = express();

app.get('/', (req, res) => {
  res.json({ status: discordReady ? 'ready' : 'connecting', uptime: process.uptime() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('[Server] Running on port', PORT));

console.log('[Login] Connecting to Discord...');

client.login(TOKEN).catch((e) => {
  console.error('[Login Failed]', e.message);
  setTimeout(() => process.exit(1), 1000);
});

setTimeout(() => {
  if (!discordReady) {
    console.log('[Waiting] Still connecting...');
  }
}, 10000);
