(function () {
  const contenedor = document.getElementById('equipo-selector');
  const datosIniciales = JSON.parse(document.getElementById('equipos-iniciales').textContent);

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function render(equipos) {
    contenedor.innerHTML = equipos
      .map((eq) => `
        <form action="/equipo/login" method="post" class="formulario">
          <input type="hidden" name="equipo_id" value="${eq.id}">
          <strong>${escapeHtml(eq.nombre)}</strong>
          <label>Contraseña
            <input type="password" name="password" required>
          </label>
          <button type="submit">Ingresar</button>
        </form>`)
      .join('');
  }

  render(datosIniciales);
})();
