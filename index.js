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

// ฟังก์ชันสำหรับดึงข่าว (แยกออกมาเพื่อให้เรียกใช้ซ้ำได้)
async function getITNews(limit = 1) {
    try {
        const feed = await parser.parseURL('https://news.google.com/rss/search?q=technology+when:1h&hl=th&gl=TH&ceid=TH:th');
        return feed.items.slice(0, limit);
    } catch (err) {
        console.error("RSS Fetch Error:", err);
        return [];
    }
}

client.on('clientReady', () => {
    console.log(`✅ บอท ${client.user.tag} ออนไลน์พร้อมปุ่มกดและคำสั่งดึงข่าว!`);
    
    setInterval(async () => {
        const channel = client.channels.cache.get(NEWS_CHANNEL_ID);
        if (!channel) return;

        const news = await getITNews(1);
        if (news.length > 0) {
            const embed = new EmbedBuilder()
                .setColor(0x00BFFF)
                .setTitle(`💻 อัปเดตไอที (อัตโนมัติ): ${news[0].title}`)
                .setURL(news[0].link)
                .setFooter({ text: 'แหล่งข่าว: Google News IT' })
                .setTimestamp();

            // เพิ่มปุ่มกดใต้ข่าวอัตโนมัติ
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('fetch_news_now')
                    .setLabel('🔄 ดึงข่าวใหม่ทันที')
                    .setStyle(ButtonStyle.Primary)
            );

            await channel.send({ embeds: [embed], components: [row] });
        }
    }, 1800000); 
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'fetch_news_now') {
        const news = await getITNews(1);
        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle(`🔄 ข่าวสดใหม่ (จากปุ่มกด): ${news[0].title}`)
            .setURL(news[0].link)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: false });
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- คำสั่งดึงข่าวตามจำนวน (!ข่าว [เลข]) ---
    if (message.content.startsWith('!ข่าว')) {
        const args = message.content.split(' ');
        const num = parseInt(args[1]) || 1;
        const limit = Math.min(num, 5); // ดึงได้สูงสุด 5 ข่าวเพื่อไม่ให้รก

        const newsList = await getITNews(limit);
        if (newsList.length === 0) return message.reply("❌ ไม่สามารถดึงข่าวได้ในขณะนี้");

        const embed = new EmbedBuilder()
            .setColor(0x00BFFF)
            .setTitle(`🚀 สรุปข่าวไอทีล่าสุด ${limit} อันดับ`)
            .setTimestamp();

        newsList.forEach((news, index) => {
            embed.addFields({ name: `${index + 1}. ${news.title}`, value: `[คลิกเพื่ออ่านข่าวนัก](${news.link})` });
        });

        message.reply({ embeds: [embed] });
    }

    // --- โค้ดส่วน !ถาม และ !เตือน ของเดิม ---
    if (message.content.startsWith('!ถาม')) {
        const prompt = message.content.replace('!ถาม', '').trim();
        if (!prompt) return message.reply('พิมพ์คำถามมาได้เลย!');
        try {
            const result = await model.generateContent(prompt);
            const aiEmbed = new EmbedBuilder().setColor(0x5865F2).setDescription(result.response.text());
            message.reply({ embeds: [aiEmbed] });
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
