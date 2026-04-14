app.post('/adminCreateClub', (req, res) => {
    const { name, category, description, email, phone, website, address, district, pricingType, foundedYear } = req.body;

    if (!name || !category || !description || !email) {
        return res.status(400).send({ message: "Заавал бөглөх талбарууд дутуу байна", success: false });
    }

    const query = `INSERT INTO clubs (name, category, description, email, phone, website, address, district, pricing_type, founded_year, approved)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`;

    db.query(query, [
        name, category, description, email,
        phone || null, website || null,
        address || null, district || null,
        pricingType || 'free',
        foundedYear || null
    ], (err, result) => {
        if (err) {
            console.error('adminCreateClub error:', err);
            return res.status(500).send({ message: "Датанд алдаа гарлаа", success: false });
        }
        res.send({ message: "Клуб амжилттай үүслээ!", success: true, clubId: result.insertId });
    });
});