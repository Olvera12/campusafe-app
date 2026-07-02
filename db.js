// db.js - Capa de Abstracción de Base de Datos para CampuSafe
// Arquitectura preparada para migrar a Firebase (Firestore) cambiando solo el interior de estas funciones.
// Actualmente usa LocalStorage avanzado para permitir demostraciones inmediatas sin configuración de API Keys,
// e incluye sincronización en tiempo real entre múltiples pestañas.

class FimeDatabase {
    constructor() {
        this.listeners = [];
        this.initMockDB();
        
        // Sincronización "Tiempo Real" simulada para cuando abres el dashboard y la app al mismo tiempo
        window.addEventListener('storage', (e) => {
            if (e.key === 'fime_reports') this._notifyListeners();
        });
        
        // Fallback de "Tiempo Real" para navegadores bloqueando eventos storage en archivos locales (file:///)
        if (window.location.protocol === 'file:') {
            let lastData = localStorage.getItem('fime_reports');
            setInterval(() => {
                const currentData = localStorage.getItem('fime_reports');
                if (currentData !== lastData) {
                    lastData = currentData;
                    this._notifyListeners();
                }
            }, 1000);
        }
    }

    initMockDB() {
        if (!localStorage.getItem('fime_reports')) {
            localStorage.setItem('fime_reports', JSON.stringify([]));
        }
        if (!localStorage.getItem('fime_users')) {
            localStorage.setItem('fime_users', JSON.stringify([]));
        }
    }

    // ==========================================
    // AUTENTICACIÓN (Preparado para Firebase Auth)
    // ==========================================
    async login(matricula, password) {
        return new Promise((resolve, reject) => {
            const userId = matricula.toLowerCase().trim();
            
            // Bypass para cuentas administrativas o demos locales
            const isSpecialAccount = userId === 'admin' || userId === 'rector' || !userId.includes('@');
            
            if (!isSpecialAccount && !userId.endsWith('@uanl.edu.mx')) {
                reject("Solo se permiten correos institucionales de la UANL (@uanl.edu.mx)");
                return;
            }
            
            let users = JSON.parse(localStorage.getItem('fime_users'));
            let user = users.find(u => u.matricula === userId);
            
            // Auto-registro para el prototipo
            if (!user) {
                user = { 
                    matricula: userId, 
                    role: (userId === 'admin' || userId === 'rector') ? 'admin' : 'student' 
                };
                users.push(user);
                localStorage.setItem('fime_users', JSON.stringify(users));
            }
            
            localStorage.setItem('fime_current_user', JSON.stringify(user));
            resolve(user);
        });
    }

    logout() {
        localStorage.removeItem('fime_current_user');
    }

    getCurrentUser() {
        const u = localStorage.getItem('fime_current_user');
        return u ? JSON.parse(u) : null;
    }

    // ==========================================
    // FIRESTORE ABSTRACTION (Base de Datos)
    // ==========================================
    
    // onSnapshot: Escucha cambios en tiempo real
    onReportsSnapshot(callback) {
        this.listeners.push(callback);
        this._notifyListeners();
    }

    _notifyListeners() {
        const reports = JSON.parse(localStorage.getItem('fime_reports')) || [];
        const now = Date.now();
        const EIGHT_HOURS = 8 * 60 * 60 * 1000;
        
        const activeReports = reports.filter(r => {
            if (r.status === 'resolved' || r.status === 'resuelto') return false;
            
            // Auto-caducidad: Tráfico o Calle Cerrada desaparecen después de 8 horas
            if ((r.type === 'trafico' || r.type === 'cerrada') && (now - r.timestamp > EIGHT_HOURS)) {
                return false;
            }
            return true;
        });
        
        this.listeners.forEach(cb => cb(activeReports));
    }

    // addDoc: Guardar reporte en la nube
    async addReport(reportData) {
        return new Promise((resolve) => {
            const reports = JSON.parse(localStorage.getItem('fime_reports'));
            const user = this.getCurrentUser();
            const newReport = {
                ...reportData,
                id: Date.now().toString(),
                status: 'active',
                timestamp: Date.now(),
                userId: user ? user.matricula : 'anonimo'
            };
            reports.push(newReport);
            localStorage.setItem('fime_reports', JSON.stringify(reports));
            this._notifyListeners();
            resolve(newReport);
        });
    }

    // updateDoc: Votar
    async updateReportVotes(reportId, voteType) {
        const reports = JSON.parse(localStorage.getItem('fime_reports'));
        const index = reports.findIndex(r => r.id === reportId);
        if (index > -1) {
            if (voteType === 'yes') reports[index].votesYes++;
            else if (voteType === 'no') reports[index].votesNo++;
            localStorage.setItem('fime_reports', JSON.stringify(reports));
            this._notifyListeners();
        }
    }

    // updateDoc: Resolver problema (Dashboard Universitario)
    async resolveReport(reportId) {
        const reports = JSON.parse(localStorage.getItem('fime_reports'));
        const index = reports.findIndex(r => r.id === reportId);
        if (index > -1) {
            reports[index].status = 'resolved';
            reports[index].resolvedAt = Date.now();
            localStorage.setItem('fime_reports', JSON.stringify(reports));
            this._notifyListeners();
        }
    }

    // ==========================================
    // SISTEMA DE VERIFICACIÓN (8 HORAS)
    // ==========================================
    
    async getReportsPendingVerification(userId) {
        const reports = JSON.parse(localStorage.getItem('fime_reports')) || [];
        const now = Date.now();
        const EIGHT_HOURS = 8 * 60 * 60 * 1000;
        
        return reports.filter(r => {
            return r.userId === userId &&
                   r.status !== 'resolved' && r.status !== 'resuelto' &&
                   (r.type === 'trafico' || r.type === 'cerrada') &&
                   (now - r.timestamp > EIGHT_HOURS);
        });
    }

    async renewReport(reportId) {
        const reports = JSON.parse(localStorage.getItem('fime_reports')) || [];
        const index = reports.findIndex(r => r.id === reportId);
        if (index > -1) {
            reports[index].timestamp = Date.now(); // Reiniciar el reloj
            localStorage.setItem('fime_reports', JSON.stringify(reports));
            this._notifyListeners();
        }
    }

    // getDocs: Para analíticas del Dashboard
    async getAnalytics() {
        const reports = JSON.parse(localStorage.getItem('fime_reports')) || [];
        const active = reports.filter(r => r.status !== 'resolved').length;
        const resolved = reports.filter(r => r.status === 'resolved').length;
        
        const typeCount = {};
        reports.forEach(r => {
            typeCount[r.type] = (typeCount[r.type] || 0) + 1;
        });

        // Simular latencia de red para realismo
        return new Promise(resolve => setTimeout(() => {
            resolve({ total: reports.length, active, resolved, typeCount, allReports: reports });
        }, 300));
    }
}

// Instancia global
const db = new FimeDatabase();
