(function () {
  const socket = io();
  const bannerRonda = document.getElementById('banner-ronda');
  const noticiasGrid = document.getElementById('noticias-grid');

  let sesionActual = JSON.parse(document.getElementById('sesion-inicial').textContent);
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
      bannerRonda.innerHTML = '<p class="titulo-ronda">Los equipos están decidiendo su inversión inicial</p>';
      return;
    }
    if (!sesion.casoActivo) {
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

  function renderNoticias(noticias) {
    if (!noticias || noticias.length === 0) {
      noticiasGrid.hidden = true;
      noticiasGrid.innerHTML = '';
      return;
    }
    noticiasGrid.hidden = false;
    noticiasGrid.innerHTML = noticias
      .map(
        (n) => `
      <div class="noticia-card">
        <div class="noticia-titulo">${escapeHtml(n.titulo)}</div>
        <div class="noticia-desc">${escapeHtml(n.descripcion)}</div>
      </div>`
      )
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

  setInterval(() => {
    const el = document.getElementById('cronometro');
    if (!el || sesionActual.rondaEstado !== 'activa') return;
    el.textContent = formatTiempo(segundosRestantes(sesionActual));
  }, 250);

  socket.on('estado:actualizado', (data) => {
    sesionActual = data.sesion;
    renderBanner();
    actualizarNoticiasSiCambio();
  });

  renderBanner();
  renderNoticias(JSON.parse(document.getElementById('noticias-iniciales').textContent));
})();
