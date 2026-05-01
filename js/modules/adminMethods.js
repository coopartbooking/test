// js/modules/adminMethods.js — Méthodes Administration & Gestion BDD
// Section : entre // --- ADMIN --- et // --- FILTRES TAGS CARTE GEO ---

import { auth, dbFirestore }                                  from '../firebase.js';
import { sendPasswordResetEmail }                             from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc, getDocs, collection, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export const adminMethods = {

    // --- ADMIN ---
    async refreshAdminStats() {
        await Promise.all([this.loadAdminUsers(), this.loadActivityLog()]);
        Swal.fire({ title: 'Données actualisées ✓', icon: 'success', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
    },

    async loadActivityLog() {
        try {
            const q    = query(collection(dbFirestore, "activity_log"), orderBy("date", "desc"), limit(50));
            const snap = await getDocs(q);
            this.activityLog = snap.docs.map(d => d.data());
        } catch (e) {
            console.error("Erreur chargement activité");
            this.activityLog = [];
        }
    },


    // ══════════════════════════════════════════════════════════════════════
    // IMPORTEUR BOB BOOKING
    // ══════════════════════════════════════════════════════════════════════

    // Rendre un contact public (retirer isPrivate)
    makeContactPublic(contact, struct) {
        if (!struct || !contact) return;
        const sIdx = this.db.structures.findIndex(s => s.id === struct.id);
        if (sIdx === -1) return;
        const cIdx = this.db.structures[sIdx].contacts.findIndex(c => c.id === contact.id);
        if (cIdx === -1) return;
        this.db.structures[sIdx].contacts[cIdx].isPrivate = false;
        delete this.db.structures[sIdx].contacts[cIdx].owner;
        this.saveDB();
        Swal.fire({
            title: 'Contact rendu public ✓',
            html: `<strong>${contact.firstName || ''} ${contact.lastName || ''}</strong> est maintenant visible par tous.`,
            icon: 'success', toast: true, position: 'top-end', timer: 2500, showConfirmButton: false,
        });
    },

    _normalizeBobPhone(p) {
        if (!p) return '';
        const s = String(p).trim();
        if (s.includes('@') || s.length < 8) return '';
        const digits = s.replace(/\D/g, '');
        if (!digits) return '';
        let d = digits;
        if (d.startsWith('33') && d.length === 11) d = '0' + d.slice(2);
        if (d.length === 10) return `${d.slice(0,2)} ${d.slice(2,4)} ${d.slice(4,6)} ${d.slice(6,8)} ${d.slice(8,10)}`;
        return d;
    },

    _parseBobContact(row, offset) {
        const nom = row[offset] ? String(row[offset]).trim() : '';
        if (!nom || nom === ' ') return null;
        const nameParts = nom.split(' ');
        const firstName = nameParts[0] || '';
        const lastName  = nameParts.slice(1).join(' ') || '';
        const emailPro  = row[offset + 11] ? String(row[offset + 11]).trim() : '';
        const emailPerso = row[offset + 12] ? String(row[offset + 12]).trim() : '';
        // Ignorer si email ressemble à un téléphone
        const validEmail = (e) => e && e.includes('@') ? e : '';
        return {
            id:          Date.now() + Math.random(),
            firstName,
            lastName,
            role:        row[offset + 17] ? String(row[offset + 17]).trim() : '',
            phone:       this._normalizeBobPhone(row[offset + 7]),
            mobile:      this._normalizeBobPhone(row[offset + 8]) || this._normalizeBobPhone(row[offset + 9]),
            emailPro:    validEmail(emailPro),
            emailPerso:  validEmail(emailPerso),
            isActive:    true,
            createdDate: new Date().toISOString(),
        };
    },

    _parseBobTags(val) {
        if (!val) return [];
        return String(val).split(';').map(t => t.trim()).filter(Boolean);
    },

    async previewBobImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        await this.requireXLSX();
        Swal.fire({ title: 'Analyse en cours…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const wb   = XLSX.read(e.target.result, { type: 'array' });
                const ws   = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

                // Vérification format Bob Booking
                const header2 = rows[1] || [];
                if (!header2[0] || !String(header2[0]).includes('Nom')) {
                    return Swal.fire('Erreur', "Ce fichier ne semble pas être un export Bob Booking valide.", 'error');
                }

                const dataRows = rows.slice(2).filter(r => r[0] && String(r[0]).trim());
                let totalContacts = 0, duplicates = 0;
                const allCats = new Set(), allGenres = new Set(), allReseaux = new Set();
                const existingNames = new Set(this.db.structures.map(s => s.name.toLowerCase().trim()));

                dataRows.forEach(row => {
                    if (row[17] && String(row[17]).trim()) totalContacts++;
                    if (row[39] && String(row[39]).trim()) totalContacts++;
                    if (row[61] && String(row[61]).trim()) totalContacts++;
                    this._parseBobTags(row[83]).forEach(t => allCats.add(t));
                    this._parseBobTags(row[84]).forEach(t => allGenres.add(t));
                    this._parseBobTags(row[85]).forEach(t => allReseaux.add(t));
                    if (existingNames.has(String(row[0]).toLowerCase().trim())) duplicates++;
                });

                Swal.close();

                const r = await Swal.fire({
                    title: "Aperçu — Import Bob Booking",
                    html: `<div class="text-left space-y-3 mt-2">
                        <div class="grid grid-cols-2 gap-2">
                            <div class="bg-indigo-50 rounded-xl p-3 text-center">
                                <div class="text-2xl font-black text-indigo-700">${dataRows.length}</div>
                                <div class="text-xs text-indigo-500 font-bold">Structures</div>
                            </div>
                            <div class="bg-purple-50 rounded-xl p-3 text-center">
                                <div class="text-2xl font-black text-purple-700">${totalContacts}</div>
                                <div class="text-xs text-purple-500 font-bold">Contacts</div>
                            </div>
                            <div class="bg-emerald-50 rounded-xl p-3 text-center">
                                <div class="text-2xl font-black text-emerald-700">${allCats.size + allGenres.size + allReseaux.size}</div>
                                <div class="text-xs text-emerald-500 font-bold">Tags uniques</div>
                            </div>
                            <div class="bg-${duplicates > 0 ? 'orange' : 'slate'}-50 rounded-xl p-3 text-center">
                                <div class="text-2xl font-black text-${duplicates > 0 ? 'orange' : 'slate'}-700">${duplicates}</div>
                                <div class="text-xs text-${duplicates > 0 ? 'orange' : 'slate'}-500 font-bold">Doublons</div>
                            </div>
                        </div>
                        ${duplicates > 0 ? `
                        <div class="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700">
                            <i class="fas fa-exclamation-triangle mr-1"></i>
                            <strong>${duplicates} structure(s)</strong> existent déjà dans votre base.
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-600 mb-1">Gestion des doublons :</label>
                            <select id="swal-bob-dup" class="swal2-input !mt-0 text-sm">
                                <option value="skip">Ignorer (garder l'existant)</option>
                                <option value="merge">Fusionner (compléter les champs vides)</option>
                                <option value="replace">Remplacer (écraser avec Bob Booking)</option>
                            </select>
                        </div>` : ''}
                        <div class="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <label class="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" id="swal-bob-private" checked class="w-4 h-4 rounded accent-indigo-600">
                                <div>
                                    <div class="text-sm font-bold text-slate-700">
                                        <i class="fas fa-lock text-indigo-500 mr-1"></i>
                                        Importer les contacts en mode privé
                                    </div>
                                    <div class="text-xs text-slate-400 mt-0.5">
                                        Visibles uniquement par vous — sauf s'ils existent déjà en public
                                    </div>
                                </div>
                            </label>
                        </div>
                        <div class="text-xs text-slate-400">Fichier : ${file.name}</div>
                    </div>`,
                    showCancelButton:  true,
                    confirmButtonText: `<i class="fas fa-file-import mr-1"></i> Importer ${dataRows.length} structures`,
                    cancelButtonText:  'Annuler',
                    confirmButtonColor: '#4f46e5',
                    focusConfirm: false,
                    preConfirm: () => ({
                        duplicateMode:    document.getElementById('swal-bob-dup')?.value || 'skip',
                        privateContacts:  document.getElementById('swal-bob-private')?.checked ?? true,
                    })
                });

                if (!r.isConfirmed) return;
                await this.executeBobImport(dataRows, r.value.duplicateMode, r.value.privateContacts);

            } catch (err) {
                Swal.fire('Erreur', 'Impossible de lire le fichier : ' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
        event.target.value = '';
    },

    async executeBobImport(dataRows, duplicateMode = 'skip', privateContacts = true) {
        Swal.fire({ title: 'Import en cours…', html: '<b>0</b> / ' + dataRows.length, allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        let imported = 0, skipped = 0, merged = 0, errors = 0;
        const newCats = new Set(), newGenres = new Set(), newReseaux = new Set();

        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            if (!row[0]) continue;
            try {
                const name    = String(row[0]).trim();
                const cats    = this._parseBobTags(row[83]);
                const genres  = this._parseBobTags(row[84]);
                const reseaux = this._parseBobTags(row[85]);

                cats.forEach(t => newCats.add(t));
                genres.forEach(t => newGenres.add(t));
                reseaux.forEach(t => newReseaux.add(t));

                // Récupérer les emails déjà publics dans toute la base
                const publicEmails = new Set();
                this.db.structures.forEach(s => {
                    (s.contacts || []).forEach(c => {
                        if (!c.isPrivate && c.emailPro) publicEmails.add(c.emailPro.toLowerCase());
                        if (!c.isPrivate && c.emailPerso) publicEmails.add(c.emailPerso.toLowerCase());
                    });
                });

                const contacts = [17, 39, 61]
                    .map(offset => this._parseBobContact(row, offset))
                    .filter(Boolean)
                    .map(c => {
                        // Si le contact est déjà public dans la base → rester public
                        const emailLow = (c.emailPro || c.emailPerso || '').toLowerCase();
                        const alreadyPublic = emailLow && publicEmails.has(emailLow);
                        if (privateContacts && !alreadyPublic) {
                            c.isPrivate = true;
                            c.owner     = this.currentUser;
                        }
                        return c;
                    });

                const rawEmail = row[9] ? String(row[9]).trim() : '';
                const email    = rawEmail.includes('@') ? rawEmail : '';

                const struct = {
                    id:           String(Date.now()) + String(Math.floor(Math.random()*9999)),
                    name,
                    address:      row[2]  ? String(row[2]).trim()  : '',
                    suiteAddress: row[3]  ? String(row[3]).trim()  : '',
                    zip:          row[4]  ? String(row[4]).trim()  : '',
                    city:         row[5]  ? String(row[5]).trim()  : '',
                    country:      row[6]  ? String(row[6]).trim()  : 'France',
                    phone1:       this._normalizeBobPhone(row[7]),
                    phone2:       this._normalizeBobPhone(row[8]),
                    mobile:       this._normalizeBobPhone(row[10]),
                    email,
                    website:      row[12] ? String(row[12]).trim() : '',
                    isActive:     row[14] === 1 || row[14] === true || row[14] === '1',
                    notes:        row[86] ? String(row[86]).trim() : '',
                    contacts,
                    tags:         { categories: cats, genres, reseaux, keywords: [] },
                    createdDate:  row[16] ? new Date(String(row[16])).toISOString() : new Date().toISOString(),
                    importedFrom: 'Bob Booking',
                    comments:     [],
                };

                const existIdx = this.db.structures.findIndex(s =>
                    s.name.toLowerCase().trim() === name.toLowerCase().trim()
                );

                if (existIdx >= 0) {
                    if (duplicateMode === 'skip') {
                        skipped++;
                    } else if (duplicateMode === 'merge') {
                        const ex = this.db.structures[existIdx];
                        if (!ex.phone1  && struct.phone1)  ex.phone1  = struct.phone1;
                        if (!ex.email   && struct.email)   ex.email   = struct.email;
                        if (!ex.city    && struct.city)    ex.city    = struct.city;
                        if (!ex.website && struct.website) ex.website = struct.website;
                        if (!ex.notes   && struct.notes)   ex.notes   = struct.notes;
                        if (!ex.zip     && struct.zip)     ex.zip     = struct.zip;
                        const existEmails = new Set((ex.contacts || []).map(c => c.emailPro || '').filter(Boolean));
                        struct.contacts.forEach(c => {
                            if (!c.emailPro || !existEmails.has(c.emailPro)) (ex.contacts = ex.contacts || []).push(c);
                        });
                        ['categories', 'genres', 'reseaux'].forEach(k => {
                            const s = new Set(ex.tags?.[k] || []);
                            (struct.tags[k] || []).forEach(t => s.add(t));
                            if (!ex.tags) ex.tags = {};
                            ex.tags[k] = [...s];
                        });
                        this.db.structures[existIdx] = ex;
                        merged++;
                    } else {
                        struct.id = this.db.structures[existIdx].id;
                        this.db.structures[existIdx] = struct;
                        merged++;
                    }
                } else {
                    this.db.structures.push(struct);
                    imported++;
                }
            } catch (err) { errors++; }

            if (i % 25 === 0) {
                try { Swal.getHtmlContainer().innerHTML = `<b>${i+1}</b> / ${dataRows.length}`; } catch(e){}
            }
        }

        // Ajouter les nouveaux tags à la base globale
        if (!this.db.tagCategories) this.db.tagCategories = [];
        if (!this.db.tagGenres)     this.db.tagGenres     = [];
        if (!this.db.tagReseaux)    this.db.tagReseaux    = [];
        newCats.forEach(t    => { if (!this.db.tagCategories.includes(t)) this.db.tagCategories.push(t); });
        newGenres.forEach(t  => { if (!this.db.tagGenres.includes(t))     this.db.tagGenres.push(t); });
        newReseaux.forEach(t => { if (!this.db.tagReseaux.includes(t))    this.db.tagReseaux.push(t); });

        this.logActivity('Import Bob Booking', `${imported} importées, ${merged} fusionnées, ${skipped} ignorées`);
        // Sauvegarde immédiate (bypass debounce) + fermeture propre du spinner
        await this._saveDBNow();
        Swal.close();
        await new Promise(r => setTimeout(r, 150)); // laisser Swal se fermer proprement

        Swal.fire({
            title: 'Import terminé ✓',
            html: `<div class="text-left space-y-2 mt-3">
                <div class="flex justify-between text-sm p-2 bg-emerald-50 rounded-lg">
                    <span>✅ Nouvelles structures importées</span>
                    <strong class="text-emerald-700">${imported}</strong>
                </div>
                <div class="flex justify-between text-sm p-2 bg-indigo-50 rounded-lg">
                    <span>🔀 Fusionnées / Remplacées</span>
                    <strong class="text-indigo-700">${merged}</strong>
                </div>
                <div class="flex justify-between text-sm p-2 bg-slate-50 rounded-lg">
                    <span>⏭ Ignorées (doublons)</span>
                    <strong class="text-slate-600">${skipped}</strong>
                </div>
                ${errors ? `<div class="flex justify-between text-sm p-2 bg-red-50 rounded-lg">
                    <span>❌ Erreurs</span><strong class="text-red-600">${errors}</strong>
                </div>` : ''}
            </div>`,
            icon: 'success',
            confirmButtonColor: '#4f46e5',
        });
    },

    async loadAdminUsers() {
        try {
            const snapshot = await getDocs(collection(dbFirestore, "users_registry"));
            this.adminUsers = snapshot.docs.map(d => d.data()).sort((a, b) => (b.lastLogin || '').localeCompare(a.lastLogin || ''));
        } catch (e) {
            console.error("Erreur chargement utilisateurs");
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
            console.error("Erreur export base");
            Swal.fire('Erreur', 'Impossible de générer la sauvegarde : ' + e.message, 'error');
        }
    },

    async exportFullExcel() {
        await this.requireXLSX();
        try {
            const wb = XLSX.utils.book_new();

            // ── Feuille 1 : Structures ──
            const structRows = (this.db.structures || []).map(s => ({
                'Nom':           s.name        || '',
                'Ville':         s.city         || '',
                'Code postal':   s.zip          || '',
                'Région':        s.region       || '',
                'Adresse':       s.address      || '',
                'Téléphone':     s.phone1       || '',
                'Email':         s.email        || '',
                'Site web':      s.website      || '',
                'Capacité':      s.capacity     || '',
                'Saison':        s.season       || '',
                'Catégories':    (s.tags?.categories || []).join(', '),
                'Genres':        (s.tags?.genres     || []).join(', '),
                'Réseaux':       (s.tags?.reseaux    || []).join(', '),
                'Notes':         s.notes        || '',
                'Actif':         s.isActive !== false ? 'Oui' : 'Non',
                'VIP':           s.isVip ? 'Oui' : 'Non',
                'GPS Lat':       s.lat          || '',
                'GPS Lng':       s.lng          || '',
                'Nb contacts':   (s.contacts    || []).length,
                'Date création': s.createdDate ? new Date(s.createdDate).toLocaleDateString('fr-FR') : '',
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(structRows), 'Structures');

            // ── Feuille 2 : Contacts ──
            const contactRows = [];
            (this.db.structures || []).forEach(s => {
                (s.contacts || []).forEach(c => {
                    contactRows.push({
                        'Prénom':        c.firstName    || '',
                        'Nom':           c.lastName     || '',
                        'Fonction':      c.role         || '',
                        'Structure':     s.name         || '',
                        'Ville':         s.city         || '',
                        'Email pro':     c.emailPro     || '',
                        'Email perso':   c.emailPerso   || '',
                        'Téléphone':     c.phone        || '',
                        'Mobile':        c.mobile       || '',
                        'Notes':         c.notes        || '',
                        'Privé':         c.isPrivate ? 'Oui' : 'Non',
                        'Date création': c.createdDate ? new Date(c.createdDate).toLocaleDateString('fr-FR') : '',
                    });
                });
            });
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(contactRows), 'Contacts');

            // ── Feuille 3 : Affaires (pipeline) ──
            const eventRows = (this.db.events || []).map(e => ({
                'Lieu':          e.venueName    || '',
                'Ville':         e.city         || '',
                'Projet':        this.getProjectName(e.projectId) || '',
                'Date':          e.date         || '',
                'Étape':         e.stage        || '',
                'Statut':        e.status       || '',
                'Cachet':        e.fee          || '',
                'Type contrat':  e.contractType || '',
                'Contact':       e.contactName  || '',
                'Notes':         e.notes        || '',
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eventRows), 'Affaires');

            // ── Feuille 4 : Projets ──
            const projectRows = (this.db.projects || []).map(p => ({
                'Nom':          p.name         || '',
                'Description':  p.description  || '',
                'Actif':        p.isActive !== false ? 'Oui' : 'Non',
                'Nb affaires':  (this.db.events || []).filter(e => e.projectId === p.id).length,
                'CA confirmé':  (this.db.events || []).filter(e => e.projectId === p.id && (e.status === 'conf' || e.stage === 'won')).reduce((s, e) => s + (Number(e.fee) || 0), 0),
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projectRows), 'Projets');

            // Télécharger
            const date = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
            XLSX.writeFile(wb, `CoopArtBooking_export_${date}.xlsx`);

            Swal.fire({ title: 'Export Excel téléchargé ✓', icon: 'success', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
        } catch (e) {
            console.error("Erreur export Excel");
            Swal.fire('Erreur', 'Impossible de générer le fichier Excel : ' + e.message, 'error');
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
            const text   = await file.text();
            const backup = JSON.parse(text);

            // Validation : vérifier que c'est bien un backup CoopArt
            if (!backup.exportDate && !backup.structures && !backup.projects) {
                throw new Error('Ce fichier ne semble pas être un backup CoopArt Booking valide.');
            }

            // Afficher les infos du backup avant restauration
            const backupInfo = `
                <div class="text-left text-sm space-y-1 mt-2">
                    <div><b>Exporté le :</b> ${backup.exportDate ? new Date(backup.exportDate).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '?'}</div>
                    <div><b>Par :</b> ${backup.exportBy || '?'}</div>
                    <div><b>Structures :</b> ${(backup.structures || []).length}</div>
                    <div><b>Affaires :</b> ${(backup.events || []).length}</div>
                    <div><b>Projets :</b> ${(backup.projects || []).length}</div>
                    <div><b>Tâches :</b> ${(backup.tasks || []).length}</div>
                </div>`;

            const confirm2 = await Swal.fire({
                title: 'Confirmer la restauration ?',
                html: `${backupInfo}<p class="text-red-600 font-bold text-xs mt-3">⚠️ Toutes les données actuelles seront remplacées.</p>`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                confirmButtonText: 'Oui, restaurer',
                cancelButtonText: 'Annuler',
            });
            if (!confirm2.isConfirmed) return Swal.close();

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
            console.error("Erreur import base");
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
            text:   this.sanitizeText(this.newChangelogEntry, 500),
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
                adminEmails:   this.adminEmails,
                allowedEmails: this.allowedEmails || [],
                changelog:     this.adminChangelog,
            });
        } catch (e) {
            console.error("Erreur sauvegarde config admin");
            Swal.fire('Erreur', 'Impossible de sauvegarder la configuration.', 'error');
        }
    },

    // --- LISTE BLANCHE INSCRIPTIONS ---
    async addAllowedEmail() {
        const email = (this.newAllowedEmail || '').trim().toLowerCase();
        if (!email || !email.includes('@')) return Swal.fire('Erreur', 'Email invalide.', 'warning');
        if (!this.allowedEmails) this.allowedEmails = [];
        if (this.allowedEmails.includes(email)) return Swal.fire('Info', 'Cet email est déjà autorisé.', 'info');
        this.allowedEmails.push(email);
        this.newAllowedEmail = '';
        await this.saveAdminConfig();
        Swal.fire({ title: 'Email autorisé ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

    async removeAllowedEmail(email) {
        const r = await Swal.fire({
            title: 'Retirer cet email ?',
            text: `${email} ne pourra plus créer de compte.`,
            icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#ef4444', confirmButtonText: 'Retirer'
        });
        if (r.isConfirmed) {
            this.allowedEmails = (this.allowedEmails || []).filter(e => e !== email);
            await this.saveAdminConfig();
        }
    },

    // --- RÉINITIALISATION MOT DE PASSE (admin) ---
    async sendPasswordReset() {
        const r = await Swal.fire({
            title: 'Réinitialiser un mot de passe',
            html: `<p class="text-sm text-slate-500 mb-3">Firebase enverra un lien de réinitialisation à l'adresse indiquée.</p>
                   <input id="swal-reset-email" class="swal2-input" type="email" placeholder="email@exemple.com">`,
            showCancelButton:  true,
            confirmButtonText: 'Envoyer le lien',
            cancelButtonText:  'Annuler',
            confirmButtonColor: '#4f46e5',
            focusConfirm: false,
            preConfirm: () => {
                const email = document.getElementById('swal-reset-email').value.trim();
                if (!email || !email.includes('@')) {
                    Swal.showValidationMessage('Veuillez saisir un email valide');
                    return false;
                }
                return email;
            }
        });

        if (!r.isConfirmed || !r.value) return;

        try {
            await sendPasswordResetEmail(auth, r.value);
            Swal.fire({
                title: 'Email envoyé ✓',
                html: `Un lien de réinitialisation a été envoyé à<br><strong>${r.value}</strong><br><small class="text-slate-400">Valable 1 heure — vérifier les spams</small>`,
                icon: 'success',
                confirmButtonColor: '#4f46e5',
            });
        } catch (e) {
            const msg = e.code === 'auth/user-not-found'
                ? 'Aucun compte Firebase trouvé pour cet email.'
                : `Erreur : ${e.message}`;
            Swal.fire('Erreur', msg, 'error');
        }
    },
};
