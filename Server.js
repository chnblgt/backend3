const express = require('express');
const bcrypt = require('bcrypt');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ok = allowed.test(path.extname(file.originalname).toLowerCase())
                && allowed.test(file.mimetype);
        ok ? cb(null, true) : cb(new Error('Only image files are allowed'));
    },
});

app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
}));
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
    res.send('Server ажиллаж байна!');
});

app.post('/createUser', async (req, res) => {
    const { email, password, passwordMatch, username } = req.body;

    if (!email || !password || !passwordMatch || !username) {
        return res.status(400).send({ message: "Бүх талбарыг бөглөнө үү", success: false });
    }
    if (password !== passwordMatch) {
        return res.status(400).send({ message: "Нууц үг таарахгүй байна", success: false });
    }
    if (password.length < 6) {
        return res.status(400).send({ message: "Нууц үг хамгийн багадаа 6 тэмдэгт байх ёстой", success: false });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = "INSERT INTO users (email, username, password, provider) VALUES (?, ?, ?, 'local')";

        db.query(query, [email, username, hashedPassword], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    if (err.message.includes('email')) {
                        return res.status(400).send({ message: "Энэ имэйл аль хэдийн бүртгэлтэй байна", success: false });
                    }
                    return res.status(400).send({ message: "Энэ хэрэглэгчийн нэр аль хэдийн бүртгэлтэй байна", success: false });
                }
                console.error('createUser error:', err);
                return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
            }
            res.send({ message: "Хэрэглэгч амжилттай үүслээ", success: true, userId: result.insertId });
        });
    } catch (e) {
        console.error('bcrypt error:', e);
        res.status(500).send({ message: "Сервер дээр алдаа гарлаа", success: false });
    }
});

app.post('/signin', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send({ message: "Имэйл болон нууц үг оруулна уу", success: false });
    }

    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
        if (err) {
            console.error('signin db error:', err);
            return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
        }
        if (result.length === 0) {
            return res.status(404).send({ message: "Имэйл эсвэл нууц үг буруу байна", success: false });
        }

        const user = result[0];
        if (!user.password) {
            return res.status(400).send({ message: "Энэ бүртгэл Google эсвэл Facebook-ээр нэвтэрдэг", success: false });
        }

        const passwordOk = await bcrypt.compare(password, user.password);
        if (!passwordOk) {
            return res.status(401).send({ message: "Имэйл эсвэл нууц үг буруу байна", success: false });
        }

        delete user.password;
        res.send({ message: "Амжилттай нэвтэрлээ", success: true, user });
    });
});

app.post('/auth/google', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).send({ message: "Token олдсонгүй", success: false });

    try {
        const googleRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` },
        });
        const { email, name, picture } = googleRes.data;
        if (!email) return res.status(400).send({ message: "Google-ээс имэйл авч чадсангүй", success: false });

        db.query("SELECT * FROM users WHERE email = ?", [email], (err, result) => {
            if (err) return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
            if (result.length > 0) {
                const user = result[0];
                delete user.password;
                return res.send({ message: "Амжилттай нэвтэрлээ", success: true, user });
            }

            const username = email.split('@')[0] + '_' + Math.floor(Math.random() * 1000);
            db.query(
                "INSERT INTO users (email, username, name, avatar, provider) VALUES (?, ?, ?, ?, 'google')",
                [email, username, name, picture],
                (err2, result2) => {
                    if (err2) {
                        console.error('Google insert error:', err2);
                        return res.status(500).send({ message: "Хэрэглэгч үүсгэхэд алдаа гарлаа", success: false });
                    }
                    res.send({ message: "Амжилттай бүртгэгдлээ", success: true,
                        user: { id: result2.insertId, email, username, name, avatar: picture, provider: 'google' } });
                }
            );
        });
    } catch (e) {
        console.error('Google auth error:', e.message);
        res.status(401).send({ message: "Google баталгаажуулалт амжилтгүй боллоо", success: false });
    }
});

app.post('/auth/facebook', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).send({ message: "Token олдсонгүй", success: false });

    try {
        const fbRes = await axios.get('https://graph.facebook.com/me', {
            params: { fields: 'id,name,email,picture', access_token: token },
        });
        const { email, name, picture } = fbRes.data;
        if (!email) return res.status(400).send({ message: "Facebook-ээс имэйл авч чадсангүй. Имэйл хандах зөвшөөрөл өгнө үү.", success: false });

        db.query("SELECT * FROM users WHERE email = ?", [email], (err, result) => {
            if (err) return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
            if (result.length > 0) {
                const user = result[0];
                delete user.password;
                return res.send({ message: "Амжилттай нэвтэрлээ", success: true, user });
            }

            const username = email.split('@')[0] + '_' + Math.floor(Math.random() * 1000);
            const avatar = picture?.data?.url || null;
            db.query(
                "INSERT INTO users (email, username, name, avatar, provider) VALUES (?, ?, ?, ?, 'facebook')",
                [email, username, name, avatar],
                (err2, result2) => {
                    if (err2) {
                        console.error('Facebook insert error:', err2);
                        return res.status(500).send({ message: "Хэрэглэгч үүсгэхэд алдаа гарлаа", success: false });
                    }
                    res.send({ message: "Амжилттай бүртгэгдлээ", success: true,
                        user: { id: result2.insertId, email, username, name, avatar, provider: 'facebook' } });
                }
            );
        });
    } catch (e) {
        console.error('Facebook auth error:', e.message);
        res.status(401).send({ message: "Facebook баталгаажуулалт амжилтгүй боллоо", success: false });
    }
});

app.get('/getUser', (req, res) => {
    const { email } = req.query;
    db.query(
        "SELECT id, email, username, name, bio, location, phone, avatar, created_at FROM users WHERE email = ?",
        [email],
        (err, result) => {
            if (err || result.length === 0) return res.status(404).send({ message: "Олдсонгүй", success: false });
            res.send({ success: true, user: result[0] });
        }
    );
});

app.put('/updateUser/:id', (req, res) => {
    const { id } = req.params;
    const { name, bio, location, phone } = req.body;
    db.query("UPDATE users SET name = ?, bio = ?, location = ?, phone = ? WHERE id = ?",
        [name, bio, location, phone, id],
        (err) => {
            if (err) return res.status(500).send({ message: "Алдаа гарлаа", success: false });
            res.send({ message: "Профайл шинэчлэгдлээ", success: true });
        }
    );
});

app.get('/clubs', (req, res) => {
    const { category } = req.query;
    let query = "SELECT * FROM clubs";
    let params = [];
    if (category) { query += " WHERE category = ?"; params.push(category); }
    db.query(query, params, (err, result) => {
        if (err) return res.status(500).send({ success: false });
        res.send({ success: true, clubs: result });
    });
});

app.get('/clubs/:id', (req, res) => {
    db.query("SELECT * FROM clubs WHERE id = ?", [req.params.id], (err, result) => {
        if (err || result.length === 0) return res.status(404).send({ message: "Клуб олдсонгүй", success: false });
        res.send({ success: true, club: result[0] });
    });
});

app.post(
    '/registerClub',
    upload.fields([
        { name: 'logo', maxCount: 1 },
        { name: 'bannerPhotos', maxCount: 5 },
    ]),
    (req, res) => {
        const { name, category, description, email, phone, website, address, district, pricingType, foundedYear } = req.body;

        if (!name || !category || !description || !email) {
            return res.status(400).send({ message: "Заавал бөглөх талбарууд дутуу байна", success: false });
        }

        const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
        const logoPath = req.files?.logo?.[0]
            ? `${baseUrl}/uploads/${req.files.logo[0].filename}`
            : null;
        const bannerPaths = req.files?.bannerPhotos?.length
            ? JSON.stringify(req.files.bannerPhotos.map(f => `${baseUrl}/uploads/${f.filename}`))
            : null;

        const query = `
            INSERT INTO clubs
                (name, category, description, email, phone, website, address, district,
                 pricing_type, founded_year, approved, logo, banner)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `;

        db.query(query, [
            name, category, description, email,
            phone || null, website || null,
            address || null, district || null,
            pricingType || 'free',
            foundedYear || null,
            logoPath,
            bannerPaths,
        ], (err, result) => {
            if (err) {
                console.error('registerClub error:', err);
                return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
            }
            res.send({ message: "Клуб амжилттай бүртгэгдлээ!", success: true, clubId: result.insertId });
        });
    }
);

app.post(
    '/adminCreateClub',
    upload.fields([
        { name: 'logo', maxCount: 1 },
        { name: 'bannerPhotos', maxCount: 5 },
    ]),
    (req, res) => {
        const { name, category, description, email, phone, website, address, district, pricingType, foundedYear } = req.body;

        if (!name || !category || !description || !email) {
            return res.status(400).send({ message: "Заавал бөглөх талбарууд дутуу байна", success: false });
        }

        const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
        const logoPath = req.files?.logo?.[0]
            ? `${baseUrl}/uploads/${req.files.logo[0].filename}`
            : null;
        const bannerPaths = req.files?.bannerPhotos?.length
            ? JSON.stringify(req.files.bannerPhotos.map(f => `${baseUrl}/uploads/${f.filename}`))
            : null;

        const query = `
            INSERT INTO clubs
                (name, category, description, email, phone, website, address, district,
                 pricing_type, founded_year, approved, logo, banner)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `;

        db.query(query, [
            name, category, description, email,
            phone || null, website || null,
            address || null, district || null,
            pricingType || 'free',
            foundedYear || null,
            logoPath,
            bannerPaths,
        ], (err, result) => {
            if (err) {
                console.error('adminCreateClub error:', err);
                return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
            }
            res.send({ message: "Клуб амжилттай үүслээ!", success: true, clubId: result.insertId });
        });
    }
);

app.post('/joinClub', (req, res) => {
    const { userId, clubId } = req.body;
    if (!userId || !clubId) return res.status(400).send({ message: "userId болон clubId шаардлагатай", success: false });

    db.query("INSERT INTO memberships (user_id, club_id) VALUES (?, ?)", [userId, clubId], (err) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).send({ message: "Та аль хэдийн энэ клубт нэгдсэн байна", success: false });
            return res.status(500).send({ message: "Алдаа гарлаа", success: false });
        }
        res.send({ message: "Клубт амжилттай нэгдлээ", success: true });
    });
});

app.delete('/leaveClub/:userId/:clubId', (req, res) => {
    const { userId, clubId } = req.params;
    db.query("DELETE FROM memberships WHERE user_id = ? AND club_id = ?", [userId, clubId], (err) => {
        if (err) return res.status(500).send({ success: false });
        res.send({ message: "Клубаас гарлаа", success: true });
    });
});

app.get('/myClubs/:userId', (req, res) => {
    const query = `SELECT clubs.* FROM clubs JOIN memberships ON clubs.id = memberships.club_id WHERE memberships.user_id = ?`;
    db.query(query, [req.params.userId], (err, result) => {
        if (err) return res.status(500).send({ success: false });
        res.send({ success: true, clubs: result });
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});