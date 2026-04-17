// js/modules/adminMethods.js — Méthodes Administration & Gestion BDD
// Section : entre // --- ADMIN --- et // --- FILTRES TAGS CARTE GEO ---

import { auth, dbFirestore }                                  from '../firebase.js';
import { doc, setDoc, getDoc, getDocs, collection }           from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export const adminMethods = {

    // --- ADMIN ---
    async refreshAdminStats() {
        await this.loadAdminUsers();
        Swal.fire({ title: 'Données actualisées ✓', icon: 'success', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
    },

    async loadAdminUsers() {
        try {
            const snapshot = await getDocs(collection(dbFirestore, "users_registry"));
            this.adminUsers = snapshot.docs.map(d => d.data()).sort((a, b) => (b.lastLogin || '').localeCompare(a.lastLogin || ''));
        } catch (e) {
            console.error("Erreur chargement utilisateurs:", e);
        }
    },

    // --- GESTION BASE DE DONNÉES (ADMIN) ---
    async exportFullDB() {
        try {
            Swal.fire({ title: 'Préparation...', text: 'Chargement de toutes les données...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            // Récupérer les données partagées depuis Firestore
            const annuaireSnap = await getDoc(doc(dbFirestore, "shared", "annuaire"));
            const configSnap   = await getDoc(doc(dbFirestore, "shared", "config"));

            const backup = {
                exportDate:      new Date().toISOString(),
                exportBy:        this.currentUserName,
                version:         '1.0',
                // Données utilisateur
                projects:        this.db.projects,
                tasks:           this.db.tasks,
                events:          this.db.events,
                templates:       this.db.templates,
                campaignHistory: this.db.campaignHistory,
                // Données partagées
                structures:      annuaireSnap.exists() ? (annuaireSnap.data().structures || [])    : this.db.structures,
                tagCategories:   annuaireSnap.exists() ? (annuaireSnap.data().tagCategories || []) : this.db.tagCategories,
                tagGenres:       annuaireSnap.exists() ? (annuaireSnap.data().tagGenres || [])     : this.db.tagGenres,
                tagReseaux:      annuaireSnap.exists() ? (annuaireSnap.data().tagReseaux || [])    : this.db.tagReseaux,
                tagKeywords:     annuaireSnap.exists() ? (annuaireSnap.data().tagKeywords || [])   : this.db.tagKeywords,
                // Config admin
                adminConfig:     configSnap.exists() ? configSnap.data() : {},
            };

            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            const date = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
            a.href     = url;
            a.download = `CoopArtBooking_backup_${date}.json`;
            a.click();
            URL.revokeObjectURL(url);

            Swal.fire({ title: 'Sauvegarde téléchargée ✓', icon: 'success', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
        } catch (e) {
            console.error("Erreur export:", e);
            Swal.fire('Erreur', 'Impossible de générer la sauvegarde : ' + e.message, 'error');
        }
    },

    async importFullDB(event) {
        const file = event.target.files[0];
        if (!file) return;
        event.target.value = '';

        const r = await Swal.fire({
            title: '⚠️ Restaurer la base ?',
            html: `Le fichier <b>${file.name}</b> va remplacer <b>toutes les données actuelles</b>.<br><br>Cette action est irréversible. Êtes-vous sûr ?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3b82f6',
            confirmButtonText: 'Oui, restaurer',
            cancelButtonText: 'Annuler'
        });
        if (!r.isConfirmed) return;

        try {
            Swal.fire({ title: 'Restauration...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const text    = await file.text();
            const backup  = JSON.parse(text);

            // Restaurer données utilisateur
            this.db.projects        = backup.projects        || [];
            this.db.tasks           = backup.tasks           || [];
            this.db.events          = backup.events          || [];
            this.db.templates       = backup.templates       || [];
            this.db.campaignHistory = backup.campaignHistory || [];

            // Restaurer données partagées
            this.db.structures    = backup.structures    || [];
            this.db.tagCategories = backup.tagCategories || [];
            this.db.tagGenres     = backup.tagGenres     || [];
            this.db.tagReseaux    = backup.tagReseaux    || [];
            this.db.tagKeywords   = backup.tagKeywords   || [];

            await this.saveDB();

            Swal.fire({
                title: 'Restauration réussie ✓',
                html: `Base restaurée depuis <b>${file.name}</b><br><small class="text-slate-500">Exporté le ${backup.exportDate ? new Date(backup.exportDate).toLocaleDateString('fr-FR') : '?'} par ${backup.exportBy || '?'}</small>`,
                icon: 'success',
                confirmButtonColor: '#3b82f6'
            });
        } catch (e) {
            console.error("Erreur import:", e);
            Swal.fire('Erreur', 'Fichier invalide ou corrompu : ' + e.message, 'error');
        }
    },

    async clearAnnuaire() {
        const r = await Swal.fire({
            title: '⚠️ Vider l\'annuaire partagé ?',
            html: 'Cela supprimera <b>toutes les structures, tous les contacts et tous les tags</b> de manière définitive.<br><br>Les événements, projets et tâches seront conservés.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#f97316',
            confirmButtonText: 'Oui, vider l\'annuaire',
            cancelButtonText: 'Annuler',
            input: 'text',
            inputPlaceholder: 'Tapez CONFIRMER pour valider',
            inputValidator: (v) => v !== 'CONFIRMER' ? 'Vous devez taper exactement CONFIRMER' : null
        });
        if (!r.isConfirmed) return;

        try {
            this.db.structures    = [];
            this.db.tagCategories = [];
            this.db.tagGenres     = [];
            this.db.tagReseaux    = [];
            this.db.tagKeywords   = [];
            await setDoc(doc(dbFirestore, "shared", "annuaire"), {
                structures: [], tagCategories: [], tagGenres: [], tagReseaux: [], tagKeywords: []
            });
            Swal.fire({ title: 'Annuaire vidé ✓', icon: 'success', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
        } catch (e) {
            Swal.fire('Erreur', 'Vidage impossible : ' + e.message, 'error');
        }
    },

    async clearAllData() {
        const r = await Swal.fire({
            title: '🚨 Tout réinitialiser ?',
            html: '<b>TOUTES les données seront supprimées</b> de manière définitive :<br>structures, contacts, événements, projets, tâches, tags, templates, historique...<br><br>La configuration admin sera conservée.',
            icon: 'error',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            confirmButtonText: 'Oui, tout supprimer',
            cancelButtonText: 'Annuler',
            input: 'text',
            inputPlaceholder: 'Tapez TOUT SUPPRIMER pour valider',
            inputValidator: (v) => v !== 'TOUT SUPPRIMER' ? 'Vous devez taper exactement TOUT SUPPRIMER' : null
        });
        if (!r.isConfirmed) return;

        try {
            Swal.fire({ title: 'Réinitialisation...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            // Vider local
            this.db.projects        = [];
            this.db.tasks           = [];
            this.db.events          = [];
            this.db.templates       = [];
            this.db.campaignHistory = [];
            this.db.structures      = [];
            this.db.tagCategories   = [];
            this.db.tagGenres       = [];
            this.db.tagReseaux      = [];
            this.db.tagKeywords     = [];

            // Vider Firebase
            await setDoc(doc(dbFirestore, "users", this.currentUser), {
                projects: [], tasks: [], events: [], templates: [], campaignHistory: []
            });
            await setDoc(doc(dbFirestore, "shared", "annuaire"), {
                structures: [], tagCategories: [], tagGenres: [], tagReseaux: [], tagKeywords: []
            });

            Swal.fire({ title: 'Base réinitialisée ✓', text: 'Toutes les données ont été supprimées.', icon: 'success', confirmButtonColor: '#dc2626' });
        } catch (e) {
            Swal.fire('Erreur', 'Réinitialisation impossible : ' + e.message, 'error');
        }
    },

    async activateSelfAsAdmin() {
        const email = auth.currentUser?.email;
        if (!email) return Swal.fire('Erreur', 'Impossible de récupérer votre email.', 'error');
        const r = await Swal.fire({
            title: 'Activer les droits Admin ?',
            html: `Votre compte <b>${email}</b> sera enregistré comme administrateur dans Firebase.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#f59e0b',
            confirmButtonText: 'Oui, m\'activer',
            cancelButtonText: 'Annuler'
        });
        if (!r.isConfirmed) return;
        if (!this.adminEmails.includes(email)) this.adminEmails.push(email);
        await this.saveAdminConfig();
        this.isAdmin = true;
        Swal.fire({ title: '✅ Admin activé !', text: "L'onglet Administration est maintenant disponible dans le menu.", icon: 'success', confirmButtonColor: '#f59e0b' });
    },

    async addChangelogEntry() {
        if (!this.newChangelogEntry.trim()) return;
        const entry = {
            id:     Date.now().toString(),
            text:   this.newChangelogEntry.trim(),
            date:   new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
            author: this.currentUserName
        };
        this.adminChangelog.unshift(entry);
        this.newChangelogEntry = '';
        await this.saveAdminConfig();
        Swal.fire({ title: 'Note publiée ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

    async deleteChangelogEntry(id) {
        this.adminChangelog = this.adminChangelog.filter(e => e.id !== id);
        await this.saveAdminConfig();
    },

    async addAdminEmail() {
        const email = (this.newAdminEmail || '').trim().toLowerCase();
        if (!email || !email.includes('@')) return Swal.fire('Erreur', 'Email invalide.', 'warning');
        if (this.adminEmails.includes(email)) return Swal.fire('Info', 'Cet email est déjà admin.', 'info');
        this.adminEmails.push(email);
        this.newAdminEmail = '';
        await this.saveAdminConfig();
        Swal.fire({ title: 'Admin ajouté ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

    async removeAdminEmail(email) {
        if (email === this.currentUserName || email === auth.currentUser?.email) {
            return Swal.fire('Attention', 'Vous ne pouvez pas vous retirer vous-même.', 'warning');
        }
        const r = await Swal.fire({ title: 'Retirer cet admin ?', text: email, icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' });
        if (r.isConfirmed) {
            this.adminEmails = this.adminEmails.filter(e => e !== email);
            await this.saveAdminConfig();
        }
    },

    async saveAdminConfig() {
        try {
            await setDoc(doc(dbFirestore, "shared", "config"), {
                adminEmails: this.adminEmails,
                changelog:   this.adminChangelog,
            });
        } catch (e) {
            console.error("Erreur sauvegarde config admin:", e);
            Swal.fire('Erreur', 'Impossible de sauvegarder la configuration.', 'error');
        }
    },
};
