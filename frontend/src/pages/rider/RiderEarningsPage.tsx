import { useState } from 'react';
import { Wallet } from 'lucide-react';
import EarningsTab from './EarningsTab';
import HistoryTab from './HistoryTab';
import { PageHero, TabBar } from './RiderUi';

type TabKey = 'earnings' | 'history';

/** Rider earnings (the rider's share of each delivered parcel's delivery fee) and the full delivery history. Read-only. */
export default function RiderEarningsPage() {
  const [tab, setTab] = useState<TabKey>('earnings');
  // The History tab is only loaded once it is opened, then kept so its filters survive switching back.
  const [historyOpened, setHistoryOpened] = useState(false);

  const select = (key: TabKey) => {
    setTab(key);
    if (key === 'history') setHistoryOpened(true);
  };

  return (
    <div className="pb-4 space-y-4">
      <PageHero icon={Wallet} title="Earnings" subtitle="What you earn per delivery, and every delivery you have made." />

      <TabBar
        label="Earnings views"
        idPrefix="earnings-tab"
        panelId={(key) => `earnings-panel-${key}`}
        value={tab}
        onChange={select}
        tabs={[
          { key: 'earnings', label: 'Earnings' },
          { key: 'history', label: 'History' },
        ]}
      />

      <div id="earnings-panel-earnings" role="tabpanel" aria-labelledby="earnings-tab-earnings" hidden={tab !== 'earnings'}>
        <EarningsTab />
      </div>
      <div id="earnings-panel-history" role="tabpanel" aria-labelledby="earnings-tab-history" hidden={tab !== 'history'}>
        {historyOpened && <HistoryTab />}
      </div>
    </div>
  );
}
