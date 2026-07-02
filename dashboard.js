// Lógica principal del Dashboard Universitario

let isAdmin = false;

async function adminLogin() {
    const user = document.getElementById('admin-user').value.toLowerCase();
    const pass = document.getElementById('admin-pass').value;
    
    // Autenticarse contra la base de datos (db.js)
    const account = await db.login(user, pass);
    
    if (account && account.role === 'admin') {
        isAdmin = true;
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('dashboard-container').style.display = 'flex';
        loadDashboard();
    } else {
        alert("Acceso denegado. Se requiere cuenta de autoridad institucional. Usa el usuario 'admin' para probar.");
        db.logout();
    }
}

function logout() {
    db.logout();
    location.reload();
}

function loadDashboard() {
    lucide.createIcons();
    
    // Conectar el listener en tiempo real a la Base de Datos
    // Cualquier reporte que suba un alumno, aparecerá aquí al instante
    db.onReportsSnapshot(async (activeReports) => {
        renderTable(activeReports);
        
        // Calcular KPI's (Indicadores Clave)
        const analytics = await db.getAnalytics();
        
        // Animación sencilla de números
        document.getElementById('kpi-active').innerText = analytics.active;
        document.getElementById('kpi-resolved').innerText = analytics.resolved;
        document.getElementById('kpi-total').innerText = analytics.total;
    });
    
    // Si la API de Google Maps ya se descargó en el fondo, iniciar el mapa ahora que el contenedor es visible
    if (mapsApiLoaded) {
        setupDashboardMap();
    }
}

function renderTable(reports) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    
    if (reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#7f8c8d; padding: 40px;">No hay incidentes reportados en este momento.</td></tr>';
        return;
    }

    // Ordenar de más reciente a más antiguo
    const sorted = [...reports].sort((a, b) => b.timestamp - a.timestamp);
    
    sorted.forEach(r => {
        // Colores por categoría
        let color = '#3498db';
        if(r.type === 'Bache') color = '#e74c3c';
        if(r.type === 'Tráfico') color = '#f1c40f';
        if(r.type === 'Bloqueo') color = '#e67e22';

        const tr = document.createElement('tr');
        
        // Calcular ratio de confianza de votos
        const ratio = r.votesYes > 0 ? (r.votesYes / (r.votesYes + r.votesNo) * 100).toFixed(0) : 0;
        let trustColor = ratio > 70 ? 'color:#27ae60' : (ratio > 40 ? 'color:#f39c12' : 'color:#e74c3c');
        if (r.votesYes === 0 && r.votesNo === 0) trustColor = 'color:#7f8c8d';

        tr.innerHTML = `
            <td><span class="badge" style="background:${color}">${r.type}</span></td>
            <td><strong>${r.desc}</strong></td>
            <td>${r.time}</td>
            <td>
                <span style="${trustColor}; font-weight:bold;">${r.votesYes} Sí</span> / <span style="color:#7f8c8d;">${r.votesNo} No</span>
            </td>
            <td>
                <button class="btn-resolve" onclick="resolveIssue('${r.id}')">
                    <i data-lucide="check"></i> Solucionar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

async function resolveIssue(id) {
    const confirmacion = confirm("ATENCIÓN: ¿Estás seguro que las autoridades ya solucionaron este problema físicamente?\n\nAl marcarlo como solucionado, desaparecerá del mapa de todos los estudiantes.");
    if (confirmacion) {
        await db.resolveReport(id);
        // La tabla y los KPI se actualizarán solos gracias al onReportsSnapshot en tiempo real
    }
}

// Inicializar iconos de login al cargar
lucide.createIcons();

// ==========================================
// EXPORTACIÓN A EXCEL (CSV)
// ==========================================
async function exportToExcel() {
    const analytics = await db.getAnalytics();
    const reports = analytics.allReports; // Todos los reportes (activos y resueltos)
    
    if (reports.length === 0) {
        alert("No hay reportes para exportar.");
        return;
    }
    
    // Crear una tabla HTML con estilos integrados que Excel puede interpretar nativamente
    let tableHTML = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"></head>
      <body>
        <table border="1" style="border-collapse: collapse; font-family: Calibri, Arial, sans-serif; text-align: center;">
          <thead>
            <tr style="background-color: #2c3e50; color: #ffffff; font-weight: bold; height: 35px; white-space: nowrap;">
              <th style="width: 150px;">ID Reporte</th>
              <th style="width: 120px;">Estado</th>
              <th style="width: 150px;">Tipo de Riesgo</th>
              <th style="width: 400px; text-align: left; padding-left: 10px;">Descripción</th>
              <th style="width: 150px;">Hora Creación</th>
              <th style="width: 120px;">Votos a Favor</th>
              <th style="width: 120px;">Votos en Contra</th>
              <th style="width: 300px;">Coordenadas GPS</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    reports.forEach(r => {
        let isResolved = r.status === 'resuelto' || r.status === 'resolved';
        let statusColor = isResolved ? '#27ae60' : '#e74c3c';
        let statusText = isResolved ? 'SOLUCIONADO' : 'ACTIVO';
        
        let typeColor = '#3498db'; // default
        if(r.type === 'bache') typeColor = '#e74c3c';
        if(r.type === 'trafico') typeColor = '#f1c40f';
        if(r.type === 'cerrada') typeColor = '#e67e22';
        
        let desc = r.desc ? r.desc : "Sin descripción";
        
        tableHTML += `
            <tr style="height: 30px; white-space: nowrap;">
              <td style="color: #7f8c8d;">${r.id}</td>
              <td style="color: ${statusColor}; font-weight: bold;">${statusText}</td>
              <td style="background-color: ${typeColor}; color: white; font-weight: bold;">${r.type.toUpperCase()}</td>
              <td style="text-align: left; padding-left: 10px;">${desc}</td>
              <td>${r.time}</td>
              <td style="color: #27ae60; font-weight: bold;">${r.votesYes}</td>
              <td style="color: #c0392b; font-weight: bold;">${r.votesNo}</td>
              <td style="color: #2980b9;">${r.location.lat}, ${r.location.lng}</td>
            </tr>
        `;
    });
    
    tableHTML += `</tbody></table></body></html>`;
    
    // Crear el archivo .xls
    const blob = new Blob([tableHTML], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Reporte_CampuSafe_" + new Date().toISOString().split('T')[0] + ".xls");
    document.body.appendChild(link); // Requerido por Firefox
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// MAPA DE CALOR (HEATMAP)
// ==========================================
let dashboardMap;
let heatmap;
let mapsApiLoaded = false;

// Llamado por Google Maps cuando termina de descargar el script
function initDashboardMap() {
    mapsApiLoaded = true;
    // Si el administrador ya inició sesión y el contenedor es visible, dibujar el mapa
    if (isAdmin) {
        setupDashboardMap();
    }
}

async function setupDashboardMap() {
    if (!mapsApiLoaded || dashboardMap) return; // Evitar inicializar dos veces
    
    // Inicializar mapa centrado en el campus
    const fimeCenter = { lat: 25.72522, lng: -100.31346 };
    dashboardMap = new google.maps.Map(document.getElementById("heatmap-container"), {
        center: fimeCenter,
        zoom: 16,
        mapTypeId: 'satellite',
        disableDefaultUI: false, // El director sí necesita controles
    });
    
    // Obtener todos los reportes de la BD
    const analytics = await db.getAnalytics();
    const reports = analytics.allReports;
    
    // Convertir ubicaciones al formato de Heatmap de Google
    const heatMapData = reports.map(r => {
        return new google.maps.LatLng(r.location.lat, r.location.lng);
    });
    
    heatmap = new google.maps.visualization.HeatmapLayer({
        data: heatMapData,
        map: dashboardMap,
        radius: 40, // Tamaño de las manchas de calor
        opacity: 0.8
    });
    
    // Actualizar el heatmap automáticamente si se añade un nuevo reporte en tiempo real
    db.onReportsSnapshot(async () => {
        const updatedAnalytics = await db.getAnalytics();
        const newData = updatedAnalytics.allReports.map(r => new google.maps.LatLng(r.location.lat, r.location.lng));
        heatmap.setData(newData);
    });
}

// ==========================================
// MODO SANDBOX (SIMULACIÓN DE 24 HORAS)
// ==========================================
function simularEntorno() {
    if(!confirm("⚠️ MODO SANDBOX ⚠️\n\n¿Quieres inyectar 24 reportes simulados alrededor del campus? Esto te servirá para probar el Heatmap y exportar datos ficticios sin afectar la app real.\n(Ojo: esto sobreescribirá tu historial local).")) return;
    
    const tipos = ['bache', 'trafico', 'cerrada'];
    const descripciones = ["Terrible estado del pavimento", "Mucho tráfico por entrada principal", "Obras no terminadas", "Choque menor causando lentitud", "Calle cerrada por evento", "Bache profundo, cuidado", "Semáforo descompuesto"];
    
    // Coordenadas base (Centro de FIME)
    const baseLat = 25.72522;
    const baseLng = -100.31346;
    
    let simulacion = [];
    const now = new Date();
    
    for(let i = 0; i < 24; i++) {
        // Dispersión aleatoria alrededor del campus (aprox +- 300 metros)
        const offsetLat = (Math.random() - 0.5) * 0.005;
        const offsetLng = (Math.random() - 0.5) * 0.005;
        
        // Simular horas pasadas (entre hace 1 y 24 horas)
        let horaSimulada = new Date(now.getTime() - (Math.random() * 24 * 60 * 60 * 1000));
        let hourFormat = horaSimulada.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        simulacion.push({
            id: 'sim_' + Math.random().toString(36).substr(2, 9),
            type: tipos[Math.floor(Math.random() * tipos.length)],
            desc: descripciones[Math.floor(Math.random() * descripciones.length)] + " (Dato Simulado)",
            location: { lat: baseLat + offsetLat, lng: baseLng + offsetLng },
            time: hourFormat,
            timestamp: horaSimulada.getTime(),
            userId: 'sandbox_bot',
            votesYes: Math.floor(Math.random() * 10), // Votos simulados
            votesNo: Math.floor(Math.random() * 2),
            status: (Math.random() > 0.8) ? 'resuelto' : 'activo' // 20% ya resueltos
        });
    }
    
    localStorage.setItem('fime_reports', JSON.stringify(simulacion));
    alert("✅ 24 Alertas simuladas generadas con éxito.\nEl sistema se recargará para mostrar el nuevo Heatmap y Dashboard.");
    location.reload();
}
