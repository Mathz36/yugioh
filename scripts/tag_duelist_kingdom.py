"""
Duelist Kingdom Card Tagger and Synchronizer for Supabase
Author: Engineer Backend

Objectives:
1. Map official Duelist Kingdom sets:
   - LOB  (Legend of Blue Eyes White Dragon)
   - MRD  (Metal Raiders)
   - MRL / SRL (Magic Ruler / Spell Ruler)
   - PSV  (Pharaoh's Servant)
   - SDY  (Starter Deck: Yugi)
   - SDK  (Starter Deck: Kaiba)
   - SDJ  (Starter Deck: Joey)
   - SDP  (Starter Deck: Pegasus)
2. Filter out blacklisted cards:
   - No Fusion Monsters (type or frameType includes 'fusion')
   - No Egyptian Gods (Slifer, Obelisk, Ra, Holactie, Divine-Beast, DIVINE)
   - No Exodia cards (Exodia pieces / Forbidden One variants)
3. Update public.cards in Supabase:
   - is_duelist_kingdom = True
   - era = 'DUELIST_KINGDOM'
4. Provide reusable catalog query functions for deck builders and game clients.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Set

# --- Blacklist Definitions ---
EXODIA_CARD_IDS: Set[int] = {
    33396948,  # Exodia the Forbidden One
    70903634,  # Right Arm of the Forbidden One
    7902349,   # Left Arm of the Forbidden One
    8124921,   # Right Leg of the Forbidden One
    44519536,  # Left Leg of the Forbidden One
}

EGYPTIAN_GOD_CARD_IDS: Set[int] = {
    10000000,  # Obelisk the Tormentor
    10000010,  # Slifer the Sky Dragon
    10000020,  # The Winged Dragon of Ra
    10000040,  # Holactie the Creator of Light
    10000080,  # The Winged Dragon of Ra - Sphere Mode
    10000090,  # The Winged Dragon of Ra - Immortal Phoenix
}

ALLOWED_TYPES: Set[str] = {
    "Normal Monster",
    "Normal Tuner Monster",
    "Effect Monster",
    "Tuner Monster",
    "Flip Effect Monster",
    "Gemini Monster",
    "Spirit Monster",
    "Toon Monster",
    "Union Effect Monster",
    "Spell Card",
    "Trap Card",
}

# Official Duelist Kingdom set names from YGOPRODeck API
DUELIST_KINGDOM_SETS: List[str] = [
    "Legend of Blue Eyes White Dragon",
    "Metal Raiders",
    "Magic Ruler",
    "Spell Ruler",
    "Pharaoh's Servant",
    "Starter Deck: Yugi",
    "Starter Deck: Kaiba",
    "Starter Deck: Joey",
    "Starter Deck: Pegasus",
]


def load_env() -> Dict[str, str]:
    env = {}
    if os.path.exists(".env"):
        with open(".env") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def is_allowed_card(card: Dict[str, Any]) -> bool:
    """Validates if a card adheres to classic rules and blacklist."""
    ctype = card.get("type", "")
    frame = card.get("frameType", "")
    cid = card.get("id", 0)
    name = card.get("name", "").lower()
    race = (card.get("race") or "").lower()
    attr = (card.get("attribute") or "").lower()

    # 1. Blacklist check: Fusion monsters
    if "fusion" in ctype.lower() or frame == "fusion":
        return False

    # 2. Blacklist check: Exodia pieces & variants
    if cid in EXODIA_CARD_IDS or "exodia" in name or "forbidden one" in name:
        return False

    # 3. Blacklist check: Egyptian Gods / Divine Beasts
    if (
        cid in EGYPTIAN_GOD_CARD_IDS
        or race == "divine-beast"
        or attr == "divine"
        or "slifer the sky dragon" in name
        or "obelisk the tormentor" in name
        or "winged dragon of ra" in name
    ):
        return False

    # 4. Classic card types only
    if ctype not in ALLOWED_TYPES:
        return False

    return True


class DuelistKingdomTagger:
    def __init__(self, base_url: str, service_key: str):
        self.base_url = base_url.rstrip("/")
        self.service_key = service_key
        self.headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }

    def fetch_cards_for_set(self, set_name: str) -> List[Dict[str, Any]]:
        """Fetches all cards in a specific set from YGOPRODeck API."""
        encoded_set = urllib.parse.quote(set_name)
        url = f"https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset={encoded_set}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (YuGiOh-Tagger/1.0)"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("data", [])
        except urllib.error.HTTPError as e:
            print(f"⚠️ Error fetching set '{set_name}': {e.code}")
            return []
        except Exception as e:
            print(f"⚠️ Network error fetching set '{set_name}': {e}")
            return []

    def collect_duelist_kingdom_cards(self) -> Dict[int, Dict[str, Any]]:
        """Queries all era sets and consolidates unique eligible cards."""
        print("🏛️ Collecting all cards from Duelist Kingdom official sets...")
        unique_cards: Dict[int, Dict[str, Any]] = {}

        for set_name in DUELIST_KINGDOM_SETS:
            cards = self.fetch_cards_for_set(set_name)
            allowed_in_set = 0
            for c in cards:
                if is_allowed_card(c):
                    unique_cards[c["id"]] = c
                    allowed_in_set += 1
            print(f"  • {set_name}: {len(cards)} cards total -> {allowed_in_set} eligible classic cards")
            time.sleep(0.2)  # Rate limiting respect (5 req/s)

        print(f"✨ Total unique eligible Duelist Kingdom cards found: {len(unique_cards)}")
        return unique_cards

    def tag_cards_in_supabase(self, card_ids: List[int], batch_size: int = 50) -> int:
        """Updates cards in Supabase with is_duelist_kingdom = True and era = 'DUELIST_KINGDOM'."""
        print(f"🚀 Updating Supabase cards table in batches of {batch_size}...")
        total_updated = 0

        for i in range(0, len(card_ids), batch_size):
            chunk = card_ids[i : i + batch_size]
            id_filter = ",".join(str(cid) for cid in chunk)
            url = f"{self.base_url}/rest/v1/cards?id=in.({id_filter})"

            payload = {
                "is_duelist_kingdom": True,
                "era": "DUELIST_KINGDOM",
                "updated_at": "now()",
            }

            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=self.headers,
                method="PATCH",
            )

            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    if resp.status in (200, 204):
                        total_updated += len(chunk)
                        print(f"✅ Marked batch {i + 1} to {i + len(chunk)} of {len(card_ids)} as Duelist Kingdom")
                    else:
                        print(f"⚠️ Unexpected status {resp.status} on batch {i}")
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8")
                print(f"❌ HTTP Error updating batch {i}: {e.code} - {err_body}")
                if "schema cache" in err_body or "PGRST204" in err_body:
                    print("\n🚨 ATENÇÃO: As colunas 'is_duelist_kingdom' ou 'era' ainda não foram adicionadas no Supabase.")
                    print("Por favor, execute o script SQL 'supabase/migrations/20261017010000_add_duelist_kingdom_era.sql' no SQL Editor do Supabase.")
                    return total_updated
            except Exception as e:
                print(f"❌ Error updating batch {i}: {e}")

        return total_updated


# --- Reusable Query Helper Functions for Clients & Decks ---

def get_duelist_kingdom_cards(
    base_url: str,
    api_key: str,
    filters: Optional[Dict[str, Any]] = None,
    limit: int = 50,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    Queries Duelist Kingdom cards from Supabase with optional filters.
    Supported filters:
      - 'type': e.g. 'Normal Monster', 'Spell Card', 'Trap Card'
      - 'level': integer
      - 'attribute': e.g. 'DARK', 'LIGHT', 'EARTH'
      - 'search': search substring in name
    """
    params = [
        "is_duelist_kingdom=eq.true",
        "select=id,name,type,level,atk,def,attribute,race,description,image_url,storage_image_path",
        "order=name.asc",
        f"limit={limit}",
        f"offset={offset}",
    ]

    if filters:
        if "type" in filters:
            params.append(f"type=eq.{urllib.parse.quote(filters['type'])}")
        if "level" in filters:
            params.append(f"level=eq.{filters['level']}")
        if "attribute" in filters:
            params.append(f"attribute=eq.{urllib.parse.quote(filters['attribute'])}")
        if "search" in filters:
            params.append(f"name=ilike.*{urllib.parse.quote(filters['search'])}*")

    query_string = "&".join(params)
    url = f"{base_url.rstrip('/')}/rest/v1/cards?{query_string}"
    req = urllib.request.Request(
        url,
        headers={"apikey": api_key, "Authorization": f"Bearer {api_key}"}
    )

    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    env = load_env()
    base_url = env.get("SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")

    if not base_url or not service_key:
        print("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined in .env")
        sys.exit(1)

    tagger = DuelistKingdomTagger(base_url, service_key)
    cards = tagger.collect_duelist_kingdom_cards()
    card_ids = list(cards.keys())

    updated = tagger.tag_cards_in_supabase(card_ids)
    print(f"\n🎉 Duelist Kingdom tagging finished! Total cards updated: {updated}/{len(card_ids)}")


if __name__ == "__main__":
    main()
