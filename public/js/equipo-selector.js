(function () {
  const socket = io();
  const contenedor = document.getElementById('equipo-selector');
  const datosIniciales = JSON.parse(document.getElementById('equipos-iniciales').textContent);

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function render(equipos) {
    contenedor.innerHTML = equipos
      .map((eq) => `<a href="/equipo/${eq.id}">${escapeHtml(eq.nombre)}</a>`)
      .join('');
  }

  socket.on('estado:actualizado', (data) => {
    render(data.equipos);
  });

  render(datosIniciales);
})();
