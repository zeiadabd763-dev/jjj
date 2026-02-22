export default {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    try {
      const client = reaction.message.client;
      if (!client) return;

      if (client && client.gateway && typeof client.gateway.handleReaction === 'function') {
        try {
          await client.gateway.handleReaction(reaction, user);
        } catch (err) {
          console.error('[Gateway] Reaction handler error:', err);
        }
      }
    } catch (err) {
      console.error('[messageReactionAdd] Handler failed:', err);
    }
  },
};
