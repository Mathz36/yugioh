-- Migration: Initial Schema for Yu-Gi-Oh Cards, User Inventory and Decks
-- Created by engineer-backend

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Cards Table (Catalog of all synchronized cards)
CREATE TABLE IF NOT EXISTS public.cards (
    id BIGINT PRIMARY KEY, -- YGOPRODeck card ID
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    frame_type TEXT,
    description TEXT NOT NULL,
    atk INTEGER,
    def INTEGER,
    level INTEGER,
    race TEXT,
    attribute TEXT,
    archetype TEXT,
    image_url TEXT NOT NULL, -- Remote or CDN URL
    storage_image_path TEXT, -- Supabase storage object path
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index for search and filtering
CREATE INDEX IF NOT EXISTS idx_cards_name ON public.cards (name);
CREATE INDEX IF NOT EXISTS idx_cards_type ON public.cards (type);
CREATE INDEX IF NOT EXISTS idx_cards_level ON public.cards (level);
CREATE INDEX IF NOT EXISTS idx_cards_attribute ON public.cards (attribute);
CREATE INDEX IF NOT EXISTS idx_cards_race ON public.cards (race);

-- 2. User Cards (Inventory / Collection of cards owned by a user)
CREATE TABLE IF NOT EXISTS public.user_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id BIGINT NOT NULL REFERENCES public.cards(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT uq_user_card UNIQUE (user_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_user_cards_user_id ON public.user_cards (user_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_card_id ON public.user_cards (card_id);

-- 3. Decks Table
CREATE TABLE IF NOT EXISTS public.decks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
    description TEXT,
    is_active BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decks_user_id ON public.decks (user_id);

-- 4. Deck Cards Table (Relationship between decks and cards)
CREATE TABLE IF NOT EXISTS public.deck_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
    card_id BIGINT NOT NULL REFERENCES public.cards(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 3),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT uq_deck_card UNIQUE (deck_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_deck_cards_deck_id ON public.deck_cards (deck_id);
CREATE INDEX IF NOT EXISTS idx_deck_cards_card_id ON public.deck_cards (card_id);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
-- Cards: Anyone can read cards (public catalog)
CREATE POLICY "Cards are viewable by everyone" 
    ON public.cards FOR SELECT 
    USING (true);

-- User Cards: Users can only view and manage their own inventory
CREATE POLICY "Users can view own cards" 
    ON public.user_cards FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cards" 
    ON public.user_cards FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cards" 
    ON public.user_cards FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cards" 
    ON public.user_cards FOR DELETE 
    USING (auth.uid() = user_id);

-- Decks: Users can only manage their own decks
CREATE POLICY "Users can view own decks" 
    ON public.decks FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own decks" 
    ON public.decks FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own decks" 
    ON public.decks FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own decks" 
    ON public.decks FOR DELETE 
    USING (auth.uid() = user_id);

-- Deck Cards: Users can only view/manage cards in decks they own
CREATE POLICY "Users can view deck cards of their own decks" 
    ON public.deck_cards FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.decks 
            WHERE decks.id = deck_cards.deck_id 
            AND decks.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert deck cards to their own decks" 
    ON public.deck_cards FOR INSERT 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.decks 
            WHERE decks.id = deck_cards.deck_id 
            AND decks.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update deck cards in their own decks" 
    ON public.deck_cards FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM public.decks 
            WHERE decks.id = deck_cards.deck_id 
            AND decks.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete deck cards from their own decks" 
    ON public.deck_cards FOR DELETE 
    USING (
        EXISTS (
            SELECT 1 FROM public.decks 
            WHERE decks.id = deck_cards.deck_id 
            AND decks.user_id = auth.uid()
        )
    );

-- Storage bucket for card images
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-images', 'card-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public access policy for card images bucket
CREATE POLICY "Public Access for Card Images" 
    ON storage.objects FOR SELECT 
    USING (bucket_id = 'card-images');

