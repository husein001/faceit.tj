import { query, queryOne } from '../config/database';
import { PremiumRequest, PremiumRequestWithUser } from '../types';

export async function createPremiumRequest(
  userId: string,
  phoneNumber: string,
  amount: number = 10
): Promise<PremiumRequest> {
  const rows = await query<PremiumRequest>(
    `INSERT INTO premium_requests (user_id, phone_number, amount)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, phoneNumber, amount]
  );
  return rows[0];
}

export async function getPendingRequests(): Promise<PremiumRequestWithUser[]> {
  return query<PremiumRequestWithUser>(
    `SELECT pr.*,
            json_build_object(
              'id', u.id,
              'steam_id', u.steam_id,
              'username', u.username,
              'avatar_url', u.avatar_url,
              'mmr', u.mmr,
              'is_premium', u.is_premium
            ) as user
     FROM premium_requests pr
     JOIN users u ON pr.user_id = u.id
     WHERE pr.status = 'pending'
     ORDER BY pr.created_at ASC`
  );
}

export async function getAllRequests(limit: number = 50): Promise<PremiumRequestWithUser[]> {
  return query<PremiumRequestWithUser>(
    `SELECT pr.*,
            json_build_object(
              'id', u.id,
              'steam_id', u.steam_id,
              'username', u.username,
              'avatar_url', u.avatar_url,
              'mmr', u.mmr,
              'is_premium', u.is_premium
            ) as user
     FROM premium_requests pr
     JOIN users u ON pr.user_id = u.id
     ORDER BY pr.created_at DESC
     LIMIT $1`,
    [limit]
  );
}

export async function getRequestById(id: string): Promise<PremiumRequest | null> {
  return queryOne<PremiumRequest>(
    'SELECT * FROM premium_requests WHERE id = $1',
    [id]
  );
}

export async function getUserPendingRequest(userId: string): Promise<PremiumRequest | null> {
  return queryOne<PremiumRequest>(
    `SELECT * FROM premium_requests
     WHERE user_id = $1 AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
}

export async function approveRequest(
  requestId: string,
  adminName: string,
  note?: string
): Promise<PremiumRequest | null> {
  // Начинаем транзакцию - одобряем запрос и активируем премиум
  const request = await getRequestById(requestId);
  if (!request) return null;

  // Обновляем статус запроса
  await query(
    `UPDATE premium_requests
     SET status = 'approved', processed_at = NOW(), processed_by = $2, admin_note = $3
     WHERE id = $1`,
    [requestId, adminName, note || null]
  );

  // Активируем премиум на 30 дней
  const premiumUntil = new Date();
  premiumUntil.setDate(premiumUntil.getDate() + 30);

  await query(
    `UPDATE users
     SET is_premium = true, premium_until = $2
     WHERE id = $1`,
    [request.user_id, premiumUntil]
  );

  return getRequestById(requestId);
}

export async function rejectRequest(
  requestId: string,
  adminName: string,
  note?: string
): Promise<PremiumRequest | null> {
  await query(
    `UPDATE premium_requests
     SET status = 'rejected', processed_at = NOW(), processed_by = $2, admin_note = $3
     WHERE id = $1`,
    [requestId, adminName, note || null]
  );

  return getRequestById(requestId);
}

export async function getRequestStats(): Promise<{
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}> {
  const result = await queryOne<{
    pending: string;
    approved: string;
    rejected: string;
    total: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending') as pending,
       COUNT(*) FILTER (WHERE status = 'approved') as approved,
       COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
       COUNT(*) as total
     FROM premium_requests`
  );

  return {
    pending: parseInt(result?.pending || '0', 10),
    approved: parseInt(result?.approved || '0', 10),
    rejected: parseInt(result?.rejected || '0', 10),
    total: parseInt(result?.total || '0', 10),
  };
}
