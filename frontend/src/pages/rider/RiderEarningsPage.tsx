import { useState } from 'react';
import { Wallet } from 'lucide-react';
import EarningsTab from './EarningsTab';
import HistoryTab from './HistoryTab';

type TabKey = 'earnings' | 'history';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'earnings', label: 'Earnings' },
  { key: 'history', label: 'History' },
];

/** Rider earnings (flat fee per delivered parcel) and the full delivery history. Read-only. */
export default function RiderEarningsPage() {
  const [tab, setTab] = useState<TabKey>('earnings');
  // The History tab is only loaded once it is opened, then kept so its filters survive switching back.
  const [historyOpened, setHistoryOpened] = useState(false);

  const select = (key: TabKey) => {
    setTab(key);
    if (key === 'history') setHistoryOpened(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Earnings</h1>
          <p className="text-xs text-gray-500">What you earn per delivery, and every delivery you have made.</p>
        </div>
      </div>

      <div role="tablist" aria-label="Earnings views" className="flex items-center border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`earnings-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`earnings-panel-${t.key}`}
            onClick={() => select(t.key)}
            className={`min-h-11 px-5 text-sm font-bold transition-colors ${
              tab === t.key ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="earnings-panel-earnings" role="tabpanel" aria-labelledby="earnings-tab-earnings" hidden={tab !== 'earnings'}>
        <EarningsTab />
      </div>
      <div id="earnings-panel-history" role="tabpanel" aria-labelledby="earnings-tab-history" hidden={tab !== 'history'}>
        {historyOpened && <HistoryTab />}
      </div>
    </div>
  );
}
