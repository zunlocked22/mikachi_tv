// index.js
// DIAGNOSTIC VERSION: This temporarily disables the User-Agent check
// and logs the incoming User-Agent so we can identify it.

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

// --- AUTH ROUTES (Unchanged) ---
app.post('/register', async (req, res) => { /* ... registration logic ... */ });
app.post('/login', async (req, res) => { /* ... login logic ... */ });


// --- Secure Playlist Route (MODIFIED FOR DIAGNOSTICS) ---
app.get('/playlist', async (req, res) => {
    const token = req.query.token;
    if (!token) {
        return res.status(403).send("Error: Access token is missing.");
    }
    
    // --- DIAGNOSTIC STEP ---
    const userAgent = req.get('User-Agent') || 'Not Provided';
    // 1. We log the User-Agent to the Render logs.
    console.log(`Playlist request received with User-Agent: ${userAgent}`);

    // 2. We temporarily DISABLE the security check to allow the playlist to load.
    /*
    if (!userAgent.toLowerCase().includes('ott-navigator')) {
        return res.status(403).send("Error: This playlist can only be accessed by OTT Navigator.");
    }
    */

    try {
        const user = await User.findOne({ playlist_token: token });
        if (!user) {
            return res.status(403).send("Error: Invalid access token.");
        }
        
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

// Fill in the auth routes to make the file complete
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
