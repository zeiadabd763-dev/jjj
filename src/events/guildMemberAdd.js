export default {
  name: 'guildMemberAdd',
  async execute(member) {
    try {
      const { client } = member;

      // Forward member join to gateway handler if present
      if (client && client.gateway && typeof client.gateway.handleMemberAdd === 'function') {
        try {
          console.log(`[GuildMemberAdd] New member: ${member.user.tag}`);
          await client.gateway.handleMemberAdd(member);
        } catch (err) {
          console.error('[Gateway] Member add handler error:', err);
        }
      }
    } catch (err) {
      console.error('[guildMemberAdd] Handler failed:', err);
    }
  },
};
