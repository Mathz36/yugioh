/**
 * Yu-Gi-Oh Card Synchronizer from YGOPRODeck API to Supabase
 * Author: Engineer Backend
 *
 * Rules:
 * - Rate limit: max 5 requests per second (200ms interval)
 * - Filtering: Classic cards only (Normal, Effect, Spell, Trap)
 * - Blacklist: No Fusion monsters, No Exodia parts/cards, No Egyptian God cards
 * - Storage: Upload images to Supabase Storage ('card-images' bucket)
 * - Database: Upsert metadata into 'public.cards' table
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// --- Domain Models & Interfaces ---
export interface YGOPROCardImage {
  id: number;
  image_url: string;
  image_url_small: string;
  image_url_cropped: string;
}

export interface YGOPROCard {
  id: number;
  name: string;
  type: string;
  frameType?: string;
  desc: string;
  atk?: number;
  def?: number;
  level?: number;
  race?: string;
  attribute?: string;
  archetype?: string;
  card_images?: YGOPROCardImage[];
}

export interface DatabaseCard {
  id: number;
  name: string;
  type: string;
  frame_type: string | null;
  description: string;
  atk: number | null;
  def: number | null;
  level: number | null;
  race: string | null;
  attribute: string | null;
  archetype: string | null;
  image_url: string;
  storage_image_path: string | null;
  updated_at: string;
}

// --- Rate Limiter (Token Bucket / Interval Queue) ---
export class RateLimiter {
  private queue: (() => Promise<void>)[] = [];
  private active = false;
  private readonly delayMs: number;

  constructor(requestsPerSecond: number = 5) {
    this.delayMs = Math.ceil(1000 / requestsPerSecond);
  }

  public async schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.active) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.active = false;
      return;
    }

    this.active = true;
    const task = this.queue.shift();
    if (task) {
      try {
        await task();
      } catch (err) {
        console.error('Error running rate-limited task:', err);
      }
    }

    setTimeout(() => {
      this.processQueue();
    }, this.delayMs);
  }
}

// --- Card Filter & Blacklist Service ---
export class CardFilterService {
  private static readonly EXODIA_CARD_IDS = new Set<number>([
    33396948, // Exodia the Forbidden One
    70903634, // Right Arm of the Forbidden One
    7902349,  // Left Arm of the Forbidden One
    8124921,  // Right Leg of the Forbidden One
    44519536, // Left Leg of the Forbidden One
  ]);

  private static readonly EGYPTIAN_GOD_CARD_IDS = new Set<number>([
    10000000, // Obelisk the Tormentor
    10000010, // Slifer the Sky Dragon
    10000020, // The Winged Dragon of Ra
    10000040, // Holactie the Creator of Light
    10000080, // The Winged Dragon of Ra - Sphere Mode
    10000090, // The Winged Dragon of Ra - Immortal Phoenix
  ]);

  private static readonly ALLOWED_TYPES = new Set<string>([
    'Normal Monster',
    'Normal Tuner Monster',
    'Effect Monster',
    'Tuner Monster',
    'Flip Effect Monster',
    'Gemini Monster',
    'Spirit Monster',
    'Toon Monster',
    'Union Effect Monster',
    'Spell Card',
    'Trap Card',
  ]);

  /**
   * Evaluates if a card belongs to the classic pool and does not violate the blacklist
   */
  public static isAllowed(card: YGOPROCard): boolean {
    // 1. Blacklist check: Fusion monsters
    if (
      card.type.toLowerCase().includes('fusion') ||
      card.frameType?.toLowerCase() === 'fusion'
    ) {
      return false;
    }

    // 2. Blacklist check: Exodia pieces & variants
    if (this.EXODIA_CARD_IDS.has(card.id)) {
      return false;
    }
    const lowerName = card.name.toLowerCase();
    if (lowerName.includes('exodia') || lowerName.includes('forbidden one')) {
      return false;
    }

    // 3. Blacklist check: Egyptian Gods / Divine Beasts
    if (this.EGYPTIAN_GOD_CARD_IDS.has(card.id)) {
      return false;
    }
    if (card.race?.toLowerCase() === 'divine-beast' || card.attribute?.toLowerCase() === 'divine') {
      return false;
    }
    if (
      lowerName.includes('slifer the sky dragon') ||
      lowerName.includes('obelisk the tormentor') ||
      lowerName.includes('winged dragon of ra')
    ) {
      return false;
    }

    // 4. Allowed classic card types
    if (!this.ALLOWED_TYPES.has(card.type)) {
      return false;
    }

    return true;
  }
}

// --- Card Sync Engine ---
export class CardSyncEngine {
  private readonly supabase: SupabaseClient;
  private readonly rateLimiter: RateLimiter;
  private readonly bucketName = 'card-images';

  constructor(supabase: SupabaseClient, rateLimiter: RateLimiter) {
    this.supabase = supabase;
    this.rateLimiter = rateLimiter;
  }

  /**
   * Fetches card metadata from YGOPRODeck API
   */
  public async fetchCards(): Promise<YGOPROCard[]> {
    console.log('📡 Fetching cards from YGOPRODeck API...');
    const url = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (YuGiOh-Sync/1.0)' },
    });

    if (!response.ok) {
      throw new Error(`YGOPRODeck API request failed with status: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.data as YGOPROCard[];
  }

  /**
   * Downloads an image and uploads it to Supabase Storage with rate-limiting
   */
  public async uploadCardImage(cardId: number, imageUrl: string): Promise<string | null> {
    const filePath = `cards/${cardId}.jpg`;

    return this.rateLimiter.schedule(async () => {
      try {
        // Download image buffer
        const imgResponse = await fetch(imageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!imgResponse.ok) {
          console.warn(`⚠️ Failed to download image for card ${cardId}: ${imgResponse.statusText}`);
          return null;
        }

        const arrayBuffer = await imgResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to Supabase Storage
        const { error } = await this.supabase.storage
          .from(this.bucketName)
          .upload(filePath, buffer, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (error) {
          console.error(`❌ Supabase upload failed for card ${cardId}:`, error.message);
          return null;
        }

        return filePath;
      } catch (error) {
        console.error(`❌ Unexpected error uploading image for card ${cardId}:`, error);
        return null;
      }
    });
  }

  /**
   * Synchronizes metadata and assets into Supabase
   */
  public async sync(options: { maxCards?: number; uploadImages?: boolean } = {}): Promise<void> {
    const rawCards = await this.fetchCards();
    console.log(`📦 Total cards retrieved from API: ${rawCards.length}`);

    // Filter cards
    const filteredCards = rawCards.filter((card) => CardFilterService.isAllowed(card));
    console.log(`✨ Total eligible classic cards after filtering and blacklist: ${filteredCards.length}`);

    const targetCards = options.maxCards ? filteredCards.slice(0, options.maxCards) : filteredCards;
    console.log(`🚀 Processing ${targetCards.length} cards...`);

    const batchSize = 50;
    for (let i = 0; i < targetCards.length; i += batchSize) {
      const batch = targetCards.slice(i, i + batchSize);
      const records: DatabaseCard[] = [];

      for (const card of batch) {
        const imageUrl = card.card_images?.[0]?.image_url || '';
        let storagePath: string | null = null;

        if (options.uploadImages && imageUrl) {
          storagePath = await this.uploadCardImage(card.id, imageUrl);
        }

        records.push({
          id: card.id,
          name: card.name,
          type: card.type,
          frame_type: card.frameType || null,
          description: card.desc,
          atk: card.atk ?? null,
          def: card.def ?? null,
          level: card.level ?? null,
          race: card.race || null,
          attribute: card.attribute || null,
          archetype: card.archetype || null,
          image_url: imageUrl,
          storage_image_path: storagePath,
          updated_at: new Date().toISOString(),
        });
      }

      // Upsert into Supabase database
      const { error } = await this.supabase
        .from('cards')
        .upsert(records, { onConflict: 'id' });

      if (error) {
        console.error(`❌ Error upserting batch ${i} - ${i + batch.length}:`, error.message);
      } else {
        console.log(`✅ Upserted cards batch ${i + 1} to ${i + records.length} of ${targetCards.length}`);
      }
    }

    console.log('🎉 Card synchronization finished successfully!');
  }
}

// --- Entry point ---
async function main(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.');
    console.log('💡 Please create a .env file with your Supabase credentials (see .env.example).');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const rateLimiter = new RateLimiter(5); // 5 req/s as requested
  const engine = new CardSyncEngine(supabase, rateLimiter);

  const args = process.argv.slice(2);
  let limit: number | undefined;
  let uploadImages = true;

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--metadata-only') {
      uploadImages = false;
    }
  }

  console.log(`Starting sync (limit: ${limit ?? 'all'}, uploadImages: ${uploadImages})...`);
  await engine.sync({ maxCards: limit, uploadImages });
}

if (process.argv[1]?.includes('sync-cards.ts')) {
  main().catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}

