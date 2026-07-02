#!/usr/bin/env python3
"""Busca notícias via GoogleNews e retorna JSON."""

import sys
import json
import argparse
from GoogleNews import GoogleNews

CATEGORIES = {
    "tecnologia": "tecnologia",
    "ciencia": "ciência",
    "politica": "política",
    "cultura": "cultura",
    "concursos": "concursos públicos CGU legislativos controle fiscal"
}

EXCLUDE_terms = [
    "celebridades", "fofoca", "fofocas", "namorada", "namorado",
    "esposo", "esposa", "casamento", "divórcio", "vida conjugal",
    "biga", "big brother", "fama"
]

def fetch_category(query, max_results=3):
    """Busca notícias de uma categoria."""
    gn = GoogleNews(lang='pt', region='BR')
    gn.search(query)
    results = gn.results()
    gn.clear()

    filtered = []
    for r in results:
        title = r.get("title", "")
        title_lower = title.lower()

        # Filtrar termos indesejados
        if any(term in title_lower for term in EXCLUDE_terms):
            continue

        filtered.append({
            "titulo": title,
            "fonte": r.get("media", ""),
            "url": r.get("link", "")
        })

        if len(filtered) >= max_results:
            break

    return filtered

def main():
    parser = argparse.ArgumentParser(description="Buscar notícias")
    parser.add_argument("--max-per-category", type=int, default=3,
                        help="Máximo de notícias por categoria")
    args = parser.parse_args()

    news = {}
    for cat_key, query in CATEGORIES.items():
        try:
            news[cat_key] = fetch_category(query, args.max_per_category)
        except Exception as e:
            print(f"[NEWS ERROR] {cat_key}: {e}", file=sys.stderr)
            news[cat_key] = []

    print(json.dumps(news, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
