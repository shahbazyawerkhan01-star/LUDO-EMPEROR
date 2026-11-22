import React, { useEffect, useRef, useState } from 'react';
import { HOW_TO_PLAY_CARDS, translate } from '../i18n';
import { useGameStore } from '../state/store';

export const TutorialModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const language = useGameStore((s) => s.prefs.language);
  const [cardIdx, setCardIdx] = useState(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);

  const totalCards = HOW_TO_PLAY_CARDS.length;
  const card = HOW_TO_PLAY_CARDS[cardIdx] || HOW_TO_PLAY_CARDS[0];
  const isFirst = cardIdx === 0;
  const isLast = cardIdx === totalCards - 1;
  const firstRulesIdx = Math.max(
    0,
    HOW_TO_PLAY_CARDS.findIndex((c) => c.section === 'rules'),
  );

  // Reset card scroll to top whenever the active slide changes
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [cardIdx]);

  // Keyboard navigation: ArrowLeft, ArrowRight, Space, Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (cardIdx < totalCards - 1) {
          setCardIdx((prev) => Math.min(totalCards - 1, prev + 1));
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCardIdx((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cardIdx, totalCards, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const deltaX = endX - touchStartX.current;
    touchStartX.current = null;
    if (deltaX < -50 && !isLast) {
      setCardIdx((prev) => Math.min(totalCards - 1, prev + 1));
    } else if (deltaX > 50 && !isFirst) {
      setCardIdx((prev) => Math.max(0, prev - 1));
    }
  };

  const titleText = card.titleKey ? translate(language, card.titleKey) : card.title;
  const descText = card.descKey ? translate(language, card.descKey) : card.desc;

  return (
    <div
      id="guide-popup"
      role="dialog"
      aria-modal="true"
      aria-label={translate(language, 'guide_title')}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="royal-modal-card flex max-h-[90vh] w-full max-w-[460px] flex-col space-y-3 sm:max-w-[640px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <h2 className="royal-modal-title text-lg sm:text-xl">
          📖 {translate(language, 'guide_title')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-full border border-white/25 bg-white/10 px-3 py-1 font-display text-xs font-bold tracking-wider text-white/90 uppercase transition hover:bg-white/20"
        >
          {translate(language, 'skip')}
        </button>
      </div>

      {/* 2 Quick-Jump Section Tabs */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setCardIdx(0)}
          className="cursor-pointer rounded-xl px-3 py-2 font-display text-xs font-bold transition sm:text-sm"
          style={{
            background: card.section === 'walkthrough' ? '#f1c40f' : 'rgba(255,255,255,0.07)',
            color: card.section === 'walkthrough' ? '#000' : 'rgba(255,255,255,0.8)',
            border:
              card.section === 'walkthrough'
                ? '1px solid #ffe57f'
                : '1px solid rgba(255,255,255,0.16)',
          }}
        >
          {translate(language, 'tab_walkthrough')}
        </button>
        <button
          type="button"
          onClick={() => setCardIdx(firstRulesIdx)}
          className="cursor-pointer rounded-xl px-3 py-2 font-display text-xs font-bold transition sm:text-sm"
          style={{
            background: card.section === 'rules' ? '#f1c40f' : 'rgba(255,255,255,0.07)',
            color: card.section === 'rules' ? '#000' : 'rgba(255,255,255,0.8)',
            border:
              card.section === 'rules'
                ? '1px solid #ffe57f'
                : '1px solid rgba(255,255,255,0.16)',
          }}
        >
          {translate(language, 'tab_rules')}
        </button>
      </div>

      {/* Scrollable Card Body */}
      <div
        ref={bodyRef}
        className="modal-scroll flex-1 overflow-y-auto rounded-2xl border bg-white/5 p-4 text-center sm:p-5"
        style={{
          borderColor: `${card.accent}55`,
          boxShadow: `inset 0 0 28px ${card.accent}12`,
        }}
      >
        <span
          className="inline-block rounded-full border px-3 py-1 font-display text-[11px] font-bold tracking-wider uppercase"
          style={{
            color: card.accent,
            borderColor: `${card.accent}66`,
            backgroundColor: `${card.accent}1a`,
          }}
        >
          {card.badge}
        </span>

        <div className="my-2.5 text-4xl sm:text-5xl">{card.icon}</div>

        <h3
          className="font-display text-lg font-bold sm:text-xl"
          style={{
            color: card.accent,
            textShadow: `0 0 14px ${card.accent}44`,
          }}
        >
          {titleText}
        </h3>

        <p className="mt-2 text-sm leading-relaxed text-white/85">{descText}</p>

        {card.bullets && card.bullets.length > 0 && (
          <ul className="mt-3 space-y-1.5 rounded-xl border border-white/12 bg-black/35 p-3 text-left text-xs leading-relaxed text-white/85 sm:text-[13px]">
            {card.bullets.map((line, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 font-bold" style={{ color: card.accent }}>
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Slider Controls + 17 Clickable Dots */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={isFirst}
          onClick={() => setCardIdx((prev) => Math.max(0, prev - 1))}
          className="rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 font-display text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-35 enabled:cursor-pointer enabled:hover:bg-white/20"
        >
          ← {translate(language, 'prev_btn')}
        </button>

        <div className="flex flex-wrap items-center justify-center gap-1" aria-label="Slide pagination">
          {HOW_TO_PLAY_CARDS.map((c, idx) => {
            const active = idx === cardIdx;
            return (
              <button
                key={c.id}
                type="button"
                aria-label={`Slide ${idx + 1}`}
                aria-current={active ? 'step' : undefined}
                onClick={() => setCardIdx(idx)}
                className="h-2 cursor-pointer rounded-full transition-all"
                style={{
                  width: active ? '18px' : '7px',
                  backgroundColor: active ? card.accent : 'rgba(255,255,255,0.28)',
                }}
              />
            );
          })}
        </div>

        <button
          type="button"
          disabled={isLast}
          onClick={() => setCardIdx((prev) => Math.min(totalCards - 1, prev + 1))}
          className="rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 font-display text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-35 enabled:cursor-pointer enabled:hover:bg-white/20"
        >
          {translate(language, 'next_btn')} →
        </button>
      </div>

      {/* Full-Width Primary CTA */}
      <button
        type="button"
        onClick={() => {
          if (isLast) {
            onClose();
          } else {
            setCardIdx((prev) => Math.min(totalCards - 1, prev + 1));
          }
        }}
        className="w-full cursor-pointer rounded-xl py-2.5 font-display text-sm font-bold tracking-wide text-black shadow-lg transition hover:brightness-110 sm:text-base"
        style={{
          background: isLast
            ? 'linear-gradient(135deg, #2ecc71, #27ae60)'
            : 'linear-gradient(135deg, #f1c40f, #f39c12)',
          color: isLast ? '#ffffff' : '#000000',
        }}
      >
        {isLast
          ? `🚀 ${translate(language, 'lets_play')}`
          : `${translate(language, 'next_btn').toUpperCase()} (${cardIdx + 1}/${totalCards}) →`}
      </button>
    </div>
  );
};
