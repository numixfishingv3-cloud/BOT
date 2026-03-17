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

client.on('clientReady', () => {
    console.log(`✅ บอท ${client.user.tag} พร้อมคุยแบบไม่ต้องใช้คำสั่งแล้ว!`);
    
    setInterval(async () => {
        try {
            const channel = client.channels.cache.get(NEWS_CHANNEL_ID);
            if (!channel) return;
            const news = await getITNews(1);
            if (news.length > 0) {
                const title = news[0].title || "ไม่มีหัวข้อข่าว";
                const newsEmbed = new EmbedBuilder()
                    .setColor(0x00BFFF)
                    .setTitle(`💻 ข่าวไอทีล่าสุด: ${title.slice(0, 250)}`)
                    .setURL(news[0].link)
                    .setFooter({ text: 'กดปุ่มเพื่อดึงข่าวใหม่' })
                    .setTimestamp();
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('fetch_news_now').setLabel('🔄 ดึงข่าวใหม่ทันที').setStyle(ButtonStyle.Primary)
                );
                await channel.send({ embeds: [newsEmbed], components: [row] });
            }
        } catch (error) { console.error(error); }
    }, 1800000); 
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'fetch_news_now') {
        try {
            await interaction.deferReply();
            const news = await getITNews(1);
            if (news.length > 0) {
                const embed = new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle(`🆕 ข่าวสดใหม่: ${news[0].title.slice(0, 250)}`)
                    .setURL(news[0].link)
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed] });
            }
        } catch (err) { console.error(err); }
    }
});

client.on('messageCreate', async (message) => {
    // 1. ป้องกันบอทคุยกันเอง และเช็กข้อความว่าง
    if (message.author.bot || !message.content) return;

    // 2. ถ้าข้อความขึ้นต้นด้วย ! (เป็นคำสั่ง) ให้ไปทำตามคำสั่งนั้นๆ
    if (message.content.startsWith('!')) {
        if (message.content.startsWith('!ข่าว')) {
            const num = parseInt(message.content.split(' ')[1]) || 1;
            const newsList = await getITNews(Math.min(num, 5));
            const embed = new EmbedBuilder().setColor(0x00BFFF).setTitle(`🚀 สรุปข่าวไอที ${newsList.length} อันดับ`);
            newsList.forEach((news, i) => embed.addFields({ name: `${i+1}. ${news.title.slice(0, 250)}`, value: `[อ่านต่อ](${news.link})` }));
            return message.reply({ embeds: [embed] });
        }

        if (message.content.startsWith('!เตือน')) {
            const args = message.content.split(' ');
            const time = parseInt(args[1]);
            const note = args.slice(2).join(' ');
            if (!isNaN(time) && note) {
                message.reply(`🕒 รับทราบ! จะเตือนเรื่อง "${note}" ในอีก ${time} นาที`);
                setTimeout(() => {
                    const alert = new EmbedBuilder().setColor(0xED4245).setTitle('🔔 เตือนแล้ว!').setDescription(note);
                    message.reply({ content: `<@${message.author.id}>`, embeds: [alert] });
                }, time * 60000);
            }
            return;
        }

        if (message.content === '!test') {
            const news = await getITNews(1);
            const testEmbed = new EmbedBuilder().setColor(0x57F287).setTitle(`✅ ระบบ OK: ${news[0]?.title}`);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fetch_news_now').setLabel('🔄 ลองกดปุ่ม').setStyle(ButtonStyle.Primary));
            return message.reply({ embeds: [testEmbed], components: [row] });
        }
    } else {
        // 3. ถ้าไม่มี ! นำหน้า ให้บอทตอบแบบ AI อัตโนมัติ (ไม่ต้องพิมพ์ !ถาม)
        try {
            // แสดงสถานะว่าบอทกำลังพิมพ์ (Typing...) ให้ดูเหมือนคนคุย
            await message.channel.sendTyping();
            
            const result = await model.generateContent(message.content);
            const aiEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setAuthor({ name: 'Gemini AI Response', iconURL: client.user.displayAvatarURL() })
                .setDescription(result.response.text().slice(0, 4000))
                .setTimestamp();
            
            await message.reply({ embeds: [aiEmbed] });
        } catch (e) {
            console.error(e);
            // ไม่ต้องแจ้ง Error เพื่อไม่ให้รกแชทเวลาคุยเล่นทั่วไป
        }
    }
});

client.login(DISCORD_TOKEN);
