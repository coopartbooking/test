// utils.js — Méthodes utilitaires partagées

export const utilsMethods = {

    // --- CHARGEMENT DIFFÉRÉ DES LIBRAIRIES LOURDES ---
    // Chaque lib est chargée UNE SEULE FOIS, à la première utilisation.
    // Gain : ~1.5 MB non chargés au démarrage.

    async _loadScript(url, globalCheck) {
        // Si déjà chargé (global présent), ne rien faire
        if (window[globalCheck]) return;
        // Si déjà en cours de chargement, attendre
        if (window[`_loading_${globalCheck}`]) {
            return new Promise(resolve => {
                const interval = setInterval(() => {
                    if (window[globalCheck]) { clearInterval(interval); resolve(); }
                }, 50);
            });
        }
        window[`_loading_${globalCheck}`] = true;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload  = () => { window[`_loading_${globalCheck}`] = false; resolve(); };
            script.onerror = () => reject(new Error(`Impossible de charger : ${url}`));
            document.head.appendChild(script);
        });
    },

    async _loadStyle(url, id) {
        if (document.getElementById(id)) return; // déjà chargé
        return new Promise((resolve, reject) => {
            const link  = document.createElement('link');
            link.rel    = 'stylesheet';
            link.href   = url;
            link.id     = id;
            link.onload  = resolve;
            link.onerror = () => reject(new Error(`Impossible de charger : ${url}`));
            document.head.appendChild(link);
        });
    },

    // Charge SheetJS (XLSX) — utilisé pour import/export Excel
    async requireXLSX() {
        await this._loadScript(
            'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
            'XLSX'
        );
    },

    // Charge jsPDF — utilisé pour générer contrats et roadbooks
    async requireJsPDF() {
        await this._loadScript(
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
            'jspdf'
        );
    },

    // Charge Leaflet (carte + CSS) — utilisé sur l'onglet Carte & CRM mini-map
    async requireLeaflet() {
        await Promise.all([
            this._loadStyle(
                'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
                'leaflet-css'
            ),
            this._loadScript(
                'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
                'L'
            ),
        ]);
    },

    // --- SÉCURITÉ : SANITISATION DES ENTRÉES TEXTE ---

    // Supprime les balises HTML et les caractères dangereux
    // Empêche l'injection de code dans la base de données
    sanitizeText(str, maxLength = 2000) {
        if (!str || typeof str !== 'string') return '';
        return str
            .replace(/<[^>]*>/g, '')          // Supprime les balises HTML (<script>, <img>...)
            .replace(/javascript:/gi, '')      // Supprime les pseudo-URLs javascript:
            .replace(/on\w+\s*=/gi, '')        // Supprime les handlers inline (onclick=, onerror=...)
            .trim()
            .substring(0, maxLength);          // Limite la longueur
    },

    // Version pour les emails : normalise + valide le format
    sanitizeEmail(str) {
        if (!str || typeof str !== 'string') return '';
        const clean = str.trim().toLowerCase().substring(0, 254);
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean : '';
    },

    // Version pour les URLs : vérifie que le protocole est http/https
    sanitizeUrl(str) {
        if (!str || typeof str !== 'string') return '';
        const clean = str.trim().substring(0, 500);
        if (!clean) return '';
        try {
            const url = new URL(clean.startsWith('http') ? clean : 'https://' + clean);
            return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
        } catch {
            return '';
        }
    },

    formatDate(d) {
        if (!d) return '';
        return new Date(d).toLocaleDateString('fr-FR');
    },

    formatMoney(val) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency', currency: 'EUR', maximumFractionDigits: 0
        }).format(val || 0);
    },

    getProTimestamp() {
        return new Intl.DateTimeFormat('fr-FR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(new Date());
    },

    getProjectName(id) {
        const p = this.db.projects.find(x => x.id === id);
        return p ? p.name : '?';
    },

    getProjectColor(id) {
        const p = this.db.projects.find(x => x.id === id);
        return p ? p.color : '#94a3b8';
    },

    getProjectIcon(id) {
        const p = this.db.projects.find(x => x.id === id);
        return p ? (p.icon || 'fas fa-music') : 'fas fa-music';
    },

    getTagClass(tag) {
        return tag === 'VIP' ? 'tag-vip' : 'tag-presse';
    },

    // Formule Haversine — conservé sous les deux noms utilisés dans le code
    getDist(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180))
            * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    getDistance(lat1, lon1, lat2, lon2) {
        return this.getDist(lat1, lon1, lat2, lon2);
    },

    // Helper export Excel — requis par tous les modules d'export
    xlsxDownload(workbook, filename) {
        XLSX.writeFile(workbook, filename);
    },

    // ── Variables disponibles dans les contrats ──
    _contractVars(e) {
        const proj    = (this.db.projects || []).find(p => p.id === e.projectId) || {};
        const dateStr = e.date ? this.formatDate(e.date) : 'Date à définir';
        return {
            '{{artiste}}':        proj.name                              || '',
            '{{lieu}}':           e.venueName                            || '',
            '{{ville}}':          e.city                                 || '',
            '{{date}}':           dateStr,
            '{{heure}}':          e.time                                 || '--:--',
            '{{cachet}}':         this.formatMoney(e.fee || proj.defaultFee || 0),
            '{{cachetType}}':     proj.feeType                           || 'HT',
            '{{typeContrat}}':    e.contractType                         || 'Cession',
            '{{producteur}}':     this.currentUserName || this.currentUser || '',
            '{{teamSize}}':       String(proj.teamSize                   || 1),
            '{{duree}}':          proj.duration                          || '',
            '{{fraisRoute}}':     proj.fraisRoute                        || '',
            '{{dateAujourdhui}}': new Date().toLocaleDateString('fr-FR'),
            '{{notes}}':          e.notes                                || '',
            '{{contactNom}}':     e.contactName                          || '',
            '{{contactEmail}}':   e.contactEmail                         || '',
        };
    },

    // ── Remplace les variables dans un texte ──
    _parseContractVars(text, e) {
        const vars = this._contractVars(e);
        let result = text;
        Object.entries(vars).forEach(([k, v]) => {
            result = result.replaceAll(k, v);
        });
        return result;
    },

    // ── Ouvre le sélecteur de modèle de contrat ──
    async openContractSelector(e) {
        if (!e || !e.id) return;
        const templates = this.db.contractTemplates || [];

        if (!templates.length) {
            // Aucun modèle — générer le contrat par défaut
            const r = await Swal.fire({
                title: 'Aucun modèle de contrat',
                html: `Vous n'avez pas encore créé de modèle personnalisé.<br>
                       Voulez-vous utiliser le contrat par défaut ou créer un modèle ?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Contrat par défaut',
                cancelButtonText: 'Créer un modèle',
                confirmButtonColor: '#4f46e5',
            });
            if (r.isConfirmed) return this._generateDefaultContract(e);
            this.showContractEditor = true;
            this.editingContractTpl = null;
            return;
        }

        // Choisir parmi les modèles
        const options = templates.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
        const r = await Swal.fire({
            title: 'Choisir un modèle de contrat',
            html: `<select id="swal-contract-tpl" class="swal2-input">
                       <option value="">-- Choisir un modèle --</option>
                       ${options}
                   </select>`,
            showCancelButton: true,
            confirmButtonText: 'Générer le PDF',
            cancelButtonText: 'Annuler',
            confirmButtonColor: '#4f46e5',
            preConfirm: () => {
                const val = document.getElementById('swal-contract-tpl').value;
                if (val === '') return Swal.showValidationMessage('Choisissez un modèle');
                return Number(val);
            }
        });
        if (!r.isConfirmed) return;
        this.generateContractFromTemplate(e, templates[r.value]);
    },

    // ── Génère un PDF depuis un modèle personnalisé ──
    async generateContractFromTemplate(e, template) {
        await this.requireJsPDF();
        const { jsPDF } = window.jspdf;
        const doc      = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const proj     = (this.db.projects || []).find(p => p.id === e.projectId) || {};
        const pageW    = 210;
        const margin   = 20;
        const colW     = pageW - margin * 2;
        let   y        = margin;

        // ── En-tête couleur ──
        const color = template.color || [79, 70, 229];
        doc.setFillColor(...color);
        doc.rect(0, 0, pageW, 35, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(255, 255, 255);
        doc.text(template.title || 'CONTRAT', pageW / 2, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(proj.name || '', pageW / 2, 24, { align: 'center' });
        const vars    = this._contractVars(e);
        const dateStr = vars['{{date}}'];
        doc.text(`${vars['{{lieu}}'] || ''} — ${dateStr}`, pageW / 2, 30, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        y = 50;

        // ── Corps du contrat ──
        const body = this._parseContractVars(template.body || '', e);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');

        const paragraphs = body.split('\n');
        paragraphs.forEach(para => {
            if (y > 260) { doc.addPage(); y = margin; }
            // Titre de section (ligne en majuscules ou commençant par #)
            if (para.startsWith('#') || para === para.toUpperCase() && para.trim().length > 3) {
                if (y > 20) y += 4;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.text(para.replace(/^#+\s*/, '').trim(), margin, y);
                y += 6;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
            } else if (para.trim() === '') {
                y += 4;
            } else {
                doc.setFontSize(10);
                const lines = doc.splitTextToSize(para, colW);
                doc.text(lines, margin, y);
                y += lines.length * 5 + 1;
            }
        });

        // ── Signatures ──
        if (y > 240) { doc.addPage(); y = 20; }
        y += 15;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`Fait à ___________________, le ${vars['{{dateAujourdhui}}']}`, margin, y);
        y += 15;
        doc.text("Signature de l'organisateur", margin, y);
        doc.text('Signature de la production', margin + 100, y);
        y += 20;
        doc.line(margin, y, margin + 70, y);
        doc.line(margin + 100, y, margin + 170, y);

        // ── Pied de page ──
        const pages = doc.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text(
                `Coop'Art Booking — ${proj.name || ''} — Page ${i}/${pages}`,
                pageW / 2, 288, { align: 'center' }
            );
        }

        doc.save(`Contrat_${(proj.name || 'artiste').replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr.replace(/\//g, '-')}.pdf`);
        Swal.fire({ title: 'Contrat généré ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
    },

    // ── Contrat par défaut (fallback) ──
    async _generateDefaultContract(e) {
        await this.requireJsPDF();
        const { jsPDF } = window.jspdf;
        const doc  = new jsPDF();
        const proj = (this.db.projects || []).find(p => p.id === e.projectId) || {};
        const fee  = e.fee || proj.defaultFee || 0;
        const vars = this._contractVars(e);
        const defaultBody = `ENTRE LES SOUSSIGNÉS :

La production : {{producteur}} d'une part,
ET l'organisateur : {{lieu}} à {{ville}} d'autre part.

# ARTICLE 1 : OBJET
L'organisateur engage la production pour la représentation du spectacle "{{artiste}}"
Date : {{date}} à {{heure}}

# ARTICLE 2 : CONDITIONS FINANCIÈRES
L'organisateur s'engage à verser à la production un cachet de :
{{cachet}} {{cachetType}}

# ARTICLE 3 : CONDITIONS TECHNIQUES
La fiche technique sera transmise à la signature du présent contrat.
Durée du spectacle : {{duree}}
Équipe : {{teamSize}} personne(s)`;

        const template = { title: 'CONTRAT DE CESSION', body: defaultBody, color: [79, 70, 229] };
        this.generateContractFromTemplate(e, template);
    },

    async generateContract(e) {
        return this.openContractSelector(e);
    },

    async generateRoadbook(e) {
        if (!e || !e.id) return;
        await this.requireJsPDF();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const proj = this.db.projects.find(p => p.id === e.projectId);
        const projName = proj ? proj.name : 'Projet inconnu';
        const teamSize = proj ? proj.teamSize : 1;
        const expenses = proj ? proj.expenses : 'Non précisé';
        const dateStr = e.date ? this.formatDate(e.date) : 'Date à définir';

        doc.setFillColor(16, 185, 129); doc.rect(0, 0, 210, 30, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(255, 255, 255);
        doc.text('FEUILLE DE ROUTE', 105, 20, null, null, 'center');
        doc.setTextColor(0, 0, 0); doc.setFontSize(16);
        doc.text(`Spectacle : ${projName}`, 20, 50);
        doc.setFontSize(12); doc.setFont('helvetica', 'normal');
        doc.text(`Date : ${dateStr}`, 20, 65);
        doc.text(`Heure du concert : ${e.time || 'À confirmer'}`, 20, 75);
        doc.text(`Lieu : ${e.venueName || 'À confirmer'}`, 20, 85);
        doc.text(`Ville : ${e.city || 'À confirmer'}`, 20, 95);
        doc.setFont('helvetica', 'bold'); doc.text('ÉQUIPE & LOGISTIQUE', 20, 115);
        doc.setFont('helvetica', 'normal');
        doc.text(`Personnes sur la route : ${teamSize}`, 20, 125);
        doc.text("Conditions d'accueil prévues :", 20, 135);
        const splitExpenses = doc.splitTextToSize(expenses, 170);
        doc.text(splitExpenses, 30, 145);
        let y = 145 + (splitExpenses.length * 7) + 10;
        doc.setFont('helvetica', 'bold'); doc.text('CONTACTS SUR PLACE', 20, y);
        doc.setFont('helvetica', 'normal');
        doc.text('Nom : ____________________', 20, y + 10);
        doc.text('Tél : ____________________', 20, y + 20);
        doc.save(`Roadbook_${projName.replace(/\s+/g, '_')}_${dateStr.replace(/\//g, '-')}.pdf`);
    },

    importGouvData(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const json = JSON.parse(ev.target.result);
                const items = Array.isArray(json) ? json : (json.features || []);
                let count = 0;
                items.forEach(item => {
                    const props = item.properties || item;
                    let lat, lng;
                    if (item.geometry && item.geometry.coordinates) {
                        lng = item.geometry.coordinates[0];
                        lat = item.geometry.coordinates[1];
                    } else if (props.geolocalisation) {
                        lat = props.geolocalisation.lat || props.geolocalisation[0];
                        lng = props.geolocalisation.lon || props.geolocalisation[1];
                    }
                    if (lat && lng) {
                        this.db.structures.push({
                            id: Date.now() + Math.random(),
                            name: props.nom || props.appellation_courante || 'Lieu importé',
                            city: props.commune || props.ville || '',
                            lat: parseFloat(lat), lng: parseFloat(lng),
                            contacts: []
                        });
                        count++;
                    }
                });
                this.saveDB();
                Swal.fire('Succès', count + ' lieux importés !', 'success');
            } catch (err) {
                Swal.fire('Erreur', 'Format JSON invalide', 'error');
            }
        };
        reader.readAsText(file);
    },
};
