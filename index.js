const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Parser = require('rss-parser');
const axios = require('axios');
const parser = new Parser();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NEWS_CHANNEL_ID = process.env.NEWS_CHANNEL_ID;
const MUSIC_ROOM_ID = "1359908768279957565"; // ไอดีห้องเปิดเพลงที่คุณให้มา

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

// --- ฟังก์ชันดึงข่าวไอทีพร้อมสรุป AI ---
async function getITNewsWithSummary(limit = 1) {
    try {
        let url = 'https://news.google.com/rss/search?q=technology+when:24h&hl=th&gl=TH&ceid=TH:th';
        let feed = await parser.parseURL(url);
        let items = feed.items.slice(0, limit);
        for (let item of items) {
            const result = await model.generateContent(`สรุปข่าวนี้ 3 บรรทัดให้ดูน่าสนใจ: ${item.title}`);
            item.summary = result.response.text();
        }
        return items;
    } catch (err) { return []; }
}

// --- ฟังก์ชันดึงราคา Crypto ---
async function getCryptoPrice(coin) {
    try {
        const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd,thb&include_24hr_change=true`);
        return res.data;
    } catch (e) { return null; }
}

client.on('clientReady', () => {
    console.log(`🎬 ${client.user.tag} พร้อมให้บริการพร้อมระบบแนะนำห้องเพลง!`);
    
    // ระบบส่งข่าวอัตโนมัติทุก 30 นาที
    setInterval(async () => {
        const channel = client.channels.cache.get(NEWS_CHANNEL_ID);
        if (!channel) return;
        const news = await getITNewsWithSummary(1);
        if (news.length > 0) {
            const embed = new EmbedBuilder()
                .setColor(0x00BFFF)
                .setTitle(`📰 อัปเดตไอที: ${news[0].title}`)
                .setDescription(news[0].summary)
                .setTimestamp();
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('fetch_news_now').setLabel('🔄 ข่าวใหม่').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('tts_news').setLabel('🔊 สรุปเสียง').setStyle(ButtonStyle.Secondary)
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
        const embed = new EmbedBuilder().setColor(0x57F287).setTitle(news[0].title).setDescription(news[0].summary);
        await interaction.editReply({ embeds: [embed] });
    }
    if (interaction.customId === 'tts_news') {
        await interaction.reply({ content: `🎙️ **สรุปข่าวสำหรับอ่านออกเสียง:** บอทสรุปเนื้อหาให้แล้ว คุณสามารถกดค้างที่ข้อความข่าวเพื่อใช้ระบบ "Speak" ของ Discord ได้เลยครับ!`, ephemeral: true });
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content) return;

    if (message.content.startsWith('!')) {
        const args = message.content.split(' ');
        const command = args[0].toLowerCase();

        // --- !ดีเจ [อารมณ์] (ปรับปรุงลิงก์ให้ก๊อปง่าย + แท็กห้องเพลง) ---
        if (command === '!ดีเจ') {
            const mood = args.slice(1).join(' ') || 'สดชื่น';
            await message.channel.sendTyping();
            
            const djResult = await model.generateContent(`แนะนำเพลงจาก YouTube 1 เพลงที่เหมาะกับอารมณ์ "${mood}" โดยให้ตอบในรูปแบบ ชื่อเพลง, เหตุผล, และลิงก์แยกบรรทัดชัดเจน`);
            const responseText = djResult.response.text();

            const djEmbed = new EmbedBuilder()
                .setColor(0xFF00FF)
                .setAuthor({ name: 'AI DJ Personal Mix', iconURL: client.user.displayAvatarURL() })
                .setTitle(`🎧 เพลงสำหรับอารมณ์: ${mood}`)
                .setDescription(responseText)
                .addFields({ name: '📍 ห้องเปิดเพลง', value: `<#${MUSIC_ROOM_ID}>`, inline: false })
                .setFooter({ text: 'ก๊อปปี้ลิงก์ด้านบนไปเปิดในห้องเพลงได้เลย!' });

            message.reply({ embeds: [djEmbed] });
        }

        // --- !ทาย (Mini Game) ---
        if (command === '!ทาย') {
            const gamePrompt = await model.generateContent("ขอโจทย์คำถามกวนๆ 1 ข้อ พร้อมตัวเลือก A, B, C และเฉลยบรรทัดสุดท้าย");
            message.reply(`🎮 **เกมทายใจ:**\n${gamePrompt.response.text()}`);
        }

        // --- !ราคา ---
        if (command === '!ราคา') {
            const coin = args[1] || 'bitcoin';
            const price = await getCryptoPrice(coin.toLowerCase());
            if (price) {
                const data = price[Object.keys(price)[0]];
                const embed = new EmbedBuilder().setColor(0xF7931A).setTitle(`📊 ราคา ${coin.toUpperCase()}`)
                    .addFields({ name: 'USD', value: `$${data.usd.toLocaleString()}`, inline: true }, { name: 'THB', value: `${data.thb.toLocaleString()} บาท`, inline: true });
                message.reply({ embeds: [embed] });
            } else { message.reply('❌ ไม่พบข้อมูลเหรียญครับ'); }
        }

        // --- !ลบ ---
        if (command === '!ลบ' && message.member.permissions.has('ManageMessages')) {
            const amount = parseInt(args[1]) || 5;
            await message.channel.bulkDelete(Math.min(amount + 1, 100));
        }

        // --- !เตือน ---
        if (command === '!เตือน') {
            const time = parseInt(args[1]);
            const note = args.slice(2).join(' ');
            if (!isNaN(time) && note) {
                message.reply(`🕒 ตั้งเตือน "${note}" ในอีก ${time} นาที`);
                setTimeout(() => message.reply(`🔔 **เตือน:** ${note} <@${message.author.id}>`), time * 60000);
            }
        }

        // --- !test ---
        if (command === '!test') {
            message.reply('✅ ระบบ Super Bot Pro Max พร้อมใช้งาน! คุยกับผมได้เลย หรือใช้คำสั่ง !ดีเจ !ราคา !ข่าว !เตือน !ลบ !ทาย');
        }

    } else {
        // --- ระบบ AI คุยอัตโนมัติ (ไม่ต้องพิมพ์ !ถาม) ---
        try {
            await message.channel.sendTyping();
            const result = await model.generateContent(message.content);
            const aiEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setAuthor({ name: 'Gemini AI Assistant' })
                .setDescription(result.response.text().slice(0, 4000))
                .setFooter({ text: 'คุยกับผมได้เลย ไม่ต้องใช้ !ถาม แล้วนะครับ' });
            await message.reply({ embeds: [aiEmbed] });
        } catch (e) { console.error(e); }
    }
});

client.login(DISCORD_TOKEN);
