const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Parser = require('rss-parser');
const parser = new Parser();

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

client.on('clientReady', () => {
    console.log(`✅ บอท ${client.user.tag} ออนไลน์พร้อมใช้งานแล้ว!`);
    
    setInterval(async () => {
        try {
            const channel = client.channels.cache.get(NEWS_CHANNEL_ID);
            if (!channel) return;

            const feed = await parser.parseURL('https://news.google.com/rss/search?q=technology+when:1h&hl=th&gl=TH&ceid=TH:th');
            const latestPost = feed.items[0];
            if (!latestPost) return;

            const newsEmbed = new EmbedBuilder()
                .setColor(0x00BFFF)
                .setTitle(`💻 อัปเดตโลกไอที: ${latestPost.title}`)
                .setURL(latestPost.link)
                .setDescription('คลิกที่หัวข้อข่าวเพื่ออ่านรายละเอียดเพิ่มเติม')
                .addFields(
                    { name: '🌐 แหล่งข่าว', value: latestPost.source?.text || 'Google News IT', inline: true },
                    { name: '📅 เวลาเผยแพร่', value: latestPost.pubDate || 'ไม่ระบุ', inline: true }
                )
                .setFooter({ text: 'ระบบแจ้งข่าวไอทีอัตโนมัติทุก 30 นาที' })
                .setTimestamp();

            await channel.send({ embeds: [newsEmbed] });
        } catch (error) {
            console.error('RSS Error:', error.message);
        }
    }, 1800000); 
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- !ถาม ---
    if (message.content.startsWith('!ถาม')) {
        const prompt = message.content.replace('!ถาม', '').trim();
        if (!prompt) return message.reply('พิมพ์คำถามมาได้เลย!');
        try {
            const result = await model.generateContent(prompt);
            const aiEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setDescription(result.response.text())
                .setTimestamp();
            await message.reply({ embeds: [aiEmbed] });
        } catch (e) {
            message.reply('❌ AI ไม่สามารถประมวลผลได้');
        }
    }

    // --- !เตือน ---
    if (message.content.startsWith('!เตือน')) {
        const args = message.content.split(' ');
        const time = parseInt(args[1]);
        const note = args.slice(2).join(' ');
        if (!isNaN(time) && note) {
            message.reply(`🕒 จะเตือนเรื่อง **"${note}"** ในอีก ${time} นาที`);
            setTimeout(() => {
                const alertEmbed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('🔔 แจ้งเตือน!')
                    .setDescription(note)
                    .setTimestamp();
                message.reply({ content: `<@${message.author.id}>`, embeds: [alertEmbed] });
            }, time * 60000);
        }
    }

    // --- !test ---
    if (message.content === '!test') {
        try {
            const feed = await parser.parseURL('https://news.google.com/rss/search?q=technology+when:1h&hl=th&gl=TH&ceid=TH:th');
            const latestPost = feed.items[0];
            if (latestPost) {
                const testEmbed = new EmbedBuilder()
                    .setColor(0x00BFFF)
                    .setTitle(`✅ ระบบข่าว IT: ${latestPost.title}`)
                    .setURL(latestPost.link)
                    .setFooter({ text: 'แหล่งข่าว: Google News IT' })
                    .setTimestamp();
                message.reply({ embeds: [testEmbed] });
            }
        } catch (err) {
            message.reply(`❌ Error: ${err.message}`);
        }
    }
}); // <--- ต้องมีปีกกาและวงเล็บปิดตรงนี้

client.login(DISCORD_TOKEN);
