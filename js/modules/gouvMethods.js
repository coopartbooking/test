// js/modules/gouvMethods.js — Import Culture.gouv.fr et Import CSV libre
// Section : entre // --- IMPORT CULTURE.GOUV.FR --- et // --- EXPORT AVEC MAPPING ---

import { matchStructure, mergeInto, buildMergeComment } from './structMatch.js?v=13';

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

    async searchGouv(resetPage = true) {
        if (resetPage === true) this.gouvImport.page = 0;
        this.gouvImport.loading = true;
        this.gouvImport.error   = '';
        this.gouvImport.results = [];

        try {
            const limit  = 50;
            const offset = this.gouvImport.page * limit;
            const where  = [];

            // NB : l'API parle ODSQL (Opendatasoft), pas SQL.
            // - le joker est "*" en suffixe (recherche greedy), pas "%"
            // - "like" fait une correspondance plein-texte par mot (insensible casse/accents)
            // - les noms de champs doivent exister, sinon erreur 400
            if (this.gouvImport.searchName.trim()) {
                const name = this.gouvImport.searchName.trim().replace(/"/g, '');
                // Recherche greedy par mot sur le champ "nom"
                name.split(/\s+/).filter(Boolean).forEach(w => {
                    where.push(`nom like "${w}*"`);
                });
            }
            if (this.gouvImport.filterType) {
                const type = this.gouvImport.filterType.replace(/"/g, '');
                where.push(`label_et_appellation like "${type}"`);
            }
            if (this.gouvImport.filterDept) {
                const raw = this.gouvImport.filterDept.trim().replace(/"/g, '');
                const num = raw.replace(/\D/g, '');
                // Numéro de département dans n_departement ("01"), nom dans departement ("Ain")
                if (num) where.push(`n_departement like "${num}"`);
                else     where.push(`departement like "${raw}"`);
            }
            if (this.gouvImport.filterRegion) {
                const reg = this.gouvImport.filterRegion.replace(/"/g, '').replace(/'/g, '');
                where.push(`region like "${reg}"`);
            }
            // Filtre spectacle vivant par défaut (noms de champs réels : domaine, label_et_appellation)
            if (!this.gouvImport.filterType && !this.gouvImport.searchName.trim()) {
                where.push(`(domaine like "spectacle" OR domaine like "musique" OR label_et_appellation like "scene" OR label_et_appellation like "theatre" OR label_et_appellation like "festival" OR label_et_appellation like "cirque")`);
            }

            const params = new URLSearchParams({ limit, offset });
            if (where.length) params.append('where', where.join(' AND '));

            const url  = `https://data.culture.gouv.fr/api/explore/v2.1/catalog/datasets/base-des-lieux-et-des-equipements-culturels/records?${params.toString()}`;
            const resp = await fetch(url);
            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(`Erreur HTTP ${resp.status} — ${errText.substring(0, 200)}`);
            }
            const data = await resp.json();

            this.gouvImport.totalFound = data.total_count || 0;

            // Log du premier résultat pour voir les vrais noms de champs
            if (data.results && data.results.length > 0) {
            }

            this.gouvImport.results = (data.results || []).map((r, i) => {
                // Gestion flexible des noms de champs (la base peut utiliser différentes conventions)
                const nom     = r.nom_du_lieu || r.nom || r.libelle || r.denomination || r.nom_officiel || '';
                const adresse = r.adresse || r.adresse_postale || r.adresse_1 || '';
                const cp      = r.code_postal || r.cp || r.code_postale || '';
                const ville   = r.libelle_geographique || r.commune || r.ville || r.nom_commune || r.libelle_commune || '';
                const type    = r.label_et_appellation || r.type_equipement_ou_lieu || r.label || r.type || r.categorie || r.appellation || '';
                const domaine = r.domaine_culturel || r.domaine || r.secteur || '';
                const site    = r.site_internet || r.url || r.site_web || r.website || '';
                const tel     = r.telephone || r.tel || r.phone || '';
                const dept    = r.code_departement || r.departement || r.dept || '';
                const region  = r.region_administrative || r.region || '';
                // GPS : plusieurs formats possibles
                let lat = null, lng = null;
                if (r.coordonnees_geo) {
                    lat = r.coordonnees_geo.lat;
                    lng = r.coordonnees_geo.lon;
                } else if (r.coordonnees_geographiques) {
                    lat = r.coordonnees_geographiques.lat;
                    lng = r.coordonnees_geographiques.lon;
                } else if (r.geolocalisation) {
                    lat = r.geolocalisation.lat;
                    lng = r.geolocalisation.lon;
                } else if (r.geo_point_2d) {
                    lat = r.geo_point_2d.lat;
                    lng = r.geo_point_2d.lon;
                } else if (r.latitude && r.longitude) {
                    lat = parseFloat(r.latitude);
                    lng = parseFloat(r.longitude);
                }
                // Identifiant stable du jeu de données (si l'API le fournit).
                // Capture opportuniste : si absent, rien ne casse.
                const govId = r.recordid || r.record_id || r.identifiant
                    || r.id_lieu || r.identifiant_lieu || r.code_uai || '';
                // SIRET / licence si présents dans le jeu de données
                const siret   = r.siret || r.numero_siret || r.siret_etablissement || '';
                const licence = r.licence || r.numero_licence || r.licences || '';
                return {
                    id:        `gouv_${offset}_${i}_${nom.replace(/\s/g,'').substring(0,20)}`,
                    nom, adresse, cp, ville, type, domaine, site,
                    telephone: tel, dept, region,
                    lat, lng,
                    govId: String(govId || ''),
                    siret: String(siret || ''),
                    licence: String(licence || ''),
                    hasGps: !!(lat),
                };
            }).filter(r => r.nom); // Ignorer les lignes sans nom

        } catch (e) {
            console.error('Import Gouv.fr');
            this.gouvImport.error = e.message || 'Erreur de connexion à l\'API.';
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
            siret:   lieu.siret   || '',
            licence: lieu.licence || '',
            govId:   lieu.govId   || '',
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
        if (t.includes('scène nationale'))     return 'Scène Nationale';
        if (t.includes('smac'))                return 'SMAC';
        if (t.includes('centre dramatique'))   return 'CDN';
        if (t.includes('opéra'))               return 'Opéra';
        if (t.includes('théâtre'))             return 'Théâtre';
        if (t.includes('festival'))            return 'Festival';
        if (t.includes('cirque'))              return 'Cirque';
        if (t.includes('chorégraphique'))      return 'Centre chorégraphique';
        if (t.includes('scène conventionnée')) return 'Scène Conventionnée';
        if (t.includes('zénith'))              return 'Salle de concerts';
        if (t.includes('musique'))             return 'Salle de concerts';
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
                        source: 'data.culture.gouv.fr', filled, conflicts, user: this.currentUserName,
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
                source:         'data.culture.gouv.fr',
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
                capacity:       '',
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
