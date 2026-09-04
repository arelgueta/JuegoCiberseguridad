const { db } = require('./db');

function getSesionRaw() {
  return db.prepare('SELECT * FROM sesion WHERE id = 1').get();
}

function getCasoActivo(sesion) {
  if (!sesion.caso_actual) return null;
  const caso = db.prepare('SELECT * FROM casos WHERE numero = ?').get(sesion.caso_actual);
  return caso ? { numero: caso.numero, categoria: caso.categoria, titulo: caso.titulo } : null;
}

function getSesionPublica() {
  const sesion = getSesionRaw();
  return {
    rondaEstado: sesion.ronda_estado,
    rondaNumero: sesion.ronda_numero,
    rondaInicio: sesion.ronda_inicio,
    rondaDuracionSeg: sesion.ronda_duracion_seg,
    totalRondas: sesion.casos_sorteados ? JSON.parse(sesion.casos_sorteados).length : 0,
    casoActivo: getCasoActivo(sesion),
    pendienteConfirmacion: Boolean(sesion.resolucion_pendiente),
  };
}

function getSesionDocente() {
  const sesion = getSesionRaw();
  return {
    ...getSesionPublica(),
    casosSorteados: sesion.casos_sorteados ? JSON.parse(sesion.casos_sorteados) : [],
    resolucionPendiente: sesion.resolucion_pendiente ? JSON.parse(sesion.resolucion_pendiente) : null,
  };
}

function setDuracionRonda(segundos) {
  const sesion = getSesionRaw();
  if (sesion.ronda_estado !== 'inactiva') {
    throw new Error('Solo se puede configurar la duración antes de sortear y comenzar.');
  }
  const n = Number(segundos);
  if (!Number.isInteger(n) || n < 10 || n > 3600) {
    throw new Error('La duración debe ser un entero entre 10 y 3600 segundos.');
  }
  db.prepare('UPDATE sesion SET ronda_duracion_seg = ? WHERE id = 1').run(n);
  return getSesionDocente();
}

function elegirCasosAlAzar() {
  const disponibles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const elegidos = [];
  for (let i = 0; i < 5; i++) {
    const idx = Math.floor(Math.random() * disponibles.length);
    elegidos.push(disponibles.splice(idx, 1)[0]);
  }
  return elegidos;
}

function sortearYComenzar() {
  const sesion = getSesionRaw();
  if (sesion.ronda_estado !== 'inactiva') {
    throw new Error('La partida ya está en curso. Reiniciá antes de volver a sortear.');
  }
  const casosSorteados = elegirCasosAlAzar();
  const ahora = new Date().toISOString();
  db.prepare(`
    UPDATE sesion SET
      casos_sorteados = ?, ronda_numero = 0, caso_actual = NULL,
      ronda_estado = 'activa', ronda_inicio = ?, resolucion_pendiente = NULL
    WHERE id = 1
  `).run(JSON.stringify(casosSorteados), ahora);
  return getSesionDocente();
}

function siguienteRonda() {
  const sesion = getSesionRaw();
  if (sesion.ronda_estado !== 'resuelta' || sesion.resolucion_pendiente) {
    throw new Error('Hay que cerrar y confirmar la ronda activa antes de avanzar.');
  }
  const casosSorteados = JSON.parse(sesion.casos_sorteados || '[]');
  const siguienteNumero = sesion.ronda_numero + 1;
  if (siguienteNumero > casosSorteados.length) {
    db.prepare("UPDATE sesion SET ronda_estado = 'finalizada' WHERE id = 1").run();
    return getSesionDocente();
  }
  const casoActual = casosSorteados[siguienteNumero - 1];
  const ahora = new Date().toISOString();
  db.prepare(`
    UPDATE sesion SET ronda_numero = ?, caso_actual = ?, ronda_estado = 'activa', ronda_inicio = ?
    WHERE id = 1
  `).run(siguienteNumero, casoActual, ahora);
  return getSesionDocente();
}

function tieneHerramienta(equipoId, herramientaId) {
  return !!db
    .prepare('SELECT 1 FROM compras WHERE equipo_id = ? AND herramienta_id = ?')
    .get(equipoId, herramientaId);
}

function tieneCategoria(equipoId, categoria) {
  return !!db
    .prepare(
      `SELECT 1 FROM compras c JOIN herramientas h ON h.id = c.herramienta_id
       WHERE c.equipo_id = ? AND h.categoria = ?`
    )
    .get(equipoId, categoria);
}

function reacciono(equipoId, rondaNumero) {
  return !!db
    .prepare('SELECT 1 FROM reacciones WHERE equipo_id = ? AND ronda_numero = ?')
    .get(equipoId, rondaNumero);
}

function esVulnerable(equipoId, categoria) {
  const row = db
    .prepare('SELECT vulnerable_desde_caso FROM vulnerabilidades WHERE equipo_id = ? AND categoria = ?')
    .get(equipoId, categoria);
  return row ? row.vulnerable_desde_caso !== null : false;
}

function calcularResolucion(equipo, caso, rondaNumero) {
  const categoria = caso.categoria;
  const yaVulnerable = esVulnerable(equipo.id, categoria);
  let ruta;
  let deltaPresupuesto = 0;
  let deltaReputacion = 0;
  let vulnerableFinal;

  if (tieneCategoria(equipo.id, categoria)) {
    ruta = 'preventiva';
    deltaReputacion = caso.preventiva_reputacion;
    vulnerableFinal = false;
  } else if (reacciono(equipo.id, rondaNumero)) {
    ruta = 'reactiva';
    vulnerableFinal = false;
  } else if (tieneHerramienta(equipo.id, 'siem')) {
    ruta = 'reactiva';
    vulnerableFinal = false;
  } else {
    ruta = 'omision';
    let p = caso.omision_presupuesto;
    let r = caso.omision_reputacion;
    const tieneComite = tieneHerramienta(equipo.id, 'comite-gobierno');
    if (yaVulnerable && !tieneComite) {
      p *= 2;
      r *= 2;
    }
    if (tieneHerramienta(equipo.id, 'gestion-riesgos')) {
      p = Math.trunc(p * 0.7);
      r = Math.trunc(r * 0.7);
    }
    deltaPresupuesto = p;
    deltaReputacion = r;
    vulnerableFinal = true;
  }

  return {
    equipoId: equipo.id,
    equipoNombre: equipo.nombre,
    categoria,
    ruta,
    deltaPresupuesto,
    deltaReputacion,
    vulnerable: vulnerableFinal,
    yaVulnerableAntes: yaVulnerable,
  };
}

function cerrarRonda() {
  const sesion = getSesionRaw();
  if (sesion.ronda_estado !== 'activa') {
    throw new Error('No hay una ronda activa para cerrar.');
  }
  if (sesion.ronda_numero === 0) {
    db.prepare("UPDATE sesion SET ronda_estado = 'resuelta', resolucion_pendiente = NULL WHERE id = 1").run();
    return { tipo: 'momento0', resumen: null };
  }
  const caso = db.prepare('SELECT * FROM casos WHERE numero = ?').get(sesion.caso_actual);
  const equipos = db.prepare('SELECT * FROM equipos').all();
  const resumen = equipos.map((equipo) => calcularResolucion(equipo, caso, sesion.ronda_numero));
  db.prepare("UPDATE sesion SET ronda_estado = 'resuelta', resolucion_pendiente = ? WHERE id = 1").run(
    JSON.stringify(resumen)
  );
  return { tipo: 'caso', resumen };
}

function tiempoVencido(sesion) {
  if (!sesion.ronda_inicio) return false;
  const inicio = new Date(sesion.ronda_inicio).getTime();
  const limite = inicio + sesion.ronda_duracion_seg * 1000;
  return Date.now() >= limite;
}

function verificarYCerrarSiVencio() {
  const sesion = getSesionRaw();
  if (sesion.ronda_estado === 'activa' && tiempoVencido(sesion)) {
    return cerrarRonda();
  }
  return null;
}

const confirmarResultadosTx = db.transaction((pendiente, casoNumero, ajustesOverride) => {
  for (const item of pendiente) {
    const override = (ajustesOverride || []).find((a) => a.equipoId === item.equipoId) || {};
    const ruta = override.ruta || item.ruta;
    const deltaPresupuesto = Number.isFinite(override.deltaPresupuesto)
      ? override.deltaPresupuesto
      : item.deltaPresupuesto;
    const deltaReputacion = Number.isFinite(override.deltaReputacion)
      ? override.deltaReputacion
      : item.deltaReputacion;
    const vulnerable = typeof override.vulnerable === 'boolean' ? override.vulnerable : item.vulnerable;

    db.prepare('UPDATE equipos SET presupuesto = presupuesto + ?, reputacion = reputacion + ? WHERE id = ?').run(
      deltaPresupuesto,
      deltaReputacion,
      item.equipoId
    );

    db.prepare(
      `INSERT INTO registro_casos (equipo_id, caso_numero, ruta, delta_presupuesto, delta_reputacion, vulnerable)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(item.equipoId, casoNumero, ruta, deltaPresupuesto, deltaReputacion, vulnerable ? 1 : 0);

    if (vulnerable) {
      db.prepare(
        `INSERT INTO vulnerabilidades (equipo_id, categoria, vulnerable_desde_caso)
         VALUES (?, ?, ?)
         ON CONFLICT(equipo_id, categoria) DO UPDATE SET
           vulnerable_desde_caso = COALESCE(vulnerabilidades.vulnerable_desde_caso, excluded.vulnerable_desde_caso)`
      ).run(item.equipoId, item.categoria, casoNumero);
    } else {
      db.prepare(
        `INSERT INTO vulnerabilidades (equipo_id, categoria, vulnerable_desde_caso)
         VALUES (?, ?, NULL)
         ON CONFLICT(equipo_id, categoria) DO UPDATE SET vulnerable_desde_caso = NULL`
      ).run(item.equipoId, item.categoria);
    }
  }
  db.prepare('UPDATE sesion SET resolucion_pendiente = NULL WHERE id = 1').run();
});

function confirmarResultados(ajustesOverride) {
  const sesion = getSesionRaw();
  if (sesion.ronda_estado !== 'resuelta' || !sesion.resolucion_pendiente) {
    throw new Error('No hay una resolución pendiente de confirmación.');
  }
  const pendiente = JSON.parse(sesion.resolucion_pendiente);
  confirmarResultadosTx(pendiente, sesion.caso_actual, ajustesOverride);
  return pendiente;
}

function reaccionar(equipoId) {
  const sesion = getSesionRaw();
  if (sesion.ronda_estado !== 'activa' || sesion.ronda_numero < 1) {
    throw new Error('No hay una ronda de caso activa para reaccionar.');
  }
  const caso = db.prepare('SELECT * FROM casos WHERE numero = ?').get(sesion.caso_actual);
  const equipo = db.prepare('SELECT * FROM equipos WHERE id = ?').get(equipoId);
  if (!equipo) {
    throw new Error('Equipo no encontrado.');
  }
  if (tieneCategoria(equipoId, caso.categoria)) {
    throw new Error('El equipo ya está cubierto por una herramienta preventiva de esta categoría.');
  }
  if (reacciono(equipoId, sesion.ronda_numero)) {
    throw new Error('El equipo ya reaccionó en esta ronda.');
  }
  if (equipo.presupuesto < caso.costo_reactiva) {
    throw new Error('Presupuesto insuficiente para reaccionar.');
  }
  const aplicar = db.transaction(() => {
    db.prepare('UPDATE equipos SET presupuesto = presupuesto - ? WHERE id = ?').run(caso.costo_reactiva, equipoId);
    db.prepare('INSERT INTO reacciones (equipo_id, ronda_numero, costo_pagado) VALUES (?, ?, ?)').run(
      equipoId,
      sesion.ronda_numero,
      caso.costo_reactiva
    );
  });
  aplicar();
  return db.prepare('SELECT * FROM equipos WHERE id = ?').get(equipoId);
}

function puedeUsarFundacion() {
  const sesion = getSesionRaw();
  return sesion.ronda_numero === 0 && sesion.ronda_estado === 'activa';
}

function reiniciarSesion() {
  db.prepare(
    `UPDATE sesion SET caso_actual = NULL, ronda_estado = 'inactiva', ronda_inicio = NULL,
       casos_sorteados = NULL, ronda_numero = 0, resolucion_pendiente = NULL
     WHERE id = 1`
  ).run();
}

module.exports = {
  getSesionRaw,
  getSesionPublica,
  getSesionDocente,
  setDuracionRonda,
  sortearYComenzar,
  siguienteRonda,
  cerrarRonda,
  verificarYCerrarSiVencio,
  confirmarResultados,
  reaccionar,
  reacciono,
  tieneCategoria,
  puedeUsarFundacion,
  reiniciarSesion,
};
