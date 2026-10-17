"""
Yu-Gi-Oh Card Synchronizer from YGOPRODeck API to Supabase
Author: Engineer Backend

Rules:
- Rate limit: 5 requests per second (0.2s interval)
- Filtering: Classic cards only (Normal, Effect, Spell, Trap)
- Blacklist: No Fusion monsters, No Exodia parts/cards, No Egyptian God cards
- Storage: Upload images to Supabase Storage ('card-images' bucket)
- Database: Upsert metadata into 'public.cards' table
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Set

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


class RateLimiter:
    """Enforces a maximum of requests per second."""
    def __init__(self, requests_per_second: float = 5.0):
        self.delay = 1.0 / requests_per_second
        self.last_call = 0.0

    def wait(self) -> None:
        elapsed = time.time() - self.last_call
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self.last_call = time.time()


def is_allowed_card(card: Dict[str, Any]) -> bool:
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


class CardSynchronizer:
    def __init__(self, base_url: str, service_key: str):
        self.base_url = base_url.rstrip("/")
        self.service_key = service_key
        self.rate_limiter = RateLimiter(5.0)  # 5 req/s
        self.headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        }

    def fetch_cards_from_api(self) -> List[Dict[str, Any]]:
        print("📡 Fetching cards from YGOPRODeck API...")
        url = "https://db.ygoprodeck.com/api/v7/cardinfo.php"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (YuGiOh-Sync/1.0)"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("data", [])

    def upload_image(self, card_id: int, image_url: str) -> Optional[str]:
        if not image_url:
            return None

        file_path = f"cards/{card_id}.jpg"
        storage_url = f"{self.base_url}/storage/v1/object/card-images/{file_path}"

        self.rate_limiter.wait()
        try:
            # Download image with user-agent
            img_req = urllib.request.Request(image_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(img_req, timeout=15) as img_resp:
                img_bytes = img_resp.read()

            # Upload to Supabase Storage
            upload_req = urllib.request.Request(
                storage_url,
                data=img_bytes,
                headers={
                    "apikey": self.service_key,
                    "Authorization": f"Bearer {self.service_key}",
                    "Content-Type": "image/jpeg",
                    "x-upsert": "true",
                },
                method="POST",
            )
            with urllib.request.urlopen(upload_req, timeout=15) as upload_resp:
                if upload_resp.status in (200, 201):
                    return file_path
        except Exception as e:
            # Non-fatal: can still register card with remote image URL
            return None
        return None

    def upsert_cards_batch(self, batch: List[Dict[str, Any]]) -> bool:
        url = f"{self.base_url}/rest/v1/cards"
        data = json.dumps(batch).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=self.headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status in (200, 201)
        except urllib.error.HTTPError as e:
            print(f"❌ Upsert error: {e.code} - {e.read().decode('utf-8')}")
            return False
        except Exception as e:
            print(f"❌ Upsert network error: {e}")
            return False

    def sync(self, upload_images: bool = True, limit: Optional[int] = None) -> None:
        raw_cards = self.fetch_cards_from_api()
        print(f"📦 Total cards from YGOPRODeck: {len(raw_cards)}")

        filtered = [c for c in raw_cards if is_allowed_card(c)]
        print(f"✨ Total eligible classic cards after filtering and blacklist: {len(filtered)}")

        target_cards = filtered[:limit] if limit else filtered
        total = len(target_cards)
        print(f"🚀 Synchronizing {total} cards (upload_images={upload_images})...")

        batch_size = 50
        uploaded_images_count = 0

        for i in range(0, total, batch_size):
            chunk = target_cards[i : i + batch_size]
            records = []

            for c in chunk:
                card_id = c["id"]
                image_url = ""
                if c.get("card_images") and len(c["card_images"]) > 0:
                    image_url = c["card_images"][0].get("image_url", "")

                storage_path = None
                if upload_images and image_url:
                    storage_path = self.upload_image(card_id, image_url)
                    if storage_path:
                        uploaded_images_count += 1

                records.append({
                    "id": card_id,
                    "name": c.get("name"),
                    "type": c.get("type"),
                    "frame_type": c.get("frameType"),
                    "description": c.get("desc", ""),
                    "atk": c.get("atk"),
                    "def": c.get("def"),
                    "level": c.get("level"),
                    "race": c.get("race"),
                    "attribute": c.get("attribute"),
                    "archetype": c.get("archetype"),
                    "image_url": image_url,
                    "storage_image_path": storage_path,
                })

            success = self.upsert_cards_batch(records)
            current_progress = min(i + batch_size, total)
            if success:
                print(f"✅ Synced batch {current_progress}/{total} (Images stored: {uploaded_images_count})")
            else:
                print(f"⚠️ Failed batch at index {i}")

        print("🎉 Synchronization complete!")


def main():
    env = load_env()
    base_url = env.get("SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")

    if not base_url or not service_key:
        print("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined in .env")
        sys.exit(1)

    sync_engine = CardSynchronizer(base_url, service_key)

    # By default, sync metadata and upload images with rate limiting
    # Pass --metadata-only to quickly seed cards with image_url before downloading images
    metadata_only = "--metadata-only" in sys.argv
    limit = None
    for arg in sys.argv:
        if arg.startswith("--limit="):
            limit = int(arg.split("=")[1])

    sync_engine.sync(upload_images=not metadata_only, limit=limit)


if __name__ == "__main__":
    main()

