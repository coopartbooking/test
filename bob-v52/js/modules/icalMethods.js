// js/modules/icalMethods.js — Récupération/partage des liens d'agenda iCal
// Appelle les Cloud Functions callables : getMyIcalLink, getIcalLinkFor, revokeIcalToken
// Le flux .ics lui-même est servi par la fonction HTTP icalFeed (sécurisée par token).

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";
import { firebaseApp }                 from '../firebase.js';

// Même région que le module collaborateurs
const functions = getFunctions(firebaseApp, 'us-central1');

const _getMyIcalLink   = httpsCallable(functions, 'getMyIcalLink');
const _getIcalLinkFor  = httpsCallable(functions, 'getIcalLinkFor');
const _revokeIcalToken = httpsCallable(functions, 'revokeIcalToken');

// Petit utilitaire : échappe le HTML pour l'injection dans les modales SweetAlert2.
function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Corps HTML partagé pour l'affichage d'un lien iCal (masqué par défaut + boutons).
function _linkModalHtml(url, { withRevoke }) {
    const safe = _esc(url);
    return `
        <div class="text-left space-y-3 mt-2">
            <p class="text-xs text-slate-500">
                Ce lien est <strong>secret</strong> : quiconque le possède peut consulter cet agenda.
                Ne le partage qu'avec des personnes de confiance.
            </p>
            <div class="flex items-center gap-2">
                <input id="ical-url" type="text" readonly value="${safe}"
                       class="flex-1 text-xs bg-slate-100 rounded px-2 py-2 font-mono select-all"
                       style="filter: blur(4px); transition: filter .2s;">
            </div>
            <div class="flex flex-wrap gap-2">
                <button id="ical-reveal" type="button"
                        class="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                    <i class="fas fa-eye mr-1"></i>Afficher
                </button>
                <button id="ical-copy" type="button"
                        class="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white">
                    <i class="fas fa-copy mr-1"></i>Copier le lien
                </button>
                ${withRevoke ? `
                <button id="ical-revoke" type="button"
                        class="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600">
                    <i class="fas fa-rotate mr-1"></i>Régénérer (révoque l'ancien)
                </button>` : ''}
            </div>
            <div class="text-[11px] text-slate-400 leading-relaxed border-t border-slate-100 pt-2">
                <strong>S'abonner :</strong> Google Agenda → Autres agendas → « À partir de l'URL » → collez le lien.
                (Apple Calendar : Fichier → Nouvel abonnement ; Outlook : Ajouter un agenda → À partir d'Internet.)
                La mise à jour côté Google peut prendre plusieurs heures.
            </div>
        </div>`;
}

// Attache les gestionnaires (SweetAlert2 retire les onclick → on passe par didOpen).
function _wireLinkModal(url, { onRevoke } = {}) {
    const input  = document.getElementById('ical-url');
    const reveal = document.getElementById('ical-reveal');
    const copy   = document.getElementById('ical-copy');
    const revoke = document.getElementById('ical-revoke');

    if (reveal && input) {
        reveal.addEventListener('click', () => {
            const hidden = input.style.filter && input.style.filter.includes('blur');
            input.style.filter = hidden ? 'none' : 'blur(4px)';
            reveal.innerHTML = hidden
                ? '<i class="fas fa-eye-slash mr-1"></i>Masquer'
                : '<i class="fas fa-eye mr-1"></i>Afficher';
        });
    }
    if (copy) {
        copy.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(url); } catch { if (input) { input.style.filter='none'; input.select(); document.execCommand('copy'); } }
            copy.innerHTML = '<i class="fas fa-check mr-1"></i>Copié !';
            setTimeout(() => { copy.innerHTML = '<i class="fas fa-copy mr-1"></i>Copier le lien'; }, 1800);
        });
    }
    if (revoke && typeof onRevoke === 'function') {
        revoke.addEventListener('click', onRevoke);
    }
}

export const icalMethods = {

    // --- MON LIEN D'AGENDA (utilisateur connecté) ---
    async showMyIcalLink() {
        try {
            Swal.fire({ title: 'Génération du lien…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const res = await _getMyIcalLink();
            const url = res.data.url;
            Swal.fire({
                title: 'Mon lien d\'agenda',
                html: _linkModalHtml(url, { withRevoke: true }),
                width: 560,
                showConfirmButton: true,
                confirmButtonText: 'Fermer',
                confirmButtonColor: '#4f46e5',
                didOpen: () => _wireLinkModal(url, { onRevoke: () => this.revokeMyIcalLink() }),
            });
        } catch (e) {
            Swal.fire('Erreur', e.message || 'Impossible de générer le lien d\'agenda.', 'error');
        }
    },

    // --- RÉVOQUER / RÉGÉNÉRER MON LIEN ---
    async revokeMyIcalLink() {
        const r = await Swal.fire({
            title: 'Régénérer le lien ?',
            html: '<p class="text-sm text-slate-600">L\'ancien lien cessera de fonctionner immédiatement. Les agendas déjà abonnés ne se mettront plus à jour tant qu\'ils n\'auront pas le nouveau lien.</p>',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Régénérer',
            cancelButtonText: 'Annuler',
            confirmButtonColor: '#ef4444',
        });
        if (!r.isConfirmed) return;
        try {
            Swal.fire({ title: 'Révocation…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            await _revokeIcalToken({});              // révoque le token de l'utilisateur courant
            const res = await _getMyIcalLink();       // en régénère un neuf
            const url = res.data.url;
            Swal.fire({
                title: 'Nouveau lien généré ✓',
                html: _linkModalHtml(url, { withRevoke: true }),
                width: 560,
                confirmButtonText: 'Fermer',
                confirmButtonColor: '#4f46e5',
                didOpen: () => _wireLinkModal(url, { onRevoke: () => this.revokeMyIcalLink() }),
            });
        } catch (e) {
            Swal.fire('Erreur', e.message || 'Impossible de régénérer le lien.', 'error');
        }
    },

    // --- LIEN D'AGENDA D'UN COLLABORATEUR (admin uniquement, à la demande) ---
    async showCollaboratorIcalLink(collab) {
        try {
            Swal.fire({ title: 'Récupération du lien…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const res = await _getIcalLinkFor({ uid: collab.uid });
            const url = res.data.url;
            Swal.fire({
                title: `Agenda de ${_esc(collab.displayName || res.data.displayName || 'ce collaborateur')}`,
                html: _linkModalHtml(url, { withRevoke: false }),
                width: 560,
                confirmButtonText: 'Fermer',
                confirmButtonColor: '#4f46e5',
                didOpen: () => _wireLinkModal(url),
            });
        } catch (e) {
            Swal.fire('Erreur', e.message || 'Impossible de récupérer le lien de ce collaborateur.', 'error');
        }
    },
};
