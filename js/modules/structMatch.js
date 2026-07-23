// js/modules/structMatch.js — Moteur unique de rapprochement des structures
// Utilisé par l'import gouv, l'import CSV et la création manuelle.
// ⚠️ Source de vérité unique : ne PAS dupliquer cette logique ailleurs.
//
// Principe : on ne rapproche jamais sur le nom seul. On hiérarchise des signaux
// d'identité stables (SIRET, licence, identifiant gouv, domaine, alias validé),
// puis on se contente de *suggérer* sur les signaux plus faibles.

// ─────────────────────────────────────────────────────────────────────────────
// Domaines de messagerie génériques : ne JAMAIS rapprocher deux structures
// parce qu'elles utilisent toutes les deux gmail.com. Garde-fou essentiel.
// ─────────────────────────────────────────────────────────────────────────────
const GENERIC_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.fr', 'outlook.com',
    'outlook.fr', 'live.fr', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.fr',
    'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'laposte.net', 'bbox.fr',
    'neuf.fr', 'aliceadsl.fr', 'numericable.fr', 'icloud.com', 'me.com',
    'mac.com', 'proton.me', 'protonmail.com', 'gmx.fr', 'gmx.com', 'aol.com',
    'yandex.com', 'mailo.com', 'net-c.com', 'club-internet.fr',
]);

// Mots vides du secteur : présents dans une variante, absents dans l'autre.
const STOP_WORDS = new Set([
    'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'au', 'aux', 'et', 'a',
    'theatre', 'theatres', 'cie', 'compagnie', 'association', 'assoc', 'asso',
    'salle', 'espace', 'centre', 'culturel', 'culturelle', 'scene', 'scenes',
    'maison', 'lieu', 'ville', 'municipal', 'municipale', 'communal', 'communale',
    'ass', 'sarl', 'sas', 'sa', 'eurl', 'scop', 'scic', 'sasu', 'spectacle',
    'spectacles', 'production', 'productions', 'prod', 'diffusion',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────────────────

// Retire accents, casse, ponctuation. "Théâtre du Moulin" -> "theatre du moulin"
export function deaccent(s) {
    return String(s == null ? '' : s)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[’']/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

// Tokens signifiants d'un nom (mots vides retirés).
// "Théâtre du Moulin" et "Le Moulin" -> tous deux ["moulin"]
export function nameTokens(name) {
    return deaccent(name).split(' ').filter(w => w && !STOP_WORDS.has(w));
}

// Clé de nom normalisée, pour comparaison directe.
export function normalizeName(name) {
    const t = nameTokens(name);
    // Si tout a été mangé par les mots vides, on retombe sur le nom déaccentué.
    return (t.length ? t : deaccent(name).split(' ').filter(Boolean)).sort().join(' ');
}

export function normalizeCity(city) {
    return deaccent(city);
}

// Téléphone : "+33 4 73 12 34 56" -> "0473123456"
export function normalizePhone(p) {
    let d = String(p == null ? '' : p).replace(/[^0-9+]/g, '');
    if (!d) return '';
    d = d.replace(/^\+330?/, '0').replace(/^00330?/, '0').replace(/^\+/, '');
    if (d.length === 9 && d[0] !== '0') d = '0' + d;
    return d.length >= 9 ? d.slice(-10) : '';
}

// Domaine d'un email, hors fournisseurs génériques.
export function emailDomain(email) {
    const m = String(email == null ? '' : email).toLowerCase().trim().match(/@([a-z0-9.-]+\.[a-z]{2,})$/);
    if (!m) return null;
    const d = m[1].replace(/^www\./, '');
    return GENERIC_DOMAINS.has(d) ? null : d;
}

// Domaine d'un site web.
export function siteDomain(website) {
    let w = String(website == null ? '' : website).toLowerCase().trim();
    if (!w) return null;
    w = w.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(w)) return null;
    return GENERIC_DOMAINS.has(w) ? null : w;
}

// Tous les domaines propres d'une structure (email + site).
export function structDomains(s) {
    const out = new Set();
    const a = emailDomain(s && s.email);
    const b = siteDomain(s && s.website);
    if (a) out.add(a);
    if (b) out.add(b);
    return out;
}

// Tous les téléphones normalisés d'une structure.
export function structPhones(s) {
    const out = new Set();
    ['phone1', 'phone2', 'mobile'].forEach(k => {
        const n = normalizePhone(s && s[k]);
        if (n) out.add(n);
    });
    return out;
}

// Alias normalisés d'une structure (nom courant inclus).
export function structAliasKeys(s) {
    const out = new Set();
    if (s && s.name) out.add(normalizeName(s.name));
    if (s && Array.isArray(s.aliases)) s.aliases.forEach(a => { const k = normalizeName(a); if (k) out.add(k); });
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Similarité & géographie
// ─────────────────────────────────────────────────────────────────────────────

// Coefficient de Dice sur les tokens : 1 = identique, 0 = rien en commun.
export function tokenSimilarity(a, b) {
    const A = new Set(nameTokens(a)), B = new Set(nameTokens(b));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach(t => { if (B.has(t)) inter++; });
    return (2 * inter) / (A.size + B.size);
}

// Un token de A est-il contenu dans un token de B (fautes de frappe légères) ?
export function containsAllTokens(a, b) {
    const A = nameTokens(a), B = new Set(nameTokens(b));
    if (!A.length) return false;
    return A.every(t => B.has(t));
}

// Distance approximative en mètres entre deux points GPS.
export function distanceMeters(lat1, lng1, lat2, lng2) {
    if ([lat1, lng1, lat2, lng2].some(v => v == null || isNaN(v))) return Infinity;
    const R = 6371000, toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// Même localité ? (ville normalisée identique, ou même code postal)
function sameLocality(a, b) {
    const ca = normalizeCity(a && a.city), cb = normalizeCity(b && b.city);
    if (ca && cb && ca === cb) return true;
    const za = String((a && a.zip) || '').trim(), zb = String((b && b.zip) || '').trim();
    return !!(za && zb && za === zb);
}

// ─────────────────────────────────────────────────────────────────────────────
// Moteur de rapprochement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare une structure entrante à l'annuaire existant.
 * @returns {{status:'auto'|'suggest'|'new', target:object|null, score:number,
 *            reasons:string[], candidates:Array<{struct:object,score:number,reasons:string[]}>}}
 */
export function matchStructure(incoming, structures, opts = {}) {
    const list = Array.isArray(structures) ? structures : [];
    const excludeId = opts.excludeId != null ? String(opts.excludeId) : null;

    const inDomains = structDomains(incoming);
    const inPhones  = structPhones(incoming);
    const inKey     = normalizeName(incoming && incoming.name);

    const suggestions = [];

    for (const s of list) {
        if (!s) continue;
        if (excludeId && String(s.id) === excludeId) continue;

        const reasons = [];

        // ── Signaux forts → fusion automatique ──
        const strongPairs = [['siret', 'SIRET'], ['licence', 'licence'], ['govId', 'identifiant gouv']];
        for (const [field, label] of strongPairs) {
            const a = String((incoming && incoming[field]) || '').replace(/\s/g, '');
            const b = String((s && s[field]) || '').replace(/\s/g, '');
            if (a && b && a === b) {
                return { status: 'auto', target: s, score: 1, reasons: [`même ${label} : ${a}`], candidates: [] };
            }
        }

        // Domaine propre commun (email ou site)
        const sDomains = structDomains(s);
        let sharedDomain = null;
        inDomains.forEach(d => { if (sDomains.has(d)) sharedDomain = d; });
        if (sharedDomain) {
            return { status: 'auto', target: s, score: 0.95, reasons: [`même domaine : ${sharedDomain}`], candidates: [] };
        }

        // Alias déjà validé (ou nom normalisé identique) + même localité
        const aliasKeys = structAliasKeys(s);
        if (inKey && aliasKeys.has(inKey) && sameLocality(incoming, s)) {
            const viaAlias = normalizeName(s.name) !== inKey;
            return {
                status: 'auto', target: s, score: 0.9,
                reasons: [viaAlias ? `variante de nom déjà validée : « ${s.name} »` : `même nom et même ville`],
                candidates: [],
            };
        }

        // ── Signaux faibles → suggestion ──
        let score = 0;

        let sharedPhone = null;
        structPhones(s).forEach(p => { if (inPhones.has(p)) sharedPhone = p; });
        if (sharedPhone) { score = Math.max(score, 0.75); reasons.push(`même téléphone : ${sharedPhone}`); }

        const local = sameLocality(incoming, s);
        if (local) {
            const sim = tokenSimilarity(incoming && incoming.name, s.name);
            if (sim >= 0.5 || containsAllTokens(incoming && incoming.name, s.name)) {
                score = Math.max(score, 0.5 + sim * 0.3);
                reasons.push(`nom proche dans la même ville : « ${s.name} »`);
            }
            const dist = distanceMeters(incoming && incoming.lat, incoming && incoming.lng, s.lat, s.lng);
            if (dist < 150) {
                score = Math.max(score, 0.7);
                reasons.push(`même adresse à ${Math.round(dist)} m près`);
            }
        }

        if (score > 0 && reasons.length) suggestions.push({ struct: s, score, reasons });
    }

    if (suggestions.length) {
        suggestions.sort((a, b) => b.score - a.score);
        const best = suggestions[0];
        return {
            status: 'suggest', target: best.struct, score: best.score,
            reasons: best.reasons, candidates: suggestions.slice(0, 5),
        };
    }

    return { status: 'new', target: null, score: 0, reasons: [], candidates: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fusion : complète les vides, ne modifie jamais une valeur existante,
// et signale les conflits.
// ─────────────────────────────────────────────────────────────────────────────

const MERGE_FIELDS = [
    ['address', 'Adresse'], ['suite', 'Complément'], ['zip', 'Code postal'],
    ['city', 'Ville'], ['country', 'Pays'], ['region', 'Région'],
    ['phone1', 'Téléphone 1'], ['phone2', 'Téléphone 2'], ['mobile', 'Mobile'],
    ['fax', 'Fax'], ['email', 'Email'], ['website', 'Site web'],
    ['capacity', 'Jauge'], ['season', 'Saison'], ['hours', 'Horaires'],
    ['siret', 'SIRET'], ['licence', 'Licence'], ['govId', 'Identifiant gouv'],
];

const isEmpty = v => v == null || String(v).trim() === '';

// Comparaison "intelligente" selon le champ : évite les faux conflits dus au
// seul formatage (http/https, www, espaces dans un téléphone, casse d'email…).
function sameValue(field, a, b) {
    const A = String(a).trim(), B = String(b).trim();
    if (A.toLowerCase() === B.toLowerCase()) return true;
    if (field === 'website') {
        const da = siteDomain(A), db = siteDomain(B);
        return !!(da && db && da === db);
    }
    if (field === 'email') {
        return A.toLowerCase().replace(/\s/g, '') === B.toLowerCase().replace(/\s/g, '');
    }
    if (field === 'phone1' || field === 'phone2' || field === 'mobile' || field === 'fax') {
        const pa = normalizePhone(A), pb = normalizePhone(B);
        return !!(pa && pb && pa === pb);
    }
    if (field === 'siret' || field === 'licence' || field === 'govId') {
        return A.replace(/\s/g, '') === B.replace(/\s/g, '');
    }
    if (field === 'zip') return A.replace(/\s/g, '') === B.replace(/\s/g, '');
    if (field === 'city' || field === 'country' || field === 'region') {
        return normalizeCity(A) === normalizeCity(B);
    }
    return false;
}

/**
 * Enrichit `existing` avec les données de `incoming`.
 * Ne remplace jamais une valeur déjà renseignée.
 * @returns {{filled:Array, conflicts:Array, aliasAdded:string|null}}
 */
export function mergeInto(existing, incoming) {
    const filled = [], conflicts = [];

    for (const [field, label] of MERGE_FIELDS) {
        const inc = incoming ? incoming[field] : undefined;
        if (isEmpty(inc)) continue;
        if (isEmpty(existing[field])) {
            existing[field] = inc;
            filled.push({ field, label, value: String(inc).trim() });
        } else if (!sameValue(field, existing[field], inc)) {
            conflicts.push({ field, label, kept: String(existing[field]).trim(), ignored: String(inc).trim() });
        }
    }

    // GPS : uniquement si absent
    if ((existing.lat == null || existing.lng == null) && incoming && incoming.lat != null && incoming.lng != null) {
        existing.lat = incoming.lat; existing.lng = incoming.lng;
        filled.push({ field: 'gps', label: 'Coordonnées GPS', value: `${incoming.lat}, ${incoming.lng}` });
    }

    // Tags : union
    if (incoming && incoming.tags) {
        existing.tags = existing.tags || { categories: [], genres: [], reseaux: [], keywords: [] };
        ['categories', 'genres', 'reseaux', 'keywords'].forEach(k => {
            existing.tags[k] = existing.tags[k] || [];
            (incoming.tags[k] || []).forEach(t => { if (t && !existing.tags[k].includes(t)) existing.tags[k].push(t); });
        });
    }

    // Alias : mémorise la variante de nom pour les prochains imports
    const aliasAdded = addAlias(existing, incoming && incoming.name);

    return { filled, conflicts, aliasAdded };
}

/**
 * Mémorise une variante de nom sur la fiche canonique.
 * C'est ce qui rend le rapprochement auto-apprenant.
 * @returns {string|null} l'alias ajouté, ou null
 */
export function addAlias(existing, name) {
    if (!existing || !name) return null;
    const key = normalizeName(name);
    if (!key) return null;
    if (normalizeName(existing.name) === key) return null;
    existing.aliases = Array.isArray(existing.aliases) ? existing.aliases : [];
    if (existing.aliases.some(a => normalizeName(a) === key)) return null;
    existing.aliases.push(String(name).trim());
    return String(name).trim();
}

/** Trace lisible d'une fusion, à pousser dans structure.comments[]. */
export function buildMergeComment({ source, filled, conflicts, user }) {
    const parts = [];
    if (filled.length)    parts.push(`complété : ${filled.map(f => f.label).join(', ')}`);
    if (conflicts.length) parts.push(`conflit(s) : ${conflicts.map(c => `${c.label} (gardé « ${c.kept} », ignoré « ${c.ignored} »)`).join(' ; ')}`);
    if (!parts.length)    parts.push('aucun changement');
    return {
        id:     Date.now() + Math.random(),
        date:   new Date().toISOString(),
        author: user || '',
        text:   `[Fusion ${source}] ${parts.join(' — ')}`,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Balayage de l'annuaire : détection des doublons déjà présents.
//
// Même cascade que matchStructure(), mais optimisée pour comparer TOUTES les
// fiches entre elles. On ne compare jamais toutes les paires : on regroupe
// d'abord par signal (domaine, téléphone, ville), puis on ne compare qu'à
// l'intérieur de chaque groupe. Sur un annuaire de 1 400 fiches, cela ramène
// ~1 000 000 de comparaisons à quelques milliers.
// ─────────────────────────────────────────────────────────────────────────────

/** Marque deux structures comme "pas des doublons" (refus mémorisé). */
export function markNotDuplicate(a, b) {
    if (!a || !b) return;
    a.notDuplicates = Array.isArray(a.notDuplicates) ? a.notDuplicates : [];
    b.notDuplicates = Array.isArray(b.notDuplicates) ? b.notDuplicates : [];
    if (!a.notDuplicates.includes(String(b.id))) a.notDuplicates.push(String(b.id));
    if (!b.notDuplicates.includes(String(a.id))) b.notDuplicates.push(String(a.id));
}

function isRefused(a, b) {
    const la = Array.isArray(a.notDuplicates) ? a.notDuplicates : [];
    const lb = Array.isArray(b.notDuplicates) ? b.notDuplicates : [];
    return la.includes(String(b.id)) || lb.includes(String(a.id));
}

/**
 * Analyse l'annuaire et renvoie les paires suspectes, triées par certitude.
 * @returns {Array<{a,b,score,level:'auto'|'suggest',reasons:string[],sameCity:boolean}>}
 */
export function scanDuplicates(structures) {
    const list = (Array.isArray(structures) ? structures : []).filter(s => s && s.name);

    // ── Pré-calcul des signaux, une seule fois par fiche ──
    const sig = list.map(s => ({
        s,
        key:      normalizeName(s.name),
        tokens:   new Set(nameTokens(s.name)),
        city:     normalizeCity(s.city),
        zip:      String(s.zip || '').trim(),
        domains:  structDomains(s),
        phones:   structPhones(s),
        aliases:  structAliasKeys(s),
        lat: s.lat, lng: s.lng,
        siret:   String(s.siret   || '').replace(/\s/g, ''),
        licence: String(s.licence || '').replace(/\s/g, ''),
        govId:   String(s.govId   || '').replace(/\s/g, ''),
    }));

    const pairs = new Map();   // "idA|idB" -> pair
    const addPair = (x, y, score, level, reason) => {
        if (x.s.id === y.s.id) return;
        if (isRefused(x.s, y.s)) return;
        const [p, q] = String(x.s.id) < String(y.s.id) ? [x, y] : [y, x];
        const k = `${p.s.id}|${q.s.id}`;
        const prev = pairs.get(k);
        if (prev) {
            if (!prev.reasons.includes(reason)) prev.reasons.push(reason);
            if (score > prev.score) { prev.score = score; prev.level = level; }
            return;
        }
        pairs.set(k, {
            a: p.s, b: q.s, score, level,
            reasons: [reason],
            sameCity: !!(p.city && q.city && p.city === q.city),
        });
    };

    // ── 1. Identifiants forts : regroupement direct ──
    [['siret', 'même SIRET'], ['licence', 'même licence'], ['govId', 'même identifiant gouv']]
        .forEach(([field, label]) => {
            const idx = new Map();
            sig.forEach(x => {
                const v = x[field];
                if (!v) return;
                if (!idx.has(v)) idx.set(v, []);
                idx.get(v).push(x);
            });
            idx.forEach((group, v) => {
                for (let i = 0; i < group.length; i++)
                    for (let j = i + 1; j < group.length; j++)
                        addPair(group[i], group[j], 100, 'auto', `${label} : ${v}`);
            });
        });

    // ── 2. Domaine propre commun (email ou site) ──
    const byDomain = new Map();
    sig.forEach(x => x.domains.forEach(d => {
        if (!byDomain.has(d)) byDomain.set(d, []);
        byDomain.get(d).push(x);
    }));
    byDomain.forEach((group, d) => {
        for (let i = 0; i < group.length; i++)
            for (let j = i + 1; j < group.length; j++)
                addPair(group[i], group[j], 95, 'auto', `même domaine : ${d}`);
    });

    // ── 3. Téléphone identique ──
    const byPhone = new Map();
    sig.forEach(x => x.phones.forEach(p => {
        if (!byPhone.has(p)) byPhone.set(p, []);
        byPhone.get(p).push(x);
    }));
    byPhone.forEach((group, p) => {
        for (let i = 0; i < group.length; i++)
            for (let j = i + 1; j < group.length; j++)
                addPair(group[i], group[j], 75, 'suggest', `même téléphone : ${p}`);
    });

    // ── 4. Même localité : nom identique, alias, similarité, proximité GPS ──
    const byLocality = new Map();
    sig.forEach(x => {
        const loc = x.city || (x.zip ? `zip:${x.zip}` : '');
        if (!loc) return;                       // sans localité : on ne compare pas
        if (!byLocality.has(loc)) byLocality.set(loc, []);
        byLocality.get(loc).push(x);
    });

    byLocality.forEach(group => {
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const x = group[i], y = group[j];

                if (x.key && x.key === y.key) {
                    addPair(x, y, 90, 'auto', 'même nom et même ville');
                    continue;
                }
                if ((x.key && y.aliases.has(x.key)) || (y.key && x.aliases.has(y.key))) {
                    addPair(x, y, 90, 'auto', 'variante de nom déjà validée');
                    continue;
                }

                // Similarité de tokens (Dice)
                let inter = 0;
                x.tokens.forEach(t => { if (y.tokens.has(t)) inter++; });
                const sim = (x.tokens.size && y.tokens.size)
                    ? (2 * inter) / (x.tokens.size + y.tokens.size) : 0;
                if (sim >= 0.5) {
                    addPair(x, y, Math.round((0.5 + sim * 0.3) * 100), 'suggest',
                        `nom proche dans la même ville (${Math.round(sim * 100)} %)`);
                }

                const dist = distanceMeters(x.lat, x.lng, y.lat, y.lng);
                if (dist < 150) {
                    addPair(x, y, 70, 'suggest', `même adresse à ${Math.round(dist)} m près`);
                }
            }
        }
    });

    return Array.from(pairs.values()).sort((u, v) => v.score - u.score);
}
