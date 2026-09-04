const { db } = require('./db');

const RUTAS_VALIDAS = new Set(['preventiva', 'reactiva', 'omision']);

function puntaje(equipo) {
  return equipo.reputacion + equipo.presupuesto / 2;
}

function listEquipos() {
  const equipos = db.prepare('SELECT * FROM equipos ORDER BY nombre').all();
  return equipos.map((e) => ({ ...e, puntaje: puntaje(e) }));
}

function getEquipo(id) {
  return db.prepare('SELECT * FROM equipos WHERE id = ?').get(id);
}

function crearEquipo(nombre) {
  const nombreLimpio = String(nombre || '').trim();
  if (!nombreLimpio) {
    throw new Error('El nombre del equipo no puede estar vacío.');
  }
  const info = db
    .prepare('INSERT INTO equipos (nombre) VALUES (?)')
    .run(nombreLimpio);
  return getEquipo(info.lastInsertRowid);
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

const resetSimulacionTx = db.transaction(() => {
  db.prepare('DELETE FROM compras').run();
  db.prepare('DELETE FROM registro_casos').run();
  db.prepare('UPDATE equipos SET presupuesto = 20, reputacion = 20').run();
});

function resetSimulacion() {
  resetSimulacionTx();
}

function listHerramientas() {
  return db.prepare('SELECT * FROM herramientas ORDER BY categoria, nombre').all();
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

const comprarHerramientaTx = db.transaction((equipoId, herramientaId) => {
  const equipo = getEquipo(equipoId);
  if (!equipo) {
    throw new Error('Equipo no encontrado.');
  }
  const herramienta = getHerramienta(herramientaId);
  if (!herramienta) {
    throw new Error('Herramienta no encontrada.');
  }
  const yaComprada = db
    .prepare('SELECT 1 FROM compras WHERE equipo_id = ? AND herramienta_id = ?')
    .get(equipoId, herramientaId);
  if (yaComprada) {
    throw new Error('El equipo ya tiene esa herramienta.');
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

function comprarHerramienta(equipoId, herramientaId) {
  return comprarHerramientaTx(equipoId, herramientaId);
}

const cargarCasoTx = db.transaction((datos) => {
  const {
    equipoId,
    casoNumero,
    ruta,
    deltaPresupuesto,
    deltaReputacion,
    vulnerable,
  } = datos;

  const equipo = getEquipo(equipoId);
  if (!equipo) {
    throw new Error('Equipo no encontrado.');
  }
  if (!RUTAS_VALIDAS.has(ruta)) {
    throw new Error('Ruta inválida.');
  }

  db.prepare(
    `INSERT INTO registro_casos
      (equipo_id, caso_numero, ruta, delta_presupuesto, delta_reputacion, vulnerable)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(equipoId, casoNumero, ruta, deltaPresupuesto, deltaReputacion, vulnerable ? 1 : 0);

  db.prepare(
    'UPDATE equipos SET presupuesto = presupuesto + ?, reputacion = reputacion + ? WHERE id = ?'
  ).run(deltaPresupuesto, deltaReputacion, equipoId);

  return getEquipo(equipoId);
});

function cargarCaso(datos) {
  return cargarCasoTx(datos);
}

module.exports = {
  RUTAS_VALIDAS,
  listEquipos,
  getEquipo,
  crearEquipo,
  editarEquipo,
  resetSimulacion,
  listHerramientas,
  getHerramienta,
  listComprasPorEquipo,
  comprarHerramienta,
  cargarCaso,
};
