/**
 * Wave 1 Duelist Kingdom Catalog Exporter
 *
 * Consolidates the static Wave 1 card library from Supabase:
 * - Selects cards where is_duelist_kingdom = true and (type = 'Normal Monster' OR has homologated backend effect).
 * - Maps to strict CardData interface from src/duel/duel-types.ts.
 * - Merges canonical Portuguese translations (namePt, descriptionPt) from CLASSIC_CARDS.
 * - Validates card integrity (id, name, imageUrl) to prevent corrupted entries.
 * - Exports sorted by name into client/src/data/duelist-kingdom-catalog.json.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { CardData, CardEffectDefinition, CardEffectType } from '../src/duel/duel-types.js';
import { CLASSIC_CARDS } from '../src/duel/starter-decks.js';

dotenv.config();

export interface DatabaseCardRow {
  id: number | string;
  name: string;
  type: string;
  atk: number | null;
  def: number | null;
  level: number | null;
  race: string | null;
  attribute: string | null;
  description: string | null;
  image_url: string | null;
  storage_image_path?: string | null;
  is_duelist_kingdom?: boolean | null;
  effect_type?: string | null;
  effect_definition?: CardEffectDefinition | null;
}

export class Wave1CatalogExporter {
  private readonly supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Fetches all Duelist Kingdom cards from Supabase database.
   */
  public async fetchDuelistKingdomCards(): Promise<DatabaseCardRow[]> {
    const { data, error } = await this.supabase
      .from('cards')
      .select('id, name, type, atk, def, level, race, attribute, description, image_url, effect_type, effect_definition')
      .eq('is_duelist_kingdom', true);

    if (error) {
      throw new Error(`Failed to query cards from Supabase: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error('No Duelist Kingdom cards found in Supabase.');
    }

    return data as DatabaseCardRow[];
  }

  /**
   * Builds quick lookup maps for classic cards by canonical ID, numeric ID, and lowercase name.
   */
  public buildClassicCardsLookup(): {
    byId: Map<string, CardData>;
    byName: Map<string, CardData>;
  } {
    const byId = new Map<string, CardData>();
    const byName = new Map<string, CardData>();

    for (const card of Object.values(CLASSIC_CARDS)) {
      byId.set(card.id, card);
      const numericId = parseInt(card.id, 10);
      if (!Number.isNaN(numericId)) {
        byId.set(String(numericId), card);
      }
      byName.set(card.name.toLowerCase().trim(), card);
    }

    return { byId, byName };
  }

  /**
   * Consolidates database records into strict CardData models.
   */
  public processCards(rows: DatabaseCardRow[]): CardData[] {
    const { byId, byName } = this.buildClassicCardsLookup();
    const processedMap = new Map<string, CardData>();

    for (const row of rows) {
      const rowIdStr = String(row.id);
      const rowNumericId = parseInt(rowIdStr, 10);
      const classicMatch =
        byId.get(rowIdStr) ||
        (!Number.isNaN(rowNumericId) ? byId.get(String(rowNumericId)) : undefined) ||
        (row.name ? byName.get(row.name.toLowerCase().trim()) : undefined);

      const isNormalMonster = row.type === 'Normal Monster';
      const hasHomologatedEffect = Boolean(
        row.effect_type ||
        row.effect_definition ||
        classicMatch?.effectDefinition
      );

      // Wave 1 includes Normal Monsters and cards with homologated backend effects
      if (!isNormalMonster && !hasHomologatedEffect) {
        continue;
      }

      const id = classicMatch?.id || rowIdStr;
      const name = (row.name || classicMatch?.name || '').trim();
      const imageUrl = (row.image_url || classicMatch?.imageUrl || '').trim();

      // Corrupted data guard: must have valid id, name, and image
      if (!id || !name || !imageUrl) {
        console.warn(`⚠️ Skipping corrupted card record: id=${id}, name="${name}", imageUrl="${imageUrl}"`);
        continue;
      }

      const card: CardData = {
        id,
        name,
        type: row.type || classicMatch?.type || 'Normal Monster',
        level: typeof row.level === 'number' ? row.level : classicMatch?.level ?? 0,
        attack: typeof row.atk === 'number' ? row.atk : classicMatch?.attack ?? 0,
        defense: typeof row.def === 'number' ? row.def : classicMatch?.defense ?? 0,
        description: row.description || classicMatch?.description || '',
        imageUrl,
      };

      if (row.race || classicMatch?.race) {
        card.race = row.race || classicMatch?.race;
      }

      if (row.attribute || classicMatch?.attribute) {
        card.attribute = row.attribute || classicMatch?.attribute;
      }

      if (classicMatch?.namePt) {
        card.namePt = classicMatch.namePt;
      }

      if (classicMatch?.descriptionPt) {
        card.descriptionPt = classicMatch.descriptionPt;
      }

      const effectType = (classicMatch?.effectType || row.effect_type) as CardEffectType | undefined;
      if (effectType) {
        card.effectType = effectType;
      }

      const effectDefinition = classicMatch?.effectDefinition || row.effect_definition;
      if (effectDefinition) {
        card.effectDefinition = effectDefinition;
      }

      processedMap.set(card.id, card);
    }

    // Sort alphabetically by name
    const catalog = Array.from(processedMap.values());
    catalog.sort((a, b) => a.name.localeCompare(b.name));

    return catalog;
  }

  /**
   * Saves the consolidated catalog to target JSON file.
   */
  public saveToFile(catalog: CardData[], outputPath: string): void {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const jsonString = JSON.stringify(catalog, null, 2);
    fs.writeFileSync(outputPath, jsonString, 'utf-8');
  }
}

/**
 * Main execution function
 */
export async function exportWave1Catalog(
  outputPath = path.resolve(process.cwd(), 'client/src/data/duelist-kingdom-catalog.json')
): Promise<{ count: number; outputPath: string }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.');
  }

  console.log('🔌 Connecting to Supabase...');
  const supabase = createClient(supabaseUrl, supabaseKey);
  const exporter = new Wave1CatalogExporter(supabase);

  console.log('📥 Fetching Duelist Kingdom cards...');
  const rows = await exporter.fetchDuelistKingdomCards();
  console.log(`   Found ${rows.length} total Duelist Kingdom cards.`);

  console.log('⚙️ Processing Wave 1 catalog (Normal Monsters + Homologated Effects)...');
  const catalog = exporter.processCards(rows);

  console.log(`📊 Validated and consolidated ${catalog.length} Wave 1 cards.`);

  // Validation checks
  const corrupted = catalog.filter((c) => !c.id || !c.name || !c.imageUrl);
  if (corrupted.length > 0) {
    throw new Error(`Data corruption detected: ${corrupted.length} cards have missing id, name or imageUrl.`);
  }

  if (catalog.length <= 200) {
    throw new Error(`Expected more than 200 cards in Wave 1 catalog, got ${catalog.length}.`);
  }

  console.log(`💾 Writing catalog to ${outputPath}...`);
  exporter.saveToFile(catalog, outputPath);
  console.log(`✅ Wave 1 catalog successfully generated at ${outputPath} with ${catalog.length} cards!`);

  return { count: catalog.length, outputPath };
}

// Auto-run if executed directly via CLI
if (process.argv[1]?.includes('export-wave1-catalog.ts')) {
  exportWave1Catalog()
    .then(({ count, outputPath }) => {
      console.log(`🎉 Finished successfully: ${count} cards saved to ${outputPath}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Export failed:', err);
      process.exit(1);
    });
}
