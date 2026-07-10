const DEFAULT_TEST_DATABASE_URL =
  'postgres://door:door_dev@127.0.0.1:5432/door_test';

function getDatabaseName(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return null;
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).trim() || null;
  } catch {
    return null;
  }
}

function hasExplicitTestMarker(databaseName) {
  return (
    /^test(?:_|$)/i.test(databaseName) ||
    /(?:^|_)test$/i.test(databaseName) ||
    /_test_/i.test(databaseName)
  );
}

export function assertSafeTestDatabase(databaseUrl) {
  const databaseName = getDatabaseName(databaseUrl);
  if (!databaseName || !hasExplicitTestMarker(databaseName)) {
    throw new Error(
      'Refusing to run destructive tests: DATABASE_URL must name an explicit test database.',
    );
  }

  return databaseName;
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= DEFAULT_TEST_DATABASE_URL;
assertSafeTestDatabase(process.env.DATABASE_URL);
