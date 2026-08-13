// js/modules/importMethods.js — Import Excel, Export natif CRM, modale Projet
// Section : entre // --- IMPORT EXCEL --- et // --- IMPORT CULTURE.GOUV.FR ---

import { matchStructure, addAlias, mergeInto, buildMergeComment } from './structMatch.js?v=28';

// Couleurs par défaut des projets (même constante que dans app.js)
const DEFAULT_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];

export const importMethods = {

    // --- IMPORT EXCEL ---
    // Gère 2 formats :
    //   • Format natif CRM (ex: export Billom) : 2 lignes d'en-tête, jusqu'à 3 contacts par ligne
    //   • Format export appli (flat, 1 contact par ligne)
    async importContactsExcel(event) {
        await this.requireXLSX();
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data      = new Uint8Array(e.target.result);
                const workbook  = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                // Lecture brute (tableau de tableaux)
                const raw = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                if (raw.length < 2) return Swal.fire('Info', 'Fichier vide.', 'info');

                const isNativeFormat = (raw[0][0] === 'Structure');
                let countContacts = 0, countStructs = 0;

                // ── Helpers ──────────────────────────────────────────────
                const str  = v => (v === null || v === undefined || v === '') ? '' : String(v).trim();
                const bool = v => str(v) === '1' || str(v).toLowerCase() === 'oui' || str(v).toLowerCase() === 'true';

                // ── Table de décisions (remplie par la phase d'analyse) ──
                // clé "nom|ville" -> { action:'merge'|'mergeKey'|'create', targetId, targetKey, resolved }
                const decisions = new Map();
                const keyOf = (name, city) =>
                    `${String(name || '').toLowerCase().trim()}|${String(city || '').toLowerCase().trim()}`;

                let countMerged = 0;
                const mergeLog = [];   // { name, reason, conflicts }

                const findOrCreateStruct = (name, city, incomingArg = null) => {
                    if (!name) return null;
                    const key = keyOf(name, city);
                    let d = decisions.get(key);
                    if (!d) { d = { action: 'create' }; decisions.set(key, d); }
                    if (d.resolved) return d.resolved;
                    const incoming = incomingArg || d._incoming || null;

                    // Rattachement à une fiche existante de l'annuaire
                    if (d.action === 'merge' && d.targetId != null) {
                        const target = this.db.structures.find(x => String(x.id) === String(d.targetId));
                        if (target) {
                            d.resolved = target;
                            countMerged++;
                            const alias1 = addAlias(target, name);
                            if (incoming) {
                                const { filled, conflicts, aliasAdded } = mergeInto(target, incoming);
                                if (filled.length || conflicts.length) {
                                    target.comments = Array.isArray(target.comments) ? target.comments : [];
                                    target.comments.push(buildMergeComment({
                                        source: 'import fichier', filled, conflicts, user: this.currentUserName,
                                    }));
                                }
                                mergeLog.push({ name: target.name, reason: d.reason || '', conflicts, aliasAdded: alias1 || aliasAdded });
                            } else {
                                mergeLog.push({ name: target.name, reason: d.reason || '', conflicts: [], aliasAdded: alias1 });
                            }
                            return target;
                        }
                    }

                    // Rattachement à une autre ligne du MÊME fichier
                    if (d.action === 'mergeKey' && d.targetKey && d.targetKey !== key) {
                        const td = decisions.get(d.targetKey);
                        if (td) {
                            const target = td.resolved || findOrCreateStruct(td._name, td._city, td._incoming);
                            if (target) {
                                d.resolved = target;
                                countMerged++;
                                const alias2 = addAlias(target, name);
                                mergeLog.push({ name: target.name, reason: d.reason || 'doublon dans le fichier', conflicts: [], aliasAdded: alias2 });
                                return target;
                            }
                        }
                    }

                    // Création
                    const now = new Date().toISOString();
                    const s = {
                        id: Date.now() + Math.random(),
                        name, city,
                        clientCode: '', source: '', createdDate: now,
                        address: '', suite: '', zip: '', country: 'France',
                        phone1: '', phone2: '', mobile: '', fax: '', email: '', website: '',
                        capacity: '', season: '', hours: '', lat: null, lng: null,
                        siret: '', licence: '', govId: '', aliases: [],
                        isClient: false, isActive: true,
                        contacts: [], comments: [], venues: [],
                        tags: { categories: [], genres: [], reseaux: [], keywords: [] },
                        createdAt:  now, createdBy:  this.currentUserName,
                        updatedAt:  now, updatedBy:  this.currentUserName,
                        importedAt: now, importedBy: this.currentUserName,
                    };
                    this.db.structures.push(s);
                    countStructs++;
                    d.resolved = s;
                    return s;
                };

                const buildContact = (cols, base, hasVisibility) => {
                    const firstName = str(cols[base]);
                    const lastName  = str(cols[base + 1]);
                    if (!firstName && !lastName) return null;
                    return {
                        id:           Date.now() + Math.random(),
                        firstName,
                        lastName,
                        name:         [firstName, lastName].filter(Boolean).join(' '),
                        address:      str(cols[base + 2]),
                        suiteAddress: str(cols[base + 3]),
                        zip:          str(cols[base + 4]),
                        city:         str(cols[base + 5]),
                        country:      str(cols[base + 6]),
                        phonePerso:   str(cols[base + 7]),
                        phoneDirect:  str(cols[base + 8]),
                        mobilePro:    str(cols[base + 9]),
                        mobilePerso:  str(cols[base + 10]),
                        mobile2:      str(cols[base + 11]),
                        emailPro:     str(cols[base + 12]),
                        emailPerso:   str(cols[base + 13]),
                        isVip:        bool(cols[base + 14]),
                        tchat:        str(cols[base + 15]),
                        tchatCode:    str(cols[base + 16]),
                        website:      str(cols[base + 17]),
                        role:         str(cols[base + 18]),
                        createdDate:  str(cols[base + 19]) || new Date().toISOString(),
                        modifiedDate: str(cols[base + 20]),
                        isActive:     str(cols[base + 21]) !== '0' && str(cols[base + 21]).toLowerCase() !== 'false',
                        suiviPar:     str(cols[base + 22]) || this.currentUserName,
                        // Colonne Visibilité (nouveau format) : base+23
                        isPrivate:    hasVisibility
                                        ? str(cols[base + 23]).toLowerCase() === 'privé' || str(cols[base + 23]).toLowerCase() === 'prive'
                                        : false,
                        owner:        this.currentUser,
                        notes:        '',
                        comments:     []
                    };
                };

                const splitTags = v => str(v) ? str(v).split(';').map(x => x.trim()).filter(Boolean) : [];

                // ═══════════════════════════════════════════════════════════
                // PHASE 1 — ANALYSE : repérer les doublons AVANT d'écrire
                // ═══════════════════════════════════════════════════════════
                const incomingList = [];   // structures uniques du fichier
                const seen = new Map();

                const collect = (o) => {
                    if (!o.name) return;
                    const key = keyOf(o.name, o.city);
                    if (seen.has(key)) {
                        // Complète les signaux manquants depuis les lignes suivantes
                        const prev = seen.get(key);
                        Object.keys(o).forEach(k => { if (!prev[k] && o[k]) prev[k] = o[k]; });
                        return;
                    }
                    const rec = { ...o, _key: key };
                    seen.set(key, rec);
                    incomingList.push(rec);
                };

                if (isNativeFormat) {
                    const hdr = raw[1] || [];
                    const hasVis = str(hdr[40]).toLowerCase() === 'visibilité' || str(hdr[40]).toLowerCase() === 'visibilite';
                    raw.slice(2).forEach(cols => {
                        if (!str(cols[0])) return;
                        collect({
                            name: str(cols[0]), city: str(cols[5]), zip: str(cols[4]),
                            address: str(cols[2]), phone1: str(cols[7]), phone2: str(cols[8]),
                            email: str(cols[9]), mobile: str(cols[10]), website: str(cols[12]),
                        });
                    });
                    void hasVis;
                } else {
                    const hdrs = raw[0];
                    raw.slice(1).forEach(cols => {
                        const row = {};
                        hdrs.forEach((h, i) => { row[h] = cols[i]; });
                        collect({
                            name:    str(row["Structure - Nom"] || row["Nom"] || "Structure importée"),
                            city:    str(row["Structure - Ville"] || row["Ville"] || ""),
                            zip:     str(row["Structure - Code Postal"]),
                            address: str(row["Structure - Adresse"]),
                            phone1:  str(row["Structure - Tél 1"]),
                            phone2:  str(row["Structure - Tél 2"]),
                            mobile:  str(row["Structure - Mobile"]),
                            email:   str(row["Structure - E-mail"]),
                            website: str(row["Structure - Site"]),
                        });
                    });
                }

                // Classement : annuaire existant + lignes déjà traitées du fichier
                // (pour attraper aussi les doublons INTERNES au fichier)
                const virtual = this.db.structures.slice();
                const ambiguous = [];
                let autoCount = 0;

                incomingList.forEach(inc => {
                    const m = matchStructure(inc, virtual);
                    const d = { action: 'create', _name: inc.name, _city: inc.city, _incoming: inc };

                    if (m.status === 'auto' && m.target) {
                        if (m.target.__pendingKey) { d.action = 'mergeKey'; d.targetKey = m.target.__pendingKey; }
                        else                        { d.action = 'merge';    d.targetId  = m.target.id; }
                        d.reason = m.reasons[0] || '';
                        autoCount++;
                    } else if (m.status === 'suggest' && m.target) {
                        ambiguous.push({ inc, target: m.target, reason: m.reasons[0] || '', score: m.score });
                        d._suggest = m.target;
                    }

                    if (d.action === 'create') {
                        // Placeholder : les lignes suivantes pourront s'y rattacher
                        virtual.push({ ...inc, id: `__pending_${inc._key}`, __pendingKey: inc._key });
                    }
                    decisions.set(inc._key, d);
                });

                // ═══════════════════════════════════════════════════════════
                // PHASE 2 — REVUE : l'utilisateur tranche les cas douteux
                // ═══════════════════════════════════════════════════════════
                if (ambiguous.length) {
                    const esc = v => String(v == null ? '' : v)
                        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

                    const rows = ambiguous.map((a, i) => {
                        const preselMerge = a.score >= 0.7;
                        return `
                        <div class="border border-slate-200 rounded-xl p-3 text-left">
                            <div class="text-sm font-bold text-slate-800">${esc(a.inc.name)}${a.inc.city ? ` <span class="font-normal text-slate-400">(${esc(a.inc.city)})</span>` : ''}</div>
                            <div class="text-[11px] text-orange-600 mb-2"><i class="fas fa-link mr-1"></i>${esc(a.reason)}</div>
                            <label class="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                                <input type="radio" name="dup${i}" value="merge" ${preselMerge ? 'checked' : ''}>
                                <span>Rattacher à <b>${esc(a.target.name)}</b>${a.target.city ? ` (${esc(a.target.city)})` : ''}</span>
                            </label>
                            <label class="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                                <input type="radio" name="dup${i}" value="create" ${preselMerge ? '' : 'checked'}>
                                <span>Créer une nouvelle fiche</span>
                            </label>
                        </div>`;
                    }).join('');

                    const res = await Swal.fire({
                        title: 'Doublons possibles',
                        html: `
                            <p class="text-xs text-slate-500 text-left mb-3">
                                ${ambiguous.length} fiche(s) ressemblent à des structures déjà présentes.
                                Vérifiez les choix pré-cochés avant de continuer.
                            </p>
                            <div class="flex gap-2 mb-3">
                                <button type="button" id="dup-all-merge" class="text-[11px] font-bold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100">Tout rattacher</button>
                                <button type="button" id="dup-all-create" class="text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">Tout créer</button>
                            </div>
                            <div class="space-y-2 max-h-[45vh] overflow-y-auto pr-1">${rows}</div>`,
                        width: 620,
                        showCancelButton: true,
                        confirmButtonText: "Lancer l'import",
                        cancelButtonText: 'Annuler',
                        confirmButtonColor: '#4f46e5',
                        didOpen: () => {
                            const setAll = val => document.querySelectorAll(`input[type=radio][value="${val}"]`)
                                .forEach(r => { r.checked = true; });
                            document.getElementById('dup-all-merge')?.addEventListener('click', () => setAll('merge'));
                            document.getElementById('dup-all-create')?.addEventListener('click', () => setAll('create'));
                        },
                        preConfirm: () => ambiguous.map((a, i) => {
                            const el = document.querySelector(`input[name="dup${i}"]:checked`);
                            return el ? el.value : 'create';
                        }),
                    });

                    if (!res.isConfirmed) { event.target.value = ''; return; }

                    res.value.forEach((choice, i) => {
                        if (choice !== 'merge') return;
                        const a = ambiguous[i];
                        const d = decisions.get(a.inc._key);
                        if (!d) return;
                        if (a.target.__pendingKey) { d.action = 'mergeKey'; d.targetKey = a.target.__pendingKey; }
                        else                        { d.action = 'merge';    d.targetId  = a.target.id; }
                        d.reason = a.reason;
                    });
                }


                // ── Format natif (2 lignes d'en-tête) ───────────────────
                if (isNativeFormat) {
                    const dataRows = raw.slice(2); // skip row0 (sections) + row1 (champs)

                    // Détection format : nouveau (24 champs/contact avec Visibilité) ou ancien (23 champs)
                    // Dans le nouveau format, la col index 40 (row1) est "Visibilité"
                    const headerRow     = raw[1] || [];
                    const hasVisibility = str(headerRow[40]).toLowerCase() === 'visibilité' || str(headerRow[40]).toLowerCase() === 'visibilite';
                    // Bases de contact et positions tags selon le format
                    const contactBases = hasVisibility ? [17, 41, 65] : [17, 40, 63];
                    const tagBase      = hasVisibility ? 89 : 86;

                    dataRows.forEach(cols => {
                        if (!str(cols[0])) return; // ligne vide
                        const struct = findOrCreateStruct(str(cols[0]), str(cols[5]));
                        if (!struct) return;

                        // Champs structure
                        if (!struct.clientCode && str(cols[1]))  struct.clientCode = str(cols[1]);
                        if (!struct.address    && str(cols[2]))  struct.address    = str(cols[2]);
                        if (!struct.suite      && str(cols[3]))  struct.suite      = str(cols[3]);
                        if (!struct.zip        && str(cols[4]))  struct.zip        = str(cols[4]);
                        if (!struct.country    && str(cols[6]))  struct.country    = str(cols[6]);
                        if (!struct.phone1     && str(cols[7]))  struct.phone1     = str(cols[7]);
                        if (!struct.phone2     && str(cols[8]))  struct.phone2     = str(cols[8]);
                        if (!struct.email      && str(cols[9]))  struct.email      = str(cols[9]);
                        if (!struct.mobile     && str(cols[10])) struct.mobile     = str(cols[10]);
                        if (!struct.fax        && str(cols[11])) struct.fax        = str(cols[11]);
                        if (!struct.website    && str(cols[12])) struct.website    = str(cols[12]);
                        struct.isClient = bool(cols[13]);
                        struct.isActive = str(cols[14]) !== '0';
                        if (!struct.source      && str(cols[15])) struct.source      = str(cols[15]);
                        if (!struct.createdDate && str(cols[16])) struct.createdDate = str(cols[16]);

                        // Tags
                        if (!struct.tags) struct.tags = { categories: [], genres: [], reseaux: [], keywords: [] };
                        const cats   = splitTags(cols[tagBase]);
                        const genres = splitTags(cols[tagBase + 1]);
                        const res    = splitTags(cols[tagBase + 2]);
                        const kws    = splitTags(cols[tagBase + 3]);
                        cats.forEach(t => { if (!struct.tags.categories.includes(t)) struct.tags.categories.push(t); });
                        genres.forEach(t => { if (!struct.tags.genres.includes(t)) struct.tags.genres.push(t); });
                        res.forEach(t => { if (!struct.tags.reseaux.includes(t)) struct.tags.reseaux.push(t); });
                        kws.forEach(t => { if (!struct.tags.keywords.includes(t)) struct.tags.keywords.push(t); });

                        // Contacts 1, 2, 3
                        contactBases.forEach(base => {
                            const c = buildContact(cols, base, hasVisibility);
                            if (!c) return;
                            const exists = struct.contacts.some(x =>
                                x.firstName === c.firstName && x.lastName === c.lastName
                            );
                            if (!exists) { struct.contacts.push(c); countContacts++; }
                        });

                        // Métadonnées de modification
                        struct.updatedAt = new Date().toISOString();
                        struct.updatedBy = this.currentUserName;
                    });

                // ── Format export appli (flat, 1 contact par ligne) ──────
                } else {
                    const headers  = raw[0];
                    const dataRows = raw.slice(1);
                    dataRows.forEach(cols => {
                        const row = {};
                        headers.forEach((h, i) => { row[h] = cols[i]; });
                        const structName = str(row["Structure - Nom"] || row["Nom"] || "Structure importée");
                        const cityName   = str(row["Structure - Ville"] || row["Ville"] || "");
                        const struct = findOrCreateStruct(structName, cityName);
                        if (!struct) return;
                        if (!struct.address  && str(row["Structure - Adresse"]))     struct.address  = str(row["Structure - Adresse"]);
                        if (!struct.zip      && str(row["Structure - Code Postal"])) struct.zip      = str(row["Structure - Code Postal"]);
                        if (!struct.phone1   && str(row["Structure - Tél 1"]))       struct.phone1   = str(row["Structure - Tél 1"]);
                        if (!struct.phone2   && str(row["Structure - Tél 2"]))       struct.phone2   = str(row["Structure - Tél 2"]);
                        if (!struct.mobile   && str(row["Structure - Mobile"]))      struct.mobile   = str(row["Structure - Mobile"]);
                        if (!struct.fax      && str(row["Structure - Fax"]))         struct.fax      = str(row["Structure - Fax"]);
                        if (!struct.website  && str(row["Structure - Site"]))        struct.website  = str(row["Structure - Site"]);
                        if (!struct.email    && str(row["Structure - E-mail"]))      struct.email    = str(row["Structure - E-mail"]);
                        if (!struct.capacity && str(row["Structure - Capacité"]))    struct.capacity = str(row["Structure - Capacité"]);

                        const firstName = str(row["Contact - Prénom"]);
                        const lastName  = str(row["Contact - Nom"]);
                        if (firstName || lastName) {
                            struct.contacts.push({
                                id:           Date.now() + Math.random(),
                                firstName,
                                lastName,
                                name:         [firstName, lastName].filter(Boolean).join(' '),
                                role:         str(row["Contact - Fonction"]),
                                emailPro:     str(row["Contact - E-mail direct"]),
                                emailPerso:   str(row["Contact - Email perso"]),
                                phoneDirect:  str(row["Contact - Tél. direct"]),
                                phonePerso:   str(row["Contact - Tél. perso"]),
                                mobilePro:    str(row["Contact - Mobile pro"]),
                                mobilePerso:  str(row["Contact - Mobile"]),
                                mobile2:      str(row["Contact - Mobile 2"]),
                                tchat:        str(row["Contact - Tchat"]),
                                tchatCode:    str(row["Contact - Code du tchat"]),
                                website:      str(row["Contact - Site"]),
                                address:      str(row["Contact - Adresse"]),
                                suiteAddress: str(row["Contact - Suite adresse"]),
                                zip:          str(row["Contact - CP"]),
                                city:         str(row["Contact - Ville"]),
                                country:      str(row["Contact - Pays"]),
                                isVip:        bool(row["Contact - Est prioritaire"]),
                                isActive:     str(row["Contact - Est actif"]) !== '0',
                                suiviPar:     str(row["Contact - Suivi par"]) || this.currentUserName,
                                createdDate:  str(row["Contact - Créé le"])   || new Date().toISOString(),
                                modifiedDate: str(row["Contact - Modifié le"]),
                                isPrivate:    str(row["Contact - Statut"]) === 'Privé',
                                owner:        this.currentUser,
                                notes:        str(row["Contact - Notes"])
                            });
                            countContacts++;
                        }
                    });
                }

                this.saveDB();
                event.target.value = '';

                const escR = v => String(v == null ? '' : v)
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const withConflicts = mergeLog.filter(m => m.conflicts && m.conflicts.length);
                let htmlR = `<div class="text-left text-sm space-y-2">`;
                htmlR += `<p><b>${countContacts}</b> contact(s) importé(s)</p>`;
                htmlR += `<p><b>${countStructs}</b> nouvelle(s) structure(s) créée(s)</p>`;
                if (countMerged) {
                    htmlR += `<p class="text-emerald-600"><b>${countMerged}</b> rattachée(s) à une fiche existante</p>`;
                }
                const aliasesLearned = mergeLog.filter(m => m.aliasAdded);
                if (aliasesLearned.length) {
                    htmlR += `<div class="text-indigo-600 border-t pt-2 mt-2">
                                <p class="text-xs"><i class="fas fa-tags mr-1"></i><b>${aliasesLearned.length}</b> nouvelle(s) variante(s) de nom mémorisée(s) — les prochains imports les reconnaîtront automatiquement :</p>
                                <ul class="text-xs mt-1 ml-4 list-disc">`
                              + aliasesLearned.slice(0, 6).map(m =>
                                    `<li>« ${escR(m.aliasAdded)} » → ${escR(m.name)}</li>`
                                ).join('')
                              + (aliasesLearned.length > 6 ? `<li>… et ${aliasesLearned.length - 6} autre(s)</li>` : '')
                              + `</ul></div>`;
                }
                if (withConflicts.length) {
                    htmlR += `<div class="text-slate-500 border-t pt-2 mt-2">
                                <p class="text-xs"><b>${withConflicts.length}</b> fiche(s) avec données divergentes — valeur existante conservée, détail dans les commentaires :</p>
                                <ul class="text-xs mt-1 ml-4 list-disc">`
                          + withConflicts.slice(0, 6).map(m =>
                                `<li>${escR(m.name)} — ${m.conflicts.map(c => escR(c.label)).join(', ')}</li>`
                            ).join('')
                          + (withConflicts.length > 6 ? `<li>… et ${withConflicts.length - 6} autre(s)</li>` : '')
                          + `</ul></div>`;
                }
                htmlR += `</div>`;

                Swal.fire({ title: 'Importation terminée ✓', html: htmlR, icon: 'success', width: 560, confirmButtonColor: '#059669' });
            } catch (err) {
                console.error("Erreur import Excel");
                Swal.fire('Erreur', 'Impossible de lire le fichier Excel.<br>' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    },

    // --- EXPORT EXCEL (format natif CRM : Structure + Contact 1/2/3 + Tags) ---
    async exportContactsToExcel(contactsList) {
        await this.requireXLSX();
        if (!contactsList || contactsList.length === 0)
            return Swal.fire('Export', 'Aucun contact à exporter.', 'info');
        try {
            // Regroupe les contacts par structure
            const structMap = new Map();
            contactsList.forEach(c => {
                const struct = this.db.structures.find(s => s.id === c.structId) || { id: c.structId };
                if (!structMap.has(c.structId)) structMap.set(c.structId, { struct, contacts: [] });
                structMap.get(c.structId).contacts.push(c);
            });
            this._exportNativeFormat(Array.from(structMap.values()), 'Export_Invitations');
        } catch (err) {
            console.error("Erreur export Excel");
            Swal.fire('Erreur', 'Export impossible.', 'error');
        }
    },

    // ── Méthode partagée : génère le fichier Excel au format natif CRM ──────────
    // entries = [{ struct, contacts[] }]
    async _exportNativeFormat(entries, filename) {
        await this.requireXLSX();
        const CONTACT_FIELDS = ['Prénom','Nom','Adresse','Suite adresse','CP','Ville','Pays',
            'Tél. perso','Tél. direct','Mobile pro','Mobile','Mobile 2',
            'E-mail direct','Email perso','Est prioritaire','Tchat','Code du tchat',
            'Site','Fonction','Créé le','Modifié le','Est actif','Suivi par','Visibilité'];

        // Ligne 0 : en-têtes de sections (24 champs par contact maintenant)
        const row0 = new Array(93).fill('');
        row0[0]  = 'Structure';
        row0[17] = 'Contact 1';
        row0[41] = 'Contact 2';
        row0[65] = 'Contact 3';
        row0[89] = 'Tags';

        // Ligne 1 : noms de champs
        const row1 = [
            'Nom','Code client','Adresse','Suite adresse','Code postal','Ville','Pays',
            'Tél 1','Tél 2','E-mail','Mobile','Fax','Site','Est client','Est actif','Source','Créé le',
            ...CONTACT_FIELDS, ...CONTACT_FIELDS, ...CONTACT_FIELDS,
            'categories','genres (programmation)','reseaux','mots-clef'
        ];

        const contactCols = c => [
            c.firstName    || '',
            c.lastName     || '',
            c.address      || '',
            c.suiteAddress || '',
            c.zip          || '',
            c.city         || '',
            c.country      || '',
            c.phonePerso   || '',
            c.phoneDirect  || '',
            c.mobilePro    || '',
            c.mobilePerso  || '',
            c.mobile2      || '',
            c.emailPro     || '',
            c.emailPerso   || '',
            c.isVip        ? '1' : '0',
            c.tchat        || '',
            c.tchatCode    || '',
            c.website      || '',
            c.role         || '',
            c.createdDate  ? new Date(c.createdDate).toLocaleDateString('fr-FR') : '',
            c.modifiedDate ? new Date(c.modifiedDate).toLocaleDateString('fr-FR') : '',
            c.isActive !== false ? '1' : '0',
            c.suiviPar     || '',
            c.isPrivate    ? 'Privé' : 'Public'
        ];
        const emptyContact = () => new Array(24).fill('');

        const dataRows = entries.map(({ struct: s, contacts }) => {
            const tags = s.tags || {};
            const row = [
                s.name        || '',
                s.clientCode  || '',
                s.address     || '',
                s.suite       || '',
                s.zip         || '',
                s.city        || '',
                s.country     || '',
                s.phone1      || '',
                s.phone2      || '',
                s.email       || '',
                s.mobile      || '',
                s.fax         || '',
                s.website     || '',
                s.isClient    ? '1' : '0',
                s.isActive !== false ? '1' : '0',
                s.source      || '',
                s.createdDate ? new Date(s.createdDate).toLocaleDateString('fr-FR') : '',
                ...(contacts[0] ? contactCols(contacts[0]) : emptyContact()),
                ...(contacts[1] ? contactCols(contacts[1]) : emptyContact()),
                ...(contacts[2] ? contactCols(contacts[2]) : emptyContact()),
                (tags.categories || []).join(';'),
                (tags.genres     || []).join(';'),
                (tags.reseaux    || []).join(';'),
                (tags.keywords   || []).join(';')
            ];
            return row;
        });

        const ws = XLSX.utils.aoa_to_sheet([row0, row1, ...dataRows]);

        // Largeurs colonnes
        const colWidths = [
            30,14,28,18,12,20,12,14,14,28,14,10,28,10,10,16,14, // Structure (17)
            14,20,22,16,10,16,10,12,12,12,12,12,26,26,10,14,16,26,22,14,14,10,16,12, // Contact 1 (24)
            14,20,22,16,10,16,10,12,12,12,12,12,26,26,10,14,16,26,22,14,14,10,16,12, // Contact 2 (24)
            14,20,22,16,10,16,10,12,12,12,12,12,26,26,10,14,16,26,22,14,14,10,16,12, // Contact 3 (24)
            30,35,20,20 // Tags (4)
        ];
        ws['!cols'] = colWidths.map(wch => ({ wch }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Structure & Contacts');
        this.xlsxDownload(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
    },

    openProjectModal(p = null) {
        if (p) {
            this.editProjectData = JSON.parse(JSON.stringify(p));
            if (!this.editProjectData.subProjects) this.editProjectData.subProjects = [];
            if (!this.editProjectData.notes) this.editProjectData.notes = [];
            this.isEditingProject = false;
            this.projectTab = 'resume';
        } else {
            this.editProjectData = {
                id: '', name: '', genre: '', duration: '', defaultFee: 0, feeType: 'HT',
                teamSize: 1, expenses: '', linkVideo: '', linkPress: '', linkTech: '', linkTree: '',
                color: DEFAULT_COLORS[this.db.projects.length % DEFAULT_COLORS.length],
                icon: 'fas fa-music',
                code: '', adminCode: '', analytLabel: '', analytCode: '',
                salePrice: '', ticketPrice: '',
                isActive: true, isPrivate: false,
                subProjects: [],
                notes: [],
            };
            this.isEditingProject = true;
        }
        this.showProjectModal = true;
    },

    // Override getProjectStats pour inclure annulations et taux
    getProjectStats(projectId) {
        const events = this.db.events.filter(e => e.projectId === projectId);
        const conf = events.filter(e => e.status === 'conf' || e.stage === 'won').length;
        const opt  = events.filter(e => e.stage && e.stage !== 'won' && e.stage !== 'ann' && e.status !== 'conf' && e.status !== 'ann').length;
        const ann  = events.filter(e => e.status === 'ann' || e.stage === 'ann').length;
        const ca   = events.filter(e => e.status === 'conf' || e.stage === 'won').reduce((s, e) => s + (Number(e.fee) || 0), 0);
        const total = conf + opt + ann;
        const rate  = total > 0 ? Math.round((conf / total) * 100) : 0;
        return { conf, opt, ann, ca, rate };
    },

    addSubProject() {
        if (!this.editProjectData.subProjects) this.editProjectData.subProjects = [];
        this.editProjectData.subProjects.push({
            id:          Date.now().toString(),
            name:        '',
            code:        '',
            fee:         '',
            ticketPrice: '',
        });
    },
};
