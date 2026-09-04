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

  CREATE TABLE IF NOT EXISTS noticias (
    id INTEGER PRIMARY KEY,
    caso_numero INTEGER NOT NULL REFERENCES casos(numero),
    titulo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    es_pista INTEGER NOT NULL DEFAULT 0
  );
`);

const columnasHerramientas = db.prepare("PRAGMA table_info(herramientas)").all().map((c) => c.name);
if (!columnasHerramientas.includes('requiere')) {
  db.exec('ALTER TABLE herramientas ADD COLUMN requiere TEXT');
}

db.prepare('INSERT OR IGNORE INTO sesion (id) VALUES (1)').run();

// Las 7 categorías de amenaza que participan del seguimiento de vulnerabilidades y de los
// casos sorteables. 'general' y 'politicas' no son categorías de amenaza (ver SPEC3/SPEC4).
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
  { id: 'relevamiento-ti', categoria: 'politicas', nombre: 'Relevamiento de TI', costo: 2, descripcion: 'Sin efecto propio en presupuesto/reputación. Habilita utilizar Gestión de riesgos.', requiere: null },
  { id: 'gestion-riesgos', categoria: 'politicas', nombre: 'Gestión de riesgos', costo: 3, descripcion: 'Mientras se tenga: reduce un 30% cualquier penalización de Omisión (presupuesto y reputación, en cualquier categoría).', requiere: 'relevamiento-ti' },
  { id: 'siem', categoria: 'politicas', nombre: 'Incorporación de SIEM', costo: 4, descripcion: 'Mientras se tenga: cualquier caso que hubiera terminado en Omisión se resuelve como Reactiva sin cobrar el costo de emergencia.', requiere: null },
  { id: 'comite-gobierno', categoria: 'politicas', nombre: 'Comité de gobierno de seguridad', costo: 2, descripcion: 'Mientras se tenga: el duplicado por categoría vulnerable repetida nunca se aplica para este equipo.', requiere: null },
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

// 4 noticias por caso (reutilizadas tal cual de brecha-diapositivas.html, noticiasPorCaso,
// re-indexado por número de caso: noticiasPorCaso[0] -> caso 1, ..., [8] -> caso 9). El bloque
// de noticias del caso 10 se reescribió porque el viejo caso 10 especial de SPEC2 ya no existe
// (SPEC3 lo reemplazó por 'Auditoría de cumplimiento sin previo aviso'); ese contenido nuevo
// sale tal cual de la tabla de SPEC5.md.
const NOTICIAS = [
  { caso_numero: 1, titulo: 'Alertan sobre fraudes de suplantación de correo corporativo (BEC)', descripcion: 'Una cámara empresarial reporta un aumento del 40% en fraudes de tipo BEC dirigidos a áreas de finanzas en el último trimestre.', es_pista: 1 },
  { caso_numero: 1, titulo: 'Encuesta revela que la mayoría reutiliza contraseñas', descripcion: 'Un estudio de hábitos digitales encuentra que 6 de cada 10 personas usa la misma contraseña en varios servicios.', es_pista: 0 },
  { caso_numero: 1, titulo: 'Circulan videos manipulados con IA pidiendo donaciones', descripcion: 'Se reportan casos de videos que suplantan a directivos de empresas para pedir transferencias a billeteras cripto.', es_pista: 0 },
  { caso_numero: 1, titulo: 'Consultora publica su informe anual de tendencias en ciberseguridad', descripcion: 'El reporte identifica al error humano como el factor más frecuente en los incidentes reportados este año.', es_pista: 0 },

  { caso_numero: 2, titulo: 'Foro clandestino ofrece millones de credenciales filtradas', descripcion: 'Se detecta la venta de una base de datos combinada con credenciales de distintos servicios online.', es_pista: 1 },
  { caso_numero: 2, titulo: 'Aviso urgente por una vulnerabilidad crítica ya explotada', descripcion: 'Se publica un CVE de severidad alta que ya está siendo aprovechado por atacantes en distintos países.', es_pista: 0 },
  { caso_numero: 2, titulo: 'Un comunicado falso con el logo de una empresa se viraliza', descripcion: 'Antes de ser desmentido, el comunicado genera cancelaciones de contratos por parte de clientes.', es_pista: 0 },
  { caso_numero: 2, titulo: 'Detectan código malicioso oculto en una actualización de software', descripcion: 'Analistas identifican instrucciones no documentadas agregadas a un componente ampliamente utilizado por empresas.', es_pista: 0 },

  { caso_numero: 3, titulo: 'Documentan estafas telefónicas con voz clonada por IA', descripcion: 'Un caso reciente muestra cómo estafadores replican la voz de un directivo para pedir transferencias urgentes.', es_pista: 1 },
  { caso_numero: 3, titulo: 'Un banco advierte sobre correos que imitan sus notificaciones', descripcion: 'Se detectan campañas de phishing que copian el diseño exacto de los avisos oficiales del banco.', es_pista: 0 },
  { caso_numero: 3, titulo: 'Hospital regional reporta interrupción de sistemas', descripcion: 'Un ataque que cifra archivos deja fuera de servicio varios sistemas administrativos durante horas.', es_pista: 0 },
  { caso_numero: 3, titulo: 'Anuncian una nueva certificación internacional en seguridad', descripcion: 'La certificación busca estandarizar competencias para profesionales del área a nivel regional.', es_pista: 0 },

  { caso_numero: 4, titulo: 'Especialistas insisten en probar restauraciones reales de backups', descripcion: 'Tener copias de seguridad no alcanza: recomiendan simulacros periódicos de recuperación completa.', es_pista: 1 },
  { caso_numero: 4, titulo: 'Recomiendan pasar a llaves de acceso para reducir robo de contraseñas', descripcion: 'Las passkeys eliminan la necesidad de recordar contraseñas y reducen el riesgo de phishing de credenciales.', es_pista: 0 },
  { caso_numero: 4, titulo: 'Una red de cuentas automatizadas impulsa una tendencia falsa en redes', descripcion: 'El comportamiento coordinado de las publicaciones apunta a una campaña orquestada contra la imagen de una empresa.', es_pista: 0 },
  { caso_numero: 4, titulo: 'Auditoría revela un almacenamiento en la nube mal configurado', descripcion: 'Datos de clientes estuvieron accesibles públicamente durante varias semanas antes de detectarse.', es_pista: 0 },

  { caso_numero: 5, titulo: 'Una herramienta gratuita de voz con IA se vuelve tendencia', descripcion: 'La app permite imitar voces conocidas con solo unos segundos de audio de referencia.', es_pista: 1 },
  { caso_numero: 5, titulo: 'Un impostor ingresa a una oficina siguiendo a un empleado', descripcion: 'El caso, capturado por cámaras de seguridad, reabre el debate sobre el control de acceso físico.', es_pista: 0 },
  { caso_numero: 5, titulo: 'Proveedor externo con acceso a APIs sufre una filtración', descripcion: 'Las credenciales comprometidas también daban acceso a sistemas de sus clientes.', es_pista: 0 },
  { caso_numero: 5, titulo: 'Un evento de la industria debate el futuro de la inteligencia artificial', descripcion: 'Especialistas discuten oportunidades y riesgos de la adopción acelerada de IA en las empresas.', es_pista: 0 },

  { caso_numero: 6, titulo: 'Recomiendan revisar permisos de cuentas de servicio olvidadas', descripcion: 'Muchas cuentas con privilegios elevados quedan activas mucho después de haber dejado de usarse.', es_pista: 1 },
  { caso_numero: 6, titulo: 'Se detecta un aumento de dominios que imitan marcas conocidas', descripcion: 'Usan caracteres visualmente similares a los originales para engañar a quien no revisa con atención.', es_pista: 0 },
  { caso_numero: 6, titulo: 'Crece la oferta de kits de ataque listos para usar en foros clandestinos', descripcion: 'Estos paquetes reducen la necesidad de conocimientos técnicos avanzados para lanzar una campaña de cifrado de archivos.', es_pista: 0 },
  { caso_numero: 6, titulo: 'Aparece un perfil falso haciéndose pasar por reclutador técnico', descripcion: 'El perfil buscaba obtener información sobre la infraestructura interna de varias empresas.', es_pista: 0 },

  { caso_numero: 7, titulo: 'Investigadores detectan una puerta trasera en una librería popular', descripcion: 'La última actualización de una dependencia muy usada en proyectos empresariales incluía código no autorizado.', es_pista: 1 },
  { caso_numero: 7, titulo: 'Aumentan los intentos de acceso automatizado contra portales VPN', descripcion: 'Los ataques prueban combinaciones de usuario y contraseña obtenidas de filtraciones previas.', es_pista: 0 },
  { caso_numero: 7, titulo: 'Un comunicado falso vuelve a circular meses después', descripcion: 'Una versión editada del rumor original reaparece en redes con nuevos detalles inventados.', es_pista: 0 },
  { caso_numero: 7, titulo: 'Una universidad lanza un programa de becas en ciberseguridad', descripcion: 'Busca fomentar la formación de nuevos profesionales del área en los próximos cinco años.', es_pista: 0 },

  { caso_numero: 8, titulo: 'Un grupo ofrece su malware como servicio a otros atacantes', descripcion: 'El modelo de "ransomware como servicio" permite a grupos con menos experiencia técnica lanzar campañas propias.', es_pista: 1 },
  { caso_numero: 8, titulo: 'Aparecen pendrives "perdidos" con logos corporativos', descripcion: 'Se encuentran en estacionamientos de varias empresas de la zona en las últimas semanas.', es_pista: 0 },
  { caso_numero: 8, titulo: 'Un proveedor externo con acceso a sistemas sufre una filtración', descripcion: 'Las credenciales comprometidas también afectaban a las empresas que trabajaban con ese proveedor.', es_pista: 0 },
  { caso_numero: 8, titulo: 'Empresas de logística reportan correos falsos de confirmación de envío', descripcion: 'Los mensajes incluyen enlaces que descargan software malicioso al hacer clic.', es_pista: 0 },

  { caso_numero: 9, titulo: 'Cuentas coordinadas amplifican un hashtag con información falsa', descripcion: 'El patrón de publicaciones sugiere una campaña organizada contra la reputación de una marca conocida.', es_pista: 1 },
  { caso_numero: 9, titulo: 'Especialistas insisten en no reutilizar contraseñas entre servicios', descripcion: 'Un relevamiento reciente encuentra que la reutilización sigue siendo la práctica de mayor riesgo entre usuarios corporativos.', es_pista: 0 },
  { caso_numero: 9, titulo: 'Se publica un aviso urgente por una vulnerabilidad crítica', descripcion: 'Distintos organismos recomiendan aplicar el parche disponible lo antes posible.', es_pista: 0 },
  { caso_numero: 9, titulo: 'Un centro de estudios difunde su reporte anual de riesgos digitales', descripcion: 'El informe señala que los incidentes vinculados a proveedores externos siguen en aumento respecto del año anterior.', es_pista: 0 },

  { caso_numero: 10, titulo: 'Reguladores anuncian inspecciones de cumplimiento sin aviso previo', descripcion: 'Distintos organismos comenzarán a realizar auditorías sorpresa para verificar el cumplimiento de normas de seguridad, sin notificar la fecha con anticipación.', es_pista: 1 },
  { caso_numero: 10, titulo: 'Alertan sobre fraudes de suplantación de correo corporativo', descripcion: 'Se reporta un nuevo repunte de casos de BEC dirigidos a pequeñas y medianas empresas.', es_pista: 0 },
  { caso_numero: 10, titulo: 'Documentan nuevas estafas telefónicas con voz clonada por IA', descripcion: 'Los casos reportados muestran variantes cada vez más difíciles de distinguir de una llamada real.', es_pista: 0 },
  { caso_numero: 10, titulo: 'Un proveedor de nube anuncia nuevas certificaciones de seguridad', descripcion: 'La empresa busca reforzar la confianza de sus clientes empresariales tras incidentes recientes en el sector.', es_pista: 0 },
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

const insertNoticia = db.prepare(`
  INSERT INTO noticias (caso_numero, titulo, descripcion, es_pista)
  VALUES (@caso_numero, @titulo, @descripcion, @es_pista)
`);

const seedTodo = db.transaction(() => {
  for (const herramienta of CATALOGO_HERRAMIENTAS) {
    seedHerramienta.run(herramienta);
  }
  for (const caso of CASOS) {
    seedCaso.run(caso);
  }
  // Sin clave natural en `noticias` (son contenido estático de referencia, nunca editado a
  // mano): se regenera entera en cada arranque para que un cambio de contenido en este
  // archivo se refleje solo, en vez de ir quedando desactualizada.
  db.prepare('DELETE FROM noticias').run();
  for (const noticia of NOTICIAS) {
    insertNoticia.run(noticia);
  }
});

seedTodo();

module.exports = { db, CATALOGO_HERRAMIENTAS, CASOS, NOTICIAS, CATEGORIAS_AMENAZA };
