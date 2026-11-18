// js/modules/updateMethods.js — Détection des nouvelles versions déployées
//
// Fonctionnement :
//   1. APP_VERSION est déduite AUTOMATIQUEMENT du ?v=N de son propre import
//      (dans app.js : import ... from './modules/updateMethods.js?v=N').
//      → plus aucun numéro à maintenir à la main dans ce fichier.
//   2. version.json (racine du dépôt) porte la version réellement en ligne.
//   3. Si les deux diffèrent → bandeau "Mise à jour disponible".
//
// ⚠️ À CHAQUE DÉPLOIEMENT, deux endroits seulement doivent porter le même numéro :
//      - le champ "version" de version.json
//      - les ?v=N des imports dans app.js + le tag <script> d'index.html
//    (les fichiers générés le font déjà, rien à éditer à la main)

// Lit le numéro de version depuis l'URL d'import de ce module.
function readVersionFromImportUrl() {
    try {
        const m = String(import.meta.url).match(/[?&]v=([^&#]+)/);
        return m ? decodeURIComponent(m[1]) : '';
    } catch (e) {
        return '';
    }
}

// Repli sur '0' si le paramètre est absent : on préfère afficher le bandeau
// une fois de trop que de laisser un utilisateur sur une version périmée.
export const APP_VERSION = readVersionFromImportUrl() || '0';

// Intervalle de vérification en arrière-plan (10 minutes)
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

// Mémorise la dernière version pour laquelle une mise à jour a déjà été tentée.
// Évite le bandeau en boucle si le rechargement ne résout pas l'écart
// (fichier oublié au déploiement, cache récalcitrant…).
const ATTEMPT_KEY = 'bobUpdateAttempt';

function getAttempt() {
    try { return sessionStorage.getItem(ATTEMPT_KEY) || ''; } catch (e) { return ''; }
}
function setAttempt(v) {
    try { sessionStorage.setItem(ATTEMPT_KEY, v); } catch (e) { /* ignore */ }
}

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

                // Garde-fou : on a déjà rechargé pour cette version et l'écart
                // persiste → inutile de harceler. On prévient une seule fois.
                if (getAttempt() === serverVersion && !manual) {
                    this.updateAvailable = false;
                    if (!this._updateWarned) {
                        this._updateWarned = true;
                        console.warn(
                            `[MAJ] Écart persistant : version.json = ${serverVersion}, ` +
                            `module chargé = ${APP_VERSION}. ` +
                            `Vérifier que tous les fichiers du déploiement sont bien en ligne.`
                        );
                    }
                    return;
                }

                // Ne pas re-proposer une version déjà ignorée par l'utilisateur
                if (this.updateDismissedVersion !== serverVersion) {
                    this.updateAvailable = true;
                }
            } else {
                this.updateAvailable = false;
                setAttempt('');   // tout est aligné : on repart propre
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
        // Trace la tentative AVANT de recharger : si l'écart persiste au retour,
        // le garde-fou ci-dessus empêchera le bandeau de revenir en boucle.
        setAttempt(this.serverVersion || '');

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
