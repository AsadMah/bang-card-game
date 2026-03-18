'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { ClientGameState, Card, ClientPlayer, getCardDisplay, getCardValue, isRedSuit } from '@/game/types';
import CardComponent, { CardStack } from '@/components/Card';

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;

  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [drawnCard, setDrawnCard] = useState<Card | null>(null);
  const [selectedHandIndex, setSelectedHandIndex] = useState<number | null>(null);
  const [previewTimer, setPreviewTimer] = useState(5);
  const [notification, setNotification] = useState('');
  const [peekCard, setPeekCard] = useState<Card | null>(null);
  const [peekLabel, setPeekLabel] = useState('');
  const [swapStep, setSwapStep] = useState<'selectOwn' | 'selectPlayer' | 'selectTarget' | null>(null);
  const [swapOwnIndex, setSwapOwnIndex] = useState<number | null>(null);
  const [swapTargetPlayer, setSwapTargetPlayer] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<{ success: boolean; message: string } | null>(null);
  const [matchMode, setMatchMode] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const socket = getSocket();

    socket.on('game-state', (state: ClientGameState) => {
      setGameState(state);

      if (state.turnPhase === 'draw') {
        setDrawnCard(null);
        setSelectedHandIndex(null);
        setSwapStep(null);
        setSwapOwnIndex(null);
        setSwapTargetPlayer(null);
        setMatchMode(false);
      }
    });

    // Request current state on mount
    socket.emit('get-state', { roomCode }, (res: any) => {
      if (res.success) {
        setGameState(res.state);
      }
    });

    return () => {
      socket.off('game-state');
    };
  }, [roomCode]);

  useEffect(() => {
    if (gameState?.phase === 'preview') {
      setPreviewTimer(5);
      timerRef.current = setInterval(() => {
        setPreviewTimer(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [gameState?.phase, gameState?.roundNumber]);

  const showNotification = useCallback((msg: string, duration = 2000) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), duration);
  }, []);

  const isMyTurn = gameState ? gameState.currentPlayerIndex === gameState.myIndex : false;
  const myPlayer = gameState?.players[gameState.myIndex];
  const currentTurnPlayer = gameState?.players[gameState.currentPlayerIndex];

  const handleStartGame = () => {
    getSocket().emit('start-game', {}, (res: any) => {
      if (!res.success) showNotification(res.error);
    });
  };

  const handleDraw = (fromDiscard: boolean) => {
    getSocket().emit('draw-card', { fromDiscard }, (res: any) => {
      if (res.success) {
        setDrawnCard(res.card);
      } else {
        showNotification(res.error);
      }
    });
  };

  const handleKeep = (index: number) => {
    const cardInfo = drawnCard ? getCardDisplay(drawnCard) : '';
    getSocket().emit('keep-card', { handIndex: index }, (res: any) => {
      if (res.success) {
        setDrawnCard(null);
        setSelectedHandIndex(null);
        showNotification(`Swapped card ${index + 1} with ${cardInfo}`);
      } else {
        showNotification(res.error);
      }
    });
  };

  const handleDiscard = () => {
    getSocket().emit('discard-card', {}, (res: any) => {
      if (res.success) {
        setDrawnCard(null);
        if (res.specialEffect) {
          // Special action phase will be handled by game state update
        }
      } else {
        showNotification(res.error);
      }
    });
  };

  const handleSpecialAction = (action: any) => {
    getSocket().emit('special-action', action, (res: any) => {
      if (res.success) {
        if (res.revealedCard) {
          setPeekCard(res.revealedCard);
          const effectType = gameState?.specialActionData?.type;
          if (effectType === 'peek_self') setPeekLabel('Your card');
          else if (effectType === 'peek_left') setPeekLabel("Left player's card");
          else if (effectType === 'peek_right') setPeekLabel("Right player's card");
          setTimeout(() => { setPeekCard(null); setPeekLabel(''); }, 3000);
        }
      } else {
        showNotification(res.error);
      }
    });
  };

  const handleSwapAction = () => {
    if (swapOwnIndex !== null && swapTargetPlayer && selectedHandIndex !== null) {
      handleSpecialAction({
        cardIndex: swapOwnIndex,
        targetPlayerId: swapTargetPlayer,
        targetCardIndex: selectedHandIndex,
      });
      setSwapStep(null);
      setSwapOwnIndex(null);
      setSwapTargetPlayer(null);
      setSelectedHandIndex(null);
    }
  };

  const handleMatchDiscard = (cardIndex: number) => {
    getSocket().emit('match-discard', { cardIndex }, (res: any) => {
      if (res.matchSuccess) {
        setMatchResult({ success: true, message: 'Match! Card discarded.' });
      } else {
        setMatchResult({ success: false, message: 'Wrong! Penalty card added.' });
      }
      setTimeout(() => setMatchResult(null), 2500);
    });
  };

  const handleCallBang = () => {
    getSocket().emit('call-bang', {}, (res: any) => {
      if (!res.success) showNotification(res.error);
    });
  };

  const handleNextRound = () => {
    getSocket().emit('next-round', {}, (res: any) => {
      if (!res.success) showNotification(res.error);
    });
  };

  if (!gameState) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-white/60 text-lg">Connecting...</div>
      </div>
    );
  }

  // LOBBY
  if (gameState.phase === 'lobby') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <h1 className="text-4xl font-black text-center mb-2">
            <span className="text-gold">B</span>ANG<span className="text-gold">!</span>
          </h1>

          <div className="glass rounded-2xl p-6 mb-4">
            <div className="text-center mb-4">
              <p className="text-white/60 text-sm">Room Code</p>
              <p className="text-4xl font-black tracking-[0.3em] text-gold">{roomCode}</p>
              <p className="text-white/40 text-xs mt-1">Share this code with friends</p>
            </div>

            <div className="space-y-2">
              <p className="text-white/60 text-sm">Players ({gameState.players.length}/6)</p>
              {gameState.players.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
                  <div className={`w-2 h-2 rounded-full ${p.connected ? 'bg-green-400' : 'bg-gray-500'}`} />
                  <span className="text-white font-medium">{p.name}</span>
                  {p.isHost && <span className="text-gold text-xs ml-auto">HOST</span>}
                  {i === gameState.myIndex && <span className="text-white/40 text-xs ml-auto">You</span>}
                </div>
              ))}
            </div>
          </div>

          {myPlayer?.isHost && gameState.players.length >= 2 && (
            <button
              onClick={handleStartGame}
              className="w-full py-4 rounded-xl bg-gold hover:bg-gold-light text-felt-dark font-bold text-lg transition-all active:scale-[0.98] card-shadow"
            >
              Start Game
            </button>
          )}
          {myPlayer?.isHost && gameState.players.length < 2 && (
            <p className="text-center text-white/40 text-sm">Need at least 2 players</p>
          )}
          {!myPlayer?.isHost && (
            <p className="text-center text-white/40 text-sm">Waiting for host to start...</p>
          )}
        </div>
      </div>
    );
  }

  // PREVIEW — only reveal bottom 2 cards (index 2 & 3)
  if (gameState.phase === 'preview') {
    const myCards = gameState.players[gameState.myIndex]?.hand;
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-4">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gold mb-1">Round {gameState.roundNumber}</h2>
          <p className="text-white/70">Memorize your bottom 2 cards!</p>
          <div className="mt-3 text-5xl font-black text-gold animate-pulse">{previewTimer}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 w-fit mx-auto">
          {myCards?.map((card, i) => (
            <CardComponent
              key={card.id}
              card={card}
              faceUp={i >= 2}
              small
              label={`Card ${i + 1}`}
            />
          ))}
        </div>
        <p className="text-white/40 text-sm mt-6">Cards will be hidden when timer ends</p>
      </div>
    );
  }

  // ROUND END
  if (gameState.phase === 'round_end' || gameState.phase === 'game_over') {
    const sortedPlayers = [...gameState.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
    const winner = gameState.phase === 'game_over' ? sortedPlayers[0] : null;

    return (
      <div className="min-h-dvh flex flex-col items-center p-4 pt-8 safe-bottom overflow-y-auto">
        <h2 className="text-3xl font-black text-gold mb-1">
          {gameState.phase === 'game_over' ? 'Game Over!' : `Round ${gameState.roundNumber} Results`}
        </h2>

        {winner && (
          <div className="mt-2 mb-4 px-6 py-3 rounded-xl bg-gold/20 border border-gold/40">
            <p className="text-gold text-lg font-bold text-center animate-bounce-in">
              {winner.name} wins! ({winner.cumulativeScore} pts)
            </p>
          </div>
        )}

        <div className="w-full max-w-md space-y-4 mt-4">
          {sortedPlayers.map((p, rank) => (
            <div key={p.id} className="glass rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-gold font-bold">#{rank + 1}</span>
                  <span className="text-white font-semibold">{p.name}</span>
                  {p.id === gameState.players[gameState.myIndex].id && (
                    <span className="text-xs text-white/40">(You)</span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-white/60 text-sm">Round: </span>
                  <span className={`font-bold ${p.roundScore <= 0 ? 'text-green-400' : 'text-white'}`}>
                    {p.roundScore > 0 ? '+' : ''}{p.roundScore}
                  </span>
                  <span className="text-white/40 mx-1">|</span>
                  <span className="text-white/60 text-sm">Total: </span>
                  <span className={`font-bold ${p.cumulativeScore <= 0 ? 'text-green-400' : 'text-white'}`}>
                    {p.cumulativeScore}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 justify-center">
                {p.hand?.map((card, i) => (
                  <CardComponent key={card.id} card={card} faceUp={true} small />
                ))}
              </div>
            </div>
          ))}
        </div>

        {gameState.phase === 'round_end' && myPlayer?.isHost && (
          <button
            onClick={handleNextRound}
            className="mt-6 px-8 py-4 rounded-xl bg-gold hover:bg-gold-light text-felt-dark font-bold text-lg transition-all active:scale-[0.98] card-shadow"
          >
            Next Round
          </button>
        )}

        {gameState.phase === 'game_over' && (
          <button
            onClick={() => router.push('/')}
            className="mt-6 px-8 py-4 rounded-xl bg-gold hover:bg-gold-light text-felt-dark font-bold text-lg transition-all active:scale-[0.98] card-shadow"
          >
            Back to Lobby
          </button>
        )}
      </div>
    );
  }

  // MAIN GAME
  const otherPlayers = gameState.players.filter((_, i) => i !== gameState.myIndex);

  return (
    <div className="min-h-dvh flex flex-col safe-bottom">
      {/* Header */}
      <div className="px-4 py-2 flex items-center justify-between bg-black/20">
        <div className="flex items-center gap-2">
          <span className="text-gold font-black text-lg">BANG!</span>
          <span className="text-white/40 text-xs">R{gameState.roundNumber}</span>
        </div>
        <div className="text-center flex-1">
          <p className="text-white/90 text-sm font-medium">{gameState.message}</p>
        </div>
        <div className="text-right">
          <span className="text-white/60 text-xs">Score: </span>
          <span className="text-gold font-bold">{myPlayer?.cumulativeScore ?? 0}</span>
        </div>
      </div>

      {/* Bang called banner */}
      {gameState.phase === 'bang_called' && (
        <div className="bg-red-600/80 text-white text-center py-2 font-bold text-sm animate-pulse">
          BANG! called by {gameState.players.find(p => p.id === gameState.bangCalledBy)?.name} — Final turns!
        </div>
      )}

      {/* Other players */}
      <div className="px-4 py-3 overflow-x-auto no-scrollbar">
        <div className="flex gap-3 justify-center min-w-min">
          {otherPlayers.map(p => {
            const isTheirTurn = gameState.players[gameState.currentPlayerIndex]?.id === p.id;
            return (
              <div
                key={p.id}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${
                  isTheirTurn ? 'bg-gold/20 ring-1 ring-gold/40' : 'bg-white/5'
                } ${swapStep === 'selectPlayer' ? 'cursor-pointer hover:bg-white/15 active:scale-95' : ''}`}
                onClick={() => {
                  if (swapStep === 'selectPlayer') {
                    setSwapTargetPlayer(p.id);
                    setSwapStep('selectTarget');
                    setSelectedHandIndex(null);
                  }
                }}
              >
                <span className={`text-xs font-medium ${isTheirTurn ? 'text-gold' : 'text-white/70'}`}>
                  {p.name}
                </span>
                <div className="flex gap-1">
                  {Array.from({ length: p.cardCount }).map((_, ci) => (
                    <div
                      key={ci}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (swapStep === 'selectTarget' && swapTargetPlayer === p.id) {
                          setSelectedHandIndex(ci);
                        }
                      }}
                      className={`w-8 h-11 rounded-md bg-gradient-to-br from-card-back to-card-backDark border border-white/15 flex items-center justify-center
                        ${swapStep === 'selectTarget' && swapTargetPlayer === p.id ? 'cursor-pointer hover:border-gold active:scale-95' : ''}
                        ${swapStep === 'selectTarget' && swapTargetPlayer === p.id && selectedHandIndex === ci ? 'ring-2 ring-gold border-gold' : ''}
                      `}
                    >
                      <span className="text-white/20 text-[8px] font-bold">B</span>
                    </div>
                  ))}
                </div>
                <span className="text-[10px] text-white/40">{p.cumulativeScore} pts</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Center: Draw pile, discard pile, drawn card */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
        <div className="flex items-center gap-6">
          {/* Draw pile */}
          <div
            className={`${isMyTurn && gameState.turnPhase === 'draw' ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
            onClick={() => isMyTurn && gameState.turnPhase === 'draw' && handleDraw(false)}
          >
            <CardStack count={gameState.drawPileCount} label="Draw" />
          </div>

          {/* Discard pile */}
          <div className="flex flex-col items-center">
            {gameState.discardPileTop ? (
              <CardComponent
                card={gameState.discardPileTop}
                faceUp={true}
                label="Discard"
                glow={isMyTurn && gameState.turnPhase === 'draw'}
                onClick={isMyTurn && gameState.turnPhase === 'draw' ? () => handleDraw(true) : undefined}
              />
            ) : (
              <div className="w-[4.5rem] h-[6.5rem] rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center">
                <span className="text-white/20 text-xs">Discard</span>
              </div>
            )}
            {/* Match discard button — only on your turn during draw phase */}
            {isMyTurn && gameState.lastDiscardedCard && gameState.turnPhase === 'draw' && !matchMode && (
              <button
                onClick={() => setMatchMode(true)}
                className="mt-2 px-3 py-1 rounded-lg bg-gold/80 hover:bg-gold text-felt-dark text-xs font-bold transition-all active:scale-95"
              >
                Match?
              </button>
            )}
          </div>
        </div>

        {/* Drawn card */}
        {drawnCard && isMyTurn && gameState.turnPhase === 'decide' && (
          <div className="animate-bounce-in">
            <p className="text-white/60 text-xs text-center mb-2">You drew:</p>
            <CardComponent card={drawnCard} faceUp={true} glow />
          </div>
        )}

        {/* Action buttons */}
        {isMyTurn && gameState.turnPhase === 'decide' && drawnCard && (
          <div className="flex gap-3 animate-slide-up">
            <button
              onClick={handleDiscard}
              className="px-6 py-3 rounded-xl bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-all active:scale-95"
            >
              Discard
            </button>
            <span className="text-white/40 self-center text-sm">or tap a card below to swap</span>
          </div>
        )}

        {/* Special action UI */}
        {isMyTurn && gameState.turnPhase === 'special_action' && gameState.specialActionData && (
          <div className="glass rounded-2xl p-4 max-w-sm w-full animate-bounce-in">
            {gameState.specialActionData.type === 'peek_self' && (
              <div className="text-center">
                <p className="text-gold font-bold mb-2">Peek at your card (8)</p>
                <p className="text-white/60 text-sm mb-3">Choose which of your cards to look at</p>
                <div className="flex gap-2 justify-center">
                  {Array.from({ length: myPlayer?.cardCount ?? 4 }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => handleSpecialAction({ cardIndex: i })}
                      className="w-14 h-20 rounded-xl bg-gradient-to-br from-card-back to-card-backDark border-2 border-white/20 hover:border-gold active:scale-95 transition-all flex items-center justify-center"
                    >
                      <span className="text-white/40 text-sm">{i + 1}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => handleSpecialAction({ skip: true })} className="mt-3 text-white/40 text-sm hover:text-white">Skip</button>
              </div>
            )}

            {gameState.specialActionData.type === 'peek_left' && (
              <div className="text-center">
                <p className="text-gold font-bold mb-2">Peek at left player&apos;s card (7)</p>
                {(() => {
                  const leftIdx = (gameState.myIndex + gameState.players.length - 1) % gameState.players.length;
                  const leftPlayer = gameState.players[leftIdx];
                  return (
                    <>
                      <p className="text-white/60 text-sm mb-3">Choose a card from {leftPlayer.name}</p>
                      <div className="flex gap-2 justify-center">
                        {Array.from({ length: leftPlayer.cardCount }).map((_, i) => (
                          <button
                            key={i}
                            onClick={() => handleSpecialAction({ cardIndex: i })}
                            className="w-14 h-20 rounded-xl bg-gradient-to-br from-card-back to-card-backDark border-2 border-white/20 hover:border-gold active:scale-95 transition-all flex items-center justify-center"
                          >
                            <span className="text-white/40 text-sm">{i + 1}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  );
                })()}
                <button onClick={() => handleSpecialAction({ skip: true })} className="mt-3 text-white/40 text-sm hover:text-white">Skip</button>
              </div>
            )}

            {gameState.specialActionData.type === 'peek_right' && (
              <div className="text-center">
                <p className="text-gold font-bold mb-2">Peek at right player&apos;s card (9)</p>
                {(() => {
                  const rightIdx = (gameState.myIndex + 1) % gameState.players.length;
                  const rightPlayer = gameState.players[rightIdx];
                  return (
                    <>
                      <p className="text-white/60 text-sm mb-3">Choose a card from {rightPlayer.name}</p>
                      <div className="flex gap-2 justify-center">
                        {Array.from({ length: rightPlayer.cardCount }).map((_, i) => (
                          <button
                            key={i}
                            onClick={() => handleSpecialAction({ cardIndex: i })}
                            className="w-14 h-20 rounded-xl bg-gradient-to-br from-card-back to-card-backDark border-2 border-white/20 hover:border-gold active:scale-95 transition-all flex items-center justify-center"
                          >
                            <span className="text-white/40 text-sm">{i + 1}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  );
                })()}
                <button onClick={() => handleSpecialAction({ skip: true })} className="mt-3 text-white/40 text-sm hover:text-white">Skip</button>
              </div>
            )}

            {gameState.specialActionData.type === 'swap' && (
              <div className="text-center">
                <p className="text-gold font-bold mb-2">Swap cards (10)</p>

                {/* Step 1: Select your card */}
                {!swapStep && (
                  <>
                    <p className="text-white/60 text-sm mb-3">Step 1: Select YOUR card to swap</p>
                    <div className="flex gap-2 justify-center">
                      {Array.from({ length: myPlayer?.cardCount ?? 4 }).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => { setSwapOwnIndex(i); setSwapStep('selectPlayer'); }}
                          className="w-14 h-20 rounded-xl bg-gradient-to-br from-card-back to-card-backDark border-2 border-white/20 hover:border-gold active:scale-95 transition-all flex items-center justify-center"
                        >
                          <span className="text-white/40 text-sm">{i + 1}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => handleSpecialAction({ skip: true })} className="mt-3 text-white/40 text-sm hover:text-white">Skip</button>
                  </>
                )}

                {/* Step 2: Select which player */}
                {swapStep === 'selectPlayer' && (
                  <>
                    <p className="text-white/60 text-sm mb-3">Step 2: Pick a player to swap with</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {gameState.players.filter(p => p.id !== myPlayer?.id).map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setSwapTargetPlayer(p.id); setSwapStep('selectTarget'); setSelectedHandIndex(null); }}
                          className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 hover:border-gold hover:bg-white/20 active:scale-95 transition-all text-white font-medium text-sm"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { setSwapOwnIndex(null); setSwapStep(null); }} className="mt-3 text-white/40 text-sm hover:text-white">Back</button>
                  </>
                )}

                {/* Step 3: Select their card */}
                {swapStep === 'selectTarget' && (() => {
                  const target = gameState.players.find(p => p.id === swapTargetPlayer);
                  return (
                    <>
                      <p className="text-white/60 text-sm mb-1">Swapping your card <span className="text-gold font-bold">#{(swapOwnIndex ?? 0) + 1}</span> with <span className="text-gold font-bold">{target?.name}</span></p>
                      <p className="text-white/60 text-sm mb-3">Step 3: Pick their card</p>
                      <div className="flex gap-2 justify-center">
                        {Array.from({ length: target?.cardCount ?? 4 }).map((_, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              handleSpecialAction({
                                cardIndex: swapOwnIndex,
                                targetPlayerId: swapTargetPlayer,
                                targetCardIndex: i,
                              });
                              setSwapStep(null);
                              setSwapOwnIndex(null);
                              setSwapTargetPlayer(null);
                              setSelectedHandIndex(null);
                            }}
                            className="w-14 h-20 rounded-xl bg-gradient-to-br from-card-back to-card-backDark border-2 border-white/20 hover:border-gold active:scale-95 transition-all flex items-center justify-center"
                          >
                            <span className="text-white/40 text-sm">{i + 1}</span>
                          </button>
                        ))}
                      </div>
                      <button onClick={() => { setSwapTargetPlayer(null); setSwapStep('selectPlayer'); }} className="mt-3 text-white/40 text-sm hover:text-white">Back</button>
                    </>
                  );
                })()}
              </div>
            )}

            {gameState.specialActionData.type === 'prince_discard' && (
              <div className="text-center">
                <p className="text-gold font-bold mb-2">Prince (Jack) — Extra Discard</p>
                <p className="text-white/60 text-sm mb-3">Choose a card to discard (you&apos;ll draw a replacement)</p>
                <div className="flex gap-2 justify-center">
                  {Array.from({ length: myPlayer?.cardCount ?? 4 }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => handleSpecialAction({ cardIndex: i })}
                      className="w-14 h-20 rounded-xl bg-gradient-to-br from-card-back to-card-backDark border-2 border-white/20 hover:border-gold active:scale-95 transition-all flex items-center justify-center"
                    >
                      <span className="text-white/40 text-sm">{i + 1}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => handleSpecialAction({ skip: true })} className="mt-3 text-white/40 text-sm hover:text-white">Skip</button>
              </div>
            )}
          </div>
        )}

        {/* Bang button */}
        {gameState.canCallBang && (
          <button
            onClick={handleCallBang}
            className="px-8 py-3 rounded-full bg-red-600 hover:bg-red-500 text-white font-black text-xl tracking-wider
              transition-all active:scale-95 card-shadow-lg animate-pulse-glow"
          >
            BANG!
          </button>
        )}
      </div>

      {/* My hand */}
      <div className="px-4 pb-4 pt-2">

        {/* Match mode prompt */}
        {matchMode && gameState.lastDiscardedCard && (
          <div className="text-center mb-3 animate-bounce-in">
            <p className="text-gold font-bold text-sm mb-1">Match Discard</p>
            <p className="text-white/60 text-xs mb-2">
              Which card matches <span className="text-gold font-semibold">{getCardDisplay(gameState.lastDiscardedCard)}</span>?
            </p>
            <p className="text-white/40 text-[10px]">Correct = card removed | Wrong = penalty card added</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 w-fit mx-auto">
          {Array.from({ length: myPlayer?.cardCount ?? 4 }).map((_, i) => (
            <CardComponent
              key={i}
              faceUp={false}
              label={`${i + 1}`}
              selected={selectedHandIndex === i}
              glow={(isMyTurn && gameState.turnPhase === 'decide') || matchMode}
              onClick={
                matchMode ? () => {
                  handleMatchDiscard(i);
                  setMatchMode(false);
                } :
                isMyTurn ? () => {
                  if (gameState.turnPhase === 'decide' && drawnCard) {
                    handleKeep(i);
                  } else if (swapStep === null && gameState.specialActionData?.type === 'swap') {
                    setSwapOwnIndex(i);
                    setSwapStep('selectPlayer');
                  }
                } : undefined
              }
            />
          ))}
        </div>

        {matchMode && (
          <div className="text-center mt-2">
            <button onClick={() => setMatchMode(false)} className="text-white/40 text-sm hover:text-white">Cancel</button>
          </div>
        )}

        <div className="text-center mt-2">
          <span className="text-white/40 text-xs">{myPlayer?.name} • {myPlayer?.cumulativeScore} pts</span>
        </div>
      </div>

      {/* Peek overlay */}
      {peekCard && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => { setPeekCard(null); setPeekLabel(''); }}>
          <div className="animate-bounce-in text-center">
            <p className="text-gold font-bold mb-3 text-lg">{peekLabel}</p>
            <CardComponent card={peekCard} faceUp={true} />
            <p className="text-white/50 text-sm mt-3">Tap to dismiss</p>
          </div>
        </div>
      )}

      {/* Match result overlay */}
      {matchResult && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setMatchResult(null)}>
          <div className={`animate-bounce-in text-center p-6 rounded-2xl ${matchResult.success ? 'bg-green-600/90' : 'bg-red-600/90'}`}>
            <p className="text-white font-bold text-xl">{matchResult.success ? '✓' : '✗'}</p>
            <p className="text-white font-semibold mt-2">{matchResult.message}</p>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
          <div className="px-4 py-2 rounded-xl bg-red-500/90 text-white text-sm font-medium card-shadow">
            {notification}
          </div>
        </div>
      )}
    </div>
  );
}
