import { useState, useEffect, useCallback, useRef } from 'react';
import type { WagerAmount, MatchId, PlayerInfo } from '@skillgamez/shared';
import { VALID_WAGER_AMOUNTS, VALID_DEPOSIT_AMOUNTS, VAULT_CONTRACT_ADDRESS, tonToCoins, coinsToTonAfterFee, formatCoins } from '@skillgamez/shared';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import type { WebSocketState } from '../ws/useWebSocket.js';

interface Props {
  ws: WebSocketState;
  balance: number | null;
  onMatchFound: (matchId: MatchId, opponent: PlayerInfo, wagerAmount: WagerAmount) => void;
  onBack: () => void;
}

type LobbyTab = 'quick' | 'challenge';
type LobbyState =
  | { kind: 'idle' }
  | { kind: 'searching'; wagerAmount: WagerAmount }
  | { kind: 'creating_challenge'; wagerAmount: WagerAmount; code: string }
  | { kind: 'joining_challenge' }
  | { kind: 'found'; opponentName: string };

type DepositState = 'idle' | 'picking' | 'confirming' | 'failed';
type WithdrawState = 'idle' | 'picking' | 'processing' | 'failed';

const WITHDRAW_AMOUNTS = [50, 100, 200, 500];

export function LobbyScreen({ ws, balance, onMatchFound, onBack }: Props): JSX.Element {
  const [tab, setTab] = useState<LobbyTab>('quick');
  const [selected, setSelected] = useState<WagerAmount>(1);
  const [state, setState] = useState<LobbyState>({ kind: 'idle' });
  const [challengeInput, setChallengeInput] = useState('');
  const [depositState, setDepositState] = useState<DepositState>('idle');
  const [depositError, setDepositError] = useState('');
  const [withdrawState, setWithdrawState] = useState<WithdrawState>('idle');
  const [withdrawError, setWithdrawError] = useState('');

  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();

  const lastProcessedRef = useRef<unknown>(null);
  const walletSentRef = useRef(false);

  // Send WALLET_CONNECTED when wallet connects
  useEffect(() => {
    if (wallet && ws.connected && !walletSentRef.current) {
      const address = wallet.account.address;
      ws.send({ type: 'WALLET_CONNECTED', address });
      walletSentRef.current = true;
    }
    if (!wallet) {
      walletSentRef.current = false;
    }
  }, [wallet, ws]);

  // Handle incoming messages
  useEffect(() => {
    const msg = ws.lastMessage;
    if (!msg || msg === lastProcessedRef.current) return;
    lastProcessedRef.current = msg;

    switch (msg.type) {
      case 'QUEUE_JOINED':
        setState({ kind: 'searching', wagerAmount: msg.wagerAmount });
        break;
      case 'QUEUE_LEFT':
        setState({ kind: 'idle' });
        break;
      case 'MATCH_FOUND':
        setState({ kind: 'found', opponentName: msg.opponent.displayName });
        setTimeout(() => {
          onMatchFound(msg.matchId, msg.opponent, msg.wagerAmount);
        }, 1500);
        break;
      case 'CHALLENGE_CREATED':
        setState({ kind: 'creating_challenge', wagerAmount: msg.wagerAmount, code: msg.challengeCode });
        break;
      case 'CHALLENGE_CANCELLED':
        setState({ kind: 'idle' });
        break;
      case 'CHALLENGE_INVALID':
        setState({ kind: 'idle' });
        break;
      case 'DEPOSIT_CONFIRMED':
        setDepositState('idle');
        break;
      case 'DEPOSIT_FAILED':
        setDepositState('failed');
        setDepositError(msg.reason);
        break;
      case 'WITHDRAW_CONFIRMED':
        setWithdrawState('idle');
        break;
      case 'WITHDRAW_FAILED':
        setWithdrawState('failed');
        setWithdrawError(msg.reason);
        break;
    }
  }, [ws.lastMessage, onMatchFound]);

  const wagerCoins = tonToCoins(selected);
  const canAfford = balance !== null && balance >= wagerCoins;

  const findMatch = useCallback(() => {
    ws.send({ type: 'JOIN_QUEUE', wagerAmount: selected });
  }, [ws, selected]);

  const cancelSearch = useCallback(() => {
    ws.send({ type: 'LEAVE_QUEUE' });
  }, [ws]);

  const createChallenge = useCallback(() => {
    ws.send({ type: 'CREATE_CHALLENGE', wagerAmount: selected });
  }, [ws, selected]);

  const cancelChallenge = useCallback(() => {
    ws.send({ type: 'CANCEL_CHALLENGE' });
  }, [ws]);

  const joinChallenge = useCallback(() => {
    if (challengeInput.length !== 6) return;
    ws.send({ type: 'JOIN_CHALLENGE', challengeCode: challengeInput.toUpperCase() });
    setState({ kind: 'joining_challenge' });
  }, [ws, challengeInput]);

  const handleDeposit = useCallback(async (amount: number) => {
    if (!wallet) return;
    setDepositState('confirming');
    setDepositError('');

    try {
      const result = await tonConnectUI.sendTransaction(
        {
          validUntil: Math.floor(Date.now() / 1000) + 300,
          messages: [{
            address: VAULT_CONTRACT_ADDRESS,
            amount: String(Math.round(amount * 1e9)),
          }],
        },
        {
          twaReturnUrl: 'https://t.me/SkillGamezBot/app' as `${string}://${string}`,
          returnStrategy: 'back',
        },
      );
      // Transaction was signed and sent — tell the server to verify
      // The BOC is base64-encoded, use it as the tx identifier
      const txHash = result.boc;
      ws.send({ type: 'DEPOSIT_SUBMITTED', txHash, amount });
    } catch {
      setDepositState('idle');
    }
  }, [wallet, tonConnectUI, ws]);

  const handleWithdraw = useCallback((coins: number) => {
    setWithdrawState('processing');
    setWithdrawError('');
    ws.send({ type: 'WITHDRAW_REQUEST', amount: coins });
  }, [ws]);

  const handleWithdrawAll = useCallback(() => {
    if (balance && balance >= 10) {
      handleWithdraw(balance);
    }
  }, [balance, handleWithdraw]);

  // ─── Found state ────────────────────────────────────────────────────
  if (state.kind === 'found') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 animate-fade-in">
        <p className="text-lg text-slate-500 tracking-widest uppercase">Opponent Found</p>
        <p className="text-3xl font-extrabold text-cyan-400">{state.opponentName}</p>
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const shortAddress = wallet
    ? `${wallet.account.address.slice(0, 4)}...${wallet.account.address.slice(-4)}`
    : null;

  return (
    <div className="flex flex-col items-center h-full px-6 pt-12 gap-6 overflow-y-auto pb-8">
      {/* Connection status */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${ws.connected ? 'bg-green-400' : 'bg-red-400'}`} />
        <p className="text-xs text-slate-500">
          {ws.connected ? `Connected as ${ws.displayName}` : 'Connecting...'}
        </p>
      </div>

      {/* Wallet + Balance row */}
      <div className="flex gap-3 w-full max-w-xs">
        {/* Balance */}
        {balance !== null && (
          <div className="flex-1 bg-slate-800 rounded-xl px-4 py-3 text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Balance</p>
            <p className="text-xl font-extrabold text-yellow-400 font-mono">{formatCoins(balance)}</p>
          </div>
        )}
        {/* Wallet status */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {wallet ? (
            <div className="text-center">
              <p className="text-xs text-slate-500">Wallet</p>
              <p className="text-xs text-green-400 font-mono">{shortAddress}</p>
              <button
                onClick={() => tonConnectUI.disconnect()}
                className="text-xs text-slate-600 mt-1 underline"
                style={{ touchAction: 'manipulation' }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); tonConnectUI.openModal(); }}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold active:bg-blue-500 transition-colors"
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', userSelect: 'none' }}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>

      {/* Deposit section — only when wallet connected */}
      {wallet && depositState !== 'confirming' && (
        <div className="w-full max-w-xs">
          {depositState === 'idle' && (
            <button
              onPointerDown={() => setDepositState('picking')}
              className="w-full py-3 rounded-xl bg-green-600 text-white text-sm font-bold active:bg-green-500 transition-colors"
            >
              DEPOSIT TON
            </button>
          )}
          {depositState === 'picking' && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-500 text-center uppercase">Select deposit amount</p>
              <div className="flex gap-2 justify-center">
                {VALID_DEPOSIT_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => handleDeposit(amt)}
                    className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-bold active:bg-green-600 transition-colors"
                    style={{ touchAction: 'manipulation' }}
                  >
                    {amt} TON
                  </button>
                ))}
              </div>
              <button
                onPointerDown={() => setDepositState('idle')}
                className="text-xs text-slate-500 text-center mt-1"
              >
                Cancel
              </button>
            </div>
          )}
          {depositState === 'failed' && (
            <div className="text-center">
              <p className="text-red-400 text-xs">{depositError}</p>
              <button
                onPointerDown={() => setDepositState('idle')}
                className="text-xs text-slate-500 mt-1 underline"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}
      {depositState === 'confirming' && (
        <div className="w-full max-w-xs flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-green-400">Confirming deposit...</p>
        </div>
      )}

      {/* Withdraw section — wallet connected and balance > 0 */}
      {wallet && balance !== null && balance > 0 && withdrawState !== 'processing' && (
        <div className="w-full max-w-xs">
          {withdrawState === 'idle' && (
            <button
              onClick={() => setWithdrawState('picking')}
              className="w-full py-3 rounded-xl bg-orange-600 text-white text-sm font-bold active:bg-orange-500 transition-colors"
              style={{ touchAction: 'manipulation' }}
            >
              WITHDRAW
            </button>
          )}
          {withdrawState === 'picking' && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-500 text-center uppercase">Select withdrawal amount</p>
              <div className="flex gap-2 justify-center flex-wrap">
                {WITHDRAW_AMOUNTS.filter(a => balance >= a).map((amt) => (
                  <button
                    key={amt}
                    onClick={() => handleWithdraw(amt)}
                    className="px-3 py-2 rounded-lg bg-orange-700 text-white text-xs font-bold active:bg-orange-600 transition-colors"
                    style={{ touchAction: 'manipulation' }}
                  >
                    <span>{amt} Coins</span>
                    <span className="block text-orange-300 text-[10px]">{coinsToTonAfterFee(amt).toFixed(2)} TON</span>
                  </button>
                ))}
                <button
                  onClick={handleWithdrawAll}
                  className="px-3 py-2 rounded-lg bg-orange-700 text-white text-xs font-bold active:bg-orange-600 transition-colors"
                  style={{ touchAction: 'manipulation' }}
                >
                  <span>ALL ({balance})</span>
                  <span className="block text-orange-300 text-[10px]">{coinsToTonAfterFee(balance).toFixed(2)} TON</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-600 text-center">10% platform fee applies. Min 10 Coins.</p>
              <button
                onClick={() => setWithdrawState('idle')}
                className="text-xs text-slate-500 text-center mt-1"
                style={{ touchAction: 'manipulation' }}
              >
                Cancel
              </button>
            </div>
          )}
          {withdrawState === 'failed' && (
            <div className="text-center">
              <p className="text-red-400 text-xs">{withdrawError}</p>
              <button
                onClick={() => setWithdrawState('idle')}
                className="text-xs text-slate-500 mt-1 underline"
                style={{ touchAction: 'manipulation' }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}
      {withdrawState === 'processing' && (
        <div className="w-full max-w-xs flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-orange-400">Processing withdrawal...</p>
        </div>
      )}

      {/* Back button */}
      <button onPointerDown={onBack} className="absolute top-4 left-4 text-slate-500 text-sm">
        &larr; Back
      </button>

      {/* Tabs */}
      <div className="flex gap-2 w-full max-w-xs">
        <button
          onPointerDown={() => setTab('quick')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
            tab === 'quick' ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-400'
          }`}
        >
          Quick Match
        </button>
        <button
          onPointerDown={() => setTab('challenge')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
            tab === 'challenge' ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-400'
          }`}
        >
          Challenge
        </button>
      </div>

      {/* Wager selector */}
      <div className="w-full max-w-xs">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 text-center">Wager Tier</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {VALID_WAGER_AMOUNTS.map((amt) => (
            <button
              key={amt}
              onPointerDown={() => setSelected(amt)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                selected === amt ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {tonToCoins(amt)} Coins
            </button>
          ))}
        </div>
        <div className="text-center mt-2">
          <p className="text-sm text-slate-400">
            Wager: <span className="text-yellow-400 font-bold">{formatCoins(wagerCoins)}</span>
          </p>
          {balance !== null && (
            <p className={`text-xs mt-1 ${canAfford ? 'text-slate-500' : 'text-red-400'}`}>
              {canAfford
                ? `Remaining after wager: ${formatCoins(balance - wagerCoins)}`
                : 'Not enough Coins'}
            </p>
          )}
        </div>
      </div>

      {/* Quick Match tab */}
      {tab === 'quick' && (
        <div className="w-full max-w-xs flex flex-col gap-4">
          {state.kind === 'idle' && (
            <button
              onPointerDown={findMatch}
              disabled={!ws.connected || !canAfford}
              className="w-full py-4 rounded-xl bg-cyan-500 text-black text-xl font-extrabold tracking-wider active:bg-cyan-400 transition-colors disabled:opacity-50"
            >
              FIND MATCH
            </button>
          )}
          {state.kind === 'searching' && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 text-sm">Searching for opponent...</p>
              <button
                onPointerDown={cancelSearch}
                className="w-full py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-bold active:bg-slate-700 transition-colors"
              >
                CANCEL
              </button>
            </div>
          )}
        </div>
      )}

      {/* Challenge tab */}
      {tab === 'challenge' && (
        <div className="w-full max-w-xs flex flex-col gap-4">
          {state.kind === 'idle' && (
            <>
              <button
                onPointerDown={createChallenge}
                disabled={!ws.connected || !canAfford}
                className="w-full py-4 rounded-xl bg-cyan-500 text-black text-lg font-extrabold tracking-wider active:bg-cyan-400 transition-colors disabled:opacity-50"
              >
                CREATE CHALLENGE
              </button>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="Enter code"
                  value={challengeInput}
                  onChange={(e) => setChallengeInput(e.target.value.toUpperCase())}
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-800 text-white text-center text-lg font-mono tracking-widest placeholder:text-slate-600 outline-none focus:ring-2 ring-cyan-500"
                />
                <button
                  onPointerDown={joinChallenge}
                  disabled={!ws.connected || challengeInput.length !== 6}
                  className="px-6 py-3 rounded-xl bg-cyan-500 text-black font-bold active:bg-cyan-400 transition-colors disabled:opacity-50"
                >
                  JOIN
                </button>
              </div>
            </>
          )}
          {state.kind === 'creating_challenge' && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-slate-400 text-sm">Waiting for opponent...</p>
              <p className="text-4xl font-mono font-bold text-cyan-400 tracking-[0.3em]">{state.code}</p>
              <p className="text-xs text-slate-600">Share this code with your opponent</p>
              <button
                onPointerDown={cancelChallenge}
                className="w-full py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-bold active:bg-slate-700 transition-colors"
              >
                CANCEL
              </button>
            </div>
          )}
          {state.kind === 'joining_challenge' && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 text-sm">Joining challenge...</p>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {ws.error && (
        <p className="text-red-400 text-xs text-center">{ws.error}</p>
      )}
    </div>
  );
}
