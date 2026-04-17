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

    async generateContract(e) {
        if (!e || !e.id) return;
        await this.requireJsPDF();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const proj = this.db.projects.find(p => p.id === e.projectId);
        const projName = proj ? proj.name : 'Projet inconnu';
        const fee = e.fee || (proj ? proj.defaultFee : 0);
        const feeType = proj ? (proj.feeType || 'HT') : 'HT';
        const dateStr = e.date ? this.formatDate(e.date) : 'Date à définir';

        doc.setFillColor(79, 70, 229); doc.rect(0, 0, 210, 30, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(255, 255, 255);
        doc.text('CONTRAT DE CESSION', 105, 20, null, null, 'center');
        doc.setTextColor(0, 0, 0); doc.setFontSize(12); doc.setFont('helvetica', 'normal');
        doc.text('ENTRE LES SOUSSIGNÉS :', 20, 50);
        doc.text(`La production : ${this.currentUser || 'Votre Structure'} d'une part,`, 20, 60);
        doc.text(`ET l'organisateur : ${e.venueName || '____________________'} à ${e.city || '____________________'} d'autre part.`, 20, 70);
        doc.setFont('helvetica', 'bold'); doc.text('ARTICLE 1 : OBJET', 20, 90);
        doc.setFont('helvetica', 'normal');
        doc.text(`L'organisateur engage la production pour la représentation du spectacle :`, 20, 100);
        doc.text(`"${projName}"`, 30, 110);
        doc.text(`Date : ${dateStr} à ${e.time || '--:--'}`, 30, 120);
        doc.setFont('helvetica', 'bold'); doc.text('ARTICLE 2 : CONDITIONS FINANCIÈRES', 20, 140);
        doc.setFont('helvetica', 'normal');
        if (e.contractType === 'coreal') {
            doc.text(`L'organisateur s'engage à reverser à la production une part des recettes :`, 20, 150);
            doc.text(`Pourcentage de la billetterie : ${e.corealPercentage || '_____'} %`, 30, 160);
            doc.text(`Estimation du cachet : ${this.formatMoney(fee)} ${feeType}`, 30, 170);
        } else {
            doc.text(`L'organisateur s'engage à verser à la production un cachet de :`, 20, 150);
            doc.text(`${this.formatMoney(fee)} ${feeType}`, 30, 160);
        }
        doc.text(`Fait à ___________________, le ${new Date().toLocaleDateString('fr-FR')}`, 20, 210);
        doc.text("Signature de l'organisateur", 20, 230);
        doc.text('Signature de la production', 120, 230);
        doc.save(`Contrat_${projName.replace(/\s+/g, '_')}_${dateStr.replace(/\//g, '-')}.pdf`);
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
