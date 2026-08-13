// js/modules/gouvMethods.js — Import Culture.gouv.fr et Import CSV libre
// Section : entre // --- IMPORT CULTURE.GOUV.FR --- et // --- EXPORT AVEC MAPPING ---

import { matchStructure, mergeInto, buildMergeComment, structAliasKeys } from './structMatch.js?v=39';

// ── Base Adresse Nationale : API officielle de l'État, gratuite et sans clé ──
// Utilisée pour retrouver la commune d'une structure à partir de son nom.
const BAN_URL = 'https://api-adresse.data.gouv.fr/search/';

// Seuil de confiance mesuré sur l'annuaire réel : les bonnes réponses se
// situaient toutes au-dessus de 0,85 (Yssingeaux 0,94, Langeac 0,94…), les
// fausses nettement en dessous (« Jazz en Velay » → Arsac-en-Velay 0,41,
// « La Barque » → Barquet dans l'Eure 0,48). 0,80 sépare proprement les deux.
const BAN_MIN_SCORE = 0.80;

// Isole un nom de commune en retirant les mots qui désignent le TYPE de
// structure. « Mairie d'Yssingeaux » → « Yssingeaux », « MPT de Brives
// Charensac » → « Brives Charensac ». Sans ce nettoyage, l'API cherche
// l'expression entière et se trompe ou ne trouve rien.
function _communeFromName(nom) {
    let q = String(nom || '').trim();
    q = q.replace(/^(mairie|ville|commune|municipalit[ée])\s+(de\s+|du\s+|d')?/i, '');
    q = q.replace(/^(mjc|mpt|ece|cdmdt\d*|ehpad)\s+(de\s+|du\s+|d')?/i, '');
    q = q.replace(/^(centre culturel|espace culturel|salle|auditorium|th[ée][âa]tre|m[ée]diath[èe]que|biblioth[èe]que|cin[ée]ma|conservatoire)\s+(de\s+|du\s+|des\s+|d'|le\s+|la\s+)?/i, '');
    q = q.replace(/^(communaut[ée] de communes|communaut[ée] d'agglom[ée]ration|cc|ca)\s+(de\s+|du\s+|des\s+|d')?/i, '');
    return q.trim();
}

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

    // Import d'un fichier CSV ou Excel.
    //
    // Branché sur structMatch.js, comme l'import Culture.gouv. Le contrôle
    // précédent était une égalité stricte nom + ville aux minuscules près :
    // « MAIRIE DU PUY EN VELAY » et « Mairie du Puy-en-Velay » passaient pour
    // deux structures différentes, et un doublon détecté était simplement
    // ignoré — les données nouvelles du fichier (téléphone, email, site) étaient
    // perdues au lieu d'enrichir la fiche existante.
    //
    // Trois issues possibles par ligne, identiques à l'import gouv :
    //   auto    → doublon certain  : la fiche existante est complétée
    //   suggest → doublon probable : créée, mais signalée dans le bilan
    //   new     → vraiment nouvelle
    async importCsvStructures() {
        const m = this.csvImport.mapping;
        if (!m.name) return Swal.fire('Champ requis', 'Associez au minimum la colonne "Nom" pour importer.', 'warning');

        let imported = 0, merged = 0;
        const mergeReport = [];   // fusions réalisées (avec conflits éventuels)
        const toReview    = [];   // doublons probables : décision de l'utilisateur
        const sourceLabel = this.csvImport.fileName || 'Import CSV/Excel';

        this.csvImport.rows.forEach(row => {
            // Valeur d'une colonne mappée, toujours en chaîne nettoyée
            const val  = key => m[key] ? String(row[m[key]] || '').trim() : '';
            const name = val('name');
            if (!name) return;

            const catRaw   = val('category');
            const catTag   = catRaw ? (this.gouvTypeToTag(catRaw) || catRaw) : '';
            const genreTag = val('genre');
            const now      = new Date().toISOString();

            const incoming = {
                id:           Date.now().toString() + Math.random().toString(36).slice(2),
                name,
                isClient:     false, isActive: true,
                clientCode:   '',
                source:       val('source') || sourceLabel,
                createdDate:  now,
                address:      val('address'),
                suite:        '',
                zip:          val('zip'),
                city:         val('city'),
                country:      val('country') || 'France',
                phone1:       val('phone'),
                phone2: '', mobile: '', fax: '',
                email:        val('email'),
                website:      val('website'),
                aliases:      [],
                capacity:     val('capacity'),
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
            };

            const mt = matchStructure(incoming, this.db.structures);

            // ── Doublon certain : on enrichit la fiche existante ──
            // mergeInto ne recopie qu'une liste blanche de champs (adresse,
            // téléphones, email, site…) : id, nom et dates de la fiche existante
            // ne sont jamais écrasés.
            if (mt.status === 'auto' && mt.target) {
                const { filled, conflicts, aliasAdded } = mergeInto(mt.target, incoming);
                if (filled.length || conflicts.length) {
                    mt.target.comments = Array.isArray(mt.target.comments) ? mt.target.comments : [];
                    mt.target.comments.push(buildMergeComment({
                        source: sourceLabel, filled, conflicts, user: this.currentUserName,
                    }));
                    mt.target.updatedAt = now;
                    mt.target.updatedBy = this.currentUserName;
                }
                merged++;
                mergeReport.push({ name: mt.target.name, reason: mt.reasons[0] || '', filled, conflicts, aliasAdded });
                return;
            }

            // ── Doublon probable : créée quand même, mais signalée ──
            if (mt.status === 'suggest' && mt.target) {
                toReview.push({ incomingName: name, existingName: mt.target.name, reason: mt.reasons[0] || '' });
            }

            this.db.structures.push(incoming);
            imported++;
        });

        await this.saveDB();
        this.csvImport.headers = [];
        this.csvImport.rows    = [];
        this.csvImport.mapping = {};
        this.showGouvImport    = false;

        // ── Bilan détaillé (même présentation que l'import gouv) ──
        const esc = v => String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
        const aliases = mergeReport.filter(r => r.aliasAdded);
        if (aliases.length) {
            html += `<div class="text-indigo-600 border-t pt-2 mt-2">
                        <p class="text-xs"><i class="fas fa-tags mr-1"></i><b>${aliases.length}</b> nouvelle(s) variante(s) de nom mémorisée(s) — les prochains imports les reconnaîtront automatiquement :</p>
                        <ul class="text-xs mt-1 ml-4 list-disc">`
                 + aliases.slice(0, 6).map(r =>
                        `<li>« ${esc(r.aliasAdded)} » → ${esc(r.name)}</li>`
                   ).join('')
                 + (aliases.length > 6 ? `<li>… et ${aliases.length - 6} autre(s)</li>` : '')
                 + `</ul></div>`;
        }
        const conflicts = mergeReport.filter(r => r.conflicts.length);
        if (conflicts.length) {
            html += `<div class="text-slate-500 border-t pt-2 mt-2">
                        <p class="text-xs"><b>${conflicts.length}</b> fiche(s) avec des valeurs divergentes — l'existant a été conservé, le détail figure dans les commentaires de chaque fiche.</p>
                     </div>`;
        }
        html += `</div>`;

        Swal.fire({
            title: 'Import terminé ✓',
            html,
            icon:  'success', confirmButtonColor: '#059669', width: 560,
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
                const { filled, conflicts, aliasAdded } = mergeInto(m.target, incoming);
                if (filled.length || conflicts.length) {
                    m.target.comments = Array.isArray(m.target.comments) ? m.target.comments : [];
                    m.target.comments.push(buildMergeComment({
                        source: 'data.gouv.fr (Basilic)', filled, conflicts, user: this.currentUserName,
                    }));
                    m.target.updatedAt = new Date().toISOString();
                    m.target.updatedBy = this.currentUserName;
                }
                merged++;
                mergeReport.push({ name: m.target.name, reason: m.reasons[0] || '', filled, conflicts, aliasAdded });
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
        const aliases = mergeReport.filter(r => r.aliasAdded);
        if (aliases.length) {
            html += `<div class="text-indigo-600 border-t pt-2 mt-2">
                        <p class="text-xs"><i class="fas fa-tags mr-1"></i><b>${aliases.length}</b> nouvelle(s) variante(s) de nom mémorisée(s) — les prochains imports les reconnaîtront automatiquement :</p>
                        <ul class="text-xs mt-1 ml-4 list-disc">`
                 + aliases.slice(0, 6).map(r =>
                        `<li>« ${esc(r.aliasAdded)} » → ${esc(r.name)}</li>`
                   ).join('')
                 + (aliases.length > 6 ? `<li>… et ${aliases.length - 6} autre(s)</li>` : '')
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

    // ═══════════════════════════════════════════════════════════════════════
    // COMPLÉTER LES VILLES MANQUANTES
    //
    // Une structure sans ville est invisible pour le moteur de doublons : il
    // exige une localité commune avant de rapprocher deux noms identiques.
    // C'est ainsi que des fiches en double se créent au lieu de fusionner.
    //
    // Deux sources, par ordre de fiabilité :
    //   1. une fiche HOMONYME de l'annuaire qui possède déjà une ville
    //      → certitude, aucun appel réseau ;
    //   2. la Base Adresse Nationale, interrogée avec le nom nettoyé de son
    //      type de structure, et seulement au-dessus de BAN_MIN_SCORE.
    //
    // Rien n'est écrit sans validation, et jamais par-dessus une valeur
    // existante : seuls les champs vides sont remplis.
    // ═══════════════════════════════════════════════════════════════════════
    async fillMissingCities() {
        const sansVille = this.db.structures.filter(s => !(s.city || '').trim());
        if (!sansVille.length) {
            return Swal.fire({
                title: 'Rien à compléter ✓',
                text:  'Toutes vos structures ont déjà une ville.',
                icon:  'success', confirmButtonColor: '#4f46e5',
            });
        }

        // ── Source 1 : les homonymes déjà renseignés ──
        // Indexé sur le nom ET les alias mémorisés : « Département de la
        // Haute-Loire » est un alias de « Médiathèque Départementale », dont la
        // ville est connue. Ne regarder que les noms laisserait passer ce cas.
        const villeParNom = new Map();
        this.db.structures.forEach(s => {
            const v = (s.city || '').trim();
            if (!v) return;
            structAliasKeys(s).forEach(k => {
                if (k && !villeParNom.has(k)) villeParNom.set(k, { city: v, zip: (s.zip || '').trim() });
            });
        });

        const propositions = [];
        const aChercher    = [];
        sansVille.forEach(s => {
            let jumelle = null;
            structAliasKeys(s).forEach(k => { if (!jumelle) jumelle = villeParNom.get(k) || null; });
            if (jumelle) {
                propositions.push({ struct: s, city: jumelle.city, zip: jumelle.zip,
                                    origine: 'fiche homonyme de votre annuaire', sur: true });
            } else {
                aChercher.push(s);
            }
        });

        // ── Source 2 : Base Adresse Nationale ──
        if (aChercher.length) {
            Swal.fire({
                title: 'Recherche des communes…',
                html:  `<span id="ban-progress" class="text-sm text-slate-500">0 / ${aChercher.length}</span>`,
                allowOutsideClick: false, didOpen: () => Swal.showLoading(),
            });

            for (let i = 0; i < aChercher.length; i++) {
                const s = aChercher[i];
                const q = _communeFromName(s.name);
                const el = document.getElementById('ban-progress');
                if (el) el.textContent = `${i + 1} / ${aChercher.length}`;
                if (!q) continue;
                try {
                    const url = `${BAN_URL}?q=${encodeURIComponent(q)}&type=municipality&limit=1`;
                    const res = await fetch(url);
                    if (!res.ok) continue;
                    const data = await res.json();
                    const f = (data.features || [])[0];
                    if (!f) continue;
                    const p = f.properties || {};
                    if ((p.score || 0) < BAN_MIN_SCORE) continue;   // trop incertain
                    propositions.push({
                        struct: s, city: p.city || '', zip: p.postcode || '',
                        origine: `Base Adresse Nationale — confiance ${Math.round((p.score || 0) * 100)} %`,
                        sur: false,
                    });
                } catch (e) { /* réseau indisponible : on passe */ }
                // Courtoisie envers une API publique
                await new Promise(r => setTimeout(r, 120));
            }
        }

        if (!propositions.length) {
            return Swal.fire({
                title: 'Aucune commune trouvée',
                html:  `Aucune des <b>${sansVille.length}</b> fiche(s) sans ville n'a pu être identifiée
                        de façon fiable. Leur nom ne contient probablement pas de nom de commune.`,
                icon:  'info', confirmButtonColor: '#4f46e5',
            });
        }

        // ── Écran de validation : rien n'est écrit sans coche ──
        const esc = v => String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const lignes = propositions.map((p, i) => `
            <label class="flex items-start gap-2 border border-slate-200 rounded-xl p-2 text-left cursor-pointer hover:bg-slate-50">
                <input type="checkbox" class="ville-chk mt-1" data-i="${i}" ${p.sur ? 'checked' : ''}>
                <span class="text-xs leading-snug">
                    <b>${esc(p.struct.name)}</b><br>
                    <span class="text-emerald-700">${esc(p.city)}${p.zip ? ' · ' + esc(p.zip) : ''}</span>
                    <span class="${p.sur ? 'text-indigo-500' : 'text-slate-400'}"> — ${esc(p.origine)}</span>
                </span>
            </label>`).join('');

        const r = await Swal.fire({
            title: 'Villes proposées',
            html: `
                <p class="text-xs text-slate-500 text-left mb-3">
                    ${propositions.length} proposition(s) sur ${sansVille.length} fiche(s) sans ville.
                    Les propositions issues de votre propre annuaire sont pré-cochées ;
                    vérifiez les autres avant de valider.
                </p>
                <div class="flex gap-2 mb-3">
                    <button type="button" id="ville-all" class="text-[11px] font-bold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100">Tout cocher</button>
                    <button type="button" id="ville-none" class="text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">Tout décocher</button>
                </div>
                <div class="space-y-2 max-h-[45vh] overflow-y-auto pr-1">${lignes}</div>`,
            width: 620,
            showCancelButton:  true,
            confirmButtonText: 'Appliquer',
            cancelButtonText:  'Annuler',
            confirmButtonColor: '#4f46e5',
            didOpen: () => {
                const setAll = v => document.querySelectorAll('.ville-chk').forEach(c => { c.checked = v; });
                document.getElementById('ville-all')?.addEventListener('click',  () => setAll(true));
                document.getElementById('ville-none')?.addEventListener('click', () => setAll(false));
            },
            preConfirm: () => [...document.querySelectorAll('.ville-chk:checked')]
                                .map(c => Number(c.dataset.i)),
        });
        if (!r.isConfirmed || !r.value || !r.value.length) return;

        // ── Application : uniquement les champs VIDES ──
        const now = new Date().toISOString();
        let villes = 0, cps = 0;
        r.value.forEach(i => {
            const p = propositions[i];
            const s = p.struct;
            if (!(s.city || '').trim() && p.city) { s.city = p.city; villes++; }
            if (!(s.zip  || '').trim() && p.zip)  { s.zip  = p.zip;  cps++; }
            s.comments = Array.isArray(s.comments) ? s.comments : [];
            s.comments.push({
                id: Date.now() + Math.random(),
                date: now,
                author: this.currentUserName,
                text: `[Ville complétée] ${p.city}${p.zip ? ' (' + p.zip + ')' : ''} — source : ${p.origine}`,
            });
            s.updatedAt = now;
            s.updatedBy = this.currentUserName;
        });

        await this.saveDB();

        Swal.fire({
            title: 'Villes complétées ✓',
            html:  `<b>${villes}</b> ville(s) et <b>${cps}</b> code(s) postal renseignés.<br>
                    <span class="text-xs text-slate-500">Chaque fiche porte un commentaire indiquant la source.</span>`,
            icon:  'success', confirmButtonColor: '#4f46e5',
        });
    },
};
