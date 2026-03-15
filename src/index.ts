import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sql from 'mssql';

dotenv.config();
console.log("🚀 Starting server...");

const app = express();
app.use(cors());
app.use(express.json());

// SQL Server config
const dbConfig: sql.config = {
  server: '103.207.1.87',
  port: 1433,
  database: 'facultyschedule',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  }
};

// Test connection
async function connectDB() {
  try {
    await sql.connect(dbConfig);
    console.log('✅ SQL Server connected!');
  } catch (err) {
    console.error('❌ DB Error:', err);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'CampusWay API running!'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  connectDB();
});
