const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*"
  }
});

const { google } = require('googleapis');
const SPREADSHEET_ID = 'YOUR_SHEET_ID';
const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: 'https://www.googleapis.com/auth/spreadsheets',
});

async function updateSheet() {
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Queue!A2:C',
    valueInputOption: 'RAW',
    resource: { values: queue.map((p, i) => [i+1, p.name, p.paid ? "Yes" : "No"]) }
  });
  
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'History!A2:C',
    valueInputOption: 'RAW',
    resource: { values: history.map(h => [h.players.join(", "), h.timestamp]) }
  });
}

async function loadInitialData() {
  const sheets = google.sheets({ version: 'v4', auth });
  const queueRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Queue!A2:C',
  });
  queue = queueRes.data.values.map(row => ({
    name: row[1],
    paid: row[2] === "Yes"
  }));
  
  const historyRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'History!A2:B',
  });
  history = historyRes.data.values.map(row => ({
    players: row[0].split(", "),
    timestamp: row[1]
  }));
}

loadInitialData();

let queue = [];
let history = [];
let currentlyPlaying = [];
let adminAuthenticated = false;
const adminPassword = "Nachi";

// Admin Login
io.on("connection", (socket) => {
  console.log("New client connected");
  io.emit("queueUpdate", queue);
  io.emit("playingUpdate", currentlyPlaying); // Send currently playing on connect

  socket.on("adminLogin", (password) => {
    if (password === adminPassword) {
      adminAuthenticated = true;
      socket.emit("loginSuccess");
    } else {
      socket.emit("loginFailed");
    }
  });

  // Add Player
  socket.on("addPlayer", (playerName) => {
    queue.push({ name: playerName, paid: false });
    io.emit("queueUpdate", queue);
  });

  // Swap Players
  socket.on("swapPlayers", ({ pos1, pos2 }) => {
    if (pos1 >= 0 && pos2 >= 0 && pos1 < queue.length && pos2 < queue.length) {
      [queue[pos1], queue[pos2]] = [queue[pos2], queue[pos1]];
      io.emit("queueUpdate", queue);
    }
  });

  // Delete Top Pair
  socket.on("deleteTopPair", () => {
    if (queue.length >= 2) {
      queue.splice(0, 2);
    } else if (queue.length === 1) {
      queue.splice(0, 1);
    }
    io.emit("queueUpdate", queue);
  });

  // Delete Player by Position
  socket.on("deletePlayerByPosition", (pos) => {
    if (pos >= 0 && pos < queue.length) {
      queue.splice(pos, 1);
      io.emit("queueUpdate", queue);
    }
  });

  // Mark Player as Paid
  socket.on("markPlayerPaid", (pos) => {
    if (pos >= 0 && pos < queue.length) {
      queue[pos].paid = true;
      io.emit("queueUpdate", queue);
    }
  });

  // Display Current Pair
  socket.on("displayCurrentPair", () => {
    if (queue.length >= 2) {
      socket.emit("displayCurrentPair", [queue[0].name, queue[1].name]);
    } else {
      socket.emit("displayCurrentPair", [], []);
    }
  });
  // Next Pair Playing - Replace Current Pair
  socket.on("nextPairPlaying", () => {
    if (queue.length >= 2) {
      const pair = queue.splice(0, 2); // Get top 2 players
  
      // Replace current pair if already playing
      if (currentlyPlaying.length > 0) {
        currentlyPlaying = []; // Clear existing pair
        history.push({
          players: currentlyPlaying.map(p => p.name),
          timestamp: new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })
      }
      currentlyPlaying = pair; // Add new pair to currently playing
      io.emit("queueUpdate", queue);
      io.emit("playingUpdate", currentlyPlaying);
      io.emit("historyUpdate", history);
      updateSheet();
    } else {
      socket.emit("errorMessage", "Not enough players in the queue.");
    }
  });

  // Clear Currently Playing
  socket.on("deleteCurrentlyPlaying", () => {
  if(currentlyPlaying.length > 0) {
    history.push({
      players: currentlyPlaying.map(p => p.name),
      timestamp: new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })
    });
    currentlyPlaying = [];
    io.emit("playingUpdate", currentlyPlaying);
    io.emit("historyUpdate", history);
    updateSheet();
  }
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
