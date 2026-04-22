export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureAdminBootstrap } = await import('./lib/services/admin-bootstrap');
    try {
      await ensureAdminBootstrap();
    } catch (e) {
      console.error('[admin-bootstrap] failed:', e);
    }
  }
}
