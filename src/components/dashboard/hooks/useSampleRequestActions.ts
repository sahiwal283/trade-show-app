/** Open sample requests the signed-in user has not submitted yet. */
import { useEffect, useState } from 'react';
import { api } from '../../../utils/api';
import { sampleRequestApi, OpenSampleRequest } from '../../../utils/sampleRequestApi';

export function useSampleRequestActions(): { pending: OpenSampleRequest[] } {
  const [pending, setPending] = useState<OpenSampleRequest[]>([]);
  useEffect(() => {
    let mounted = true;
    if (!api.USE_SERVER) return;
    sampleRequestApi.listMine()
      .then((r) => { if (mounted) setPending((r.requests || []).filter((x) => x.status !== 'submitted')); })
      .catch((e) => console.error('[Dashboard] sample requests failed:', e));
    return () => { mounted = false; };
  }, []);
  return { pending };
}
