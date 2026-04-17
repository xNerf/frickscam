// src/bot/index.js
const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const http = require("http");

const TEXT_PATH = path.join(__dirname, "../../resources/text.json");
const IMAGE_PATH = path.join(__dirname, "../../resources/images.json");

let links = new Set();
let hashes = new Set();

function loadData() {
    try {
        const textData = JSON.parse(fs.readFileSync(TEXT_PATH, "utf8"));
        links = new Set(textData.links.map(l => l.toLowerCase()));
        console.log(`Loaded ${links.size} links.`);
    } catch (e) {
        console.error("Failed to load text.json:", e.message);
    }

    try {
        const imageData = JSON.parse(fs.readFileSync(IMAGE_PATH, "utf8"));
        hashes = new Set(imageData.hashes.map(h => h.toLowerCase()));
        console.log(`Loaded ${hashes.size} hashes.`);
    } catch (e) {
        console.error("Failed to load images.json:", e.message);
    }
}

function containsLink(content) {
    const lower = content.toLowerCase();
    for (const link of links) {
        if (lower.includes(link)) return true;
    }
    return false;
}

function hashBuffer(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex").toLowerCase();
}

function fetchBuffer(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith("https") ? https : http;
        protocol.get(url, (res) => {
            const chunks = [];
            res.on("data", chunk => chunks.push(chunk));
            res.on("end", () => resolve(Buffer.concat(chunks)));
            res.on("error", reject);
        }).on("error", reject);
    });
}

async function checkAttachments(attachments) {
    for (const attachment of attachments.values()) {
        try {
            const buffer = await fetchBuffer(attachment.url);
            const hash = hashBuffer(buffer);
            if (hashes.has(hash)) {
                console.log(`Malicious file detected: ${attachment.name} (${hash})`);
                return true;
            }
        } catch (e) {
            console.error(`Failed to hash attachment ${attachment.name}:`, e.message);
        }
    }
    return false;
}

async function punish(message) {
    try {
        await message.delete();
        await message.member.disableCommunicationUntil(
            Date.now() + 60 * 1000,
            "Malicious content detected"
        );
        console.log(`Deleted message and timed out ${message.author.tag} (${message.author.id})`);
    } catch (e) {
        console.error(`Failed to punish ${message.author.tag}:`, e.message);
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
    loadData();
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const hasLink = containsLink(message.content);
    if (hasLink) {
        console.log(`Malicious link detected in message from ${message.author.tag}`);
        await punish(message);
        return;
    }

    if (message.attachments.size > 0) {
        const hasMaliciousFile = await checkAttachments(message.attachments);
        if (hasMaliciousFile) {
            await punish(message);
            return;
        }
    }
});

client.login(process.env.TOKEN);