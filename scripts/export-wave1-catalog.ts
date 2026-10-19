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

export const SUB_WAVE_2A_METADATA: Record<string, { effectType: CardEffectType; effectDefinition: CardEffectDefinition; namePt?: string }> = {
  // Dian Keto the Cure Master (84257640)
  '84257640': {
    namePt: 'Dian Keto, o Mestre da Cura',
    effectType: 'NORMAL',
    effectDefinition: {
      action: 'GAIN_LP',
      value: 1000,
      description_pt: 'Aumente seus Pontos de Vida em 1000.',
    },
  },
  // Sparks (76103675)
  '76103675': {
    namePt: 'Faíscas',
    effectType: 'NORMAL',
    effectDefinition: {
      action: 'INFLICT_DAMAGE',
      value: 200,
    },
  },
  // Hinotama (46130346)
  '46130346': {
    namePt: 'Hinotama',
    effectType: 'NORMAL',
    effectDefinition: {
      action: 'INFLICT_DAMAGE',
      value: 500,
    },
  },
  // Raimei (56260110)
  '56260110': {
    namePt: 'Raimei',
    effectType: 'NORMAL',
    effectDefinition: {
      action: 'INFLICT_DAMAGE',
      value: 300,
    },
  },
  // Final Flame (73134082)
  '73134082': {
    namePt: 'Chama Final',
    effectType: 'NORMAL',
    effectDefinition: {
      action: 'INFLICT_DAMAGE',
      value: 600,
    },
  },
  // Ookazi (19523799)
  '19523799': {
    namePt: 'Ookazi',
    effectType: 'NORMAL',
    effectDefinition: {
      action: 'INFLICT_DAMAGE',
      value: 800,
    },
  },
  // De-Spell (19159413)
  '19159413': {
    namePt: 'Desencantar',
    effectType: 'NORMAL',
    effectDefinition: {
      action: 'DESTROY_SPELL_TRAP',
      target: {
        scope: 'OPPONENT_SPELL_TRAP',
        maxTargets: 1,
      },
    },
  },
  // --- Grupo A ---
  // Raigeki (12580477)
  '12580477': {
    namePt: 'Raigeki',
    effectType: 'NORMAL',
    effectDefinition: {
      action: 'DESTROY_OPPONENT_MONSTERS',
      description_pt: 'Destrua todos os monstros que seu oponente controla.',
    },
  },
  // Mirror Force (44095762)
  '44095762': {
    namePt: 'Força do Espelho',
    effectType: 'TRIGGER',
    effectDefinition: {
      trigger: 'TRIGGER',
      action: 'TRIGGER_ON_ATTACK_MIRROR_FORCE',
      description_pt: 'Quando um monstro do oponente declarar um ataque: Destrua todos os monstros em Posição de Ataque do seu oponente.',
    },
  },
  // Waboku (12607053)
  '12607053': {
    namePt: 'Waboku',
    effectType: 'TRIGGER',
    effectDefinition: {
      trigger: 'TRIGGER',
      action: 'PREVENT_BATTLE_DAMAGE_TURN',
      description_pt: 'Você não sofre dano de batalha neste turno. Seus monstros não podem ser destruídos em batalha neste turno.',
    },
  },
  // Reinforcements (17814387)
  '17814387': {
    namePt: 'Reforços',
    effectType: 'TRIGGER',
    effectDefinition: {
      trigger: 'TRIGGER',
      action: 'BOOST_ATK_TRAP',
      value: 500,
      description_pt: 'Aumente o ATK de 1 monstro virado para cima no campo em 500 pontos até o fim deste turno.',
    },
  },
  // Castle Walls (44209392)
  '44209392': {
    namePt: 'Muralhas do Castelo',
    effectType: 'TRIGGER',
    effectDefinition: {
      trigger: 'TRIGGER',
      action: 'BOOST_DEF_TRAP',
      value: 500,
      description_pt: 'Aumente a DEF de 1 monstro virado para cima no campo em 500 pontos até o fim deste turno.',
    },
  },
};

export const GROUP_A_METADATA = SUB_WAVE_2A_METADATA;

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

      const subWave2AMatch =
        SUB_WAVE_2A_METADATA[rowIdStr] ||
        (!Number.isNaN(rowNumericId) ? SUB_WAVE_2A_METADATA[String(rowNumericId)] : undefined) ||
        (row.name ? Object.entries(SUB_WAVE_2A_METADATA).find(([_, meta]) => meta.namePt?.toLowerCase() === row.name.toLowerCase() || row.name.toLowerCase().includes('dian keto'))?.[1] : undefined);

      const isNormalMonster = row.type === 'Normal Monster';
      const hasHomologatedEffect = Boolean(
        row.effect_type ||
        row.effect_definition ||
        classicMatch?.effectDefinition ||
        subWave2AMatch?.effectDefinition
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

      if (subWave2AMatch?.namePt || classicMatch?.namePt) {
        card.namePt = subWave2AMatch?.namePt || classicMatch?.namePt;
      }

      if (classicMatch?.descriptionPt) {
        card.descriptionPt = classicMatch.descriptionPt;
      }

      const effectType = (subWave2AMatch?.effectType || classicMatch?.effectType || row.effect_type) as CardEffectType | undefined;
      if (effectType) {
        card.effectType = effectType;
      }

      const effectDefinition = subWave2AMatch?.effectDefinition || classicMatch?.effectDefinition || row.effect_definition;
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
