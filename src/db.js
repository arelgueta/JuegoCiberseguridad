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

const columnasNoticias = db.prepare("PRAGMA table_info(noticias)").all().map((c) => c.name);
if (!columnasNoticias.includes('fuente')) {
  db.exec("ALTER TABLE noticias ADD COLUMN fuente TEXT NOT NULL DEFAULT 'mundo'");
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

// Contenido de SPEC7.md: reemplaza por completo las tablas de noticias de SPEC5.md y
// SPEC6.md (no se suma). 4 noticias por caso: 1 pista-mundo, 1 pista-interna, 1 señuelo-mundo,
// 1 señuelo-interna. `fuente` indica de dónde viene la información ('mundo' | 'interna'), no
// si es verdadera — esa distinción (es_pista) nunca se muestra en /proyector-noticias.
//
// El caso 9 señuelo-mundo se reescribió respecto del texto literal de SPEC7.md: tal cual venía
// ("Encuesta revela que la mayoría reutiliza contraseñas") es idéntico, palabra por palabra, al
// señuelo-mundo del caso 1 — el mismo problema de titulares repetidos entre casos que ya
// habíamos corregido en SPEC5.md, y que el sorteo de SPEC3.md puede volver a juntar en una
// misma partida. Mismo criterio ya acordado: se mantiene intacta la aparición más temprana
// (caso 1) y se reescribe la más nueva (caso 9), mismo tema, otra redacción. Verificado que el
// resto de las 40 noticias no tiene ningún otro título repetido.
const NOTICIAS = [
  { caso_numero: 1, titulo: 'Alertan sobre fraudes de suplantación de correo corporativo (BEC)', descripcion: 'Una cámara empresarial reporta un aumento del 40% en fraudes de tipo BEC dirigidos a áreas de finanzas en el último trimestre.', es_pista: 1, fuente: 'mundo' },
  { caso_numero: 1, titulo: 'Mesa de ayuda registra varios tickets por correos sospechosos', descripcion: 'Varios empleados reportaron mensajes que simulan ser de un directivo, pidiendo aprobar una transferencia antes de fin de día.', es_pista: 1, fuente: 'interna' },
  { caso_numero: 1, titulo: 'Encuesta revela que la mayoría reutiliza contraseñas', descripcion: 'Un estudio de hábitos digitales encuentra que 6 de cada 10 personas usa la misma contraseña en varios servicios.', es_pista: 0, fuente: 'mundo' },
  { caso_numero: 1, titulo: 'Recursos Humanos recibe consultas sobre un video que circula entre el personal', descripcion: 'Algunos empleados preguntan si es real un video viral que pide donar dinero a una causa urgente.', es_pista: 0, fuente: 'interna' },

  { caso_numero: 2, titulo: 'Foro clandestino ofrece millones de credenciales filtradas', descripcion: 'Se detecta la venta de una base de datos combinada con credenciales de distintos servicios online.', es_pista: 1, fuente: 'mundo' },
  { caso_numero: 2, titulo: 'Sistemas nota un pico de intentos de inicio de sesión fallidos', descripcion: 'Varios usuarios reportan bloqueos temporales de sus cuentas sin haberlo intentado ellos mismos.', es_pista: 1, fuente: 'interna' },
  { caso_numero: 2, titulo: 'Aviso urgente por una vulnerabilidad crítica ya explotada', descripcion: 'Se publica un CVE de severidad alta que ya está siendo aprovechado por atacantes en distintos países.', es_pista: 0, fuente: 'mundo' },
  { caso_numero: 2, titulo: 'Comunicación interna recibe consultas sobre un aviso que circula afuera', descripcion: 'Algunos clientes preguntan si es real un comunicado que menciona el cierre de operaciones.', es_pista: 0, fuente: 'interna' },

  { caso_numero: 3, titulo: 'Documentan estafas telefónicas con voz clonada por IA', descripcion: 'Un caso reciente muestra cómo estafadores replican la voz de un directivo para pedir transferencias urgentes.', es_pista: 1, fuente: 'mundo' },
  { caso_numero: 3, titulo: 'Finanzas reporta una llamada pidiendo una transferencia urgente', descripcion: 'Un empleado duda de la identidad de quien llamó, pese a reconocer la voz.', es_pista: 1, fuente: 'interna' },
  { caso_numero: 3, titulo: 'Un banco advierte sobre correos que imitan sus notificaciones', descripcion: 'Se detectan campañas de phishing que copian el diseño exacto de los avisos oficiales del banco.', es_pista: 0, fuente: 'mundo' },
  { caso_numero: 3, titulo: 'Sistemas reporta lentitud en los servidores esta mañana', descripcion: 'Todavía no se identifica la causa; podría tratarse de mantenimiento programado.', es_pista: 0, fuente: 'interna' },

  { caso_numero: 4, titulo: 'Especialistas insisten en probar restauraciones reales de backups', descripcion: 'Tener copias de seguridad no alcanza: recomiendan simulacros periódicos de recuperación completa.', es_pista: 1, fuente: 'mundo' },
  { caso_numero: 4, titulo: 'Un empleado reporta no poder acceder a archivos compartidos', descripcion: 'El equipo de sistemas está revisando si se trata de una falla puntual.', es_pista: 1, fuente: 'interna' },
  { caso_numero: 4, titulo: 'Recomiendan pasar a llaves de acceso para reducir robo de contraseñas', descripcion: 'Las passkeys eliminan la necesidad de recordar contraseñas y reducen el riesgo de phishing de credenciales.', es_pista: 0, fuente: 'mundo' },
  { caso_numero: 4, titulo: 'Marketing consulta por comentarios negativos que aparecieron de golpe en redes', descripcion: 'No está claro todavía si se trata de una campaña organizada o pura casualidad.', es_pista: 0, fuente: 'interna' },

  { caso_numero: 5, titulo: 'Una herramienta gratuita de voz con IA se vuelve tendencia', descripcion: 'La app permite imitar voces conocidas con solo unos segundos de audio de referencia.', es_pista: 1, fuente: 'mundo' },
  { caso_numero: 5, titulo: 'Tesorería recibe una consulta sobre una transferencia a una billetera cripto', descripcion: 'Alguien solicitó el pago mostrando un video del director que nadie termina de reconocer del todo.', es_pista: 1, fuente: 'interna' },
  { caso_numero: 5, titulo: 'Un impostor ingresa a una oficina siguiendo a un empleado', descripcion: 'El caso, capturado por cámaras de seguridad, reabre el debate sobre el control de acceso físico.', es_pista: 0, fuente: 'mundo' },
  { caso_numero: 5, titulo: 'Compras pregunta si hay que avisarle a un proveedor sobre un problema de acceso', descripcion: 'Todavía no está confirmado si el inconveniente afecta a los sistemas propios.', es_pista: 0, fuente: 'interna' },

  { caso_numero: 6, titulo: 'Recomiendan revisar permisos de cuentas de servicio olvidadas', descripcion: 'Muchas cuentas con privilegios elevados quedan activas mucho después de haber dejado de usarse.', es_pista: 1, fuente: 'mundo' },
  { caso_numero: 6, titulo: 'Un cliente escribe preguntando por qué pudo ver documentos que no le correspondían', descripcion: 'El equipo de soporte deriva la consulta al área técnica para revisar el caso.', es_pista: 1, fuente: 'interna' },
  { caso_numero: 6, titulo: 'Se detecta un aumento de dominios que imitan marcas conocidas', descripcion: 'Usan caracteres visualmente similares a los originales para engañar a quien no revisa con atención.', es_pista: 0, fuente: 'mundo' },
  { caso_numero: 6, titulo: 'Un empleado comenta que un supuesto reclutador le hizo preguntas raras', descripcion: 'No se sabe si fue una coincidencia o algo más serio; el comentario quedó en el grupo del equipo.', es_pista: 0, fuente: 'interna' },

  { caso_numero: 7, titulo: 'Investigadores detectan una puerta trasera en una librería popular', descripcion: 'La última actualización de una dependencia muy usada en proyectos empresariales incluía código no autorizado.', es_pista: 1, fuente: 'mundo' },
  { caso_numero: 7, titulo: 'Desarrollo reporta un comportamiento extraño después de la última actualización', descripcion: 'Todavía no lograron identificar si el problema viene de una dependencia externa.', es_pista: 1, fuente: 'interna' },
  { caso_numero: 7, titulo: 'Aumentan los intentos de acceso automatizado contra portales VPN', descripcion: 'Los ataques prueban combinaciones de usuario y contraseña obtenidas de filtraciones previas.', es_pista: 0, fuente: 'mundo' },
  { caso_numero: 7, titulo: 'RR.HH. comparte una propuesta para sumar pasantes al área técnica', descripcion: 'Todavía se está evaluando el presupuesto disponible para el programa.', es_pista: 0, fuente: 'interna' },

  { caso_numero: 8, titulo: 'Un grupo ofrece su malware como servicio a otros atacantes', descripcion: 'El modelo de "ransomware como servicio" permite a grupos con menos experiencia técnica lanzar campañas propias.', es_pista: 1, fuente: 'mundo' },
  { caso_numero: 8, titulo: 'Sistemas detecta un servidor con una actualización pendiente hace semanas', descripcion: 'Se está evaluando si aplicarla esta noche o esperar al próximo mantenimiento programado.', es_pista: 1, fuente: 'interna' },
  { caso_numero: 8, titulo: 'Aparecen pendrives "perdidos" con logos corporativos', descripcion: 'Se encuentran en estacionamientos de varias empresas de la zona en las últimas semanas.', es_pista: 0, fuente: 'mundo' },
  { caso_numero: 8, titulo: 'Un empleado de depósito pregunta por un correo de seguimiento de un pedido', descripcion: 'No recuerda haber hecho ese pedido, pero tampoco está seguro de lo contrario.', es_pista: 0, fuente: 'interna' },

  { caso_numero: 9, titulo: 'Cuentas coordinadas amplifican un hashtag con información falsa', descripcion: 'El patrón de publicaciones sugiere una campaña organizada contra la reputación de una marca conocida.', es_pista: 1, fuente: 'mundo' },
  { caso_numero: 9, titulo: 'Atención al cliente recibe llamados preguntando si la empresa cierra', descripcion: 'Todavía no hay un comunicado oficial que lo confirme ni lo desmienta.', es_pista: 1, fuente: 'interna' },
  { caso_numero: 9, titulo: 'Especialistas insisten en no reutilizar contraseñas entre servicios', descripcion: 'Un relevamiento reciente encuentra que la reutilización sigue siendo la práctica de mayor riesgo entre usuarios corporativos.', es_pista: 0, fuente: 'mundo' },
  { caso_numero: 9, titulo: 'Sistemas comenta que aplicó un parche preventivo esta semana', descripcion: 'Por ahora no se relaciona con ningún incidente detectado.', es_pista: 0, fuente: 'interna' },

  { caso_numero: 10, titulo: 'Reguladores anuncian inspecciones de cumplimiento sin aviso previo', descripcion: 'Distintos organismos comenzarán a realizar auditorías sorpresa para verificar el cumplimiento de normas de seguridad.', es_pista: 1, fuente: 'mundo' },
  { caso_numero: 10, titulo: 'Legales pregunta si la documentación de cumplimiento está actualizada', descripcion: 'Todavía no hay fecha confirmada para una posible revisión.', es_pista: 1, fuente: 'interna' },
  { caso_numero: 10, titulo: 'Documentan nuevas estafas telefónicas con voz clonada por IA', descripcion: 'Los casos reportados muestran variantes cada vez más difíciles de distinguir de una llamada real.', es_pista: 0, fuente: 'mundo' },
  { caso_numero: 10, titulo: 'Compras comparte una propuesta de un proveedor con nuevas certificaciones', descripcion: 'Se está evaluando si conviene avanzar con el cambio de proveedor.', es_pista: 0, fuente: 'interna' },
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
  INSERT INTO noticias (caso_numero, titulo, descripcion, es_pista, fuente)
  VALUES (@caso_numero, @titulo, @descripcion, @es_pista, @fuente)
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
