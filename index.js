const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Parser = require('rss-parser');
const axios = require('axios'); // สำหรับดึงราคา Crypto
const parser = new Parser();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NEWS_CHANNEL_ID = process.env.NEWS_CHANNEL_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- ฟังก์ชันดึงข่าว IT และสรุปด้วย AI ---
async function getITNewsWithSummary(limit = 1) {
    try {
        let url = 'https://news.google.com/rss/search?q=technology+when:24h&hl=th&gl=TH&ceid=TH:th';
        let feed = await parser.parseURL(url);
        let items = feed.items.slice(0, limit);
        
        for (let item of items) {
            // ใช้ AI สรุปข่าวสั้นๆ 3 บรรทัด
            const summaryPrompt = `สรุปข่าวนี้เป็น 3 บรรทัดสั้นๆ สำหรับ Discord: ${item.title}`;
            const result = await model.generateContent(summaryPrompt);
            item.summary = result.response.text();
        }
        return items;
    } catch (err) {
        console.error("News Error:", err);
        return [];
    }
}

// --- ฟังก์ชันดึงราคา Crypto ---
async function getCryptoPrice(coin) {
    try {
        const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd,thb&include_24hr_change=true`);
        return res.data;
    } catch (e) { return null; }
}

client.on('clientReady', () => {
    console.log(`🚀 ${client.user.tag} ออนไลน์สมบูรณ์แบบ!`);
    
    // ระบบส่งข่าว IT พร้อมสรุป AI ทุก 30 นาที
    setInterval(async () => {
        const channel = client.channels.cache.get(NEWS_CHANNEL_ID);
        if (!channel) return;
        const news = await getITNewsWithSummary(1);
        if (news.length > 0) {
            const embed = new EmbedBuilder()
                .setColor(0x00BFFF)
                .setTitle(`📰 สรุปข่าวไอที: ${news[0].title}`)
                .setURL(news[0].link)
                .setDescription(`**สรุปโดย AI:**\n${news[0].summary}`)
                .setFooter({ text: 'กดปุ่มด้านล่างเพื่ออัปเดตข่าวใหม่' })
                .setTimestamp();
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('fetch_news_now').setLabel('🔄 ข่าวใหม่').setStyle(ButtonStyle.Primary)
            );
            await channel.send({ embeds: [embed], components: [row] });
        }
    }, 1800000);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'fetch_news_now') {
        await interaction.deferReply();
        const news = await getITNewsWithSummary(1);
        const embed = new EmbedBuilder().setColor(0x57F287).setTitle(news[0].title).setURL(news[0].link).setDescription(news[0].summary);
        await interaction.editReply({ embeds: [embed] });
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content) return;

    if (message.content.startsWith('!')) {
        const args = message.content.split(' ');
        const command = args[0].toLowerCase();

        // 1. !ราคา [ชื่อเหรียญเช่น btc, eth]
        if (command === '!ราคา') {
            const coin = args[1] || 'bitcoin';
            const price = await getCryptoPrice(coin.toLowerCase());
            if (price) {
                const data = price[Object.keys(price)[0]];
                const embed = new EmbedBuilder()
                    .setColor(0xF7931A)
                    .setTitle(`📊 ราคา ${coin.toUpperCase()}`)
                    .addFields(
                        { name: 'USD', value: `$${data.usd.toLocaleString()}`, inline: true },
                        { name: 'THB', value: `${data.thb.toLocaleString()} บาท`, inline: true },
                        { name: 'Change 24h', value: `${data.usd_24h_change.toFixed(2)}%`, inline: true }
                    );
                message.reply({ embeds: [embed] });
            } else { message.reply('❌ ไม่พบชื่อเหรียญนี้ (ลอง btc, eth, doge)'); }
        }

        // 2. !ลบ [จำนวน]
        if (command === '!ลบ' && message.member.permissions.has('ManageMessages')) {
            const amount = parseInt(args[1]) || 5;
            await message.channel.bulkDelete(Math.min(amount + 1, 100));
            message.channel.send(`🧹 ลบให้แล้ว ${amount} ข้อความครับ!`).then(msg => setTimeout(() => msg.delete(), 3000));
        }

        // 3. !สุ่ม [ตัวเลือก1] [ตัวเลือก2]
        if (command === '!สุ่ม') {
            const options = args.slice(1);
            if (options.length < 2) return message.reply('พิมพ์ของมาอย่างน้อย 2 อย่างนะ เช่น `!สุ่ม กินข้าว กินเส้น`');
            const choice = options[Math.floor(Math.random() * options.length)];
            message.reply(`🎲 ผมเลือกให้แล้ว: **${choice}** ครับ!`);
        }

        // 4. !ข่าว [จำนวน] (พร้อมสรุป AI)
        if (command === '!ข่าว') {
            const num = parseInt(args[1]) || 1;
            const newsList = await getITNewsWithSummary(Math.min(num, 3));
            newsList.forEach(n => {
                const embed = new EmbedBuilder().setColor(0x00BFFF).setTitle(n.title).setURL(n.link).setDescription(n.summary);
                message.reply({ embeds: [embed] });
            });
        }

        // 5. !เตือน [นาที] [เรื่อง]
        if (command === '!เตือน') {
            const time = parseInt(args[1]);
            const note = args.slice(2).join(' ');
            if (!isNaN(time) && note) {
                message.reply(`🕒 รับทราบ! จะเตือนเรื่อง "${note}" ในอีก ${time} นาที`);
                setTimeout(() => {
                    message.reply({ content: `<@${message.author.id}> 🔔 **ได้เวลาแล้ว:** ${note}` });
                }, time * 60000);
            }
        }

        // 6. !test (เช็กทุกระบบ)
        if (command === '!test') {
            message.reply('✅ บอทระบบ Pro Max ทำงานปกติ! ลองคุยกับผม หรือใช้คำสั่ง !ราคา !ลบ !สุ่ม !ข่าว !เตือน ได้เลย');
        }

    } else {
        // --- ระบบ AI คุยอัตโนมัติ (ไม่ต้องพิมพ์ !ถาม) ---
        try {
            await message.channel.sendTyping();
            const result = await model.generateContent(message.content);
            const aiEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setAuthor({ name: 'Gemini AI Pro', iconURL: client.user.displayAvatarURL() })
                .setDescription(result.response.text().slice(0, 4000))
                .setFooter({ text: 'คุยกับผมได้เลย ไม่ต้องใช้ !ถาม แล้วนะ!' });
            await message.reply({ embeds: [aiEmbed] });
        } catch (e) { console.error("AI Error:", e); }
    }
});

client.login(DISCORD_TOKEN);
