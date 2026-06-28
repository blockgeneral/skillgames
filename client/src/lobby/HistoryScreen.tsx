import { useEffect, useRef, useState, useCallback } from 'react';
import type { Transaction } from '@skillgamez/shared';
import { formatCoins } from '@skillgamez/shared';
import type { WebSocketState } from '../ws/useWebSocket.js';

interface Props {
  ws: WebSocketState;
  onBack: () => void;
}

const TYPE_CONFIG: Record<string, { icon: string; label: (tx: Transaction) => string; sign: '+' | '-' | '' }> = {
  deposit:     { icon: '\u2193', label: () => 'Deposit',                                      sign: '+' },
  withdrawal:  { icon: '\u2191', label: (tx) => `Withdrawal${tx.fee ? ` (fee: ${tx.fee})` : ''}`, sign: '-' },
  wager_debit: { icon: '\uD83C\uDFAE', label: (tx) => `Match wager${tx.opponentName ? ` vs ${tx.opponentName}` : ''}`, sign: '-' },
  wager_win:   { icon: '\uD83C\uDFC6', label: (tx) => `Won${tx.opponentName ? ` vs ${tx.opponentName}` : ''}`,         sign: '+' },
  wager_loss:  { icon: '\uD83D\uDC80', label: (tx) => `Lost${tx.opponentName ? ` vs ${tx.opponentName}` : ''}`,        sign: '' },
  wager_draw:  { icon: '\uD83E\uDD1D', label: (tx) => `Draw — refund${tx.opponentName ? ` vs ${tx.opponentName}` : ''}`, sign: '+' },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

export function HistoryScreen({ ws, onBack }: Props): JSX.Element {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const lastProcessedRef = useRef<unknown>(null);
  const requestedRef = useRef(false);

  // Request history on mount
  useEffect(() => {
    if (ws.connected && !requestedRef.current) {
      ws.send({ type: 'GET_HISTORY', limit: 50 });
      requestedRef.current = true;
    }
  }, [ws]);

  // Handle HISTORY response
  useEffect(() => {
    const msg = ws.lastMessage;
    if (!msg || msg === lastProcessedRef.current) return;
    lastProcessedRef.current = msg;

    if (msg.type === 'HISTORY') {
      setTransactions(prev => {
        if (prev.length === 0) return msg.transactions;
        // Append for pagination (avoid duplicates)
        const existingIds = new Set(prev.map(t => t.id));
        const newTxs = msg.transactions.filter((t: Transaction) => !existingIds.has(t.id));
        return [...prev, ...newTxs];
      });
      setHasMore(msg.transactions.length >= 50);
      setLoading(false);
    }
  }, [ws.lastMessage]);

  const loadMore = useCallback(() => {
    if (transactions.length === 0 || !hasMore) return;
    const oldest = transactions[transactions.length - 1]!;
    ws.send({ type: 'GET_HISTORY', limit: 50, before: oldest.timestamp });
  }, [ws, transactions, hasMore]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-slate-800">
        <button
          onClick={onBack}
          className="text-slate-500 text-sm mr-4"
          style={{ touchAction: 'manipulation' }}
        >
          &larr; Back
        </button>
        <h2 className="text-lg font-bold text-slate-300">Transaction History</h2>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && transactions.length === 0 && (
          <p className="text-center text-slate-600 py-8">No transactions yet</p>
        )}

        {transactions.map((tx) => {
          const config = TYPE_CONFIG[tx.type] ?? { icon: '?', label: () => tx.type, sign: '' as const };
          const amountStr = tx.amount > 0
            ? `${config.sign}${formatCoins(tx.amount)}`
            : (tx.type === 'wager_loss' ? 'Lost' : '0');
          const amountColor = config.sign === '+' ? 'text-green-400'
            : config.sign === '-' ? 'text-red-400'
            : 'text-slate-500';

          return (
            <div key={tx.id} className="flex items-center justify-between py-3 border-b border-slate-800/50">
              <div className="flex items-center gap-3">
                <span className="text-lg w-8 text-center">{config.icon}</span>
                <div>
                  <p className="text-sm text-slate-300">{config.label(tx)}</p>
                  <p className="text-xs text-slate-600">{formatTime(tx.timestamp)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-sm font-mono font-bold ${amountColor}`}>{amountStr}</p>
                <p className="text-[10px] text-slate-600 font-mono">Bal: {tx.balanceAfter}</p>
              </div>
            </div>
          );
        })}

        {hasMore && transactions.length > 0 && (
          <button
            onClick={loadMore}
            className="w-full py-3 text-sm text-cyan-400 text-center mt-2"
            style={{ touchAction: 'manipulation' }}
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
