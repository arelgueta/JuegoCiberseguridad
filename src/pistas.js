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
    db.prepare('SELECT equipo_id, categoria_sugerida, creado_en FROM pistas_auditoria WHERE equipo_id = ?').get(equipoId) ||
    null
  );
}

function mensajeDePista(categoriaSugerida) {
  return categoriaSugerida
    ? `La auditoría interna recomienda reforzar la categoría "${categoriaSugerida}".`
    : 'La auditoría interna no encontró exposiciones pendientes por reforzar.';
}

function generarPista(equipoId) {
  const opciones = categoriasPendientes();
  const categoriaSugerida = opciones.length > 0 ? opciones[Math.floor(Math.random() * opciones.length)] : null;
  db.prepare('INSERT OR IGNORE INTO pistas_auditoria (equipo_id, categoria_sugerida) VALUES (?, ?)').run(
    equipoId,
    categoriaSugerida
  );
  const guardada = getPista(equipoId);
  return { equipoId, categoriaSugerida: guardada.categoria_sugerida, mensaje: mensajeDePista(guardada.categoria_sugerida) };
}

function getPistaConMensaje(equipoId) {
  const guardada = getPista(equipoId);
  if (!guardada) return null;
  return { categoriaSugerida: guardada.categoria_sugerida, mensaje: mensajeDePista(guardada.categoria_sugerida) };
}

module.exports = { generarPista, getPista, getPistaConMensaje, categoriasPendientes };
