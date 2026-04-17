// venueMethods.js — Recherche venue, création affaire/événement

export const venueMethods = {

// --- RECHERCHE VENUE (modal Affaire) ---
        searchVenues() {
            const q = (this.venueSearch || '').toLowerCase().trim();
            if (q.length < 2) { this.venueSearchResults = []; return; }
            this.venueSearchResults = this.db.structures.filter(s => {
                return (s.name   || '').toLowerCase().includes(q) ||
                       (s.city   || '').toLowerCase().includes(q) ||
                       (s.zip    || '').includes(q) ||
                       (s.region || '').toLowerCase().includes(q) ||
                       (s.tags?.categories || []).some(t => t.toLowerCase().includes(q)) ||
                       (s.tags?.reseaux    || []).some(t => t.toLowerCase().includes(q));
            }).slice(0, 8);
            this.showVenueDropdown = true;
        },

        selectVenue(s) {
            this.editEventData.venueId   = s.id;
            this.editEventData.venueName = s.name;
            this.editEventData.city      = s.city || '';
            // Pré-remplir la jauge si disponible
            if (s.capacity && !this.editEventData.capacity) this.editEventData.capacity = s.capacity;
            this.venueSearch        = '';
            this.venueSearchResults = [];
            this.showVenueDropdown  = false;
            this.showVenueBrowser   = false;
        },

        clearVenueSelection() {
            this.editEventData.venueId    = '';
            this.editEventData.venueName  = '';
            this.editEventData.city       = '';
            this.editEventData.contactId  = '';
            this.editEventData.contactName= '';
            this.venueSearch = '';
            this.venueSearchResults = [];
        },

        getDeptLabel(dept) {
            const depts = {
                '01':'Ain','02':'Aisne','03':'Allier','04':'Alpes-de-Haute-Provence','05':'Hautes-Alpes',
                '06':'Alpes-Maritimes','07':'Ardèche','08':'Ardennes','09':'Ariège','10':'Aube',
                '11':'Aude','12':'Aveyron','13':'Bouches-du-Rhône','14':'Calvados','15':'Cantal',
                '16':'Charente','17':'Charente-Maritime','18':'Cher','19':'Corrèze','20':'Corse',
                '21':'Côte-d\'Or','22':'Côtes-d\'Armor','23':'Creuse','24':'Dordogne','25':'Doubs',
                '26':'Drôme','27':'Eure','28':'Eure-et-Loir','29':'Finistère','2A':'Corse-du-Sud',
                '2B':'Haute-Corse','30':'Gard','31':'Haute-Garonne','32':'Gers','33':'Gironde',
                '34':'Hérault','35':'Ille-et-Vilaine','36':'Indre','37':'Indre-et-Loire',
                '38':'Isère','39':'Jura','40':'Landes','41':'Loir-et-Cher','42':'Loire',
                '43':'Haute-Loire','44':'Loire-Atlantique','45':'Loiret','46':'Lot',
                '47':'Lot-et-Garonne','48':'Lozère','49':'Maine-et-Loire','50':'Manche',
                '51':'Marne','52':'Haute-Marne','53':'Mayenne','54':'Meurthe-et-Moselle',
                '55':'Meuse','56':'Morbihan','57':'Moselle','58':'Nièvre','59':'Nord',
                '60':'Oise','61':'Orne','62':'Pas-de-Calais','63':'Puy-de-Dôme',
                '64':'Pyrénées-Atlantiques','65':'Hautes-Pyrénées','66':'Pyrénées-Orientales',
                '67':'Bas-Rhin','68':'Haut-Rhin','69':'Rhône','70':'Haute-Saône',
                '71':'Saône-et-Loire','72':'Sarthe','73':'Savoie','74':'Haute-Savoie',
                '75':'Paris','76':'Seine-Maritime','77':'Seine-et-Marne','78':'Yvelines',
                '79':'Deux-Sèvres','80':'Somme','81':'Tarn','82':'Tarn-et-Garonne',
                '83':'Var','84':'Vaucluse','85':'Vendée','86':'Vienne','87':'Haute-Vienne',
                '88':'Vosges','89':'Yonne','90':'Territoire de Belfort','91':'Essonne',
                '92':'Hauts-de-Seine','93':'Seine-Saint-Denis','94':'Val-de-Marne',
                '95':'Val-d\'Oise','97':'Outre-Mer',
            };
            return depts[dept] ? `${dept} - ${depts[dept]}` : null;
        },

        // Wrapper openEventModal pour réinitialiser la recherche venue
        openEventModal(ev, data) {
            this.venueSearch        = '';
            this.venueSearchResults = [];
            this.showVenueDropdown  = false;
            this.showVenueBrowser   = false;
            // Appel du module planning
            if (this.$options.methods._openEventModal) {
                this.$options.methods._openEventModal.call(this, ev, data);
            } else {
                // Fallback direct
                this.editEventData = data ? JSON.parse(JSON.stringify(data)) : {
                    id:'', projectId:'', stage:'lead', venueId:'', venueName:'', city:'',
                    date:'', time:'', fee:'', feeType:'HT', contractType:'cession',
                    capacity:'', ticketPrice:'', corealPercentage:'', tourExpenses:'', estFillRate:'',
                    status:'prospect', notes:'', contactId:'', contactName:''
                };
                this.showEventModal = true;
            }
        },

        openCrmViewFromProject(s) {
            this.showProjectModal = false;
            this.tab = 'structures';
            this.$nextTick(() => { this.openCrmView(s); });
        },

};
