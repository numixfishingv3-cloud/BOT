const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Parser = require('rss-parser');
const axios = require('axios');
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

// --- ฟังก์ชันดึงข่าวไอทีพร้อมสรุป AI ---
async function getITNewsWithSummary(limit = 1) {
    try {
        let url = 'https://news.google.com/rss/search?q=technology+when:24h&hl=th&gl=TH&ceid=TH:th';
        let feed = await parser.parseURL(url);
        let items = feed.items.slice(0, limit);
        for (let item of items) {
            const result = await model.generateContent(`สรุปข่าวนี้สั้นๆ 3 บรรทัดให้ดูน่าตื่นเต้น: ${item.title}`);
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
    console.log(`🎬 ${client.user.tag} เข้าสู่โหมด Entertainment Pro Max!`);
    
    // ระบบส่งข่าวอัตโนมัติทุก 30 นาที
    setInterval(async () => {
        const channel = client.channels.cache.get(NEWS_CHANNEL_ID);
        if (!channel) return;
        const news = await getITNewsWithSummary(1);
        if (news.length > 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF00FF)
                .setTitle(`🔥 ข่าวเด่นไอที: ${news[0].title}`)
                .setDescription(news[0].summary)
                .setTimestamp();
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('fetch_news_now').setLabel('🔄 ข่าวใหม่').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('tts_news').setLabel('🔊 อ่านข่าวนี้').setStyle(ButtonStyle.Secondary)
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
        const embed = new EmbedBuilder().setColor(0x00FF00).setTitle(news[0].title).setDescription(news[0].summary);
        await interaction.editReply({ embeds: [embed] });
    }

    if (interaction.customId === 'tts_news') {
        // จำลองการอ่านออกเสียงโดยการสรุปข้อความให้ใช้กับระบบ TTS ในเครื่องได้ง่าย
        await interaction.reply({ content: `🎙️ **บอทกำลังเตรียมการอ่านข่าวให้คุณ...**\n(คุณสามารถใช้ฟีเจอร์ "Speak" ใน Discord มือถือหรือคอมพิวเตอร์เพื่อฟังข้อความนี้ได้ครับ)`, ephemeral: true });
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content) return;

    if (message.content.startsWith('!')) {
        const args = message.content.split(' ');
        const command = args[0].toLowerCase();

        // --- [ของใหม่] !ดีเจ [อารมณ์] ---
        if (command === '!ดีเจ') {
            const mood = args.slice(1).join(' ') || 'สดชื่น';
            await message.channel.sendTyping();
            const djResult = await model.generateContent(`แนะนำเพลงจาก YouTube 1 เพลงที่เหมาะกับอารมณ์ "${mood}" พร้อมเหตุผลสั้นๆ และแปะลิงก์ YouTube ด้วย`);
            message.reply(`🎧 **AI DJ จัดให้:**\n${djResult.response.text()}`);
        }

        // --- [ของใหม่] !ทาย (Mini Game) ---
        if (command === '!ทาย') {
            const gamePrompt = await model.generateContent("ขอโจทย์คำถามกวนๆ หรือปริศนาคำทาย 1 ข้อ พร้อมตัวเลือก A, B, C และเฉลย (เฉลยให้ใส่ไว้บรรทัดสุดท้าย)");
            message.reply(`🎮 **เกมทายใจมาแล้ว:**\n${gamePrompt.response.text()}`);
        }

        // --- [ของเดิม] !ราคา ---
        if (command === '!ราคา') {
            const coin = args[1] || 'bitcoin';
            const price = await getCryptoPrice(coin.toLowerCase());
            if (price) {
                const data = price[Object.keys(price)[0]];
                const embed = new EmbedBuilder().setColor(0xF7931A).setTitle(`📊 ราคา ${coin.toUpperCase()}`)
                    .addFields({ name: 'USD', value: `$${data.usd.toLocaleString()}`, inline: true }, { name: 'THB', value: `${data.thb.toLocaleString()} บาท`, inline: true });
                message.reply({ embeds: [embed] });
            } else { message.reply('❌ หาไม่เจอครับ'); }
        }

        // --- [ของเดิม] !ลบ ---
        if (command === '!ลบ' && message.member.permissions.has('ManageMessages')) {
            const amount = parseInt(args[1]) || 5;
            await message.channel.bulkDelete(Math.min(amount + 1, 100));
        }

        // --- [ของเดิม] !เตือน ---
        if (command === '!เตือน') {
            const time = parseInt(args[1]);
            const note = args.slice(2).join(' ');
            if (!isNaN(time) && note) {
                message.reply(`🕒 ตั้งเตือน "${note}" ในอีก ${time} นาทีแล้วครับ`);
                setTimeout(() => message.reply(`🔔 **เตือน:** ${note} <@${message.author.id}>`), time * 60000);
            }
        }

    } else {
        // --- ระบบ AI คุยอัตโนมัติ (ไม่ต้องพิมพ์ !ถาม) ---
        try {
            await message.channel.sendTyping();
            const result = await model.generateContent(message.content);
            const aiEmbed = new EmbedBuilder().setColor(0x5865F2).setAuthor({ name: 'Gemini AI Pro' }).setDescription(result.response.text().slice(0, 4000));
            await message.reply({ embeds: [aiEmbed] });
        } catch (e) { console.error(e); }
    }
});

client.login(DISCORD_TOKEN);
