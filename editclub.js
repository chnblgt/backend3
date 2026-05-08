const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const db      = require('./db');
const supabase = db.supabase;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename:    (req, file, cb) =>
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname)),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|gif|webp/.test(path.extname(file.originalname).toLowerCase());
    ok ? cb(null, true) : cb(new Error('Only image files allowed'));
  },
});

router.put('/clubs/:id', upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'bannerPhotos', maxCount: 5 }]), async (req, res) => {
  const clubId           = parseInt(req.params.id, 10);
  const requestingUserId = parseInt(req.headers['x-user-id'], 10);
  const { name, category, description, email, phone, website, address, district, foundedYear, lat, lng, existingBanners } = req.body;
  const qpay_info = typeof req.body.qpay_info === 'string' ? req.body.qpay_info.trim() : null;
  const dans_info = typeof req.body.dans_info === 'string' ? req.body.dans_info.trim() : null;

  if (!name || !category || !description || !email || !address)
    return res.status(400).send({ message: 'Заавал бөглөх талбаруудыг бөглөнө үү.', success: false });

  try {
    const { data: clubs, error: findErr } = await supabase
      .from('clubs').select('*').eq('id', clubId);

    if (findErr || !clubs || clubs.length === 0)
      return res.status(404).send({ message: 'Клуб олдсонгүй', success: false });

    const club = clubs[0];
    if (club.owner_id !== requestingUserId)
      return res.status(403).send({ message: 'Энэ клубыг засах эрх байхгүй', success: false });

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8000}`;
    let logoUrl = club.logo;
    if (req.files?.logo?.[0])
      logoUrl = `${baseUrl}/uploads/${req.files.logo[0].filename}`;

    let keptBanners = [];
    try { keptBanners = existingBanners ? JSON.parse(existingBanners) : []; } catch { keptBanners = []; }
    const newBannerUrls = req.files?.bannerPhotos?.length
      ? req.files.bannerPhotos.map(f => `${baseUrl}/uploads/${f.filename}`)
      : [];
    const allBanners = [...keptBanners, ...newBannerUrls].slice(0, 5);

    const updatePayload = {
      name,
      category,
      description,
      email,
      phone:        phone       || null,
      website:      website     || null,
      address,
      district:     district    || null,
      founded_year: foundedYear || null,
      lat:          lat         ? parseFloat(lat) : null,
      lng:          lng         ? parseFloat(lng) : null,
      logo:         logoUrl,
      banner:       JSON.stringify(allBanners),
      qpay_info:    qpay_info   || null,
      dans_info:    dans_info   || null,
    };

    console.log(`[editclub] club=${clubId} qpay_info=${JSON.stringify(updatePayload.qpay_info)} dans_info=${JSON.stringify(updatePayload.dans_info)}`);

    const { data: updated, error: updateErr } = await supabase
      .from('clubs')
      .update(updatePayload)
      .eq('id', clubId)
      .select('id, qpay_info, dans_info');

    if (updateErr) {
      console.error('editclub update error:', updateErr);
      return res.status(500).send({ message: 'Датанд алдаа гарлаа', success: false });
    }

    console.log(`[editclub] saved:`, updated);
    res.send({ success: true, message: 'Клуб амжилттай шинэчлэгдлээ!' });
  } catch (e) {
    console.error('editclub error:', e);
    res.status(500).send({ message: 'Серверт алдаа гарлаа', success: false });
  }
});

router.get('/club/:clubId/members', async (req, res) => {
  const requestingUserId = req.headers['x-user-id'];
  try {
    const { data: clubs, error: findErr } = await supabase
      .from('clubs').select('owner_id').eq('id', req.params.clubId);

    if (findErr || !clubs || clubs.length === 0)
      return res.status(404).send({ message: 'Клуб олдсонгүй', success: false });
    if (String(clubs[0].owner_id) !== String(requestingUserId))
      return res.status(403).send({ message: 'Эрх байхгүй', success: false });

    const { data: memberships, error: mErr } = await supabase
      .from('memberships')
      .select('user_id, joined_at, payment_status, tier_name')
      .eq('club_id', req.params.clubId)
      .order('joined_at', { ascending: false });

    if (mErr) return res.status(500).send({ success: false });
    if (!memberships || memberships.length === 0)
      return res.send({ success: true, members: [] });

    const userIds = memberships.map(m => m.user_id);
    const { data: users, error: uErr } = await supabase
      .from('users')
      .select('id, username, email, avatar')
      .in('id', userIds);

    if (uErr) return res.status(500).send({ success: false });

    const members = memberships.map(m => {
      const u = (users || []).find(u => String(u.id) === String(m.user_id)) || {};
      return {
        id:             m.user_id,
        name:           u.username  || '',
        email:          u.email     || '',
        photo:          u.avatar    || null,
        joined_at:      m.joined_at,
        payment_status: m.payment_status,
        tier_name:      m.tier_name,
      };
    });

    res.send({ success: true, members });
  } catch (e) {
    console.error('members error:', e);
    res.status(500).send({ success: false });
  }
});

router.get('/club/:clubId/payments', async (req, res) => {
  const requestingUserId = req.headers['x-user-id'];
  try {
    const { data: clubs, error: findErr } = await supabase
      .from('clubs').select('owner_id').eq('id', req.params.clubId);

    if (findErr || !clubs || clubs.length === 0)
      return res.status(404).send({ message: 'Клуб олдсонгүй', success: false });
    if (String(clubs[0].owner_id) !== String(requestingUserId))
      return res.status(403).send({ message: 'Эрх байхгүй', success: false });

    const { data: payments, error: pErr } = await supabase
      .from('payments')
      .select('*')
      .eq('club_id', req.params.clubId)
      .order('created_at', { ascending: false });

    if (pErr) return res.status(500).send({ success: false });
    if (!payments || payments.length === 0)
      return res.send({ success: true, payments: [] });

    const userIds = [...new Set(payments.map(p => p.user_id))];
    const { data: users, error: uErr } = await supabase
      .from('users').select('id, username, email').in('id', userIds);

    if (uErr) return res.status(500).send({ success: false });

    const result = payments.map(p => {
      const u = (users || []).find(u => String(u.id) === String(p.user_id)) || {};
      return { ...p, user_name: u.username || '', user_email: u.email || '' };
    });

    res.send({ success: true, payments: result });
  } catch (e) {
    console.error('payments error:', e);
    res.status(500).send({ success: false });
  }
});

router.post('/club/:clubId/payments/:paymentId/confirm', async (req, res) => {
  const requestingUserId = req.headers['x-user-id'];
  try {
    const { data: clubs } = await supabase.from('clubs').select('owner_id').eq('id', req.params.clubId);
    if (!clubs || clubs.length === 0) return res.status(404).send({ success: false });
    if (String(clubs[0].owner_id) !== String(requestingUserId)) return res.status(403).send({ success: false });

    const { data: payment } = await supabase
      .from('payments').select('user_id').eq('id', req.params.paymentId).single();

    await supabase.from('payments').update({ status: 'confirmed' })
      .eq('id', req.params.paymentId).eq('club_id', req.params.clubId);

    if (payment?.user_id) {
      await supabase.from('memberships').update({ payment_status: 'confirmed' })
        .eq('club_id', req.params.clubId).eq('user_id', payment.user_id);
    }

    res.send({ success: true });
  } catch (e) {
    console.error('confirm error:', e);
    res.status(500).send({ success: false });
  }
});

router.post('/club/:clubId/payments/:paymentId/reject', async (req, res) => {
  const requestingUserId = req.headers['x-user-id'];
  try {
    const { data: clubs } = await supabase.from('clubs').select('owner_id').eq('id', req.params.clubId);
    if (!clubs || clubs.length === 0) return res.status(404).send({ success: false });
    if (String(clubs[0].owner_id) !== String(requestingUserId)) return res.status(403).send({ success: false });

    await supabase.from('payments').update({ status: 'rejected' })
      .eq('id', req.params.paymentId).eq('club_id', req.params.clubId);

    res.send({ success: true });
  } catch (e) {
    console.error('reject error:', e);
    res.status(500).send({ success: false });
  }
});

router.delete('/club/:clubId/members/:memberId', async (req, res) => {
  const requestingUserId = req.headers['x-user-id'];
  try {
    const { data: clubs } = await supabase.from('clubs').select('owner_id').eq('id', req.params.clubId);
    if (!clubs || clubs.length === 0) return res.status(404).send({ success: false });
    if (String(clubs[0].owner_id) !== String(requestingUserId)) return res.status(403).send({ success: false });

    await supabase.from('memberships')
      .delete()
      .eq('user_id', req.params.memberId)
      .eq('club_id', req.params.clubId);

    res.send({ success: true });
  } catch (e) {
    console.error('delete member error:', e);
    res.status(500).send({ success: false });
  }
});

module.exports = router;