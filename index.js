const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Parser = require('rss-parser');
const parser = new Parser();

// ดึงค่าจาก Environment Variables ใน Railway
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

// --- ฟังก์ชันดึงข่าว IT (แก้ปัญหาดึงไม่ได้ โดยขยายเวลาเป็น 24 ชม. ถ้า 1 ชม. ไม่มีข่าว) ---
async function getITNews(limit = 1) {
    try {
        // ลองหาข่าวใน 1 ชม. ก่อนเพื่อความสดใหม่
        let url = 'https://news.google.com/rss/search?q=technology+when:1h&hl=th&gl=TH&ceid=TH:th';
        let feed = await parser.parseURL(url);

        // ถ้าไม่มีข่าวใน 1 ชม. ให้ถอยไปหาใน 24 ชม. แทน (กัน Error ดึงข่าวไม่ติด)
        if (!feed.items || feed.items.length === 0) {
            url = 'https://news.google.com/rss/search?q=technology+when:24h&hl=th&gl=TH&ceid=TH:th';
            feed = await parser.parseURL(url);
        }

        return feed.items.slice(0, limit);
    } catch (err) {
        console.error("RSS Fetch Error:", err.message);
        return [];
    }
}

client.on('ready', () => {
    console.log(`✅ บอท ${client.user.tag} ออนไลน์พร้อมระบบข่าวและปุ่มกด!`);
    
    // --- ระบบแจ้งข่าว IT อัตโนมัติทุก 30 นาที ---
    setInterval(async () => {
        try {
            const channel = client.channels.cache.get(NEWS_CHANNEL_ID);
            if (!channel) return;

            const news = await getITNews(1);
            if (news.length > 0) {
                const newsEmbed = new EmbedBuilder()
                    .setColor(0x00BFFF)
                    .setAuthor({ name: 'IT NEWS AUTO-UPDATE', iconURL: 'https://i.imgur.com/8nNf9fR.png' })
                    .setTitle(`💻 ข่าวไอทีล่าสุด: ${news[0].title}`)
                    .setURL(news[0].link)
                    .setDescription('อัปเดตเทคโนโลยีใหม่ล่าสุดส่งตรงถึงห้องคุณ')
                    .addFields(
                        { name: '🌐 แหล่งข่าว', value: news[0].source?.text || 'Google News', inline: true },
                        { name: '📅 วันที่', value: news[0].pubDate || 'วันนี้', inline: true }
                    )
                    .setFooter({ text: 'กดปุ่มด้านล่างเพื่อดึงข่าวใหม่ทันทีไม่ต้องรอรอบ' })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('fetch_news_now')
                        .setLabel('🔄 ดึงข่าวใหม่ทันที')
                        .setStyle(ButtonStyle.Primary)
                );

                await channel.send({ embeds: [newsEmbed], components: [row] });
            }
        } catch (error) {
            console.error('Interval News Error:', error.message);
        }
    }, 1800000); 
});

// --- ระบบจัดการปุ่มกด (Button Interaction) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'fetch_news_now') {
        await interaction.deferReply({ ephemeral: false }); // บอก Discord ว่ากำลังประมวลผล
        const news = await getITNews(1);
        
        if (news.length > 0) {
            const embed = new EmbedBuilder()
                .setColor(0x57F287) // สีเขียว
                .setTitle(`🆕 ข่าวสดใหม่ (เรียกผ่านปุ่ม): ${news[0].title}`)
                .setURL(news[0].link)
                .setDescription(`ดึงข้อมูลล่าสุดเมื่อ: <t:${Math.floor(Date.now() / 1000)}:R>`)
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply({ content: '❌ ขออภัย ตอนนี้ไม่สามารถดึงข่าวได้ ลองอีกครั้งภายหลังครับ' });
        }
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- 1. คำสั่งดึงข่าวแบบกำหนดจำนวน (!ข่าว [ตัวเลข]) ---
    if (message.content.startsWith('!ข่าว')) {
        const args = message.content.split(' ');
        const num = parseInt(args[1]) || 1;
        const limit = Math.min(num, 5); 

        const newsList = await getITNews(limit);
        if (newsList.length === 0) return message.reply("❌ ไม่สามารถดึงข่าวไอทีได้ในขณะนี้");

        const embed = new EmbedBuilder()
            .setColor(0x00BFFF)
            .setTitle(`🚀 สรุปข่าวไอทีล่าสุด ${newsList.length} อันดับ`)
            .setTimestamp();

        newsList.forEach((news, index) => {
            embed.addFields({ name: `${index + 1}. ${news.title}`, value: `[คลิกเพื่ออ่านเพิ่มเติม](${news.link})` });
        });

        message.reply({ embeds: [embed] });
    }

    // --- 2. ระบบ AI Gemini (!ถาม) ---
    if (message.content.startsWith('!ถาม')) {
        const prompt = message.content.replace('!ถาม', '').trim();
        if (!prompt) return message.reply('พิมพ์คำถามมาได้เลยครับ!');

        try {
            const result = await model.generateContent(prompt);
            const aiEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setAuthor({ name: 'Gemini AI Intelligence', iconURL: client.user.displayAvatarURL() })
                .setDescription(result.response.text())
                .setFooter({ text: `ถามโดย ${message.author.username}` })
                .setTimestamp();

            await message.reply({ embeds: [aiEmbed] });
        } catch (e) {
            message.reply('❌ AI ติดขัดบางอย่าง กรุณาลองใหม่ครับ');
        }
    }

    // --- 3. ระบบแจ้งเตือน (!เตือน [นาที] [เรื่อง]) ---
    if (message.content.startsWith('!เตือน')) {
        const args = message.content.split(' ');
        const time = parseInt(args[1]);
        const note = args.slice(2).join(' ');

        if (!isNaN(time) && note) {
            const remindEmbed = new EmbedBuilder()
                .setColor(0xFEE75C)
                .setDescription(`🕒 รับทราบ! ผมจะเตือนเรื่อง **"${note}"** ในอีก ${time} นาทีครับ`);
            
            message.reply({ embeds: [remindEmbed] });

            setTimeout(() => {
                const alertEmbed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('🔔 แจ้งเตือนมาแล้ว!')
                    .setDescription(`เรื่อง: **${note}**`)
                    .setTimestamp();
                message.reply({ content: `<@${message.author.id}>`, embeds: [alertEmbed] });
            }, time * 60000);
        }
    }
});

client.login(DISCORD_TOKEN);
