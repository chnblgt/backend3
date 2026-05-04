app.post('/registerClub', upload.fields([{ name: 'logo' }, { name: 'bannerPhotos' }]), (req, res) => {
    const { name, category, description, email, phone, website, address, district, pricingType, foundedYear, owner_id } = req.body;

    if (!name || !category || !description || !email) {
        return res.status(400).send({ message: "Заавал бөглөх талбарууд дутуу байна", success: false });
    }
    if (!owner_id) {
        return res.status(400).send({ message: "Хэрэглэгч нэвтрээгүй байна", success: false });
    }

    const query = `INSERT INTO clubs (name, category, description, email, phone, website, address, district, pricing_type, founded_year, owner_id, approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`;

    db.query(query, [name, category, description, email, phone || null, website || null, address || null, district || null, pricingType || 'free', foundedYear || null, owner_id], (err, result) => {
        if (err) {
            console.error('registerClub error:', err);
            return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
        }
        res.send({ message: "Клуб амжилттай бүртгэгдлээ!", success: true, clubId: result.insertId });
    });
});