const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sql = require('mssql');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CORS FIX (FIRST)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
}));
app.options('*', cors());

app.use(bodyParser.json());

// ✅ DB CONFIG (FIXED DB_SERVER)
const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'YourPasswordHere',
    server: process.env.DB_SERVER || '103.207.1.87', // ✅ FIXED
    database: process.env.DB_NAME || 'facultyschedule',
    port: parseInt(process.env.DB_PORT || '1433'),
    options: {
        encrypt: false,
        trustServerCertificate: true,
    }
};

let pool;
async function getPool() {
    if (!pool) {
        pool = await sql.connect(dbConfig);
        console.log('✅ DB Connected');
    }
    return pool;
}

async function query(q, params = {}) {
    const p = await getPool();
    const req = p.request();
    Object.keys(params).forEach(k => {
        req.input(k, params[k].type, params[k].value);
    });
    return req.query(q);
}

// ✅ ROOT
app.get('/', (req, res) => {
    res.json({ status: 'CampusWay running' });
});

// ✅ HEALTH FIXED
app.get('/health', async (req, res) => {
    try {
        await query('SELECT 1');
        res.json({ db: 'connected' });
    } catch (err) {
        res.status(500).json({ db: 'error', error: err.message });
    }
});

// ✅ DRIVER LOGIN
app.post('/api/driver/login', async (req, res) => {
    try {
        const { busNumber, licenseNumber } = req.body;

        const result = await query(`
            SELECT d.*, r.RouteName
            FROM CW_Drivers d
            LEFT JOIN CW_Routes r ON d.BusNumber = r.BusNumber
            WHERE d.BusNumber=@bus AND d.LicenseNumber=@pass AND d.IsActive=1
        `, {
            bus: { type: sql.NVarChar, value: busNumber },
            pass: { type: sql.NVarChar, value: licenseNumber }
        });

        if (result.recordset.length === 0) {
            return res.status(401).json({ success: false });
        }

        res.json({ success: true, driver: result.recordset[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ✅ LOCATION UPDATE
app.post('/api/bus/location', async (req, res) => {
    try {
        const { busNo, latitude, longitude, speed = 0 } = req.body;

        await query(`
        IF EXISTS (SELECT 1 FROM CW_BusLocation WHERE BusNo=@bus)
        UPDATE CW_BusLocation SET Latitude=@lat,Longitude=@lng,Speed=@speed,IsOnline=1,UpdatedAt=GETDATE()
        WHERE BusNo=@bus
        ELSE
        INSERT INTO CW_BusLocation VALUES(@bus,@lat,@lng,@speed,1,GETDATE())
        `, {
            bus: { type: sql.Int, value: busNo },
            lat: { type: sql.Float, value: latitude },
            lng: { type: sql.Float, value: longitude },
            speed: { type: sql.Float, value: speed }
        });

        await query(`
        INSERT INTO CW_LocationHistory (BusNumber,Latitude,Longitude,Speed,RecordedAt)
        VALUES(@bus,@lat,@lng,@speed,GETDATE())
        `, {
            bus: { type: sql.NVarChar, value: String(busNo) },
            lat: { type: sql.Float, value: latitude },
            lng: { type: sql.Float, value: longitude },
            speed: { type: sql.Float, value: speed }
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ✅ DISCONNECT
app.post('/api/bus/disconnect', async (req, res) => {
    try {
        await query(`DELETE FROM CW_BusLocation WHERE BusNo=@bus`, {
            bus: { type: sql.Int, value: req.body.busNo }
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ✅ LIVE BUSES
app.get('/api/buses/live', async (req, res) => {
    try {
        const r = await query(`
        SELECT * FROM CW_BusLocation WHERE IsOnline=1
        `);
        res.json(r.recordset);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ✅ ADMIN BUSES
app.get('/api/admin/buses', async (req, res) => {
    try {
        const r = await query(`
        SELECT d.BusNumber,d.Name,r.RouteName,
        CASE WHEN b.BusNo IS NULL THEN 0 ELSE 1 END AS IsOnline,
        b.Speed,b.UpdatedAt
        FROM CW_Drivers d
        LEFT JOIN CW_Routes r ON d.BusNumber=r.BusNumber
        LEFT JOIN CW_BusLocation b ON d.BusNumber=b.BusNo
        `);
        res.json(r.recordset);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ✅ ROUTES
app.get('/api/routes', async (req, res) => {
    try {
        const r = await query(`SELECT * FROM CW_Routes`);
        res.json(r.recordset);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ✅ STOPS
app.get('/api/stops/:busNumber', async (req, res) => {
    try {
        const r = await query(`
        SELECT * FROM CW_Stops WHERE BusNumber=@bus ORDER BY StopOrder
        `, {
            bus: { type: sql.NVarChar, value: req.params.busNumber }
        });
        res.json(r.recordset);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ✅ NOTIFICATIONS
app.get('/api/notifications/:busNumber', async (req, res) => {
    try {
        const r = await query(`
        SELECT TOP 20 * FROM CW_Notifications WHERE BusNumber=@bus ORDER BY CreatedAt DESC
        `, {
            bus: { type: sql.NVarChar, value: req.params.busNumber }
        });
        res.json(r.recordset);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/notifications/mark-read', async (req, res) => {
    try {
        await query(`
        UPDATE CW_Notifications SET IsRead=1 WHERE BusNumber=@bus
        `, {
            bus: { type: sql.NVarChar, value: req.body.busNumber }
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ✅ START
app.listen(PORT, () => {
    console.log(`🚀 Server running on ${PORT}`);
    getPool();
});