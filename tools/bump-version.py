#!/usr/bin/env python3
"""
Incrémente le cache-busting ?v=N de BookingPro.

Pourquoi ce script existe
-------------------------
Les paramètres ?v=N sont répartis sur plusieurs fichiers (23 occurrences dans
7 fichiers à ce jour). En oublier un fait cohabiter DEUX versions du même
module : le navigateur télécharge et évalue deux fois le même fichier sous
deux URL différentes, et chaque copie a son propre état. La panne qui en
résulte est déroutante et difficile à relier à sa cause.

Ce script ne suit aucune liste figée : il DÉCOUVRE lui-même les fichiers
concernés. Un module ajouté demain sera donc pris en compte sans rien changer
ici.

Usage
-----
    python3 tools/bump-version.py --check       # vérifie la cohérence
    python3 tools/bump-version.py               # incrémente de 1
    python3 tools/bump-version.py 42            # passe à la version 42
    python3 tools/bump-version.py 42 "Notes affichées dans le bandeau"
"""

import json
import pathlib
import re
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent

# Un ?v=N ne compte que s'il figure dans un VRAI import ou un attribut src.
# Sans cette précision, les exemples cités dans les commentaires (« ...js?v=14 »
# dans updateMethods.js) seraient incrémentés eux aussi, et fausseraient la
# vérification de cohérence.
MOTIF = re.compile(r"""(?:from\s*['"]|src\s*=\s*['"])[^'"]*?\?v=(\d+)""")


def fichiers_concernes():
    for chemin in sorted(RACINE.rglob('*')):
        if '.git' in chemin.parts or 'tools' in chemin.parts:
            continue
        if chemin.suffix not in ('.js', '.html'):
            continue
        try:
            texte = chemin.read_text(encoding='utf-8')
        except (UnicodeDecodeError, OSError):
            continue
        versions = MOTIF.findall(texte)
        if versions:
            yield chemin, texte, versions


def releve():
    """Renvoie { version : [(chemin, nombre d'occurrences)] }"""
    trouve = {}
    for chemin, _texte, versions in fichiers_concernes():
        for v in set(versions):
            trouve.setdefault(int(v), []).append(
                (chemin.relative_to(RACINE), versions.count(v)))
    return trouve


def afficher_releve(trouve):
    for version in sorted(trouve):
        total = sum(n for _, n in trouve[version])
        print(f"  ?v={version} — {total} occurrence(s) dans {len(trouve[version])} fichier(s)")
        for chemin, n in sorted(trouve[version]):
            print(f"      {chemin}  ({n})")


def version_du_manifeste():
    try:
        return json.loads((RACINE / 'version.json').read_text(encoding='utf-8')).get('version')
    except Exception:
        return None


def main():
    args = [a for a in sys.argv[1:]]
    mode_check = '--check' in args
    if mode_check:
        args.remove('--check')

    trouve = releve()
    if not trouve:
        print("Aucun ?v= trouvé — rien à faire.")
        return 0

    print("État actuel :")
    afficher_releve(trouve)

    manifeste = version_du_manifeste()
    print(f"  version.json : {manifeste}")

    # ── Cohérence ────────────────────────────────────────────────────────────
    problemes = []
    if len(trouve) > 1:
        problemes.append(f"{len(trouve)} numéros différents cohabitent : "
                         + ', '.join(str(v) for v in sorted(trouve)))
    actuelle = max(trouve)
    if manifeste is not None and str(manifeste) != str(actuelle):
        problemes.append(f"version.json ({manifeste}) ne correspond pas aux imports ({actuelle})")

    if problemes:
        print("\n⚠️  INCOHÉRENCE :")
        for p in problemes:
            print("   - " + p)
    else:
        print("\n✓ Cohérent : un seul numéro partout, et version.json correspond.")

    if mode_check:
        return 1 if problemes else 0

    # ── Incrémentation ───────────────────────────────────────────────────────
    cible = int(args[0]) if args and args[0].isdigit() else actuelle + 1
    notes = args[1] if len(args) > 1 else None

    if cible <= actuelle:
        print(f"\n✗ La cible ({cible}) doit être supérieure à l'actuelle ({actuelle}).")
        return 1

    print(f"\nPassage de {actuelle} à {cible} …")
    total = 0
    for chemin, texte, _versions in fichiers_concernes():
        neuf = MOTIF.sub(
            lambda m: m.group(0)[:m.start(1) - m.start(0)] + str(cible), texte)
        if neuf != texte:
            n = len(MOTIF.findall(texte))
            chemin.write_text(neuf, encoding='utf-8')
            print(f"  {chemin.relative_to(RACINE)} — {n} occurrence(s)")
            total += n

    # version.json : les notes existantes sont conservées si aucune n'est fournie
    vj = RACINE / 'version.json'
    data = {}
    try:
        data = json.loads(vj.read_text(encoding='utf-8'))
    except Exception:
        pass
    data['version'] = str(cible)
    if notes:
        data['notes'] = notes
    vj.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"  version.json — {cible}")

    # ── Vérification ─────────────────────────────────────────────────────────
    apres = releve()
    if len(apres) == 1 and next(iter(apres)) == cible:
        print(f"\n✓ {total} occurrence(s) incrémentée(s). Un seul numéro partout : {cible}.")
        return 0
    print("\n✗ ÉCHEC — l'état après incrémentation n'est pas homogène :")
    afficher_releve(apres)
    return 1


if __name__ == '__main__':
    sys.exit(main())
