// db.js - Capa de Abstracción de Base de Datos para CampuSafe
// CONECTADO A FIREBASE FIRESTORE EN LA NUBE

const firebaseConfig = {
  apiKey: "AIzaSyDNWFlw67z4VgE2JHy0P7FKbNvYkaau1CQ",
  authDomain: "campusafe-f6833.firebaseapp.com",
  projectId: "campusafe-f6833",
  storageBucket: "campusafe-f6833.firebasestorage.app",
  messagingSenderId: "276929341900",
  appId: "1:276929341900:web:b7df93ab877658af649569",
  measurementId: "G-DE28FF10XL"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

class FimeDatabase {
    constructor() {
        this.listeners = [];
        // Eliminado MockDB (LocalStorage), todo es la Nube.
    }

    // ==========================================
    // AUTENTICACIÓN (Sesión persistente)
    // ==========================================
    async login(matricula, password) {
        return new Promise((resolve, reject) => {
            const userId = matricula.toLowerCase().trim();
            const isSpecialAccount = userId === 'admin' || userId === 'rector' || !userId.includes('@');
            
            if (!isSpecialAccount && !userId.endsWith('@uanl.edu.mx')) {
                reject("Solo se permiten correos institucionales de la UANL (@uanl.edu.mx)");
                return;
            }
            
            let user = { 
                matricula: userId, 
                role: (userId === 'admin' || userId === 'rector') ? 'admin' : 'student' 
            };
            
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
    // FIRESTORE ABSTRACTION (Base de Datos Real)
    // ==========================================
    
    // onSnapshot: Escucha cambios en tiempo real desde la Nube de Google
    onReportsSnapshot(callback) {
        this.listeners.push(callback);
        
        firestore.collection("reports")
            .where("status", "!=", "resolved") // Filtro 1 de Firebase (Ahorro de lectura de datos)
            .onSnapshot((snapshot) => {
                const activeReports = [];
                const now = Date.now();
                const EIGHT_HOURS = 8 * 60 * 60 * 1000;

                snapshot.forEach((doc) => {
                    const r = { id: doc.id, ...doc.data() };
                    
                    // Filtro 2 (Auto-caducidad)
                    if ((r.type === 'trafico' || r.type === 'cerrada') && (now - r.timestamp > EIGHT_HOURS)) {
                        // Se ignora, no se empuja a la vista de los estudiantes
                    } else {
                        activeReports.push(r);
                    }
                });
                
                this.listeners.forEach(cb => cb(activeReports));
            }, (error) => {
                console.error("Error de Seguridad en Firestore: ", error);
                // NOTA: Si fallan los permisos de Firestore Rules, el error caerá aquí.
            });
    }

    // addDoc: Guardar reporte en la nube
    async addReport(reportData) {
        const user = this.getCurrentUser();
        const newReport = {
            ...reportData,
            status: 'active',
            timestamp: Date.now(),
            userId: user ? user.matricula : 'anonimo'
        };
        
        try {
            const docRef = await firestore.collection("reports").add(newReport);
            newReport.id = docRef.id;
            return newReport;
        } catch(e) {
            console.error("Error añadiendo reporte: ", e);
            throw e;
        }
    }

    // updateDoc: Votar con incrementos atómicos para concurrencia
    async updateReportVotes(reportId, voteType) {
        const reportRef = firestore.collection("reports").doc(reportId);
        try {
            if (voteType === 'yes') {
                await reportRef.update({
                    votesYes: firebase.firestore.FieldValue.increment(1)
                });
            } else if (voteType === 'no') {
                await reportRef.update({
                    votesNo: firebase.firestore.FieldValue.increment(1)
                });
            }
        } catch(e) {
            console.error("Error votando: ", e);
        }
    }

    // updateDoc: Resolver problema (Dashboard Universitario)
    async resolveReport(reportId) {
        const reportRef = firestore.collection("reports").doc(reportId);
        try {
            await reportRef.update({
                status: 'resolved',
                resolvedAt: Date.now()
            });
        } catch(e) {
            console.error("Error resolviendo reporte: ", e);
        }
    }

    // ==========================================
    // SISTEMA DE VERIFICACIÓN (8 HORAS)
    // ==========================================
    
    async getReportsPendingVerification(userId) {
        try {
            const snapshot = await firestore.collection("reports")
                .where("userId", "==", userId)
                .where("status", "in", ["active", "activo"]) // Evitamos pedir verificar los resueltos
                .get();
                
            const pending = [];
            const now = Date.now();
            const EIGHT_HOURS = 8 * 60 * 60 * 1000;
            
            snapshot.forEach(doc => {
                const r = { id: doc.id, ...doc.data() };
                if ((r.type === 'trafico' || r.type === 'cerrada') && (now - r.timestamp > EIGHT_HOURS)) {
                    pending.push(r);
                }
            });
            return pending;
        } catch(e) {
            console.error("Error obteniendo pendientes: ", e);
            return [];
        }
    }

    async renewReport(reportId) {
        const reportRef = firestore.collection("reports").doc(reportId);
        try {
            await reportRef.update({
                timestamp: Date.now() // Reiniciar el reloj
            });
        } catch(e) {
            console.error("Error renovando reporte: ", e);
        }
    }

    // getDocs: Para analíticas del Dashboard Institucional (Heatmap y Excel)
    async getAnalytics() {
        try {
            const snapshot = await firestore.collection("reports").get();
            let total = 0, active = 0, resolved = 0;
            const typeCount = {};
            const allReports = [];

            snapshot.forEach(doc => {
                const r = { id: doc.id, ...doc.data() };
                allReports.push(r);
                total++;
                if (r.status === 'resolved' || r.status === 'resuelto') resolved++;
                else active++;
                
                typeCount[r.type] = (typeCount[r.type] || 0) + 1;
            });

            return { total, active, resolved, typeCount, allReports };
        } catch(e) {
            console.error("Error en Analytics: ", e);
            return { total:0, active:0, resolved:0, typeCount:{}, allReports: [] };
        }
    }
}

// Instancia global
const db = new FimeDatabase();
