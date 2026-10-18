-- Migration: Add Effect Definition Columns to Cards Table
-- Created by: engineer-backend

-- 1. Add effect_type and effect_definition columns to public.cards
ALTER TABLE public.cards
ADD COLUMN IF NOT EXISTS effect_type TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS effect_definition JSONB DEFAULT NULL;

-- 2. Indexes for effect queries and filtering
CREATE INDEX IF NOT EXISTS idx_cards_effect_type ON public.cards (effect_type);
CREATE INDEX IF NOT EXISTS idx_cards_effect_definition_gin ON public.cards USING gin (effect_definition);

-- 3. Populate first classic effect definitions for Starter Decks monsters

-- 3.1. Buster Blader (78193831): BOOST_ATK contínuo (+500 por Dragão)
UPDATE public.cards
SET 
  effect_type = 'CONTINUOUS',
  effect_definition = jsonb_build_object(
    'trigger', 'CONTINUOUS',
    'action', 'BOOST_ATK',
    'value', 500,
    'condition', jsonb_build_object(
      'target_race', 'Dragon',
      'locations', jsonb_build_array('OPPONENT_FIELD', 'OPPONENT_GRAVEYARD')
    ),
    'description_pt', 'Ganha 500 de ATK para cada monstro do Tipo Dragão que seu oponente controla ou que está no Cemitério dele.'
  ),
  updated_at = NOW()
WHERE id = 78193831;

-- 3.2. Man-Eater Bug (54652250): FLIP -> DESTROY_MONSTER
UPDATE public.cards
SET 
  effect_type = 'FLIP',
  effect_definition = jsonb_build_object(
    'trigger', 'FLIP',
    'action', 'DESTROY_MONSTER',
    'target_count', 1,
    'target_scope', 'FIELD',
    'description_pt', 'VIRE: Escolha 1 monstro no campo; destrua aquele alvo.'
  ),
  updated_at = NOW()
WHERE id = 54652250;

-- 3.3. Penguin Soldier (93920745): FLIP -> RETURN_TO_HAND
UPDATE public.cards
SET 
  effect_type = 'FLIP',
  effect_definition = jsonb_build_object(
    'trigger', 'FLIP',
    'action', 'RETURN_TO_HAND',
    'target_max_count', 2,
    'target_scope', 'FIELD',
    'description_pt', 'VIRE: Você pode escolher até 2 monstros no campo; devolva esses alvos para a mão.'
  ),
  updated_at = NOW()
WHERE id = 93920745;

-- 3.4. Kuriboh (40640057): HAND_TRIGGER -> PREVENT_DAMAGE
UPDATE public.cards
SET 
  effect_type = 'HAND_TRIGGER',
  effect_definition = jsonb_build_object(
    'trigger', 'HAND_TRIGGER',
    'action', 'PREVENT_DAMAGE',
    'activation_timing', 'DAMAGE_CALCULATION',
    'cost', 'DISCARD_SELF',
    'description_pt', 'Durante o cálculo de dano: você pode descartar este card da sua mão; você não sofre dano de batalha desta batalha.'
  ),
  updated_at = NOW()
WHERE id = 40640057;

-- 3.5. Time Wizard (71625222): IGNITION -> COIN_TOSS_CLEAR
UPDATE public.cards
SET 
  effect_type = 'IGNITION',
  effect_definition = jsonb_build_object(
    'trigger', 'IGNITION',
    'action', 'COIN_TOSS_CLEAR',
    'usage_per_turn', 1,
    'success_outcome', jsonb_build_object('action', 'DESTROY_ALL_OPPONENT_MONSTERS'),
    'failure_outcome', jsonb_build_object('action', 'DESTROY_ALL_USER_MONSTERS_AND_BURN_HALF_ATK'),
    'description_pt', 'Uma vez por turno: você pode lançar uma moeda e escolher cara ou coroa. Se acertar, destrua todos os monstros que seu oponente controla. Se errar, destrua o máximo de monstros que você controla possível e, se isso acontecer, sofra dano igual à metade do ATK total que esses monstros destruídos tinham no campo.'
  ),
  updated_at = NOW()
WHERE id = 71625222;
