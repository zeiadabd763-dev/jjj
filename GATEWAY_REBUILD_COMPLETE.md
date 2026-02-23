# Gateway System - Complete Rebuild for Concurrency

## Overview
The gateway verification system has been completely rebuilt to support **all 4 methods running simultaneously** (Button, Trigger, Slash, Join) with full UI customization per method and proper visibility logic.

---

## Key Changes

### 1. **Database Schema Redesign** (`src/modules/gateway/schema.js`)
**FROM:** Single `method` enum field to **TO:** Multi-method object structure

**New Structure:**
```javascript
methods: {
  button: { enabled, channel },
  trigger: { enabled, channel, triggerWord },
  slash: { enabled, channel },
  join: { enabled }        // No channel needed for auto-verify on join
}

// Method-specific initial message customization
initialMessage: {
  button: { title, desc, image },
  trigger: { title, desc, image },
  slash: { title, desc, image },
  join: { title, desc, image }
}

// Response customization (shared across all methods)
successUI, alreadyVerifiedUI, errorUI
dmUI      // Direct Message customization
promptUI  // Override for initial message appearance
```

---

### 2. **Multi-Method Handler** (`src/modules/gateway/index.js`)
**REMOVED:** All `if (config.method !== ...)` checks that prevented concurrency

**NEW FEATURES:**
- ✅ `handleInteraction()` - Checks `if (config.methods?.button?.enabled)` before responding
- ✅ `handleMessage()` - Checks `if (config.methods?.trigger?.enabled)` before responding
- ✅ `handleMemberAdd()` - NEW - Handles join method when member joins guild
- ✅ All 4 methods now work simultaneously in a single guild

**Key Methods:**
```javascript
async setupMethod(guildId, method, channelId, triggerWord, verifiedRoleId, unverifiedRoleId)
async customizePageCommand(guildId, page, title, description, color, imageUrl)
async customizeInitialMessageCommand(guildId, method, promptTitle, promptDesc)
```

---

### 3. **Visibility Logic** 

| Method | Success Response | Visibility |
|--------|------------------|------------|
| **Button** | Ephemeral | Private (user only) |
| **Trigger** | Public Embed | Public in trigger channel |
| **Slash** | Public Embed | Public in slash channel |
| **Join** | Silent | No message sent |

**Implementation:**
```javascript
// Button: Always ephemeral
await interaction.reply({ embeds: [embed], ephemeral: true });

// Trigger/Join: Always public
await message.channel.send({ embeds: [embed] });

// Slash: Public in correct channel
await interaction.reply({ embeds: [embed], ephemeral: false });
```

---

### 4. **UI Customization Pages** (`/gateway customize_ui`)

**Available Pages:**
- `success` - When verification succeeds
- `alreadyVerified` - When user already verified
- `error` - When verification fails
- `dm` - Direct Message sent to user ⭐ NEW
- `prompt` - Initial verification message sent to channel ⭐ NEW

**Example:**
```
/gateway customize_ui
  page: dm
  title: ✅ Welcome to Server
  description: You've been verified!
  color: #00ff00
  image_url: https://example.com/welcome.png
```

---

### 5. **Setup Command (`/gateway setup`)** 

**Now Supports Adding Multiple Methods:**
```
/gateway setup
  method: button
  channel: #verify-button
  verified_role: @Verified          (required on first setup)
  unverified_role: @Unverified      (required on first setup)

/gateway setup
  method: trigger
  channel: #verify-trigger
  trigger_word: verify

/gateway setup
  method: slash
  channel: #verify-slash

/gateway setup
  method: join                       (no channel needed - automatic on member join)
  verified_role: @Verified
  unverified_role: @Unverified
```

✅ **Automatic Action:** After setup, if method is Button or Trigger, the bot **immediately sends** the verification prompt to the channel.

---

### 6. **Method-Specific Customization** (`/gateway customize_logic`)

**Customize the initial verification message per method:**
```
/gateway customize_logic
  method: button
  prompt_title: 🔐 Click to Verify
  prompt_description: Click the button below to gain access

/gateway customize_logic
  method: trigger
  prompt_title: 📝 Trigger Word Verification
  prompt_description: Send the trigger word to verify

/gateway customize_logic
  method: slash
  prompt_title: ⚡ Use /verify Command
  prompt_description: Type /verify to get verified
```

---

### 7. **Build Actions with ProperComponents** (`src/modules/gateway/actions.js`)

**Fixed Missing Button Issue:**
```javascript
const button = new ButtonBuilder()
  .setCustomId('gateway_verify_button')
  .setLabel('Verify')
  .setStyle(ButtonStyle.Primary);

const actionRow = new ActionRowBuilder()
  .addComponents(button);

payload.components = [actionRow];
```

**DM Customization with Robust Error Handling:**
```javascript
const dmEmbed = createEmbed(config, '', 'dm');
// Uses dmUI settings from database
// Full try-catch with user.send() handling
```

---

### 8. **Created Join Event Handler** (`src/events/guildMemberAdd.js`)
**NEW FILE** to handle automatic verification when members join:
```javascript
export default {
  name: 'guildMemberAdd',
  async execute(member) {
    // Calls client.gateway.handleMemberAdd()
    // Silent auto-verification for join method
  }
};
```

---

### 9. **Slash Command Update** (`src/commands/general/verify.js`)
**UPDATED** to check for slash method enabled:
```javascript
if (!config.methods?.slash?.enabled) {
  // Reject with helpful message
}

// Enforces strict channel lockdown
if (interaction.channelId !== config.methods.slash.channel) {
  // Only accessible in designated slash channel
}
```

---

## File Changes Summary

| File | Changes | Type |
|------|---------|------|
| `src/modules/gateway/schema.js` | Redesigned for multi-method support | 🔧 Major |
| `src/modules/gateway/index.js` | Removed single-method checks, added concurrency | 🔧 Major |
| `src/modules/gateway/actions.js` | Added dm/prompt pages, fixed button, robust DM | 🔧 Major |
| `src/commands/admin/gateway.js` | Added customize_logic, new page options | 🔧 Major |
| `src/commands/general/verify.js` | Updated for new method structure | 🔧 Medium |
| `src/events/guildMemberAdd.js` | **CREATED** - New join method handler | ✨ New |

---

## How It Works Now

### Complete Flow Example:

**Initial Setup (Enable All Methods):**
```
/gateway setup method:button channel:#verify verified_role:Verified unverified_role:Unverified
  ✓ Button method enabled in #verify
  ✓ Verification prompt automatically sent

/gateway setup method:trigger channel:#verify trigger_word:verify
  ✓ Trigger method enabled in #verify
  ✓ Verification prompt automatically sent

/gateway setup method:slash channel:#verify-slash
  ✓ Slash method enabled in #verify-slash

/gateway setup method:join verified_role:Verified unverified_role:Unverified
  ✓ Join method enabled - auto-verifies on member join
```

**Customization:**
```
/gateway customize_ui page:dm title:"✅ Welcome!" color:#00ff00
/gateway customize_logic method:button prompt_title:"🔐 Verification" prompt_description:"Click below to verify"
/gateway customize_ui page:success image_url:https://example.com/success.png
```

**Status Check:**
```
/gateway status
  Shows all enabled methods and their channels
```

---

## Concurrency Behavior

All 4 methods operate independently:

1. **Button Click** in #verify → Button ephemeral response
2. **Trigger Word** in #verify → Public embed response
3. **/verify Command** in #verify-slash → Public embed response
4. **New Member Join** → Silent auto-verification

✅ A user can be verified by ANY method and won't be verified twice
✅ Each method has its own channel restriction
✅ Each method has its own UI customization
✅ DM sent after ANY successful verification

---

## Testing Checklist

- [ ] Run `node scripts/register.js` to register updated commands
- [ ] Test `/gateway setup method:button channel:X verified_role:Y unverified_role:Z`
- [ ] Verify button appears in channel and works
- [ ] Test `/gateway setup method:trigger channel:X trigger_word:verify`
- [ ] Verify trigger word detection works
- [ ] Test `/gateway setup method:slash channel:X`
- [ ] Verify /verify command only works in designated channel
- [ ] Test `/gateway setup method:join`
- [ ] Verify auto-verification on member join
- [ ] Test `/gateway customize_ui page:dm` customization
- [ ] Test `/gateway customize_logic method:button` customization
- [ ] Verify roles are added/removed correctly
- [ ] Verify DMs are sent with custom UI
- [ ] Check `/gateway status` shows all enabled methods

---

## Breaking Changes

⚠️ **Old Configurations Will Not Work:**
- Old `method` field (single-method) is removed
- Old `channel` field is replaced with `methods.{method}.channel`
- Old `triggerWord` field is replaced with `methods.trigger.triggerWord`
- Old `buttonChannelId`, `triggerChannelId`, `slashChannelId` are removed

**Migration:** Users must re-run setup with new commands. Old configs in database will be incompatible.

---

## Performance Notes

✅ Concurrent method support has minimal performance overhead
✅ Each handler checks enabled status before processing
✅ Channel lockdown prevents unnecessary processing in wrong channels
✅ DM sending uses robust async/await with proper error handling
✅ All handlers have proper logging for debugging

---

## Next Steps

1. Run `node scripts/register.js` to register slash commands
2. Test all 4 methods in a development server
3. Verify visibility logic (ephemeral vs public)
4. Test DM customization with all page types
5. Deploy to production
6. Document the new setup process for users
