// index.js
// FINAL VERSION with Admin Dashboard features.

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

// --- Database Schemas ---
const channelSchema = new mongoose.Schema({
    name: String, category: String, type: String, url: String,
    drm_clearkey_keyId: String, drm_clearkey_key: String
});
const Channel = mongoose.model('Channel', channelSchema);

// MODIFIED: Added isAdmin field to the user schema
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true, trim: true },
    password: { type: String, required: true },
    email: { type: String, unique: true, required: true, trim: true },
    playlist_token: { type: String, unique: true, required: true },
    isAdmin: { type: Boolean, default: false }, // New field for admin role
    created_at: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);


// --- User Registration Route ---
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }
    const allowedDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'outlook.ph'];
    const emailDomain = email.split('@')[1];
    if (!allowedDomains.includes(emailDomain)) {
        return res.status(400).json({ success: false, message: 'Please use a valid email provider (e.g., Gmail, Yahoo, Outlook).' });
    }

    try {
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'Username or email already exists.' });
        }
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


// --- User Login Route (MODIFIED) ---
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Please enter username and password.' });
    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: 'No account found with that username.' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'The password you entered was not valid.' });
        
        // MODIFIED: Send back the isAdmin status on successful login
        res.status(200).json({
            success: true,
            message: 'Login successful!',
            userData: {
                id: user._id,
                username: user.username,
                playlist_token: user.playlist_token,
                isAdmin: user.isAdmin // Include the admin status
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});


// --- NEW: Admin Route to Get All Users ---
app.get('/admin/users', async (req, res) => {
    // This is a protected route. It requires a valid user token in the header.
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Expects "Bearer <token>"

    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized: No token provided.' });
    }

    try {
        // Find the user making the request
        const requestingUser = await User.findOne({ playlist_token: token });
        if (!requestingUser) {
            return res.status(403).json({ success: false, message: 'Forbidden: Invalid token.' });
        }

        // Check if the user is an admin
        if (!requestingUser.isAdmin) {
            return res.status(403).json({ success: false, message: 'Forbidden: You do not have admin privileges.' });
        }

        // If the user is an admin, fetch all users from the database
        // The '-password' part tells MongoDB to exclude the password field for security.
        const allUsers = await User.find({}, '-password').sort({ created_at: -1 });
        res.status(200).json({ success: true, users: allUsers });

    } catch (error) {
        console.error('Admin fetch users error:', error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});


// --- Secure Playlist Route (Unchanged) ---
app.get('/playlist', async (req, res) => {
    // ... (This code remains the same as the last working version)
    const token = req.query.token;
    if (!token) return res.status(403).send("Error: Access token is missing.");
    const userAgent = req.get('User-Agent') || 'Not Provided';
    if (!userAgent.toLowerCase().includes('ott navigator')) return res.status(403).send("Error: This playlist can only be accessed by OTT Navigator.");
    try {
        const user = await User.findOne({ playlist_token: token });
        if (!user) return res.status(403).send("Error: Invalid access token.");
        const channels = await Channel.find({}).sort({ category: 1, name: 1 });
        if (channels.length === 0) return res.status(404).send("Error: No channels found in the database.");
        const logoUrl = "https://the-bithub.com/MikachiUrl-Logo-010101";
        let playlistContent = "#EXTM3U\n\n";
        for (const channel of channels) {
            const name = channel.name;
            const category = channel.category || "Uncategorized";
            const url = channel.url;
            playlistContent += `#EXTINF:-1 tvg-name="${name}" tvg-logo="${logoUrl}" group-title="${category}",${name}\n`;
            const referer = "https://www.visionplus.id/";
            const genericUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";
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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
