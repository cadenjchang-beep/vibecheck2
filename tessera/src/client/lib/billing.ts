import type { BillingStatus } from '@shared/api';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useErrorMessage } from './me';
import { keys } from './query';
import { toast } from 'sonner';

export const useBilling = (enabled = true) =>
  useQuery({ queryKey: keys.billing, queryFn: () => api<BillingStatus>('/api/billing'), enabled });

/** Starts checkout or opens the billing portal, then follows the provider's link. */
export function useBillingRedirect(kind: 'checkout' | 'portal') {
  const errorMessage = useErrorMessage();
  return useMutation({
    mutationFn: () => api<{ url: string }>(`/api/billing/${kind}`, { method: 'POST' }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (err) => toast.error(errorMessage(err)),
  });
}
