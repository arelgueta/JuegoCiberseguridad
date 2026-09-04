const path = require('node:path');
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');

const q = require('./queries');

const PORT = process.env.PORT || 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function emitirEstado() {
  io.emit('estado:actualizado', { equipos: q.listEquipos() });
}

io.on('connection', (socket) => {
  socket.emit('estado:actualizado', { equipos: q.listEquipos() });
});

app.get('/salud', (req, res) => {
  res.json({ ok: true });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`BRECHA escuchando en 0.0.0.0:${PORT}`);
});

module.exports = { app, httpServer, io, emitirEstado };
