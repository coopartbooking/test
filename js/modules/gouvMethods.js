// js/modules/gouvMethods.js — Import Culture.gouv.fr et Import CSV libre
// Section : entre // --- IMPORT CULTURE.GOUV.FR --- et // --- EXPORT AVEC MAPPING ---

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
            this.db.structures.push({
                id:           Date.now().toString() + Math.random().toString(36).slice(2),
                name,
                isClient:     false, isActive: true,
                clientCode:   '',
                source:       m.source && row[m.source] ? String(row[m.source]).trim() : (this.csvImport.fileName || 'Import CSV'),
                createdDate:  new Date().toISOString(),
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
                contacts: [], comments: [], venues: []
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

            if (this.gouvImport.searchName.trim()) {
                const name = this.gouvImport.searchName.trim().replace(/"/g, '');
                where.push(`suggest(nom,"${name}")`);
            }
            if (this.gouvImport.filterType) {
                const type = this.gouvImport.filterType.replace(/"/g, '');
                where.push(`label_et_appellation like "%${type}%"`);
            }
            if (this.gouvImport.filterDept) {
                const dept = this.gouvImport.filterDept.trim().replace(/\D/g, '');
                if (dept) where.push(`departement like "%${dept}%"`);
            }
            if (this.gouvImport.filterRegion) {
                const reg = this.gouvImport.filterRegion.replace(/"/g, '').replace(/'/g, '');
                where.push(`region like "%${reg}%"`);
            }
            // Filtre spectacle vivant par défaut
            if (!this.gouvImport.filterType && !this.gouvImport.searchName.trim()) {
                where.push(`(domaine_culturel like "%spectacle%" OR label_et_appellation like "%scene%" OR label_et_appellation like "%theatre%" OR label_et_appellation like "%festival%" OR label_et_appellation like "%musique%" OR label_et_appellation like "%cirque%")`);
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
                const ville   = r.commune || r.ville || r.nom_commune || r.libelle_commune || '';
                const type    = r.label_et_appellation || r.label || r.type || r.categorie || r.appellation || '';
                const domaine = r.domaine_culturel || r.domaine || r.secteur || '';
                const site    = r.site_internet || r.url || r.site_web || r.website || '';
                const tel     = r.telephone || r.tel || r.phone || '';
                const dept    = r.code_departement || r.departement || r.dept || '';
                const region  = r.region_administrative || r.region || '';
                // GPS : plusieurs formats possibles
                let lat = null, lng = null;
                if (r.coordonnees_geographiques) {
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
                return {
                    id:        `gouv_${offset}_${i}_${nom.replace(/\s/g,'').substring(0,20)}`,
                    nom, adresse, cp, ville, type, domaine, site,
                    telephone: tel, dept, region,
                    lat, lng,
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

    gouvAlreadyExists(lieu) {
        return this.db.structures.some(s =>
            s.name.toLowerCase() === (lieu.nom || '').toLowerCase() &&
            (s.city || '').toLowerCase() === (lieu.ville || '').toLowerCase()
        );
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
        let imported = 0, skipped = 0;

        this.gouvImport.selected.forEach(lieu => {
            if (this.gouvAlreadyExists(lieu)) { skipped++; return; }
            const catTag = this.gouvTypeToTag(lieu.type);
            const newStruct = {
                id:             Date.now().toString() + Math.random().toString(36).slice(2),
                name:           lieu.nom,
                isClient:       false,
                isActive:       true,
                clientCode:     '',
                source:         'data.culture.gouv.fr',
                createdDate:    new Date().toISOString(),
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
                venues:    []
            };
            this.db.structures.push(newStruct);
            imported++;
        });

        await this.saveDB();
        this.gouvImport.selected = [];
        this.showGouvImport = false;

        Swal.fire({
            title: `Import terminé ✓`,
            html:  `<b>${imported}</b> structure(s) importée(s)${skipped > 0 ? `<br><span class="text-orange-500">${skipped} déjà existante(s) — ignorée(s)</span>` : ''}`,
            icon:  'success',
            confirmButtonColor: '#059669'
        });
    },
};
