// js/modules/updateMethods.js — Détection des nouvelles versions déployées
//
// Fonctionnement :
//   1. APP_VERSION ci-dessous est figée à la génération des fichiers.
//   2. version.json (à la racine du dépôt) porte la version réellement en ligne.
//   3. Si les deux diffèrent → bandeau "Mise à jour disponible".
//
// ⚠️ À CHAQUE DÉPLOIEMENT, trois endroits doivent porter le MÊME numéro :
//      - APP_VERSION ci-dessous
//      - le champ "version" de version.json
//      - les ?v=N des imports dans app.js + index.html
//    (les fichiers générés le font déjà, rien à éditer à la main)

export const APP_VERSION = '13';

// Intervalle de vérification en arrière-plan (10 minutes)
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

export const updateMethods = {

    // --- DÉMARRAGE DE LA SURVEILLANCE ---
    startUpdateChecker() {
        this.appVersion = APP_VERSION;

        // Vérification immédiate (léger différé pour ne pas gêner le 1er rendu)
        setTimeout(() => this.checkForUpdate(), 3000);

        // Vérification périodique
        if (this._updateTimer) clearInterval(this._updateTimer);
        this._updateTimer = setInterval(() => this.checkForUpdate(), CHECK_INTERVAL_MS);

        // Vérification au retour sur l'onglet / réveil de l'appareil.
        // C'est le déclencheur le plus utile sur iPad, où l'app reste
        // ouverte des jours durant en arrière-plan.
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.checkForUpdate();
        });
        window.addEventListener('focus', () => this.checkForUpdate());
    },

    // --- VÉRIFICATION ---
    async checkForUpdate(manual = false) {
        try {
            // cache:'no-store' → jamais servi depuis le cache, même sur Safari iOS
            const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            const serverVersion = String(data.version || '').trim();
            if (!serverVersion) return;

            this.updateNotes = data.notes || '';

            if (serverVersion !== APP_VERSION) {
                this.serverVersion = serverVersion;
                // Ne pas re-proposer une version déjà ignorée par l'utilisateur
                if (this.updateDismissedVersion !== serverVersion) {
                    this.updateAvailable = true;
                }
            } else {
                this.updateAvailable = false;
                if (manual) {
                    Swal.fire({
                        title: 'Bob est à jour ✓',
                        html: `<span class="text-sm text-slate-500">Version ${APP_VERSION}</span>`,
                        icon: 'success', toast: true, position: 'top-end',
                        timer: 2500, showConfirmButton: false,
                    });
                }
            }
        } catch (e) {
            // Hors ligne ou version.json absent : on ignore silencieusement.
        }
    },

    // --- IGNORER (jusqu'à la prochaine version) ---
    dismissUpdate() {
        this.updateDismissedVersion = this.serverVersion || '';
        this.updateAvailable = false;
    },

    // --- APPLIQUER LA MISE À JOUR ---
    async applyUpdate() {
        try {
            // 1. Vider les caches gérés par le navigateur (PWA / Cache Storage)
            if (window.caches && caches.keys) {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
            }
            // 2. Désinscrire un éventuel service worker
            if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map(r => r.unregister()));
            }
        } catch (e) { /* non bloquant */ }

        // 3. Recharger sur une URL neuve : le paramètre change à chaque fois,
        //    ce qui force Safari iOS à refaire une vraie requête réseau.
        const url = new URL(window.location.href);
        url.searchParams.set('v', this.serverVersion || String(Date.now()));
        window.location.replace(url.toString());
    },
};
