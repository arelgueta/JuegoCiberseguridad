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
`);

const CATALOGO_HERRAMIENTAS = [
  { id: 'filtro-anti-phishing', categoria: 'phishing', nombre: 'Filtro anti-phishing + SPF/DKIM/DMARC', costo: 3, descripcion: 'Verifica automáticamente la autenticidad del remitente y bloquea dominios falsificados.' },
  { id: 'capacitacion-phishing', categoria: 'phishing', nombre: 'Capacitación en detección de phishing', costo: 2, descripcion: 'Entrena al personal para identificar enlaces, adjuntos y remitentes sospechosos.' },
  { id: 'mfa-accesos-criticos', categoria: 'pass', nombre: 'MFA en accesos críticos', costo: 3, descripcion: 'Segundo factor de autenticación en VPN, correo y paneles de administración.' },
  { id: 'gestor-contrasenas', categoria: 'pass', nombre: 'Gestor de contraseñas corporativo', costo: 2, descripcion: 'Contraseñas únicas y complejas por servicio, sin reutilización entre sistemas.' },
  { id: 'verificacion-fuera-banda', categoria: 'social', nombre: 'Protocolo de verificación fuera de banda', costo: 2, descripcion: 'Confirmar pedidos sensibles por un canal distinto antes de actuar.' },
  { id: 'control-acceso-fisico', categoria: 'social', nombre: 'Control de acceso físico reforzado', costo: 2, descripcion: 'Badges, control de tailgating y registro de visitantes.' },
  { id: 'backups-inmutables', categoria: 'ransom', nombre: 'Backups inmutables (regla 3-2-1)', costo: 4, descripcion: 'Copias offline probadas, restaurables sin depender del pago de rescate.' },
  { id: 'edr-aislamiento', categoria: 'ransom', nombre: 'EDR con aislamiento automático', costo: 4, descripcion: 'Detecta y aísla endpoints comprometidos antes de que el ataque se propague.' },
  { id: 'gestion-parches', categoria: 'ransom', nombre: 'Gestión de parches automatizada', costo: 3, descripcion: 'Reduce la ventana de exposición a vulnerabilidades conocidas.' },
  { id: 'plan-comunicacion-crisis', categoria: 'fake', nombre: 'Plan de comunicación de crisis', costo: 2, descripcion: 'Canal oficial único para desmentir información falsa con rapidez.' },
  { id: 'monitoreo-marca', categoria: 'fake', nombre: 'Monitoreo de marca en redes', costo: 2, descripcion: 'Detecta menciones anómalas o campañas de desinformación en etapa temprana.' },
  { id: 'verificacion-fuentes', categoria: 'fake', nombre: 'Protocolo de verificación de fuentes', costo: 1, descripcion: 'Antes de reaccionar públicamente, se chequea origen, fecha y autor.' },
  { id: 'minimo-privilegio', categoria: 'cloud', nombre: 'Mínimo privilegio + auditoría de permisos', costo: 3, descripcion: 'Revisión periódica de accesos y cuentas de servicio en la nube.' },
  { id: 'auditoria-proveedores', categoria: 'cloud', nombre: 'Auditoría de proveedores externos', costo: 3, descripcion: 'Evalúa el riesgo de seguridad de terceros con acceso a tus sistemas.' },
  { id: 'escaneo-dependencias', categoria: 'cloud', nombre: 'Escaneo de dependencias (SBOM)', costo: 2, descripcion: 'Verifica la integridad de librerías externas antes de actualizar.' },
  { id: 'plan-respuesta-incidentes', categoria: 'general', nombre: 'Plan de respuesta a incidentes', costo: 4, descripcion: 'Reduce en 1 unidad el costo de emergencia de cualquier categoría.' },
];

const seedHerramienta = db.prepare(`
  INSERT INTO herramientas (id, categoria, nombre, costo, descripcion)
  VALUES (@id, @categoria, @nombre, @costo, @descripcion)
  ON CONFLICT(id) DO UPDATE SET
    categoria = excluded.categoria,
    nombre = excluded.nombre,
    costo = excluded.costo,
    descripcion = excluded.descripcion
`);

const seedCatalogo = db.transaction((catalogo) => {
  for (const herramienta of catalogo) {
    seedHerramienta.run(herramienta);
  }
});

seedCatalogo(CATALOGO_HERRAMIENTAS);

module.exports = { db, CATALOGO_HERRAMIENTAS };
