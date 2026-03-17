const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Parser = require('rss-parser');
const parser = new Parser();

// ดึงค่าจาก Environment Variables (ที่ตั้งค่าไว้ใน Railway)
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
// ใช้โมเดลล่าสุดปี 2026 ตามที่เช็กในระบบ
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

client.on('clientReady', () => {
    console.log(`✅ บอท ${client.user.tag} ออนไลน์พร้อมลุยโลก IT 24 ชม.!`);
    
    // --- ระบบแจ้งข่าว IT อัตโนมัติทุก 30 นาที ---
    setInterval(async () => {
        try {
            const channel = client.channels.cache.get(NEWS_CHANNEL_ID);
            if (!channel) return;

            // ดึงข่าว IT จาก Google News (ภาษาไทย) เสถียรที่สุด ไม่ติด 404/500
            const feed = await parser.parseURL('https://news.google.com/rss/search?q=technology+when:1h&hl=th&gl=TH&ceid=TH:th');
            const latestPost = feed.items[0];
            
            if (!latestPost) return;

            const newsEmbed = new EmbedBuilder()
                .setColor(0x00BFFF) // สีฟ้าเทคโนโลยี
                .setAuthor({ name: 'IT NEWS UPDATE', iconURL: 'https://i.imgur.com/8nNf9fR.png' })
                .setTitle(`💻 อัปเดตโลกไอที: ${latestPost.title}`)
                .setURL(latestPost.link)
                .setDescription('คลิกที่หัวข้อข่าวเพื่ออ่านรายละเอียดเพิ่มเติมจากแหล่งข่าวต้นฉบับ')
                .addFields(
                    { name: '🌐 แหล่งข่าว', value: latestPost.source?.text || 'ข่าวไอที', inline: true },
                    { name: '📅 เวลาเผยแพร่', value: latestPost.pubDate || 'ไม่ระบุ', inline: true }
                )
                .setFooter({ text: 'ระบบแจ้งข่าวไอทีอัตโนมัติทุก 30 นาที' })
                .setTimestamp();

            await channel.send({ embeds: [newsEmbed] });
            console.log("✅ ส่งข่าว IT เรียบร้อย");
        } catch (error) {
            console.error('⚠️ RSS Error:', error.message);
        }
    }, 1800000); // 30 นาที (1,800,000 ms)
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- 1. คำสั่ง AI ถาม-ตอบ (!ถาม) ---
    if (message.content.startsWith('!ถาม')) {
        const prompt = message.content.replace('!ถาม', '').trim();
        if (!prompt) return message.reply('พิมพ์คำถามเกี่ยวกับไอทีหรืออะไรก็ได้มาได้เลย!');

        try {
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            const aiEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setAuthor({ name: 'Gemini AI Intelligence', iconURL: client.user.displayAvatarURL() })
                .setDescription(responseText)
                .setFooter({ text: `ถามโดย ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                .setTimestamp();

            await message.reply({ embeds: [aiEmbed] });
        } catch (e) {
            console.error(e);
            message.reply('❌ AI ไม่สามารถประมวลผลได้ในขณะนี้');
        }
    }

    // --- 2. คำสั่งแจ้งเตือน (!เตือน) ---
    if (message.content.startsWith('!เตือน')) {
        const args = message.content.split(' ');
        const time = parseInt(args[1]);
        const note = args.slice(2).join(' ');

        if (isNaN(time) || !note) {
            return message.reply('💡 วิธีใช้: `!เตือน 5 ไปกินข้าว`');
        }

        const remindEmbed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setDescription(`🕒 บอทจะแจ้งเตือนเรื่อง **"${note}"** ในอีก ${time} นาทีครับ`);

        message.reply({ embeds: [remindEmbed] });

        setTimeout(() => {
            const alertEmbed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('🔔 การแจ้งเตือนมาแล้ว!')
                .setDescription(`ถึงเวลาแล้วครับ: **${note}**`)
                .setTimestamp();

            message.reply({ content: `<@${message.author.id}>`, embeds: [alertEmbed] });
        }, time * 60000);
    }

// --- 3. คำสั่งทดสอบดึงข่าวล่าสุด (!test) แบบมีกรอบ ---
    if (message.content === '!test') {
        try {
            const feed = await parser.parseURL('https://news.google.com/rss/search?q=technology+when:1h&hl=th&gl=TH&ceid=TH:th');
            const latestPost = feed.items[0];

            if (latestPost) {
                const testEmbed = new EmbedBuilder()
                    .setColor(0x00BFFF)
                    .setTitle(`✅ ทดสอบระบบข่าว: ${latestPost.title}`)
                    .setURL(latestPost.link)
                    .setDescription('ถ้าเห็นข้อความนี้ในกรอบ แสดงว่าระบบข่าวอัตโนมัติทำงานปกติครับ')
                    .setFooter({ text: 'แหล่งข่าว: Google News IT' })
                    .setTimestamp();

                message.reply({ embeds: [testEmbed] });
            } else {
                message.reply('⚠️ ดึงข้อมูลได้ แต่ตอนนี้ยังไม่มีข่าว IT ใหม่ๆ ครับ');
            }
        } catch (err) {
            message.reply(`❌ ระบบข่าวมีปัญหา: ${err.message}`);
        }
    }

client.login(DISCORD_TOKEN);