app.get('/stats', (req, res) => {
    db.query('SELECT COUNT(*) AS memberCount FROM memberships', [], (err, result) => {
        if (err) return res.status(500).send({ success: false });
        const memberCount = result[0]?.memberCount ?? result[0]?.count ?? 0;
        res.send({ success: true, memberCount: Number(memberCount) });
    });
});