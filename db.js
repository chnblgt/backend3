const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "admin123",
    database: process.env.DB_NAME || "duguilan_platform"
});

db.connect((err) => {
    if (err) {
        console.log("❌ Database холбогдсонгүй:", err.message);
    } else {
        console.log("✅ Database холбогдлоо ✓");
    }
});

module.exports = db;