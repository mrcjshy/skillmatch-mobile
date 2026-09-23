import { type Href, useRouter } from 'expo-router';

import { IdentityReviewQueue } from '@/components/identity-review-queue';
import { useAccount } from '@/providers/account-provider';

/** Reuses the established queue and verification-details approval path. */
export default function AdminIdentityReviews() {
  const router = useRouter();
  const { account, status } = useAccount();
  const adminId = status === 'resolved' && account?.role === 'administrator' && account.is_active
    ? account.id
    : undefined;

  return (
    <IdentityReviewQueue
      adminId={adminId}
      onSelectWorker={(userId) => {
        router.push({
          pathname: '/admin/verification-details',
          params: { userId },
        } as unknown as Href);
      }}
    />
  );
}
