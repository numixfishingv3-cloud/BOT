const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

// ฟังก์ชันดึงข่าว IT ที่ปลอดภัยขึ้น
async function getITNews(limit = 1) {
    try {
        let url = 'https://news.google.com/rss/search?q=technology+when:1h&hl=th&gl=TH&ceid=TH:th';
        let feed = await parser.parseURL(url);

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

// เปลี่ยนเป็น clientReady เพื่อแก้คำเตือน DeprecationWarning
client.on('clientReady', () => {
    console.log(`✅ บอท ${client.user.tag} ออนไลน์พร้อมระบบข่าวแบบเสถียร!`);
    
    setInterval(async () => {
        try {
            const channel = client.channels.cache.get(NEWS_CHANNEL_ID);
            if (!channel) return;

            const news = await getITNews(1);
            if (news.length > 0) {
                const title = news[0].title || "ไม่มีหัวข้อข่าว";
                const newsEmbed = new EmbedBuilder()
                    .setColor(0x00BFFF)
                    .setAuthor({ name: 'IT NEWS AUTO-UPDATE', iconURL: 'https://i.imgur.com/8nNf9fR.png' })
                    .setTitle(`💻 ข่าวไอทีล่าสุด: ${title.slice(0, 250)}`)
                    .setURL(news[0].link)
                    .setDescription('อัปเดตเทคโนโลยีใหม่ล่าสุดส่งตรงถึงห้องคุณ')
                    .addFields(
                        { name: '🌐 แหล่งข่าว', value: news[0].source?.text || 'Google News', inline: true },
                        { name: '📅 วันที่', value: news[0].pubDate || 'วันนี้', inline: true }
                    )
                    .setFooter({ text: 'กดปุ่มด้านล่างเพื่อดึงข่าวใหม่ทันที' })
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

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'fetch_news_now') {
        try {
            await interaction.deferReply();
            const news = await getITNews(1);
            if (news.length > 0) {
                const title = news[0].title || "ไม่มีหัวข้อข่าว";
                const embed = new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle(`🆕 ข่าวสดใหม่: ${title.slice(0, 250)}`)
                    .setURL(news[0].link)
                    .setDescription(`ดึงข้อมูลล่าสุดเมื่อ: <t:${Math.floor(Date.now() / 1000)}:R>`)
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply({ content: '❌ ตอนนี้ไม่สามารถดึงข่าวได้ครับ' });
            }
        } catch (err) {
            console.error(err);
        }
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!ข่าว')) {
        const args = message.content.split(' ');
        const num = parseInt(args[1]) || 1;
        const limit = Math.min(num, 5); 

        const newsList = await getITNews(limit);
        if (newsList.length === 0) return message.reply("❌ ไม่สามารถดึงข่าวได้ในขณะนี้");

        const embed = new EmbedBuilder()
            .setColor(0x00BFFF)
            .setTitle(`🚀 สรุปข่าวไอทีล่าสุด ${newsList.length} อันดับ`)
            .setTimestamp();

        newsList.forEach((news, index) => {
            // แก้ไขจุดที่ทำให้แครช: ตรวจสอบว่ามี Title หรือไม่
            const fieldName = news.title ? `${index + 1}. ${news.title.slice(0, 250)}` : `${index + 1}. คลิกเพื่ออ่านรายละเอียด`;
            const fieldValue = news.link ? `[คลิกเพื่ออ่านเพิ่มเติม](${news.link})` : 'ไม่มีลิงก์ข่าว';
            embed.addFields({ name: fieldName, value: fieldValue });
        });

        message.reply({ embeds: [embed] });
    }

    if (message.content.startsWith('!ถาม')) {
        const prompt = message.content.replace('!ถาม', '').trim();
        if (!prompt) return message.reply('พิมพ์คำถามมาได้เลย!');
        try {
            const result = await model.generateContent(prompt);
            const aiEmbed = new EmbedBuilder().setColor(0x5865F2).setDescription(result.response.text().slice(0, 4000)).setTimestamp();
            await message.reply({ embeds: [aiEmbed] });
        } catch (e) { message.reply('❌ AI Error'); }
    }

    if (message.content.startsWith('!เตือน')) {
        const args = message.content.split(' ');
        const time = parseInt(args[1]);
        const note = args.slice(2).join(' ');
        if (!isNaN(time) && note) {
            message.reply(`🕒 จะเตือนเรื่อง **"${note}"** ในอีก ${time} นาที`);
            setTimeout(() => {
                message.reply({ content: `<@${message.author.id}>`, embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('🔔 แจ้งเตือน!').setDescription(note)] });
            }, time * 60000);
        }
    }
});

client.login(DISCORD_TOKEN);
