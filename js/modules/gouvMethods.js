// js/modules/gouvMethods.js — Import Culture.gouv.fr et Import CSV libre
// Section : entre // --- IMPORT CULTURE.GOUV.FR --- et // --- EXPORT AVEC MAPPING ---

import { matchStructure, mergeInto, buildMergeComment } from './structMatch.js?v=20';

// Ressource "Basilic" sur data.gouv.fr (CSV interrogeable via l'API tabulaire).
// Mis à jour le 18/02/2026 — 86 366 lieux. Voir :
// https://www.data.gouv.fr/datasets/base-des-lieux-et-equipements-culturels-basilic
const BASILIC_RESOURCE = 'dced78ee-0823-4b61-86e6-57717308d4e4';
const BASILIC_URL      = `https://tabular-api.data.gouv.fr/api/resources/${BASILIC_RESOURCE}/data/`;

export const gouvMethods = {

    // --- IMPORT CULTURE.GOUV.FR ---
    openGouvImport() {
        this.showGouvImport = true;
        this.gouvImport.results  = [];
        this.gouvImport.selected = [];
        this.gouvImport.error    = '';
        this.gouvImport.totalFound = 0;
        this.gouvImport.page     = 0;
        this.gouvImport.activeTab = 'gouv';
        this.csvImport.headers   = [];
        this.csvImport.rows      = [];
        this.csvImport.mapping   = {};
        this.csvImport.fileName  = '';
    },

    // --- IMPORT CSV LIBRE ---
    async loadCsvFile(event) {
        await this.requireXLSX();
        const file = event.target.files[0];
        if (!file) return;
        event.target.value = '';
        this.csvImport.fileName = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data     = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet    = workbook.Sheets[workbook.SheetNames[0]];
                const json     = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                if (!json.length) return Swal.fire('Fichier vide', 'Aucune donnée détectée.', 'info');
                this.csvImport.headers = Object.keys(json[0]);
                this.csvImport.rows    = json;
                // Auto-mapping intelligent
                this.csvImport.mapping = {};
                const autoMap = {
                    name:     ['nom','name','structure','lieu','libelle','denomination','organisme','établissement'],
                    address:  ['adresse','address','rue','voie','adresse_1'],
                    zip:      ['cp','code_postal','zip','postal','codepostal','code postal'],
                    city:     ['ville','city','commune','localite','municipalite'],
                    country:  ['pays','country'],
                    phone:    ['telephone','tel','phone','téléphone','tél'],
                    email:    ['email','mail','courriel','e-mail'],
                    website:  ['site','url','web','website','site_internet','site internet'],
                    capacity: ['jauge','capacity','capacite','places'],
                    category: ['categorie','type','category','label','appellation'],
                    genre:    ['genre','style','musique','esthétique'],
                    source:   ['source','origine','provenance'],
                };
                this.csvImport.headers.forEach(h => {
                    const hl = h.toLowerCase().trim();
                    Object.entries(autoMap).forEach(([key, aliases]) => {
                        if (!this.csvImport.mapping[key] && aliases.some(a => hl.includes(a))) {
                            this.csvImport.mapping[key] = h;
                        }
                    });
                });
                Swal.fire({ title: `${json.length} lignes détectées ✓`, text: `${this.csvImport.headers.length} colonnes trouvées. Vérifiez le mapping puis importez.`, icon: 'success', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
            } catch (err) {
                Swal.fire('Erreur', 'Fichier non lisible : ' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    },

    async importCsvStructures() {
        const m = this.csvImport.mapping;
        if (!m.name) return Swal.fire('Champ requis', 'Associez au minimum la colonne "Nom" pour importer.', 'warning');
        let imported = 0, skipped = 0;
        this.csvImport.rows.forEach(row => {
            const name = String(row[m.name] || '').trim();
            const city = String(row[m.city] || '').trim();
            if (!name) return;
            // Doublon check
            const exists = this.db.structures.some(s => s.name.toLowerCase() === name.toLowerCase() && (s.city||'').toLowerCase() === city.toLowerCase());
            if (exists) { skipped++; return; }
            const catTag   = m.category && row[m.category] ? this.gouvTypeToTag(String(row[m.category])) || String(row[m.category]).trim() : '';
            const genreTag = m.genre    && row[m.genre]    ? String(row[m.genre]).trim() : '';
            const now = new Date().toISOString();
            this.db.structures.push({
                id:           Date.now().toString() + Math.random().toString(36).slice(2),
                name,
                isClient:     false, isActive: true,
                clientCode:   '',
                source:       m.source && row[m.source] ? String(row[m.source]).trim() : (this.csvImport.fileName || 'Import CSV'),
                createdDate:  now,
                address:      m.address  ? String(row[m.address]  || '').trim() : '',
                suite:        '',
                zip:          m.zip      ? String(row[m.zip]      || '').trim() : '',
                city,
                country:      m.country  ? String(row[m.country]  || '').trim() : 'France',
                phone1:       m.phone    ? String(row[m.phone]    || '').trim() : '',
                phone2: '', mobile: '', fax: '',
                email:        m.email    ? String(row[m.email]    || '').trim() : '',
                website:      m.website  ? String(row[m.website]  || '').trim() : '',
                capacity:     m.capacity ? String(row[m.capacity] || '').trim() : '',
                season: '', hours: '', progMonthStart: '', progMonthEnd: '',
                lat: null, lng: null,
                tags: {
                    categories: catTag   ? [catTag]   : [],
                    genres:     genreTag ? [genreTag] : [],
                    reseaux:    [], keywords: []
                },
                contacts: [], comments: [], venues: [],
                createdAt:  now, createdBy:  this.currentUserName,
                updatedAt:  now, updatedBy:  this.currentUserName,
                importedAt: now, importedBy: this.currentUserName,
            });
            imported++;
        });
        await this.saveDB();
        this.csvImport.headers = [];
        this.csvImport.rows    = [];
        this.csvImport.mapping = {};
        this.showGouvImport    = false;
        Swal.fire({
            title: 'Import CSV terminé ✓',
            html:  `<b>${imported}</b> structure(s) importée(s)${skipped > 0 ? `<br><span class="text-orange-500">${skipped} doublon(s) ignoré(s)</span>` : ''}`,
            icon:  'success', confirmButtonColor: '#059669'
        });
    },

    resetGouvSearch() {
        this.gouvImport.searchName   = '';
        this.gouvImport.filterType   = '';
        this.gouvImport.filterDept   = '';
        this.gouvImport.filterRegion = '';
        this.gouvImport.results      = [];
        this.gouvImport.selected     = [];
        this.gouvImport.totalFound   = 0;
        this.gouvImport.page         = 0;
        this.gouvImport.error        = '';
    },

    // ─────────────────────────────────────────────────────────────────────
    // Source : jeu « Basilic » (Base des lieux et équipements culturels)
    // hébergé sur data.gouv.fr, interrogé via l'API tabulaire.
    // ⚠️ L'ancien portail Opendatasoft (data.culture.gouv.fr) a été retiré.
    // Si la ressource change un jour, seul BASILIC_RESOURCE est à modifier.
    // ─────────────────────────────────────────────────────────────────────

    // Construit une query string en encodant %20 (et non "+") : les noms de
    // colonnes contiennent des espaces et des accents.
    _gouvQuery(pairs) {
        return pairs
            .filter(([, v]) => v !== '' && v != null)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
    },

    // Convertit une ligne du CSV Basilic en objet "lieu" utilisé par l'interface.
    _gouvMapRow(r, i) {
        const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
        const lat = num(r.Latitude);
        const lng = num(r.Longitude);
        const adresse = [r.Adresse, r['Complement Adresse']].filter(Boolean).join(' ').trim();
        const govId = r.Identifiant_deps_a_partir_de_2022 || '';
        return {
            id:        `gouv_${govId || r.__id || i}`,
            nom:       (r.Nom || '').trim(),
            adresse,
            cp:        r['Code Postal'] || '',
            ville:     r.libelle_geographique || '',
            type:      r['Label et appellation'] || r['Type équipement ou lieu'] || '',
            domaine:   r.Domaine || '',
            sousDomaine: r.Sous_domaine || '',
            site:      '',        // absent de cette source
            telephone: '',        // absent de cette source
            dept:      r['N_Département'] || '',
            region:    r['Région']        || '',
            lat, lng,
            hasGps:    !!(lat && lng),
            govId,
            siret:     '',
            licence:   '',
            capacity:  r.Jauge_du_theatre || r.Nombre_fauteuils_de_cinema || '',
        };
    },

    async searchGouv(resetPage = true) {
        if (resetPage === true) this.gouvImport.page = 0;
        this.gouvImport.loading = true;
        this.gouvImport.error   = '';
        this.gouvImport.results = [];

        try {
            const g = this.gouvImport;
            const pairs = [
                ['page',      String((g.page || 0) + 1)],   // l'API pagine à partir de 1
                ['page_size', '50'],                        // maximum autorisé
            ];

            const name = (g.searchName || '').trim();
            if (name) pairs.push(['Nom__contains', name]);

            const city = (g.filterCity || '').trim();
            if (city) pairs.push(['libelle_geographique__contains', city]);

            // Département : "1" → "01" (les codes sont sur 2 caractères, 2A/2B pour la Corse)
            const dept = (g.filterDept || '').trim().toUpperCase().replace(/\s/g, '');
            if (dept) pairs.push(['N_Département__exact', /^[0-9]$/.test(dept) ? '0' + dept : dept]);

            if (g.filterRegion)  pairs.push(['Région__exact',  g.filterRegion]);
            if (g.filterDomaine) pairs.push(['Domaine__exact', g.filterDomaine]);
            if (g.filterType)    pairs.push(['Label et appellation__contains', g.filterType]);

            const url  = `${BASILIC_URL}?${this._gouvQuery(pairs)}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const json = await resp.json();
            const rows = Array.isArray(json.data) ? json.data : [];
            this.gouvImport.totalFound = (json.meta && json.meta.total) || rows.length;
            this.gouvImport.results    = rows.map((r, i) => this._gouvMapRow(r, i));

            if (!rows.length) {
                this.gouvImport.error = 'Aucun résultat. Élargissez la recherche (nom partiel, sans département…).';
            }
        } catch (e) {
            console.error('Import Gouv.fr', e);
            this.gouvImport.error = "Impossible de contacter data.gouv.fr. Réessayez dans un instant.";
        } finally {
            this.gouvImport.loading = false;
        }
    },

    async gouvNextPage() {
        this.gouvImport.page++;
        await this.searchGouv(false);
    },

    async gouvPrevPage() {
        if (this.gouvImport.page > 0) {
            this.gouvImport.page--;
            await this.searchGouv(false);
        }
    },

    gouvToggleSelect(lieu) {
        const idx = this.gouvImport.selected.findIndex(s => s.id === lieu.id);
        if (idx > -1) this.gouvImport.selected.splice(idx, 1);
        else          this.gouvImport.selected.push(lieu);
    },

    gouvIsSelected(lieu) {
        return this.gouvImport.selected.some(s => s.id === lieu.id);
    },

    gouvSelectAll() {
        this.gouvImport.results.forEach(lieu => {
            if (!this.gouvIsSelected(lieu)) this.gouvImport.selected.push(lieu);
        });
    },

    // Convertit un résultat de recherche gouv en objet "structure" comparable.
    _gouvToStruct(lieu) {
        return {
            name:    lieu.nom     || '',
            city:    lieu.ville   || '',
            zip:     lieu.cp      || '',
            address: lieu.adresse || '',
            region:  lieu.region  || '',
            website: lieu.site    || '',
            phone1:  lieu.telephone || '',
            email:   '',
            siret:    lieu.siret   || '',
            licence:  lieu.licence || '',
            govId:    lieu.govId   || '',
            capacity: lieu.capacity || '',
            lat:     lieu.lat,
            lng:     lieu.lng,
        };
    },

    // Rapprochement via le moteur partagé (structMatch.js).
    _gouvMatch(lieu) {
        return matchStructure(this._gouvToStruct(lieu), this.db.structures);
    },

    // Badge "Déjà importé" dans la liste de résultats : uniquement les certitudes.
    gouvAlreadyExists(lieu) {
        return this._gouvMatch(lieu).status === 'auto';
    },

    // Badge "À vérifier" : doublon probable, mais l'utilisateur tranchera.
    gouvMaybeExists(lieu) {
        return this._gouvMatch(lieu).status === 'suggest';
    },

    // Mapping type gouv → tag catégorie
    gouvTypeToTag(type) {
        const t = (type || '').toLowerCase();
        // Vocabulaire "Label et appellation" / "Type équipement ou lieu" de Basilic
        if (t.includes('scène nationale'))      return 'Scène Nationale';
        if (t.includes('scène conventionnée'))  return 'Scène Conventionnée';
        if (t.includes('smac'))                 return 'SMAC';
        if (t.includes('musiques actuelles'))   return 'SMAC';
        if (t.includes('centre dramatique'))    return 'CDN';
        if (t.includes('chorégraphique'))       return 'Centre chorégraphique';
        if (t.includes('cirque'))               return 'Cirque';
        if (t.includes('opéra'))                return 'Opéra';
        if (t.includes('zénith'))               return 'Salle de concerts';
        if (t.includes('art et essai'))         return 'Cinéma';
        if (t.includes('cinéma'))               return 'Cinéma';
        if (t.includes('musée'))                return 'Musée';
        if (t.includes('monument'))             return 'Monument';
        if (t.includes('bibliothèque'))         return 'Bibliothèque';
        if (t.includes('médiathèque'))          return 'Bibliothèque';
        if (t.includes('archives'))             return 'Archives';
        if (t.includes('conservatoire'))        return 'Conservatoire';
        if (t.includes('théâtre'))              return 'Théâtre';
        if (t.includes('festival'))             return 'Festival';
        if (t.includes('scène'))                return 'Salle de spectacle';
        if (t.includes('musique'))              return 'Salle de concerts';
        return '';
    },

    async importGouvSelected() {
        if (!this.gouvImport.selected.length) return;
        let imported = 0, merged = 0;
        const mergeReport = [];   // fusions automatiques (avec conflits éventuels)
        const toReview    = [];   // doublons probables : décision de l'utilisateur

        this.gouvImport.selected.forEach(lieu => {
            const incoming = this._gouvToStruct(lieu);
            const m = matchStructure(incoming, this.db.structures);

            // ── Doublon certain : on enrichit la fiche existante ──
            if (m.status === 'auto' && m.target) {
                const catTag = this.gouvTypeToTag(lieu.type);
                if (catTag) {
                    incoming.tags = { categories: [catTag], genres: [], reseaux: [], keywords: [] };
                }
                const { filled, conflicts } = mergeInto(m.target, incoming);
                if (filled.length || conflicts.length) {
                    m.target.comments = Array.isArray(m.target.comments) ? m.target.comments : [];
                    m.target.comments.push(buildMergeComment({
                        source: 'data.gouv.fr (Basilic)', filled, conflicts, user: this.currentUserName,
                    }));
                    m.target.updatedAt = new Date().toISOString();
                    m.target.updatedBy = this.currentUserName;
                }
                merged++;
                mergeReport.push({ name: m.target.name, reason: m.reasons[0] || '', filled, conflicts });
                return;
            }

            // ── Doublon probable : mis de côté, importé mais signalé ──
            if (m.status === 'suggest' && m.target) {
                toReview.push({ incomingName: lieu.nom, existingName: m.target.name, reason: m.reasons[0] || '' });
            }

            const catTag = this.gouvTypeToTag(lieu.type);
            const now = new Date().toISOString();
            const newStruct = {
                id:             Date.now().toString() + Math.random().toString(36).slice(2),
                name:           lieu.nom,
                isClient:       false,
                isActive:       true,
                clientCode:     '',
                source:         'data.gouv.fr (Basilic)',
                createdDate:    now,
                address:        lieu.adresse,
                suite:          '',
                zip:            lieu.cp,
                city:           lieu.ville,
                country:        'France',
                phone1:         lieu.telephone,
                phone2:         '',
                mobile:         '',
                fax:            '',
                email:          '',
                website:        lieu.site,
                siret:          lieu.siret   || '',
                licence:        lieu.licence || '',
                govId:          lieu.govId   || '',
                aliases:        [],
                capacity:       lieu.capacity || '',
                season:         '',
                hours:          '',
                progMonthStart: '',
                progMonthEnd:   '',
                lat:            lieu.lat,
                lng:            lieu.lng,
                tags: {
                    categories: catTag ? [catTag] : [],
                    genres:     [],
                    reseaux:    [],
                    keywords:   []
                },
                contacts:  [],
                comments:  [],
                venues:    [],
                createdAt:  now, createdBy:  this.currentUserName,
                updatedAt:  now, updatedBy:  this.currentUserName,
                importedAt: now, importedBy: this.currentUserName,
            };
            this.db.structures.push(newStruct);
            imported++;
        });

        await this.saveDB();
        this.gouvImport.selected = [];
        this.showGouvImport = false;

        // ── Bilan détaillé ──
        const esc = v => String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const conflicts = mergeReport.filter(r => r.conflicts.length);
        let html = `<div class="text-left text-sm space-y-2">`;
        html += `<p><b>${imported}</b> structure(s) créée(s)</p>`;
        if (merged) {
            html += `<p class="text-emerald-600"><b>${merged}</b> rattachée(s) à une fiche existante (données complétées)</p>`;
        }
        if (toReview.length) {
            html += `<div class="text-orange-600">
                        <p><b>${toReview.length}</b> doublon(s) possible(s) — créées, à vérifier :</p>
                        <ul class="text-xs mt-1 ml-4 list-disc">`
                 + toReview.slice(0, 8).map(r =>
                        `<li>« ${esc(r.incomingName)} » ≈ « ${esc(r.existingName)} »<br><span class="text-slate-400">${esc(r.reason)}</span></li>`
                   ).join('')
                 + (toReview.length > 8 ? `<li>… et ${toReview.length - 8} autre(s)</li>` : '')
                 + `</ul></div>`;
        }
        if (conflicts.length) {
            html += `<div class="text-slate-500 border-t pt-2 mt-2">
                        <p class="text-xs"><b>${conflicts.length}</b> fiche(s) avec données divergentes — valeur existante conservée, détail dans les commentaires de la fiche :</p>
                        <ul class="text-xs mt-1 ml-4 list-disc">`
                 + conflicts.slice(0, 5).map(r =>
                        `<li>${esc(r.name)} — ${r.conflicts.map(c => esc(c.label)).join(', ')}</li>`
                   ).join('')
                 + (conflicts.length > 5 ? `<li>… et ${conflicts.length - 5} autre(s)</li>` : '')
                 + `</ul></div>`;
        }
        html += `</div>`;

        Swal.fire({
            title: 'Import terminé ✓',
            html,
            icon:  'success',
            width: 560,
            confirmButtonColor: '#059669'
        });
    },
};
