// js/modules/collaboratorMethods.js — Gestion des collaborateurs via Cloud Functions
// Les fonctions Firebase sont appelées via le SDK Firebase Functions (onCall)

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";
import { firebaseApp }                 from '../firebase.js';

// Initialisation Functions pointant vers us-central1
const functions = getFunctions(firebaseApp, 'us-central1');

// Références aux Cloud Functions
const _createCollaborator    = httpsCallable(functions, 'createCollaborator');
const _disableCollaborator   = httpsCallable(functions, 'disableCollaborator');
const _enableCollaborator    = httpsCallable(functions, 'enableCollaborator');
const _setCollaboratorRole   = httpsCallable(functions, 'setCollaboratorRole');
const _listCollaborators     = httpsCallable(functions, 'listCollaborators');
const _sendPasswordResetAdmin = httpsCallable(functions, 'sendPasswordResetAdmin');

export const collaboratorMethods = {

    // --- ÉTAT LOCAL ---
    // (ces données sont dans data() de app.js — ajoutées via le spread)

    // --- CHARGER LA LISTE DES COLLABORATEURS ---
    async loadCollaborators() {
        try {
            this.collaboratorsLoading = true;
            const result = await _listCollaborators();
            this.collaboratorsList = result.data.collaborators || [];
        } catch (e) {
            console.error("Erreur chargement collaborateurs");
            Swal.fire('Erreur', e.message || 'Impossible de charger les collaborateurs.', 'error');
        } finally {
            this.collaboratorsLoading = false;
        }
    },

    // --- CRÉER UN COLLABORATEUR ---
    async createCollaborator() {
        const r = await Swal.fire({
            title: 'Nouveau collaborateur',
            html: `
                <div class="text-left space-y-3 mt-2">
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">Nom complet</label>
                        <input id="swal-collab-name" class="swal2-input !mt-0" placeholder="Marie Dupont">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">Email</label>
                        <input id="swal-collab-email" type="email" class="swal2-input !mt-0" placeholder="marie@exemple.com">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">Rôle</label>
                        <select id="swal-collab-role" class="swal2-input !mt-0">
                            <option value="admin">Admin — accès complet</option>
                            <option value="editeur" selected>Éditeur — peut modifier</option>
                            <option value="lecteur">Lecteur — consultation seule</option>
                        </select>
                    </div>
                </div>`,
            showCancelButton:  true,
            confirmButtonText: 'Créer le compte',
            cancelButtonText:  'Annuler',
            confirmButtonColor: '#4f46e5',
            focusConfirm: false,
            preConfirm: () => {
                const name  = document.getElementById('swal-collab-name').value.trim();
                const email = document.getElementById('swal-collab-email').value.trim();
                const role  = document.getElementById('swal-collab-role').value;
                if (!name)               return Swal.showValidationMessage('Le nom est obligatoire');
                if (!email.includes('@')) return Swal.showValidationMessage('Email invalide');
                return { name, email, role };
            }
        });

        if (!r.isConfirmed) return;

        try {
            Swal.fire({ title: 'Création en cours…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            const result = await _createCollaborator({
                email:       r.value.email,
                displayName: r.value.name,
                role:        r.value.role,
            });

            await Swal.fire({
                title: 'Collaborateur créé ✓',
                html:  `<p class="text-sm">Le compte de <strong>${r.value.name}</strong> a été créé.</p>
                        <p class="text-sm mt-2">Un <strong>lien de définition du mot de passe</strong> a été généré.</p>
                        <div class="mt-3 p-3 bg-slate-100 rounded text-xs break-all text-left">
                            ${result.data.resetLink}
                        </div>
                        <p class="text-xs text-slate-400 mt-2">Envoyez ce lien au collaborateur — il est valable 1 heure.</p>`,
                icon:  'success',
                confirmButtonColor: '#4f46e5',
                confirmButtonText: 'Copier le lien',
            }).then(() => {
                navigator.clipboard.writeText(result.data.resetLink).catch(() => {});
            });

            await this.loadCollaborators();

        } catch (e) {
            const msg = e.code === 'functions/already-exists'
                ? 'Un compte existe déjà avec cet email.'
                : e.message || 'Erreur lors de la création.';
            Swal.fire('Erreur', msg, 'error');
        }
    },

    // --- DÉSACTIVER UN COLLABORATEUR ---
    async disableCollaborator(collab) {
        const r = await Swal.fire({
            title: 'Désactiver ce collaborateur ?',
            html:  `<p><strong>${collab.displayName}</strong> (${collab.email})</p>
                    <p class="text-sm text-slate-500 mt-2">Cette personne ne pourra plus se connecter. Ses données sont conservées.</p>`,
            icon:  'warning',
            showCancelButton:  true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Désactiver',
            cancelButtonText:  'Annuler',
        });
        if (!r.isConfirmed) return;

        try {
            Swal.fire({ title: 'Désactivation…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            await _disableCollaborator({ uid: collab.uid });
            Swal.fire({ title: 'Collaborateur désactivé ✓', icon: 'success', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
            await this.loadCollaborators();
        } catch (e) {
            Swal.fire('Erreur', e.message || 'Impossible de désactiver.', 'error');
        }
    },

    // --- RÉACTIVER UN COLLABORATEUR ---
    async enableCollaborator(collab) {
        const r = await Swal.fire({
            title: 'Réactiver ce collaborateur ?',
            html:  `<strong>${collab.displayName}</strong> (${collab.email})`,
            icon:  'question',
            showCancelButton:  true,
            confirmButtonColor: '#10b981',
            confirmButtonText: 'Réactiver',
            cancelButtonText:  'Annuler',
        });
        if (!r.isConfirmed) return;

        try {
            await _enableCollaborator({ uid: collab.uid });
            Swal.fire({ title: 'Collaborateur réactivé ✓', icon: 'success', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
            await this.loadCollaborators();
        } catch (e) {
            Swal.fire('Erreur', e.message || 'Impossible de réactiver.', 'error');
        }
    },

    // --- CHANGER LE RÔLE ---
    async setCollaboratorRole(collab, newRole) {
        try {
            await _setCollaboratorRole({ uid: collab.uid, role: newRole });
            Swal.fire({ title: 'Rôle mis à jour ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
            await this.loadCollaborators();
        } catch (e) {
            Swal.fire('Erreur', e.message || 'Impossible de changer le rôle.', 'error');
        }
    },

    // --- ENVOYER UN LIEN DE RÉINITIALISATION ---
    async sendCollaboratorPasswordReset(collab) {
        const r = await Swal.fire({
            title: 'Envoyer un lien de réinitialisation ?',
            html:  `Un lien sera généré pour <strong>${collab.email}</strong>.<br>
                    <span class="text-sm text-slate-500">Valable 1 heure.</span>`,
            showCancelButton:  true,
            confirmButtonText: 'Générer le lien',
            cancelButtonText:  'Annuler',
            confirmButtonColor: '#4f46e5',
        });
        if (!r.isConfirmed) return;

        try {
            const result = await _sendPasswordResetAdmin({ email: collab.email });
            await Swal.fire({
                title: 'Lien généré ✓',
                html:  `<div class="mt-2 p-3 bg-slate-100 rounded text-xs break-all text-left">${result.data.resetLink}</div>
                        <p class="text-xs text-slate-400 mt-2">Copiez ce lien et envoyez-le au collaborateur.</p>`,
                icon:  'success',
                confirmButtonText: 'Copier le lien',
                confirmButtonColor: '#4f46e5',
            }).then(() => {
                navigator.clipboard.writeText(result.data.resetLink).catch(() => {});
            });
        } catch (e) {
            Swal.fire('Erreur', e.message || 'Impossible de générer le lien.', 'error');
        }
    },
};
