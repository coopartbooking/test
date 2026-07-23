// js/modules/crmMethods.js — Moteur CRM : fiches structures, contacts, commentaires, tags
// Section : entre // --- MOTEUR CRM --- et // --- ADMIN ---
// Note : nextTick() remplacé par this.$nextTick() (équivalent dans le contexte composant Vue)

import { matchStructure, addAlias, scanDuplicates, markNotDuplicate } from './structMatch.js?v=18';

export const crmMethods = {

    // --- MOTEUR CRM ---
    openCrmView(struct = null) {
        if (!struct) {
            const now = new Date().toISOString();
            struct = {
                id: Date.now().toString(), name: 'Nouvelle Structure', isClient: false, isActive: true,
                clientCode: '', source: '', createdDate: now,
                address: '', suite: '', zip: '', city: '', region: '', country: 'France',
                phone1: '', phone2: '', mobile: '', fax: '', email: '', website: '',
                capacity: '', season: '', hours: '', lat: null, lng: null,
                siret: '', licence: '', govId: '', aliases: [],
                progMonthStart: '', progMonthEnd: '',
                tags: { categories: [], genres: [], reseaux: [], keywords: [] },
                contacts: [], comments: [], venues: [],
                createdAt: now, createdBy: this.currentUserName,
                updatedAt: now, updatedBy: this.currentUserName,
            };
        } else {
            if (!struct.tags || Array.isArray(struct.tags)) struct.tags = { categories: [], genres: [], reseaux: [], keywords: [] };
            if (!struct.contacts) struct.contacts = [];
            if (!struct.comments) struct.comments = [];
            if (!struct.venues)   struct.venues   = [];
        }
        this.currentCrmStruct  = JSON.parse(JSON.stringify(struct));
        this.currentCrmContact = null;
        this.showCrmModal      = true;
        this.$nextTick(() => { setTimeout(() => { this.initMiniMap(); }, 400); });
    },

    closeCrmContact() {
        this.currentCrmContact = null;
        this.$nextTick(() => { setTimeout(() => { this.initMiniMap(); }, 400); });
    },

    async saveCrmStruct(silent = false) {
        // Sanitiser les champs texte libres avant sauvegarde
        this.currentCrmStruct.name    = this.sanitizeText(this.currentCrmStruct.name, 200);
        this.currentCrmStruct.address = this.sanitizeText(this.currentCrmStruct.address, 300);
        this.currentCrmStruct.notes   = this.sanitizeText(this.currentCrmStruct.notes, 5000);
        this.currentCrmStruct.website = this.sanitizeUrl(this.currentCrmStruct.website);
        this.currentCrmStruct.email   = this.sanitizeEmail(this.currentCrmStruct.email);
        if (!this.currentCrmStruct.name.trim()) return Swal.fire('Erreur', 'Le nom de la structure est obligatoire.', 'error');

        // Auto-géocodage silencieux : si une adresse est renseignée mais pas de GPS, on tente de récupérer les coordonnées
        const s = this.currentCrmStruct;
        const hasAddress = (s.address || s.zip || s.city) && (s.city || s.zip);
        const hasGps     = s.lat && s.lng;
        if (hasAddress && !hasGps) {
            try {
                const query = `${s.address || ''} ${s.zip || ''} ${s.city || ''} ${s.country || 'France'}`.trim().replace(/\s+/g, ' ');
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
                const data = await response.json();
                if (data && data.length > 0) {
                    this.currentCrmStruct.lat = parseFloat(data[0].lat);
                    this.currentCrmStruct.lng = parseFloat(data[0].lon);
                }
            } catch (err) {
                // Échec silencieux : on sauvegarde quand même la fiche sans GPS
                console.warn('Géocodage auto échoué pour', s.name, err);
            }
        }

        const idx = this.db.structures.findIndex(x => x.id === this.currentCrmStruct.id);
        const now = new Date().toISOString();

        // ── Détection de doublon à la création manuelle ──
        // Uniquement sur une NOUVELLE fiche : on ne dérange jamais lors d'une modification.
        if (idx === -1) {
            const m = matchStructure(this.currentCrmStruct, this.db.structures, { excludeId: this.currentCrmStruct.id });
            if ((m.status === 'auto' || m.status === 'suggest') && m.target) {
                const esc = v => String(v == null ? '' : v)
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const r = await Swal.fire({
                    title: 'Structure déjà existante ?',
                    html: `<div class="text-left text-sm space-y-2">
                             <p>Cette fiche ressemble à une structure déjà présente dans l'annuaire :</p>
                             <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
                               <div class="font-bold text-slate-800">${esc(m.target.name)}</div>
                               <div class="text-xs text-slate-500">${esc(m.target.city || '')}</div>
                               <div class="text-[11px] text-orange-600 mt-1"><i class="fas fa-link mr-1"></i>${esc(m.reasons[0] || '')}</div>
                             </div>
                             <p class="text-xs text-slate-500">Ouvrir la fiche existante évite de créer un doublon.</p>
                           </div>`,
                    icon: 'question',
                    width: 520,
                    showDenyButton: true,
                    showCancelButton: true,
                    confirmButtonText: 'Ouvrir la fiche existante',
                    denyButtonText: 'Créer quand même',
                    cancelButtonText: 'Annuler',
                    confirmButtonColor: '#4f46e5',
                    denyButtonColor: '#64748b',
                });

                if (r.isDismissed) return;              // Annuler : on ne touche à rien
                if (r.isConfirmed) {
                    // Mémorise la variante de nom saisie, puis bascule sur la fiche existante
                    if (addAlias(m.target, this.currentCrmStruct.name)) {
                        m.target.updatedAt = now;
                        m.target.updatedBy = this.currentUserName;
                        this.saveDB();
                    }
                    this.showCrmModal = false;
                    this.$nextTick(() => this.openCrmView(m.target));
                    return;
                }
                // isDenied : on poursuit la création normalement
            }
        }

        this.currentCrmStruct.updatedAt = now;
        this.currentCrmStruct.updatedBy = this.currentUserName;
        if (idx === -1) {
            // Nouvelle structure : initialiser createdAt/createdBy si absents
            if (!this.currentCrmStruct.createdAt) this.currentCrmStruct.createdAt = now;
            if (!this.currentCrmStruct.createdBy) this.currentCrmStruct.createdBy = this.currentUserName;
        }
        if (idx > -1) this.db.structures[idx] = this.currentCrmStruct;
        else          this.db.structures.push(this.currentCrmStruct);
        this.saveDB();
        this.showCrmModal = false;
        if (!silent) Swal.fire({ title: 'Fiche CRM Enregistrée', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

    async exportStructurePDF(s) {
        if (!s) return;
        await this.requireJsPDF();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const pageW   = 210;
        const margin  = 15;
        const colW    = pageW - margin * 2;
        let   y       = margin;

        // ── Couleurs ──
        const colorPrimary  = [79, 70, 229];   // indigo
        const colorDark     = [30, 41, 59];     // slate-800
        const colorGray     = [100, 116, 139];  // slate-500
        const colorLight    = [241, 245, 249];  // slate-100

        // ── En-tête ──
        doc.setFillColor(...colorPrimary);
        doc.roundedRect(margin, y, colW, 28, 4, 4, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(s.name || 'Structure', margin + 6, y + 10);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        if (s.category) doc.text(s.category, margin + 6, y + 17);
        if (s.city)     doc.text(s.city, margin + 6, y + 22);
        doc.setTextColor(...colorDark);
        y += 35;

        // ── Helper : section title ──
        const sectionTitle = (title) => {
            doc.setFillColor(...colorLight);
            doc.roundedRect(margin, y, colW, 7, 2, 2, 'F');
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...colorPrimary);
            doc.text(title.toUpperCase(), margin + 3, y + 5);
            doc.setTextColor(...colorDark);
            y += 10;
        };

        // ── Helper : ligne infos ──
        const infoLine = (label, value) => {
            if (!value) return;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...colorGray);
            doc.text(label, margin, y);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...colorDark);
            const lines = doc.splitTextToSize(String(value), colW - 35);
            doc.text(lines, margin + 35, y);
            y += lines.length * 5 + 2;
        };

        // ── Informations générales ──
        sectionTitle('Informations');
        infoLine('Adresse',     s.address);
        infoLine('Ville',       s.city);
        infoLine('Email',       s.email);
        infoLine('Téléphone',   s.phone);
        infoLine('Site web',    s.website);
        infoLine('Capacité',    s.capacity ? s.capacity + ' pers.' : null);
        y += 3;

        // ── Tags ──
        const allTags = [
            ...(s.tags?.categories || []),
            ...(s.tags?.genres     || []),
            ...(s.tags?.reseaux    || []),
        ];
        if (allTags.length > 0) {
            sectionTitle('Tags & Réseaux');
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...colorGray);
            doc.text(allTags.join(' • '), margin, y, { maxWidth: colW });
            y += 8;
        }

        // ── Notes ──
        if (s.notes) {
            sectionTitle('Notes');
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...colorDark);
            const lines = doc.splitTextToSize(s.notes, colW);
            doc.text(lines, margin, y);
            y += lines.length * 5 + 5;
        }

        // ── Contacts ──
        if (s.contacts && s.contacts.length > 0) {
            sectionTitle('Contacts');
            s.contacts.forEach(c => {
                if (y > 260) { doc.addPage(); y = margin; }
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...colorDark);
                doc.text(`${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Contact', margin, y);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(...colorGray);
                if (c.role)       doc.text(c.role,       margin + 60, y);
                y += 5;
                if (c.emailPro)   { doc.text(c.emailPro,   margin + 5, y); y += 4; }
                if (c.phone)      { doc.text(c.phone,       margin + 5, y); y += 4; }
                y += 3;
            });
        }

        // ── Commentaires ──
        if (s.comments && s.comments.length > 0) {
            if (y > 240) { doc.addPage(); y = margin; }
            sectionTitle('Commentaires récents');
            s.comments.slice(-5).reverse().forEach(c => {
                if (y > 270) { doc.addPage(); y = margin; }
                doc.setFontSize(7);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...colorGray);
                doc.text(`${c.user || ''} — ${c.date || ''}`, margin, y);
                y += 4;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...colorDark);
                const lines = doc.splitTextToSize(c.text || '', colW);
                doc.text(lines, margin, y);
                y += lines.length * 4 + 4;
            });
        }

        // ── Pied de page ──
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(...colorGray);
            doc.text(
                `Coop'Art Booking — ${s.name} — Exporté le ${new Date().toLocaleDateString('fr-FR')} — Page ${i}/${pageCount}`,
                pageW / 2, 290, { align: 'center' }
            );
        }

        doc.save(`${(s.name || 'structure').replace(/[^a-zA-Z0-9]/g, '_')}_CRM.pdf`);

        Swal.fire({ title: 'PDF exporté ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

    // ─── DÉTECTION ET FUSION DE DOUBLONS ─────────────────────────────────────

    // Similarité entre deux chaînes (0-100%)
    _stringSimilarity(a, b) {
        if (!a || !b) return 0;
        a = a.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        b = b.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        if (a === b) return 100;
        if (!a.length || !b.length) return 0;
        // Score basé sur les caractères communs
        const longer  = a.length > b.length ? a : b;
        const shorter = a.length > b.length ? b : a;
        let matches = 0;
        const used   = new Array(longer.length).fill(false);
        for (let i = 0; i < shorter.length; i++) {
            for (let j = 0; j < longer.length; j++) {
                if (!used[j] && shorter[i] === longer[j]) {
                    matches++;
                    used[j] = true;
                    break;
                }
            }
        }
        return Math.round(matches / longer.length * 100);
    },

    // Détecte les doublons potentiels dans la base.
    // Utilise le moteur partagé structMatch.js : mêmes règles qu'à l'import
    // et à la saisie manuelle (identifiant fort, domaine, alias, téléphone,
    // ville + nom normalisé, proximité GPS). Un nom qui se ressemble ne
    // suffit JAMAIS : il faut au minimum une localité commune.
    findDuplicates() {
        this.duplicatePairs = scanDuplicates(this.db.structures);
        this.showDuplicatesModal = true;

        if (!this.duplicatePairs.length) {
            this.showDuplicatesModal = false;
            Swal.fire({
                title: 'Aucun doublon détecté ✓',
                html: 'Aucune structure ne partage d\'identifiant, de domaine, de téléphone ni de nom proche dans une même ville.',
                icon: 'success',
                confirmButtonColor: '#4f46e5',
            });
        }
    },

    // "Ignorer" : mémorise le refus pour que la paire ne revienne plus.
    async ignoreDuplicatePair(i) {
        const pair = this.duplicatePairs[i];
        if (!pair) return;
        const a = this.db.structures.find(s => s.id === pair.a.id);
        const b = this.db.structures.find(s => s.id === pair.b.id);
        if (a && b) {
            markNotDuplicate(a, b);
            const now = new Date().toISOString();
            a.updatedAt = now; a.updatedBy = this.currentUserName;
            b.updatedAt = now; b.updatedBy = this.currentUserName;
            this.saveDB();
        }
        this.duplicatePairs.splice(i, 1);
    },

    // Prépare la fusion : source = à absorber, target = à conserver
    prepareMerge(pair, keepIndex) {
        this.duplicateMergeSource = keepIndex === 0 ? pair.b : pair.a; // à supprimer
        this.duplicateMergeTarget = keepIndex === 0 ? pair.a : pair.b; // à garder
    },

    // Effectue la fusion
    async confirmMerge() {
        const src = this.duplicateMergeSource;
        const tgt = this.duplicateMergeTarget;
        if (!src || !tgt) return;

        const r = await Swal.fire({
            title: 'Confirmer la fusion ?',
            html: `<p>La fiche <strong>${src.name}</strong> sera absorbée dans <strong>${tgt.name}</strong>.</p>
                   <p class="text-sm text-slate-500 mt-2">Les contacts, commentaires et tags seront fusionnés.<br>La fiche source sera supprimée.</p>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#4f46e5',
            confirmButtonText: 'Fusionner',
            cancelButtonText: 'Annuler',
        });

        if (!r.isConfirmed) return;

        // Trouver les fiches dans la base
        const tgtIdx = this.db.structures.findIndex(s => s.id === tgt.id);
        if (tgtIdx === -1) return;

        const merged = { ...this.db.structures[tgtIdx] };

        // Fusionner les contacts (éviter les doublons par email)
        const existingEmails = new Set((merged.contacts || []).map(c => c.emailPro || c.email || '').filter(Boolean));
        const newContacts = (src.contacts || []).filter(c => {
            const email = c.emailPro || c.email || '';
            return !email || !existingEmails.has(email);
        });
        merged.contacts = [...(merged.contacts || []), ...newContacts];

        // Fusionner les commentaires
        merged.comments = [
            ...(merged.comments || []),
            ...(src.comments || []).map(c => ({ ...c, text: `[Fusionné depuis ${src.name}] ${c.text}` })),
        ].sort((a, b) => (b.id || 0) - (a.id || 0));

        // Fusionner les tags
        ['categories', 'genres', 'reseaux', 'keywords'].forEach(key => {
            const existing = new Set(merged.tags?.[key] || []);
            (src.tags?.[key] || []).forEach(t => existing.add(t));
            if (!merged.tags) merged.tags = {};
            merged.tags[key] = [...existing];
        });

        // Compléter les champs vides
        ['phone1', 'phone2', 'mobile', 'email', 'website', 'address', 'zip', 'capacity', 'season', 'notes'].forEach(field => {
            if (!merged[field] && src[field]) merged[field] = src[field];
        });
        // GPS
        if ((!merged.lat || !merged.lng) && src.lat && src.lng) {
            merged.lat = src.lat;
            merged.lng = src.lng;
        }

        // Mettre à jour les affaires qui référencent la source
        (this.db.events || []).forEach(e => {
            if (e.venueId === src.id) e.venueId = tgt.id;
            if (e.venueName === src.name) e.venueName = tgt.name;
        });

        // Supprimer la source et mettre à jour la cible
        this.db.structures[tgtIdx] = merged;
        this.db.structures = this.db.structures.filter(s => s.id !== src.id);

        this.logActivity('Structures fusionnées', `${src.name} → ${tgt.name}`);
        this.saveDB();

        // Retirer la paire fusionnée de la liste
        this.duplicatePairs = this.duplicatePairs.filter(p => p.a.id !== src.id && p.b.id !== src.id);
        this.duplicateMergeSource = null;
        this.duplicateMergeTarget = null;

        Swal.fire({
            title: 'Fusion effectuée ✓',
            html: `<strong>${src.name}</strong> a été fusionné dans <strong>${tgt.name}</strong>.`,
            icon: 'success',
            toast: true, position: 'top-end', timer: 3000, showConfirmButton: false,
        });
    },

    cancelMerge() {
        this.duplicateMergeSource = null;
        this.duplicateMergeTarget = null;
    },

    deleteStructure(s) {
        Swal.fire({ title: 'Supprimer ?', text: "Supprimer la structure et ses contacts ?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' })
            .then(r => { if (r.isConfirmed) {
                this.logActivity('Structure supprimée', s.name);
                this.db.structures = this.db.structures.filter(x => x.id !== s.id);
                this.saveDB();
            }});
    },

    addCrmVenue() {
        Swal.fire({
            title: 'Ajouter un lieu/salle',
            html: '<input id="swal-v-name" class="swal2-input" placeholder="Nom (ex: Le Club, Petite Jauge...)">' +
                  '<input id="swal-v-cap" type="number" class="swal2-input" placeholder="Jauge (ex: 300)">',
            focusConfirm: false, showCancelButton: true, confirmButtonText: 'Ajouter', cancelButtonText: 'Annuler',
            preConfirm: () => {
                const name = document.getElementById('swal-v-name').value;
                const cap  = document.getElementById('swal-v-cap').value;
                if (!name) Swal.showValidationMessage('Le nom de la salle est obligatoire');
                return { name, capacity: cap };
            }
        }).then(r => {
            if (r.isConfirmed) {
                if (!this.currentCrmStruct.venues) this.currentCrmStruct.venues = [];
                this.currentCrmStruct.venues.push({ id: Date.now(), name: r.value.name, capacity: r.value.capacity });
            }
        });
    },

    removeCrmVenue(id) {
        this.currentCrmStruct.venues = this.currentCrmStruct.venues.filter(v => v.id !== id);
    },

    toggleCrmTag(family, tag) {
        const arr = this.currentCrmStruct.tags[family];
        const idx = arr.indexOf(tag);
        if (idx > -1) arr.splice(idx, 1);
        else          arr.push(tag);
    },

    // Création d'un tag inédit directement depuis la fiche structure.
    // Ajoute le tag au référentiel global (db.tagXxx) ET à la structure courante.
    addCrmTagInline(family, ev) {
        if (!this.currentCrmStruct) return;

        const raw = ev && ev.target ? ev.target.value : '';
        const tag = this.sanitizeText(String(raw), 60).trim();
        if (!tag) return;

        // Mapping famille structure -> clef du référentiel global
        const globalKeys = {
            categories: 'tagCategories',
            genres:     'tagGenres',
            reseaux:    'tagReseaux',
            keywords:   'tagKeywords',
        };
        const gKey = globalKeys[family];
        if (!gKey) return;

        // Sécuriser les tableaux
        if (!Array.isArray(this.db[gKey])) this.db[gKey] = [];
        if (!this.currentCrmStruct.tags || Array.isArray(this.currentCrmStruct.tags)) {
            this.currentCrmStruct.tags = { categories: [], genres: [], reseaux: [], keywords: [] };
        }
        if (!Array.isArray(this.currentCrmStruct.tags[family])) this.currentCrmStruct.tags[family] = [];

        // Référentiel global : dédup insensible à la casse (réutilise la casse existante si déjà connu)
        const existsGlobal = this.db[gKey].find(t => t.toLowerCase() === tag.toLowerCase());
        const finalTag = existsGlobal || tag;
        if (!existsGlobal) this.db[gKey].push(tag);

        // Structure courante : dédup insensible à la casse
        const onStruct = this.currentCrmStruct.tags[family].some(t => t.toLowerCase() === finalTag.toLowerCase());
        if (!onStruct) this.currentCrmStruct.tags[family].push(finalTag);

        // Reset du champ + persistance
        if (ev && ev.target) ev.target.value = '';
        this.saveDB();
    },

    addCrmComment() {
        if (!this.newCrmComment.trim()) return;
        if (!this.currentCrmStruct.comments) this.currentCrmStruct.comments = [];
        this.currentCrmStruct.comments.push({ id: Date.now(), date: this.getProTimestamp(), text: this.sanitizeText(this.newCrmComment, 1000), user: this.currentUserName });
        this.logActivity('Commentaire ajouté', this.currentCrmStruct.name);
        this.newCrmComment = '';
        this.saveDB();
    },

    addContactComment() {
        if (!this.newContactComment.trim()) return;
        if (!this.currentCrmContact.comments) this.currentCrmContact.comments = [];
        this.currentCrmContact.comments.push({ id: Date.now(), date: this.getProTimestamp(), text: this.sanitizeText(this.newContactComment, 1000), user: this.currentUserName });
        this.newContactComment = '';
        this.saveDB();
    },

    // --- FICHE TECHNIQUE SALLE ---

    async uploadVenueTechFile(venueId, file) {
        if (!file || !this.currentCrmStruct) return;

        // Types autorisés : PDF, Word, Excel, PowerPoint
        const allowed = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ];
        if (!allowed.includes(file.type)) {
            return Swal.fire('Format non supporté', 'Formats acceptés : PDF, Word, Excel, PowerPoint.', 'warning');
        }
        if (file.size > 10 * 1024 * 1024) {
            return Swal.fire('Fichier trop lourd', 'La taille maximale est de 10 Mo.', 'warning');
        }

        const venue = (this.currentCrmStruct.venues || []).find(v => v.id === venueId);
        if (!venue) return;

        // Indicateur de chargement
        venue._uploading = true;

        try {
            const { dbStorage } = await import('./firebase.js');
            const { ref, uploadBytes, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js');

            const path     = `fiches-techniques/${this.currentCrmStruct.id}/${venueId}/${file.name}`;
            const storageRef = ref(dbStorage, path);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            venue.techFileUrl  = url;
            venue.techFileName = file.name;
            venue.techFilePath = path;
            delete venue._uploading;

            this.saveDB();
            Swal.fire({ title: 'Fiche technique uploadée ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
        } catch (err) {
            delete venue._uploading;
            console.error('Upload fiche technique', err);
            Swal.fire('Erreur upload', err.message || 'Impossible d\'uploader le fichier.', 'error');
        }
    },

    async removeVenueTechFile(venueId) {
        const venue = (this.currentCrmStruct.venues || []).find(v => v.id === venueId);
        if (!venue || !venue.techFileUrl) return;

        const r = await Swal.fire({
            title: 'Supprimer la fiche technique ?',
            text: venue.techFileName || 'Ce fichier sera supprimé définitivement.',
            icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#ef4444', confirmButtonText: 'Supprimer', cancelButtonText: 'Annuler',
        });
        if (!r.isConfirmed) return;

        try {
            if (venue.techFilePath) {
                const { dbStorage } = await import('./firebase.js');
                const { ref, deleteObject } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js');
                await deleteObject(ref(dbStorage, venue.techFilePath));
            }
        } catch (err) {
            // Fichier déjà supprimé ou introuvable — on nettoie quand même Firestore
            console.warn('Suppression Storage silencieuse', err);
        }

        delete venue.techFileUrl;
        delete venue.techFileName;
        delete venue.techFilePath;
        this.saveDB();
        Swal.fire({ title: 'Fiche technique supprimée', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

};
