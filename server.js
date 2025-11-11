import express from "express";
import session from "express-session";
import { createServer } from "http";
import { Server } from "socket.io";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000; // ✅ Railway otomatis kasih PORT

// ===== STATE =====
const STATE_FILE = "./state.json";
let state = {
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  running: false,
  incidents: [],
  startDate: new Date(),
  bestDays: 0,
};

if (fs.existsSync(STATE_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE));
  } catch (err) {
    console.error("⚠️ Gagal membaca file state:", err);
  }
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ===== APP CONFIG =====
app.use(express.json());
app.use(express.static("public"));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "default_secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 6 },
  })
);

// ===== ROUTES =====
app.get("/", (req, res) => {
  res.sendFile("viewer.html", { root: "public" });
});

app.get("/admin", (req, res) => {
  res.sendFile("admin.html", { root: "public" });
});

app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASS) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: "Password salah!" });
  }
});

app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get("/admin/check", (req, res) => {
  res.json({ loggedIn: !!req.session.isAdmin });
});

// ===== SOCKET.IO =====
io.on("connection", (socket) => {
  socket.emit("update", getPublicState());

  socket.on("start", () => {
    state.running = true;
    saveState();
    io.emit("update", getPublicState());
  });

  socket.on("stop", () => {
    state.running = false;
    saveState();
    io.emit("update", getPublicState());
  });

  socket.on("reset", () => {
    state = { ...state, days: 0, hours: 0, minutes: 0, seconds: 0, running: false };
    saveState();
    io.emit("update", getPublicState());
  });

  socket.on("addIncident", (note) => {
    const incident = { id: Date.now(), date: new Date(), note };
    state.incidents.push(incident);
    state.bestDays = Math.max(state.bestDays, state.days);
    state.days = 0;
    state.hours = 0;
    state.minutes = 0;
    state.seconds = 0;
    saveState();
    io.emit("update", getPublicState());
  });

  socket.on("deleteIncident", (id) => {
    state.incidents = state.incidents.filter((inc) => inc.id !== id);
    saveState();
    io.emit("update", getPublicState());
  });
});

function getPublicState() {
  return {
    days: state.days,
    hours: state.hours,
    minutes: state.minutes,
    seconds: state.seconds,
    running: state.running,
    incidents: state.incidents,
    incidentsCount: state.incidents.length,
    bestDays: state.bestDays,
    startDate: state.startDate,
  };
}

// ===== TIMER =====
setInterval(() => {
  if (state.running) {
    state.seconds++;
    if (state.seconds >= 60) {
      state.seconds = 0;
      state.minutes++;
    }
    if (state.minutes >= 60) {
      state.minutes = 0;
      state.hours++;
    }
    if (state.hours >= 24) {
      state.hours = 0;
      state.days++;
    }
    saveState();
    io.emit("update", getPublicState());
  }
}, 1000);

// ✅ Jalankan server
server.listen(PORT, () => {
  console.log(`✅ Safety Scoreboard berjalan di port ${PORT}`);
  console.log("🌐 Akses scoreboard kamu di browser Railway setelah deploy ulang 🚀");
});
