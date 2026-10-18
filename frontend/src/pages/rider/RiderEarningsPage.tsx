import { useState } from 'react';
import { Wallet } from 'lucide-react';
import EarningsTab from './EarningsTab';
import HistoryTab from './HistoryTab';
import { PageHero, TabBar } from './RiderUi';
import { CodRemittanceCard } from '../../components/rider/RiderWork';

type TabKey = 'earnings' | 'history';

/** Rider earnings (A3: ₱30 per pickup, ₱50 per delivery, nothing for a failed attempt), the COD to remit, and the history. */
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
      <PageHero icon={Wallet} title="Earnings" subtitle="₱30 per pickup and ₱50 per delivery; a failed attempt pays nothing." />

      <CodRemittanceCard />

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
