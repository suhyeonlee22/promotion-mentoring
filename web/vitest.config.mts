import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    // 테스트는 개발용 DB(local.db)가 아니라 test.db를 쓴다
    env: { DATABASE_URL: 'file:test.db' },
    // 같은 DB 파일을 쓰는 테스트 파일들이 동시에 실행되지 않게 한다
    fileParallelism: false,
  },
});
