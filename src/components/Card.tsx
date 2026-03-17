'use client';

import { Card as CardType, Suit, isRedSuit, getCardDisplay, getCardValue } from '@/game/types';

interface CardProps {
  card?: CardType;
  faceUp?: boolean;
  onClick?: () => void;
  selected?: boolean;
  small?: boolean;
  glow?: boolean;
  label?: string;
  className?: string;
}

const suitSymbols: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export default function CardComponent({
  card,
  faceUp = false,
  onClick,
  selected = false,
  small = false,
  glow = false,
  label,
  className = '',
}: CardProps) {
  const isRed = card ? isRedSuit(card.suit) : false;
  const w = small ? 'w-14 h-20' : 'w-[4.5rem] h-[6.5rem]';
  const fontSize = small ? 'text-sm' : 'text-lg';

  if (!faceUp || !card) {
    return (
      <button
        onClick={onClick}
        disabled={!onClick}
        className={`
          ${w} rounded-xl card-shadow relative
          bg-gradient-to-br from-card-back to-card-backDark
          border-2 border-white/20
          flex items-center justify-center
          transition-all duration-200
          ${onClick ? 'active:scale-95 hover:border-white/40 cursor-pointer' : ''}
          ${selected ? 'ring-2 ring-gold scale-105 border-gold' : ''}
          ${glow ? 'animate-pulse-glow' : ''}
          ${className}
        `}
      >
        <div className="absolute inset-2 rounded-lg border border-white/10 flex items-center justify-center">
          <span className="text-white/30 text-2xl font-bold">B</span>
        </div>
        {label && (
          <span className="absolute -bottom-5 text-[10px] text-white/60 whitespace-nowrap">{label}</span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`
        ${w} rounded-xl card-shadow-lg relative
        bg-card-face
        border-2 border-gray-300
        flex flex-col items-center justify-between p-1.5
        transition-all duration-200
        ${onClick ? 'active:scale-95 hover:shadow-xl cursor-pointer' : ''}
        ${selected ? 'ring-2 ring-gold scale-105' : ''}
        ${glow ? 'animate-pulse-glow' : ''}
        ${className}
      `}
    >
      <div className={`self-start ${fontSize} font-bold leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
        {card.rank}
        <div className="text-xs">{suitSymbols[card.suit]}</div>
      </div>
      <div className={`${small ? 'text-2xl' : 'text-3xl'} ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
        {suitSymbols[card.suit]}
      </div>
      <div className={`self-end ${fontSize} font-bold leading-none rotate-180 ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
        {card.rank}
        <div className="text-xs">{suitSymbols[card.suit]}</div>
      </div>
      {label && (
        <span className="absolute -bottom-5 text-[10px] text-gray-600 whitespace-nowrap">{label}</span>
      )}
    </button>
  );
}

export function CardStack({ count, label }: { count: number; label?: string }) {
  return (
    <div className="relative w-[4.5rem] h-[6.5rem]">
      {count > 2 && (
        <div className="absolute top-0 left-1 w-[4.5rem] h-[6.5rem] rounded-xl bg-gradient-to-br from-card-back to-card-backDark border border-white/10 card-shadow" />
      )}
      {count > 1 && (
        <div className="absolute top-0.5 left-0.5 w-[4.5rem] h-[6.5rem] rounded-xl bg-gradient-to-br from-card-back to-card-backDark border border-white/15 card-shadow" />
      )}
      {count > 0 ? (
        <div className="absolute top-1 left-0 w-[4.5rem] h-[6.5rem] rounded-xl bg-gradient-to-br from-card-back to-card-backDark border-2 border-white/20 card-shadow flex items-center justify-center">
          <div className="absolute inset-2 rounded-lg border border-white/10 flex items-center justify-center">
            <span className="text-white/40 text-lg font-bold">{count}</span>
          </div>
        </div>
      ) : (
        <div className="w-[4.5rem] h-[6.5rem] rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center">
          <span className="text-white/20 text-xs">Empty</span>
        </div>
      )}
      {label && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-white/60 whitespace-nowrap">{label}</span>
      )}
    </div>
  );
}
