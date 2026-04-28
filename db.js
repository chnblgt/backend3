const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌  SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
);

function detectCommand(sql) {
    return (sql.trim().split(/\s+/)[0] || '').toUpperCase();
}

function extractTable(sql) {
    const lower = sql.toLowerCase();
    const m =
        lower.match(/insert\s+into\s+(\w+)/) ||
        lower.match(/update\s+(\w+)/)         ||
        lower.match(/delete\s+from\s+(\w+)/)  ||
        lower.match(/from\s+(\w+)/);
    return m ? m[1] : null;
}

function throwSupabaseError(error) {
    const err   = new Error(error.message || 'Supabase error');
    err.code    = error.code;
    err.details = error.details;
    if (error.code === '23505') err.code = 'ER_DUP_ENTRY';
    throw err;
}

// FIX: extract WHERE clause correctly (greedy, handles multi-condition AND clauses)
function extractWhereClause(sql) {
    const m = sql.match(/\bwhere\b\s+(.+?)(?:\s+order\s+by\b|\s+limit\b|$)/is);
    return m ? m[1].trim() : null;
}

function applyWhere(query, whereClause, params) {
    // Split on AND (case-insensitive), handle each condition
    const conditions = whereClause.split(/\s+and\s+/i);
    for (const cond of conditions) {
        const trimmed = cond.trim();
        // $N placeholder  →  col = $1
        const paramEq = trimmed.match(/^(\w+)\s*=\s*\$(\d+)$/i);
        // literal number  →  col = 1
        const litNum  = trimmed.match(/^(\w+)\s*=\s*(-?\d+)$/i);
        // literal string  →  col = 'value'
        const litStr  = trimmed.match(/^(\w+)\s*=\s*'([^']*)'$/i);

        if (paramEq) {
            const val = params[parseInt(paramEq[2]) - 1];
            query = query.eq(paramEq[1], val);
        } else if (litNum) {
            query = query.eq(litNum[1], parseInt(litNum[2]));
        } else if (litStr) {
            query = query.eq(litStr[1], litStr[2]);
        }
    }
    return query;
}

async function handleSelect(sql, params) {
    const lower = sql.toLowerCase();
    const table = extractTable(sql);
    if (!table) throw new Error('Could not determine table from SELECT');

    // COUNT(*) AS alias
    const countMatch = sql.match(/count\(\*\)\s+as\s+(\w+)/i);
    if (countMatch) {
        const alias = countMatch[1];
        let q = supabase.from(table).select('*', { count: 'exact', head: true });
        const whereClause = extractWhereClause(sql);
        if (whereClause) q = applyWhere(q, whereClause, params);
        const { count, error } = await q;
        if (error) throwSupabaseError(error);
        return { rows: [{ [alias]: count ?? 0 }], command: 'SELECT', rowCount: 1 };
    }

    if (lower.includes(' join ')) {
        return handleJoin(sql, params);
    }

    let query = supabase.from(table).select('*');

    const whereClause = extractWhereClause(sql);
    if (whereClause) query = applyWhere(query, whereClause, params);

    const orderMatch = sql.match(/order\s+by\s+(\w+)(?:\s+(asc|desc))?/i);
    if (orderMatch) {
        query = query.order(orderMatch[1], { ascending: (orderMatch[2] || 'asc').toLowerCase() === 'asc' });
    }

    const limitMatch = sql.match(/limit\s+(\d+)/i);
    if (limitMatch) query = query.limit(parseInt(limitMatch[1]));

    const { data, error } = await query;
    if (error) throwSupabaseError(error);
    return { rows: data || [], command: 'SELECT', rowCount: (data || []).length };
}

async function handleJoin(sql, params) {
    // memberships JOIN clubs via user_id
    const userIdMatch = sql.match(/memberships\.user_id\s*=\s*\$1/i);
    if (userIdMatch && params[0]) {
        const { data: memberships, error: mErr } = await supabase
            .from('memberships')
            .select('club_id')
            .eq('user_id', params[0]);
        if (mErr) throwSupabaseError(mErr);
        if (!memberships || memberships.length === 0)
            return { rows: [], command: 'SELECT', rowCount: 0 };

        const clubIds = memberships.map(m => m.club_id);
        const { data: clubs, error: cErr } = await supabase
            .from('clubs')
            .select('*')
            .in('id', clubIds);
        if (cErr) throwSupabaseError(cErr);
        return { rows: clubs || [], command: 'SELECT', rowCount: (clubs || []).length };
    }
    throw new Error('Unsupported JOIN query');
}

async function handleInsert(sql, params) {
    const table = extractTable(sql);
    if (!table) throw new Error('Could not determine table from INSERT');

    const colMatch = sql.match(/\(([^)]+)\)\s*values/i);
    if (!colMatch) throw new Error('Could not parse INSERT columns');
    const cols = colMatch[1].split(',').map(c => c.trim());

    const valuesIdx = sql.toLowerCase().indexOf('values');
    if (valuesIdx === -1) throw new Error('Could not find VALUES in INSERT');
    const afterValues = sql.slice(valuesIdx + 6).trim();

    let depth = 0, start = -1, end = -1;
    for (let i = 0; i < afterValues.length; i++) {
        if (afterValues[i] === '(') { if (depth === 0) start = i; depth++; }
        else if (afterValues[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (start === -1 || end === -1) throw new Error('Could not parse INSERT values');
    const valueParts = afterValues.slice(start + 1, end).split(',').map(v => v.trim());

    const obj = {};
    cols.forEach((col, i) => {
        const vp = valueParts[i] || '';
        if (/^\$\d+$/.test(vp)) {
            // $N placeholder — use params index
            const idx = parseInt(vp.slice(1)) - 1;
            obj[col] = params[idx] ?? null;
        } else if (vp.toUpperCase() === 'NULL') {
            obj[col] = null;
        } else if (!isNaN(Number(vp)) && vp !== '') {
            obj[col] = Number(vp);
        } else {
            obj[col] = vp.replace(/^'|'$/g, '');
        }
    });

    // FIX: use .maybeSingle() so missing row doesn't throw; fall back to select after insert
    const { data, error } = await supabase
        .from(table)
        .insert(obj)
        .select('id')
        .maybeSingle();

    if (error) {
        if (error.code === '23505') {
            const err = new Error(error.message);
            err.code  = 'ER_DUP_ENTRY';
            throw err;
        }
        throwSupabaseError(error);
    }

    return { rows: data ? [data] : [], command: 'INSERT', rowCount: 1 };
}

async function handleUpdate(sql, params) {
    const table = extractTable(sql);
    if (!table) throw new Error('Could not determine table from UPDATE');

    const setMatch = sql.match(/set\s+(.+?)\s+where/i);
    if (!setMatch) throw new Error('Could not parse UPDATE SET clause');

    const obj = {};
    const setClauses = setMatch[1].split(',').map(s => s.trim());
    setClauses.forEach(clause => {
        const paramEq = clause.match(/(\w+)\s*=\s*\$(\d+)/);
        const litEq   = clause.match(/(\w+)\s*=\s*(.+)/);
        if (paramEq) {
            obj[paramEq[1]] = params[parseInt(paramEq[2]) - 1];
        } else if (litEq) {
            const v = litEq[2].trim();
            obj[litEq[1]] = v.toUpperCase() === 'NULL' ? null
                          : !isNaN(Number(v)) && v !== '' ? Number(v)
                          : v.replace(/^'|'$/g, '');
        }
    });

    let query = supabase.from(table).update(obj);

    // FIX: use greedy WHERE extraction
    const whereClause = extractWhereClause(sql);
    if (whereClause) query = applyWhere(query, whereClause, params);

    const { data, error } = await query.select();
    if (error) throwSupabaseError(error);
    return { rows: data || [], command: 'UPDATE', rowCount: (data || []).length };
}

async function handleDelete(sql, params) {
    const table = extractTable(sql);
    if (!table) throw new Error('Could not determine table from DELETE');

    let query = supabase.from(table).delete();

    // FIX: use greedy WHERE extraction so compound AND conditions are captured
    const whereClause = extractWhereClause(sql);
    if (whereClause) query = applyWhere(query, whereClause, params);

    const { data, error } = await query.select();
    if (error) throwSupabaseError(error);
    return { rows: data || [], command: 'DELETE', rowCount: (data || []).length };
}

async function rawSql(sql, params = []) {
    const cmd = detectCommand(sql);
    switch (cmd) {
        case 'SELECT': return handleSelect(sql, params);
        case 'INSERT': return handleInsert(sql, params);
        case 'UPDATE': return handleUpdate(sql, params);
        case 'DELETE': return handleDelete(sql, params);
        default: throw new Error(`Unsupported SQL command: ${cmd}`);
    }
}

const db = {
    supabase,

    query(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        params = params ?? [];

        rawSql(sql.trim(), params)
            .then(({ rows, command, rowCount }) => {
                if (command === 'INSERT') {
                    callback(null, { insertId: rows[0]?.id ?? null, affectedRows: rowCount });
                } else if (command === 'UPDATE' || command === 'DELETE') {
                    callback(null, { affectedRows: rowCount, changedRows: rowCount });
                } else {
                    callback(null, rows);
                }
            })
            .catch(err => callback(err));
    },
};

(async () => {
    try {
        const { error } = await supabase.from('users').select('id').limit(1);
        if (error) throw error;
        console.log('✅ Supabase холбогдлоо ✓');
    } catch (e) {
        console.warn('⚠️  Supabase startup check failed:', e.message);
    }
})();

module.exports = db;