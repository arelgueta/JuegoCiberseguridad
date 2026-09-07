const { db, CATEGORIAS_AMENAZA } = require('./db');
const sesion = require('./sesion');
const pistas = require('./pistas');

function puntaje(equipo) {
  return equipo.reputacion + equipo.presupuesto / 2;
}

function tieneAlgunaVulnerable(equipoId) {
  return !!db
    .prepare('SELECT 1 FROM vulnerabilidades WHERE equipo_id = ? AND vulnerable_desde_caso IS NOT NULL')
    .get(equipoId);
}

function listEquipos() {
  const equipos = db.prepare(
    'SELECT id, nombre, presupuesto, reputacion, creado_en FROM equipos ORDER BY nombre'
  ).all();
  const compras = db.prepare('SELECT equipo_id, herramienta_id FROM compras').all();
  const herramientasPorEquipo = new Map();
  for (const c of compras) {
    if (!herramientasPorEquipo.has(c.equipo_id)) {
      herramientasPorEquipo.set(c.equipo_id, []);
    }
    herramientasPorEquipo.get(c.equipo_id).push(c.herramienta_id);
  }
  const sesionRaw = sesion.getSesionRaw();
  return equipos.map((e) => ({
    ...e,
    puntaje: puntaje(e),
    herramientas: herramientasPorEquipo.get(e.id) || [],
    vulnerable: tieneAlgunaVulnerable(e.id),
    reaccionoEstaRonda: sesionRaw.ronda_numero >= 1 ? sesion.reacciono(e.id, sesionRaw.ronda_numero) : false,
  }));
}

function getEquipo(id) {
  return db.prepare('SELECT * FROM equipos WHERE id = ?').get(id);
}

function getDocentePasswordHash() {
  return db.prepare('SELECT docente_password_hash FROM configuracion WHERE id = 1').get()
    .docente_password_hash;
}

function setDocentePasswordHash(passwordHash) {
  db.prepare('UPDATE configuracion SET docente_password_hash = ? WHERE id = 1').run(passwordHash);
}

const crearEquipoTx = db.transaction((nombre, passwordHash) => {
  const info = db.prepare(
    'INSERT INTO equipos (nombre, password_hash, presupuesto, reputacion) VALUES (?, ?, 30, 20)'
  ).run(nombre, passwordHash);
  const equipoId = info.lastInsertRowid;
  const seedVulnerabilidad = db.prepare(
    'INSERT OR IGNORE INTO vulnerabilidades (equipo_id, categoria, vulnerable_desde_caso) VALUES (?, ?, NULL)'
  );
  for (const categoria of CATEGORIAS_AMENAZA) {
    seedVulnerabilidad.run(equipoId, categoria);
  }
  return equipoId;
});

function crearEquipo(nombre, passwordHash) {
  const nombreLimpio = String(nombre || '').trim();
  if (!nombreLimpio) {
    throw new Error('El nombre del equipo no puede estar vacío.');
  }
  if (!passwordHash) {
    throw new Error('La contraseña del equipo es obligatoria.');
  }
  const equipoId = crearEquipoTx(nombreLimpio, passwordHash);
  return getEquipo(equipoId);
}

function editarEquipo(id, { presupuesto, reputacion }) {
  const equipo = getEquipo(id);
  if (!equipo) {
    throw new Error('Equipo no encontrado.');
  }
  db.prepare('UPDATE equipos SET presupuesto = ?, reputacion = ? WHERE id = ?').run(
    presupuesto,
    reputacion,
    id
  );
  return getEquipo(id);
}

function cambiarPassword(id, passwordHash) {
  const equipo = getEquipo(id);
  if (!equipo) {
    throw new Error('Equipo no encontrado.');
  }
  db.prepare('UPDATE equipos SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

const reiniciarPartidaTx = db.transaction(() => {
  db.prepare('DELETE FROM compras').run();
  db.prepare('DELETE FROM registro_casos').run();
  db.prepare('DELETE FROM reacciones').run();
  db.prepare('DELETE FROM pistas_auditoria').run();
  db.prepare('UPDATE vulnerabilidades SET vulnerable_desde_caso = NULL').run();
  db.prepare('UPDATE equipos SET presupuesto = 30, reputacion = 20').run();
  sesion.reiniciarSesion();
});

function reiniciarPartida() {
  reiniciarPartidaTx();
}

const borrarTodoTx = db.transaction(() => {
  db.prepare('DELETE FROM compras').run();
  db.prepare('DELETE FROM registro_casos').run();
  db.prepare('DELETE FROM reacciones').run();
  db.prepare('DELETE FROM pistas_auditoria').run();
  db.prepare('DELETE FROM vulnerabilidades').run();
  db.prepare('DELETE FROM equipos').run();
  sesion.reiniciarSesion();
});

function borrarTodo() {
  borrarTodoTx();
}

function listNoticiasPorCaso(casoNumero) {
  return db.prepare('SELECT * FROM noticias WHERE caso_numero = ? ORDER BY id').all(casoNumero);
}

function listHerramientas() {
  return db.prepare('SELECT * FROM herramientas ORDER BY categoria, nombre').all();
}

// SPEC8.md: una carta de nivel 2/3 no debe aparecer en absoluto (no solo deshabilitada)
// hasta que el equipo tenga registrado el uso de la carta de la que depende.
function catalogoVisiblePorEquipo(equipoId) {
  const compradas = new Set(listComprasPorEquipo(equipoId));
  return listHerramientas().filter((h) => !h.requiere || compradas.has(h.requiere));
}

function getHerramienta(id) {
  return db.prepare('SELECT * FROM herramientas WHERE id = ?').get(id);
}

function listComprasPorEquipo(equipoId) {
  return db
    .prepare('SELECT herramienta_id FROM compras WHERE equipo_id = ?')
    .all(equipoId)
    .map((r) => r.herramienta_id);
}

const usarHerramientaTx = db.transaction((equipoId, herramientaId) => {
  const equipo = getEquipo(equipoId);
  if (!equipo) {
    throw new Error('Equipo no encontrado.');
  }
  const herramienta = getHerramienta(herramientaId);
  if (!herramienta) {
    throw new Error('Herramienta no encontrada.');
  }
  if (sesion.getSesionRaw().ronda_estado !== 'activa') {
    throw new Error('Esperando a que el docente inicie la próxima ronda.');
  }
  if (herramienta.requiere) {
    const tieneRequisito = db
      .prepare('SELECT 1 FROM compras WHERE equipo_id = ? AND herramienta_id = ?')
      .get(equipoId, herramienta.requiere);
    if (!tieneRequisito) {
      const requisito = getHerramienta(herramienta.requiere);
      throw new Error(`Primero necesitás ${requisito ? requisito.nombre : herramienta.requiere}.`);
    }
  }
  const yaUsada = db
    .prepare('SELECT 1 FROM compras WHERE equipo_id = ? AND herramienta_id = ?')
    .get(equipoId, herramientaId);
  if (yaUsada) {
    throw new Error('El equipo ya está utilizando esa herramienta.');
  }
  if (equipo.presupuesto < herramienta.costo) {
    throw new Error('Presupuesto insuficiente.');
  }
  db.prepare(
    'INSERT INTO compras (equipo_id, herramienta_id, costo_pagado) VALUES (?, ?, ?)'
  ).run(equipoId, herramientaId, herramienta.costo);
  db.prepare('UPDATE equipos SET presupuesto = presupuesto - ? WHERE id = ?').run(
    herramienta.costo,
    equipoId
  );
  return getEquipo(equipoId);
});

function usarHerramienta(equipoId, herramientaId) {
  const equipo = usarHerramientaTx(equipoId, herramientaId);
  let pista = null;
  if (herramientaId === 'programa-auditoria-interna') {
    pista = pistas.generarPista(equipoId);
  } else if (herramientaId === 'auditoria-automatizacion-reportes') {
    pista = pistas.ampliarPistaConSegundaCategoria(equipoId);
  }
  return { equipo, pista };
}

module.exports = {
  listEquipos,
  getEquipo,
  getDocentePasswordHash,
  setDocentePasswordHash,
  crearEquipo,
  editarEquipo,
  cambiarPassword,
  reiniciarPartida,
  borrarTodo,
  listHerramientas,
  catalogoVisiblePorEquipo,
  getHerramienta,
  listComprasPorEquipo,
  listNoticiasPorCaso,
  usarHerramienta,
};
