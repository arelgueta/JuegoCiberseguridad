const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const session = require('express-session');
const { createServer } = require('node:http');
const { Server } = require('socket.io');

const q = require('./queries');
const sesionMod = require('./sesion');
const pistas = require('./pistas');
const { CASOS } = require('./db');
const { CATEGORIAS } = require('./categorias');

const PORT = process.env.PORT || 3000;
const ALFABETO_PASSWORD_EQUIPO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'brecha-dev-session-secret',
  resave: false,
  saveUninitialized: false,
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, '..', 'public')));

io.engine.use(sessionMiddleware);

function esDocente(req) {
  return req.session.esDocente === true;
}

function esEquipoAutenticado(req, id) {
  return Number(req.session.equipoId) === Number(id);
}

function generarPasswordEquipo() {
  return Array.from({ length: 6 }, () => (
    ALFABETO_PASSWORD_EQUIPO[crypto.randomInt(ALFABETO_PASSWORD_EQUIPO.length)]
  )).join('');
}

function equipoPublico(equipo) {
  const { password_hash: _passwordHash, ...publico } = equipo;
  return publico;
}

function rechazarNoAutorizado(req, res) {
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'No autorizado.' });
    return false;
  }
  res.redirect('/equipo');
  return false;
}

function protegerDocente(req, res, next) {
  if (!esDocente(req)) {
    res.status(401).json({ error: 'No autorizado.' });
    return false;
  }
  next();
  return true;
}

function estadoPublico() {
  return { equipos: q.listEquipos(), sesion: sesionMod.getSesionPublica() };
}

function emitirEstado() {
  io.emit('estado:actualizado', estadoPublico());
}

io.on('connection', (socket) => {
  socket.emit('estado:actualizado', estadoPublico());

  socket.on('equipo:unirse', (equipoId) => {
    const id = Number(socket.request.session && socket.request.session.equipoId);
    const equipo = q.getEquipo(id);
    if (!equipo) {
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
  if (!esDocente(req)) {
    res.render('docente', {
      autenticado: false,
      configurada: Boolean(q.getDocentePasswordHash()),
      error: null,
    });
    return;
  }
  res.render('docente', {
    autenticado: true,
    equipos: q.listEquipos(),
    sesion: sesionMod.getSesionDocente(),
    casos: CASOS,
  });
});

app.post('/docente/registrar', async (req, res) => {
  if (q.getDocentePasswordHash()) {
    res.redirect('/docente');
    return;
  }
  const password = String(req.body.password || '');
  const confirmacion = String(req.body.confirmacion || '');
  if (!password || password !== confirmacion) {
    res.status(400).render('docente', {
      autenticado: false,
      configurada: false,
      error: 'Las contraseñas deben coincidir y no estar vacías.',
    });
    return;
  }
  q.setDocentePasswordHash(await bcrypt.hash(password, 10));
  req.session.esDocente = true;
  res.redirect('/docente');
});

app.post('/docente/login', async (req, res) => {
  const hash = q.getDocentePasswordHash();
  if (hash && req.body.password && await bcrypt.compare(req.body.password, hash)) {
    req.session.esDocente = true;
    res.redirect('/docente');
    return;
  }
  res.status(401).render('docente', {
    autenticado: false,
    configurada: true,
    error: 'Contraseña incorrecta.',
  });
});

app.post('/docente/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/docente'));
});

app.get('/api/sesion', (req, res) => {
  if (!protegerDocente(req, res, () => {})) return;
  res.json(sesionMod.getSesionDocente());
});

app.post('/api/equipos', protegerDocente, async (req, res) => {
  try {
    const password = generarPasswordEquipo();
    const passwordHash = await bcrypt.hash(password, 10);
    const equipo = q.crearEquipo(req.body.nombre, passwordHash);
    emitirEstado();
    res.json({ ok: true, equipo: equipoPublico(equipo), password });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/equipos/:id/editar', protegerDocente, (req, res) => {
  try {
    const presupuesto = Number(req.body.presupuesto);
    const reputacion = Number(req.body.reputacion);
    if (!Number.isFinite(presupuesto) || !Number.isFinite(reputacion)) {
      throw new Error('Presupuesto y reputación deben ser números.');
    }
    q.editarEquipo(Number(req.params.id), { presupuesto, reputacion });
    if (req.body.password) {
      if (String(req.body.password).length < 4) {
        throw new Error('La contraseña del equipo debe tener al menos 4 caracteres.');
      }
      q.cambiarPassword(Number(req.params.id), bcrypt.hashSync(String(req.body.password), 10));
    }
    emitirEstado();
    res.json({ ok: true, equipo: equipoPublico(q.getEquipo(Number(req.params.id))) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/equipos/:id/password', protegerDocente, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const password = generarPasswordEquipo();
    q.cambiarPassword(id, await bcrypt.hash(password, 10));
    res.json({ ok: true, password });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/reset', (req, res) => {
  if (!protegerDocente(req, res, () => {})) return;
  q.reiniciarPartida();
  emitirEstado();
  res.json({ ok: true });
});

app.post('/api/borrar-todo', (req, res) => {
  if (!protegerDocente(req, res, () => {})) return;
  if (req.body.confirmacion !== 'BORRAR') {
    res.status(400).json({ error: 'Hay que escribir la palabra BORRAR para confirmar.' });
    return;
  }
  q.borrarTodo();
  emitirEstado();
  res.json({ ok: true });
});

app.post('/api/sesion/duracion', (req, res) => {
  if (!protegerDocente(req, res, () => {})) return;
  try {
    const sesion = sesionMod.setDuracionRonda(req.body.segundos);
    res.json({ ok: true, sesion });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sesion/sortear', (req, res) => {
  if (!protegerDocente(req, res, () => {})) return;
  try {
    const sesion = sesionMod.sortearYComenzar();
    emitirEstado();
    res.json({ ok: true, sesion });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sesion/siguiente-ronda', (req, res) => {
  if (!protegerDocente(req, res, () => {})) return;
  try {
    const sesion = sesionMod.siguienteRonda();
    emitirEstado();
    res.json({ ok: true, sesion });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sesion/cerrar-ronda', (req, res) => {
  if (!protegerDocente(req, res, () => {})) return;
  try {
    const resultado = sesionMod.cerrarRonda();
    emitirEstado();
    res.json({ ok: true, resultado, sesion: sesionMod.getSesionDocente() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/sesion/confirmar', (req, res) => {
  if (!protegerDocente(req, res, () => {})) return;
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
  res.render('equipo-selector', { equipos: q.listEquipos(), error: null });
});

app.post('/equipo/login', async (req, res) => {
  const id = Number(req.body.equipo_id);
  const equipo = q.getEquipo(id);
  const password = String(req.body.password || '');
  const correcto = equipo && equipo.password_hash && await bcrypt.compare(password, equipo.password_hash);
  if (!correcto) {
    res.status(401).render('equipo-selector', {
      equipos: q.listEquipos(),
      error: 'Equipo o contraseña incorrectos.',
    });
    return;
  }
  req.session.equipoId = id;
  req.session.save(() => res.redirect(`/equipo/${id}`));
});

app.get('/equipo/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!esEquipoAutenticado(req, id)) {
    res.redirect('/equipo');
    return;
  }
  const existe = q.getEquipo(id);
  if (!existe) {
    res.status(404).send('Equipo no encontrado.');
    return;
  }
  const equipo = q.listEquipos().find((e) => e.id === id);
  res.render('equipo', {
    equipo,
    herramientas: q.catalogoVisiblePorEquipo(id),
    compradas: q.listComprasPorEquipo(id),
    categorias: CATEGORIAS,
    sesion: sesionMod.getSesionPublica(),
    pista: pistas.getPistaConMensaje(id),
  });
});

// SPEC8.md: el catálogo visible para un equipo se filtra server-side por lo que ya
// desbloqueó (no alcanza con ocultarlo en el cliente). Punto de extensión "no documentado"
// de SPEC9.md, a propósito confinado a este handler — ni el HTML ni el JS servidos al
// navegador mencionan `completo` ni `secreto` en ningún lado; quien lo encuentra, lo
// encuentra mirando la pestaña de Red, no leyendo la interfaz.
app.get('/api/equipos/:id/catalogo', (req, res) => {
  const id = Number(req.params.id);
  if (!esEquipoAutenticado(req, id)) {
    rechazarNoAutorizado(req, res);
    return;
  }
  const equipo = q.getEquipo(id);
  if (!equipo) {
    res.status(404).json({ error: 'Equipo no encontrado.' });
    return;
  }
  if (req.query.completo === '1') {
    res.json({
      catalogo: q.listHerramientas(),
      secreto:
        "Vale por 20 unidades extra de presupuesto. Andá a buscar al profesor y decile la palabra clave: '¿qué se hace en un momento de tanta incertidumbre? ¿acaso debemos jugar al Mario Bros?'",
    });
    return;
  }
  res.json({ catalogo: q.catalogoVisiblePorEquipo(id) });
});

app.post('/api/equipos/:id/comprar', (req, res) => {
  if (!esEquipoAutenticado(req, req.params.id)) {
    rechazarNoAutorizado(req, res);
    return;
  }
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
  if (!esEquipoAutenticado(req, req.params.id)) {
    rechazarNoAutorizado(req, res);
    return;
  }
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
  return q.listNoticiasPorCaso(casoNumero).map((n) => ({ titulo: n.titulo, descripcion: n.descripcion, fuente: n.fuente }));
}

app.get('/proyector-noticias', (req, res) => {
  const sesion = sesionMod.getSesionPublica();
  const noticias = sesion.casoActivo ? noticiasPublicas(sesion.casoActivo.numero) : [];
  res.render('proyector-noticias', { sesion, noticias, equipos: q.listEquipos() });
});

app.get('/api/noticias/:casoNumero', (req, res) => {
  res.json({ noticias: noticiasPublicas(Number(req.params.casoNumero)) });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`BRECHA escuchando en 0.0.0.0:${PORT}`);
});

module.exports = { app, httpServer, io, emitirEstado };
