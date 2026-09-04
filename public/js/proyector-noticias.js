(function () {
  const socket = io();
  const bannerRonda = document.getElementById('banner-ronda');
  const noticiasGrid = document.getElementById('noticias-grid');
  const bienvenidaGrid = document.getElementById('bienvenida-grid');

  let sesionActual = JSON.parse(document.getElementById('sesion-inicial').textContent);
  let equiposActuales = JSON.parse(document.getElementById('equipos-iniciales').textContent);
  let casoNumeroMostrado = sesionActual.casoActivo ? sesionActual.casoActivo.numero : null;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatTiempo(segundos) {
    const s = Math.max(0, Math.ceil(segundos));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function segundosRestantes(sesion) {
    if (!sesion.rondaInicio) return 0;
    const inicio = new Date(sesion.rondaInicio).getTime();
    const transcurrido = (Date.now() - inicio) / 1000;
    return sesion.rondaDuracionSeg - transcurrido;
  }

  function renderBanner() {
    const sesion = sesionActual;
    if (sesion.rondaEstado === 'finalizada') {
      bannerRonda.className = 'tarjeta-sesion finalizada';
      bannerRonda.innerHTML = '<p class="titulo-ronda">Partida finalizada — ranking final en /proyector</p>';
      return;
    }
    if (sesion.rondaNumero === 0) {
      bannerRonda.className = 'tarjeta-sesion';
      bannerRonda.innerHTML = '<p class="titulo-ronda">Ronda 0</p>';
      return;
    }
    if (sesion.rondaEstado !== 'activa' || !sesion.casoActivo) {
      bannerRonda.className = 'tarjeta-sesion';
      bannerRonda.innerHTML = '<p class="titulo-ronda">Esperando la próxima ronda...</p>';
      return;
    }
    bannerRonda.className = 'tarjeta-sesion activa';
    bannerRonda.innerHTML = `
      <p class="titulo-ronda">Ronda ${sesion.rondaNumero} de ${sesion.totalRondas}</p>
      <p class="cronometro" id="cronometro">--:--</p>
    `;
  }

  function renderBienvenida(equipos) {
    if (!equipos || equipos.length === 0) {
      bienvenidaGrid.hidden = true;
      bienvenidaGrid.innerHTML = '';
      return;
    }
    bienvenidaGrid.hidden = false;
    bienvenidaGrid.innerHTML = equipos
      .map(
        (eq) => `
      <div class="noticia-card">
        <div class="noticia-titulo">${escapeHtml(eq.nombre)} incorpora su primer equipo de ciberseguridad</div>
        <div class="noticia-desc">La dirección aprueba la creación de un área dedicada, con el presupuesto inicial ya asignado. Empieza la carrera contra el tiempo.</div>
      </div>`
      )
      .join('');
  }

  function renderNoticias(noticias) {
    if (!noticias || noticias.length === 0) {
      noticiasGrid.hidden = true;
      noticiasGrid.innerHTML = '';
      return;
    }
    noticiasGrid.hidden = false;
    noticiasGrid.innerHTML = noticias
      .map((n) => {
        const esInterna = n.fuente === 'interna';
        const clase = esInterna ? 'noticia-card noticia-interna' : 'noticia-card noticia-mundo';
        const etiqueta = esInterna ? '🏢 Dentro de la empresa' : '🌐 Noticia del mundo';
        return `
      <div class="${clase}">
        <div class="noticia-etiqueta">${etiqueta}</div>
        <div class="noticia-titulo">${escapeHtml(n.titulo)}</div>
        <div class="noticia-desc">${escapeHtml(n.descripcion)}</div>
      </div>`;
      })
      .join('');
  }

  async function actualizarNoticiasSiCambio() {
    const numero = sesionActual.casoActivo ? sesionActual.casoActivo.numero : null;
    if (numero === casoNumeroMostrado) return;
    casoNumeroMostrado = numero;
    if (!numero) {
      renderNoticias([]);
      return;
    }
    const res = await fetch(`/api/noticias/${numero}`);
    const data = await res.json();
    renderNoticias(data.noticias);
  }

  function renderVista() {
    if (sesionActual.rondaEstado === 'finalizada') {
      bienvenidaGrid.hidden = true;
      noticiasGrid.hidden = true;
      return;
    }
    if (sesionActual.rondaNumero === 0) {
      noticiasGrid.hidden = true;
      noticiasGrid.innerHTML = '';
      renderBienvenida(equiposActuales);
      return;
    }
    bienvenidaGrid.hidden = true;
    bienvenidaGrid.innerHTML = '';
    actualizarNoticiasSiCambio();
  }

  setInterval(() => {
    const el = document.getElementById('cronometro');
    if (!el || sesionActual.rondaEstado !== 'activa') return;
    el.textContent = formatTiempo(segundosRestantes(sesionActual));
  }, 250);

  socket.on('estado:actualizado', (data) => {
    sesionActual = data.sesion;
    equiposActuales = data.equipos;
    renderBanner();
    renderVista();
  });

  // Pintura inicial: usa lo que ya mandó el servidor, sin pedirlo de nuevo por fetch.
  renderBanner();
  if (sesionActual.rondaEstado !== 'finalizada') {
    if (sesionActual.rondaNumero === 0) {
      renderBienvenida(equiposActuales);
    } else {
      renderNoticias(JSON.parse(document.getElementById('noticias-iniciales').textContent));
    }
  }
})();
