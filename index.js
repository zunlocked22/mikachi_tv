// index.js
// This is your main server file.

// Load environment variables from a .env file for local testing
// On Railway, you will set these variables in the dashboard
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const mysql = require('mysql2/promise');

const app = express();
// Railway provides the PORT environment variable automatically
const PORT = process.env.PORT || 3000;

// --- Database Connections ---

// 1. MongoDB Connection (for channels)
const mongoUri = process.env.MONGO_URI;
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// 2. MySQL Connection (for validating user tokens)
const mysqlPool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- Database Schemas ---
const channelSchema = new mongoose.Schema({
    name: String,
    category: String,
    type: String,
    url: String,
    drm_clearkey_keyId: String,
    drm_clearkey_key: String
});
const Channel = mongoose.model('Channel', channelSchema);


// --- The Secure Playlist Route ---
// NOTE: I've named the route `/playlist` instead of `/playlist.php` for simplicity
app.get('/playlist', async (req, res) => {
    const token = req.query.token;
    if (!token) {
        return res.status(403).send("Error: Access token is missing.");
    }

    const userAgent = req.get('User-Agent') || '';
    if (!userAgent.toLowerCase().includes('ott-navigator')) {
        return res.status(403).send("Error: This playlist can only be accessed by OTT Navigator.");
    }

    try {
        // --- Security Check: Validate Token against MySQL database ---
        const [rows] = await mysqlPool.execute('SELECT id FROM users WHERE playlist_token = ?', [token]);
        if (rows.length === 0) {
            return res.status(403).send("Error: Invalid access token.");
        }

        // --- Playlist Generation ---
        const channels = await Channel.find({}).sort({ category: 1, name: 1 });

        let playlistContent = "#EXTM3U\n\n";

        for (const channel of channels) {
            const name = channel.name;
            const url = channel.url;
            const referer = "https://www.visionplus.id/";
            const genericUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";

            playlistContent += `#EXTINF:-1 tvg-name="${name}",${name}\n`;
            playlistContent += `#EXTVLCOPT:http-user-agent=${genericUserAgent}\n`;
            playlistContent += `#EXTVLCOPT:http-referrer=${referer}\n`;

            if (channel.type === 'mpd' && channel.drm_clearkey_keyId && channel.drm_clearkey_key) {
                playlistContent += `#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey\n`;
                playlistContent += `#KODIPROP:inputstream.adaptive.license_key=${channel.drm_clearkey_keyId}:${channel.drm_clearkey_key}\n`;
            }

            playlistContent += `${url}\n\n`;
        }

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="mikachi_tv_playlist.m3u"');
        res.send(playlistContent);

    } catch (error) {
        console.error("Server error:", error);
        res.status(500).send("An internal server error occurred.");
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
