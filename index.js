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
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// เปลี่ยนเป็น gemini-1.5-flash เพื่อโควตาที่เยอะขึ้น
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const cmdHelp = "\n\n**💡 คำสั่ง:** `!ดีเจ` | `!ข่าว` | `!ราคา` | `!เตือน` | `!สุ่ม` | `!ลบ` | `!ทาย` | `!test`";

// ฟังก์ชันดึงข่าว (เพิ่มระบบกัน Error 429)
async function getITNewsWithSummary(limit = 1) {
    try {
        let url = 'https://news.google.com/rss/search?q=technology+when:24h&hl=th&gl=TH&ceid=TH:th';
        let feed = await parser.parseURL(url);
        let items = feed.items.slice(0, limit);
        for (let item of items) {
            try {
                const result = await model.generateContent(`สรุปข่าวนี้ 3 บรรทัด: ${item.title}`);
                item.summary = result.response.text();
            } catch (e) {
                item.summary = "*(AI กำลังพักผ่อน กดดูข่าวจากลิงก์ได้เลยครับ)*";
            }
        }
        return items;
    } catch (err) { return []; }
}

async function getCryptoPrice(coin) {
    try {
        const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd,thb&include_24hr_change=true`);
        return res.data;
    } catch (e) { return null; }
}

client.on('clientReady', () => {
    console.log(`✅ ${client.user.tag} ออนไลน์พร้อมลุยต่อ!`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'fetch_news_now') {
        try {
            await interaction.deferReply();
            const news = await getITNewsWithSummary(1);
            const embed = new EmbedBuilder().setColor(0x57F287).setTitle(news[0].title).setDescription(news[0].summary + cmdHelp);
            await interaction.editReply({ embeds: [embed] });
        } catch (e) { console.error(e); }
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
                const djResult = await model.generateContent(`แนะนำเพลง YouTube 1 เพลงที่เข้ากับอารมณ์ "${mood}" บอกชื่อเพลงและเหตุผลสั้นๆ แปะลิงก์บรรทัดสุดท้าย`);
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

        if (command === '!ข่าว') {
            const num = Math.min(parseInt(args[1]) || 1, 3);
            const newsList = await getITNewsWithSummary(num);
            newsList.forEach(n => {
                const embed = new EmbedBuilder().setColor(0x00BFFF).setTitle(n.title).setURL(n.link).setDescription(n.summary + cmdHelp);
                message.reply({ embeds: [embed] });
            });
            return;
        }

        if (command === '!เตือน') {
            const time = parseInt(args[1]);
            const note = args.slice(2).join(' ');
            if (!isNaN(time) && note) {
                message.reply(`🕒 ตั้งเตือน "${note}" แล้ว (อีก ${time} นาที)` + cmdHelp);
                setTimeout(() => message.reply(`🔔 **ได้เวลา:** ${note} <@${message.author.id}>`), time * 60000);
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
            } catch (e) { message.reply("⚠️ AI เหนื่อยแล้ว รอก่อนนะครับ" + cmdHelp); }
            return;
        }

        if (command === '!test') {
            message.reply("✅ บอท Pro Max พร้อม!" + cmdHelp);
            return;
        }

    } else {
        try {
            await message.channel.sendTyping();
            const result = await model.generateContent(message.content);
            const aiEmbed = new EmbedBuilder().setColor(0x5865F2).setAuthor({ name: 'Gemini AI' }).setDescription(result.response.text().slice(0, 4000));
            await message.reply({ embeds: [aiEmbed] });
        } catch (e) { 
            console.error("Quota full or Error");
            // ถ้าโควตาเต็มจะไม่ตอบเพื่อให้บอทไม่แครช
        }
    }
});

client.login(DISCORD_TOKEN);
