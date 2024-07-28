const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const proxyAgent = require('proxy-agent');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for your frontend URL
app.use(cors({
    origin: 'https://spotback-9691e.web.app', // Replace with your frontend URL
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

async function isProxyWorking(proxy) {
    try {
        const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
        const response = await fetch('https://httpbin.org/ip', {
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            agent: new proxyAgent(proxy),
        });
        return response.ok;
    } catch (error) {
        console.error(`Proxy validation failed: ${error.message}`);
        return false;
    }
}

async function sendOtpToNumber(proxy, number, countryCode) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: false,
            slowMo: 250,
            args: proxy ? [`--proxy-server=${proxy}`] : []
        });
        const page = await browser.newPage();
        await page.goto('https://accounts.spotify.com/en-GB/login/phone?continue=https%3A%2F%2Fopen.spotify.com%2F&flow_ctx=db0214fd-9c92-4650-9df2-34841df65916:1721907199', { waitUntil: 'networkidle2' });
        await page.click('#phonelogin-country');
        await page.select('#phonelogin-country', countryCode);
        await page.type('#phonelogin-phonenumber', number);
        const buttonSelector = '#phonelogin-button > span.ButtonInner-sc-14ud5tc-0.liTfRZ.encore-bright-accent-set';
        await page.waitForSelector(buttonSelector, { visible: true });
        await page.evaluate(selector => document.querySelector(selector).click(), buttonSelector);
        await page.waitForSelector('#phonelogin-code', { timeout: 3000 });
        const newCodeLinkSelector = '#new-code-link > p';
        await page.waitForSelector(newCodeLinkSelector, { visible: true });
        await page.click(newCodeLinkSelector);
        await page.waitForSelector(buttonSelector, { visible: true });
        await page.evaluate(selector => document.querySelector(selector).click(), buttonSelector);
        await page.waitForSelector(newCodeLinkSelector, { visible: true });
        const successSelector = '#root > div > div > div > div > div.Wrapper-sc-62m9tu-0.iwmvYR.encore-negative-set.sc-bBABsx.eyCFNB > span';
        if (await page.$(successSelector) !== null) {
            return { number, success: true };
        }
        const otpSent = await page.$('#phonelogin-code') !== null;
        return { number, success: otpSent };
    } catch (error) {
        console.error(`Error: ${error.message}`);
        return { number, success: false, error: error.message };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

app.post('/api/send-otp', async (req, res) => {
    const { countryCode, proxies, numbers } = req.body;
    const results = [];
    const failedProxies = [];
    const validProxies = [];

    for (const proxy of proxies) {
        if (await isProxyWorking(proxy)) {
            validProxies.push(proxy);
        } else {
            failedProxies.push(proxy);
            console.warn(`Invalid proxy: ${proxy}`);
        }
    }

    const proxyList = validProxies.length ? validProxies : [null];

    for (let i = 0; i < numbers.length; i++) {
        const number = numbers[i];
        const currentProxy = proxyList[Math.floor(i / 20) % proxyList.length];
        const result = await sendOtpToNumber(currentProxy, number, countryCode);
        results.push(result);
    }

    res.json({
        data: results,
        failedProxies: failedProxies.length ? failedProxies : ['No failed proxies'],
        message: failedProxies.length ? 'Some proxies were invalid' : 'All proxies were valid'
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
