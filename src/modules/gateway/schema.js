import mongoose from 'mongoose';

const GatewaySchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Core roles for all methods
    verifiedRole: {
      type: String,
      required: true,
      description: 'Role ID to add when user is verified',
    },
    unverifiedRole: {
      type: String,
      required: true,
      description: 'Role ID to remove when user is verified (penalty role)',
    },

    // Multi-method configuration - each method can be independently enabled
    methods: {
      button: {
        enabled: { type: Boolean, default: false },
        channel: { type: String, default: '' },
      },
      trigger: {
        enabled: { type: Boolean, default: false },
        channel: { type: String, default: '' },
        triggerWord: { type: String, default: '' },
      },
      slash: {
        enabled: { type: Boolean, default: false },
        channel: { type: String, default: '' },
      },
      // join method removed; onboarding handled by Welcome module
    },

    // Initial message customization per method (the prompt sent to channel)
    initialMessage: {
      button: {
        title: { type: String, default: '🔐 Server Verification' },
        desc: { type: String, default: 'Click the button below to verify your account.' },
        image: { type: String, default: '' },
      },
      trigger: {
        title: { type: String, default: '🔐 Server Verification' },
        desc: { type: String, default: 'Send the trigger word to verify your account.' },
        image: { type: String, default: '' },
      },
      slash: {
        title: { type: String, default: '🔐 Server Verification' },
        desc: { type: String, default: 'Use /verify to verify your account.' },
        image: { type: String, default: '' },
      },
      // join initial message removed
    },

    // Legacy UI customization fields (will be superseded by templates)
    dmUI: {
      title: { type: String, default: '✅ Welcome' },
      desc: { type: String, default: 'You have been verified! Welcome to the server.' },
      color: { type: String, default: '#2ecc71' },
      image: { type: String, default: '' },
    },

    promptUI: {
      title: { type: String, default: '' },
      desc: { type: String, default: '' },
      color: { type: String, default: '' },
      image: { type: String, default: '' },
    },

    successUI: {
      title: { type: String, default: '✅ Success' },
      desc: { type: String, default: `**✅ Digital ID Pass Issued**\n\n> 👤 **Member:** {user}\n> 🏅 **Join Position:** #{join_pos}\n> 📅 **Account Age:** {account_age} days\n> 📥 **Joined Server:** {joined_at}\n> 🟢 **Status:** Verified` },
      color: { type: String, default: '#2ecc71' },
      image: { type: String, default: '' },
    },
    // legacy boolean for backwards compatibility (true when level > 0)
    lockdownMode: { type: Boolean, default: false },
    // 0 = normal, 1 = simple DM gauntlet, 2 = strict gauntlet, 3 = closed
    lockdownLevel: { type: Number, default: 0 },
    alreadyVerifiedUI: {
      title: { type: String, default: '⏭️ Already Verified' },
      desc: { type: String, default: 'You are already verified in this server!' },
      color: { type: String, default: '#ffa500' },
      image: { type: String, default: '' },
    },
    errorUI: {
      title: { type: String, default: '❌ Error' },
      desc: { type: String, default: 'Verification failed.' },
      color: { type: String, default: '#ff0000' },
      image: { type: String, default: '' },
    },

    // New templates array for flexible embed configurations
    templates: {
      type: [
        {
          name: { type: String, required: true },
          title: { type: String, default: '' },
          description: { type: String, default: '' },
          color: { type: String, default: '' },
          author: { type: String, default: '' },
          footer: { type: String, default: '' },
          images: { type: [String], default: [] },
          buttons: {
            type: [
              {
                label: String,
                style: String,
                customId: String,
                url: String,
              },
            ],
            default: [],
          },
        },
      ],
      default: [],
      description: 'Array of named embed templates that can be referenced in the gateway flows',
    },

    // Track explicit per-user state with verification details and temporary roles
    userStates: {
      type: Map,
      of: new mongoose.Schema(
        {
          inviterId: { type: String, default: '' },
          invitesCount: { type: Number, default: 0 },
          verificationTimestamp: { type: Date, default: null },
          tempRoles: [
            {
              roleId: { type: String },
              expiresAt: { type: Date },
            },
          ],
        },
        { _id: false }
      ),
      default: {},
      description: 'Map of userId -> state object tracking inviter, invites, verification and temporary roles',
    },

    // Core settings
    enabled: {
      type: Boolean,
      default: true,
      description: 'Whether gateway is enabled for this guild',
    },

    raidMode: {
      type: Boolean,
      default: false,
      description: 'Enable account age validation (raid shield)',
    },
    minAccountAge: {
      type: Number,
      default: 7,
      description: 'Minimum account age in days for raid shield',
    },
  },
  { timestamps: true }
);

export default mongoose.model('GatewayConfig', GatewaySchema);
