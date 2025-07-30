// migrate.js
// A one-time script to move channel data from MySQL to MongoDB.

require('dotenv').config();
const mongoose = require('mongoose');
const mysql = require('mysql2/promise');

// --- Database Schemas ---
const channelSchema = new mongoose.Schema({
    name: String,
    category: String,
    type: String,
    url: String,
    drm_clearkey_keyId: String,
    drm_clearkey_key: String
});
// Mongoose will create a 'channels' collection based on this model name
const Channel = mongoose.model('Channel', channelSchema);

// --- Main Migration Function ---
async function migrateData() {
    let mysqlConnection;
    try {
        // --- 1. Connect to MySQL ---
        console.log('Connecting to MySQL...');
        mysqlConnection = await mysql.createConnection({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE
        });
        console.log('MySQL connected.');

        // --- 2. Fetch all channels from MySQL ---
        console.log('Fetching channels from MySQL...');
        const [rows] = await mysqlConnection.execute('SELECT name, category, type, url, drm_clearkey_keyId, drm_clearkey_key FROM channels');
        console.log(`Found ${rows.length} channels to migrate.`);

        if (rows.length === 0) {
            console.log('No channels found in MySQL. Nothing to migrate.');
            return;
        }

        // --- 3. Connect to MongoDB ---
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('MongoDB connected.');

        // --- 4. Clear existing data in MongoDB collection (optional, but good for clean runs) ---
        console.log('Clearing existing channels in MongoDB...');
        await Channel.deleteMany({});
        console.log('Existing collection cleared.');

        // --- 5. Insert all channels into MongoDB ---
        console.log('Inserting channels into MongoDB...');
        await Channel.insertMany(rows);
        console.log('-----------------------------------------');
        console.log(`✅ Success! Migrated ${rows.length} channels to MongoDB.`);
        console.log('-----------------------------------------');

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        // --- 6. Close connections ---
        if (mysqlConnection) {
            await mysqlConnection.end();
            console.log('MySQL connection closed.');
        }
        await mongoose.disconnect();
        console.log('MongoDB connection closed.');
    }
}

// Run the migration
migrateData();
