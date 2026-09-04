const { db } = require('./db');
const sesion = require('./sesion');

function categoriasPendientes() {
  const s = sesion.getSesionRaw();
  if (!s.casos_sorteados) {
    return [];
  }
  const casosSorteados = JSON.parse(s.casos_sorteados);
  const pendientes = casosSorteados.slice(s.ronda_numero);
  const categorias = pendientes
    .map((numero) => db.prepare('SELECT categoria FROM casos WHERE numero = ?').get(numero).categoria)
    .filter((categoria) => categoria !== 'auditoria');
  return [...new Set(categorias)];
}

function getPista(equipoId) {
  return (
    db
      .prepare(
        'SELECT equipo_id, categoria_sugerida, categoria_sugerida_2, creado_en FROM pistas_auditoria WHERE equipo_id = ?'
      )
      .get(equipoId) || null
  );
}

function mensajeDePista(categoriaSugerida, categoriaSugerida2) {
  if (!categoriaSugerida) {
    return 'La auditoría interna no encontró exposiciones pendientes por reforzar.';
  }
  if (categoriaSugerida2) {
    return `La auditoría interna recomienda reforzar las categorías "${categoriaSugerida}" y "${categoriaSugerida2}".`;
  }
  return `La auditoría interna recomienda reforzar la categoría "${categoriaSugerida}".`;
}

function armarRespuesta(equipoId, fila) {
  return {
    equipoId,
    categoriaSugerida: fila.categoria_sugerida,
    categoriaSugerida2: fila.categoria_sugerida_2,
    mensaje: mensajeDePista(fila.categoria_sugerida, fila.categoria_sugerida_2),
  };
}

function generarPista(equipoId) {
  const opciones = categoriasPendientes();
  const categoriaSugerida = opciones.length > 0 ? opciones[Math.floor(Math.random() * opciones.length)] : null;
  db.prepare('INSERT OR IGNORE INTO pistas_auditoria (equipo_id, categoria_sugerida) VALUES (?, ?)').run(
    equipoId,
    categoriaSugerida
  );
  return armarRespuesta(equipoId, getPista(equipoId));
}

// SPEC9.md: si el equipo tiene auditoria-automatizacion-reportes (que solo se puede comprar
// después de programa-auditoria-interna, ya que depende de ella en el árbol), esa compra
// amplía la pista ya existente con una segunda categoría distinta, en vez de recalcular la
// primera — la primera queda tal como se congeló en su momento (SPEC4.md), la segunda es
// información nueva que revela esta herramienta más avanzada.
function ampliarPistaConSegundaCategoria(equipoId) {
  const actual = getPista(equipoId);
  if (!actual || !actual.categoria_sugerida || actual.categoria_sugerida_2) {
    return actual ? armarRespuesta(equipoId, actual) : null;
  }
  const opciones = categoriasPendientes().filter((c) => c !== actual.categoria_sugerida);
  const segunda = opciones.length > 0 ? opciones[Math.floor(Math.random() * opciones.length)] : null;
  if (segunda) {
    db.prepare('UPDATE pistas_auditoria SET categoria_sugerida_2 = ? WHERE equipo_id = ?').run(segunda, equipoId);
  }
  return armarRespuesta(equipoId, getPista(equipoId));
}

function getPistaConMensaje(equipoId) {
  const guardada = getPista(equipoId);
  if (!guardada) return null;
  return armarRespuesta(equipoId, guardada);
}

module.exports = {
  generarPista,
  ampliarPistaConSegundaCategoria,
  getPista,
  getPistaConMensaje,
  categoriasPendientes,
};
