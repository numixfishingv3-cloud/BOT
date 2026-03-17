const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Parser = require('rss-parser');
const axios = require('axios');
const parser = new Parser();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NEWS_CHANNEL_ID = process.env.NEWS_CHANNEL_ID;
const MUSIC_ROOM_ID = "1359908768279957565"; 

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const cmdHelp = "\n\n**💡 คำสั่ง:** `!ดีเจ` | `!ข่าว` | `!ราคา` | `!เตือน` | `!สุ่ม` | `!ลบ` | `!ทาย` | `!test`";

// --- ฟังก์ชันดึงข่าว (แบบไม่ใช้ AI สรุป เพื่อประหยัดโควตา) ---
async function getITNews(limit = 1) {
    try {
        let url = 'https://news.google.com/rss/search?q=technology+when:24h&hl=th&gl=TH&ceid=TH:th';
        let feed = await parser.parseURL(url);
        return feed.items.slice(0, limit);
    } catch (err) { return []; }
}

async function getCryptoPrice(coin) {
    try {
        const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd,thb&include_24hr_change=true`);
        return res.data;
    } catch (e) { return null; }
}

client.on('clientReady', () => {
    console.log(`✅ ${client.user.tag} พร้อมทำงานแบบประหยัดพลังงาน!`);
    
    // ส่งข่าวอัตโนมัติ (ไม่ใช้ AI สรุป)
    setInterval(async () => {
        const channel = client.channels.cache.get(NEWS_CHANNEL_ID);
        if (!channel) return;
        const news = await getITNews(1);
        if (news.length > 0) {
            const embed = new EmbedBuilder()
                .setColor(0x00BFFF)
                .setTitle(`📰 ข่าวไอทีล่าสุด: ${news[0].title.slice(0, 250)}`)
                .setURL(news[0].link)
                .setDescription("คลิกที่ลิงก์เพื่ออ่านข่าวฉบับเต็ม" + cmdHelp)
                .setTimestamp();
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('fetch_news_now').setLabel('🔄 ดึงข่าวใหม่').setStyle(ButtonStyle.Primary)
            );
            await channel.send({ embeds: [embed], components: [row] });
        }
    }, 1800000);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'fetch_news_now') {
        await interaction.deferReply();
        const news = await getITNews(1);
        const embed = new EmbedBuilder().setColor(0x57F287).setTitle(news[0].title).setURL(news[0].link).setDescription("อัปเดตข่าวใหม่เรียบร้อยครับ" + cmdHelp);
        await interaction.editReply({ embeds: [embed] });
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content) return;

    if (message.content.startsWith('!')) {
        const args = message.content.split(' ');
        const command = args[0].toLowerCase();

        if (command === '!ดีเจ') {
            const mood = args.slice(1).join(' ') || 'สดชื่น';
            await message.channel.sendTyping();
            try {
                const djResult = await model.generateContent(`แนะนำเพลง YouTube 1 เพลงที่เหมาะกับ "${mood}" บอกชื่อเพลงและเหตุผลสั้นๆ แปะลิงก์บรรทัดสุดท้าย`);
                const aiText = djResult.response.text();
                const urlMatch = aiText.match(/\bhttps?:\/\/\S+/gi);
                const linkOnly = urlMatch ? urlMatch[0] : "";

                const djEmbed = new EmbedBuilder()
                    .setColor(0xFF00FF)
                    .setTitle(`🎧 เพลงสำหรับอารมณ์: ${mood}`)
                    .setDescription(aiText.replace(linkOnly, "").trim() + cmdHelp)
                    .addFields({ name: '📍 ห้องเปิดเพลง', value: `<#${MUSIC_ROOM_ID}>` });

                await message.reply({ embeds: [djEmbed] });
                if (linkOnly) await message.channel.send(`🔗 **Link สำหรับคัดลอก:**\n${linkOnly}`);
            } catch (e) { message.reply("⚠️ ตอนนี้ AI คนใช้เยอะครับ รบกวนลองใหม่ในอีก 1 นาทีนะ"); }
            return;
        }

        if (command === '!ข่าว') {
            const num = Math.min(parseInt(args[1]) || 1, 3);
            const newsList = await getITNews(num);
            newsList.forEach(n => {
                const embed = new EmbedBuilder().setColor(0x00BFFF).setTitle(n.title).setURL(n.link).setDescription("อ่านข่าวต่อในลิงก์ได้เลยครับ" + cmdHelp);
                message.reply({ embeds: [embed] });
            });
            return;
        }

        if (command === '!ราคา') {
            const coin = args[1] || 'bitcoin';
            const price = await getCryptoPrice(coin.toLowerCase());
            if (price) {
                const data = price[Object.keys(price)[0]];
                const embed = new EmbedBuilder().setColor(0xF7931A).setTitle(`📊 ราคา ${coin.toUpperCase()}`)
                    .setDescription(`USD: $${data.usd.toLocaleString()}\nTHB: ${data.thb.toLocaleString()} บาท` + cmdHelp);
                message.reply({ embeds: [embed] });
            } else { message.reply('❌ ไม่พบข้อมูล' + cmdHelp); }
            return;
        }

        if (command === '!เตือน') {
            const time = parseInt(args[1]);
            const note = args.slice(2).join(' ');
            if (!isNaN(time) && note) {
                message.reply(`🕒 ตั้งเตือน "${note}" ในอีก ${time} นาที` + cmdHelp);
                setTimeout(() => message.reply(`🔔 **เตือน:** ${note} <@${message.author.id}>`), time * 60000);
            }
            return;
        }

        if (command === '!ลบ' && message.member.permissions.has('ManageMessages')) {
            const amount = parseInt(args[1]) || 5;
            await message.channel.bulkDelete(Math.min(amount + 1, 100));
            return;
        }

        if (command === '!ทาย') {
            try {
                const res = await model.generateContent("ขอคำถามกวนๆ 1 ข้อ พร้อมตัวเลือก");
                message.reply(`🎮 **เกมทายใจ:**\n${res.response.text()}` + cmdHelp);
            } catch (e) { message.reply("⚠️ AI เหนื่อยแล้ว รอก่อนนะครับ"); }
            return;
        }

        if (command === '!test') {
            message.reply("✅ ระบบ Pro Max พร้อมใช้งาน!" + cmdHelp);
            return;
        }

    } else {
        // --- ระบบ AI คุยอัตโนมัติ (ใส่ระบบกัน Error) ---
        try {
            await message.channel.sendTyping();
            const result = await model.generateContent(message.content);
            const aiEmbed = new EmbedBuilder().setColor(0x5865F2).setAuthor({ name: 'Gemini AI' }).setDescription(result.response.text().slice(0, 4000));
            await message.reply({ embeds: [aiEmbed] });
        } catch (e) {
            console.error("Quota full");
            // ไม่ตอบถ้าโควตาเต็ม เพื่อป้องกันบอทแครช
        }
    }
});

client.login(DISCORD_TOKEN);
