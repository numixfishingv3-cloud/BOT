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

client.on('clientReady', () => {
    console.log(`✅ บอท ${client.user.tag} ออนไลน์บน Cloud พร้อมใช้งาน 24 ชม.!`);
    
    // --- ระบบแจ้งข่าวอัตโนมัติทุก 30 นาที ---
    setInterval(async () => {
        try {
            const channel = client.channels.cache.get(NEWS_CHANNEL_ID);
            if (!channel) return;

            const feed = await parser.parseURL('https://www.sanook.com/news/rss/latest/');
            const latestPost = feed.items[0];
            
            const newsEmbed = new EmbedBuilder()
                .setColor(0x00FF7F) // สีเขียวสว่าง
                .setTitle(`🌟 ข่าวอัปเดตใหม่: ${latestPost.title}`)
                .setURL(latestPost.link)
                .setDescription(latestPost.contentSnippet ? latestPost.contentSnippet.slice(0, 150) + '...' : 'คลิกเพื่ออ่านรายละเอียดเพิ่มเติม')
                .addFields(
                    { name: '📅 วันที่เผยแพร่', value: latestPost.pubDate || 'เพิ่งเมื่อสักครู่', inline: true },
                    { name: '🔗 แหล่งข่าว', value: 'Sanook News', inline: true }
                )
                .setFooter({ text: 'ระบบแจ้งข่าวอัตโนมัติทุก 30 นาที' })
                .setTimestamp();

            await channel.send({ embeds: [newsEmbed] });
            console.log("✅ ส่งข่าวอัตโนมัติเรียบร้อย");
        } catch (error) {
            console.error('RSS Error:', error.message);
        }
    }, 1800000); // 1,800,000 ms = 30 นาที
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- 1. ระบบ AI ถาม-ตอบ (!ถาม) ---
    if (message.content.startsWith('!ถาม')) {
        const prompt = message.content.replace('!ถาม', '').trim();
        if (!prompt) return message.reply('พิมพ์คำถามที่คุณอยากรู้มาได้เลยครับ!');

        try {
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            const aiEmbed = new EmbedBuilder()
                .setColor(0x5865F2) // สีน้ำเงิน Discord
                .setAuthor({ name: 'Gemini AI Intelligence', iconURL: client.user.displayAvatarURL() })
                .setDescription(responseText)
                .setFooter({ text: `ถามโดย ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            await message.reply({ embeds: [aiEmbed] });
        } catch (e) {
            console.error(e);
            message.reply('❌ AI ไม่สามารถประมวลผลได้ในขณะนี้ กรุณาลองใหม่ครับ');
        }
    }

    // --- 2. ระบบแจ้งเตือน (!เตือน) ---
    if (message.content.startsWith('!เตือน')) {
        const args = message.content.split(' ');
        const time = parseInt(args[1]);
        const note = args.slice(2).join(' ');

        if (isNaN(time) || !note) {
            return message.reply('💡 วิธีใช้: `!เตือน 5 ไปกินข้าว` (ตัวเลขคือนาที)');
        }

        const remindEmbed = new EmbedBuilder()
            .setColor(0xFEE75C) // สีเหลือง
            .setDescription(`🕒 รับทราบ! ผมจะมาเตือนเรื่อง **"${note}"** ในอีก ${time} นาทีครับ`);

        message.reply({ embeds: [remindEmbed] });

        setTimeout(() => {
            const alertEmbed = new EmbedBuilder()
                .setColor(0xED4245) // สีแดงแจ้งเตือน
                .setTitle('🔔 การแจ้งเตือน!')
                .setDescription(`ถึงเวลาแล้วครับ: **${note}**`)
                .setTimestamp();

            message.reply({ content: `<@${message.author.id}>`, embeds: [alertEmbed] });
        }, time * 60000);
    }

    // --- 3. คำสั่งทดสอบระบบข่าว (!test) ---
    if (message.content === '!test') {
        try {
            const feed = await parser.parseURL('https://www.sanook.com/news/rss/latest/');
            message.reply(`✅ ระบบข่าวปกติ: ${feed.items[0].title}`);
        } catch (err) {
            message.reply(`❌ ระบบข่าวมีปัญหา: ${err.message}`);
        }
    }
});

client.login(DISCORD_TOKEN);