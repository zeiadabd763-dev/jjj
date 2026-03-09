/**
 * Placeholder Parser - Replaces tokens in text with actual values.
 * Supports the following variables:
 *   {user}        -> mention of the member
 *   {user_name}   -> username of the member
 *   {server}      -> guild name
 *   {member_count}-> guild member count
 *   {inviter}     -> name of the inviter who brought the user in (best‑effort)
 *   {invites}     -> total number of invites created by the member
 *
 * The implementation is async because resolving invite data requires
 * fetching the guild's invite cache. If anything fails we quietly fall
 * back to sensible defaults so the calling flow can remain robust.
 *
 * @param {string} text
 * @param {GuildMember} member
 * @returns {Promise<string>}
 */
export async function parsePlaceholders(text, member) {
  if (!text || typeof text !== 'string') return text;

  let result = text;

  // basic member information
  if (member) {
    if (member.user) {
      result = result.replace(/{user}/g, `<@${member.id}>`);
      result = result.replace(/{user_name}/g, member.user.username || '');
    }

    // guild-specific tokens
    const guild = member.guild;
    if (guild) {
      result = result.replace(/{server}/g, guild.name || '');
      result = result.replace(/{member_count}/g, (guild.memberCount || '').toString());

      // user join position
      try {
        const members = Array.from(guild.members.cache.values());
        members.sort((a, b) => a.joinedAt - b.joinedAt);
        const joinPosition = members.findIndex(m => m.id === member.id) + 1;
        result = result.replace(/{join_pos}/g, joinPosition.toString());
      } catch (_e) {
        result = result.replace(/{join_pos}/g, 'Unknown');
      }

      // invitations - best effort lookup
      try {
        const invites = await guild.invites.fetch();
        // count total uses of invites created by this member
        const own = invites.filter(i => i.inviter && i.inviter.id === member.id);
        const inviteCount = own.reduce((acc, i) => acc + (i.uses || 0), 0);
        result = result.replace(/{invites}/g, inviteCount.toString());
      } catch (_e) {
        result = result.replace(/{invites}/g, '0');
      }

      // inviter - not reliably obtainable; default to 'Unknown'
      result = result.replace(/{inviter}/g, 'Unknown');
    }
  }

  return result;
}
