const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());

const allowedOrigins = ['http://192.168.149.195:3000', 'http://localhost:3000'];

app.use(cors({
  origin: ['http://localhost:3000', 'http://192.168.149.195:3000'], // آدرس‌های کلاینت
  credentials: true
}));

// app.options('*', cors(corsOptions)); // این خط باید بعد از app.use(cors()) بیاد
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    cors(corsOptions)(req, res, next);
  } else {
    next();
  }
});


const session = require('express-session');
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: false,  // به این حالت باشه بهتره (کوکی فقط وقتی که داده‌ای داخل سشن هست ارسال میشه)
  cookie: {
    httpOnly: true,
    secure: false, // اگر روی لوکال و بدون HTTPS هستی باید false باشه
    maxAge: 24 * 60 * 60 * 1000 // یک روز اعتبار
  }
}));
app.use(express.static(path.join(__dirname, '../client')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client', 'index.html'));
});

// اتصال به دیتابیس SQLite
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
  if (err) {
    console.error('خطا در اتصال به دیتابیس:', err.message);
  } else {
    console.log('اتصال به دیتابیس موفق بود');
  }
});

// ایجاد جداول در صورت عدم وجود
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      role TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id)
    )
  `);
});

// ساخت جدول مدیران
db.run(`CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT
)`);

// افزودن یک مدیر پیش‌فرض (یک‌بار اجرا میشه)
db.get(`SELECT * FROM admins WHERE username = ?`, ['admin'], (err, row) => {
  if (!row) {
    db.run(`INSERT INTO admins (username, password) VALUES (?, ?)`, ['admin', '123456']);
  }
});

// API برای افزودن کاربر
app.post('/api/users', (req, res) => {
  const { name, phone, role } = req.body;
  if (!name || !phone || !role) {
    return res.status(400).json({ error: 'تمام فیلدها باید پر شوند' });
  }
  const stmt = db.prepare('INSERT INTO users (name, phone, role) VALUES (?, ?, ?)');
  stmt.run(name, phone, role, function (err) {
    if (err) {
      res.status(500).json({ error: 'خطا در ثبت کاربر' });
    } else {
      res.json({ id: this.lastID });
    }
  });
  stmt.finalize();
});

// API برای دریافت لیست کاربران
app.get('/api/users', (req, res) => {
  db.all('SELECT * FROM users', (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'خطا در دریافت کاربران' });
    } else {
      res.json(rows);
    }
  });
});

// API برای افزودن نظر
app.post('/api/feedback', (req, res) => {
  const { userId, comment } = req.body;
  if (!userId || !comment) {
    return res.status(400).json({ error: 'تمام فیلدها باید پر شوند' });
  }
  const stmt = db.prepare('INSERT INTO feedback (userId, comment) VALUES (?, ?)');
  stmt.run(userId, comment, function (err) {
    if (err) {
      res.status(500).json({ error: 'خطا در ثبت نظر' });
    } else {
      res.json({ success: true });
    }
  });
  stmt.finalize();
});

// API برای دریافت نظرات
app.get('/api/feedback', (req, res) => {
  db.all(
    `SELECT feedback.id, feedback.comment, feedback.created_at, users.name AS userName
     FROM feedback
     JOIN users ON feedback.userId = users.id
     ORDER BY feedback.created_at DESC`,
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: 'خطا در دریافت نظرات' });
      } else {
        res.json(rows);
      }
    }
  );
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(
    'SELECT * FROM admins WHERE username = ? AND password = ?',
    [username, password],
    (err, admin) => {
      if (err) return res.status(500).json({ error: err.message });

      if (admin) {
        req.session.adminId = admin.id; // اینجا ذخیره کن
        res.json({ success: true });
      } else {
        res.json({ success: false, message: 'نام کاربری یا رمز اشتباه است' });
      }
    }
  );
});

app.get('/api/check-login', (req, res) => {
  console.log(req.session.adminId);
  
  if (req.session.adminId) {
    res.json({ loggedIn: true });
  } else {
    res.json({ loggedIn: false });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`سرور در حال اجرا روی پورت ${PORT}`);
});
