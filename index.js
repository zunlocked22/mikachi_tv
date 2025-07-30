// index.js
// FINAL SECURE VERSION: Corrects the User-Agent check to use a space.

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const mongoUri = process.env.MONGO_URI;
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

const channelSchema = new mongoose.Schema({
    name: String, category: String, type: String, url: String,
    drm_clearkey_keyId: String, drm_clearkey_key: String
});
const Channel = mongoose.model('Channel', channelSchema);

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true, trim: true },
    password: { type: String, required: true },
    email: { type: String, unique: true, required: true, trim: true },
    playlist_token: { type: String, unique: true, required: true },
    created_at: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// --- Secure Playlist Route (WITH CORRECTED CHECK) ---
app.get('/playlist', async (req, res) => {
    console.log('--- Playlist Request Started ---');
    const token = req.query.token;
    if (!token) {
        console.log('Request failed: Token is missing.');
        return res.status(403).send("Error: Access token is missing.");
    }
    console.log(`Token received: ${token}`);

    const userAgent = req.get('User-Agent') || 'Not Provided';
    console.log(`User-Agent received: ${userAgent}`);
    
    // FIXED: The check now correctly looks for "ott navigator" with a space.
    if (!userAgent.toLowerCase().includes('ott navigator')) {
        console.log(`Request failed: User-Agent is not OTT Navigator.`);
        return res.status(403).send("Error: This playlist can only be accessed by OTT Navigator.");
    }

    try {
        console.log('Attempting to find user in MongoDB...');
        const user = await User.findOne({ playlist_token: token });

        if (!user) {
            console.log('Request failed: User with this token was not found in the database.');
            return res.status(403).send("Error: Invalid access token.");
        }
        console.log(`User found: ${user.username} (ID: ${user._id})`);

        console.log('User validated successfully. Fetching channels...');
        const channels = await Channel.find({}).sort({ category: 1, name: 1 });

        if (channels.length === 0) {
            console.log('Request failed: No channels found in the database.');
            return res.status(404).send("Error: No channels found in the database.");
        }
        console.log(`Found ${channels.length} channels. Generating playlist content...`);

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

        console.log('Playlist generated successfully. Sending response.');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="mikachi_tv_playlist.m3u"');
        res.send(playlistContent);

    } catch (error) {
        console.error("!!! CRITICAL ERROR during playlist generation:", error);
        res.status(500).send("An internal server error occurred. Please check the server logs.");
    }
    console.log('--- Playlist Request Finished ---');
});


// --- AUTH ROUTES ---
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ success: false, message: 'All fields are required.' });
    try {
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) return res.status(409).json({ success: false, message: 'Username or email already exists.' });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const playlistToken = crypto.randomBytes(32).toString('hex');
        const newUser = new User({ username, email, password: hashedPassword, playlist_token: playlistToken });
        await newUser.save();
        res.status(201).json({ success: true, message: 'Registration successful! You can now log in.' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Please enter username and password.' });
    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: 'No account found with that username.' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'The password you entered was not valid.' });
        res.status(200).json({
            success: true, message: 'Login successful!',
            userData: { id: user._id, username: user.username, playlist_token: user.playlist_token }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
