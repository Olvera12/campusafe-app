
    lucide.createIcons();

    let map;
    let savedReports = [];
    let currentReportLocation = null;
    let currentReportType = "";
    
    // Variables para el modo verificación
    let activeViewingReportId = null;
    let activeVerifyReportId = null;
    let viewingMarker3D = null; // El marcador físico en Street View

    const reportIcons = {
      'Bache': { icon: 'triangle-alert', color: '#ff3b3b' },
      'Tráfico': { icon: 'car', color: '#f1c40f' },
      'Bloqueo': { icon: 'traffic-cone', color: '#e67e22' }
    };
    
    let activeMapMarkers = {}; // Para limpiar marcadores resueltos en el mapa
    
    db.onReportsSnapshot((reports) => {
      savedReports = reports;
      
      // Sincronizar UI de listas
      if (document.getElementById('screen-feed').style.display === 'block') {
        renderList('feed-list-container', false);
      } else if (document.getElementById('screen-profile').style.display === 'block' && isLoggedIn) {
        renderList('my-reports-list', true);
      }
      
      // Sincronizar Marcadores 3D del Mapa
      if (typeof map !== 'undefined') syncMapMarkers(reports);
    });

    function syncMapMarkers(reports) {
      // 1. Borrar marcadores que ya no existen (ej. resueltos)
      const currentIds = reports.map(r => r.id);
      Object.keys(activeMapMarkers).forEach(id => {
        if (!currentIds.includes(id)) {
          activeMapMarkers[id].setMap(null);
          delete activeMapMarkers[id];
        }
      });
      // 2. Crear los nuevos
      reports.forEach(report => {
        if (!activeMapMarkers[report.id]) {
          activeMapMarkers[report.id] = createMapMarker(report);
        }
      });
    }

    function createMapMarker(report) {
      const config = reportIcons[report.type];
      const markerDiv = document.createElement('div');
      markerDiv.className = `custom-map-marker marker-${report.type}`;
      markerDiv.innerHTML = `<i data-lucide="${config.icon}"></i>`;
      
      class CustomMarker extends google.maps.OverlayView {
        constructor(position, content) { super(); this.position = position; this.content = content; }
        onAdd() {
          this.getPanes().overlayMouseTarget.appendChild(this.content);
          this.content.addEventListener('click', (e) => {
            e.stopPropagation();
            openViewReportModal(report.id);
          });
          setTimeout(() => lucide.createIcons({ root: this.content }), 10);
        }
        draw() {
          const pos = this.getProjection().fromLatLngToDivPixel(this.position);
          this.content.style.position = 'absolute';
          this.content.style.left = (pos.x - 20) + 'px';
          this.content.style.top = (pos.y - 20) + 'px';
        }
        onRemove() { if(this.content.parentNode) this.content.parentNode.removeChild(this.content); }
      }
      const m = new CustomMarker(report.location, markerDiv);
      m.setMap(map);
      return m;
    } function initMap() {
      const fimeCenter = { lat: 25.72522, lng: -100.31346 };
      map = new google.maps.Map(document.getElementById("map"), {
        center: fimeCenter, zoom: 17, mapTypeId: 'satellite', disableDefaultUI: true
      });

      const svService = new google.maps.StreetViewService();
      const panorama = map.getStreetView();
      panorama.setOptions({ clickToGo: false, disableDefaultUI: true });

      // Si el usuario arrastra la cámara, cerramos el menú para que no parezca que "flota" sobre la calle
      panorama.addListener('pov_changed', () => {
        const menu = document.getElementById('sao-menu');
        if (menu.style.display === 'block') {
          closeMenu();
        }
      });

      map.addListener("click", (e) => {
        closeMenu();
        if (e.latLng) {
          svService.getPanorama({ location: e.latLng, radius: 50 }, (data, status) => {
            if (status === "OK") {
              panorama.setPano(data.location.pano);
              panorama.setPov({ heading: 270, pitch: 0 });
              panorama.setVisible(true);
              document.getElementById('back-btn').style.display = 'flex';
            } else {
              alert("No hay vista de calle aquí. Toca más cerca de una avenida.");
            }
          });
        }
      });
      
      // Asegurarse de dibujar los marcadores que la BD ya había cargado en memoria antes de que Google Maps estuviera listo
      syncMapMarkers(savedReports);
    }

    // MOTOR DE RAYCASTING MATEMÁTICO PARA STREET VIEW
    function getEstimatedLatLng(panorama, x, y) {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const pov = panorama.getPov();
      const pos = panorama.getPosition();
      
      if (!pos || !google.maps.geometry) return pos;

      const dx = x - W / 2;
      const dy = y - H / 2;
      
      // Aproximación del Campo de Visión (FOV)
      const tapHeading = pov.heading + (dx / W) * 90;
      let tapPitch = pov.pitch - (dy / H) * 90;
      
      // Prevenir infinito si tocan el cielo
      if (tapPitch >= -3) tapPitch = -3; 

      const cameraHeight = 2.5; // Metros de altura del carro de Google
      const distance = cameraHeight / Math.tan(Math.abs(tapPitch) * Math.PI / 180);
      
      // Limitar distancia a 60 metros máximo
      const finalDistance = Math.min(distance, 60);

      return google.maps.geometry.spherical.computeOffset(pos, finalDistance, tapHeading);
    }

    // CLIC MÓVIL EN STREET VIEW
    let startX = 0, startY = 0, startTime = 0;
    function handleStart(e, x, y) { 
      startX = x; startY = y; startTime = Date.now(); 
    }
    
    function handleEnd(e, x, y) {
      if (e.target.closest('.modal-overlay') || 
          e.target.closest('.bottom-nav') || 
          e.target.closest('.back-btn') || 
          e.target.closest('.sao-menu-overlay') || 
          e.target.closest('.title-overlay') ||
          e.target.closest('.dismissButton')) {
        return;
      }

      if (Math.abs(x - startX) < 10 && Math.abs(y - startY) < 10 && (Date.now() - startTime) < 300) {
        if (map && map.getStreetView().getVisible()) {
          if (!activeVerifyReportId) {
            const menu = document.getElementById('sao-menu');
            if (menu.style.display === 'none' || menu.style.display === '') {
              // Calcular coordenada 3D exacta basada en el píxel tocado
              currentReportLocation = getEstimatedLatLng(map.getStreetView(), x, y);
              openMenu(x, y);
            }
          }
        }
      }
    }
    
    window.addEventListener('touchstart', (e) => handleStart(e, e.touches[0].clientX, e.touches[0].clientY), {passive: true});
    window.addEventListener('touchend', (e) => handleEnd(e, e.changedTouches[0].clientX, e.changedTouches[0].clientY), {passive: true});
    window.addEventListener('mousedown', (e) => handleStart(e, e.clientX, e.clientY));
    window.addEventListener('mouseup', (e) => handleEnd(e, e.clientX, e.clientY));

    const menuEl = document.getElementById('sao-menu');
    function openMenu(x, y) {
      menuEl.style.display = 'block';
      menuEl.style.left = x + 'px';
      menuEl.style.top = y + 'px';
      const ripple = document.getElementById('sao-ripple');
      ripple.classList.remove('animate');
      void ripple.offsetWidth; 
      ripple.classList.add('animate');
      setTimeout(() => {
        document.getElementById('sao-close').classList.add('open');
        document.querySelectorAll('.sao-item').forEach(el => el.classList.add('open'));
      }, 50);
    }

    function closeMenu() {
      document.getElementById('sao-close').classList.remove('open');
      document.querySelectorAll('.sao-item').forEach(el => el.classList.add('open'));
      setTimeout(() => { menuEl.style.display = 'none'; }, 300);
    }
    document.getElementById('sao-close').addEventListener('click', closeMenu);

    function closeModals() {
      document.querySelectorAll('.modal-overlay').forEach(el => el.style.display = 'none');
    }

    function openAddDetailsModal(tipo) {
      closeMenu();
      currentReportType = tipo;
      const config = reportIcons[tipo];
      document.getElementById('add-modal-title').innerText = "Reportar " + tipo;
      document.getElementById('add-modal-desc').value = "";
      document.getElementById('add-modal-icon').setAttribute('data-lucide', config.icon);
      document.getElementById('add-modal-icon').setAttribute('color', config.color);
      lucide.createIcons();
      document.getElementById('modal-add-details').style.display = 'flex';
    }

    async function submitReport() {
      const desc = document.getElementById('add-modal-desc').value.trim() || "Sin detalles adicionales.";
      
      await db.addReport({
        type: currentReportType,
        desc: desc,
        location: currentReportLocation,
        cameraPosition: map.getStreetView().getPosition(),
        cameraPov: map.getStreetView().getPov(),
        votesYes: 1, votesNo: 0,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      });
      
      closeModals();
      document.getElementById('add-modal-desc').value = '';
      map.getStreetView().setVisible(false);
      document.getElementById('back-btn').style.display = 'none';
      alert(`¡Reporte publicado!`);
    }

    function openViewReportModal(reportId) {
      const report = savedReports.find(r => r.id === reportId);
      if(!report) return;
      activeViewingReportId = reportId;

      document.getElementById('view-modal-title').innerText = report.type;
      document.getElementById('view-modal-desc').innerText = `"${report.desc}" \n\n (Votos: ${report.votesYes} Sí / ${report.votesNo} No)`;
      document.getElementById('view-modal-time').innerText = "Reportado a las " + report.time;
      
      const config = reportIcons[report.type];
      document.getElementById('view-modal-icon').setAttribute('data-lucide', config.icon);
      document.getElementById('view-modal-icon').setAttribute('color', config.color);
      lucide.createIcons();

      document.getElementById('modal-view-report').style.display = 'flex';
    }

    function teleportToReport() {
      const report = savedReports.find(r => r.id === activeViewingReportId);
      if(report) {
        closeModals();
        switchTab('map'); 
        
        activeVerifyReportId = report.id;
        
        const panorama = map.getStreetView();
        
        // Mover la cámara a la posición guardada (o la ubicación del reporte como fallback)
        panorama.setPosition(report.cameraPosition || report.location);
        
        // Calcular el ángulo para que la cámara gire automáticamente mirando al reporte
        let heading = panorama.getPov().heading;
        if (google.maps.geometry && google.maps.geometry.spherical) {
            heading = google.maps.geometry.spherical.computeHeading(panorama.getPosition(), report.location);
        }
        
        // Nos alejamos ligeramente para no estar parados "dentro" del punto
        panorama.setPov({ heading: heading, pitch: -15 });
        panorama.setVisible(true);
        document.getElementById('back-btn').style.display = 'flex';
        
        // Poner marcador físico 3D con forma de PUNTITO AMARILLO (SAO) en las coordenadas exactas del asfalto
        if(viewingMarker3D) viewingMarker3D.setMap(null);
        viewingMarker3D = new google.maps.Marker({
          position: report.location,
          map: panorama,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: "#ff9900",
            fillOpacity: 1,
            strokeWeight: 4,
            strokeColor: "#ffffff"
          }
        });
      }
    }

    function attemptExitStreetView() {
      if (activeVerifyReportId) {
        document.getElementById('modal-vote').style.display = 'flex';
      } else {
        forceExitStreetView();
      }
    }

    async function submitVote(type) {
      if (!activeVerifyReportId) return;
      await db.updateReportVotes(activeVerifyReportId, type);
      document.getElementById('modal-vote').style.display = 'none';
      
      forceExitStreetView();
    }
    


    let isLoggedIn = false;
    let currentUser = db.getCurrentUser();
    if (currentUser) {
       isLoggedIn = true;
    }

    function updateProfileView() {
      if (isLoggedIn) {
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('logged-view').style.display = 'block';
        renderList('my-reports-list', true);
      } else {
        document.getElementById('login-view').style.display = 'flex';
        document.getElementById('logged-view').style.display = 'none';
      }
    }
    
    async function doLogin() {
      const user = document.getElementById('login-user').value;
      const pass = document.getElementById('login-pass').value;
      if (!user) { alert("Ingresa tu matrícula"); return; }
      
      currentUser = await db.login(user, pass);
      isLoggedIn = true;
      updateProfileView();
    }
    
    function doLogout() {
      db.logout();
      isLoggedIn = false;
      currentUser = null;
      document.getElementById('login-user').value = '';
      document.getElementById('login-pass').value = '';
      updateProfileView();
    }

    function switchTab(tab) {
      if (viewingMarker3D) { viewingMarker3D.setMap(null); viewingMarker3D = null; }
      activeVerifyReportId = null;
      document.getElementById('verify-overlay').style.display = 'none';
      document.getElementById('sao-menu').style.display = 'none';

      document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
      const activeBtn = document.querySelector(`.nav-item[onclick="switchTab('${tab}')"]`);
      if(activeBtn) activeBtn.classList.add('active');

      if (tab === 'map') {
        document.getElementById('screen-map').style.display = 'block';
        document.getElementById('screen-feed').style.display = 'none';
        document.getElementById('screen-profile').style.display = 'none';
      } else if (tab === 'feed') {
        document.getElementById('screen-map').style.display = 'none';
        document.getElementById('screen-feed').style.display = 'block';
        document.getElementById('screen-profile').style.display = 'none';
        renderList('feed-list-container', false);
      } else if (tab === 'profile') {
        document.getElementById('screen-map').style.display = 'none';
        document.getElementById('screen-feed').style.display = 'none';
        document.getElementById('screen-profile').style.display = 'block';
        updateProfileView();
      }
    }

    function forceExitStreetView() {
      activeVerifyReportId = null;
      if (viewingMarker3D) {
        viewingMarker3D.setMap(null);
        viewingMarker3D = null;
      }
      map.getStreetView().setVisible(false);
      document.getElementById('back-btn').style.display = 'none';
      closeMenu();
    }

    function renderList(containerId, onlyMine) {
      const container = document.getElementById(containerId);
      container.innerHTML = '';
      
      let filtered = savedReports;
      if (onlyMine) {
        // En la vida real, se filtra por userId
        const user = db.getCurrentUser();
        if (user) {
           filtered = savedReports.filter(r => r.userId === user.matricula);
        } else {
           filtered = [];
        }
      }

      if (filtered.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#7f8c8d; margin-top:50px;">Aún no hay reportes.</p>';
        return;
      }

      const sorted = [...filtered].reverse();
      sorted.forEach(report => {
        const config = reportIcons[report.type];
        const card = document.createElement('div');
        card.className = `report-card type-${report.type}`;
        card.innerHTML = `
          <div id="thumb-${report.id}" class="card-sv-thumbnail"></div>
          <div class="card-content-overlay">
            <div class="card-header">
              <span class="card-type" style="color: ${config.color}"><i data-lucide="${config.icon}" style="width:18px;"></i> ${report.type}</span>
              <span class="card-time">${report.time}</span>
            </div>
            <div class="card-body-wrapper">
              <div class="card-desc">"${report.desc}"</div>
              <div class="card-votes">
                <span><i data-lucide="thumbs-up" style="width:14px;"></i> ${report.votesYes} Sigue ahí</span>
                <span><i data-lucide="thumbs-down" style="width:14px;"></i> ${report.votesNo} Ya no</span>
              </div>
              <button class="btn-view-map" onclick="openViewReportModal(${report.id})">
                <i data-lucide="map-pin" style="width:16px;"></i> Ver Detalles
              </button>
            </div>
          </div>
        `;
        container.appendChild(card);
        
        // Inicializar miniatura de Street View en la tarjeta
        setTimeout(() => {
          const thumbEl = document.getElementById(`thumb-${report.id}`);
          if (thumbEl) {
             try {
                 // Fallback para reportes muy viejos que no tenían cámara guardada
                 const pos = report.cameraPosition || report.location;
                 
                 const pano = new google.maps.StreetViewPanorama(thumbEl, {
                    position: pos,
                    pov: report.cameraPov || { heading: 0, pitch: 0 },
                    zoom: (report.cameraPov && report.cameraPov.zoom) ? report.cameraPov.zoom : 0,
                    disableDefaultUI: true,
                    clickToGo: false,
                    linksControl: false,
                    panControl: false,
                    zoomControl: false,
                    gestureHandling: 'none'
                 });
                 
                 // Poner el puntito amarillo exactamente en el lugar
                 new google.maps.Marker({
                   position: report.location,
                   map: pano,
                   icon: {
                     path: google.maps.SymbolPath.CIRCLE,
                     scale: 8,
                     fillColor: "#ff9900",
                     fillOpacity: 1,
                     strokeWeight: 2,
                     strokeColor: "#ffffff"
                   }
                 });
             } catch(e) {
                 console.error("Error al cargar la miniatura de SV", e);
             }
          }
        }, 100);
      });
      lucide.createIcons();
    }

    setInterval(() => {
      const dismissBtn = document.querySelector('.dismissButton');
      if (dismissBtn) dismissBtn.click();
    }, 500);
  
