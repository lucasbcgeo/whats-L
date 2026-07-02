#!/usr/bin/env python3
"""Busca notícias via GoogleNews e retorna JSON."""

import sys
import json
import argparse
import io
from datetime import datetime, timedelta
from GoogleNews import GoogleNews

# Fontes permitidas
ALLOWED_SOURCES = [
    "bbc", "cnn", "thehackernews", "techcrunch", "the verge",
    "g1", "globo", "folha", "uol", "estadão", "r7",
    "olhardigital", "tecmundo", "canaltech", "olhardigital"
]

# Categorias com queries simples (GoogleNews não suporta site: bem)
CATEGORIES = {
    "tecnologia": "tecnologia",
    "ciencia": "ciência",
    "politica": "política Brasil",
    "cultura": "cultura",
    "concursos": "concursos públicos 2026"
}

EXCLUDE_TERMS = [
    "celebridades", "fofoca", "fofocas", "namorada", "namorado",
    "esposo", "esposa", "casamento", "divórcio", "vida conjugal",
    "biga", "big brother", "fama", "bíblia", "oracao", "deus"
]

def is_recent(date_str, hours=24):
    """Verifica se a notícia é das últimas N horas."""
    if not date_str:
        return True  # Se não tem data, incluir (pode ser recente)

    import re

    # GoogleNews retorna datas como "4 horas atrás", "2 dias atrás", etc.
    # Converter para horas e verificar se está dentro do limite
    # Nota: o GoogleNews pode retornar strings com encoding corrompido

    # Horas (compatível com mojibake)
    hours_match = re.search(r'(\d+)\s*hor', date_str)
    if hours_match:
        return int(hours_match.group(1)) <= hours

    # Minutos (compatível com mojibake)
    minutes_match = re.search(r'(\d+)\s*min', date_str)
    if minutes_match:
        return True  # Minutos sempre são recentes

    # Dias (compatível com mojibake)
    days_match = re.search(r'(\d+)\s*dia', date_str)
    if days_match:
        return int(days_match.group(1)) < 1  # Menos de 1 dia

    # Se não conseguir parsear, incluir por precaução
    return True

def fix_encoding(text):
    """Corrige encoding mojibake do GoogleNews."""
    if not isinstance(text, str):
        return text
    try:
        # Tentar corrigir mojibake: bytes UTF-8 decodificados como Latin-1
        return text.encode('latin-1').decode('utf-8')
    except:
        return text

def fetch_category(query, max_results=3):
    """Busca notícias de uma categoria."""
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        gn = GoogleNews(lang='pt', region='BR')
        gn.search(query)
        results = gn.results()
        gn.clear()
    finally:
        sys.stdout = old_stdout

    print(f"[DEBUG] {query}: {len(results)} raw results", file=sys.stderr)

    filtered = []
    seen_titles = set()  # Para deduplicar

    for r in results:
        if not isinstance(r, dict):
            continue

        # Corrigir encoding de todos os campos de texto
        title = fix_encoding(r.get("title") or "")
        if not title.strip():
            continue

        # Normalizar título para deduplicação
        title_normalized = title.lower().strip()
        if title_normalized in seen_titles:
            continue
        seen_titles.add(title_normalized)

        title_lower = title.lower()

        # Filtrar termos indesejados
        if any(term in title_lower for term in EXCLUDE_TERMS):
            continue

        # Verificar se é das últimas 24h
        date_desc = fix_encoding(r.get("date") or r.get("desc") or "")
        if not is_recent(date_desc, hours=24):
            continue

        # Verificar se a fonte é permitida
        media = fix_encoding(r.get("media") or "").lower()
        is_allowed_source = any(s in media for s in ALLOWED_SOURCES)

        filtered.append({
            "titulo": title,
            "fonte": fix_encoding(r.get("media") or ""),
            "url": r.get("link") or "",
            "isAllowed": is_allowed_source
        })

        if len(filtered) >= max_results * 2:  # Pegar mais para ter opções
            break

    print(f"[DEBUG] {query}: {len(filtered)} filtered results", file=sys.stderr)

    # Priorizar fontes permitidas, depois outras
    allowed = [f for f in filtered if f.get("isAllowed")]
    others = [f for f in filtered if not f.get("isAllowed")]

    result = (allowed + others)[:max_results]

    # Remover campo isAllowed do output
    for item in result:
        item.pop("isAllowed", None)

    return result

def main():
    # Configurar encoding para UTF-8
    import locale
    if sys.platform == "win32":
        # No Windows, forçar UTF-8
        import codecs
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer)
        sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer)

    parser = argparse.ArgumentParser(description="Buscar notícias")
    parser.add_argument("--max-per-category", type=int, default=3,
                        help="Máximo de notícias por categoria")
    args = parser.parse_args()

    news = {}
    for cat_key, query in CATEGORIES.items():
        try:
            result = fetch_category(query, args.max_per_category)
            print(f"[NEWS] {cat_key}: {len(result)} results", file=sys.stderr)
            news[cat_key] = result
        except Exception as e:
            print(f"[NEWS ERROR] {cat_key}: {e}", file=sys.stderr)
            news[cat_key] = []

    # Garantir que o JSON é UTF-8 válido
    output = json.dumps(news, ensure_ascii=False, indent=2)
    print(output)

if __name__ == "__main__":
    main()
