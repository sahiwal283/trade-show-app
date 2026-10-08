/** Open sample requests for the signed-in user's shows, submitted or not. */
import { useEffect, useState } from 'react';
import { api } from '../../../utils/api';
import { sampleRequestApi, OpenSampleRequest } from '../../../utils/sampleRequestApi';

export function useSampleRequestActions(): { requests: OpenSampleRequest[] } {
  const [requests, setRequests] = useState<OpenSampleRequest[]>([]);
  useEffect(() => {
    let mounted = true;
    if (!api.USE_SERVER) return;
    sampleRequestApi.listMine()
      .then((r) => { if (mounted) setRequests(r.requests || []); })
      .catch((e) => console.error('[Dashboard] sample requests failed:', e));
    return () => { mounted = false; };
  }, []);
  return { requests };
}
