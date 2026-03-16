const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sql = require('mssql');

const app = express();
const PORT = process.env.PORT || 8080;
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'MZSJS BUZZ';

// ─────────────────────────────────────────────
// 1. CORS — FIRST MIDDLEWARE
// ─────────────────────────────────────────────
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
}));
app.options('*', cors());
app.use(bodyParser.json());

// ─────────────────────────────────────────────
// 2. ERROR HANDLERS
// ─────────────────────────────────────────────
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err.message);
});

// ─────────────────────────────────────────────
// 3. DB CONFIG
// ─────────────────────────────────────────────
const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    server: process.env.DB_SERVER || '103.207.1.87',
    database: process.env.DB_NAME || 'facultyschedule',
    port: parseInt(process.env.DB_PORT || '1433'),
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
    },
};

let pool = null;

async function getPool() {
    if (!pool) {
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to MSSQL');
    }
    return pool;
}

// ─────────────────────────────────────────────
// 4. CREATE TABLES
// ─────────────────────────────────────────────
async function initTables() {
    const db = await getPool();

    await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CW_Drivers' AND xtype='U')
    CREATE TABLE CW_Drivers (
      Id            UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
      Name          NVARCHAR(100),
      Phone         NVARCHAR(20),
      LicenseNumber NVARCHAR(50),
      BusNumber     NVARCHAR(10),
      IsActive      BIT DEFAULT 1,
      CreatedAt     DATETIMEOFFSET DEFAULT GETDATE()
    )
  `);

    await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CW_Routes' AND xtype='U')
    CREATE TABLE CW_Routes (
      BusNumber     NVARCHAR(10),
      RouteName     NVARCHAR(100),
      StartLocation NVARCHAR(100),
      EndLocation   NVARCHAR(100)
    )
  `);

    await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CW_Stops' AND xtype='U')
    CREATE TABLE CW_Stops (
      BusNumber NVARCHAR(10),
      StopName  NVARCHAR(100),
      StopOrder INT,
      Latitude  FLOAT,
      Longitude FLOAT
    )
  `);

    await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CW_BusLocation' AND xtype='U')
    CREATE TABLE CW_BusLocation (
      BusNo     INT PRIMARY KEY,
      Latitude  FLOAT,
      Longitude FLOAT,
      Speed     FLOAT,
      IsOnline  BIT DEFAULT 1,
      UpdatedAt DATETIME DEFAULT GETDATE()
    )
  `);

    await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CW_LocationHistory' AND xtype='U')
    CREATE TABLE CW_LocationHistory (
      Id         INT IDENTITY(1,1) PRIMARY KEY,
      BusNumber  NVARCHAR(10),
      Latitude   FLOAT,
      Longitude  FLOAT,
      Speed      FLOAT,
      RecordedAt DATETIME DEFAULT GETDATE()
    )
  `);

    await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CW_Trips' AND xtype='U')
    CREATE TABLE CW_Trips (
      Id         INT IDENTITY(1,1) PRIMARY KEY,
      BusNumber  NVARCHAR(10),
      DriverName NVARCHAR(100),
      Status     NVARCHAR(20),
      StartTime  DATETIME,
      EndTime    DATETIME
    )
  `);

    await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CW_DriverCheckins' AND xtype='U')
    CREATE TABLE CW_DriverCheckins (
      Id         INT IDENTITY(1,1) PRIMARY KEY,
      DriverName NVARCHAR(100),
      BusNumber  NVARCHAR(10),
      Latitude   FLOAT,
      Longitude  FLOAT,
      CheckedAt  DATETIME DEFAULT GETDATE()
    )
  `);

    await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CW_Students' AND xtype='U')
    CREATE TABLE CW_Students (
      Id         INT IDENTITY(1,1) PRIMARY KEY,
      Name       NVARCHAR(100),
      Email      NVARCHAR(100),
      RollNumber NVARCHAR(50),
      BusNumber  NVARCHAR(10)
    )
  `);

    await db.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CW_Admins' AND xtype='U')
    CREATE TABLE CW_Admins (
      Id        UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
      Username  NVARCHAR(50),
      Password  NVARCHAR(100),
      CreatedAt DATETIMEOFFSET DEFAULT GETDATE()
    )
  `);

    console.log('✅ All tables initialized!');
}

// ─────────────────────────────────────────────
// 5. SEED DATA
// ─────────────────────────────────────────────
async function seedData() {
    const db = await getPool();

    // Seed drivers
    const driverCount = await db.request()
        .query('SELECT COUNT(*) AS cnt FROM CW_Drivers');

    if (driverCount.recordset[0].cnt === 0) {
        await db.request().query(`
      INSERT INTO CW_Drivers (Id,Name,Phone,LicenseNumber,BusNumber,IsActive) VALUES
      (NEWID(),'Driver Bus 2', '9999999902','TN63AJ8602','2', 1),
      (NEWID(),'Driver Bus 3', '9999999903','TN63AK1260','3', 1),
      (NEWID(),'Driver Bus 4', '9999999904','TN63AK1264','4', 1),
      (NEWID(),'Driver Bus 6', '9999999906','TN63AJ8845','6', 1),
      (NEWID(),'Driver Bus 7', '9999999907','TN63AL8220','7', 1),
      (NEWID(),'Driver Bus 8', '9999999908','TN63AJ8903','8', 1),
      (NEWID(),'Driver Bus 9', '9999999909','TN63AL8156','9', 0),
      (NEWID(),'Driver Bus 11','9999999911','TN63AL9236','11',0),
      (NEWID(),'Driver Bus 12','9999999912','TN63AJ8611','12',0),
      (NEWID(),'Driver Bus 13','9999999913','TN63AJ8570','13',0),
      (NEWID(),'Driver Bus 14','9999999914','TN63BA0058','14',1),
      (NEWID(),'Driver Bus 15','9999999915','TN63BA0204','15',1),
      (NEWID(),'Driver Bus 16','9999999916','TN63BA3179','16',1),
      (NEWID(),'Driver Bus 17','9999999917','TN63BC3589','17',1),
      (NEWID(),'Driver Bus 18','9999999918','TN63BC3805','18',1),
      (NEWID(),'Driver Bus 19','9999999919','TN63BD8042','19',1),
      (NEWID(),'Driver Bus 20','9999999920','TN63BE0936','20',1),
      (NEWID(),'Driver Bus 34','9999999934','TN55AC5864','34',1),
      (NEWID(),'Driver Bus 50','9999999950','TN55BC5526','50',1)
    `);
        console.log('✅ Drivers seeded!');
    }

    // Seed routes
    const routeCount = await db.request()
        .query('SELECT COUNT(*) AS cnt FROM CW_Routes');

    if (routeCount.recordset[0].cnt === 0) {
        await db.request().query(`
      INSERT INTO CW_Routes (BusNumber,RouteName,StartLocation,EndLocation) VALUES
      ('2', 'Neivasal',               'College','Neivasal'),
      ('3', 'SS.Kottai',              'College','SS.Kottai'),
      ('4', 'Illupakudi',             'College','Illupakudi'),
      ('6', 'Senjai',                 'College','Senjai'),
      ('7', 'Thirupathur Pudhu Theru','College','Thirupathur'),
      ('8', 'Singampunari',           'College','Singampunari'),
      ('14','Velangudi',              'College','Velangudi'),
      ('15','Karaikudi',              'College','Karaikudi'),
      ('16','Eriyur',                 'College','Eriyur'),
      ('17','Akilmanai Thirupathur',  'College','Akilmanai'),
      ('18','Sembanur',               'College','Sembanur'),
      ('19','Kotaiyur',               'College','Kotaiyur'),
      ('20','Keelasevalpatti',        'College','Keelasevalpatti'),
      ('34','Kallutimedu',            'College','Kallutimedu'),
      ('50','Elanthaimangalam',       'College','Elanthaimangalam')
    `);
        console.log('✅ Routes seeded!');
    }

    // Seed admin
    const adminCount = await db.request()
        .query('SELECT COUNT(*) AS cnt FROM CW_Admins');

    if (adminCount.recordset[0].cnt === 0) {
        await db.request().query(`
      INSERT INTO CW_Admins (Id,Username,Password,CreatedAt)
      VALUES (NEWID(),'admin','admin123',GETDATE())
    `);
        console.log('✅ Admin seeded!');
    }
}

// ─────────────────────────────────────────────
// 6. HEALTH
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'CampusWay running', time: new Date().toISOString() });
});
app.get('/health', (req, res) => {
    res.json({ ok: true });
});

// ─────────────────────────────────────────────
// 7. DRIVER LOGIN
// ─────────────────────────────────────────────
app.post('/api/driver/login', async (req, res) => {
    const { busNumber, licenseNumber } = req.body;
    if (!busNumber || !licenseNumber) {
        return res.status(400).json({ success: false, error: 'busNumber and licenseNumber required' });
    }
    try {
        const db = await getPool();

        if (licenseNumber === MASTER_PASSWORD) {
            const result = await db.request()
                .input('busNumber', sql.NVarChar, String(busNumber))
                .query(`
          SELECT d.*, COALESCE(r.RouteName, d.Name) AS Route
          FROM CW_Drivers d
          LEFT JOIN CW_Routes r ON r.BusNumber = d.BusNumber
          WHERE d.BusNumber = @busNumber AND d.IsActive = 1
        `);
            if (result.recordset.length === 0)
                return res.status(401).json({ success: false, error: 'Bus not found or inactive' });
            const d = result.recordset[0];
            return res.json({ success: true, driver: { id: d.Id, name: d.Name, busNumber: d.BusNumber, route: d.Route, phone: d.Phone } });
        }

        const result = await db.request()
            .input('busNumber', sql.NVarChar, String(busNumber))
            .input('license', sql.NVarChar, String(licenseNumber))
            .query(`
        SELECT d.*, COALESCE(r.RouteName, d.Name) AS Route
        FROM CW_Drivers d
        LEFT JOIN CW_Routes r ON r.BusNumber = d.BusNumber
        WHERE d.BusNumber = @busNumber
          AND d.LicenseNumber = @license
          AND d.IsActive = 1
      `);
        if (result.recordset.length === 0)
            return res.status(401).json({ success: false, error: 'Wrong bus number or password' });
        const d = result.recordset[0];
        return res.json({ success: true, driver: { id: d.Id, name: d.Name, busNumber: d.BusNumber, route: d.Route, phone: d.Phone } });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────
// 8. ADMIN LOGIN
// ─────────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const db = await getPool();
        const result = await db.request()
            .input('username', sql.NVarChar, username)
            .input('password', sql.NVarChar, password)
            .query('SELECT * FROM CW_Admins WHERE Username=@username AND Password=@password');
        if (result.recordset.length === 0)
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        const a = result.recordset[0];
        res.json({ success: true, admin: { id: a.Id, username: a.Username } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────
// 9. ALL BUSES
// ─────────────────────────────────────────────
app.get('/api/admin/buses', async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.request().query(`
      SELECT
        CAST(d.BusNumber AS INT) AS BusNo,
        d.BusNumber,
        d.Name          AS DriverName,
        d.Phone,
        d.LicenseNumber AS Registration,
        COALESCE(r.RouteName, 'Route ' + d.BusNumber) AS Route,
        d.IsActive,
        CASE WHEN b.BusNo IS NOT NULL THEN 1 ELSE 0 END AS IsOnline,
        b.Latitude, b.Longitude, b.Speed, b.UpdatedAt
      FROM CW_Drivers d
      LEFT JOIN CW_Routes r ON r.BusNumber = d.BusNumber
      LEFT JOIN CW_BusLocation b ON b.BusNo = CAST(d.BusNumber AS INT)
      WHERE TRY_CAST(d.BusNumber AS INT) IS NOT NULL
      ORDER BY CAST(d.BusNumber AS INT)
    `);
        res.json({ success: true, buses: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────
// 10. LIVE BUSES
// ─────────────────────────────────────────────
app.get('/api/buses/live', async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.request().query(`
      SELECT b.BusNo, b.Latitude, b.Longitude, b.Speed, b.UpdatedAt,
        COALESCE(r.RouteName, 'Bus ' + CAST(b.BusNo AS NVARCHAR)) AS Route,
        d.Name AS DriverName
      FROM CW_BusLocation b
      LEFT JOIN CW_Drivers d ON CAST(d.BusNumber AS INT) = b.BusNo AND d.IsActive = 1
      LEFT JOIN CW_Routes r ON r.BusNumber = CAST(b.BusNo AS NVARCHAR)
      WHERE b.IsOnline = 1
    `);
        res.json({ success: true, buses: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────
// 11. SINGLE BUS LOCATION
// ─────────────────────────────────────────────
app.get('/api/bus/:busNo/location', async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.request()
            .input('busNo', sql.Int, parseInt(req.params.busNo))
            .query('SELECT * FROM CW_BusLocation WHERE BusNo = @busNo');
        if (result.recordset.length === 0)
            return res.json({ success: true, online: false, location: null });
        res.json({ success: true, online: true, location: result.recordset[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────
// 12. UPDATE LOCATION
// ─────────────────────────────────────────────
app.post('/api/bus/location', async (req, res) => {
    const { busNo, latitude, longitude, speed } = req.body;
    if (!busNo || latitude == null || longitude == null)
        return res.status(400).json({ success: false, error: 'busNo, latitude, longitude required' });
    try {
        const db = await getPool();
        await db.request()
            .input('busNo', sql.Int, parseInt(busNo))
            .input('lat', sql.Float, parseFloat(latitude))
            .input('lng', sql.Float, parseFloat(longitude))
            .input('speed', sql.Float, parseFloat(speed || 0))
            .query(`
        MERGE CW_BusLocation AS target
        USING (SELECT @busNo AS BusNo) AS source ON target.BusNo = source.BusNo
        WHEN MATCHED THEN
          UPDATE SET Latitude=@lat, Longitude=@lng, Speed=@speed, IsOnline=1, UpdatedAt=GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (BusNo,Latitude,Longitude,Speed,IsOnline,UpdatedAt)
          VALUES (@busNo,@lat,@lng,@speed,1,GETDATE());
      `);
        await db.request()
            .input('busNo', sql.NVarChar, String(busNo))
            .input('lat', sql.Float, parseFloat(latitude))
            .input('lng', sql.Float, parseFloat(longitude))
            .input('speed', sql.Float, parseFloat(speed || 0))
            .query(`
        INSERT INTO CW_LocationHistory (BusNumber,Latitude,Longitude,Speed,RecordedAt)
        VALUES (@busNo,@lat,@lng,@speed,GETDATE())
      `);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────
// 13. DISCONNECT
// ─────────────────────────────────────────────
app.post('/api/bus/disconnect', async (req, res) => {
    const { busNo } = req.body;
    if (!busNo) return res.status(400).json({ success: false, error: 'busNo required' });
    try {
        const db = await getPool();
        await db.request()
            .input('busNo', sql.Int, parseInt(busNo))
            .query('DELETE FROM CW_BusLocation WHERE BusNo = @busNo');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────
// 14. STOPS
// ─────────────────────────────────────────────
app.get('/api/bus/:busNo/stops', async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.request()
            .input('busNo', sql.NVarChar, String(req.params.busNo))
            .query('SELECT StopName,StopOrder,Latitude,Longitude FROM CW_Stops WHERE BusNumber=@busNo ORDER BY StopOrder');
        res.json({ success: true, stops: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────
// 15. ROUTE INFO
// ─────────────────────────────────────────────
app.get('/api/bus/:busNo/route', async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.request()
            .input('busNo', sql.NVarChar, String(req.params.busNo))
            .query('SELECT * FROM CW_Routes WHERE BusNumber=@busNo');
        res.json({ success: true, route: result.recordset[0] || null });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────
// 16. TRIP START
// ─────────────────────────────────────────────
app.post('/api/trip/start', async (req, res) => {
    const { busNumber, driverName } = req.body;
    try {
        const db = await getPool();
        await db.request()
            .input('bus', sql.NVarChar, String(busNumber))
            .input('driver', sql.NVarChar, String(driverName))
            .query(`INSERT INTO CW_Trips (BusNumber,DriverName,Status,StartTime) VALUES (@bus,@driver,'started',GETDATE())`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────
// 17. TRIP END
// ─────────────────────────────────────────────
app.post('/api/trip/end', async (req, res) => {
    const { busNumber } = req.body;
    try {
        const db = await getPool();
        await db.request()
            .input('bus', sql.NVarChar, String(busNumber))
            .query(`UPDATE CW_Trips SET Status='ended',EndTime=GETDATE() WHERE BusNumber=@bus AND Status='started'`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────
// 18. CURRENT TRIP
// ─────────────────────────────────────────────
app.get('/api/trip/:busNumber/current', async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.request()
            .input('bus', sql.NVarChar, String(req.params.busNumber))
            .query(`SELECT TOP 1 * FROM CW_Trips WHERE BusNumber=@bus AND Status='started' ORDER BY StartTime DESC`);
        res.json({ success: true, trip: result.recordset[0] || null });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────
// 19. CHECKIN
// ─────────────────────────────────────────────
app.post('/api/checkin', async (req, res) => {
    const { driverName, busNumber, latitude, longitude } = req.body;
    try {
        const db = await getPool();
        await db.request()
            .input('driver', sql.NVarChar, String(driverName))
            .input('bus', sql.NVarChar, String(busNumber))
            .input('lat', sql.Float, parseFloat(latitude))
            .input('lng', sql.Float, parseFloat(longitude))
            .query(`INSERT INTO CW_DriverCheckins (DriverName,BusNumber,Latitude,Longitude,CheckedAt) VALUES (@driver,@bus,@lat,@lng,GETDATE())`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────
// 20. STUDENTS
// ─────────────────────────────────────────────
app.get('/api/students/:busNumber', async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.request()
            .input('bus', sql.NVarChar, String(req.params.busNumber))
            .query('SELECT * FROM CW_Students WHERE BusNumber=@bus');
        res.json({ success: true, students: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─────────────────────────────────────────────
// 21. START SERVER
// ─────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`✅ CampusWay Server running on port ${PORT}`);
    try {
        await getPool();
        await initTables();
        await seedData();
    } catch (err) {
        console.error('❌ Startup error:', err.message);
    }
});