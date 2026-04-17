const path = require("path");
const fs = require("fs");
const https = require("https");
const { spawn } = require("child_process");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../resources/.env") });

const FILE_PATH = path.join(__dirname, "../resources/text.json");
const IMAGE_FILE_PATH = path.join(__dirname, "../resources/images.json");

const URLS = [
    "https://raw.githubusercontent.com/Discord-AntiScam/scam-links/refs/heads/main/list.txt",
    "https://raw.githubusercontent.com/Dogino/Discord-Phishing-URLs/refs/heads/main/scam-urls.txt",
    "https://raw.githubusercontent.com/nikolaischunk/discord-phishing-links/refs/heads/main/txt/suspicious-list.txt",
    "https://raw.githubusercontent.com/nikolaischunk/discord-phishing-links/refs/heads/main/txt/suspicious-list.txt",
    "https://raw.githubusercontent.com/DevSpen/scam-links/refs/heads/master/src/links.txt",
    "https://raw.githubusercontent.com/BuildBot42/discord-scam-links/refs/heads/main/list.txt"
];

const IMAGE_URLS = [
    "https://raw.githubusercontent.com/romainmarcoux/malicious-hash/main/full-hash-sha256-aa.txt"
];

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchURL(url, attempt = 1, maxRetries = 3) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            let data = "";

            res.on("data", chunk => data += chunk);
            res.on("end", () => resolve(data));
        });

        req.on("error", async (err) => {
            if (attempt < maxRetries) {
                console.warn(`Retry ${attempt} for ${url}`);
                await delay(1000 * attempt);
                resolve(fetchURL(url, attempt + 1, maxRetries));
            } else {
                console.error(`Failed after ${maxRetries} attempts: ${url}`);
                reject(err);
            }
        });

        req.setTimeout(10000, () => {
            req.destroy(new Error("Request timeout"));
        });
    });
}

async function fetchAllLinks() {
    const results = await Promise.all(
        URLS.map(url =>
            fetchURL(url)
                .then(data => {
                    const lines = data.split("\n")
                        .map(l => l.trim())
                        .filter(l => l.length > 0);
                    return lines;
                })
                .catch(err => {
                    console.error(`Error fetching from ${url}:`, err.message);
                    return [];
                })
        )
    );

    return [...new Set(results.flat())];
}

async function fetchAllHashes() {
    const results = await Promise.all(
        IMAGE_URLS.map(url =>
            fetchURL(url)
                .then(data => {
                    const lines = data.split("\n")
                        .map(l => l.trim())
                        .filter(l => l.length > 0);
                    return lines;
                })
                .catch(err => {
                    console.error(`Error fetching from ${url}:`, err.message);
                    return [];
                })
        )
    );

    return [...new Set(results.flat())];
}

function shouldUpdate(existingData) {
    if (!existingData || !existingData.date) return true;

    const lastUpdate = new Date(existingData.date);
    const now = new Date();
    const week = 7 * 24 * 60 * 60 * 1000;

    return (now - lastUpdate) > week;
}

function startBot() {
    if (!process.env.TOKEN) {
        console.error("Brak tokenu w resources/.env (TOKEN=...)");
        process.exit(1);
    }

    const bot = spawn("node", [path.join(__dirname, "bot/index.js")], {
        env: { ...process.env },
        stdio: "inherit"
    });

    bot.on("error", (err) => {
        console.error("Błąd uruchamiania bota:", err.message);
        process.exit(1);
    });

    bot.on("exit", (code) => {
        console.log(`Bot zakończył działanie z kodem ${code}`);
        process.exit(code ?? 0);
    });
}

async function main() {
    let existingData = null;
    let existingImageData = null;

    if (fs.existsSync(FILE_PATH)) {
        try { existingData = JSON.parse(fs.readFileSync(FILE_PATH, "utf8")); } catch {}
    }

    if (fs.existsSync(IMAGE_FILE_PATH)) {
        try { existingImageData = JSON.parse(fs.readFileSync(IMAGE_FILE_PATH, "utf8")); } catch {}
    }

    const needLinksUpdate = shouldUpdate(existingData);
    const needImagesUpdate = shouldUpdate(existingImageData);

    if (!needLinksUpdate && !needImagesUpdate) {
        console.log("No update needed (less than a week).");
    } else {
        console.log("Fetching new data...");

        if (needLinksUpdate) {
            const links = await fetchAllLinks();
            fs.writeFileSync(FILE_PATH, JSON.stringify({ date: new Date().toISOString(), links }, null, 2), "utf8");
            console.log(`Saved ${links.length} unique links.`);
        }

        if (needImagesUpdate) {
            const hashes = await fetchAllHashes();
            fs.writeFileSync(IMAGE_FILE_PATH, JSON.stringify({ date: new Date().toISOString(), hashes }, null, 2), "utf8");
            console.log(`Saved ${hashes.length} unique hashes.`);
        }
    }

    startBot();
}

main().catch(err => {
    console.error("Unhandled error in main():", err);
});