(function () {
  const socket = io();
  const tbody = document.getElementById('tabla-proyector');
  const bannerRonda = document.getElementById('banner-ronda');
  const datosIniciales = JSON.parse(document.getElementById('equipos-iniciales').textContent);

  let sesionActual = JSON.parse(document.getElementById('sesion-inicial').textContent);

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatPuntaje(v) {
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
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

  function tituloRonda(sesion) {
    if (sesion.rondaNumero === 0) return 'Momento 0';
    if (sesion.casoActivo) return `Ronda ${sesion.rondaNumero} de ${sesion.totalRondas} — Caso #${sesion.casoActivo.numero}: ${sesion.casoActivo.titulo}`;
    return `Ronda ${sesion.rondaNumero} de ${sesion.totalRondas}`;
  }

  function renderBannerRonda() {
    const sesion = sesionActual;
    if (sesion.rondaEstado === 'activa') {
      bannerRonda.hidden = false;
      bannerRonda.className = 'tarjeta-sesion activa';
      bannerRonda.innerHTML = `
        <p class="titulo-ronda">${escapeHtml(tituloRonda(sesion))}</p>
        <p class="cronometro" id="cronometro">--:--</p>
      `;
    } else if (sesion.rondaEstado === 'finalizada') {
      bannerRonda.hidden = false;
      bannerRonda.className = 'tarjeta-sesion finalizada';
      bannerRonda.innerHTML = '<p class="titulo-ronda">Partida finalizada — ranking final</p>';
    } else if (sesion.rondaEstado === 'resuelta') {
      bannerRonda.hidden = false;
      bannerRonda.className = 'tarjeta-sesion';
      bannerRonda.innerHTML = `<p class="titulo-ronda">${escapeHtml(tituloRonda(sesion))} — esperando al docente</p>`;
    } else {
      bannerRonda.hidden = true;
      bannerRonda.innerHTML = '';
    }
  }

  setInterval(() => {
    const el = document.getElementById('cronometro');
    if (!el || sesionActual.rondaEstado !== 'activa') return;
    el.textContent = formatTiempo(segundosRestantes(sesionActual));
  }, 250);

  function render(equipos) {
    const ordenados = [...equipos].sort((a, b) => b.puntaje - a.puntaje);
    tbody.innerHTML = ordenados
      .map(
        (eq, i) => `
      <tr class="${sesionActual.rondaEstado === 'finalizada' && i === 0 ? 'fila-ganador' : ''}">
        <td class="puesto">${i + 1}</td>
        <td>${escapeHtml(eq.nombre)}${eq.vulnerable ? '<span class="indicador-vulnerable" title="Tiene una categoría vulnerable"></span>' : ''}</td>
        <td>${eq.presupuesto}</td>
        <td>${eq.reputacion}</td>
        <td>${formatPuntaje(eq.puntaje)}</td>
      </tr>`
      )
      .join('');
  }

  socket.on('estado:actualizado', (data) => {
    sesionActual = data.sesion;
    renderBannerRonda();
    render(data.equipos);
  });

  renderBannerRonda();
  render(datosIniciales);
})();
