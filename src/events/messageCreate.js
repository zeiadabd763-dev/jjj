export default {
  name: 'messageCreate',
  async execute(message) {
    try {
      const { client } = message;

      // Always forward every message to gateway handler if present
      if (client && client.gateway && typeof client.gateway.handleMessage === 'function') {
        try {
          await client.gateway.handleMessage(message);
        } catch (err) {
          console.error('[Gateway] Message handler error:', err);
        }
      }
    } catch (err) {
      console.error('[messageCreate] Handler failed:', err);
    }
  },
};
