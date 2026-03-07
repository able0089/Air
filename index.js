const { Client } = require('discord.js-selfbot-v13');
require('./keep_alive');
const { createWorker } = require('tesseract.js');

const client = new Client();
const POKETWO_ID = '716390085896962058';

// Spammer configuration
const SPAM_CHANNEL_ID = process.env.SPAM_CHANNEL_ID;
let spamInterval = null;

function startSpammer() {
  if (!SPAM_CHANNEL_ID) return;
  if (spamInterval) clearInterval(spamInterval);
  
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
  }, 2000); // 2 second delay for safety
}

// Lazy load Tesseract worker to save memory at startup
let worker = null;
async function getWorker() {
  if (worker) return worker;
  worker = await createWorker('eng');
  return worker;
}

client.on('ready', () => {
  console.log(`Bot ready! Logged in as ${client.user.tag}`);
  startSpammer();
});

client.on('messageCreate', async message => {
  const hasEmbeds = message.embeds.length > 0;
  if (message.author.id === client.user.id) return;

  // 1. Poké-Name OCR / Text Detection
  if (hasEmbeds && (message.author.username.includes('Poké-Name') || message.author.username.includes('P2 Assistant'))) {
    const embed = message.embeds[0];
    let pokemonName = null;

    // A. Try Text Extraction first (Faster & Reliable)
    const textToScan = (embed.title || '') + ' ' + (embed.description || '');
    if (textToScan.includes('Name of the Pokemon') || textToScan.includes('Possible')) {
      const match = textToScan.match(/(?:\d+\)\s+|Pokémon:\s+|pokemons:\s+)([a-zA-Z0-9\- ]+)/i);
      if (match) {
        pokemonName = match[1].split('(')[0].split('\n')[0].trim();
      }
    }

    // B. Try OCR if text extraction failed and image exists
    if (!pokemonName && (embed.image?.url || embed.thumbnail?.url)) {
      const imageUrl = embed.image?.url || embed.thumbnail?.url;
      console.log(`[Auto-Catch] Running OCR on: ${imageUrl}`);
      try {
        const w = await getWorker();
        const { data: { text } } = await w.recognize(imageUrl);
        
        // Remove Japanese characters, flags, and common OCR noise
        const cleanText = text.replace(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF\u3400-\u4DBF]|\uD83C[\uDDE6-\uDDFF]\uD83C[\uDDE6-\uDDFF]/g, '').trim();
        const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
        
        if (lines.length > 0) {
          // Take the first line, which is the main name
          let rawName = lines[0];
          
          // Split by multiple spaces or parentheses to isolate the English name
          rawName = rawName.split(/\s{2,}/)[0].split('(')[0].trim();

          // Final cleanup: Keep only A-Z, spaces, and hyphens
          // Also handle OCR misreads of multi-word names by taking everything that looks like a name
          const nameMatch = rawName.match(/([A-Z][A-Za-z\-\s]{2,})/);
          if (nameMatch) {
            pokemonName = nameMatch[1].trim();
            
            // Common OCR fixes for Poketwo
            pokemonName = pokemonName
              .replace(/cuscHoo/i, 'Cubchoo')
              .replace(/fA$/i, '')
              .replace(/f=.$/i, '')
              .trim();

            if (pokemonName.length <= 2) pokemonName = null;
          }
        }
        console.log(`[Auto-Catch] OCR Result: ${text.trim()} -> Selected: ${pokemonName}`);
      } catch (err) {
        console.error('[Auto-Catch] OCR Error:', err);
      }
    }

    if (pokemonName) {
      console.log(`[Auto-Catch] Detected: ${pokemonName}`);
      // Reduced delay for faster response
      setTimeout(() => {
        message.channel.send(`<@${POKETWO_ID}> catch ${pokemonName.toLowerCase()}`).catch(console.error);
      }, 500); 
      return;
    }
  }

  // 2. Poketwo Detection & Captcha Handling
  if (message.author.id === POKETWO_ID) {
    if (message.content.includes('verify') || message.content.includes('captcha') || message.content.includes('human')) {
      console.log('[Auto-Catch] Captcha! Alerting and attempting inc p...');
      // Use both suggested commands for maximum safety
      message.channel.send(`<@${POKETWO_ID}> inc p`).catch(console.error);
      message.channel.send(`<@${POKETWO_ID}> inc p all -y`).catch(console.error);
      return;
    }
  }

  // 3. Fallback Hint Handler
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

  // 4. Cooldown Handler
  if (message.content.includes('⏳')) {
    console.log('[Auto-Catch] Cooldown... waiting');
    setTimeout(() => {
      message.channel.send(`<@${POKETWO_ID}> h`).catch(console.error);
    }, 3500);
  }
});

process.on('unhandledRejection', e => console.error('Rejection:', e));
process.on('uncaughtException', e => console.error('Exception:', e));

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error("CRITICAL ERROR: process.env.TOKEN is not set!");
  process.exit(1);
}
client.login(TOKEN).catch(console.error);
