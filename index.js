// index.js
// DIAGNOSTIC VERSION: This temporarily disables the MySQL security check to confirm it's the source of the problem.

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
// We don't need mysql2 for this test
// const mysql = require('mysql2/promise'); 

const app = express();
const PORT = process.env.PORT || 3000;

// --- MongoDB Connection ---
const mongoUri = process.env.MONGO_URI;
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Database Schema ---
const channelSchema = new mongoose.Schema({
    name: String, category: String, type: String, url: String,
    drm_clearkey_keyId: String, drm_clearkey_key: String
});
const Channel = mongoose.model('Channel', channelSchema);


// --- The Secure Playlist Route ---
app.get('/playlist', async (req, res) => {
    const token = req.query.token;
    if (!token) {
        return res.status(403).send("Error: Access token is missing.");
    }
    
    // NOTE: The User-Agent and MySQL token validation checks are temporarily disabled for this test.
    // This allows us to confirm that the core playlist generation is working.

    try {
        // --- Playlist Generation ---
        const channels = await Channel.find({}).sort({ category: 1, name: 1 });

        if (channels.length === 0) {
            return res.status(404).send("Error: No channels found in the database.");
        }

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
