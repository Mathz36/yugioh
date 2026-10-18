/**
 * Client service to query Duelist Kingdom cards and catalog in TypeScript.
 * Author: Engineer Backend
 */

import { CardData } from './duel-types.js';

export interface DuelistKingdomFilter {
  type?: string;
  level?: number;
  attribute?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SupabaseCardRow {
  id: number;
  name: string;
  namePt?: string;
  type: string;
  level: number | null;
  atk: number | null;
  def: number | null;
  attribute: string | null;
  race: string | null;
  description: string;
  descriptionPt?: string;
  image_url: string;
  storage_image_path: string | null;
  is_duelist_kingdom?: boolean;
  era?: string;
  effect_type?: string | null;
  effect_definition?: any | null;
}

export class CardCatalogService {
  private readonly supabaseUrl: string;
  private readonly apiKey: string;

  constructor(supabaseUrl: string, apiKey: string) {
    this.supabaseUrl = supabaseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  /**
   * Fetches cards marked specifically as Duelist Kingdom era.
   */
  public async getDuelistKingdomCards(filter: DuelistKingdomFilter = {}): Promise<CardData[]> {
    const params = new URLSearchParams();
    params.set('is_duelist_kingdom', 'eq.true');
    params.set('order', 'name.asc');
    params.set('limit', String(filter.limit || 50));
    params.set('offset', String(filter.offset || 0));

    if (filter.type) {
      params.set('type', `eq.${filter.type}`);
    }
    if (filter.level !== undefined) {
      params.set('level', `eq.${filter.level}`);
    }
    if (filter.attribute) {
      params.set('attribute', `eq.${filter.attribute}`);
    }
    if (filter.search) {
      params.set('name', `ilike.*${filter.search}*`);
    }

    const url = `${this.supabaseUrl}/rest/v1/cards?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        apikey: this.apiKey,
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Duelist Kingdom cards: ${response.status} ${response.statusText}`);
    }

    const rows: SupabaseCardRow[] = await response.json();

    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      namePt: row.namePt,
      type: row.type,
      level: row.level || 0,
      attack: row.atk || 0,
      defense: row.def || 0,
      description: row.description,
      descriptionPt: row.descriptionPt,
      imageUrl: row.image_url,
      effectType: (row.effect_type as any) || undefined,
      effectDefinition: row.effect_definition || undefined,
    }));
  }
}

