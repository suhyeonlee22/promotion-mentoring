import { describe, it, expect, beforeEach } from 'vitest';
import { count } from 'drizzle-orm';
import { seedAll } from '@/db/seed';
import { db } from '@/db/client';
import { srcEmployee, processHistory } from '@/db/schema';
import { recordHistory } from '@/lib/history';

describe('통합 테스트 환경', () => {
  beforeEach(async () => {
    await seedAll();
  });

  it('test.db에 시드가 들어간다', async () => {
    expect(process.env.DATABASE_URL).toBe('file:test.db');
    const [r] = await db.select({ n: count() }).from(srcEmployee);
    expect(r.n).toBe(12);
  });

  it('트랜잭션 안에서 처리 이력을 남긴다', async () => {
    await db.transaction(async (tx) => {
      await recordHistory(tx, { entityType: 'ROUND', entityId: '1', action: 'ROUND_CREATED', toStatus: 'PREPARING', actor: 'test' });
    });
    const [r] = await db.select({ n: count() }).from(processHistory);
    expect(r.n).toBe(1);
  });
});
