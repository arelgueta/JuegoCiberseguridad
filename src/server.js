const path = require('node:path');
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');

const q = require('./queries');
const sesionMod = require('./sesion');
const pistas = require('./pistas');
const { CASOS } = require('./db');
const { CATEGORIAS } = require('./categorias');

const PORT = process.env.PORT || 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function estadoPublico() {
  return { equipos: q.listEquipos(), sesion: sesionMod.getSesionPublica() };
}

function emitirEstado() {
  io.emit('estado:actualizado', estadoPublico());
}

io.on('connection', (socket) => {
  socket.emit('estado:actualizado', estadoPublico());

  socket.on('equipo:unirse', (equipoId) => {
    const id = Number(equipoId);
    const equipo = q.getEquipo(id);
    if (!equipo) {
      return;
    }
    // Sin autenticación de equipos (fuera de alcance), una conexión de socket queda atada
    // al primer equipo con el que se identifica. Así, alguien que ya está en la sala de un
    // equipo no puede unirse "a propósito" a la sala de otro desde la misma conexión.
    if (socket.data.equipoId !== undefined && socket.data.equipoId !== id) {
      return;
    }
    socket.data.equipoId = id;
    socket.join(`equipo:${id}`);
  });
});

// Cierra automáticamente la ronda activa si se venció el cronómetro (server-side,
// no depende del reloj de ningún cliente).
setInterval(() => {
  const resultado = sesionMod.verificarYCerrarSiVencio();
  if (resultado) {
    emitirEstado();
  }
}, 1000);

app.get('/salud', (req, res) => {
  res.json({ ok: true });
});

app.get('/docente', (req, res) => {
  res.render('docente', {
    equipos: q.listEquipos(),
    sesion: sesionMod.getSesionDocente(),
    casos: CASOS,
  });
});

app.get('/api/sesion', (req, res) => {
  res.json(sesionMod.getSesionDocente());
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
  q.reiniciarPartida();
  emitirEstado();
  res.json({ ok: true });
});

app.post('/api/borrar-todo', (req, res) => {
  if (req.body.confirmacion !== 'BORRAR') {
    res.status(400).json({ error: 'Hay que escribir la palabra BORRAR para confirmar.' });
    return;
  }
  q.borrarTodo();
  emitirEstado();
  res.json({ ok: true });
});

app.post('/api/sesion/duracion', (req, res) => {
  try {
    const sesion = sesionMod.setDuracionRonda(req.body.segundos);
    res.json({ ok: true, sesion });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sesion/sortear', (req, res) => {
  try {
    const sesion = sesionMod.sortearYComenzar();
    emitirEstado();
    res.json({ ok: true, sesion });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sesion/siguiente-ronda', (req, res) => {
  try {
    const sesion = sesionMod.siguienteRonda();
    emitirEstado();
    res.json({ ok: true, sesion });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sesion/cerrar-ronda', (req, res) => {
  try {
    const resultado = sesionMod.cerrarRonda();
    emitirEstado();
    res.json({ ok: true, resultado, sesion: sesionMod.getSesionDocente() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sesion/confirmar', (req, res) => {
  try {
    const resultado = sesionMod.confirmarResultados(req.body.ajustes || []);
    emitirEstado();
    for (const item of resultado) {
      io.to(`equipo:${item.equipoId}`).emit('resultado:caso', item);
    }
    res.json({ ok: true, resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/equipo', (req, res) => {
  res.render('equipo-selector', { equipos: q.listEquipos() });
});

app.get('/equipo/:id', (req, res) => {
  const id = Number(req.params.id);
  const existe = q.getEquipo(id);
  if (!existe) {
    res.status(404).send('Equipo no encontrado.');
    return;
  }
  const equipo = q.listEquipos().find((e) => e.id === id);
  res.render('equipo', {
    equipo,
    herramientas: q.listHerramientas(),
    compradas: q.listComprasPorEquipo(id),
    categorias: CATEGORIAS,
    sesion: sesionMod.getSesionPublica(),
    pista: pistas.getPistaConMensaje(id),
  });
});

app.post('/api/equipos/:id/comprar', (req, res) => {
  try {
    const { equipo, pista } = q.usarHerramienta(Number(req.params.id), req.body.herramienta_id);
    emitirEstado();
    if (pista) {
      io.to(`equipo:${equipo.id}`).emit('pista:auditoria', pista);
    }
    res.json({ ok: true, equipo, pista });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/equipos/:id/reaccionar', (req, res) => {
  try {
    const equipo = sesionMod.reaccionar(Number(req.params.id));
    emitirEstado();
    res.json({ ok: true, equipo });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/proyector', (req, res) => {
  res.render('proyector', { equipos: q.listEquipos(), sesion: sesionMod.getSesionPublica() });
});

function noticiasPublicas(casoNumero) {
  return q.listNoticiasPorCaso(casoNumero).map((n) => ({ titulo: n.titulo, descripcion: n.descripcion }));
}

app.get('/proyector-noticias', (req, res) => {
  const sesion = sesionMod.getSesionPublica();
  const noticias = sesion.casoActivo ? noticiasPublicas(sesion.casoActivo.numero) : [];
  res.render('proyector-noticias', { sesion, noticias });
});

app.get('/api/noticias/:casoNumero', (req, res) => {
  res.json({ noticias: noticiasPublicas(Number(req.params.casoNumero)) });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`BRECHA escuchando en 0.0.0.0:${PORT}`);
});

module.exports = { app, httpServer, io, emitirEstado };
