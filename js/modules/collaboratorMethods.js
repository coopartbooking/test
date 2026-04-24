// js/modules/collaboratorMethods.js — Gestion des collaborateurs via Cloud Functions
// Les fonctions Firebase sont appelées via le SDK Firebase Functions (onCall)

import { getFunctions, httpsCallable }          from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";
import { getAuth, sendPasswordResetEmail }       from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { firebaseApp }                           from '../firebase.js';

// Langue française pour les emails Firebase
const clientAuth = getAuth(firebaseApp);
clientAuth.languageCode = 'fr';

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

    // --- CRÉER UN COLLABORATEUR (ou enregistrer un compte existant) ---
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
                    <p class="text-xs text-slate-400 mt-1">
                        💡 Si cette personne a déjà un compte, son rôle sera simplement mis à jour.
                    </p>
                </div>`,
            showCancelButton:  true,
            confirmButtonText: 'Enregistrer',
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
            Swal.fire({ title: 'Enregistrement…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            const result = await _createCollaborator({
                email:       r.value.email,
                displayName: r.value.name,
                role:        r.value.role,
            });

            // Compte nouveau → envoyer email automatiquement
            if (result.data.isNew) {
                try {
                    await sendPasswordResetEmail(clientAuth, r.value.email);
                    await Swal.fire({
                        title: 'Collaborateur créé ✓',
                        html:  `<p class="text-sm">Le compte de <strong>${r.value.name}</strong> a été créé.</p>
                                <p class="text-sm mt-2 text-emerald-600"><i class="fas fa-check-circle mr-1"></i>
                                Un email a été envoyé automatiquement à <strong>${r.value.email}</strong></p>
                                <p class="text-xs text-slate-400 mt-2">Le lien est valable 1 heure.</p>`,
                        icon:  'success',
                        confirmButtonColor: '#4f46e5',
                        confirmButtonText:  'OK',
                    });
                } catch (emailErr) {
                    // Email échoué → afficher le lien en fallback
                    await Swal.fire({
                        title: 'Compte créé ✓ (email non envoyé)',
                        html:  `<p class="text-sm text-orange-600 mb-2">L'envoi automatique a échoué. Copiez ce lien :</p>
                                <div class="p-3 bg-slate-100 rounded text-xs break-all text-left">
                                    ${result.data.resetLink || ''}
                                </div>`,
                        icon:  'warning',
                        confirmButtonColor: '#4f46e5',
                        confirmButtonText:  'Copier le lien',
                    }).then(() => {
                        if (result.data.resetLink) navigator.clipboard.writeText(result.data.resetLink).catch(() => {});
                    });
                }
            } else {
                // Compte existant → rôle mis à jour silencieusement
                Swal.fire({
                    title: 'Rôle mis à jour ✓',
                    html:  `<strong>${r.value.name}</strong> est maintenant <strong>${r.value.role}</strong>.`,
                    icon:  'success',
                    toast: true, position: 'top-end', timer: 3000, showConfirmButton: false,
                });
            }

            await this.loadCollaborators();

        } catch (e) {
            Swal.fire('Erreur', e.message || 'Erreur lors de la création.', 'error');
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

            const isCurrentUser = collab.email === this.currentUserName;
            if (isCurrentUser) {
                // Si on change son propre rôle → recharger la page
                await Swal.fire({
                    title: 'Rôle mis à jour ✓',
                    html: `Votre rôle est maintenant <strong>${newRole}</strong>.<br>
                           <span class="text-sm text-slate-500">La page va se recharger pour appliquer les changements.</span>`,
                    icon: 'success',
                    confirmButtonColor: '#4f46e5',
                    timer: 2500,
                    showConfirmButton: false,
                });
                window.location.reload();
            } else {
                // Si on change le rôle d'un autre → juste notifier
                const needsReconnect = newRole === 'admin' || collab.role === 'admin';
                Swal.fire({
                    title: 'Rôle mis à jour ✓',
                    html: needsReconnect
                        ? `<strong>${collab.displayName}</strong> est maintenant <strong>${newRole}</strong>.<br>
                           <span class="text-sm text-slate-500">Cette personne doit se déconnecter et reconnecter pour voir les changements.</span>`
                        : `<strong>${collab.displayName}</strong> est maintenant <strong>${newRole}</strong>.`,
                    icon: 'success',
                    toast: !needsReconnect,
                    position: needsReconnect ? 'center' : 'top-end',
                    timer: needsReconnect ? undefined : 2000,
                    showConfirmButton: needsReconnect,
                    confirmButtonColor: '#4f46e5',
                });
                await this.loadCollaborators();
            }
        } catch (e) {
            Swal.fire('Erreur', e.message || 'Impossible de changer le rôle.', 'error');
        }
    },

    // --- ENVOYER UN EMAIL DE RÉINITIALISATION ---
    async sendCollaboratorPasswordReset(collab) {
        const r = await Swal.fire({
            title: 'Envoyer un email de réinitialisation ?',
            html:  `Firebase va envoyer automatiquement un email à <strong>${collab.email}</strong>.<br>
                    <span class="text-sm text-slate-500">Le lien est valable 1 heure.</span>`,
            showCancelButton:  true,
            confirmButtonText: 'Envoyer l'email',
            cancelButtonText:  'Annuler',
            confirmButtonColor: '#4f46e5',
        });
        if (!r.isConfirmed) return;

        try {
            await sendPasswordResetEmail(clientAuth, collab.email);
            Swal.fire({
                title: 'Email envoyé ✓',
                html:  `Un email de réinitialisation a été envoyé à <strong>${collab.email}</strong>.`,
                icon:  'success',
                toast: true, position: 'top-end', timer: 3000, showConfirmButton: false,
            });
        } catch (e) {
            // Fallback : générer le lien via Cloud Function
            try {
                const result = await _sendPasswordResetAdmin({ email: collab.email });
                await Swal.fire({
                    title: 'Lien généré ✓',
                    html:  `<p class="text-xs text-slate-500 mb-2">Envoi automatique indisponible. Copiez ce lien :</p>
                            <div class="p-3 bg-slate-100 rounded text-xs break-all text-left">${result.data.resetLink}</div>`,
                    icon:  'info',
                    confirmButtonText: 'Copier le lien',
                    confirmButtonColor: '#4f46e5',
                }).then(() => {
                    navigator.clipboard.writeText(result.data.resetLink).catch(() => {});
                });
            } catch (e2) {
                Swal.fire('Erreur', e2.message || 'Impossible d'envoyer l'email.', 'error');
            }
        }
    },
};
