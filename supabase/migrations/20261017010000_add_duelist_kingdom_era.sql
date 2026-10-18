-- Migration: Add Duelist Kingdom Era Columns and Indexes
-- Created by: engineer-backend

-- 1. Add is_duelist_kingdom and era columns to public.cards
ALTER TABLE public.cards
ADD COLUMN IF NOT EXISTS is_duelist_kingdom BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS era TEXT DEFAULT 'CLASSIC';

-- 2. Add performance indexes for era-based queries and deck-builder filtering
CREATE INDEX IF NOT EXISTS idx_cards_is_duelist_kingdom ON public.cards (is_duelist_kingdom);
CREATE INDEX IF NOT EXISTS idx_cards_era ON public.cards (era);
CREATE INDEX IF NOT EXISTS idx_cards_duelist_kingdom_type ON public.cards (is_duelist_kingdom, type);
CREATE INDEX IF NOT EXISTS idx_cards_duelist_kingdom_level ON public.cards (is_duelist_kingdom, level);

