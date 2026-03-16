const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mssql = require('mssql');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
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
  user: 'facultyschedule',
  password: 'Wise@3908',
  server: '103.207.1.87',
  database: 'facultyschedule',
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
// ADMIN ROUTES
// ==================

// Dashboard stats
app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const students = await pool.request()
      .query('SELECT COUNT(*) as count FROM dbo.CW_Students');

    const drivers = await pool.request()
      .query('SELECT COUNT(*) as count FROM dbo.CW_Drivers');

    const activeTrips = await pool.request()
      .query(`SELECT COUNT(*) as count FROM dbo.CW_Trips 
              WHERE Status = 'active'`);

    const totalTrips = await pool.request()
      .query('SELECT COUNT(*) as count FROM dbo.CW_Trips');

    res.json({
      ok: true,
      data: {
        totalStudents: students.recordset[0].count,
        totalDrivers: drivers.recordset[0].count,
        activeTrips: activeTrips.recordset[0].count,
        totalTrips: totalTrips.recordset[0].count
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get all checkins
app.get('/api/admin/checkins', async (req, res) => {
  try {
    const result = await pool.request()
      .query(`
        SELECT TOP 100 * FROM dbo.CW_DriverCheckins
        ORDER BY CreatedAt DESC
      `);
    res.json({ ok: true, data: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`✅ CampusWay Server running on port ${PORT}`);
});