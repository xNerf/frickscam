const fs = require("fs");
const path = require("path");
const https = require("https");

const FILE_PATH = path.join(__dirname, "../resources/text.json");

const URLS = [
    "https://raw.githubusercontent.com/Discord-AntiScam/scam-links/refs/heads/main/list.txt",
    "https://raw.githubusercontent.com/Dogino/Discord-Phishing-URLs/refs/heads/main/scam-urls.txt",
    "https://raw.githubusercontent.com/nikolaischunk/discord-phishing-links/refs/heads/main/txt/suspicious-list.txt",
    "https://raw.githubusercontent.com/nikolaischunk/discord-phishing-links/refs/heads/main/txt/suspicious-list.txt",
    "https://raw.githubusercontent.com/DevSpen/scam-links/refs/heads/master/src/links.txt",
    "https://raw.githubusercontent.com/BuildBot42/discord-scam-links/refs/heads/main/list.txt"
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

    const allLinks = results.flat();

    return [...new Set(allLinks)];
}

function shouldUpdate(existingData) {
    if (!existingData || !existingData.date) return true;

    const lastUpdate = new Date(existingData.date);
    const now = new Date();

    const diff = now - lastUpdate;
    const week = 7 * 24 * 60 * 60 * 1000;

    return diff > week;
}

async function main() {
    let existingData = null;

    if (fs.existsSync(FILE_PATH)) {
        try {
            existingData = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
        } catch (e) {
            existingData = null;
        }
    }

    if (!shouldUpdate(existingData)) {
        console.log("No update needed (less than a week).");
        return;
    }

    console.log("Fetching new links...");

    const links = await fetchAllLinks();

    const output = {
        date: new Date().toISOString(),
        links: links
    };

    fs.writeFileSync(FILE_PATH, JSON.stringify(output, null, 2), "utf8");

    console.log(`Saved ${links.length} unique links.`);
}

main().catch(err => {
    console.error("Unhandled error in main():", err);
});