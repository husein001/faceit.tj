import { query, queryOne } from '../config/database';

export interface PremiumSettings {
  enabled: boolean;
  price: number;
  currency: string;
  duration_days: number;
}

// Получить настройки премиума
export async function getPremiumSettings(): Promise<PremiumSettings> {
  const result = await queryOne<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'premium'`
  );

  if (result) {
    return JSON.parse(result.value);
  }

  // Дефолтные настройки
  return {
    enabled: false,
    price: 10,
    currency: 'сомони',
    duration_days: 30,
  };
}

// Сохранить настройки премиума
export async function savePremiumSettings(settings: PremiumSettings): Promise<void> {
  const value = JSON.stringify(settings);

  await query(
    `INSERT INTO settings (key, value)
     VALUES ('premium', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [value]
  );
}

// Проверить включен ли премиум
export async function isPremiumEnabled(): Promise<boolean> {
  const settings = await getPremiumSettings();
  return settings.enabled;
}
