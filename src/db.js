const path = require('node:path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'brecha.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS equipos (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    presupuesto INTEGER NOT NULL DEFAULT 20,
    reputacion INTEGER NOT NULL DEFAULT 20,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS herramientas (
    id TEXT PRIMARY KEY,
    categoria TEXT NOT NULL,
    nombre TEXT NOT NULL,
    costo INTEGER NOT NULL,
    descripcion TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS compras (
    id INTEGER PRIMARY KEY,
    equipo_id INTEGER NOT NULL REFERENCES equipos(id),
    herramienta_id TEXT NOT NULL REFERENCES herramientas(id),
    costo_pagado INTEGER NOT NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS registro_casos (
    id INTEGER PRIMARY KEY,
    equipo_id INTEGER NOT NULL REFERENCES equipos(id),
    caso_numero INTEGER NOT NULL,
    ruta TEXT NOT NULL,
    delta_presupuesto INTEGER NOT NULL DEFAULT 0,
    delta_reputacion INTEGER NOT NULL DEFAULT 0,
    vulnerable INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS casos (
    numero INTEGER PRIMARY KEY,
    categoria TEXT NOT NULL,
    titulo TEXT NOT NULL,
    costo_reactiva INTEGER,
    omision_presupuesto INTEGER,
    omision_reputacion INTEGER,
    preventiva_reputacion INTEGER NOT NULL DEFAULT 2
  );

  CREATE TABLE IF NOT EXISTS vulnerabilidades (
    equipo_id INTEGER NOT NULL REFERENCES equipos(id),
    categoria TEXT NOT NULL,
    vulnerable_desde_caso INTEGER,
    PRIMARY KEY (equipo_id, categoria)
  );

  CREATE TABLE IF NOT EXISTS sesion (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    caso_actual INTEGER,
    ronda_estado TEXT NOT NULL DEFAULT 'inactiva',
    ronda_inicio TEXT,
    ronda_duracion_seg INTEGER NOT NULL DEFAULT 90,
    casos_sorteados TEXT,
    ronda_numero INTEGER NOT NULL DEFAULT 0,
    resolucion_pendiente TEXT
  );

  CREATE TABLE IF NOT EXISTS pistas_auditoria (
    equipo_id INTEGER PRIMARY KEY REFERENCES equipos(id),
    categoria_sugerida TEXT,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reacciones (
    equipo_id INTEGER NOT NULL REFERENCES equipos(id),
    ronda_numero INTEGER NOT NULL,
    costo_pagado INTEGER NOT NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (equipo_id, ronda_numero)
  );
`);

const columnasHerramientas = db.prepare("PRAGMA table_info(herramientas)").all().map((c) => c.name);
if (!columnasHerramientas.includes('requiere')) {
  db.exec('ALTER TABLE herramientas ADD COLUMN requiere TEXT');
}

db.prepare('INSERT OR IGNORE INTO sesion (id) VALUES (1)').run();

// Las 7 categorías de amenaza que participan del seguimiento de vulnerabilidades y de los
// casos sorteables. 'general' y 'fundacion' no son categorías de amenaza (ver SPEC3/SPEC4).
const CATEGORIAS_AMENAZA = ['phishing', 'pass', 'social', 'ransom', 'fake', 'cloud', 'auditoria'];

const CATALOGO_HERRAMIENTAS = [
  { id: 'filtro-anti-phishing', categoria: 'phishing', nombre: 'Filtro anti-phishing + SPF/DKIM/DMARC', costo: 3, descripcion: 'Verifica automáticamente la autenticidad del remitente y bloquea dominios falsificados.', requiere: null },
  { id: 'capacitacion-phishing', categoria: 'phishing', nombre: 'Capacitación en detección de phishing', costo: 2, descripcion: 'Entrena al personal para identificar enlaces, adjuntos y remitentes sospechosos.', requiere: null },
  { id: 'mfa-accesos-criticos', categoria: 'pass', nombre: 'MFA en accesos críticos', costo: 3, descripcion: 'Segundo factor de autenticación en VPN, correo y paneles de administración.', requiere: null },
  { id: 'gestor-contrasenas', categoria: 'pass', nombre: 'Gestor de contraseñas corporativo', costo: 2, descripcion: 'Contraseñas únicas y complejas por servicio, sin reutilización entre sistemas.', requiere: null },
  { id: 'verificacion-fuera-banda', categoria: 'social', nombre: 'Protocolo de verificación fuera de banda', costo: 2, descripcion: 'Confirmar pedidos sensibles por un canal distinto antes de actuar.', requiere: null },
  { id: 'control-acceso-fisico', categoria: 'social', nombre: 'Control de acceso físico reforzado', costo: 2, descripcion: 'Badges, control de tailgating y registro de visitantes.', requiere: null },
  { id: 'backups-inmutables', categoria: 'ransom', nombre: 'Backups inmutables (regla 3-2-1)', costo: 4, descripcion: 'Copias offline probadas, restaurables sin depender del pago de rescate.', requiere: null },
  { id: 'edr-aislamiento', categoria: 'ransom', nombre: 'EDR con aislamiento automático', costo: 4, descripcion: 'Detecta y aísla endpoints comprometidos antes de que el ataque se propague.', requiere: null },
  { id: 'gestion-parches', categoria: 'ransom', nombre: 'Gestión de parches automatizada', costo: 3, descripcion: 'Reduce la ventana de exposición a vulnerabilidades conocidas.', requiere: null },
  { id: 'plan-comunicacion-crisis', categoria: 'fake', nombre: 'Plan de comunicación de crisis', costo: 2, descripcion: 'Canal oficial único para desmentir información falsa con rapidez.', requiere: null },
  { id: 'monitoreo-marca', categoria: 'fake', nombre: 'Monitoreo de marca en redes', costo: 2, descripcion: 'Detecta menciones anómalas o campañas de desinformación en etapa temprana.', requiere: null },
  { id: 'verificacion-fuentes', categoria: 'fake', nombre: 'Protocolo de verificación de fuentes', costo: 1, descripcion: 'Antes de reaccionar públicamente, se chequea origen, fecha y autor.', requiere: null },
  { id: 'minimo-privilegio', categoria: 'cloud', nombre: 'Mínimo privilegio + auditoría de permisos', costo: 3, descripcion: 'Revisión periódica de accesos y cuentas de servicio en la nube.', requiere: null },
  { id: 'auditoria-proveedores', categoria: 'cloud', nombre: 'Auditoría de proveedores externos', costo: 3, descripcion: 'Evalúa el riesgo de seguridad de terceros con acceso a tus sistemas.', requiere: null },
  { id: 'escaneo-dependencias', categoria: 'cloud', nombre: 'Escaneo de dependencias (SBOM)', costo: 2, descripcion: 'Verifica la integridad de librerías externas antes de actualizar.', requiere: null },
  { id: 'plan-respuesta-incidentes', categoria: 'general', nombre: 'Plan de respuesta a incidentes', costo: 4, descripcion: 'Reduce en 1 unidad el costo de emergencia de cualquier categoría.', requiere: null },
  { id: 'programa-auditoria-interna', categoria: 'auditoria', nombre: 'Programa de auditoría interna', costo: 3, descripcion: 'Revisiones periódicas que detectan y corrigen brechas antes de que las encuentre un auditor externo.', requiere: null },
  { id: 'relevamiento-ti', categoria: 'fundacion', nombre: 'Relevamiento de TI', costo: 2, descripcion: 'Sin efecto propio en presupuesto/reputación. Habilita utilizar Gestión de riesgos.', requiere: null },
  { id: 'gestion-riesgos', categoria: 'fundacion', nombre: 'Gestión de riesgos', costo: 3, descripcion: 'Mientras se tenga: reduce un 30% cualquier penalización de Omisión (presupuesto y reputación, en cualquier categoría).', requiere: 'relevamiento-ti' },
  { id: 'siem', categoria: 'fundacion', nombre: 'Incorporación de SIEM', costo: 4, descripcion: 'Mientras se tenga: cualquier caso que hubiera terminado en Omisión se resuelve como Reactiva sin cobrar el costo de emergencia.', requiere: null },
  { id: 'comite-gobierno', categoria: 'fundacion', nombre: 'Comité de gobierno de seguridad', costo: 2, descripcion: 'Mientras se tenga: el duplicado por categoría vulnerable repetida nunca se aplica para este equipo.', requiere: null },
];

const CASOS = [
  { numero: 1, categoria: 'phishing', titulo: 'Fraude del CEO (BEC)', costo_reactiva: 5, omision_presupuesto: -5, omision_reputacion: -4 },
  { numero: 2, categoria: 'pass', titulo: 'Credential stuffing contra la VPN', costo_reactiva: 4, omision_presupuesto: -4, omision_reputacion: -3 },
  { numero: 3, categoria: 'social', titulo: 'Vishing con voz clonada por IA', costo_reactiva: 3, omision_presupuesto: -4, omision_reputacion: -3 },
  { numero: 4, categoria: 'ransom', titulo: 'Cifrado de servidores de producción', costo_reactiva: 6, omision_presupuesto: -7, omision_reputacion: -5 },
  { numero: 5, categoria: 'fake', titulo: 'Deepfake del CEO pidiendo donaciones', costo_reactiva: 3, omision_presupuesto: -4, omision_reputacion: -4 },
  { numero: 6, categoria: 'cloud', titulo: 'Bucket de almacenamiento público por error', costo_reactiva: 4, omision_presupuesto: -5, omision_reputacion: -4 },
  { numero: 7, categoria: 'cloud', titulo: 'Librería de código abierto comprometida', costo_reactiva: 3, omision_presupuesto: -5, omision_reputacion: -4 },
  { numero: 8, categoria: 'ransom', titulo: 'Día cero explotado activamente (RaaS)', costo_reactiva: 4, omision_presupuesto: -6, omision_reputacion: -4 },
  { numero: 9, categoria: 'fake', titulo: 'Comunicado falso de cierre de operaciones', costo_reactiva: 3, omision_presupuesto: -5, omision_reputacion: -5 },
  { numero: 10, categoria: 'auditoria', titulo: 'Auditoría de cumplimiento sin previo aviso', costo_reactiva: 4, omision_presupuesto: -4, omision_reputacion: -5 },
];

const seedHerramienta = db.prepare(`
  INSERT INTO herramientas (id, categoria, nombre, costo, descripcion, requiere)
  VALUES (@id, @categoria, @nombre, @costo, @descripcion, @requiere)
  ON CONFLICT(id) DO UPDATE SET
    categoria = excluded.categoria,
    nombre = excluded.nombre,
    costo = excluded.costo,
    descripcion = excluded.descripcion,
    requiere = excluded.requiere
`);

const seedCaso = db.prepare(`
  INSERT INTO casos (numero, categoria, titulo, costo_reactiva, omision_presupuesto, omision_reputacion)
  VALUES (@numero, @categoria, @titulo, @costo_reactiva, @omision_presupuesto, @omision_reputacion)
  ON CONFLICT(numero) DO UPDATE SET
    categoria = excluded.categoria,
    titulo = excluded.titulo,
    costo_reactiva = excluded.costo_reactiva,
    omision_presupuesto = excluded.omision_presupuesto,
    omision_reputacion = excluded.omision_reputacion
`);

const seedTodo = db.transaction(() => {
  for (const herramienta of CATALOGO_HERRAMIENTAS) {
    seedHerramienta.run(herramienta);
  }
  for (const caso of CASOS) {
    seedCaso.run(caso);
  }
});

seedTodo();

module.exports = { db, CATALOGO_HERRAMIENTAS, CASOS, CATEGORIAS_AMENAZA };
