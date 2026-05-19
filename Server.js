const express = require('express');
const bcrypt = require('bcrypt');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const path = require('path');
const fs = require('fs');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-secret,x-user-id,ngrok-skip-browser-warning,Authorization');
    res.setHeader('ngrok-skip-browser-warning', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const editclub = require('./editclub');
app.use('/', editclub);

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);
async function uploadToSupabase(file) {
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`;
    
    const { data, error } = await supabase.storage
      .from('club-images')         
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });
  
    if (error) throw error;
  
    const { data: { publicUrl } } = supabase.storage
      .from('club-images')
      .getPublicUrl(fileName);
  
    return publicUrl;
  }

  async function sendMail({ from, to, subject, html }) {
    try {
        await resend.emails.send({ from, to, subject, html });
        console.log(`✉️  Sent → ${to}`);
    } catch (e) {
        console.error('❌ Email error:', e.message);
    }
}

function makeToken() { return crypto.randomBytes(32).toString('hex'); }

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) =>
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname)),
});
const fileFilter = (req, file, cb) => {
    const imageFields = ["logo", "bannerPhotos", "avatar"];
    if (imageFields.includes(file.fieldname)) {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new Error("Only image files are allowed"), false);
        }
    }
    cb(null, true);
};
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter,
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('/', (req, res) => res.send('Server ажиллаж байна!'));

function verifyEmailHtml(displayName, verifyLink, note = '') {
    return `<!DOCTYPE html>
<html lang="com">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Имэйл баталгаажуулах</title>
</head>
<body style="margin:0;padding:0;background:#f0ebff;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ebff;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr>
          <td align="center" style="padding-bottom:20px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:linear-gradient(135deg,#1a0533,#3b0764);border-radius:14px;padding:12px 22px;">
                  <span style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;font-family:'Helvetica Neue',Arial,sans-serif;">
                    Duguilan<span style="color:#c4b5fd;">.com</span>
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(124,58,237,0.14);">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="height:4px;background:linear-gradient(90deg,#4c1d95,#7c3aed,#c4b5fd,#7c3aed,#4c1d95);"></td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:48px 48px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding-bottom:28px;">
                        <div style="display:inline-block;width:76px;height:76px;background:linear-gradient(135deg,#f5f0ff,#ede9fe);border-radius:22px;border:2px solid rgba(124,58,237,0.18);text-align:center;line-height:76px;font-size:34px;">✉️</div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-bottom:10px;">
                        <h1 style="margin:0;font-size:24px;font-weight:800;color:#1a0533;letter-spacing:-0.03em;line-height:1.2;font-family:'Helvetica Neue',Arial,sans-serif;">
                          Сайн байна уу, ${displayName}!
                        </h1>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-bottom:${note ? '14px' : '32px'};">
                        <p style="margin:0;font-size:15px;color:#666666;line-height:1.7;max-width:360px;font-family:'Helvetica Neue',Arial,sans-serif;">
                          Имэйл хаягаа баталгаажуулахын тулд доорх товчийг дарна уу.
                        </p>
                      </td>
                    </tr>
                    ${note ? `
                    <tr>
                      <td align="center" style="padding-bottom:32px;">
                        <table cellpadding="0" cellspacing="0"><tr>
                          <td style="background:#f5f0ff;border:1px solid rgba(124,58,237,0.18);border-radius:10px;padding:10px 20px;">
                            <p style="margin:0;font-size:13px;color:#7c3aed;font-weight:600;font-family:'Helvetica Neue',Arial,sans-serif;">ℹ️ &nbsp;${note}</p>
                          </td>
                        </tr></table>
                      </td>
                    </tr>` : ''}
                    <tr>
                      <td align="center" style="padding-bottom:32px;">
                        <a href="${verifyLink}" style="display:inline-block;padding:16px 48px;background:linear-gradient(135deg,#7c3aed,#4c1d95);color:#ffffff;text-decoration:none;border-radius:14px;font-size:15px;font-weight:700;letter-spacing:0.01em;box-shadow:0 8px 28px rgba(124,58,237,0.4);font-family:'Helvetica Neue',Arial,sans-serif;">
                          Имэйл баталгаажуулах &nbsp;→
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td style="border-top:1px solid #f0ebff;padding-top:24px;">
                        <p style="margin:0 0 6px;font-size:12px;color:#aaaaaa;text-align:center;font-family:'Helvetica Neue',Arial,sans-serif;">
                          Товч ажиллахгүй байвал доорх линкийг хуулж ашиглана уу:
                        </p>
                        <p style="margin:0 0 18px;text-align:center;">
                          <a href="${verifyLink}" style="font-size:11px;color:#9879d4;word-break:break-all;text-decoration:none;font-family:'Helvetica Neue',Arial,sans-serif;">${verifyLink}</a>
                        </p>
                        <table width="100%" cellpadding="0" cellspacing="0"><tr>
                          <td style="background:#fffbeb;border:1px solid rgba(245,158,11,0.22);border-radius:10px;padding:12px 16px;">
                            <p style="margin:0;font-size:12.5px;color:#92400e;text-align:center;font-family:'Helvetica Neue',Arial,sans-serif;">
                              ⏱ &nbsp;Энэ линк <strong>24 цагийн</strong> дотор хүчинтэй.
                            </p>
                          </td>
                        </tr></table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:24px;">
            <p style="margin:0 0 5px;font-size:12px;color:#9879d4;font-weight:600;font-family:'Helvetica Neue',Arial,sans-serif;">Duguilan.com — Nest IT School</p>
            <p style="margin:0;font-size:11px;color:#c4b5fd;font-family:'Helvetica Neue',Arial,sans-serif;">Энэ имэйлийг та өөрөө хүсэлт гаргаагүй бол үл тоомсорлоно уу.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function welcomeEmailHtml(username, loginLink) {
    return `<!DOCTYPE html>
<html lang="com">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f0ebff;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ebff;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr>
          <td align="center" style="padding-bottom:20px;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="background:linear-gradient(135deg,#1a0533,#3b0764);border-radius:14px;padding:12px 22px;">
                <span style="font-size:19px;font-weight:800;color:#fff;letter-spacing:-0.03em;">Duguilan<span style="color:#c4b5fd;">.com</span></span>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(124,58,237,0.14);">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="height:4px;background:linear-gradient(90deg,#4c1d95,#7c3aed,#c4b5fd,#7c3aed,#4c1d95);"></td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:48px 48px 40px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td align="center" style="padding-bottom:24px;">
                    <div style="display:inline-block;width:76px;height:76px;background:linear-gradient(135deg,#dcfce7,#bbf7d0);border-radius:22px;border:2px solid rgba(34,197,94,0.18);text-align:center;line-height:76px;font-size:34px;">🎉</div>
                  </td></tr>
                  <tr><td align="center" style="padding-bottom:10px;">
                    <h1 style="margin:0;font-size:24px;font-weight:800;color:#1a0533;letter-spacing:-0.03em;font-family:'Helvetica Neue',Arial,sans-serif;">
                      Тавтай морил, ${username}!
                    </h1>
                  </td></tr>
                  <tr><td align="center" style="padding-bottom:32px;">
                    <p style="margin:0;font-size:15px;color:#666;line-height:1.7;max-width:360px;font-family:'Helvetica Neue',Arial,sans-serif;">
                      Имэйл хаягаа амжилттай баталгаажууллаа. Одоо нэвтэрч клубуудаа судлаарай.
                    </p>
                  </td></tr>
                  <tr><td align="center" style="padding-bottom:32px;">
                    <a href="${loginLink}" style="display:inline-block;padding:16px 48px;background:linear-gradient(135deg,#7c3aed,#4c1d95);color:#fff;text-decoration:none;border-radius:14px;font-size:15px;font-weight:700;box-shadow:0 8px 28px rgba(124,58,237,0.4);font-family:'Helvetica Neue',Arial,sans-serif;">
                      Нэвтрэх →
                    </a>
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr><td align="center" style="padding-top:24px;">
          <p style="margin:0 0 5px;font-size:12px;color:#9879d4;font-weight:600;font-family:'Helvetica Neue',Arial,sans-serif;">Duguilan.com — Nest IT School</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

app.post('/createUser', async (req, res) => {
    const { email, password, passwordMatch, username } = req.body;
    if (!email || !password || !passwordMatch || !username)
        return res.status(400).send({ message: "Бүх талбарыг бөглөнө үү", success: false });
    if (password !== passwordMatch)
        return res.status(400).send({ message: "Нууц үг таарахгүй байна", success: false });
    if (password.length < 8)
        return res.status(400).send({ message: "Нууц үг хамгийн багадаа 8 тэмдэгт байх ёстой", success: false });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const token = makeToken();
        db.query(
            "INSERT INTO users (email, username, password, provider, email_verified, verification_token) VALUES ($1, $2, $3, 'local', 0, $4)",
            [email, username, hashedPassword, token],
            async (err, result) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        const msg = err.message.includes('email')
                            ? "Энэ имэйл аль хэдийн бүртгэлтэй байна"
                            : "Энэ хэрэглэгчийн нэр аль хэдийн бүртгэлтэй байна";
                        return res.status(400).send({ message: msg, success: false });
                    }
                    console.error('createUser error:', err);
                    return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
                }
                const verifyLink = `${FRONTEND}/verify-email?token=${token}&type=user`;
                console.log('✅ User created. Verify link:', verifyLink);
                await sendMail({
                    from: `"Duguilan.com" <${process.env.GMAIL_USER}>`,
                    to: email,
                    subject: 'Duguilan.com — Имэйл хаягаа баталгаажуулна уу ✉️',
                    html: verifyEmailHtml(username, verifyLink),
                });
                res.send({ message: "Бүртгэл амжилттай! Имэйл хаяг руу баталгаажуулах линк илгээлээ.", success: true, requiresVerification: true });
            }
        );
    } catch (e) {
        console.error('createUser error:', e);
        res.status(500).send({ message: "Сервер дээр алдаа гарлаа", success: false });
    }
});

app.post('/signin', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).send({ message: "Имэйл болон нууц үг оруулна уу", success: false });

    db.query("SELECT * FROM users WHERE email = $1", [email], async (err, result) => {
        if (err) return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
        if (result.length === 0)
            return res.status(404).send({ message: "Имэйл эсвэл нууц үг буруу байна", success: false });

        const user = result[0];
        if (!user.password)
            return res.status(400).send({ message: "Энэ бүртгэл Google эсвэл Facebook-ээр нэвтэрдэг", success: false });
        if (!user.email_verified)
            return res.status(403).send({ message: "Имэйл хаягаа баталгаажуулна уу.", success: false, requiresVerification: true });

        const ok = await bcrypt.compare(password, user.password);
        if (!ok)
            return res.status(401).send({ message: "Имэйл эсвэл нууц үг буруу байна", success: false });

        delete user.password;
        delete user.verification_token;
        res.send({ message: "Амжилттай нэвтэрлээ", success: true, user });
    });
});

app.get('/verify-email', async (req, res) => {
    const { token, type } = req.query;
    console.log('\n🔍 /verify-email HIT — token:', token, '| type:', type);

    if (!token || !type)
        return res.status(400).send({ message: "Буруу линк", success: false });

    const supabase = db.supabase;

    try {
        if (type === 'user') {
            const { data: found, error: findErr } = await supabase
                .from('users')
                .select('id, username, email, email_verified, verification_token')
                .eq('verification_token', token);

            if (findErr) return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
            if (!found || found.length === 0)
                return res.status(404).send({ message: "Линк хүчингүй эсвэл аль хэдийн ашигласан байна", success: false });

            const user = found[0];
            if (user.email_verified)
                return res.status(404).send({ message: "Линк хүчингүй эсвэл аль хэдийн ашигласан байна", success: false });

            const { error: updateErr } = await supabase
                .from('users')
                .update({ email_verified: 1, verification_token: null })
                .eq('id', user.id);

            if (updateErr) return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });

            await sendMail({
                from: `"Duguilan.com" <${process.env.GMAIL_USER}>`,
                to: user.email,
                subject: 'Duguilan.com — Тавтай морил! 🎉',
                html: welcomeEmailHtml(user.username, `${FRONTEND}/signin`),
            });

            console.log('✅ User verified:', user.email);
            return res.send({ message: "Имэйл амжилттай баталгаажлаа! Одоо нэвтэрч болно.", success: true, type: 'user' });

        } else if (type === 'club') {
            const { data: found, error: findErr } = await supabase
                .from('clubs')
                .select('id, name, email, email_verified, verification_token')
                .eq('verification_token', token);

            if (findErr) return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
            if (!found || found.length === 0)
                return res.status(404).send({ message: "Линк хүчингүй эсвэл аль хэдийн ашигласан байна", success: false });

            const club = found[0];
            if (club.email_verified)
                return res.status(404).send({ message: "Линк хүчингүй эсвэл аль хэдийн ашигласан байна", success: false });

            const { error: updateErr } = await supabase
                .from('clubs')
                .update({ email_verified: 1, verification_token: null })
                .eq('id', club.id);

            if (updateErr) return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });

            await sendMail({
                from: `"Duguilan.com" <${process.env.GMAIL_USER}>`,
                to: club.email,
                subject: `Duguilan.com — "${club.name}" хянагдаж байна`,
                html: verifyEmailHtml(club.name, '', 'Манай admin хянаж, удахгүй баталгаажуулна.').replace(
                    'Имэйл хаягаа баталгаажуулахын тулд доорх товчийг дарна уу.',
                    `<strong>${club.name}</strong> клубын имэйл баталгаажлаа. Манай admin хянаж удахгүй зөвшөөрнө.`
                ),
            });

            sendMail({
                from: `"Duguilan.com" <${process.env.GMAIL_USER}>`,
                to: process.env.ADMIN_EMAIL || process.env.GMAIL_USER,
                subject: `[Duguilan] ✅ Клуб зөвшөөрөл хүлээж байна: ${club.name}`,
                html: `<div style="font-family:sans-serif;padding:24px;border:1px solid #ede9fe;border-radius:12px;max-width:480px;"><h3 style="color:#1a0533;">Клуб имэйл баталгаажлаа</h3><p><b>Клуб:</b> ${club.name}<br><b>Имэйл:</b> ${club.email}<br><b>ID:</b> ${club.id}</p><p style="color:#7c3aed;font-size:13px;">Admin хэсгээр нэвтэрч клубыг зөвшөөрнө үү.</p></div>`,
            });

            console.log('✅ Club verified:', club.name);
            return res.send({ message: "Имэйл баталгаажлаа! Клуб admin-ны зөвшөөрлийг хүлээж байна.", success: true, type: 'club' });

        } else {
            return res.status(400).send({ message: "Буруу төрөл", success: false });
        }
    } catch (e) {
        console.error('❌ verify-email crash:', e);
        return res.status(500).send({ message: "Сервер дээр алдаа гарлаа", success: false });
    }
});

app.get('/verify-and-login', async (req, res) => {
    const { token, type } = req.query;
    if (!token || type !== 'user')
        return res.status(400).send({ message: "Буруу линк", success: false });

    const supabase = db.supabase;
    try {
        const { data: found, error: findErr } = await supabase
            .from('users')
            .select('id, username, name, email, avatar, is_admin, email_verified, verification_token, created_at')
            .eq('verification_token', token);

        if (findErr || !found || found.length === 0)
            return res.status(404).send({ message: "Линк хүчингүй эсвэл аль хэдийн ашигласан байна", success: false });

        const user = found[0];
        if (!user.email_verified) {
            const { error: updateErr } = await supabase
                .from('users')
                .update({ email_verified: 1, verification_token: null })
                .eq('id', user.id);

            if (updateErr)
                return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });

            await sendMail({
                from: `"Duguilan.com" <${process.env.GMAIL_USER}>`,
                to: user.email,
                subject: 'Duguilan.com — Тавтай морил! 🎉',
                html: welcomeEmailHtml(user.username, `${FRONTEND}/page`),
            });
        }

        return res.send({
            success: true,
            message: "Имэйл амжилттай баталгаажлаа!",
            user: {
                id: user.id, email: user.email, username: user.username,
                name: user.name, avatar: user.avatar,
                is_admin: user.is_admin, created_at: user.created_at,
            },
            type: 'user',
        });
    } catch (e) {
        console.error('verify-and-login error:', e);
        return res.status(500).send({ message: "Сервер дээр алдаа гарлаа", success: false });
    }
});

app.post('/resend-verification', async (req, res) => {
    const { email, type } = req.body;
    if (!email || !type)
        return res.status(400).send({ message: "Имэйл болон төрөл шаардлагатай", success: false });

    const supabase = db.supabase;
    const table = type === 'user' ? 'users' : 'clubs';
    const nameCol = type === 'user' ? 'username' : 'name';

    try {
        const { data: records, error: findErr } = await supabase
            .from(table)
            .select(`id, ${nameCol}, email, email_verified`)
            .eq('email', email);

        if (findErr) return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
        if (!records || records.length === 0)
            return res.status(404).send({ message: "Имэйл олдсонгүй", success: false });

        const record = records[0];
        if (record.email_verified)
            return res.status(400).send({ message: "Энэ имэйл аль хэдийн баталгаажсан байна", success: false });

        const token = makeToken();
        const { error: updateErr } = await supabase
            .from(table)
            .update({ verification_token: token })
            .eq('id', record.id);

        if (updateErr) return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });

        const verifyLink = `${FRONTEND}/verify-email?token=${token}&type=${type}`;
        await sendMail({
            from: `"Duguilan.com" <${process.env.GMAIL_USER}>`,
            to: email,
            subject: 'Duguilan.com — Имэйл баталгаажуулах линк (дахин)',
            html: verifyEmailHtml(record[nameCol], verifyLink),
        });

        res.send({ message: "Баталгаажуулах линкийг дахин илгээлээ.", success: true });
    } catch (e) {
        console.error('resend-verification error:', e);
        res.status(500).send({ message: "Сервер дээр алдаа гарлаа", success: false });
    }
});

app.post('/auth/google', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).send({ message: "Token олдсонгүй", success: false });
    try {
        const ticket = await googleClient.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
        const { email, name, picture } = ticket.getPayload();
        if (!email) return res.status(400).send({ message: "Google-ээс имэйл авч чадсангүй", success: false });

        db.query("SELECT * FROM users WHERE email = $1", [email], (err, result) => {
            if (err) return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
            if (result.length > 0) {
                const user = result[0]; delete user.password; delete user.verification_token;
                return res.send({ message: "Амжилттай нэвтэрлээ", success: true, user });
            }
            const username = email.split('@')[0] + '_' + Math.floor(Math.random() * 1000);
            db.query(
                "INSERT INTO users (email, username, name, avatar, provider, email_verified) VALUES ($1, $2, $3, $4, 'google', 1)",
                [email, username, name || null, picture || null],
                (err2, result2) => {
                    if (err2) return res.status(500).send({ message: "Хэрэглэгч үүсгэхэд алдаа гарлаа", success: false });
                    res.send({ message: "Амжилттай бүртгэгдлээ", success: true, user: { id: result2.insertId, email, username, name: name || null, avatar: picture || null, provider: 'google' } });
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
            params: { fields: 'id,name,email,picture.type(large)', access_token: token },
        });
        const { email, name, picture } = fbRes.data;
        if (!email) return res.status(400).send({ message: "Facebook-ээс имэйл авч чадсангүй.", success: false });
        const avatar = picture?.data?.url || null;

        db.query("SELECT * FROM users WHERE email = $1", [email], (err, result) => {
            if (err) return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
            if (result.length > 0) {
                const user = result[0]; delete user.password; delete user.verification_token;
                return res.send({ message: "Амжилттай нэвтэрлээ", success: true, user });
            }
            const username = email.split('@')[0] + '_' + Math.floor(Math.random() * 1000);
            db.query(
                "INSERT INTO users (email, username, name, avatar, provider, email_verified) VALUES ($1, $2, $3, $4, 'facebook', 1)",
                [email, username, name || null, avatar],
                (err2, result2) => {
                    if (err2) return res.status(500).send({ message: "Хэрэглэгч үүсгэхэд алдаа гарлаа", success: false });
                    res.send({ message: "Амжилттай бүртгэгдлээ", success: true, user: { id: result2.insertId, email, username, name: name || null, avatar, provider: 'facebook' } });
                }
            );
        });
    } catch (e) {
        console.error('Facebook auth error:', e.message);
        res.status(401).send({ message: "Facebook баталгаажуулалт амжилтгүй боллоо", success: false });
    }
});

app.post('/registerClub', upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'bannerPhotos', maxCount: 5 }]), async (req, res) => {
    const { name, category, description, email, phone, website, address, district, pricingType, foundedYear, tiers, owner_id, lat, lng } = req.body;
    if (!name || !category || !description || !email)
        return res.status(400).send({ message: "Заавал бөглөх талбарууд дутуу байна", success: false });
    if (!owner_id)
        return res.status(400).send({ message: "Хэрэглэгч нэвтрээгүй байна", success: false });

    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const logoPath = req.files?.logo?.[0] ? `${baseUrl}/uploads/${req.files.logo[0].filename}` : null;
    const bannerPaths = req.files?.bannerPhotos?.length
        ? JSON.stringify(req.files.bannerPhotos.map(f => `${baseUrl}/uploads/${f.filename}`))
        : null;
    const tiersJson = pricingType === 'paid' && tiers ? tiers : null;
    const token = makeToken();

    db.query(
        `INSERT INTO clubs (name, category, description, email, phone, website, address, district, pricing_type, founded_year, owner_id, approved, logo, banner, tiers, email_verified, verification_token, lat, lng)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12, $13, $14, 0, $15, $16, $17)`,
        [name, category, description, email, phone || null, website || null, address || null, district || null,
         pricingType || 'free', foundedYear || null, owner_id, logoPath, bannerPaths, tiersJson, token,
         lat ? parseFloat(lat) : null, lng ? parseFloat(lng) : null],
         async (err, result) => {
            if (err) {
                console.error('registerClub error:', err);
                return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
            }
            const verifyLink = `${FRONTEND}/verify-email?token=${token}&type=club`;
            sendMail({
                from: `"Duguilan.com" <${process.env.GMAIL_USER}>`,
                to: email,
                subject: `Duguilan.com — "${name}" клубын имэйл хаягаа баталгаажуулна уу ✉️`,
                html: verifyEmailHtml(name, verifyLink, 'Баталгаажуулсны дараа admin хянах шатанд орно.'),
            }).catch(e => console.error('registerClub email error (non-fatal):', e.message));
            
            console.log('✅ Club registered:', name, '| owner_id:', owner_id);
            res.send({ message: "Клуб бүртгэгдлээ! Имэйл хаяг руу баталгаажуулах линк илгээлээ.", success: true, clubId: result.insertId, requiresVerification: true });
        }
    );
});

app.post('/adminCreateClub', upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'bannerPhotos', maxCount: 5 }]), (req, res) => {
    if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET)
        return res.status(403).send({ message: "Зөвшөөрөлгүй хандалт", success: false });

    const { name, category, description, email, phone, website, address, district, pricingType, foundedYear, lat, lng } = req.body;
    if (!name || !category || !description || !email)
        return res.status(400).send({ message: "Заавал бөглөх талбарууд дутуу байна", success: false });

    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const logoPath = req.files?.logo?.[0] ? `${baseUrl}/uploads/${req.files.logo[0].filename}` : null;
    const bannerPaths = req.files?.bannerPhotos?.length
        ? JSON.stringify(req.files.bannerPhotos.map(f => `${baseUrl}/uploads/${f.filename}`))
        : null;

    db.query(
        `INSERT INTO clubs (name, category, description, email, phone, website, address, district, pricing_type, founded_year, approved, logo, banner, email_verified, lat, lng)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11, $12, 1, $13, $14)`,
        [name, category, description, email, phone || null, website || null, address || null, district || null,
         pricingType || 'free', foundedYear || null, logoPath, bannerPaths,
         lat ? parseFloat(lat) : null, lng ? parseFloat(lng) : null],
        (err, result) => {
            if (err) {
                console.error('adminCreateClub error:', err);
                return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
            }
            res.send({ message: "Клуб амжилттай үүслээ!", success: true, clubId: result.insertId });
        }
    );
});

app.get('/getUser', (req, res) => {
    db.query(
        "SELECT id, email, username, name, bio, location, phone, avatar, is_admin, created_at FROM users WHERE email = $1",
        [req.query.email],
        (err, result) => {
            if (err || result.length === 0) return res.status(404).send({ message: "Олдсонгүй", success: false });
            res.send({ success: true, user: result[0] });
        }
    );
});

app.put('/updateUser/:id', (req, res) => {
    const { name, bio, location, phone, avatar } = req.body;
    db.supabase
        .from('users')
        .update({
            name:     name     ?? null,
            bio:      bio      ?? null,
            location: location ?? null,
            phone:    phone    ?? null,
            avatar:   avatar   ?? null,
        })
        .eq('id', req.params.id)
        .select()
        .then(({ error }) => {
            if (error) {
                console.error('updateUser error:', error);
                return res.status(500).send({ message: "Алдаа гарлаа: " + error.message, success: false });
            }
            res.send({ message: "Профайл шинэчлэгдлээ", success: true });
        });
});

app.post('/uploadAvatar/:id', upload.single('avatar'), (req, res) => {
    if (!req.file) return res.status(400).send({ message: "Зураг олдсонгүй", success: false });
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const avatarUrl = `${baseUrl}/uploads/${req.file.filename}`;
    db.supabase
        .from('users')
        .update({ avatar: avatarUrl })
        .eq('id', req.params.id)
        .select()
        .then(({ error }) => {
            if (error) {
                console.error('uploadAvatar error:', error);
                return res.status(500).send({ message: "Алдаа гарлаа", success: false });
            }
            res.send({ message: "Профайл зураг шинэчлэгдлээ", success: true, avatarUrl });
        });
});

app.get('/check-verified', (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).send({ verified: false });
    db.query(
        "SELECT id, email, username, name, avatar, is_admin, created_at FROM users WHERE email = $1 AND email_verified = 1",
        [email],
        (err, result) => {
            if (err || result.length === 0) return res.send({ verified: false });
            res.send({ verified: true, user: result[0] });
        }
    );
});

app.get('/clubs', (req, res) => {
    const { category } = req.query;
    let q = "SELECT * FROM clubs WHERE approved = 1";
    const p = [];
    if (category) { q += " AND category = $1"; p.push(category); }
    db.query(q, p, (err, result) => {
        if (err) return res.status(500).send({ success: false });
        res.send({ success: true, clubs: result });
    });
});

app.get('/clubs/:id', async (req, res) => {
    try {
        const clubId = parseInt(req.params.id, 10);
        const { data, error } = await db.supabase
            .from('clubs')
            .select('*')
            .eq('id', clubId)
            .maybeSingle();
        if (error) { console.error('GET /clubs/:id error:', error); return res.status(500).send({ success: false, message: 'Server error' }); }
        if (!data)  return res.status(404).send({ success: false, message: 'Club not found' });
        console.log('[GET /clubs/' + clubId + '] owner_id=' + data.owner_id + ' qpay=' + JSON.stringify(data.qpay_info) + ' dans=' + JSON.stringify(data.dans_info));
        res.send({ success: true, club: data });
    } catch (e) {
        console.error('GET /clubs/:id exception:', e);
        res.status(500).send({ success: false, message: 'Server error' });
    }
});

app.post('/joinClub', async (req, res) => {
    const { userId, clubId, tierId, tierPrice, paymentNote } = req.body;
    if (!userId || !clubId) return res.status(400).send({ message: "userId болон clubId шаардлагатай", success: false });

    const isPaid = !!(tierId && tierPrice);
    const paymentStatus = isPaid ? 'pending' : 'free';

    try {
        const { data: existing } = await db.supabase
            .from('memberships')
            .select('id, payment_status')
            .eq('user_id', userId)
            .eq('club_id', clubId)
            .maybeSingle();

        if (existing) {
            if (existing.payment_status === 'pending' && isPaid) {
                await db.supabase.from('payments')
                    .update({ payment_note: paymentNote || null })
                    .eq('club_id', clubId)
                    .eq('user_id', userId)
                    .eq('status', 'pending');
                return res.send({ message: "Төлбөрийн мэдэгдэл шинэчлэгдлээ.", success: true });
            }
            return res.status(400).send({ message: "Та аль хэдийн энэ клубт нэгдсэн байна", success: false });
        }

        const { error: memErr } = await db.supabase
            .from('memberships')
            .insert({
                user_id:        userId,
                club_id:        clubId,
                tier_name:      tierId   || null,
                payment_status: paymentStatus,
            });

        if (memErr) {
            if (memErr.code === '23505') return res.status(400).send({ message: "Та аль хэдийн энэ клубт нэгдсэн байна", success: false });
            console.error('joinClub membership error:', memErr);
            return res.status(500).send({ success: false, message: "Алдаа гарлаа" });
        }

        if (isPaid) {
            const { error: payErr } = await db.supabase
                .from('payments')
                .insert({
                    club_id:      clubId,
                    user_id:      userId,
                    tier_name:    tierId,
                    amount:       parseFloat(tierPrice) || 0,
                    status:       'pending',
                    payment_note: paymentNote || null,
                });
            if (payErr) console.error('joinClub payment record error:', payErr);
            try {
                const { data: clubData } = await db.supabase
                    .from('clubs')
                    .select('name, email')
                    .eq('id', clubId)
                    .maybeSingle();
                const { data: userData } = await db.supabase
                    .from('users')
                    .select('username, email')
                    .eq('id', userId)
                    .maybeSingle();

                if (clubData && userData) {
                    await sendMail({
                        from: `"Duguilan.com" <${process.env.GMAIL_USER}>`,
                        to: clubData.email,
                        subject: `[Duguilan] Шинэ гишүүний хүсэлт — ${clubData.name}`,
                        html: `<div style="font-family:sans-serif;padding:24px;border:1px solid #e5e7eb;border-radius:12px;max-width:480px;">
                            <h3 style="color:#1a0533;margin:0 0 12px;">Шинэ төлбөрийн мэдэгдэл</h3>
                            <p style="color:#374151;"><b>${userData.username}</b> (${userData.email}) таны <b>${clubData.name}</b> клубт нэгдэхийг хүсч, төлбөр төлсөн гэж мэдэгдлээ.</p>
                            <p><b>Тиер:</b> ${tierId} — ₮${Number(tierPrice).toLocaleString()}</p>
                            ${paymentNote ? `<p style="background:#f5f0ff;padding:12px;border-radius:8px;color:#4c1d95;"><b>Тэмдэглэл:</b> ${paymentNote}</p>` : ''}
                            <p style="color:#6b7280;font-size:13px;">Dashboard-аасаа баталгаажуулна уу.</p>
                        </div>`,
                    });
                }
            } catch (mailErr) {
                console.error('joinClub notify mail error:', mailErr.message);
            }
        }

        res.send({ message: isPaid ? "Хүсэлт илгээгдлээ. Клубын эзэн баталгаажуулна." : "Клубт амжилттай нэгдлээ", success: true });
    } catch (e) {
        console.error('joinClub error:', e);
        res.status(500).send({ success: false, message: "Алдаа гарлаа" });
    }
});

app.post('/club/:clubId/addMember', async (req, res) => {
    const requestingUserId = req.headers['x-user-id'];
    const { clubId } = req.params;
    const { email, tier_name, payment_status } = req.body;

    if (!email) return res.status(400).send({ success: false, message: "Email шаардлагатай" });

    try {
        const { data: clubs } = await db.supabase.from('clubs').select('owner_id').eq('id', clubId);
        if (!clubs || clubs.length === 0) return res.status(404).send({ success: false });
        if (String(clubs[0].owner_id) !== String(requestingUserId))
            return res.status(403).send({ success: false, message: "Эрх байхгүй" });

        const { data: userFound } = await db.supabase.from('users').select('id').eq('email', email).maybeSingle();
        if (!userFound) return res.status(404).send({ success: false, message: "Тухайн имэйлтэй хэрэглэгч олдсонгүй" });
        const { data: existing } = await db.supabase.from('memberships')
            .select('id').eq('user_id', userFound.id).eq('club_id', clubId).maybeSingle();

        if (existing) {
            await db.supabase.from('memberships')
                .update({ payment_status: payment_status || 'confirmed', tier_name: tier_name || null })
                .eq('user_id', userFound.id).eq('club_id', clubId);
        } else {
            const { error: memErr } = await db.supabase.from('memberships').insert({
                user_id:        userFound.id,
                club_id:        clubId,
                tier_name:      tier_name      || null,
                payment_status: payment_status || 'confirmed',
            });
            if (memErr) return res.status(500).send({ success: false, message: "Алдаа гарлаа" });
        }

        res.send({ success: true, message: "Гишүүн амжилттай нэмэгдлээ" });
    } catch (e) {
        console.error('addMember error:', e);
        res.status(500).send({ success: false, message: "Серверт алдаа гарлаа" });
    }
});

app.get('/membershipStatus/:userId/:clubId', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    const clubId = parseInt(req.params.clubId, 10);
    try {
        const { data, error } = await db.supabase
            .from('memberships')
            .select('payment_status, tier_name')
            .eq('user_id', userId)
            .eq('club_id', clubId)
            .maybeSingle();
        if (error) return res.status(500).send({ success: false });
        if (!data)  return res.send({ success: true, payment_status: null });
        res.send({ success: true, payment_status: data.payment_status, tier_name: data.tier_name });
    } catch (e) {
        res.status(500).send({ success: false });
    }
});

app.delete('/leaveClub/:userId/:clubId', (req, res) => {
    db.query(
        "DELETE FROM memberships WHERE user_id = $1 AND club_id = $2",
        [req.params.userId, req.params.clubId],
        (err) => {
            if (err) return res.status(500).send({ success: false });
            res.send({ message: "Клубаас гарлаа", success: true });
        }
    );
});

app.get('/myClubs/:userId', (req, res) => {
    db.query(
        "SELECT clubs.* FROM clubs JOIN memberships ON clubs.id = memberships.club_id WHERE memberships.user_id = $1",
        [req.params.userId],
        (err, result) => {
            if (err) return res.status(500).send({ success: false });
            res.send({ success: true, clubs: result });
        }
    );
});

app.get('/stats', (req, res) => {
    db.query('SELECT COUNT(*) AS memberCount FROM memberships', [], (err, result) => {
        if (err) { console.error('stats error:', err); return res.status(500).send({ success: false }); }
        const memberCount = result[0]?.memberCount ?? result[0]?.membercount ?? 0;
        res.send({ success: true, memberCount: Number(memberCount) });
    });
});

app.get('/admin/pending-clubs', (req, res) => {
    if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET)
        return res.status(403).send({ message: "Зөвшөөрөлгүй хандалт", success: false });

    db.query(
        "SELECT * FROM clubs WHERE approved = 0 ORDER BY created_at DESC",
        [],
        (err, result) => {
            if (err) return res.status(500).send({ success: false });
            res.send({ success: true, clubs: result });
        }
    );
});

app.post('/admin/approve-club/:id', (req, res) => {
    if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET)
        return res.status(403).send({ message: "Зөвшөөрөлгүй хандалт", success: false });

    db.query(
        "UPDATE clubs SET approved = 1 WHERE id = $1",
        [req.params.id],
        (err) => {
            if (err) return res.status(500).send({ success: false });
            res.send({ success: true, message: "Клуб зөвшөөрөгдлөө" });
        }
    );
});

app.delete('/admin/reject-club/:id', (req, res) => {
    if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET)
        return res.status(403).send({ message: "Зөвшөөрөлгүй хандалт", success: false });

    db.query(
        "DELETE FROM clubs WHERE id = $1",
        [req.params.id],
        (err) => {
            if (err) return res.status(500).send({ success: false });
            res.send({ success: true, message: "Клуб устгагдлаа" });
        }
    );
});
app.use((err, req, res, next) => {
    if (err) {
        console.error('Global error handler:', err.message);
        const status = err instanceof multer.MulterError ? 400
                     : err.message === 'Only image files are allowed' ? 400
                     : 500;
        return res.status(status).send({ message: err.message || 'Серверт алдаа гарлаа', success: false });
    }
    next();
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));