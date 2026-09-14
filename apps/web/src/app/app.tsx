import { useEffect, useState } from 'react';
import { fetchHealth } from '@smart-library/data-access';
import { WelcomeCard } from '@smart-library/ui';
export function App() {
  const [health, setHealth] = useState<'loading' | 'available' | 'unavailable'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then(() => setHealth('available'))
      .catch(() => setHealth('unavailable'));
    return () => controller.abort();
  }, []);
  return <WelcomeCard health={health} />;
}
