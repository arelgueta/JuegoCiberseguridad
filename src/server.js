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

app.get('/docente', (req, res) => {
  res.render('docente', { equipos: q.listEquipos() });
});

app.post('/api/equipos', (req, res) => {
  try {
    const equipo = q.crearEquipo(req.body.nombre);
    emitirEstado();
    res.json({ ok: true, equipo });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/equipos/:id/editar', (req, res) => {
  try {
    const presupuesto = Number(req.body.presupuesto);
    const reputacion = Number(req.body.reputacion);
    if (!Number.isFinite(presupuesto) || !Number.isFinite(reputacion)) {
      throw new Error('Presupuesto y reputación deben ser números.');
    }
    const equipo = q.editarEquipo(Number(req.params.id), { presupuesto, reputacion });
    emitirEstado();
    res.json({ ok: true, equipo });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/reset', (req, res) => {
  q.resetSimulacion();
  emitirEstado();
  res.json({ ok: true });
});

app.post('/api/casos', (req, res) => {
  try {
    const { equipoId, casoNumero, ruta, deltaPresupuesto, deltaReputacion, vulnerable } = req.body;
    const casoNumeroNum = Number(casoNumero);
    if (!Number.isInteger(casoNumeroNum) || casoNumeroNum < 1 || casoNumeroNum > 10) {
      throw new Error('El número de caso debe ser un entero entre 1 y 10.');
    }
    const equipo = q.cargarCaso({
      equipoId: Number(equipoId),
      casoNumero: casoNumeroNum,
      ruta,
      deltaPresupuesto: Number(deltaPresupuesto),
      deltaReputacion: Number(deltaReputacion),
      vulnerable: Boolean(vulnerable),
    });
    emitirEstado();
    res.json({ ok: true, equipo });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`BRECHA escuchando en 0.0.0.0:${PORT}`);
});

module.exports = { app, httpServer, io, emitirEstado };
