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

// Add this after app.use(bodyParser.json()):
app.get('/', (req, res) => {
  res.json({
    message: '🚌 CampusWay API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      students: '/api/students',
      drivers: '/api/drivers',
      routes: '/api/routes',
      trips: '/api/trips/history',
      admin: '/api/admin/dashboard'
    }
  });
});

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

async function initDatabase() {
  try {
    pool = await mssql.connect(config);
    console.log('✅ Connected to MSSQL');

    // Create all tables if not exists
    await pool.request().query(`
      -- Students Table
      IF NOT EXISTS (SELECT 1 FROM sys.objects 
        WHERE object_id = OBJECT_ID('dbo.CW_Students') 
        AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_Students (
          Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY 
            DEFAULT NEWID(),
          Name NVARCHAR(100) NOT NULL,
          Email NVARCHAR(100),
          Phone NVARCHAR(15),
          RollNumber NVARCHAR(20) UNIQUE,
          Department NVARCHAR(50),
          BusNumber NVARCHAR(10),
          CreatedAt DATETIMEOFFSET DEFAULT 
            SYSDATETIMEOFFSET()
        )
      END;

      -- Drivers Table
      IF NOT EXISTS (SELECT 1 FROM sys.objects 
        WHERE object_id = OBJECT_ID('dbo.CW_Drivers') 
        AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_Drivers (
          Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY 
            DEFAULT NEWID(),
          Name NVARCHAR(100) NOT NULL,
          Phone NVARCHAR(15),
          LicenseNumber NVARCHAR(20),
          BusNumber NVARCHAR(10) UNIQUE,
          IsActive BIT DEFAULT 1,
          CreatedAt DATETIMEOFFSET DEFAULT 
            SYSDATETIMEOFFSET()
        )
      END;

      -- Bus Routes Table
      IF NOT EXISTS (SELECT 1 FROM sys.objects 
        WHERE object_id = OBJECT_ID('dbo.CW_Routes') 
        AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_Routes (
          Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY 
            DEFAULT NEWID(),
          BusNumber NVARCHAR(10) NOT NULL,
          RouteName NVARCHAR(100),
          StartLocation NVARCHAR(100),
          EndLocation NVARCHAR(100),
          TotalDistance DECIMAL(10,2),
          EstimatedDuration INT,
          CreatedAt DATETIMEOFFSET DEFAULT 
            SYSDATETIMEOFFSET()
        )
      END;

      -- Bus Stops Table
      IF NOT EXISTS (SELECT 1 FROM sys.objects 
        WHERE object_id = OBJECT_ID('dbo.CW_Stops') 
        AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_Stops (
          Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY 
            DEFAULT NEWID(),
          BusNumber NVARCHAR(10),
          StopName NVARCHAR(100) NOT NULL,
          StopOrder INT,
          Latitude DECIMAL(10,8),
          Longitude DECIMAL(11,8),
          EstimatedTime NVARCHAR(10)
        )
      END;

      -- Trips Table
      IF NOT EXISTS (SELECT 1 FROM sys.objects 
        WHERE object_id = OBJECT_ID('dbo.CW_Trips') 
        AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_Trips (
          Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY 
            DEFAULT NEWID(),
          BusNumber NVARCHAR(10),
          DriverName NVARCHAR(100),
          StartTime DATETIMEOFFSET DEFAULT 
            SYSDATETIMEOFFSET(),
          EndTime DATETIMEOFFSET,
          Status NVARCHAR(20) DEFAULT 'active',
          TotalDistance DECIMAL(10,2),
          CreatedAt DATETIMEOFFSET DEFAULT 
            SYSDATETIMEOFFSET()
        )
      END;

      -- Location History Table
      IF NOT EXISTS (SELECT 1 FROM sys.objects 
        WHERE object_id = OBJECT_ID('dbo.CW_LocationHistory') 
        AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_LocationHistory (
          Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY 
            DEFAULT NEWID(),
          TripId UNIQUEIDENTIFIER,
          BusNumber NVARCHAR(10),
          Latitude DECIMAL(10,8),
          Longitude DECIMAL(11,8),
          Speed DECIMAL(5,2),
          Heading DECIMAL(5,2),
          RecordedAt DATETIMEOFFSET DEFAULT 
            SYSDATETIMEOFFSET()
        )
      END;

      -- Driver Checkins Table
      IF NOT EXISTS (SELECT 1 FROM sys.objects 
        WHERE object_id = OBJECT_ID('dbo.CW_DriverCheckins') 
        AND type = 'U')
      BEGIN
        CREATE TABLE dbo.CW_DriverCheckins (
          Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY 
            DEFAULT NEWID(),
          DriverName NVARCHAR(100),
          BusNumber NVARCHAR(20),
          Latitude DECIMAL(9,6),
          Longitude DECIMAL(9,6),
          AccuracyMeters INT,
          CheckinTime DATETIMEOFFSET,
          CreatedAt DATETIMEOFFSET DEFAULT 
            SYSDATETIMEOFFSET()
        )
      END;
    `);

    console.log('✅ All tables initialized!');
  } catch (err) {
    console.error('❌ MSSQL Error:', err.message);
    setTimeout(initDatabase, 5000);
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
    database: pool ? 'connected' : 'disconnected'
  });
});

// ==================
// STUDENT ROUTES
// ==================

// Get student by roll number (login)
app.get('/api/students/:rollNumber', async (req, res) => {
  try {
    const result = await pool.request()
      .input('roll', mssql.NVarChar(20), req.params.rollNumber)
      .query(`
        SELECT * FROM dbo.CW_Students 
        WHERE RollNumber = @roll
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        ok: false,
        message: 'Student not found!'
      });
    }

    res.json({ ok: true, data: result.recordset[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get all students
app.get('/api/students', async (req, res) => {
  try {
    const result = await pool.request()
      .query('SELECT * FROM dbo.CW_Students ORDER BY Name');
    res.json({ ok: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Add student
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

// Driver Login
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
      .input('busNumber', mssql.NVarChar, String(busNo))
      .input('license', mssql.NVarChar, password.toUpperCase().trim())
      .query(`
        SELECT Id, Name, BusNumber, LicenseNumber, IsActive
        FROM CW_Drivers
        WHERE BusNumber = @busNumber 
          AND LicenseNumber = @license 
          AND IsActive = 1
      `);
    if (result.recordset.length === 0)
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    const row = result.recordset[0];
    res.json({
      success: true,
      bus: {
        BusNo: Number(row.BusNumber),
        Registration: row.LicenseNumber,
        Route: row.Name || ''
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Server error. Please try again later.' });
  }
});

// Get all drivers
app.get('/api/drivers', async (req, res) => {
  try {
    const result = await pool.request()
      .query('SELECT * FROM dbo.CW_Drivers ORDER BY Name');
    res.json({ ok: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get driver by bus number
app.get('/api/drivers/bus/:busNumber', async (req, res) => {
  try {
    const result = await pool.request()
      .input('bus', mssql.NVarChar(10), req.params.busNumber)
      .query(`
        SELECT * FROM dbo.CW_Drivers 
        WHERE BusNumber = @bus
      `);
    res.json({ ok: true, data: result.recordset[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Add driver
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
        INSERT INTO dbo.CW_Drivers 
        (Id, Name, Phone, LicenseNumber, BusNumber)
        VALUES (@id, @name, @phone, @license, @bus)
      `);
    res.json({ ok: true, message: 'Driver added!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Driver checkin
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
        (Id, DriverName, BusNumber, Latitude, 
         Longitude, AccuracyMeters, CheckinTime)
        VALUES (@id, @driverName, @busNumber, @latitude,
         @longitude, @accuracy, @checkinTime)
      `);
    res.json({ ok: true, message: '✅ Check-in stored!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================
// BUS ROUTES
// ==================

// Get all routes
app.get('/api/routes', async (req, res) => {
  try {
    const result = await pool.request()
      .query(`
        SELECT r.*, d.Name as DriverName, d.Phone as DriverPhone
        FROM dbo.CW_Routes r
        LEFT JOIN dbo.CW_Drivers d ON r.BusNumber = d.BusNumber
        ORDER BY r.BusNumber
      `);
    res.json({ ok: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get stops by bus number
app.get('/api/routes/:busNumber/stops', async (req, res) => {
  try {
    const result = await pool.request()
      .input('bus', mssql.NVarChar(10), req.params.busNumber)
      .query(`
        SELECT * FROM dbo.CW_Stops
        WHERE BusNumber = @bus
        ORDER BY StopOrder
      `);
    res.json({ ok: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Add route
app.post('/api/routes', async (req, res) => {
  const { busNumber, routeName, startLocation,
    endLocation, estimatedDuration } = req.body;
  try {
    await pool.request()
      .input('id', mssql.UniqueIdentifier, uuidv4())
      .input('bus', mssql.NVarChar(10), busNumber)
      .input('name', mssql.NVarChar(100), routeName)
      .input('start', mssql.NVarChar(100), startLocation)
      .input('end', mssql.NVarChar(100), endLocation)
      .input('duration', mssql.Int, estimatedDuration)
      .query(`
        INSERT INTO dbo.CW_Routes
        (Id, BusNumber, RouteName, StartLocation, 
         EndLocation, EstimatedDuration)
        VALUES (@id, @bus, @name, @start, @end, @duration)
      `);
    res.json({ ok: true, message: 'Route added!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Add stop
app.post('/api/routes/:busNumber/stops', async (req, res) => {
  const { stopName, stopOrder, latitude,
    longitude, estimatedTime } = req.body;
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
        INSERT INTO dbo.CW_Stops
        (Id, BusNumber, StopName, StopOrder, 
         Latitude, Longitude, EstimatedTime)
        VALUES (@id, @bus, @name, @order, 
         @lat, @lng, @time)
      `);
    res.json({ ok: true, message: 'Stop added!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================
// TRIP ROUTES
// ==================

// Start trip
app.post('/api/trips/start', async (req, res) => {
  const { busNumber, driverName } = req.body;
  try {
    const tripId = uuidv4();
    await pool.request()
      .input('id', mssql.UniqueIdentifier, tripId)
      .input('bus', mssql.NVarChar(10), busNumber)
      .input('driver', mssql.NVarChar(100), driverName)
      .query(`
        INSERT INTO dbo.CW_Trips
        (Id, BusNumber, DriverName, Status)
        VALUES (@id, @bus, @driver, 'active')
      `);
    res.json({ ok: true, tripId, message: 'Trip started!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// End trip
app.put('/api/trips/:tripId/end', async (req, res) => {
  try {
    await pool.request()
      .input('id', mssql.UniqueIdentifier, req.params.tripId)
      .query(`
        UPDATE dbo.CW_Trips
        SET Status = 'completed', 
            EndTime = SYSDATETIMEOFFSET()
        WHERE Id = @id
      `);
    res.json({ ok: true, message: 'Trip ended!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Save location to history
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

// Alias for client tracking telemetry
app.post('/api/location-history', async (req, res) => {
  const { busId, busLat, busLng, studentLat, studentLng, distanceKm, durationMin } = req.body;
  try {
    // Storing as a general telemetry log in LocationHistory without a specific tripId
    await pool.request()
      .input('id', mssql.UniqueIdentifier, uuidv4())
      .input('bus', mssql.NVarChar(10), String(busId))
      .input('lat', mssql.Decimal(10, 8), busLat)
      .input('lng', mssql.Decimal(11, 8), busLng)
      .input('recordedAt', mssql.DateTimeOffset, new Date().toISOString())
      .query(`
        INSERT INTO dbo.CW_LocationHistory
        (Id, BusNumber, Latitude, Longitude, RecordedAt)
        VALUES (@id, @bus, @lat, @lng, @recordedAt)
      `);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get trip history
app.get('/api/trips/history', async (req, res) => {
  const { bus } = req.query;
  try {
    const request = pool.request();
    let query = `
      SELECT TOP 50 * FROM dbo.CW_Trips
    `;
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
// CAMPUSWAY BUS TRACKING ROUTES
// ==================

// Get All Buses (Admin) — used by DriverLogin.tsx
app.get('/api/admin/buses', async (req, res) => {
  try {
    // Robustness: CW_BusLocation might not exist on some deployments
    const hasBusLocation = await pool.request().query(`
      SELECT 1 AS ok
      FROM sys.objects
      WHERE object_id = OBJECT_ID('dbo.CW_BusLocation')
        AND type = 'U'
    `);

    const queryWithOnline = `
      SELECT 
        CAST(d.BusNumber AS INT) AS BusNo,
        d.BusNumber,
        d.LicenseNumber AS Registration,
        COALESCE(r.RouteName, d.Name, 'Route ' + d.BusNumber) AS Route,
        d.IsActive,
        CASE WHEN b.BusNo IS NOT NULL THEN 1 ELSE 0 END AS IsOnline
      FROM CW_Drivers d
      LEFT JOIN CW_Routes r ON r.BusNumber = d.BusNumber
      LEFT JOIN CW_BusLocation b ON CAST(b.BusNo AS NVARCHAR(10)) = d.BusNumber
      WHERE TRY_CAST(d.BusNumber AS INT) IS NOT NULL
      ORDER BY CAST(d.BusNumber AS INT)
    `;

    const queryWithoutOnline = `
      SELECT 
        CAST(d.BusNumber AS INT) AS BusNo,
        d.BusNumber,
        d.LicenseNumber AS Registration,
        COALESCE(r.RouteName, d.Name, 'Route ' + d.BusNumber) AS Route,
        d.IsActive,
        0 AS IsOnline
      FROM CW_Drivers d
      LEFT JOIN CW_Routes r ON r.BusNumber = d.BusNumber
      WHERE TRY_CAST(d.BusNumber AS INT) IS NOT NULL
      ORDER BY CAST(d.BusNumber AS INT)
    `;

    const result = await pool.request().query(
      hasBusLocation.recordset.length > 0 ? queryWithOnline : queryWithoutOnline
    );
    res.json({ buses: result.recordset });
  } catch (err) {
    console.error('Admin buses error:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// Update bus location (from DriverScreen)
app.post('/api/bus/location', async (req, res) => {
  const { busNo, lat, lng, speed } = req.body;
  try {
    await pool.request()
      .input('busNo', mssql.Int, busNo)
      .input('lat', mssql.Float, lat)
      .input('lng', mssql.Float, lng)
      .input('speed', mssql.Float, speed || 0)
      .query(`
        IF EXISTS (SELECT 1 FROM CW_BusLocation WHERE BusNo = @busNo)
        BEGIN
          UPDATE CW_BusLocation 
          SET Latitude = @lat, Longitude = @lng, Speed = @speed, UpdatedAt = GETDATE(), IsOnline = 1
          WHERE BusNo = @busNo
        END
        ELSE
        BEGIN
          INSERT INTO CW_BusLocation (BusNo, Latitude, Longitude, Speed, IsOnline)
          VALUES (@busNo, @lat, @lng, @speed, 1)
        END
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Driver disconnect
app.post('/api/bus/disconnect', async (req, res) => {
  const { busNo } = req.body;
  try {
    await pool.request()
      .input('busNo', mssql.Int, busNo)
      .query("DELETE FROM CW_BusLocation WHERE BusNo = @busNo");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all live buses
app.get('/api/buses/live', async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT L.*, D.Registration, D.Route 
      FROM CW_BusLocation L
      INNER JOIN CW_Drivers D ON L.BusNo = D.BusNo
      WHERE D.IsActive = 1
    `);
    res.json({ buses: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single bus location
app.get('/api/bus/:busNo/location', async (req, res) => {
  const { busNo } = req.params;
  try {
    const result = await pool.request()
      .input('busNo', mssql.Int, busNo)
      .query(`
        SELECT L.*, D.Registration, D.Route 
        FROM CW_BusLocation L
        INNER JOIN CW_Drivers D ON L.BusNo = D.BusNo
        WHERE L.BusNo = @busNo
      `);
    if (result.recordset.length > 0) {
      res.json({ online: true, bus: result.recordset[0] });
    } else {
      res.json({ online: false });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update bus (admin)
app.put('/api/admin/bus/:busNo', async (req, res) => {
  const { busNo } = req.params;
  const { registration, route, isActive } = req.body;
  try {
    const request = pool.request();
    let query = "UPDATE CW_Drivers SET ";
    let updates = [];
    if (registration !== undefined) {
      request.input('reg', mssql.NVarChar, registration);
      updates.push("Registration = @reg");
    }
    if (route !== undefined) {
      request.input('route', mssql.NVarChar, route);
      updates.push("Route = @route");
    }
    if (isActive !== undefined) {
      request.input('active', mssql.Bit, isActive ? 1 : 0);
      updates.push("IsActive = @active");
    }
    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });
    query += updates.join(", ") + " WHERE BusNo = @busNo";
    request.input('busNo', mssql.Int, busNo);
    await request.query(query);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bus location history
app.get('/api/bus/:busNo/history', async (req, res) => {
  const { busNo } = req.params;
  try {
    const result = await pool.request()
      .input('busNo', mssql.Int, busNo)
      .query("SELECT TOP 100 * FROM CW_LocationHistory WHERE BusNo = @busNo ORDER BY RecordedAt DESC");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================
// SEED CW_Drivers IF EMPTY
// ==================
async function seedDrivers() {
  try {
    const check = await pool.request()
      .query("SELECT COUNT(*) AS cnt FROM CW_Drivers");
    if (check.recordset[0].cnt === 0) {
      console.log("Seeding CW_Drivers...");
      await pool.request().query(`
        INSERT INTO CW_Drivers (BusNo, Registration, Route, IsActive) VALUES
        (2,  'TN63AJ8602', 'Neivasal', 1),
        (3,  'TN63AK1260', 'SS.Kottai', 1),
        (4,  'TN63AK1264', 'Illupakudi', 1),
        (6,  'TN63AJ8845', 'Senjai', 1),
        (7,  'TN63AL8220', 'Thirupathur Pudhu Theru', 1),
        (8,  'TN63AJ8903', 'Singampunari', 1),
        (9,  'TN63AL8156', 'Spare', 0),
        (11, 'TN63AL9236', 'Spare', 0),
        (12, 'TN63AJ8611', 'Spare', 0),
        (13, 'TN63AJ8570', 'Spare', 0),
        (14, 'TN63BA0058', 'Velangudi', 1),
        (15, 'TN63BA0204', 'Karaikudi', 1),
        (16, 'TN63BA3179', 'Eriyur', 1),
        (17, 'TN63BC3589', 'Akilmanai Thirupathur', 1),
        (18, 'TN63BC3805', 'Sembanur', 1),
        (19, 'TN63BD8042', 'Kotaiyur', 1),
        (20, 'TN63BE0936', 'Keelasevalpatti', 1),
        (34, 'TN55AC5864', 'Kallutimedu', 1),
        (50, 'TN55BC5526', 'Elanthaimangalam', 1)
      `);
      console.log("✅ CW_Drivers seeded with 19 buses.");
    }
  } catch (err) {
    console.error("Seed check (non-fatal):", err.message);
  }
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  await seedDrivers();
  console.log(`✅ CampusWay Server running on port ${PORT}`);
});
