import { describe, it, expect } from 'vitest';
import React from 'react';
import {
  SettingsIcon,
  SurrenderIcon,
  InfoIcon,
  LogIcon,
  SwordsIcon,
  DeckCardsIcon,
  PvPIcon,
  LogoutIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
  CloseIcon,
  PlusIcon,
  MinusIcon,
  StarIcon,
  TrashIcon,
  SaveIcon,
  VolumeIcon,
  VolumeMuteIcon,
  GlobeIcon,
  CheckIcon,
} from './HudIcons';

describe('HudIcons - Tactical SVG Icon Suite', () => {
  it('should render SettingsIcon as an SVG with default or custom classes', () => {
    // Arrange
    const defaultIcon = SettingsIcon({});
    const customIcon = SettingsIcon({ className: 'w-6 h-6 custom-gear' });

    // Act & Assert
    expect(defaultIcon.type).toBe('svg');
    expect(defaultIcon.props.className).toBe('w-4 h-4');
    expect(defaultIcon.props.viewBox).toBe('0 0 24 24');

    expect(customIcon.props.className).toBe('w-6 h-6 custom-gear');
  });

  it('should render SurrenderIcon with waving flag vector paths', () => {
    // Arrange
    const icon = SurrenderIcon({ className: 'w-3.5 h-3.5 text-red-400' });

    // Act & Assert
    expect(icon.type).toBe('svg');
    expect(icon.props.className).toContain('text-red-400');
    expect(icon.props['aria-hidden']).toBe('true');
  });

  it('should render InfoIcon and LogIcon with proper geometric attributes', () => {
    // Arrange
    const info = InfoIcon({ className: 'w-4 h-4' });
    const log = LogIcon({ className: 'w-4 h-4' });

    // Act & Assert
    expect(info.type).toBe('svg');
    expect(log.type).toBe('svg');
    expect(info.props.viewBox).toBe('0 0 24 24');
    expect(log.props.viewBox).toBe('0 0 24 24');
  });

  it('should render game mode icons (SwordsIcon, PvPIcon, DeckCardsIcon)', () => {
    // Arrange
    const swords = SwordsIcon({ className: 'w-5 h-5' });
    const pvp = PvPIcon({ className: 'w-5 h-5' });
    const deck = DeckCardsIcon({ className: 'w-5 h-5' });

    // Act & Assert
    expect(swords.type).toBe('svg');
    expect(pvp.type).toBe('svg');
    expect(deck.type).toBe('svg');
    expect(swords.props.className).toBe('w-5 h-5');
    expect(pvp.props.className).toBe('w-5 h-5');
    expect(deck.props.className).toBe('w-5 h-5');
  });

  it('should render navigation and control icons (ChevronRight, ArrowLeft, Close, Plus, Minus)', () => {
    // Arrange
    const chevron = ChevronRightIcon({});
    const arrow = ArrowLeftIcon({});
    const close = CloseIcon({});
    const plus = PlusIcon({});
    const minus = MinusIcon({});

    // Act & Assert
    expect(chevron.type).toBe('svg');
    expect(arrow.type).toBe('svg');
    expect(close.type).toBe('svg');
    expect(plus.type).toBe('svg');
    expect(minus.type).toBe('svg');
  });

  it('should render storage and state icons (Star, Trash, Save, Logout, Check)', () => {
    // Arrange
    const star = StarIcon({ className: 'w-3.5 h-3.5 text-amber-400' });
    const trash = TrashIcon({});
    const save = SaveIcon({});
    const logout = LogoutIcon({});
    const check = CheckIcon({});

    // Act & Assert
    expect(star.type).toBe('svg');
    expect(star.props.fill).toBe('currentColor');
    expect(trash.type).toBe('svg');
    expect(save.type).toBe('svg');
    expect(logout.type).toBe('svg');
    expect(check.type).toBe('svg');
  });

  it('should render audio and localization icons (Volume, VolumeMute, Globe)', () => {
    // Arrange
    const volume = VolumeIcon({ className: 'w-5 h-5' });
    const mute = VolumeMuteIcon({ className: 'w-5 h-5' });
    const globe = GlobeIcon({ className: 'w-5 h-5' });

    // Act & Assert
    expect(volume.type).toBe('svg');
    expect(mute.type).toBe('svg');
    expect(globe.type).toBe('svg');
    expect(volume.props.className).toBe('w-5 h-5');
    expect(mute.props.className).toBe('w-5 h-5');
    expect(globe.props.className).toBe('w-5 h-5');
  });
});
