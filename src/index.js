const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mssql = require('mssql');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));
app.options('*', cors());
app.use(bodyParser.json());

// ==================
// ROOT
// ==================
app.get('/', (req, res) => {
  res.json({
    message: '🚌 CampusWay API',
    version: '2.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      adminBuses: '/api/admin/buses',
      driverLogin: '/api/driver/login',
      busLocation: '/api/bus/:busNo/location',
      liveBuses: '/api/buses/live',
    }
  });
});

// ==================
// DB CONFIG
// ==================
const config = {
  user: process.env.DB_USER || 'facultyschedule',
  password: process.env.DB_PASS || 'Wise@3908',
  server: process.env.DB_HOST || '103.207.1.87',
  database: process.env.DB_NAME || 'facultyschedule',
  port: 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

let pool;

async function getPool() {
  if (!pool) pool = await mssql.connect(config);
  return pool;
}

// ==================
// DB INIT
// ==================
async function initDatabase() {
  try {
    pool = await mssql.connect(config);
    console.log('✅ Connected to MSSQL');

    await pool.request().query(`
      -- Students Table
      IF NOT EXISTS (SELECT 1 FROM sys.objects
        WHERE object_id = OBJECT_ID('dbo.CW_Students') AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_Students (
          Id           UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
          Name         NVARCHAR(100) NOT NULL,
          Email        NVARCHAR(100),
          Phone        NVARCHAR(15),
          RollNumber   NVARCHAR(20) UNIQUE,
          Department   NVARCHAR(50),
          BusNumber    NVARCHAR(10),
          CreatedAt    DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
        )
      END;

      -- Drivers Table
      IF NOT EXISTS (SELECT 1 FROM sys.objects
        WHERE object_id = OBJECT_ID('dbo.CW_Drivers') AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_Drivers (
          Id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
          Name          NVARCHAR(100) NOT NULL,
          Phone         NVARCHAR(15),
          LicenseNumber NVARCHAR(20),
          BusNumber     NVARCHAR(10) UNIQUE,
          IsActive      BIT DEFAULT 1,
          CreatedAt     DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
        )
      END;

      -- Bus Routes Table
      IF NOT EXISTS (SELECT 1 FROM sys.objects
        WHERE object_id = OBJECT_ID('dbo.CW_Routes') AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_Routes (
          Id                UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
          BusNumber         NVARCHAR(10) NOT NULL,
          RouteName         NVARCHAR(100),
          StartLocation     NVARCHAR(100),
          EndLocation       NVARCHAR(100),
          TotalDistance     DECIMAL(10,2),
          EstimatedDuration INT,
          CreatedAt         DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
        )
      END;

      -- Bus Stops Table
      IF NOT EXISTS (SELECT 1 FROM sys.objects
        WHERE object_id = OBJECT_ID('dbo.CW_Stops') AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_Stops (
          Id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
          BusNumber     NVARCHAR(10),
          StopName      NVARCHAR(100) NOT NULL,
          StopOrder     INT,
          Latitude      DECIMAL(10,8),
          Longitude     DECIMAL(11,8),
          EstimatedTime NVARCHAR(10)
        )
      END;

      -- Trips Table
      IF NOT EXISTS (SELECT 1 FROM sys.objects
        WHERE object_id = OBJECT_ID('dbo.CW_Trips') AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_Trips (
          Id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
          BusNumber     NVARCHAR(10),
          DriverName    NVARCHAR(100),
          StartTime     DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
          EndTime       DATETIMEOFFSET,
          Status        NVARCHAR(20) DEFAULT 'active',
          TotalDistance DECIMAL(10,2),
          CreatedAt     DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
        )
      END;

      -- Location History Table
      IF NOT EXISTS (SELECT 1 FROM sys.objects
        WHERE object_id = OBJECT_ID('dbo.CW_LocationHistory') AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_LocationHistory (
          Id         UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
          TripId     UNIQUEIDENTIFIER,
          BusNumber  NVARCHAR(10),
          Latitude   DECIMAL(10,8),
          Longitude  DECIMAL(11,8),
          Speed      DECIMAL(5,2),
          Heading    DECIMAL(5,2),
          RecordedAt DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
        )
      END;

      -- Driver Checkins Table
      IF NOT EXISTS (SELECT 1 FROM sys.objects
        WHERE object_id = OBJECT_ID('dbo.CW_DriverCheckins') AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_DriverCheckins (
          Id             UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
          DriverName     NVARCHAR(100),
          BusNumber      NVARCHAR(20),
          Latitude       DECIMAL(9,6),
          Longitude      DECIMAL(9,6),
          AccuracyMeters INT,
          CheckinTime    DATETIMEOFFSET,
          CreatedAt      DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
        )
      END;

      -- Live Bus Location Table (one row per active bus)
      IF NOT EXISTS (SELECT 1 FROM sys.objects
        WHERE object_id = OBJECT_ID('dbo.CW_BusLocation') AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_BusLocation (
          Id        INT IDENTITY(1,1) PRIMARY KEY,
          BusNo     INT NOT NULL UNIQUE,
          Latitude  FLOAT NOT NULL,
          Longitude FLOAT NOT NULL,
          Speed     FLOAT DEFAULT 0,
          IsOnline  BIT DEFAULT 1,
          UpdatedAt DATETIME DEFAULT GETDATE()
        )
      END;
    `);

    console.log('✅ All tables initialized!');
  } catch (err) {
    console.error('❌ MSSQL Error:', err.message);
    setTimeout(initDatabase, 5000);
  }
}

// ==================
// SEED DRIVERS
// ==================
async function seedDrivers() {
  try {
    const check = await pool.request()
      .query("SELECT COUNT(*) AS cnt FROM CW_Drivers");
    if (check.recordset[0].cnt === 0) {
      console.log("Seeding CW_Drivers...");
      await pool.request().query(`
        INSERT INTO CW_Drivers (Id, Name, Phone, LicenseNumber, BusNumber, IsActive) VALUES
        (NEWID(), 'Driver Bus 2',  '9999999902', 'TN63AJ8602', '2',  1),
        (NEWID(), 'Driver Bus 3',  '9999999903', 'TN63AK1260', '3',  1),
        (NEWID(), 'Driver Bus 4',  '9999999904', 'TN63AK1264', '4',  1),
        (NEWID(), 'Driver Bus 6',  '9999999906', 'TN63AJ8845', '6',  1),
        (NEWID(), 'Driver Bus 7',  '9999999907', 'TN63AL8220', '7',  1),
        (NEWID(), 'Driver Bus 8',  '9999999908', 'TN63AJ8903', '8',  1),
        (NEWID(), 'Driver Bus 9',  '9999999909', 'TN63AL8156', '9',  0),
        (NEWID(), 'Driver Bus 11', '9999999911', 'TN63AL9236', '11', 0),
        (NEWID(), 'Driver Bus 12', '9999999912', 'TN63AJ8611', '12', 0),
        (NEWID(), 'Driver Bus 13', '9999999913', 'TN63AJ8570', '13', 0),
        (NEWID(), 'Driver Bus 14', '9999999914', 'TN63BA0058', '14', 1),
        (NEWID(), 'Driver Bus 15', '9999999915', 'TN63BA0204', '15', 1),
        (NEWID(), 'Driver Bus 16', '9999999916', 'TN63BA3179', '16', 1),
        (NEWID(), 'Driver Bus 17', '9999999917', 'TN63BC3589', '17', 1),
        (NEWID(), 'Driver Bus 18', '9999999918', 'TN63BC3805', '18', 1),
        (NEWID(), 'Driver Bus 19', '9999999919', 'TN63BD8042', '19', 1),
        (NEWID(), 'Driver Bus 20', '9999999920', 'TN63BE0936', '20', 1),
        (NEWID(), 'Driver Bus 34', '9999999934', 'TN55AC5864', '34', 1),
        (NEWID(), 'Driver Bus 50', '9999999950', 'TN55BC5526', '50', 1)
      `);
      console.log("✅ CW_Drivers seeded with 19 buses.");
    }

    // Seed CW_Routes if empty
    const routeCheck = await pool.request()
      .query("SELECT COUNT(*) AS cnt FROM CW_Routes");
    if (routeCheck.recordset[0].cnt === 0) {
      console.log("Seeding CW_Routes...");
      await pool.request().query(`
        INSERT INTO CW_Routes (Id, BusNumber, RouteName, StartLocation, EndLocation) VALUES
        (NEWID(), '2',  'Neivasal',                'MZCET', 'Neivasal'),
        (NEWID(), '3',  'SS.Kottai',               'MZCET', 'SS.Kottai'),
        (NEWID(), '4',  'Illupakudi',              'MZCET', 'Illupakudi'),
        (NEWID(), '6',  'Senjai',                  'MZCET', 'Senjai'),
        (NEWID(), '7',  'Thirupathur Pudhu Theru', 'MZCET', 'Thirupathur Pudhu Theru'),
        (NEWID(), '8',  'Singampunari',            'MZCET', 'Singampunari'),
        (NEWID(), '9',  'Spare',                   'MZCET', 'Spare'),
        (NEWID(), '11', 'Spare',                   'MZCET', 'Spare'),
        (NEWID(), '12', 'Spare',                   'MZCET', 'Spare'),
        (NEWID(), '13', 'Spare',                   'MZCET', 'Spare'),
        (NEWID(), '14', 'Velangudi',               'MZCET', 'Velangudi'),
        (NEWID(), '15', 'Karaikudi',               'MZCET', 'Karaikudi'),
        (NEWID(), '16', 'Eriyur',                  'MZCET', 'Eriyur'),
        (NEWID(), '17', 'Akilmanai Thirupathur',   'MZCET', 'Akilmanai Thirupathur'),
        (NEWID(), '18', 'Sembanur',                'MZCET', 'Sembanur'),
        (NEWID(), '19', 'Kotaiyur',                'MZCET', 'Kotaiyur'),
        (NEWID(), '20', 'Keelasevalpatti',         'MZCET', 'Keelasevalpatti'),
        (NEWID(), '34', 'Kallutimedu',             'MZCET', 'Kallutimedu'),
        (NEWID(), '50', 'Elanthaimangalam',        'MZCET', 'Elanthaimangalam')
      `);
      console.log("✅ CW_Routes seeded with 19 routes.");
    }
  } catch (err) {
    console.error("Seed error (non-fatal):", err.message);
  }
}

initDatabase();

// ==================
// HEALTH CHECK
// ==================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'CampusWay API running!',
    database: pool ? 'connected' : 'disconnected',
    time: new Date().toISOString()
  });
});

// ==================
// STUDENT ROUTES
// ==================
app.get('/api/students/:rollNumber', async (req, res) => {
  try {
    const result = await pool.request()
      .input('roll', mssql.NVarChar(20), req.params.rollNumber)
      .query(`SELECT * FROM dbo.CW_Students WHERE RollNumber = @roll`);
    if (result.recordset.length === 0)
      return res.status(404).json({ ok: false, message: 'Student not found!' });
    res.json({ ok: true, data: result.recordset[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/students', async (req, res) => {
  try {
    const result = await pool.request()
      .query('SELECT * FROM dbo.CW_Students ORDER BY Name');
    res.json({ ok: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/students', async (req, res) => {
  const { name, email, phone, rollNumber, department, busNumber } = req.body;
  try {
    await pool.request()
      .input('id', mssql.UniqueIdentifier, uuidv4())
      .input('name', mssql.NVarChar(100), name)
      .input('email', mssql.NVarChar(100), email)
      .input('phone', mssql.NVarChar(15), phone)
      .input('roll', mssql.NVarChar(20), rollNumber)
      .input('dept', mssql.NVarChar(50), department)
      .input('bus', mssql.NVarChar(10), busNumber)
      .query(`
        INSERT INTO dbo.CW_Students
          (Id, Name, Email, Phone, RollNumber, Department, BusNumber)
        VALUES (@id, @name, @email, @phone, @roll, @dept, @bus)
      `);
    res.json({ ok: true, message: 'Student added!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================
// DRIVER ROUTES
// ==================

// Driver Login — BusNumber + LicenseNumber
app.post('/api/driver/login', async (req, res) => {
  const busNo = req.body.busNo || req.body.busNumber;
  const password = req.body.password;

  if (!busNo || !password) {
    return res.status(400).json({
      success: false,
      error: 'Bus number and password are required'
    });
  }

  try {
    const result = await pool.request()
      .input('busNumber', mssql.NVarChar(10), String(busNo))
      .input('license', mssql.NVarChar(20), password.toUpperCase().trim())
      .query(`
        SELECT d.Id, d.Name, d.BusNumber, d.LicenseNumber, d.IsActive,
               COALESCE(r.RouteName, d.Name, 'Route ' + d.BusNumber) AS Route
        FROM CW_Drivers d
        LEFT JOIN CW_Routes r ON r.BusNumber = d.BusNumber
        WHERE d.BusNumber = @busNumber
          AND d.LicenseNumber = @license
          AND d.IsActive = 1
      `);

    if (result.recordset.length === 0)
      return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const row = result.recordset[0];
    res.json({
      success: true,
      bus: {
        BusNo: Number(row.BusNumber),
        Registration: row.LicenseNumber,
        Route: row.Route || row.Name || ''
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Server error. Please try again.' });
  }
});

app.get('/api/drivers', async (req, res) => {
  try {
    const result = await pool.request()
      .query('SELECT * FROM dbo.CW_Drivers ORDER BY CAST(BusNumber AS INT)');
    res.json({ ok: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/drivers/bus/:busNumber', async (req, res) => {
  try {
    const result = await pool.request()
      .input('bus', mssql.NVarChar(10), req.params.busNumber)
      .query(`SELECT * FROM dbo.CW_Drivers WHERE BusNumber = @bus`);
    res.json({ ok: true, data: result.recordset[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/drivers', async (req, res) => {
  const { name, phone, licenseNumber, busNumber } = req.body;
  try {
    await pool.request()
      .input('id', mssql.UniqueIdentifier, uuidv4())
      .input('name', mssql.NVarChar(100), name)
      .input('phone', mssql.NVarChar(15), phone)
      .input('license', mssql.NVarChar(20), licenseNumber)
      .input('bus', mssql.NVarChar(10), busNumber)
      .query(`
        INSERT INTO dbo.CW_Drivers (Id, Name, Phone, LicenseNumber, BusNumber)
        VALUES (@id, @name, @phone, @license, @bus)
      `);
    res.json({ ok: true, message: 'Driver added!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/checkin', async (req, res) => {
  const { driverName, busNumber, location } = req.body;
  try {
    await pool.request()
      .input('id', mssql.UniqueIdentifier, uuidv4())
      .input('driverName', mssql.NVarChar(100), driverName)
      .input('busNumber', mssql.NVarChar(20), busNumber)
      .input('latitude', mssql.Decimal(9, 6), location?.lat || 0)
      .input('longitude', mssql.Decimal(9, 6), location?.lng || 0)
      .input('accuracy', mssql.Int, location?.accuracy || null)
      .input('checkinTime', mssql.DateTimeOffset, new Date().toISOString())
      .query(`
        INSERT INTO dbo.CW_DriverCheckins
          (Id, DriverName, BusNumber, Latitude, Longitude, AccuracyMeters, CheckinTime)
        VALUES (@id, @driverName, @busNumber, @latitude, @longitude, @accuracy, @checkinTime)
      `);
    res.json({ ok: true, message: '✅ Check-in stored!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================
// BUS ROUTES
// ==================
app.get('/api/routes', async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT r.*, d.Name AS DriverName, d.Phone AS DriverPhone
      FROM dbo.CW_Routes r
      LEFT JOIN dbo.CW_Drivers d ON r.BusNumber = d.BusNumber
      ORDER BY CAST(r.BusNumber AS INT)
    `);
    res.json({ ok: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/routes/:busNumber/stops', async (req, res) => {
  try {
    const result = await pool.request()
      .input('bus', mssql.NVarChar(10), req.params.busNumber)
      .query(`SELECT * FROM dbo.CW_Stops WHERE BusNumber = @bus ORDER BY StopOrder`);
    res.json({ ok: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/routes', async (req, res) => {
  const { busNumber, routeName, startLocation, endLocation, estimatedDuration } = req.body;
  try {
    await pool.request()
      .input('id', mssql.UniqueIdentifier, uuidv4())
      .input('bus', mssql.NVarChar(10), busNumber)
      .input('name', mssql.NVarChar(100), routeName)
      .input('start', mssql.NVarChar(100), startLocation)
      .input('end', mssql.NVarChar(100), endLocation)
      .input('duration', mssql.Int, estimatedDuration)
      .query(`
        INSERT INTO dbo.CW_Routes (Id, BusNumber, RouteName, StartLocation, EndLocation, EstimatedDuration)
        VALUES (@id, @bus, @name, @start, @end, @duration)
      `);
    res.json({ ok: true, message: 'Route added!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/routes/:busNumber/stops', async (req, res) => {
  const { stopName, stopOrder, latitude, longitude, estimatedTime } = req.body;
  try {
    await pool.request()
      .input('id', mssql.UniqueIdentifier, uuidv4())
      .input('bus', mssql.NVarChar(10), req.params.busNumber)
      .input('name', mssql.NVarChar(100), stopName)
      .input('order', mssql.Int, stopOrder)
      .input('lat', mssql.Decimal(10, 8), latitude)
      .input('lng', mssql.Decimal(11, 8), longitude)
      .input('time', mssql.NVarChar(10), estimatedTime)
      .query(`
        INSERT INTO dbo.CW_Stops (Id, BusNumber, StopName, StopOrder, Latitude, Longitude, EstimatedTime)
        VALUES (@id, @bus, @name, @order, @lat, @lng, @time)
      `);
    res.json({ ok: true, message: 'Stop added!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================
// TRIP ROUTES
// ==================
app.post('/api/trips/start', async (req, res) => {
  const { busNumber, driverName } = req.body;
  try {
    const tripId = uuidv4();
    await pool.request()
      .input('id', mssql.UniqueIdentifier, tripId)
      .input('bus', mssql.NVarChar(10), busNumber)
      .input('driver', mssql.NVarChar(100), driverName)
      .query(`
        INSERT INTO dbo.CW_Trips (Id, BusNumber, DriverName, Status)
        VALUES (@id, @bus, @driver, 'active')
      `);
    res.json({ ok: true, tripId, message: 'Trip started!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/trips/:tripId/end', async (req, res) => {
  try {
    await pool.request()
      .input('id', mssql.UniqueIdentifier, req.params.tripId)
      .query(`
        UPDATE dbo.CW_Trips
        SET Status = 'completed', EndTime = SYSDATETIMEOFFSET()
        WHERE Id = @id
      `);
    res.json({ ok: true, message: 'Trip ended!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/trips/:tripId/location', async (req, res) => {
  const { busNumber, location } = req.body;
  try {
    await pool.request()
      .input('id', mssql.UniqueIdentifier, uuidv4())
      .input('tripId', mssql.UniqueIdentifier, req.params.tripId)
      .input('bus', mssql.NVarChar(10), busNumber)
      .input('lat', mssql.Decimal(10, 8), location?.lat)
      .input('lng', mssql.Decimal(11, 8), location?.lng)
      .input('speed', mssql.Decimal(5, 2), location?.speed || 0)
      .input('heading', mssql.Decimal(5, 2), location?.heading || 0)
      .query(`
        INSERT INTO dbo.CW_LocationHistory
          (Id, TripId, BusNumber, Latitude, Longitude, Speed, Heading)
        VALUES (@id, @tripId, @bus, @lat, @lng, @speed, @heading)
      `);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/location-history', async (req, res) => {
  const { busId, busLat, busLng } = req.body;
  try {
    await pool.request()
      .input('id', mssql.UniqueIdentifier, uuidv4())
      .input('bus', mssql.NVarChar(10), String(busId))
      .input('lat', mssql.Decimal(10, 8), busLat)
      .input('lng', mssql.Decimal(11, 8), busLng)
      .input('recordedAt', mssql.DateTimeOffset, new Date().toISOString())
      .query(`
        INSERT INTO dbo.CW_LocationHistory (Id, BusNumber, Latitude, Longitude, RecordedAt)
        VALUES (@id, @bus, @lat, @lng, @recordedAt)
      `);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/trips/history', async (req, res) => {
  const { bus } = req.query;
  try {
    const request = pool.request();
    let query = `SELECT TOP 50 * FROM dbo.CW_Trips`;
    if (bus) {
      request.input('bus', mssql.NVarChar(10), bus);
      query += ' WHERE BusNumber = @bus';
    }
    query += ' ORDER BY CreatedAt DESC';
    const result = await request.query(query);
    res.json({ ok: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================
// BUS TRACKING ROUTES
// ==================

// GET all buses — Student + Admin portal
app.get('/api/admin/buses', async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT
        CAST(d.BusNumber AS INT)                              AS BusNo,
        d.BusNumber,
        d.LicenseNumber                                       AS Registration,
        COALESCE(r.RouteName, 'Route ' + d.BusNumber)        AS Route,
        d.IsActive,
        CASE WHEN b.BusNo IS NOT NULL THEN 1 ELSE 0 END       AS IsOnline
      FROM CW_Drivers d
      LEFT JOIN CW_Routes r
        ON r.BusNumber = d.BusNumber
      LEFT JOIN CW_BusLocation b
        ON b.BusNo = CAST(d.BusNumber AS INT)
      WHERE TRY_CAST(d.BusNumber AS INT) IS NOT NULL
      ORDER BY CAST(d.BusNumber AS INT)
    `);
    res.json({ buses: result.recordset });
  } catch (err) {
    console.error('Admin buses error:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// POST bus location (driver sends GPS)
app.post('/api/bus/location', async (req, res) => {
  const { busNo, lat, lng, speed } = req.body;
  if (!busNo || lat == null || lng == null)
    return res.status(400).json({ success: false, error: 'busNo, lat, lng required' });
  try {
    await pool.request()
      .input('busNo', mssql.Int, Number(busNo))
      .input('lat', mssql.Float, lat)
      .input('lng', mssql.Float, lng)
      .input('speed', mssql.Float, speed || 0)
      .query(`
        IF EXISTS (SELECT 1 FROM CW_BusLocation WHERE BusNo = @busNo)
          UPDATE CW_BusLocation
          SET Latitude=@lat, Longitude=@lng, Speed=@speed,
              IsOnline=1, UpdatedAt=GETDATE()
          WHERE BusNo=@busNo
        ELSE
          INSERT INTO CW_BusLocation (BusNo, Latitude, Longitude, Speed, IsOnline)
          VALUES (@busNo, @lat, @lng, @speed, 1)
      `);

    // Archive to history
    await pool.request()
      .input('id', mssql.UniqueIdentifier, uuidv4())
      .input('bus', mssql.NVarChar(10), String(busNo))
      .input('lat', mssql.Decimal(10, 8), lat)
      .input('lng', mssql.Decimal(11, 8), lng)
      .input('speed', mssql.Decimal(5, 2), speed || 0)
      .query(`
        INSERT INTO CW_LocationHistory (Id, BusNumber, Latitude, Longitude, Speed)
        VALUES (@id, @bus, @lat, @lng, @speed)
      `);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST driver disconnect — DELETE live location
app.post('/api/bus/disconnect', async (req, res) => {
  const { busNo } = req.body;
  if (!busNo)
    return res.status(400).json({ success: false, error: 'busNo required' });
  try {
    await pool.request()
      .input('busNo', mssql.Int, Number(busNo))
      .query("DELETE FROM CW_BusLocation WHERE BusNo = @busNo");
    console.log(`🚌 Bus ${busNo} disconnected — location deleted`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET all live buses
app.get('/api/buses/live', async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT
        b.BusNo, b.Latitude, b.Longitude, b.Speed, b.UpdatedAt,
        d.LicenseNumber AS Registration,
        COALESCE(r.RouteName, d.Name) AS Route
      FROM CW_BusLocation b
      INNER JOIN CW_Drivers d
        ON d.BusNumber = CAST(b.BusNo AS NVARCHAR(10))
      LEFT JOIN CW_Routes r
        ON r.BusNumber = d.BusNumber
      WHERE d.IsActive = 1
    `);
    res.json({ buses: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single bus location
app.get('/api/bus/:busNo/location', async (req, res) => {
  const { busNo } = req.params;
  try {
    const result = await pool.request()
      .input('busNo', mssql.Int, Number(busNo))
      .query(`
        SELECT
          b.BusNo, b.Latitude, b.Longitude, b.Speed, b.UpdatedAt,
          d.LicenseNumber AS Registration,
          COALESCE(r.RouteName, d.Name) AS Route
        FROM CW_BusLocation b
        INNER JOIN CW_Drivers d
          ON d.BusNumber = CAST(b.BusNo AS NVARCHAR(10))
        LEFT JOIN CW_Routes r
          ON r.BusNumber = d.BusNumber
        WHERE b.BusNo = @busNo
      `);
    if (result.recordset.length > 0)
      res.json({ online: true, bus: result.recordset[0] });
    else
      res.json({ online: false });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update bus (admin panel)
app.put('/api/admin/bus/:busNo', async (req, res) => {
  const { busNo } = req.params;
  const { registration, route, isActive } = req.body;
  try {
    const request = pool.request();
    const updates = [];

    if (registration !== undefined) {
      request.input('reg', mssql.NVarChar(20), registration.toUpperCase().trim());
      updates.push("LicenseNumber = @reg");
    }
    if (route !== undefined) {
      // Update CW_Routes RouteName
      await pool.request()
        .input('bus', mssql.NVarChar(10), String(busNo))
        .input('rname', mssql.NVarChar(100), route)
        .query(`
          IF EXISTS (SELECT 1 FROM CW_Routes WHERE BusNumber = @bus)
            UPDATE CW_Routes SET RouteName = @rname WHERE BusNumber = @bus
          ELSE
            INSERT INTO CW_Routes (Id, BusNumber, RouteName, StartLocation, EndLocation)
            VALUES (NEWID(), @bus, @rname, 'MZCET', @rname)
        `);
    }
    if (isActive !== undefined) {
      request.input('active', mssql.Bit, isActive ? 1 : 0);
      updates.push("IsActive = @active");
    }

    if (updates.length > 0) {
      request.input('busNo', mssql.NVarChar(10), String(busNo));
      const query = `UPDATE CW_Drivers SET ${updates.join(', ')} WHERE BusNumber = @busNo`;
      await request.query(query);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET bus location history
app.get('/api/bus/:busNo/history', async (req, res) => {
  const { busNo } = req.params;
  try {
    const result = await pool.request()
      .input('bus', mssql.NVarChar(10), String(busNo))
      .query(`
        SELECT TOP 100 BusNumber, Latitude, Longitude, Speed, RecordedAt
        FROM CW_LocationHistory
        WHERE BusNumber = @bus
        ORDER BY RecordedAt DESC
      `);
    res.json({ history: result.recordset.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================
// ADMIN DASHBOARD
// ==================
app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const [buses, onlineBuses, trips] = await Promise.all([
      pool.request().query("SELECT COUNT(*) AS cnt FROM CW_Drivers WHERE IsActive = 1"),
      pool.request().query("SELECT COUNT(*) AS cnt FROM CW_BusLocation"),
      pool.request().query("SELECT COUNT(*) AS cnt FROM CW_Trips WHERE Status = 'active'"),
    ]);
    res.json({
      ok: true,
      stats: {
        totalActiveBuses: buses.recordset[0].cnt,
        onlineBuses: onlineBuses.recordset[0].cnt,
        activeTrips: trips.recordset[0].cnt,
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================
// START SERVER
// ==================
const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  await seedDrivers();
  console.log(`✅ CampusWay Server running on port ${PORT}`);
});