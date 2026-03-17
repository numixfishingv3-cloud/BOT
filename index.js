const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Parser = require('rss-parser');
const parser = new Parser();

// ดึงค่าจาก Environment Variables (ตั้งค่าใน Railway)
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NEWS_CHANNEL_ID = process.env.NEWS_CHANNEL_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

client.on('ready', () => {
    console.log(`✅ บอท ${client.user.tag} พร้อมทำงานบน Cloud แล้ว!`);
    
    // ระบบแจ้งข่าว (ทำงานทุก 1 ชม.)
    setInterval(async () => {
        try {
            const channel = client.channels.cache.get(NEWS_CHANNEL_ID);
            if (!channel) return;

            const feed = await parser.parseURL('https://www.blognone.com/atom.xml');
            const latestPost = feed.items[0];
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`📰 ข่าวล่าสุด: ${latestPost.title}`)
                .setURL(latestPost.link)
                .setDescription('คลิกที่หัวข้อเพื่ออ่านรายละเอียด')
                .setTimestamp();

            channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('RSS Error:', error.message);
        }
    }, 3600000); 
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // ระบบ AI ถาม-ตอบ
    if (message.content.startsWith('!ถาม')) {
        const prompt = message.content.replace('!ถาม', '').trim();
        if (!prompt) return message.reply('พิมพ์คำถามมาได้เลย!');

        try {
            const result = await model.generateContent(prompt);
            message.reply(result.response.text());
        } catch (e) {
            console.error(e);
            message.reply('❌ AI ไม่สามารถตอบได้ในขณะนี้');
        }
    }

    // ระบบแจ้งเตือน
    if (message.content.startsWith('!เตือน')) {
        const args = message.content.split(' ');
        const time = parseInt(args[1]);
        const note = args.slice(2).join(' ');

        if (isNaN(time) || !note) return message.reply('ใช้แบบนี้: `!เตือน 5 ไปกินข้าว`');

        message.reply(`🕒 จะเตือนเรื่อง **"${note}"** ในอีก ${time} นาที`);
        setTimeout(() => {
            message.reply(`🔔 **แจ้งเตือน:** ${note}`);
        }, time * 60000);
    }
});

client.login(DISCORD_TOKEN);

// คำสั่งเช็กข่าวแบบกดมือ (พิมพ์ !test ใน Discord)
client.on('messageCreate', async (message) => {
    if (message.content === '!test') {
        try {
            const feed = await parser.parseURL('https://news.thaipbs.or.th/rss/news/latest');
            message.reply(`ดึงข่าวได้แล้ว! หัวข้อคือ: ${feed.items[0].title}`);
        } catch (err) {
            message.reply(`ดึงข่าวไม่สำเร็จ: ${err.message}`);
        }
    }
});